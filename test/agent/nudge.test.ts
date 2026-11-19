// The nudge (design/0067-floor-dispatch/), against a fake host: who is typed
// to — only an open session of the target floor's own, whose run is live in a
// host on this machine and whose harness Ward can read — what the line says,
// and that every way a nudge does not happen is an answer rather than a
// failure. The typing itself, on a real tmux, is test/host/tmux-live.test.ts's.
import { afterAll, beforeEach, expect, test } from 'bun:test';
import { join } from 'node:path';
import { latestLaunch } from '../../src/agent/host.ts';
import { dispatchNotice, floorSessions, type Nudge, nudgeFloor } from '../../src/agent/nudge.ts';
import { claudeInputLine } from '../../src/harness/claude.ts';
import type { FoundWindow, TypeResult } from '../../src/host/host.ts';
import { TYPEABLE } from '../../src/host/tmux.ts';
import type { DispatchRecord, SessionRecord } from '../../src/store/types.ts';
import { workspaceId } from '../../src/workspace/identity.ts';
import { openProject } from '../../src/workspace/projects.ts';
import {
  closeSession,
  type OpenSessionOptions,
  openFloorSession,
  openSession,
  openWorkspaceSession,
} from '../../src/workspace/sessions.ts';
import { openTask } from '../../src/workspace/tasks.ts';
import { applyGitTestEnv, makeTempDir, removeDir } from '../helpers.ts';
import { preparedWorkspace } from '../prepared.ts';
import { fakeHost } from './fake-host.ts';

const TEXT = '[ward] hand-off to floor 2: task f2t1 (x). Read it: ward task show f2t1';
const HOSTED: OpenSessionOptions = { handle: 'claude:run', host: 'tmux' };

// -- the line ------------------------------------------------------------------

const record = (extra: Partial<DispatchRecord> = {}): DispatchRecord => ({
  type: 'dispatch',
  task: 'f3t4',
  to: 3,
  sentAt: '2026-11-16T12:00:00.000Z',
  ...extra,
});

test.each<[string, DispatchRecord, string, string]>([
  [
    'from a floor',
    record({ fromFloor: 7, fromSession: 'f7-1@mac' }),
    'fix-login',
    '[ward] hand-off to floor 3: task f3t4 (fix-login) from floor 7. Read it: ward task show f3t4',
  ],
  [
    'from above the floors',
    record({ fromSession: 'workspace-1@mac' }),
    'fix-login',
    '[ward] hand-off to floor 3: task f3t4 (fix-login) from workspace-1@mac. Read it: ward task show f3t4',
  ],
  [
    'from a human',
    record(),
    'fix-login',
    '[ward] hand-off to floor 3: task f3t4 (fix-login). Read it: ward task show f3t4',
  ],
  [
    'a slug too long to keep the line short is left to the record',
    record({ fromFloor: 7 }),
    'a'.repeat(41),
    '[ward] hand-off to floor 3: task f3t4 from floor 7. Read it: ward task show f3t4',
  ],
])('the notice %s', (_name, dispatch, slug, expected) => {
  const notice = dispatchNotice(dispatch, slug);
  expect(notice).toBe(expected);
  // One line a host will type, and nothing a harness reads as a command.
  expect(TYPEABLE.test(notice)).toBe(true);
  expect(notice).toStartWith('[ward] ');
});

// -- who is typed to -------------------------------------------------------------

test('only the open sessions of the target floor itself are typed to', async () => {
  const target = await openFloorSession(ws, 2, undefined, HOSTED);
  const second = await openFloorSession(ws, 2, undefined, HOSTED);
  const gone = await openFloorSession(ws, 2, undefined, HOSTED);
  await closeSession(ws, gone.id);
  // Everyone a nudge to floor 2 must never reach, each live in a host:
  const coordinator = await openWorkspaceSession(ws, undefined, HOSTED);
  const otherFloor = await openFloorSession(ws, 1, undefined, HOSTED);
  await openTask(ws, 'work', { floor: 2 });
  const worker = await openSession(ws, 'f2t1', 'work on floor 2', { handle: 'claude:w' });
  const host = fakeHost({
    windows: await windowsFor(target, second, gone, coordinator, otherFloor, worker),
  });

  const nudges = await nudgeFloor(ws, 2, TEXT, {}, host);
  expect(nudges.map(({ session, outcome }) => [session, outcome])).toEqual([
    [target.id, 'typed'],
    [second.id, 'typed'],
  ]);
  expect(host.typed.map((request) => request.session)).toEqual([target.id, second.id]);
  for (const request of host.typed) {
    expect(request.text).toBe(TEXT);
    expect(request.inputLine).toBe(claudeInputLine);
  }
});

