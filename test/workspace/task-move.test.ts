// Moving a task to another floor (design/0082-task-move/), and reading a
// floor's reflection coverage from every floor's reflections
// (design/0083-reflection-coverage-across-floors/). An open task moves alone,
// with its record directory, brief, hand-off, sessions and worktrees, and takes
// the next room on the target floor; its old address names nothing. Closed
// tasks are re-homed in batches, records only, each keeping its room unless a
// directory of that room and slug already stands on the target. One journal
// commit each time; the disk half follows here at once and, on a machine that
// pulled the move, at its next upgrade.
// All fixtures synthetic: bare repositories as remotes, a fake session host.
import { afterAll, beforeAll, beforeEach, expect, test } from 'bun:test';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readlinkSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { type TaskMoveShape, taskMoveShape } from '../../src/cli/schema.ts';
import type { FoundWindow } from '../../src/host/host.ts';
import { readDocument, writeDocument } from '../../src/store/document.ts';
import {
  briefRecordType,
  type DispatchRecord,
  dispatchRecordType,
  projectRecordType,
  reflectionRecordType,
  sessionRecordType,
  type TaskRecord,
  taskRecordType,
  worktreeRecordType,
} from '../../src/store/types.ts';
import { convergeWorkspace } from '../../src/workspace/converge.ts';
import {
  dispatchTask,
  matchesDispatchFilter,
  readDispatches,
} from '../../src/workspace/dispatch.ts';
import { runDoctor } from '../../src/workspace/doctor.ts';
import { renumberFloor } from '../../src/workspace/floor-move.ts';
import { git, gitOrThrow } from '../../src/workspace/git.ts';
import { workspaceId } from '../../src/workspace/identity.ts';
import { openProject, readProjects } from '../../src/workspace/projects.ts';
import { reflectionPacket, unreflectedCount } from '../../src/workspace/reflection.ts';
import { addRepository, checkoutPath } from '../../src/workspace/repos.ts';
import { readTasks, resolveOpenTask } from '../../src/workspace/scan.ts';
import {
  findSession,
  openFloorSession,
  openSession,
  readSessions,
  workingTaskOf,
} from '../../src/workspace/sessions.ts';
import { moveTasks } from '../../src/workspace/task-move.ts';
import { openTask } from '../../src/workspace/tasks.ts';
import { createWorktree, establishOutsideLink } from '../../src/workspace/worktrees.ts';
import { fakeHost } from '../agent/fake-host.ts';
import { applyGitTestEnv, callWardEnv, makeTempDir, removeDir } from '../helpers.ts';
import { preparedRemote, preparedWorkspace } from '../prepared.ts';

// -- an open task ------------------------------------------------------------------------

