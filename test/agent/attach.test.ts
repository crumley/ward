// Joining a hosted run (design/0031-detached-session-hosting/), against a FAKE
// host: attach takes part through a view of the floor host and records
// `attached`; observe watches one window read-only and records `observed`;
// both verify the window is the record's own, and refuse — naming the way
// forward — everything they must not join. Attach repairs a missing floating
// link (additive only); observe never changes anything. The re-create path
// and the real views are test/host/tmux-live.test.ts's.
import { afterAll, beforeEach, expect, test } from 'bun:test';
import { join } from 'node:path';
import { attachSession, observeSession } from '../../src/agent/attach.ts';
import type { FoundWindow } from '../../src/host/host.ts';
import type { SessionRecord } from '../../src/store/types.ts';
import { createWorkspace } from '../../src/workspace/create.ts';
import { workspaceId } from '../../src/workspace/identity.ts';
import { openProject } from '../../src/workspace/projects.ts';
import {
  findSession,
  openFloorSession,
  openWorkspaceSession,
} from '../../src/workspace/sessions.ts';
import { applyGitTestEnv, makeTempDir, removeDir } from '../helpers.ts';
import { type FakeHostOptions, fakeHost } from './fake-host.ts';

test('attach: a live window of its own is joined through an attach view, and recorded', async () => {
  const session = await hosted();
  const host = fakeHost({ windows: [own(session, ['f0'])], exitCode: 7 });
  const joined = await attachSession(ws, session.id, { terminal: true, host });
  expect(host.views).toEqual([{ group: group('f0'), window: '@1', mode: 'attach', workspace: id }]);
  expect(host.entered).toEqual([{ name: `${group('f0')}-v1`, mode: 'attach' }]);
  expect(joined).toMatchObject({ exitCode: 7, recreated: false });
  expect(await events(session.id)).toEqual(['opened', 'attached']);
});

test.each<[string, (s: SessionRecord) => FakeHostOptions, boolean, string]>([
  ['no terminal to hand over', (s) => ({ windows: [own(s, ['f0'])] }), false, 'no terminal here'],
  ['an unusable host', () => ({ unusable: 'tmux missing' }), true, 'cannot attach: tmux'],
  [
    'a host that cannot answer — never read as gone, never re-created',
    () => ({ unknown: 'server not answering' }),
    true,
    'cannot tell whether session',
  ],
  [
    'only a stranger wearing its tag (an earlier run)',
    (s) => ({ windows: [{ ...own(s, ['f0']), tags: { session: s.id, epoch: 'older' } }] }),
    true,
    'fake kill @1',
  ],
])('attach refuses %s, joining and recording nothing', async (_, options, terminal, says) => {
  const session = await hosted();
  const host = fakeHost(options(session));
  await expect(attachSession(ws, session.id, { terminal, host })).rejects.toThrow(says);
  expect(host.views).toEqual([]);
  expect(host.placed).toEqual([]);
  expect(await events(session.id)).toEqual(['opened']);
});

test('attach refuses a session last run in the foreground: Ward cannot see that run', async () => {
  const foreground = await openWorkspaceSession(ws, 'here', { handle: 'claude:h' });
  const host = fakeHost();
  await expect(attachSession(ws, foreground.id, { terminal: true, host })).rejects.toThrow(
    `host it detached with: ward session resume ${foreground.id} --detach`,
  );
  expect(host.finds).toBe(0);
});

test("attach repairs the coordinator's missing link into the host it joins — and only adds", async () => {
  const coordinator = await hosted();
  await openProject(ws, 'alpha');
  const floor = await hostedFloor(1);
  const host = fakeHost({
    windows: [own(coordinator, ['f0'], '@1'), own(floor, ['f1'], '@2')],
  });
  const joined = await attachSession(ws, floor.id, { terminal: true, host });
  expect(host.links).toEqual([`@1 into ${group('f1')}`]);
  expect(joined.repaired).toEqual([`${coordinator.id} into ${group('f1')}`]);
  expect(host.closed).toEqual([]);
});

test('attaching the coordinator links it into every floor host it is missing from', async () => {
  const coordinator = await hosted();
  const host = fakeHost({
    windows: [own(coordinator, ['f0'], '@1')],
    groups: [
      { name: group('f2'), stamp: { workspace: id, floor: 2 }, clients: 0, windows: 1, created: 0 },
      { name: 'someone-else', clients: 0, windows: 1, created: 0 },
    ],
  });
  await attachSession(ws, coordinator.id, { terminal: true, host });
  expect(host.links).toEqual([`@1 into ${group('f2')}`]);
});

test('observe: a live window is watched through a one-window view, and recorded', async () => {
  const session = await hosted();
  const host = fakeHost({ windows: [own(session, ['f0'])] });
  await observeSession(ws, session.id, { terminal: true, host });
  expect(host.views).toEqual([
    { group: group('f0'), window: '@1', mode: 'observe', workspace: id },
  ]);
  expect(host.entered.map((view) => view.mode)).toEqual(['observe']);
  expect(host.links).toEqual([]); // watching changes nothing, links included
  expect(await events(session.id)).toEqual(['opened', 'observed']);
});

test.each<[string, (s: SessionRecord) => FakeHostOptions, string]>([
  [
    'an ended run',
    (s) => ({ windows: [{ ...own(s, ['f0']), dead: true, exitStatus: 3 }] }),
    'exited 3',
  ],
  ['a gone one', () => ({}), 'has no window'],
])('observe refuses %s, pointing at attach and locate', async (_, options, says) => {
  const session = await hosted();
  const host = fakeHost(options(session));
  const refusal = observeSession(ws, session.id, { terminal: true, host });
  await expect(refusal).rejects.toThrow(says);
  await expect(observeSession(ws, session.id, { terminal: true, host })).rejects.toThrow(
    `ward session attach ${session.id}, or read its history with ward session locate`,
  );
  expect(host.views).toEqual([]);
  expect(host.placed).toEqual([]); // observe never re-creates
  expect(await events(session.id)).toEqual(['opened']);
});

// -- scaffolding ------------------------------------------------------------------

let scratch: string;
let ws: string;
let id: string;
let caseId = 0;

function group(floor: string): string {
  return `ward-ws-${caseId}-${floor}`;
}

/** The session's own window: its tag, its latest launch as epoch, in this workspace's hosts. */
function own(record: SessionRecord, floors: string[], window = '@1'): FoundWindow {
  return {
    window,
    groups: floors.map((floor) => ({
      name: group(floor),
      stamp: { workspace: id, floor: Number.parseInt(floor.slice(1), 10) },
    })),
    tags: { session: record.id, epoch: record.events?.at(-1)?.at ?? '' },
    dead: false,
  };
}

function hosted(): Promise<SessionRecord> {
  return openWorkspaceSession(ws, 'hosted', { handle: 'claude:h', host: 'tmux' });
}

function hostedFloor(floor: number): Promise<SessionRecord> {
  return openFloorSession(ws, floor, 'hosted', { handle: 'claude:f', host: 'tmux' });
}

async function events(session: string): Promise<string[]> {
  return ((await findSession(ws, session)).record.events ?? []).map((event) => event.event);
}

beforeEach(async () => {
  applyGitTestEnv();
  caseId += 1;
  scratch ??= makeTempDir();
  ws = join(scratch, `ws-${caseId}`);
  await createWorkspace(ws);
  id = await workspaceId(ws);
});

afterAll(() => {
  if (scratch !== undefined) removeDir(scratch);
});