test('a floor with no open session is typed to by nobody: an empty answer, not a failure', async () => {
  const closed = await openFloorSession(ws, 2, undefined, HOSTED);
  await closeSession(ws, closed.id);
  const host = fakeHost({ windows: await windowsFor(closed) });
  expect(await nudgeFloor(ws, 2, TEXT, {}, host)).toEqual([]);
  expect(host.typed).toEqual([]);
  expect(floorSessions([], 2)).toEqual([]);
});

// -- every way it does not happen is an answer ----------------------------------

test.each<[string, OpenSessionOptions, 'own' | 'dead' | 'none', Nudge['outcome'], string]>([
  [
    'a run in a terminal of its own',
    { handle: 'claude:run' },
    'own',
    'unreachable',
    'terminal of its own',
  ],
  [
    'a harness Ward cannot read',
    { handle: 'pi:run', host: 'tmux' },
    'own',
    'unreachable',
    'harness (pi)',
  ],
  ['a run that has exited', HOSTED, 'dead', 'not-running', 'exited 3'],
  ['a window that is gone', HOSTED, 'none', 'not-running', 'no tmux window'],
])('not typed to: %s', async (_name, options, window, outcome, detail) => {
  const session = await openFloorSession(ws, 2, undefined, options);
  const windows = window === 'none' ? [] : await windowsFor(session);
  const host = fakeHost({
    windows: windows.map((found) =>
      window === 'dead' ? { ...found, dead: true, exitStatus: 3 } : found,
    ),
  });
  const nudges = await nudgeFloor(ws, 2, TEXT, {}, host);
  expect(nudges).toEqual([
    { session: session.id, outcome, detail: expect.stringContaining(detail) },
  ]);
  expect(host.typed).toEqual([]);
});

test.each<[string, TypeResult, Nudge['outcome'], string]>([
  [
    'the host withheld it',
    { outcome: 'withheld', reason: 'a dialog is up' },
    'withheld',
    'a dialog is up',
  ],
  ['the window went as it was typed to', { outcome: 'absent' }, 'not-running', 'is gone'],
  [
    'the host could not say',
    { outcome: 'unknown', reason: 'tmux timed out' },
    'unknown',
    'tmux timed out',
  ],
])('reported, never thrown: %s', async (_name, typing, outcome, detail) => {
  const session = await openFloorSession(ws, 2, undefined, HOSTED);
  const host = fakeHost({ windows: await windowsFor(session), typing });
  expect(await nudgeFloor(ws, 2, TEXT, {}, host)).toEqual([
    { session: session.id, outcome, detail: expect.stringContaining(detail) },
  ]);
});

test('a host that cannot answer, or is not usable, is an answer too', async () => {
  const session = await openFloorSession(ws, 2, undefined, HOSTED);
  expect(await nudgeFloor(ws, 2, TEXT, {}, fakeHost({ unknown: 'no reply' }))).toEqual([
    { session: session.id, outcome: 'unknown', detail: expect.stringContaining('no reply') },
  ]);
  expect(await nudgeFloor(ws, 2, TEXT, {}, fakeHost({ unusable: 'tmux not found' }))).toEqual([
    {
      session: session.id,
      outcome: 'unreachable',
      detail: expect.stringContaining('tmux not found'),
    },
  ]);
});

test('a session on another machine is never typed to from here', async () => {
  const session = await openFloorSession(ws, 2, undefined, HOSTED);
  const file = join(ws, 'projects/2-beta/sessions', `${session.id}.md`);
  await Bun.write(
    file,
    (await Bun.file(file).text()).replace(/^machine: .*$/m, 'machine: elsewhere'),
  );
  const host = fakeHost({ windows: await windowsFor(session) });
  expect(await nudgeFloor(ws, 2, TEXT, {}, host)).toEqual([
    { session: session.id, outcome: 'unreachable', detail: 'it runs on elsewhere' },
  ]);
  expect(host.typed).toEqual([]);
});

// -- setup -----------------------------------------------------------------------

let scratch: string;
let ws: string;
let caseId = 0;

beforeEach(async () => {
  applyGitTestEnv();
  scratch ??= makeTempDir();
  caseId += 1;
  ws = join(scratch, `ws-${caseId}`);
  await preparedWorkspace(ws);
  await openProject(ws, 'alpha');
  await openProject(ws, 'beta');
});

afterAll(() => {
  if (scratch !== undefined) removeDir(scratch);
});

/** A live window for each session, tagged as its latest launch and stamped as this workspace's. */
async function windowsFor(...sessions: SessionRecord[]): Promise<FoundWindow[]> {
  const workspace = await workspaceId(ws);
  return sessions.map((session, index) => ({
    window: `@${index + 1}`,
    groups: [{ name: 'host', stamp: { workspace, floor: session.floor ?? 0 } }],
    tags: { session: session.id, epoch: latestLaunch(session)?.at ?? '' },
    dead: false,
  }));
}