test('an open task moves with everything it holds, takes the next room, and its checkouts follow', async () => {
  const seeded = await seedOpenTask();
  await openTask(ws, 'other', { floor: 3 }); // floor 3's room 1 is held
  const before = commitCount();

  const report = await moveTasks(ws, ['f1t1'], 3, { host: fakeHost() });

  expect(report).toMatchObject({
    floor: 3,
    slug: 'gamma',
    outcome: 'moved',
    tasks: [
      {
        slug: 'feature',
        state: 'active',
        from: { address: 'f1t1', dir: 'projects/1-alpha/tasks/t1-feature' },
        to: { address: 'f3t2', dir: 'projects/3-gamma/tasks/t2-feature' },
        room: 'new',
        outcome: 'moved',
      },
    ],
    cleared: [],
    unlinked: ['floors/1-alpha/f1t1-outside'],
    next: [],
  });
  expect(report.worktrees).toEqual([
    {
      address: 'f3t2',
      branch: 'feature',
      path: 'floors/3-gamma/f3t2-feature',
      outcome: 'moved',
      from: 'floors/1-alpha/f1t1-feature',
    },
    { address: 'f3t2', branch: 'outside', path: seeded.outside, outcome: 'linked' },
  ]);
  expect([...report.records].sort()).toEqual([
    'projects/3-gamma/tasks/t2-feature/task.md',
    'projects/3-gamma/tasks/t2-feature/worktrees/demo--feature.md',
  ]);
  // One journal commit, read by git as a rename, and nothing left over.
  expect(subjectsSince(before)).toEqual([
    'Move task f1t1 (feature) to floor 3 as f3t2 (ward 0.1.0)',
  ]);
  expect(gitOrThrow(ws, 'show', '--stat', '--format=', '-M', 'HEAD').stdout).toContain('=>');
  expect(git(ws, 'status', '--porcelain').stdout).toBe('');

  // The task record: its room and floor, and the opening line Ward wrote.
  const moved = await readDocument(ws, taskRecordType('projects/3-gamma/tasks/t2-feature'));
  expect(moved.data).toMatchObject({ code: 't2', floor: 3, slug: 'feature', state: 'active' });
  expect(moved.body).toStartWith(
    'The `feature` task, addressed `f3t2` while open — room `t2` on floor 3.',
  );
  expect(existsSync(join(ws, 'projects/1-alpha/tasks/t1-feature'))).toBe(false);
  await expect(resolveOpenTask(ws, 'f1t1')).rejects.toThrow('no open task at f1t1');
  expect((await resolveOpenTask(ws, 'f3t2')).record.slug).toBe('feature');

  // Quotations stay as written: the brief's `for`, the hand-off's `task` and `to`.
  const brief = await readDocument(ws, briefRecordType('projects/3-gamma/tasks/t2-feature'));
  expect(brief.data.for).toBe('f1t1');
  expect(await dispatch('projects/3-gamma/tasks/t2-feature')).toMatchObject({
    task: 'f1t1',
    to: 1,
    fromFloor: 2,
  });
  // …and the hand-off reads under the floor the task is on now, still pending.
  const standings = await readDispatches(ws);
  expect(
    standings
      .filter((s) => matchesDispatchFilter(s, { to: 3 }))
      .map((s) => [s.address, s.floor, s.state]),
  ).toEqual([['f3t2', 3, 'pending']]);
  expect(standings.filter((s) => matchesDispatchFilter(s, { to: 1 }))).toEqual([]);

  // The checkout at its new placement with its work; the outside worktree
  // linked from the new placement and no longer from the old.
  const work = join(ws, 'floors/3-gamma/f3t2-feature');
  expect(tip(work)).toBe(seeded.head);
  expect(registered()).toEqual([work]);
  expect(readlinkSync(join(ws, 'floors/3-gamma/f3t2-outside'))).toBe(seeded.outside);
  expect(lstatOrNull(join(ws, 'floors/1-alpha/f1t1-outside'))).toBeNull();
  expect(existsSync(join(ws, 'floors/1-alpha/AGENTS.md'))).toBe(true); // the floor's own view stays

  // Asked again, by its address now, nothing is written.
  const again = await moveTasks(ws, ['f3t2'], 3, { host: fakeHost() });
  expect(again).toMatchObject({ outcome: 'satisfied', records: [] });
  expect(again.worktrees.map((w) => w.outcome)).toEqual(['placed', 'linked']);
  expect(commitCount()).toBe(before + 1);
});

test('a picked-up hand-off stays picked up across a move and a renumber of the floor it was sent to, and the floor session working it is set down', async () => {
  const beta = await openFloorSession(ws, 2, 'sending', { handle: 'claude:b' });
  await dispatchTask(ws, 'feature', { to: 1, brief: 'handed over', declared: beta.id });
  const routing = await openFloorSession(ws, 1, 'routing', { handle: 'claude:r', task: 'f1t1' });
  const pickedAt = routing.events?.find((e) => e.event === 'task-named')?.at ?? fail();
  const own = await openSession(ws, 'f1t1', 'working', { handle: 'claude:t' });
  await openTask(ws, 'other', { floor: 3 });

  const report = await moveTasks(ws, ['f1t1'], 3, { host: fakeHost() });

  expect(report.cleared).toEqual([{ session: routing.id, task: 'f1t1-feature' }]);
  expect(report.next).toEqual([
    `ward session move ${routing.id} --floor 3 --task f3t2  # to carry ${routing.id} along with the task`,
  ]);
  expect([...report.records].sort()).toEqual(
    [
      'projects/3-gamma/tasks/t2-feature/task.md',
      `projects/3-gamma/tasks/t2-feature/sessions/${own.id}.md`,
      `projects/1-alpha/sessions/${routing.id}.md`,
    ].sort(),
  );
  // The floor session's trail says it set the task down; it works nothing now.
  const trail = (await findSession(ws, routing.id)).record;
  expect(trail.events?.map((e) => e.event)).toEqual(['opened', 'task-named', 'task-cleared']);
  expect(workingTaskOf(trail, await readTasks(ws))).toBeUndefined();
  // The task's own session moved with it: its id as minted, its room code now.
  const [session] = await readSessions(ws, 'projects/3-gamma/tasks/t2-feature');
  expect(session).toMatchObject({ id: own.id, task: 't2', state: 'open' });
  expect((await findSession(ws, own.id)).scopeDir).toBe('projects/3-gamma/tasks/t2-feature');

  // Picked up first by the floor session that named it, on the floor it was sent to.
  const picked = async () =>
    (await readDispatches(ws)).map((s) => [
      s.address,
      s.state,
      s.pickedUp?.session,
      s.pickedUp?.at,
    ]);
  expect(await picked()).toEqual([['f3t2', 'picked-up', routing.id, pickedAt]]);

  // The floor it was sent to renumbered: `to` follows the number, and the
  // pick-up is still read from that floor's sessions.
  await renumberFloor(ws, '1', '11', { host: fakeHost() });
  expect((await dispatch('projects/3-gamma/tasks/t2-feature')).to).toBe(11);
  expect(await picked()).toEqual([['f3t2', 'picked-up', routing.id, pickedAt]]);
});

