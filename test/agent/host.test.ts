// The Ward-shaped half of detached hosting (design/0031-detached-session-hosting/),
// against a FAKE host: placement and floating as pure functions of records,
// what a hosted launch asks the host for (and when — inside the store write,
// after the record is on disk), ownership by tag + epoch + workspace stamp,
// resume's gate, and close's teardown, which ends the session's own window
// and never a stranger's. The real tmux is test/host/tmux-live.test.ts's.
import { afterAll, beforeEach, expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  classify,
  guardResume,
  type HostChoice,
  type LiveState,
  latestLaunch,
  placeLaunch,
  type Teardown,
  teardownSession,
} from '../../src/agent/host.ts';
import { floats, placementFloor } from '../../src/agent/placement.ts';
import { claudeAdapter } from '../../src/harness/claude.ts';
import type {
  CloseResult,
  FindResult,
  FoundWindow,
  HostCheck,
  Placement,
  PlaceRequest,
  SessionHost,
} from '../../src/host/host.ts';
import type { SessionRecord } from '../../src/store/types.ts';
import { createWorkspace } from '../../src/workspace/create.ts';
import { workspaceId } from '../../src/workspace/identity.ts';
import { openProject } from '../../src/workspace/projects.ts';
import {
  type OpenSessionListing,
  openFloorSession,
  openWorkspaceSession,
  readAllSessions,
} from '../../src/workspace/sessions.ts';
import { applyGitTestEnv, makeTempDir, removeDir } from '../helpers.ts';

const EPOCH = '2026-11-08T10:00:00.000Z';
const WS = 'ws-0123456789abcdef';

// -- placement and floating: pure over records -------------------------------

const coordinator = listing('', { id: 'workspace-1@t', scope: 'workspace' });
const floor3 = listing('projects/3-c', { id: 'f3-1@t', scope: 'project', floor: 3 });

test.each<[string, OpenSessionListing, number, boolean]>([
  ['workspace scope, no parent: the coordinator', coordinator, 0, true],
  ['a floor session', floor3, 3, false],
  [
    'a task session, by where its task stands',
    listing('projects/5-e/tasks/t2-x', { id: 'x-1@t', task: 't2' }),
    5,
    false,
  ],
  ['a legacy bare task', listing('tasks/t1-old', { id: 'old-1@t', task: 't1' }), 0, false],
  [
    "a floor-5 session the floor-3 one started: its parent's floor",
    listing('projects/5-e', { id: 'f5-1@t', scope: 'project', floor: 5, parent: 'f3-1@t' }),
    3,
    false,
  ],
  [
    'a floor-5 session the coordinator started: its own (a floor-0 parent never pulls)',
    listing('projects/5-e', { id: 'f5-2@t', scope: 'project', floor: 5, parent: 'workspace-1@t' }),
    5,
    false,
  ],
  [
    'a workspace-scope child of the coordinator: floor 0, and it does not float',
    listing('', { id: 'workspace-2@t', scope: 'workspace', parent: 'workspace-1@t' }),
    0,
    false,
  ],
  [
    "a workspace-scope child of a floor-3 session: floor 3's host, not floating",
    listing('', { id: 'workspace-3@t', scope: 'workspace', parent: 'f3-1@t' }),
    3,
    false,
  ],
  [
    'a ground-floor session is not the coordinator',
    listing('projects/0-workspace', { id: 'f0-1@t', scope: 'project', floor: 0 }),
    0,
    false,
  ],
  [
    'a parent with no record here: its own floor',
    listing('projects/5-e', { id: 'f5-3@t', scope: 'project', floor: 5, parent: 'nobody-1@t' }),
    5,
    false,
  ],
])('%s → floor %p, floats %p', (_name, session, floor, floating) => {
  const all = [coordinator, floor3, session];
  expect(placementFloor(session, all)).toBe(floor);
  expect(floats(session.record)).toBe(floating);
});

