// Where the floor's attending stands (design/0089-floor-attending/), against a
// FAKE host: a launch asks for the attending's window first, whatever was
// opened before it; nothing else asks; the name refresh moves an attending left
// behind to the front, and leaves one already there alone; and the bulk
// resume brings each floor's attending back before its other sessions. What
// tmux makes of `first` and of a move is the `the-attending-leads` conformance
// scenario's (test/host/tmux-scenarios.ts).
import { afterAll, beforeEach, expect, test } from 'bun:test';
import { join } from 'node:path';
import { type HostChoice, latestLaunch, placeLaunch } from '../../src/agent/host.ts';
import { refreshNames } from '../../src/agent/naming.ts';
import { attendingOf, isAttending } from '../../src/agent/placement.ts';
import { planResumeAll } from '../../src/agent/resume-all.ts';
import { claudeAdapter } from '../../src/harness/claude.ts';
import type { FoundWindow } from '../../src/host/host.ts';
import type { SessionRecord } from '../../src/store/types.ts';
import { workspaceId } from '../../src/workspace/identity.ts';
import { openProject } from '../../src/workspace/projects.ts';
import {
  continueSession,
  type OpenSessionListing,
  openFloorSession,
  openWorkspaceSession,
  readAllSessions,
} from '../../src/workspace/sessions.ts';
import { openTask } from '../../src/workspace/tasks.ts';
import { applyGitTestEnv, makeTempDir, removeDir } from '../helpers.ts';
import { preparedWorkspace } from '../prepared.ts';
import { type FakeHost, fakeHost } from './fake-host.ts';

let handles = 0;
/** A detached launch's options, each with a handle of its own (one open session per handle). */
function hosted() {
  handles += 1;
  return { handle: `claude:h-${handles}`, host: 'tmux' as const };
}

test('the attending opened first stands first, and what comes after it goes last', async () => {
  const host = fakeHost();
  const attending = await place(host, await openFloorSession(ws, 1, 'run alpha', hosted()));
  const working = await place(
    host,
    await openFloorSession(ws, 1, undefined, { ...hosted(), task: 'f1t1' }),
  );
  const second = await place(host, await openFloorSession(ws, 1, 'second', hosted()));
  expect(host.placed.map((request) => [request.tags.session, request.first === true])).toEqual([
    [attending.id, true],
    [working.id, false],
    [second.id, false],
  ]);
  expect(host.order(GROUP)).toEqual([attending.id, working.id, second.id]);
});

test('an attending opened late is placed in front of the task windows already standing', async () => {
  const host = fakeHost();
  const one = await place(
    host,
    await openFloorSession(ws, 1, undefined, { ...hosted(), task: 'f1t1' }),
  );
  const two = await place(
    host,
    await openFloorSession(ws, 1, undefined, { ...hosted(), task: 'f1t1' }),
  );
  const attending = await place(host, await openFloorSession(ws, 1, 'run alpha', hosted()));
  expect(host.placed.at(-1)?.first).toBe(true);
  expect(host.order(GROUP)).toEqual([attending.id, one.id, two.id]);
});

test('the coordinator leads the ground floor host; a floor-0 session and a helper do not', async () => {
  const host = fakeHost();
  const ground = await place(host, await openFloorSession(ws, 0, 'ground', hosted()));
  const coordinator = await place(host, await openWorkspaceSession(ws, 'coordinate', hosted()));
  expect(host.placed.map((request) => request.first === true)).toEqual([false, true]);
  expect(host.order(GROUND)).toEqual([coordinator.id, ground.id]);
});

test('the refresh moves an attending standing behind another window to the front, once', async () => {
  const working = await openFloorSession(ws, 1, undefined, { ...hosted(), task: 'f1t1' });
  const attending = await openFloorSession(ws, 1, 'run alpha', hosted());
  // As an older Ward left it: the attending's window placed after the task's.
  const host = fakeHost({
    windows: [await windowOf(working, '@1'), await windowOf(attending, '@2')],
  });
  const refreshed = await refreshNames(ws, host, await workspaceId(ws), 'tmux');
  expect(host.leads).toEqual([{ window: '@2', group: GROUP }]);
  expect(refreshed.led).toEqual([`${attending.id} now leads ${GROUP}`]);
  expect(host.order(GROUP)).toEqual([attending.id, working.id]);
  // Already first: nothing is moved again.
  await refreshNames(ws, host, await workspaceId(ws), 'tmux');
  expect(host.leads).toHaveLength(1);
});