// -- refusals ------------------------------------------------------------------------------

test.each<
  [
    string,
    () => Promise<{
      args?: string[];
      to?: number;
      caller?: string;
      host?: ReturnType<typeof fakeHost>;
      slug?: string;
      from?: number;
    }>,
    RegExp,
  ]
>([
  [
    'a dirty checkout',
    async () => {
      writeFileSync(join(ws, 'floors/1-alpha/f1t1-feature/scratch.txt'), 'unsaved\n');
      return {};
    },
    /its worktree floors\/1-alpha\/f1t1-feature: uncommitted changes/,
  ],
  [
    'an open session working inside the checkout',
    async () => {
      await openSession(ws, 'f1t1', 'inside', { workingDirectory: 'floors/1-alpha/f1t1-feature' });
      return {};
    },
    /open session feature-1@test works in floors\/1-alpha\/f1t1-feature — close it/,
  ],
  [
    "the caller being the task's own session",
    async () => ({ caller: (await openSession(ws, 'f1t1', 'here', {})).id }),
    /this is session feature-1@test, which works f1t1 — a task is moved from outside it/,
  ],
  [
    'a floor session working it, running',
    async () => {
      const session = await openFloorSession(ws, 1, 'hosted', {
        handle: 'claude:f',
        host: 'tmux',
        task: 'f1t1',
      });
      const window: FoundWindow = {
        window: '@1',
        groups: [
          { name: `ws-${caseId}-f1-alpha`, stamp: { workspace: await workspaceId(ws), floor: 1 } },
        ],
        tags: { session: session.id, epoch: session.events?.at(-1)?.at ?? '' },
        dead: false,
      };
      return { host: fakeHost({ windows: [window] }) };
    },
    /floor session f1-1@test is working f1t1 and running — set it down first \(ward session task f1-1@test --clear\)/,
  ],
  [
    'a closed floor as the target',
    async () => {
      await openProject(ws, 'delta');
      const type = projectRecordType('projects/4-delta');
      const current = await readDocument(ws, type);
      await writeDocument(ws, type, {
        data: { ...current.data, state: 'closed' },
        body: current.body,
      });
      gitOrThrow(ws, 'commit', '-qam', 'floor 4 closed');
      return { to: 4 };
    },
    /project on floor 4 is closed/,
  ],
  [
    'a legacy bare task',
    async () => {
      await seedClosedTask('tasks', 2, 'old', undefined);
      return { args: ['legacy-t2'] };
    },
    /legacy-t2 is a legacy bare task — tasks\/ is read, never written/,
  ],
  [
    "Ward's own stewardship task",
    async () => {
      await seedClosedTask('projects/0-workspace', 1, 'reflect', 0, {
        stewardship: 'reflection',
        reflects: 1,
      });
      return { args: ['f0t1'] };
    },
    /f0t1 is Ward's own reflection task — stewardship stands on the ground floor/,
  ],
  [
    'an open task asked with closed ones',
    async () => {
      await seedClosedTask('projects/1-alpha', 9, 'done', 1);
      return { args: ['f1t1', 'f1t9'] };
    },
    /f1t1 is open — an open task moves on its own/,
  ],
  [
    "a closed task whose floor's reflection is open",
    async () => {
      await seedClosedTask('projects/1-alpha', 9, 'done', 1);
      await seedClosedTask('projects/0-workspace', 1, 'reflect-floor-1', 0, {
        stewardship: 'reflection',
        reflects: 1,
        state: 'active',
      });
      return { args: ['f1t9'] };
    },
    /f1t9: floor 1's reflection f0t1 is open, .* land or close the reflection first/,
  ],
  [
    '--slug without --from',
    async () => ({ args: [], slug: 'done' }),
    /--slug and --from go together/,
  ],
  ['an address no task holds', async () => ({ args: ['f1t7'] }), /no task at f1t7/],
])('a move is refused for %s, and nothing is written', async (_, arrange, says) => {
  await openTask(ws, 'feature', { floor: 1 });
  await createWorktree(ws, 'f1t1', 'demo');
  const options = await arrange();
  const before = commitCount();
  const dirs = (await readTasks(ws)).map((t) => t.dir);
  await expect(
    moveTasks(ws, options.args ?? ['f1t1'], options.to ?? 3, {
      host: options.host ?? fakeHost(),
      ...(options.caller === undefined ? {} : { caller: options.caller }),
      ...(options.slug === undefined ? {} : { slug: options.slug }),
      ...(options.from === undefined ? {} : { from: options.from }),
    }),
  ).rejects.toThrow(says);
  expect(commitCount()).toBe(before);
  expect((await readTasks(ws)).map((t) => t.dir)).toEqual(dirs);
  expect(existsSync(join(ws, 'floors/1-alpha/f1t1-feature'))).toBe(true);
});

