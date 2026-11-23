// A floor's session stays in its own floor's host whoever started it
// (design/0090-floor-sessions-stay-home/), against a FAKE host: a floor-2
// session opened by a floor-1 session — plain, working a task, on a task
// opened with it, and resumed — is placed in floor 2's host, never beside its
// parent in floor 1's. Only a workspace-scope helper still goes with the
// session that started it. Then doctor, over what an older Ward left: the
// window standing in its parent's host is named, with the move that takes it
// home, and nothing is moved.
import { afterAll, beforeEach, expect, test } from 'bun:test';
import { join } from 'node:path';
import { type HostChoice, latestLaunch, placeLaunch } from '../../src/agent/host.ts';
import { hostFindings } from '../../src/agent/host-findings.ts';
import { claudeAdapter } from '../../src/harness/claude.ts';
import type { SessionRecord } from '../../src/store/types.ts';
import { workspaceId } from '../../src/workspace/identity.ts';
import { openProject } from '../../src/workspace/projects.ts';
import {
  type OpenSessionListing,
  openFloorSession,
  openWorkspaceSession,
  readAllSessions,
  recordResume,
} from '../../src/workspace/sessions.ts';
import { openTask } from '../../src/workspace/tasks.ts';
import { applyGitTestEnv, makeTempDir, removeDir } from '../helpers.ts';
import { preparedWorkspace } from '../prepared.ts';
import { type FakeHost, fakeHost } from './fake-host.ts';

let handles = 0;
/** A detached launch's options, each with a handle of its own (one open session per handle). */
function hosted(extra: { startedBy?: string; task?: string } = {}) {
  handles += 1;
  return { handle: `claude:h-${handles}`, host: 'tmux' as const, ...extra };
}

test.each<[string, (parent: SessionRecord) => Promise<SessionRecord>]>([
  [
    'a plain floor session',
    (parent) => openFloorSession(ws, 2, 'run beta', hosted({ startedBy: parent.id })),
  ],
  [
    'a floor session working a task (--task)',
    (parent) => openFloorSession(ws, 2, undefined, hosted({ startedBy: parent.id, task: 'f2t1' })),
  ],
  [
    'a floor session on a task opened with it (--new-task)',
    async (parent) => {
      await openTask(ws, 'fresh', { floor: 2 });
      return openFloorSession(ws, 2, undefined, hosted({ startedBy: parent.id, task: 'f2t2' }));
    },
  ],
])("%s another floor's session started lands in its own floor's host", async (_name, open) => {
  const host = fakeHost();
  const parent = await place(host, await openFloorSession(ws, 1, 'run alpha', hosted()));
  const child = await place(host, await open(parent));
  expect(child.parent).toBe(parent.id);
  expect(host.placed.map((request) => [request.tags.session, request.naming.name])).toEqual([
    [parent.id, F1],
    [child.id, F2],
  ]);
  expect(host.placed[1]?.group.floor).toBe(2);
  // Standing where placement says, doctor has nothing to say about where.
  const findings = await hostFindings(ws, await workspaceId(ws), UNSET, {}, host);
  expect(findings.map((finding) => finding.message).join('\n')).not.toContain('stands in');
});

test("a resume places the floor session in its own floor's host too", async () => {
  const host = fakeHost();
  const parent = await place(host, await openFloorSession(ws, 1, 'run alpha', hosted()));
  const child = await openFloorSession(ws, 2, undefined, hosted({ startedBy: parent.id }));
  await recordResume(ws, child.id, { host: 'tmux' });
  await place(host, child);
  expect(host.placed.at(-1)).toMatchObject({
    tags: { session: child.id },
    naming: { name: F2 },
    group: { floor: 2 },
  });
});

test('a workspace-scope helper still lands beside the floor session that started it', async () => {
  const host = fakeHost();
  const parent = await place(host, await openFloorSession(ws, 1, 'run alpha', hosted()));
  const helper = await place(
    host,
    await openWorkspaceSession(ws, 'sweep', hosted({ startedBy: parent.id })),
  );
  expect(host.placed.at(-1)).toMatchObject({ tags: { session: helper.id }, naming: { name: F1 } });
});

test("the floor's own attending leads its host even when another floor's session started it", async () => {
  const host = fakeHost();
  const parent = await place(host, await openFloorSession(ws, 1, 'run alpha', hosted()));
  const child = await place(
    host,
    await openFloorSession(ws, 2, 'run beta', hosted({ startedBy: parent.id })),
  );
  expect(host.placed.at(-1)).toMatchObject({ tags: { session: child.id }, first: true });
});

test("doctor names a window an older Ward left in its parent's host, with the move home", async () => {
  const id = await workspaceId(ws);
  const parent = await openFloorSession(ws, 1, 'run alpha', hosted());
  const child = await openFloorSession(
    ws,
    2,
    undefined,
    hosted({ startedBy: parent.id, task: 'f2t1' }),
  );
  const stamp = (floor: number) => ({ workspace: id, floor });
  const window = (record: SessionRecord, at: string) => ({
    window: at,
    groups: [{ name: F1, stamp: stamp(1) }],
    tags: { session: record.id, epoch: latestLaunch(record)?.at ?? '' },
    dead: false,
  });
  const host = fakeHost({
    windows: [window(parent, '@1'), window(child, '@2')],
    groups: [{ name: F2, stamp: stamp(2), clients: 0, windows: 1, created: 0 }],
  });
  const findings = await hostFindings(ws, id, UNSET, {}, host);
  expect(findings).toContainEqual({
    check: 'host windows',
    severity: 'info',
    message:
      `session ${child.id}'s window @2 stands in ${F1}, not floor 2's host — attach follows ` +
      `it wherever it is. To move it home, its run going on: fake move @2 from ${F1} to ${F2}`,
  });
  // Hygiene reports; it moves, ends, and places nothing.
  expect(host.leads).toEqual([]);
  expect(host.closed).toEqual([]);
  expect(host.placed).toEqual([]);
});

// -- setup -----------------------------------------------------------------------

const UNSET = { provenance: 'default', value: 'foreground' } as const;
let scratch: string;
let ws: string;
let caseId = 0;
let F1: string;
let F2: string;

/** Place a just-opened (or just-resumed) session as a hosted launch does, and return its record. */
async function place(host: FakeHost, record: SessionRecord): Promise<SessionRecord> {
  const listing = await listingOf(record);
  const choice: HostChoice = { kind: 'tmux', host, workspace: await workspaceId(ws) };
  await placeLaunch(
    ws,
    choice,
    listing,
    { harness: claudeAdapter, configuredCommand: undefined, argv: [] },
    {},
  );
  return listing.record;
}

async function listingOf(record: SessionRecord): Promise<OpenSessionListing> {
  const found = (await readAllSessions(ws)).find((entry) => entry.record.id === record.id);
  if (found === undefined) throw new Error(`no record for ${record.id}`);
  return found;
}

beforeEach(async () => {
  applyGitTestEnv();
  caseId += 1;
  scratch ??= makeTempDir();
  ws = join(scratch, `ws-${caseId}`);
  await preparedWorkspace(ws);
  await openProject(ws, 'alpha');
  await openProject(ws, 'beta');
  await openTask(ws, 'work', { floor: 2 });
  F1 = `ws-${caseId}-f1-alpha`;
  F2 = `ws-${caseId}-f2-beta`;
});

afterAll(() => {
  if (scratch !== undefined) removeDir(scratch);
});
