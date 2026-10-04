// `ward task list` filters (design/0049-task-list-filters/): fetch the rows
// wanted rather than the whole history. Filters AND together and compose with
// --all; `--state closed` reaches settled history on its own; an unmatched
// filter is an empty listing; and `hidden` counts only matching tasks the
// window cut — never the ones the filter excluded on request.
import { afterAll, beforeAll, expect, test } from 'bun:test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { taskListShape } from '../../src/cli/schema.ts';
import { writeDocument } from '../../src/store/document.ts';
import {
  type ProjectRecord,
  projectRecordType,
  type TaskRecord,
  taskRecordType,
} from '../../src/store/types.ts';
import { createWorkspace } from '../../src/workspace/create.ts';
import { applyGitTestEnv, makeTempDir, removeDir, runWard } from '../helpers.ts';

// args → [addresses shown (sorted), hidden.tasks]
const cases: ReadonlyArray<[readonly string[], readonly string[], number]> = [
  [[], ['f2t2', 'f2t3', 'f2t4'], 2], // the unfiltered glance, for reference
  [['--slug', 'upgrade'], ['f2t2'], 2], // a substring: the whole slug family
  [['--slug', 'UPGRADE'], ['f2t2'], 2], // case-insensitive
  [['--slug', 'upgrade', '--all'], ['f2t1', 'f2t2', 'f3t1'], 0], // composes with --all
  [['--slug', 'workspace-upgrade-sessions'], ['f2t2'], 0], // the full slug still pins one
  [['--state', 'closed'], ['f2t1', 'f2t2', 'f3t1'], 0], // closed reaches settled history
  [['--state', 'closed', '--all'], ['f2t1', 'f2t2', 'f3t1'], 0],
  [['--state', 'active'], ['f2t3'], 0], // a settled task is not active: nothing cut
  [['--state', 'paused'], ['f2t4'], 0],
  [['--floor', '3'], [], 1], // the floor's only task settled: empty, and says so
  [['--floor', '3', '--all'], ['f3t1'], 0],
  [['--repo', 'dotfiles'], ['f2t3', 'f2t4'], 0],
  [['--repo', 'ward', '--floor', '2'], ['f2t2', 'f2t3'], 1], // AND
  [['--repo', 'ward', '--floor', '2', '--state', 'closed'], ['f2t1', 'f2t2'], 0],
  [['--slug', 'nope'], [], 0], // unmatched: empty, not an error
  [['--floor', '9'], [], 0],
  [['--repo', 'unregistered'], [], 0], // history may name a repo no longer registered
];

test('each filter row: the tasks shown and what the window cut, as JSON', () => {
  for (const [args, shown, hidden] of cases) {
    const result = runWard(['task', 'list', ...args, '--json'], ws);
    expect(result.exitCode).toBe(0);
    const listing = taskListShape.parse(JSON.parse(result.stdout));
    const addresses = listing.tasks.map((task) => task.address).sort();
    expect({ args, addresses, hidden: listing.hidden }).toEqual({
      args,
      addresses: [...shown],
      hidden: { tasks: hidden, projects: 0, settledAfterDays: 7 },
    });
  }
});

test('the footer keeps the filter, so its one flag shows THIS listing’s hidden rows', () => {
  const result = runWard(['task', 'list', '--slug', 'upgrade'], ws);
  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain('workspace-upgrade-sessions');
  expect(result.stdout).toContain(
    '2 settled tasks hidden (closed more than 7 days ago) — ward task list --slug upgrade --all',
  );
});

test('a filter that matches only settled work prints just the footer', () => {
  const result = runWard(['task', 'list', '--floor', '3'], ws);
  expect(result.exitCode).toBe(0);
  expect(result.stdout).not.toContain('no tasks');
  expect(result.stdout).toContain('1 settled task hidden');
  expect(result.stdout).toContain('ward task list --floor 3 --all');
});

test('an unmatched filter says so, naming the filter, and exits zero', () => {
  const result = runWard(['task', 'list', '--slug', 'nope', '--repo', 'ward'], ws);
  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain('no tasks match --slug nope --repo ward');
  expect(result.stdout).not.toContain('open one with');
});

test('a state outside the three is optique’s refusal, not an empty list', () => {
  const result = runWard(['task', 'list', '--state', 'open'], ws);
  expect(result.exitCode).not.toBe(0);
  expect(result.stdout).toBe('');
});

// -- setup ----------------------------------------------------------------
// Records written directly so the closes can be dated. Floor 2 holds a slug
// family across an old close and a fresh one, an active task, and a paused
// one; floor 3's only task settled long ago.

let scratch: string;
let ws: string;

const now = Date.now();
const daysAgo = (days: number) => new Date(now - days * 24 * 60 * 60 * 1000).toISOString();

beforeAll(async () => {
  applyGitTestEnv();
  scratch = makeTempDir();
  ws = join(scratch, 'ws');
  await createWorkspace(ws);

  await seedProject(ws, 2, 'in-progress');
  await seedTask(ws, 2, 'in-progress', 1, 'workspace-upgrade', {
    state: 'closed',
    closedAt: daysAgo(30),
    repositories: ['ward'],
  });
  await seedTask(ws, 2, 'in-progress', 2, 'workspace-upgrade-sessions', {
    state: 'closed',
    closedAt: daysAgo(2),
    repositories: ['ward'],
  });
  await seedTask(ws, 2, 'in-progress', 3, 'in-flight', {
    state: 'active',
    repositories: ['ward', 'dotfiles'],
  });
  await seedTask(ws, 2, 'in-progress', 4, 'parked', {
    state: 'paused',
    repositories: ['dotfiles'],
  });

  await seedProject(ws, 3, 'done-with');
  await seedTask(ws, 3, 'done-with', 1, 'workspace-upgrade', {
    state: 'closed',
    closedAt: daysAgo(21),
  });
});

afterAll(() => removeDir(scratch));

async function seedProject(root: string, floor: number, slug: string): Promise<void> {
  const dir = `projects/${floor}-${slug}`;
  mkdirSync(join(root, dir), { recursive: true });
  const record: ProjectRecord = {
    type: 'project',
    floor,
    slug,
    state: 'active',
    openedAt: daysAgo(60),
  };
  await writeDocument(root, projectRecordType(dir), { data: record, body: 'seeded' });
}

async function seedTask(
  root: string,
  floor: number,
  project: string,
  room: number,
  slug: string,
  {
    state,
    closedAt,
    repositories,
  }: { state: TaskRecord['state']; closedAt?: string; repositories?: string[] },
): Promise<void> {
  const dir = `projects/${floor}-${project}/tasks/t${room}-${slug}`;
  mkdirSync(join(root, dir), { recursive: true });
  const record: TaskRecord = {
    type: 'task',
    code: `t${room}`,
    slug,
    state,
    floor,
    prs: [],
    openedAt: daysAgo(45),
    ...(repositories === undefined ? {} : { repositories }),
    ...(closedAt === undefined ? {} : { outcome: 'delivered' as const, closedAt }),
  };
  await writeDocument(root, taskRecordType(dir), { data: record, body: 'seeded' });
}