// -- closed tasks -------------------------------------------------------------------------------

test('closed tasks move in one commit, by address and by slug, keeping their rooms where they can', async () => {
  await seedClosedTask('projects/0-workspace', 3, 'old-notes', 0);
  await seedClosedTask('projects/0-workspace', 4, 'old-plans', 0);
  await seedClosedTask('projects/0-workspace', 5, 'clash', 0);
  await seedClosedTask('projects/0-workspace', 6, 'kept-here', 0);
  await seedClosedTask('projects/3-gamma', 5, 'clash', 3); // the target already holds t5-clash
  const session = await seedClosedSession('projects/0-workspace/tasks/t5-clash', 't5');
  const before = commitCount();

  const report = await moveTasks(ws, ['f0t5-clash'], 3, { slug: 'old', from: 0 });

  expect(report.outcome).toBe('moved');
  expect(report.tasks.map((t) => [t.from.address, t.to.address, t.to.dir, t.room])).toEqual([
    ['f0t5', 'f3t6', 'projects/3-gamma/tasks/t6-clash', 'new'],
    ['f0t3', 'f3t3', 'projects/3-gamma/tasks/t3-old-notes', 'kept'],
    ['f0t4', 'f3t4', 'projects/3-gamma/tasks/t4-old-plans', 'kept'],
  ]);
  expect(subjectsSince(before)).toEqual([
    'Move 3 closed tasks clash, old-notes, old-plans to floor 3 (ward 0.1.0)',
  ]);
  expect(git(ws, 'status', '--porcelain').stdout).toBe('');
  // Every record says where it stands now; the one that changed room says so
  // on its session too.
  expect(await taskRecord('projects/3-gamma/tasks/t6-clash')).toMatchObject({
    code: 't6',
    floor: 3,
    state: 'closed',
  });
  expect(await taskRecord('projects/3-gamma/tasks/t3-old-notes')).toMatchObject({
    code: 't3',
    floor: 3,
  });
  expect((await readSessions(ws, 'projects/3-gamma/tasks/t6-clash'))[0]).toMatchObject({
    id: session,
    task: 't6',
  });
  // What the filter did not choose stays where it was.
  expect(existsSync(join(ws, 'projects/0-workspace/tasks/t6-kept-here'))).toBe(true);
  expect(existsSync(join(ws, 'projects/3-gamma/tasks/t5-clash'))).toBe(true);

  // Asked again, nothing is written.
  const again = await moveTasks(ws, ['f3t3'], 3, {});
  expect(again).toMatchObject({ outcome: 'satisfied', records: [] });
  expect(commitCount()).toBe(before + 1);
});