test('a parent chain that loops (only a hand edit makes one) stops at the loop', () => {
  const a = listing('projects/2-b', { id: 'a-1@t', scope: 'project', floor: 2, parent: 'b-1@t' });
  const b = listing('projects/4-d', { id: 'b-1@t', scope: 'project', floor: 4, parent: 'a-1@t' });
  // a → b → (a again: stop) — b answers its own floor, and a inherits it.
  expect(placementFloor(a, [a, b])).toBe(4);
});

// -- ownership: tag, epoch, and the workspace stamp ----------------------------

test.each<[string, FindResult, LiveState['state'], string[]]>([
  ['our window, running', answered(win('@1')), 'live', []],
  ['our window, its run ended', answered(win('@1', { dead: true, exitStatus: 3 })), 'exited', []],
  ['nothing tagged', answered(), 'gone', []],
  ['tagged, but from another life', answered(win('@2', { epoch: 'earlier' })), 'gone', ['@2']],
  // Another workspace's session of the same id is its business, not a stranger here.
  [
    "tagged, but in another workspace's host",
    answered(win('@3', { workspace: 'other-ws-0123456' })),
    'gone',
    [],
  ],
  [
    'tagged, but moved into a host with no stamps',
    answered({ ...win('@4'), groups: [{ name: 'scratch' }] }),
    'gone',
    ['@4'],
  ],
  ['the host could not answer', { outcome: 'unknown', reason: 'timed out' }, 'unknown', []],
])('%s → %p', (_name, answer, state, strangers) => {
  const { live } = classify(hostedRecord(), answer, WS, 0, 'tmux');
  expect(live.state).toBe(state);
  expect(live.strangers).toEqual(strangers);
});

test('a window linked into several hosts reports the one its placement floor names', () => {
  const linked = win('@1', { groups: ['ward-a-f2', 'ward-a-f0'] });
  expect(classify(hostedRecord(), answered(linked), WS, 0, 'tmux').live.group).toBe('ward-a-f0');
});

test("the epoch is the latest launch's `at` — a resume re-dates the live half", () => {
  const record = hostedRecord([{ event: 'resumed', at: 'later', host: 'tmux' }]);
  expect(latestLaunch(record)?.at).toBe('later');
  expect(classify(record, answered(win('@1')), WS, 0, 'tmux').live.state).toBe('gone');
});

// -- a hosted launch, through the store ---------------------------------------

test('placement runs inside the open, after the record is on disk, and asks for exactly this', async () => {
  const host = fakeHost();
  const choice: HostChoice = { kind: 'tmux', host, workspace: await workspaceId(ws) };
  let sawRecord = false;
  const record = await openWorkspaceSession(ws, 'coordinate', {
    handle: 'claude:abc',
    host: 'tmux',
    withinLock: async (opened) => {
      sawRecord = existsSync(join(ws, 'sessions', `${opened.record.id}.md`));
      await placeLaunch(ws, choice, opened, run(['--session-id', 'abc']), {
        WARD_CLAUDE_BIN: '/bin/stub',
      });
    },
  });
  expect(sawRecord).toBe(true);
  expect(record.events).toEqual([{ event: 'opened', at: record.openedAt, host: 'tmux' }]);
  const [request] = host.placed;
  expect(request).toMatchObject({
    group: { workspace: await workspaceId(ws), floor: 0 },
    tags: { session: record.id, epoch: record.openedAt },
    label: record.id,
    cwd: ws,
    env: { WARD_AGENT: record.id }, // and nothing else of the caller's
    command: ['/bin/stub', '--session-id', 'abc'],
    floats: true,
    floating: [],
  });
});

test("a floor session's placement links the live coordinator into its floor's new host", async () => {
  const host = fakeHost();
  const choice: HostChoice = { kind: 'tmux', host, workspace: await workspaceId(ws) };
  const place = (opened: OpenSessionListing) =>
    placeLaunch(ws, choice, opened, run([]), {}).then(() => {});
  const coordinatorRecord = await openWorkspaceSession(ws, undefined, {
    handle: 'claude:c',
    host: 'tmux',
    withinLock: place,
  });
  await openProject(ws, 'alpha');
  await openFloorSession(ws, 1, undefined, {
    handle: 'claude:f',
    host: 'tmux',
    startedBy: coordinatorRecord.id,
    withinLock: place,
  });
  const floorRequest = host.placed[1];
  expect(floorRequest?.group.floor).toBe(1); // the coordinator is a floor-0 parent: no pull
  expect(floorRequest?.floats).toBe(false);
  expect(floorRequest?.floating).toEqual([
    { session: coordinatorRecord.id, epoch: coordinatorRecord.openedAt },
  ]);
});

