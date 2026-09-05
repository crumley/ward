// The ground floor (design/0041-ground-floor/): floor 0 is the standing
// workspace project's, in every workspace; ordinary floors run from 1; every
// task opens on a floor, the ground floor when none is named; a workspace
// that has no ground floor is refused rather than served from the bare pool;
// and the legacy bare tasks under `tasks/` keep working exactly as written.
import { afterAll, beforeAll, beforeEach, expect, test } from 'bun:test';
import { existsSync, mkdirSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { writeDocument } from '../../src/store/document.ts';
import {
  type ProjectRecord,
  projectRecordType,
  projectSchema,
  type TaskRecord,
  taskRecordType,
} from '../../src/store/types.ts';
import { taskAddress } from '../../src/workspace/address.ts';
import { createWorkspace, type StepReport } from '../../src/workspace/create.ts';
import { runDoctor } from '../../src/workspace/doctor.ts';
import { git } from '../../src/workspace/git.ts';
import {
  findStandingProject,
  GROUND_FLOOR,
  GROUND_FLOOR_DIR,
  nextFloor,
  openProject,
  requireGroundFloor,
} from '../../src/workspace/projects.ts';
import { readTasks, resolveOpenTask } from '../../src/workspace/scan.ts';
import { statusReport } from '../../src/workspace/status.ts';
import { closeTask, openTask } from '../../src/workspace/tasks.ts';
import { createWorkspaceWorktree } from '../../src/workspace/worktrees.ts';
import { applyGitTestEnv, makeTempDir, removeDir } from '../helpers.ts';

// -- the reserved number ---------------------------------------------------

test('creation puts the standing project on floor 0, and ordinary floors start at 1', async () => {
  const ws = await freshWorkspace('reserved');
  expect((await findStandingProject(ws))?.dir).toBe(GROUND_FLOOR_DIR);
  expect(await nextFloor(ws)).toBe(1);
  expect((await openProject(ws, 'toolchain')).floor).toBe(1);
  expect((await openProject(ws, 'delivery')).floor).toBe(2);
  expect(await requireGroundFloor(ws)).toBe(GROUND_FLOOR);
});

// The record cannot say the reserved number belongs to anything but the
// standing project: one number, one marker, and they must agree.
const refinements: ReadonlyArray<{ name: string; floor: number; standing?: true; valid: boolean }> =
  [
    { name: 'floor 0 with the marker', floor: 0, standing: true, valid: true },
    { name: 'floor 0 without the marker', floor: 0, valid: false },
    { name: 'an ordinary floor without the marker', floor: 3, valid: true },
    // A standing project on an allocated floor is every 0018–0040 workspace:
    // readable on purpose, so converge can move it and doctor can name it.
    { name: 'the legacy standing floor', floor: 3, standing: true, valid: true },
  ];

for (const { name, floor, standing, valid } of refinements) {
  test(`schema: ${name} ${valid ? 'parses' : 'is refused'}`, () => {
    const record = {
      type: 'project',
      floor,
      slug: 'workspace',
      ...(standing === undefined ? {} : { standing }),
      state: 'active',
      openedAt: '2026-09-05T00:00:00.000Z',
    };
    expect(projectSchema.safeParse(record).success).toBe(valid);
  });
}

// -- converge: establishing and relocating ---------------------------------

test('converge on a pre-0018 workspace establishes floor 0 beside floors 1–5', async () => {
  const ws = await pre0018Workspace('converge-establish', 5);
  expect(await findStandingProject(ws)).toBeUndefined();

  const report = await createWorkspace(ws);
  expect(outcome(report.steps, 'standing project')).toBe('established');
  expect((await findStandingProject(ws))?.record.floor).toBe(GROUND_FLOOR);
  // The ordinary sequence is untouched: the reserved number is not in it.
  expect(await nextFloor(ws)).toBe(6);
  expect((await openProject(ws, 'next-up')).floor).toBe(6);
});

test('converge relocates a floor-1 standing project holding only closed tasks', async () => {
  const ws = await legacyStandingWorkspace('relocate', 1);
  const closed = await openTask(ws, 'old-stewardship', { floor: 1 });
  await closeTask(ws, taskAddress(closed), 'abandoned');

  const report = await createWorkspace(ws);
  expect(outcome(report.steps, 'standing project')).toBe('established');
  expect(detail(report.steps, 'standing project')).toContain('moved from floor 1');

  const standing = await findStandingProject(ws);
  expect(standing?.dir).toBe(GROUND_FLOOR_DIR);
  expect(standing?.record.floor).toBe(GROUND_FLOOR);
  expect(existsSync(join(ws, 'projects/1-workspace'))).toBe(false);
  // The closed task travelled with its floor, and its record says where it is.
  const moved = (await readTasks(ws)).find((task) => task.record.slug === 'old-stewardship');
  expect(moved?.dir).toBe(`${GROUND_FLOOR_DIR}/tasks/t1-old-stewardship`);
  expect(moved?.record.floor).toBe(GROUND_FLOOR);
  expect(taskAddress(moved as { dir: string; record: TaskRecord })).toBe('f0t1');
  // Floor 1 stays retired: monotonic numbers, and the record still says so.
  expect(standing?.record.previousFloor).toBe(1);
  expect(await nextFloor(ws)).toBe(2);
  // The move is one commit, carrying both the old path and the new.
  const committed = git(ws, 'show', '--name-only', '--format=', 'HEAD').stdout;
  expect(committed).toContain(`${GROUND_FLOOR_DIR}/project.md`);
});

test('an open task blocks the move: converge says so, doctor carries the ordered remedy', async () => {
  const ws = await legacyStandingWorkspace('blocked', 1);
  await openTask(ws, 'in-flight', { floor: 1 });

  const report = await createWorkspace(ws);
  expect(outcome(report.steps, 'standing project')).toBe('satisfied');
  expect(detail(report.steps, 'standing project')).toContain('f1t1');
  expect((await findStandingProject(ws))?.record.floor).toBe(1); // exactly as it was

  const finding = (await runDoctor(ws)).workspace.find((f) => f.check === 'standing project');
  expect(finding?.severity).toBe('warn');
  expect(finding?.message).toContain('f1t1 (in-flight)');
  expect(finding?.message).toContain(`Close them, then converge: ward workspace create ${ws}`);
  expect((await runDoctor(ws)).healthy).toBe(true); // report-only: a migration state, not a fault
});

test('a legacy standing floor with nothing open is info, not warn — one command completes it', async () => {
  const ws = await legacyStandingWorkspace('nameable', 4);
  const finding = (await runDoctor(ws)).workspace.find((f) => f.check === 'standing project');
  expect(finding?.severity).toBe('info');
  expect(finding?.message).toContain('the ground floor is floor 0');
  expect(finding?.message).toContain(`ward workspace create ${ws}`);
});

// -- every task lives on a floor -------------------------------------------

test('a task with no floor named opens on the ground floor, worktree path and all', async () => {
  const ws = await freshWorkspace('placement');
  const opened = await openTask(ws, 'a-thing', { floor: await requireGroundFloor(ws) });
  expect(taskAddress(opened)).toBe('f0t1');
  expect(opened.dir).toBe(`${GROUND_FLOOR_DIR}/tasks/t1-a-thing`);
  expect(opened.record.floor).toBe(GROUND_FLOOR);

  const { record: worktree } = await createWorkspaceWorktree(ws, 'f0t1', 'ground-work');
  expect(worktree.path).toBe('worktrees/f0t1-ground-work');
  expect(existsSync(join(ws, worktree.path))).toBe(true);
});

test('with no ground floor the open is refused, never served from the bare pool', async () => {
  const ws = await pre0018Workspace('no-ground-floor', 2);
  expect(requireGroundFloor(ws)).rejects.toThrow(
    `no ground floor — establish it: ward workspace create ${ws}`,
  );
  expect(existsSync(join(ws, 'tasks'))).toBe(true); // reserved, and left empty
  expect((await readTasks(ws)).length).toBe(0);
});

// -- the legacy pool: read, never written ----------------------------------

test('a legacy bare task keeps its address, resolves, lists, and settles', async () => {
  const ws = await freshWorkspace('legacy');
  await seedBareTask(ws, 7, 'from-before', 'active');
  await seedBareTask(ws, 3, 'long-done', 'closed');
  await openTask(ws, 'on-the-ground', { floor: GROUND_FLOOR });

  const bare = (await readTasks(ws)).find((task) => task.record.slug === 'from-before');
  expect(bare?.dir).toBe('tasks/t7-from-before');
  expect(taskAddress(bare as { dir: string; record: TaskRecord })).toBe('t7'); // the FULL address
  expect((await resolveOpenTask(ws, 't7')).record.slug).toBe('from-before');

  const report = await statusReport(ws);
  expect(report.projects[0]?.project.floor).toBe(GROUND_FLOOR); // the ground floor leads
  expect(report.bareTasks.map((task) => task.address)).toEqual(['t7']); // settled t3 is hidden
  expect(report.hidden.tasks).toBe(1);
  expect((await statusReport(ws, { all: true })).bareTasks.map((t) => t.address)).toEqual([
    't7',
    't3',
  ]);

  const finding = (await runDoctor(ws)).workspace.find((f) => f.check === 'legacy bare tasks');
  expect(finding).toMatchObject({ severity: 'info' });
  expect(finding?.message).toContain(
    '2 tasks under tasks/ from before the ground floor (1 still open)',
  );
  expect((await runDoctor(ws)).healthy).toBe(true);
});

test('a workspace with an empty legacy pool says nothing about it', async () => {
  const ws = await freshWorkspace('no-legacy');
  const checks = (await runDoctor(ws)).workspace.map((finding) => finding.check);
  expect(checks).not.toContain('legacy bare tasks');
});

// -- setup ------------------------------------------------------------------

let scratch: string;
let counter = 0;

beforeAll(() => {
  applyGitTestEnv();
  scratch = makeTempDir();
});

afterAll(() => removeDir(scratch));

beforeEach(() => {
  counter += 1;
});

/** A workspace as this build creates it: the ground floor already standing. */
async function freshWorkspace(name: string): Promise<string> {
  const ws = join(scratch, `${name}-${counter}`);
  await createWorkspace(ws);
  return ws;
}

/**
 * A workspace shaped like one created before design/0018: ordinary floors, no
 * standing project at all — the state converge is the migration path for.
 */
async function pre0018Workspace(name: string, floors: number): Promise<string> {
  const ws = await freshWorkspace(name);
  removeDir(join(ws, GROUND_FLOOR_DIR));
  git(ws, 'commit', '-am', 'a workspace from before the standing project');
  for (let floor = 1; floor <= floors; floor += 1) {
    await openProject(ws, `floor-${floor}`);
  }
  return ws;
}

/**
 * A workspace shaped like one created by ward 0018–0040: the standing project
 * marked as it always was, on an allocated floor rather than the reserved one.
 */
async function legacyStandingWorkspace(name: string, floor: number): Promise<string> {
  const ws = await freshWorkspace(name);
  for (let ordinary = 1; ordinary < floor; ordinary += 1) {
    await openProject(ws, `floor-${ordinary}`);
  }
  const dir = `projects/${floor}-workspace`;
  renameSync(join(ws, GROUND_FLOOR_DIR), join(ws, dir));
  const record: ProjectRecord = {
    type: 'project',
    floor,
    slug: 'workspace',
    standing: true,
    state: 'active',
    openedAt: '2026-08-15T00:00:00.000Z',
  };
  await writeDocument(ws, projectRecordType(dir), { data: record, body: 'the standing project' });
  git(ws, 'add', '-A');
  git(ws, 'commit', '-m', `a standing project on floor ${floor}`);
  return ws;
}

/** A bare task written straight into the legacy pool, as an older ward left it. */
async function seedBareTask(
  root: string,
  room: number,
  slug: string,
  state: 'active' | 'closed',
): Promise<void> {
  const dir = `tasks/t${room}-${slug}`;
  mkdirSync(join(root, dir), { recursive: true });
  const record: TaskRecord = {
    type: 'task',
    code: `t${room}`,
    slug,
    state,
    prs: [],
    ...(state === 'closed'
      ? { outcome: 'abandoned' as const, closedAt: '2026-01-01T00:00:00.000Z' }
      : {}),
    openedAt: '2026-01-01T00:00:00.000Z',
  };
  await writeDocument(root, taskRecordType(dir), { data: record, body: 'a task from before' });
}

function outcome(steps: readonly StepReport[], step: string): string | undefined {
  return steps.find((report) => report.step === step)?.outcome;
}

function detail(steps: readonly StepReport[], step: string): string | undefined {
  return steps.find((report) => report.step === step)?.detail;
}