test("each floor's reflection reckoning reads coverage from every floor's reflections", async () => {
  await seedClosedTask('projects/1-alpha', 8, 'uncovered', 1);
  await seedClosedTask('projects/1-alpha', 9, 'covered', 1);
  await writeDocument(ws, reflectionRecordType('projects/1-alpha', 1), {
    data: {
      type: 'reflection',
      floor: 1,
      number: 1,
      task: 'projects/0-workspace/tasks/t1-reflect',
      machine: 'test',
      through: '2026-11-03T00:00:00.000Z',
      tasks: [{ dir: 'projects/1-alpha/tasks/t9-covered', outcome: 'delivered' }],
      sessions: [],
    },
    body: 'what was learned',
  });
  gitOrThrow(ws, 'add', '-A');
  gitOrThrow(ws, 'commit', '-qm', 'a reflection');
  expect([await unreflected(1), await unreflected(2)]).toEqual([1, 0]);

  const report = await moveTasks(ws, ['f1t8', 'f1t9'], 2, {});

  expect(report.records).toContain('projects/1-alpha/reflections/1.md');
  const reflection = await readDocument(ws, reflectionRecordType('projects/1-alpha', 1));
  expect(reflection.data.tasks.map((t) => t.dir)).toEqual(['projects/2-beta/tasks/t9-covered']);
  expect(reflection.data.floor).toBe(1);
  // Floor 1 has nothing left to reflect on; floor 2 is offered only what no
  // floor's reflection has covered.
  expect([await unreflected(1), await unreflected(2)]).toEqual([0, 1]);
  expect((await reflectionPacket(ws, 2)).tasks.map((t) => t.dir)).toEqual([
    'projects/2-beta/tasks/t8-uncovered',
  ]);
});

// -- another machine, and a move cut short ------------------------------------------------------

test('a machine whose disk still stands as before the move converges on upgrade, and doctor names what is left', async () => {
  const seeded = await seedOpenTask();
  await moveTasks(ws, ['f1t1'], 2, { host: fakeHost() });
  standAsBefore(seeded.outside);
  expect(await doctorMessages('worktree placement')).toEqual([
    'task f2t1: floors/1-alpha/f1t1-feature belongs at floors/2-beta/f2t1-feature — move it: ward workspace upgrade',
  ]);
  expect(await doctorMessages('outside worktree links')).toEqual([
    'floors/1-alpha/f1t1-outside links onto a worktree whose task has moved off this floor — remove it: ward workspace upgrade',
  ]);
  const before = commitCount();

  const steps = (await convergeWorkspace(ws)).steps;

  expect(steps.find((s) => s.step === 'worktree placement')?.detail).toStartWith('1 moved');
  expect(steps.find((s) => s.step === 'outside worktree links')?.detail).toBe(
    'floors/2-beta/f2t1-outside; floors/1-alpha/f1t1-outside removed (its task moved)',
  );
  expect(registered()).toEqual([join(ws, 'floors/2-beta/f2t1-feature')]);
  expect(readlinkSync(join(ws, 'floors/2-beta/f2t1-outside'))).toBe(seeded.outside);
  expect(lstatOrNull(join(ws, 'floors/1-alpha/f1t1-outside'))).toBeNull();
  expect(commitCount()).toBe(before); // the record had already moved
  expect(await doctorMessages('worktree placement')).toEqual([]);
  expect(await doctorMessages('outside worktree links')).toEqual([]);
});

test('a move cut short after its commit is finished by asking again at the address it took', async () => {
  const seeded = await seedOpenTask();
  await moveTasks(ws, ['f1t1'], 2, { host: fakeHost() });
  standAsBefore(seeded.outside);
  const before = commitCount();

  const again = await moveTasks(ws, ['f2t1'], 2, { host: fakeHost() });

  expect(again.outcome).toBe('satisfied');
  expect(again.unlinked).toEqual(['floors/1-alpha/f1t1-outside']);
  expect(again.worktrees[0]).toEqual({
    address: 'f2t1',
    branch: 'feature',
    path: 'floors/2-beta/f2t1-feature',
    outcome: 'moved',
    from: 'floors/1-alpha/f1t1-feature',
  });
  expect(commitCount()).toBe(before);
});