test('the refresh moves nothing on a floor whose only windows work tasks', async () => {
  const one = await openFloorSession(ws, 1, undefined, { ...hosted(), task: 'f1t1' });
  const two = await openFloorSession(ws, 1, undefined, { ...hosted(), task: 'f1t1' });
  const host = fakeHost({ windows: [await windowOf(two, '@1'), await windowOf(one, '@2')] });
  const refreshed = await refreshNames(ws, host, await workspaceId(ws), 'tmux');
  expect(host.leads).toEqual([]);
  expect(refreshed.led).toBeUndefined();
});

test('the bulk resume brings each floor back attending first, whatever was opened first', async () => {
  const working = await openFloorSession(ws, 1, undefined, { ...hosted(), task: 'f1t1' });
  const attending = await openFloorSession(ws, 1, 'run alpha', hosted());
  const second = await openFloorSession(ws, 1, 'second', hosted());
  const coordinator = await openWorkspaceSession(ws, 'coordinate', hosted());
  const plan = await planResumeAll(ws, { host: fakeHost() });
  expect(plan.sessions.map((session) => [session.record.id, session.attending])).toEqual([
    [coordinator.id, true],
    [attending.id, true],
    [working.id, false],
    [second.id, false],
  ]);
});

// -- a moved session (design/0084-session-move/) ---------------------------------

test('a moved-in session is a new record: the attending only where no earlier one stands', async () => {
  await openProject(ws, 'beta');
  await openProject(ws, 'gamma');
  const all = async () => readAllSessions(ws);
  const beta = await openFloorSession(ws, 2, 'run beta', hosted());
  const alpha = await openFloorSession(ws, 1, 'run alpha', hosted());
  const alphaTwo = await openFloorSession(ws, 1, 'second', hosted());
  // floor 1's attending moves to floor 2: floor 2 keeps its own attending,
  // and floor 1's next general session takes the place — nothing passes on.
  const moved = (await continueSession(ws, alpha.id, { scope: 'project', floor: 2 })).to.record;
  expect(attendingOf(await all(), 2, 'test')?.record.id).toBe(beta.id);
  expect(isAttending(moved, await all())).toBe(false);
  expect(attendingOf(await all(), 1, 'test')?.record.id).toBe(alphaTwo.id);
  // Onto a floor with none, the continuation is that floor's attending.
  const again = (await continueSession(ws, moved.id, { scope: 'project', floor: 3 })).to.record;
  expect(attendingOf(await all(), 3, 'test')?.record.id).toBe(again.id);
  // Moved with a task, it is a task session wherever it lands.
  const tasked = (await continueSession(ws, again.id, { scope: 'project', floor: 1, task: 'f1t1' }))
    .to.record;
  expect(isAttending(tasked, await all())).toBe(false);
  expect(attendingOf(await all(), 1, 'test')?.record.id).toBe(alphaTwo.id);
});

// -- setup -----------------------------------------------------------------------

let scratch: string;
let ws: string;
let caseId = 0;
let GROUP: string;
let GROUND: string;

/** Place a just-opened session as a hosted launch does, and return its record. */
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
  return record;
}

async function listingOf(record: SessionRecord): Promise<OpenSessionListing> {
  const found = (await readAllSessions(ws)).find((entry) => entry.record.id === record.id);
  if (found === undefined) throw new Error(`no record for ${record.id}`);
  return found;
}

/** The session's own live window in its floor's host, as a fake holds it. */
async function windowOf(record: SessionRecord, window: string): Promise<FoundWindow> {
  const floor = record.floor ?? 0;
  return {
    window,
    groups: [
      { name: floor === 0 ? GROUND : GROUP, stamp: { workspace: await workspaceId(ws), floor } },
    ],
    tags: { session: record.id, epoch: latestLaunch(record)?.at ?? '' },
    dead: false,
  };
}

beforeEach(async () => {
  applyGitTestEnv();
  caseId += 1;
  scratch ??= makeTempDir();
  ws = join(scratch, `ws-${caseId}`);
  await preparedWorkspace(ws);
  await openProject(ws, 'alpha');
  await openTask(ws, 'work', { floor: 1 });
  GROUP = `ws-${caseId}-f1-alpha`;
  GROUND = `ws-${caseId}-f0-workspace`;
});

afterAll(() => {
  if (scratch !== undefined) removeDir(scratch);
});