// -- resume's gate -----------------------------------------------------------

test('resume over a live window is refused toward joining it; nothing is ended', async () => {
  const open = await hostedOpen();
  const host = fakeHost({
    windows: [
      win('@1', {
        session: open.record.id,
        epoch: open.record.openedAt,
        workspace: await workspaceId(ws),
      }),
    ],
  });
  await expect(guardResume(ws, open, {}, host)).rejects.toThrow(/still running .* join it instead/);
  expect(host.closed).toEqual([]);
});

test('resume over a dead window clears it and carries how it ended', async () => {
  const open = await hostedOpen();
  const host = fakeHost({
    windows: [
      win('@1', {
        session: open.record.id,
        epoch: open.record.openedAt,
        workspace: await workspaceId(ws),
        dead: true,
        exitSignal: 'SIGKILL',
      }),
    ],
  });
  expect(await guardResume(ws, open, {}, host)).toBe('previous run killed by SIGKILL');
  expect(host.closed).toEqual(['@1']);
});

test('resume when the host cannot answer is refused — never read as "not running"', async () => {
  const open = await hostedOpen();
  const host = fakeHost({ unknown: 'server not answering' });
  await expect(guardResume(ws, open, {}, host)).rejects.toThrow(
    /cannot tell .*server not answering/,
  );
});

test('a foreground launch asks the host nothing at all', async () => {
  const record = await openWorkspaceSession(ws, 'plain', { handle: 'claude:p' });
  const host = fakeHost({ unknown: 'must not be asked' });
  const listing = { scopeDir: '', record };
  expect(await guardResume(ws, listing, {}, host)).toBeUndefined();
  expect(await teardownSession(ws, listing, {}, host)).toBeUndefined();
  expect(host.finds).toBe(0);
});

// -- close's teardown ----------------------------------------------------------

test.each<
  [string, (id: string, epoch: string, ws: string) => FoundWindow[], Teardown['outcome'], string[]]
>([
  [
    'its own window, running',
    (id, epoch, ws) => [win('@1', { session: id, epoch, workspace: ws })],
    'closed',
    ['@1'],
  ],
  [
    'its own window, dead',
    (id, epoch, ws) => [win('@1', { session: id, epoch, workspace: ws, dead: true })],
    'closed',
    ['@1'],
  ],
  ['no window', () => [], 'absent', []],
  [
    'only a stranger wearing its tag',
    (id, _epoch, ws) => [win('@9', { session: id, epoch: 'other life', workspace: ws })],
    'absent',
    [],
  ],
])('close with %s → %p, ending %p', async (_name, windows, outcome, ended) => {
  const open = await hostedOpen();
  const host = fakeHost({
    windows: windows(open.record.id, open.record.openedAt, await workspaceId(ws)),
  });
  const teardown = await teardownSession(ws, open, {}, host);
  expect(teardown?.outcome).toBe(outcome);
  expect(host.closed).toEqual(ended);
});

test('a window whose tag changed under the close is left standing and reported', async () => {
  const open = await hostedOpen();
  const host = fakeHost({
    windows: [
      win('@1', {
        session: open.record.id,
        epoch: open.record.openedAt,
        workspace: await workspaceId(ws),
      }),
    ],
    refuseClose: 'window @1 carries something else',
  });
  const teardown = await teardownSession(ws, open, {}, host);
  expect(teardown).toMatchObject({ outcome: 'refused', window: '@1' });
  expect(teardown?.detail).toContain('left window @1 standing');
});

// -- scaffolding ------------------------------------------------------------------