// -- the verb ---------------------------------------------------------------------------------

test('ward task move takes a floor by slug, reports under --json, and refuses with no document', async () => {
  await openTask(ws, 'feature', { floor: 1 });
  const result = await callWardEnv(['task', 'move', 'f1t1', '--to', 'gamma', '--json'], ws, env());
  expect(result.exitCode).toBe(0);
  const report: TaskMoveShape = taskMoveShape.parse(JSON.parse(result.stdout));
  expect(report).toMatchObject({
    floor: 3,
    slug: 'gamma',
    outcome: 'moved',
    tasks: [{ from: { address: 'f1t1' }, to: { address: 'f3t1' }, room: 'kept' }],
    worktrees: [],
  });

  await seedClosedTask('projects/0-workspace', 4, 'old-notes', 0);
  const human = await callWardEnv(
    ['task', 'move', '--slug', 'notes', '--from', '0', '--to', '2'],
    ws,
    env(),
  );
  expect(human.exitCode).toBe(0);
  expect(human.stdout).toContain('moved f0t4 old-notes → f2t4 (floor 2, room kept)');
  // Floor 2's sequence follows the room it was last handed out (t4): the
  // open task arriving takes the next.
  const open = await callWardEnv(['task', 'move', 'f3t1', '--to', '2'], ws, env());
  expect(open.stdout).toContain('moved f3t1 feature → f2t5 (floor 2, next room)');
  expect(open.stdout).toContain('f3t1 no longer names it: the task is f2t5 now');

  const refused = await callWardEnv(['task', 'move', 'f1t9', '--to', '2', '--json'], ws, env());
  expect(refused.exitCode).not.toBe(0);
  expect(refused.stdout).toBe('');
  expect(refused.stderr).toContain('no task at f1t9');
});

// -- scaffolding ----------------------------------------------------------------------
// Each case: a fresh workspace with one registered repository, `demo` (main
// line `trunk`), floor 1 `alpha`, floor 2 `beta` and floor 3 `gamma`. Each
// case is its own machine: its own configuration and state directories.

let scratch: string;
let ws: string;
let caseId = 0;

function env(): Record<string, string> {
  return { NO_COLOR: '1', WARD_TMUX_SOCKET: join(scratch, `no-tmux-${caseId}`) };
}

function fail(): never {
  throw new Error('missing');
}

/**
 * An open task on floor 1 handed over from floor 2 (f1t1, pending), with a
 * committed worktree of `demo` and an outside worktree linked from its
 * placement — a record a repository's command would have written.
 */
async function seedOpenTask(): Promise<{ head: string; outside: string }> {
  const beta = await openFloorSession(ws, 2, 'sending', { handle: 'claude:b' });
  await dispatchTask(ws, 'feature', { to: 1, brief: 'handed over', declared: beta.id });
  const { record } = await createWorktree(ws, 'f1t1', 'demo');
  const work = join(ws, record.path);
  writeFileSync(join(work, 'work.txt'), 'committed work\n');
  gitOrThrow(work, 'add', '-A');
  gitOrThrow(work, 'commit', '-qm', 'the work');
  const outside = join(scratch, `outside-${caseId}`);
  mkdirSync(outside);
  await writeDocument(
    ws,
    worktreeRecordType('projects/1-alpha/tasks/t1-feature', 'demo--outside'),
    {
      data: {
        type: 'worktree',
        repo: 'demo',
        branch: 'outside',
        path: outside,
        machine: 'test',
        disposition: 'deliverable',
        createdAt: '2026-11-22T00:00:00.000Z',
      },
      body: 'made by the repository command',
    },
  );
  gitOrThrow(ws, 'add', '-A');
  gitOrThrow(ws, 'commit', '-qm', 'an outside worktree');
  establishOutsideLink(ws, 'floors/1-alpha/f1t1-outside', outside);
  return { head: tip(work), outside };
}

