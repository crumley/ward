// `ward session move`'s run half (design/0084-session-move/), against a FAKE
// host: the order — read the old run, commit the pair, end the old window,
// resume the continuation — and every branch where the move starts nothing.
// The record half's refusals and every report a caller reads are
// test/cli/session-move.test.ts's; a real tmux moving a window between two
// floors' hosts is test/host/tmux-live.test.ts's.
import { afterAll, beforeEach, expect, test } from 'bun:test';
import { join } from 'node:path';
import { moveSession } from '../../src/agent/move.ts';
import { planResumeAll } from '../../src/agent/resume-all.ts';
import type { LaunchedSession } from '../../src/agent/run.ts';
import type { FoundWindow } from '../../src/host/host.ts';
import type { SessionRecord } from '../../src/store/types.ts';
import { gitOrThrow } from '../../src/workspace/git.ts';
import { workspaceId } from '../../src/workspace/identity.ts';
import { openProject } from '../../src/workspace/projects.ts';
import { findSession, openFloorSession, recordResume } from '../../src/workspace/sessions.ts';
import { applyGitTestEnv, makeTempDir, removeDir } from '../helpers.ts';
import { preparedWorkspace } from '../prepared.ts';
import { type FakeHostOptions, fakeHost } from './fake-host.ts';

test('a live hosted run: one commit, the old window ended, then the continuation resumed', async () => {
  const old = await hostedOnFloor(1);
  const host = fakeHost({ windows: [own(old, 1)] });
  const resumed: string[] = [];
  const before = commits();
  const report = await moveSession(
    ws,
    old.id,
    { scope: 'project', floor: 2 },
    {
      host,
      resume: async (_root, which) => {
        // The old window is already gone when the continuation starts: never
        // two runs of one conversation at once.
        expect(host.closed).toEqual(['@1']);
        resumed.push(which);
        return placedRun((await findSession(ws, which)).record);
      },
    },
  );
  expect(commits()).toBe(before + 1);
  expect(report.from).toMatchObject({ id: 'f1-1@test', state: 'closed' });
  expect(report.from.events?.slice(-2).map((event) => [event.event, event.session])).toEqual([
    ['continued', 'f2-1@test'],
    ['closed', undefined],
  ]);
  expect(report.to).toMatchObject({
    id: 'f2-1@test',
    floor: 2,
    handle: old.handle,
    continues: old.id,
  });
  expect(report.teardown).toMatchObject({ outcome: 'closed', window: '@1' });
  expect(resumed).toEqual(['f2-1@test']);
  expect(report.hosted?.group).toBe('host-2');
  expect(report.next).toBeUndefined();
});

test.each<[string, (old: SessionRecord) => FakeHostOptions, string]>([
  ['its window is gone', () => ({}), 'it was not running (no window)'],
  [
    'its last run failed',
    (old) => ({ windows: [{ ...own(old, 1), dead: true, exitStatus: 3 }] }),
    'it was not running (its last run failed, its window kept)',
  ],
  [
    'its window will not close',
    (old) => ({ windows: [own(old, 1)], refuseClose: 'busy' }),
    'its old window could not be ended',
  ],
])('a hosted run is not resumed when %s: the move says what to run', async (_name, given, says) => {
  const old = await hostedOnFloor(1);
  const report = await moveSession(
    ws,
    old.id,
    { scope: 'project', floor: 2 },
    {
      host: fakeHost(given(old)),
      resume: () => {
        throw new Error('resumed');
      },
    },
  );
  expect(report.from.state).toBe('closed');
  expect(report.next).toContain(says);
  expect(report.next).toEndWith('ward session resume f2-1@test');
});

test('a host that cannot answer refuses the move, and nothing is written', async () => {
  const old = await hostedOnFloor(1);
  const before = commits();
  await expect(
    moveSession(
      ws,
      old.id,
      { scope: 'project', floor: 2 },
      { host: fakeHost({ unknown: 'no server' }) },
    ),
  ).rejects.toThrow(`cannot tell whether session ${old.id} is still running in tmux (no server)`);
  expect(commits()).toBe(before);
  expect((await findSession(ws, old.id)).record.state).toBe('open');
});

test('a continuation that does not start is reported, and the pair stands', async () => {
  const old = await hostedOnFloor(1);
  const report = await moveSession(
    ws,
    old.id,
    { scope: 'project', floor: 2 },
    {
      host: fakeHost({ windows: [own(old, 1)] }),
      resume: () => Promise.reject(new Error('history not found')),
    },
  );
  expect(report.next).toBe(
    'the continuation did not start (history not found) — ward session resume f2-1@test',
  );
  expect((await findSession(ws, 'f2-1@test')).record.state).toBe('open');
});