interface FakeHost extends SessionHost {
  readonly placed: PlaceRequest[];
  readonly closed: string[];
  readonly finds: number;
}

/** An in-memory host: windows it was given, every request it got. */
function fakeHost(
  options: { windows?: FoundWindow[]; unknown?: string; refuseClose?: string } = {},
): FakeHost {
  const windows = [...(options.windows ?? [])];
  const placed: PlaceRequest[] = [];
  const closed: string[] = [];
  let finds = 0;
  let next = 100;
  return {
    kind: 'tmux',
    placed,
    closed,
    get finds() {
      return finds;
    },
    check: (): HostCheck => ({ usable: true, version: 'fake 1.0' }),
    prepare: () => {},
    place(request: PlaceRequest): Placement {
      placed.push(request);
      const group = `ward-fake-f${request.group.floor}`;
      const window = `@${next++}`;
      windows.push({
        window,
        groups: [{ name: group, stamp: request.group }],
        tags: request.tags,
        dead: false,
      });
      return { group, window, createdGroup: true, linkedInto: [] };
    },
    find(session: string): FindResult {
      finds += 1;
      if (options.unknown !== undefined) return { outcome: 'unknown', reason: options.unknown };
      return { outcome: 'answered', windows: windows.filter((w) => w.tags.session === session) };
    },
    close(window: string): CloseResult {
      if (options.refuseClose !== undefined)
        return { outcome: 'refused', reason: options.refuseClose };
      closed.push(window);
      return { outcome: 'closed' };
    },
    joinCommand: (group: string) => `fake join ${group}`,
  };
}

function win(
  window: string,
  over: Partial<{
    session: string;
    epoch: string;
    workspace: string;
    dead: boolean;
    exitStatus: number;
    exitSignal: string;
    groups: string[];
  }> = {},
): FoundWindow {
  const workspace = over.workspace ?? WS;
  return {
    window,
    groups: (over.groups ?? ['ward-a-f0']).map((name) => ({
      name,
      stamp: { workspace, floor: Number.parseInt(name.replace(/.*-f/, ''), 10) },
    })),
    tags: { session: over.session ?? 'workspace-1@t', epoch: over.epoch ?? EPOCH },
    dead: over.dead ?? false,
    ...(over.exitStatus === undefined ? {} : { exitStatus: over.exitStatus }),
    ...(over.exitSignal === undefined ? {} : { exitSignal: over.exitSignal }),
  };
}

function answered(...windows: FoundWindow[]): FindResult {
  return { outcome: 'answered', windows };
}

function hostedRecord(more: NonNullable<SessionRecord['events']> = []): SessionRecord {
  return {
    ...listing('', { id: 'workspace-1@t', scope: 'workspace' }).record,
    events: [{ event: 'opened', at: EPOCH, host: 'tmux' }, ...more],
  };
}

function listing(
  scopeDir: string,
  fields: Partial<SessionRecord> & { id: string },
): OpenSessionListing {
  return {
    scopeDir,
    record: {
      type: 'session',
      purpose: 'p',
      workingDirectory: '.',
      state: 'open',
      openedAt: EPOCH,
      ...fields,
    },
  };
}

function run(argv: string[]) {
  return { harness: claudeAdapter, configuredCommand: undefined, argv };
}

/** A hosted workspace-scope session, opened through the store (the fake places nothing). */
async function hostedOpen(): Promise<OpenSessionListing> {
  const record = await openWorkspaceSession(ws, 'hosted', { handle: 'claude:h', host: 'tmux' });
  const found = (await readAllSessions(ws)).find((entry) => entry.record.id === record.id);
  if (found === undefined) throw new Error('the session did not land');
  return found;
}

let scratch: string;
let ws: string;
let caseId = 0;

beforeEach(async () => {
  applyGitTestEnv();
  caseId += 1;
  scratch ??= makeTempDir();
  ws = join(scratch, `ws-${caseId}`);
  await createWorkspace(ws);
});

afterAll(() => {
  if (scratch !== undefined) removeDir(scratch);
});