async function seedClosedTask(
  container: string,
  room: number,
  slug: string,
  floor: number | undefined,
  extra: Partial<TaskRecord> = {},
): Promise<void> {
  const dir =
    container === 'tasks' ? `tasks/t${room}-${slug}` : `${container}/tasks/t${room}-${slug}`;
  await writeDocument(ws, taskRecordType(dir), {
    data: {
      type: 'task',
      code: `t${room}`,
      slug,
      ...(floor === undefined ? {} : { floor }),
      state: 'closed',
      outcome: 'delivered',
      prs: [],
      openedAt: '2026-11-01T00:00:00.000Z',
      closedAt: '2026-11-02T00:00:00.000Z',
      ...extra,
    },
    body: 'done',
  });
  gitOrThrow(ws, 'add', '-A');
  gitOrThrow(ws, 'commit', '-qm', `closed ${slug}`);
}

async function seedClosedSession(taskDir: string, code: string): Promise<string> {
  const id = 'clash-1@test';
  await writeDocument(ws, sessionRecordType(taskDir, id), {
    data: {
      type: 'session',
      id,
      scope: 'task',
      task: code,
      purpose: 'the work',
      workingDirectory: '.',
      machine: 'test',
      state: 'closed',
      openedAt: '2026-11-01T00:00:00.000Z',
      closedAt: '2026-11-02T00:00:00.000Z',
    },
    body: `Session \`${id}\` of task \`${code}\`.`,
  });
  gitOrThrow(ws, 'add', '-A');
  gitOrThrow(ws, 'commit', '-qm', 'a closed session');
  return id;
}

/** This machine's disk as it was before it pulled the move: the checkout and link on floor 1. */
function standAsBefore(outside: string): void {
  gitOrThrow(
    checkoutPath(ws, 'demo'),
    'worktree',
    'move',
    join(ws, 'floors/2-beta/f2t1-feature'),
    join(ws, 'floors/1-alpha/f1t1-feature'),
  );
  rmSync(join(ws, 'floors/2-beta/f2t1-outside'));
  symlinkSync(outside, join(ws, 'floors/1-alpha/f1t1-outside'));
}

async function dispatch(taskDir: string): Promise<DispatchRecord> {
  return (await readDocument(ws, dispatchRecordType(taskDir))).data;
}

async function taskRecord(dir: string): Promise<TaskRecord> {
  return (await readDocument(ws, taskRecordType(dir))).data;
}

async function unreflected(floor: number): Promise<number> {
  const project = (await readProjects(ws)).find((p) => p.record.floor === floor) ?? fail();
  return unreflectedCount(ws, project, await readTasks(ws));
}

async function doctorMessages(check: string): Promise<string[]> {
  return (await runDoctor(ws)).workspace.filter((f) => f.check === check).map((f) => f.message);
}

function lstatOrNull(path: string): ReturnType<typeof lstatSync> | null {
  try {
    return lstatSync(path);
  } catch {
    return null;
  }
}

function registered(): string[] {
  return gitOrThrow(checkoutPath(ws, 'demo'), 'worktree', 'list', '--porcelain')
    .stdout.split('\n')
    .filter((line) => line.startsWith('worktree '))
    .map((line) => line.slice('worktree '.length))
    .slice(1)
    .sort();
}

function tip(dir: string): string {
  return gitOrThrow(dir, 'rev-parse', 'HEAD').stdout.trim();
}

function commitCount(): number {
  return Number.parseInt(gitOrThrow(ws, 'rev-list', '--count', 'HEAD').stdout.trim(), 10);
}

function subjectsSince(count: number): string[] {
  const total = commitCount();
  if (total === count) return [];
  return gitOrThrow(ws, 'log', '--format=%s', '--reverse', `-${total - count}`)
    .stdout.trim()
    .split('\n');
}

beforeAll(() => {
  applyGitTestEnv();
  scratch = makeTempDir();
});

beforeEach(async () => {
  caseId += 1;
  applyGitTestEnv();
  process.env.WARD_CONFIG_DIR = join(scratch, `config-${caseId}`);
  process.env.WARD_STATE_DIR = join(scratch, `state-${caseId}`);
  process.env.WARD_MACHINE = 'test';
  ws = join(scratch, `ws-${caseId}`);
  await preparedWorkspace(ws);
  const remote = join(scratch, `remote-${caseId}.git`);
  preparedRemote(remote, { branch: 'trunk', files: { 'seed.txt': 'seed\n' } });
  await addRepository(ws, remote, 'demo');
  await openProject(ws, 'alpha');
  await openProject(ws, 'beta');
  await openProject(ws, 'gamma');
});

afterAll(() => {
  applyGitTestEnv();
  removeDir(scratch);
});
