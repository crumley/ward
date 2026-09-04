// The settled-work window (design/0036-floor-addressed-tasks/): the glanceable
// surfaces carry what is in flight plus what closed recently, say what they
// left out, and hand back everything under `--all`. Plus the rendering the
// window pairs with — an open task named by its address, a closed one by its
// slug and the day it closed, open before closed within a container.
import { afterAll, beforeAll, expect, test } from 'bun:test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { writeDocument } from '../../src/store/document.ts';
import {
  type ProjectRecord,
  projectRecordType,
  type TaskRecord,
  taskRecordType,
} from '../../src/store/types.ts';
import { createWorkspace } from '../../src/workspace/create.ts';
import { applyGitTestEnv, makeTempDir, removeDir, runWard } from '../helpers.ts';

test('status: the open task by address, the recent close by slug, the old close gone', () => {
  const result = runWard(['status'], ws);
  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain('f2t3 in-flight [active]'); // open: named by its address
  expect(result.stdout).toContain(`· just-landed [closed · delivered · ${recently.slice(0, 10)}]`);
  expect(result.stdout).not.toContain('long-settled'); // closed 30 days ago
  expect(result.stdout).not.toContain('floor 3'); // a floor whose every task settled
  // The room of a closed task is never printed: it names whoever holds it next.
  expect(result.stdout).not.toContain('t2 just-landed');
});

test('status: open work sorts above closed work within a floor', () => {
  const lines = runWard(['status'], ws).stdout.split('\n');
  const open = lines.findIndex((line) => line.includes('in-flight'));
  const closed = lines.findIndex((line) => line.includes('just-landed'));
  expect(open).toBeGreaterThan(-1);
  expect(closed).toBeGreaterThan(open);
});

test('status: the footer says what was hidden, why, and the one flag that shows it', () => {
  const result = runWard(['status'], ws);
  expect(result.stdout).toContain(
    '2 settled tasks and 1 settled floor hidden (closed more than 7 days ago) — ward status --all',
  );
});

test('status --all: the window lifted, nothing hidden, no footer', () => {
  const result = runWard(['status', '--all'], ws);
  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain('long-settled');
  expect(result.stdout).toContain('floor 3');
  expect(result.stdout).not.toContain('hidden (closed more than');
});

test('status --json: the same filter, and a hidden summary that is never absent', () => {
  const windowed = JSON.parse(runWard(['status', '--json'], ws).stdout);
  expect(windowed.hidden).toEqual({ tasks: 2, projects: 1, settledAfterDays: 7 });
  const floor2 = windowed.projects.find((p: { floor: number }) => p.floor === 2);
  expect(floor2.tasks.map((t: { address: string }) => t.address)).toEqual(['f2t3', 'f2t2']);
  // The record is the record: a closed task still carries code and address.
  expect(floor2.tasks[1]).toMatchObject({ code: 't2', address: 'f2t2', state: 'closed' });

  const all = JSON.parse(runWard(['status', '--all', '--json'], ws).stdout);
  expect(all.hidden).toEqual({ tasks: 0, projects: 0, settledAfterDays: 7 });
  expect(all.projects.length).toBe(3);
});

test('task list and project list carry the same window and the same flag', () => {
  const listing = JSON.parse(runWard(['task', 'list', '--json'], ws).stdout);
  expect(listing.hidden).toEqual({ tasks: 2, projects: 0, settledAfterDays: 7 });
  expect(listing.tasks.map((t: { address: string }) => t.address)).toEqual(['f2t3', 'f2t2']);

  const projects = JSON.parse(runWard(['project', 'list', '--json'], ws).stdout);
  expect(projects.hidden).toEqual({ tasks: 1, projects: 1, settledAfterDays: 7 });
  expect(projects.projects.map((p: { floor: number }) => p.floor)).toEqual([1, 2]);

  const human = runWard(['project', 'list'], ws);
  expect(human.stdout).toContain(
    '1 settled task and 1 settled floor hidden (closed more than 7 days ago) — ' +
      'ward project list --all',
  );
  expect(runWard(['project', 'list', '--all'], ws).stdout).toContain('floor 3 — done-with');
});

test('a settled task is still addressable in the record, just not on the glance', () => {
  const all = JSON.parse(runWard(['task', 'list', '--all', '--json'], ws).stdout);
  expect(all.hidden).toEqual({ tasks: 0, projects: 0, settledAfterDays: 7 });
  expect(all.tasks.map((t: { address: string }) => t.address).sort()).toEqual([
    'f2t1',
    'f2t2',
    'f2t3',
    'f3t1',
  ]);
});

// -- setup ----------------------------------------------------------------
// One workspace, written directly as records so the closes can be dated: a
// floor with an open task, a fresh close, and an old one; a second floor whose
// only task closed long ago; and the standing project, which never settles.

let scratch: string;
let ws: string;

const now = Date.now();
const daysAgo = (days: number) => new Date(now - days * 24 * 60 * 60 * 1000).toISOString();
/** Inside the window: a close the human still wants on the glance. */
const recently = daysAgo(2);

beforeAll(async () => {
  applyGitTestEnv();
  scratch = makeTempDir();
  ws = join(scratch, 'ws');
  await createWorkspace(ws);

  await seedProject(ws, 2, 'in-progress');
  await seedTask(ws, 2, 1, 'long-settled', { closedAt: daysAgo(30) });
  await seedTask(ws, 2, 2, 'just-landed', { closedAt: recently });
  await seedTask(ws, 2, 3, 'in-flight', {});

  await seedProject(ws, 3, 'done-with');
  await seedTask(ws, 3, 1, 'wrapped-up', { closedAt: daysAgo(21) });
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

/** A task written straight into its floor, with its close dated by the case. */
async function seedTask(
  root: string,
  floor: number,
  room: number,
  slug: string,
  { closedAt }: { closedAt?: string },
): Promise<void> {
  const dir = `projects/${floor}-${floor === 2 ? 'in-progress' : 'done-with'}/tasks/t${room}-${slug}`;
  mkdirSync(join(root, dir), { recursive: true });
  const record: TaskRecord = {
    type: 'task',
    code: `t${room}`,
    slug,
    state: closedAt === undefined ? 'active' : 'closed',
    floor,
    prs: [],
    openedAt: daysAgo(45),
    ...(closedAt === undefined ? {} : { outcome: 'delivered' as const, closedAt }),
  };
  await writeDocument(root, taskRecordType(dir), { data: record, body: 'seeded' });
}
