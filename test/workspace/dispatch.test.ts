// Hand-offs between floors (design/0067-floor-dispatch/), at the record: one
// commit opens the task on the floor named, records its brief, and records
// who handed it over; where it stands is derived from the task and its
// sessions on every read and stored nowhere; a refused hand-off writes
// nothing; and a floor's claim on a repository never moves a hand-off off the
// floor the sender named.
import { afterAll, beforeEach, expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { readDocument } from '../../src/store/document.ts';
import {
  briefRecordType,
  dispatchRecordType,
  type SessionRecord,
  type TaskRecord,
} from '../../src/store/types.ts';
import { createWorkspace } from '../../src/workspace/create.ts';
import {
  type DispatchState,
  dispatchState,
  dispatchTask,
  ownDispatchFilter,
  pickUpOf,
  readDispatches,
  senderOf,
} from '../../src/workspace/dispatch.ts';
import { git, gitOrThrow } from '../../src/workspace/git.ts';
import { openProject } from '../../src/workspace/projects.ts';
import {
  openFloorSession,
  openSession,
  openWorkspaceSession,
} from '../../src/workspace/sessions.ts';
import { listDispatches, statusReport, taskDetail } from '../../src/workspace/status.ts';
import { closeTask, openTask, setTaskState } from '../../src/workspace/tasks.ts';
import { applyGitTestEnv, makeTempDir, removeDir } from '../helpers.ts';

const BRIEF = '# Fix the login page\n\nIt rejects every password.\n';
const SENT = new Date('2026-11-16T12:00:00.000Z');

// -- the hand-off: one commit, three records ---------------------------------

test('a hand-off opens the task on the floor named, with its brief and its record, in one commit', async () => {
  const sender = await openFloorSession(ws, 1, undefined, { handle: 'claude:sender' });
  const commits = commitCount();
  const report = await dispatchTask(
    ws,
    'fix-login',
    { to: 2, brief: BRIEF, purpose: 'the login page', declared: sender.id },
    SENT,
  );
  const dir = 'projects/2-beta/tasks/t1-fix-login';
  expect(report.address).toBe('f2t1');
  expect(report.brief).toBe(`${dir}/brief.md`);
  expect(commitCount()).toBe(commits + 1);
  expect(committedNames()).toEqual([`${dir}/brief.md`, `${dir}/dispatch.md`, `${dir}/task.md`]);
  expect(lastSubject()).toStartWith('Dispatch task fix-login (f2t1) to floor 2 from floor 1');

  expect((await readDocument(ws, dispatchRecordType(dir))).data).toEqual({
    type: 'dispatch',
    task: 'f2t1',
    to: 2,
    fromSession: sender.id,
    fromFloor: 1,
    sentAt: SENT.toISOString(),
  });
  // The brief is the brief `ward task brief` writes: for the task, from the sender.
  const brief = await readDocument(ws, briefRecordType(dir));
  expect(brief.data).toEqual({
    type: 'brief',
    for: 'f2t1',
    createdAt: SENT.toISOString(),
    session: sender.id,
  });
  expect(brief.body).toBe(BRIEF);
  expect(report.task.record).toMatchObject({
    slug: 'fix-login',
    state: 'active',
    floor: 2,
    purpose: 'the login page',
  });
});

test("a floor's claim is a routing default: a hand-off lands on the floor the sender named", async () => {
  // The task records what it touches; `to` alone says where it goes. (The
  // claimed-repository case runs through the CLI, in test/cli/dispatch.test.ts.)
  const report = await dispatchTask(ws, 'touch-demo', {
    to: 2,
    brief: BRIEF,
    repositories: ['demo'],
  });
  expect(report.task.record.floor).toBe(2);
  expect(report.task.record.repositories).toEqual(['demo']);
});

// -- who it is from: recorded only where a source exists ----------------------

test('the sender is the declared session and the floor it answers for', async () => {
  const floor = await openFloorSession(ws, 1, undefined, { handle: 'claude:f' });
  await openTask(ws, 'work', { floor: 1 });
  const task = await openSession(ws, 'f1t1', 'do it', {});
  const coordinator = await openWorkspaceSession(ws, undefined, { handle: 'claude:w' });
  const sent = async (slug: string, declared: string | undefined) =>
    (
      await dispatchTask(ws, slug, {
        to: 2,
        brief: BRIEF,
        ...(declared === undefined ? {} : { declared }),
      })
    ).record;

  expect(await sent('from-floor', floor.id)).toMatchObject({ fromSession: floor.id, fromFloor: 1 });
  expect(await sent('from-task', task.id)).toMatchObject({ fromSession: task.id, fromFloor: 1 });
  // Above the floors: a session, and no floor invented for it.
  const above = await sent('from-above', coordinator.id);
  expect(above.fromSession).toBe(coordinator.id);
  expect(above.fromFloor).toBeUndefined();
  // Declared, but naming no session here — and nobody declared at all.
  for (const [slug, declared] of [
    ['from-one', '1'],
    ['from-nobody', undefined],
  ] as const) {
    const record = await sent(slug, declared);
    expect(record.fromSession).toBeUndefined();
    expect(record.fromFloor).toBeUndefined();
  }
});

test('senderOf reads a floor from the record, never from a name', () => {
  const at = (scopeDir: string, record: Partial<SessionRecord>) =>
    senderOf({ scopeDir, record: { id: 's', state: 'open', ...record } as SessionRecord });
  expect(senderOf(undefined)).toEqual({});
  expect(at('', { scope: 'workspace' })).toEqual({ session: 's' });
  expect(at('projects/7-x', { scope: 'project', floor: 7 })).toEqual({ session: 's', floor: 7 });
  expect(at('projects/7-x/tasks/t3-y', { task: 't3' })).toEqual({ session: 's', floor: 7 });
  expect(at('tasks/t1-legacy', { task: 't1' })).toEqual({ session: 's' });
});

// -- refusals: nothing is written ---------------------------------------------

test('a refused hand-off writes nothing: no task, no commit', async () => {
  const sender = await openFloorSession(ws, 1, undefined, { handle: 'claude:sender' });
  await openProject(ws, 'gamma');
  const closed = join(ws, 'projects/3-gamma/project.md');
  await Bun.write(
    closed,
    (await Bun.file(closed).text()).replace('state: active', 'state: closed'),
  );
  gitOrThrow(ws, 'commit', '-am', 'close floor 3 by hand, for the test');
  const head = gitOrThrow(ws, 'rev-parse', 'HEAD').stdout;

  const refused: [string, Parameters<typeof dispatchTask>[2], string, string][] = [
    ['own floor', { to: 1, brief: BRIEF, declared: sender.id }, 'ok', 'the floor you are on'],
    ['an empty brief', { to: 2, brief: ' \n' }, 'ok', 'a brief needs a body'],
    ['a bad slug', { to: 2, brief: BRIEF }, 'Not A Slug', 'not a valid slug'],
    ['a closed floor', { to: 3, brief: BRIEF }, 'ok', 'floor 3 is closed'],
    ['no such floor', { to: 9, brief: BRIEF }, 'ok', 'floor 9'],
  ];
  for (const [name, options, slug, message] of refused) {
    const error = await dispatchTask(ws, slug, options).then(
      () => undefined,
      (thrown: Error) => thrown,
    );
    expect([name, error?.message ?? 'not refused']).toEqual([
      name,
      expect.stringContaining(message),
    ]);
  }
  expect(gitOrThrow(ws, 'rev-parse', 'HEAD').stdout).toBe(head);
  expect(gitOrThrow(ws, 'status', '--porcelain').stdout).toBe('');
  expect(existsSync(join(ws, 'projects/2-beta/tasks'))).toBe(false);
});

// -- where it stands: derived at the leaves -----------------------------------

const task = (state: TaskRecord['state']) => ({ state }) as TaskRecord;
const session = (id: string, openedAt: string, state: 'open' | 'closed' = 'open') =>
  ({ id, openedAt, state }) as SessionRecord;

test.each<[string, TaskRecord, SessionRecord[], DispatchState]>([
  ['no session yet', task('active'), [], 'pending'],
  ['paused before anyone picked it up', task('paused'), [], 'pending'],
  ['a session opened on it', task('active'), [session('a', '2026-01-02')], 'picked-up'],
  [
    'its only session closed again: still picked up',
    task('active'),
    [session('a', '2026-01-02', 'closed')],
    'picked-up',
  ],
  ['closed without ever being picked up', task('closed'), [], 'closed'],
  ['closed after work', task('closed'), [session('a', '2026-01-02', 'closed')], 'closed'],
])('a hand-off is %s', (_name, record, sessions, expected) => {
  expect(dispatchState(record, sessions)).toBe(expected);
});

test('picked up names the FIRST session opened on the task, however they are listed', () => {
  expect(pickUpOf([])).toBeUndefined();
  expect(pickUpOf([session('late', '2026-01-03'), session('early', '2026-01-02')])).toEqual({
    session: 'early',
    at: '2026-01-02',
  });
});

test('a hand-off moves pending → picked up → closed with no write to its own record', async () => {
  const report = await dispatchTask(ws, 'fix-login', { to: 2, brief: BRIEF });
  const file = join(ws, 'projects/2-beta/tasks/t1-fix-login/dispatch.md');
  const written = await Bun.file(file).text();
  const standing = async () => (await readDispatches(ws))[0];

  expect(await standing()).toMatchObject({ address: 'f2t1', state: 'pending' });
  expect((await taskDetail(ws, 'f2t1')).dispatch?.state).toBe('pending');

  const worker = await openSession(ws, 'f2t1', 'fix it', {});
  expect(await standing()).toMatchObject({
    state: 'picked-up',
    pickedUp: { session: worker.id, at: worker.openedAt },
  });
  // A pause is the task's state, not the hand-off's.
  await setTaskState(ws, 'f2t1', 'paused');
  expect((await standing())?.state).toBe('picked-up');

  await closeTask(ws, 'f2t1', 'abandoned');
  const closed = await standing();
  expect(closed?.state).toBe('closed');
  expect(closed?.task.record.outcome).toBe('abandoned');
  expect(closed?.pickedUp?.session).toBe(worker.id);
  expect(await Bun.file(file).text()).toBe(written);
  expect(report.record.sentAt).toBe(closed?.record.sentAt ?? '');
});

// -- the reads: status, the listing, and what is one's own --------------------

test('status carries every hand-off on the glance; a task nobody handed over carries none', async () => {
  const sender = await openFloorSession(ws, 1, undefined, { handle: 'claude:sender' });
  await openTask(ws, 'ordinary', { floor: 2 });
  await dispatchTask(ws, 'handed', { to: 2, brief: BRIEF, declared: sender.id });
  const report = await statusReport(ws);
  expect(report.dispatches.map((standing) => [standing.address, standing.state])).toEqual([
    ['f2t2', 'pending'],
  ]);
  expect((await taskDetail(ws, 'f2t1')).dispatch).toBeUndefined();
});

test('the listing filters by floor, state and sender, and hides what the window has settled', async () => {
  const sender = await openFloorSession(ws, 1, undefined, { handle: 'claude:sender' });
  const above = await openWorkspaceSession(ws, undefined, { handle: 'claude:w' });
  await dispatchTask(ws, 'one', { to: 2, brief: BRIEF, declared: sender.id });
  await dispatchTask(ws, 'two', { to: 2, brief: BRIEF, declared: above.id });
  await dispatchTask(ws, 'three', { to: 1, brief: BRIEF, declared: above.id });
  await openSession(ws, 'f2t2', 'take two', {});
  await closeTask(ws, 'f1t1', 'abandoned');
  const slugs = async (
    ...args: Parameters<typeof listDispatches> extends [string, ...infer R] ? R : never
  ) => (await listDispatches(ws, ...args)).dispatches.map((standing) => standing.task.record.slug);

  expect(await slugs()).toEqual(['one', 'two', 'three']);
  expect(await slugs({ to: 2 })).toEqual(['one', 'two']);
  expect(await slugs({ from: 1 })).toEqual(['one']);
  expect(await slugs({ state: 'pending' })).toEqual(['one']);
  expect(await slugs({ state: 'picked-up' })).toEqual(['two']);
  expect(await slugs({ to: 2, state: 'closed' })).toEqual([]);
  // One's own: a floor's by floor — whichever of its sessions sent them — and
  // a session above the floors by itself.
  expect(await ownDispatchFilter(ws, sender.id)).toEqual({ from: 1 });
  expect(await ownDispatchFilter(ws, above.id)).toEqual({ session: above.id });
  expect(await slugs(await ownDispatchFilter(ws, above.id))).toEqual(['two', 'three']);
  await expect(ownDispatchFilter(ws, undefined)).rejects.toThrow('--mine needs a recorded session');

  // Eight days on, the closed one is history: hidden, counted, and reachable.
  const later = Date.now() + 8 * 24 * 60 * 60 * 1000;
  const windowed = await listDispatches(ws, {}, {}, later);
  expect(windowed.dispatches.map((standing) => standing.task.record.slug)).toEqual(['one', 'two']);
  expect(windowed.hidden).toBe(1);
  expect((await listDispatches(ws, {}, { all: true }, later)).hidden).toBe(0);
  expect((await listDispatches(ws, { state: 'closed' }, {}, later)).dispatches).toHaveLength(1);
});

// -- setup --------------------------------------------------------------------

let scratch: string;
let ws: string;
let caseId = 0;

beforeEach(async () => {
  applyGitTestEnv();
  scratch ??= makeTempDir();
  caseId += 1;
  ws = join(scratch, `ws-${caseId}`);
  await createWorkspace(ws);
  await openProject(ws, 'alpha');
  await openProject(ws, 'beta');
});

afterAll(() => {
  if (scratch !== undefined) removeDir(scratch);
});

function commitCount(): number {
  return Number(gitOrThrow(ws, 'rev-list', '--count', 'HEAD').stdout.trim());
}

function committedNames(): string[] {
  return gitOrThrow(ws, 'show', '--name-only', '--format=', 'HEAD')
    .stdout.trim()
    .split('\n')
    .sort();
}

function lastSubject(): string {
  return git(ws, 'log', '-1', '--format=%s').stdout.trim();
}