test('a foreground run is never started over: the move names the resume and starts nothing', async () => {
  await projects();
  const old = await openFloorSession(ws, 1, 'route alpha', { handle: 'claude:fg' });
  const report = await moveSession(
    ws,
    old.id,
    { scope: 'project', floor: 2 },
    {
      host: fakeHost(),
      resume: () => {
        throw new Error('resumed');
      },
    },
  );
  expect(report.teardown).toBeUndefined();
  expect(report.next).toStartWith('its last run was in the foreground, where Ward cannot see it');
  expect(report.next).toEndWith(
    'continue the conversation on floor 2: ward session resume f2-1@test',
  );
});

test.each<[string, { session?: string; handle?: string }]>([
  ['by its declared session', { session: 'f1-1@test' }],
  [
    'by the run it stands in, as a subagent of it does',
    { session: 'f1t1-1@test', handle: 'claude:h-1' },
  ],
])(
  'a session cannot move itself (%s): refused before anything is read or written',
  async (_name, caller) => {
    const old = await hostedOnFloor(1);
    const host = fakeHost({ windows: [own(old, 1)] });
    const before = commits();
    await expect(
      moveSession(ws, old.id, { scope: 'project', floor: 2 }, { host, caller }),
    ).rejects.toThrow(
      'session f1-1@test is the one this command is running in — a move ends its window before ' +
        'the continuation starts, which would end this command with it. Nothing was moved; run ' +
        'the move from another terminal: ward session move f1-1@test --floor 2',
    );
    expect(commits()).toBe(before);
    expect(host.closed).toEqual([]);
    expect(host.finds).toBe(0);
  },
);

test('resume --all plans the continuation and never the closed predecessor', async () => {
  const old = await hostedOnFloor(1);
  const host = fakeHost({ windows: [own(old, 1)] });
  // The resume the move makes is recorded as a hosted launch, as the real one
  // is; after a reboot the plan reads both records.
  await moveSession(
    ws,
    old.id,
    { scope: 'project', floor: 2 },
    {
      host,
      resume: async (root, which) => placedRun(await recordResume(root, which, { host: 'tmux' })),
    },
  );
  const plan = await planResumeAll(ws, { host: fakeHost() });
  expect(plan.sessions.map((session) => [session.record.id, session.floor])).toEqual([
    ['f2-1@test', 2],
  ]);
  expect(plan.notHosted).toBe(0);
});

// -- scaffolding ------------------------------------------------------------------

let scratch: string | undefined;
let ws: string;
let id: string;
let caseId = 0;
let handles = 0;

async function projects(): Promise<void> {
  await openProject(ws, 'alpha');
  await openProject(ws, 'beta');
}

/** An open floor session whose latest launch was hosted in tmux. */
async function hostedOnFloor(floor: number): Promise<SessionRecord> {
  await projects();
  handles += 1;
  return openFloorSession(ws, floor, 'route alpha', {
    handle: `claude:h-${handles}`,
    host: 'tmux',
  });
}

/** The session's own window in its floor's host: its tag, its latest launch as epoch. */
function own(record: SessionRecord, floor: number): FoundWindow {
  return {
    window: '@1',
    groups: [{ name: `host-${floor}`, stamp: { workspace: id, floor } }],
    tags: { session: record.id, epoch: record.events?.at(-1)?.at ?? '' },
    dead: false,
  };
}

/** What a hosted resume hands back, read a beat after it was placed. */
function placedRun(record: SessionRecord): LaunchedSession {
  return {
    record,
    hosted: {
      floor: record.floor ?? 0,
      group: `host-${record.floor ?? 0}`,
      window: '@7',
      createdGroup: false,
      join: 'fake join',
      live: { kind: 'tmux', state: 'live', floor: record.floor ?? 0, window: '@7', strangers: [] },
    },
  };
}

function commits(): number {
  return Number(gitOrThrow(ws, 'rev-list', '--count', 'HEAD').stdout.trim());
}

beforeEach(async () => {
  applyGitTestEnv();
  caseId += 1;
  handles = 0;
  scratch ??= makeTempDir();
  ws = join(scratch, `ws-${caseId}`);
  await preparedWorkspace(ws);
  id = await workspaceId(ws);
});

afterAll(() => {
  if (scratch !== undefined) removeDir(scratch);
});
