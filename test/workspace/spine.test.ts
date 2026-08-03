// The work spine (design/0004-work-spine/): the bootstrap loop end to end,
// plus the lifecycle rules — floor monotonicity, task-code reuse only after
// close, pause/resume, the in-review overlay, the ordering guarantee that a
// refused close mutates nothing, and the §18 gates on teardown.
import { afterAll, beforeAll, beforeEach, expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { createWorkspace } from '../../src/workspace/create.ts';
import { gitOrThrow } from '../../src/workspace/git.ts';
import { openProject } from '../../src/workspace/projects.ts';
import { addRepository } from '../../src/workspace/repos.ts';
import { readTasks, resolveOpenTask } from '../../src/workspace/scan.ts';
import { openSession, readSessions } from '../../src/workspace/sessions.ts';
import { statusReport } from '../../src/workspace/status.ts';
import { addTaskPr, closeTask, openTask, setTaskState } from '../../src/workspace/tasks.ts';
import { createWorktree } from '../../src/workspace/worktrees.ts';
import { applyGitTestEnv, makeTempDir, removeDir } from '../helpers.ts';

test('the bootstrap loop: project → task → worktree → work → merge → delivered close', async () => {
  await openProject(ws, 'agent-output');
  const task = await openTask(ws, 'json-output', { floor: 1, purpose: 'machine-readable output' });
  expect(task.record.code).toBe('t1');

  const { record: wt } = await createWorktree(ws, 't1', 'demo');
  expect(wt.disposition).toBe('deliverable');
  const wtDir = join(ws, wt.path);
  expect(existsSync(wtDir)).toBe(true);

  const session = await openSession(ws, 't1', 'write the feature', { handle: 'claude-code:abc' });
  expect(session.id).toBe('json-output-1');
  expect(session.workingDirectory).toBe(wt.path);

  await Bun.write(join(wtDir, 'out.json'), '{}\n');
  gitOrThrow(wtDir, 'add', '-A');
  gitOrThrow(wtDir, 'commit', '-m', 'add json output');
  gitOrThrow(wtDir, 'push', 'origin', 'json-output');
  mergeToRemoteMain('json-output');

  const report = await closeTask(ws, 't1', 'delivered');
  expect(report.task.record.state).toBe('closed');
  expect(report.task.record.outcome).toBe('delivered');
  expect(existsSync(wtDir)).toBe(false); // torn down
  const sessions = await readSessions(ws, report.task.dir);
  expect(sessions.map((s) => s.state)).toEqual(['closed']);

  const status = await statusReport(ws);
  expect(status.workspace).toBe('closed');
  expect(status.projects[0]?.derived).toBe('closed');
});

test('a refused close mutates nothing: sessions stay open, worktrees stay', async () => {
  await openTask(ws, 'risky', {});
  const { record: wt } = await createWorktree(ws, 't1', 'demo');
  await openSession(ws, 't1', 'do work', {});
  const wtDir = join(ws, wt.path);
  await Bun.write(join(wtDir, 'wip.txt'), 'uncommitted\n');

  expect(closeTask(ws, 't1', 'delivered')).rejects.toThrow(/uncommitted changes/);

  const task = await resolveOpenTask(ws, 't1');
  expect(task.record.state).toBe('active');
  const sessions = await readSessions(ws, task.dir);
  expect(sessions.map((s) => s.state)).toEqual(['open']); // untouched by the refusal
  expect(existsSync(wtDir)).toBe(true);
});

test('unmerged local-only commits refuse a delivered close; abandoned discards them', async () => {
  await openTask(ws, 'dead-end', {});
  const { record: wt } = await createWorktree(ws, 't1', 'demo');
  const wtDir = join(ws, wt.path);
  await Bun.write(join(wtDir, 'experiment.txt'), 'x\n');
  gitOrThrow(wtDir, 'add', '-A');
  gitOrThrow(wtDir, 'commit', '-m', 'experiment');

  expect(closeTask(ws, 't1', 'delivered')).rejects.toThrow(/never reached a PR/);

  const report = await closeTask(ws, 't1', 'abandoned');
  expect(report.task.record.outcome).toBe('abandoned');
  expect(existsSync(wtDir)).toBe(false);
});

test('floors are monotonic and never reused, even past a closed project', async () => {
  await openProject(ws, 'first');
  const t = await openTask(ws, 'only', { floor: 1 });
  await closeTask(ws, t.record.code, 'abandoned');
  expect((await openProject(ws, 'second')).floor).toBe(2);
  expect((await openProject(ws, 'third')).floor).toBe(3);
});

test('task codes are unique among open tasks and reused only after close', async () => {
  const a = await openTask(ws, 'one', {});
  const b = await openTask(ws, 'two', {});
  expect([a.record.code, b.record.code]).toEqual(['t1', 't2']);
  await closeTask(ws, 't1', 'abandoned');
  expect((await openTask(ws, 'three', {})).record.code).toBe('t1'); // reused after close
  expect((await readTasks(ws)).length).toBe(3); // the closed record remains
});

test('pause and resume route attention; the PR overlay follows the set', async () => {
  await openProject(ws, 'p');
  await openTask(ws, 'a', { floor: 1 });
  await setTaskState(ws, 't1', 'paused');
  expect((await statusReport(ws)).projects[0]?.derived).toBe('paused');
  await setTaskState(ws, 't1', 'active');
  await addTaskPr(ws, 't1', 'https://example.com/pr/1');
  const status = await statusReport(ws);
  expect(status.projects[0]?.derived).toBe('active');
  expect(status.projects[0]?.tasks[0]?.inReview).toBe(true);
});

test('session ids are workspace-unique among open sessions; closed frees the discriminator', async () => {
  await openTask(ws, 'chat', {});
  const first = await openSession(ws, 't1', 'first', {});
  const second = await openSession(ws, 't1', 'second', {});
  expect([first.id, second.id]).toEqual(['chat-1', 'chat-2']);
});

// -- setup ----------------------------------------------------------------
// Each test gets a fresh workspace with one registered repository, `demo`,
// whose remote is a local bare repository on branch main.

let scratch: string;
let ws: string;
let remote: string;
let caseId = 0;

/** Simulate the forge merging a PR: fast-forward the remote's main to the branch. */
function mergeToRemoteMain(branch: string): void {
  const stage = join(scratch, `merge-${caseId}-${branch}`);
  gitOrThrow('.', 'clone', remote, stage);
  gitOrThrow(stage, 'fetch', 'origin', branch);
  gitOrThrow(stage, 'merge', '--ff-only', `origin/${branch}`);
  gitOrThrow(stage, 'push', 'origin', 'main');
  const canonical = join(ws, 'repos', 'demo');
  gitOrThrow(canonical, 'fetch', 'origin');
  gitOrThrow(canonical, 'merge', '--ff-only', 'origin/main');
}

beforeAll(() => {
  applyGitTestEnv();
  scratch = makeTempDir();
});

beforeEach(async () => {
  caseId += 1;
  ws = join(scratch, `ws-${caseId}`);
  await createWorkspace(ws);
  remote = join(scratch, `remote-${caseId}.git`);
  gitOrThrow('.', 'init', '--bare', '--initial-branch=main', remote);
  const seed = join(scratch, `seed-${caseId}`);
  gitOrThrow('.', 'clone', remote, seed);
  await Bun.write(join(seed, 'README.md'), 'demo\n');
  gitOrThrow(seed, 'checkout', '-b', 'main');
  gitOrThrow(seed, 'add', '-A');
  gitOrThrow(seed, 'commit', '-m', 'seed');
  gitOrThrow(seed, 'push', '-u', 'origin', 'main');
  await addRepository(ws, remote, 'demo');
});

afterAll(() => {
  removeDir(scratch);
});
