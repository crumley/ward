// Scope inference at the CLI (design/0006-scope-from-cwd/): a human standing
// inside a claimed worktree drives the task-addressed verbs without naming
// the task, and the derivation is echoed; anywhere else the missing code is a
// deterministic error naming the fix; a declared agent is refused the
// inference outright (the §8 asymmetry); an explicit code always wins; and
// `task close` always takes one. Proven through the spawned CLI.
import { afterAll, beforeAll, beforeEach, expect, test } from 'bun:test';
import { join } from 'node:path';
import { createWorkspace } from '../../src/workspace/create.ts';
import { gitOrThrow } from '../../src/workspace/git.ts';
import { addRepository } from '../../src/workspace/repos.ts';
import { readSessions } from '../../src/workspace/sessions.ts';
import { openTask } from '../../src/workspace/tasks.ts';
import { createWorktree } from '../../src/workspace/worktrees.ts';
import { applyGitTestEnv, makeTempDir, removeDir, runWard, runWardEnv } from '../helpers.ts';

const PR_URL = 'https://example.com/pr/6';

test('session open, inferred: the echoed task, and the worktree as the recorded directory', async () => {
  const result = runWard(['session', 'open', '--purpose', 'drive the feature'], wtDir);
  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain('task t1 — from the working directory');
  expect(result.stdout).toContain('opened session feature-1');
  const sessions = await readSessions(ws, 'tasks/t1-feature');
  expect(sessions[0]?.workingDirectory).toBe('worktrees/t1-feature');
});

test('task pr, inferred: one argument is the URL, the task comes from the location', () => {
  const result = runWard(['task', 'pr', PR_URL], join(wtDir, 'src'));
  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain('task t1 — from the working directory');
  expect(result.stdout).toContain(`linked ${PR_URL}`);
  const tasks = JSON.parse(runWard(['task', 'list', '--json'], ws).stdout);
  expect(tasks[0].prs).toEqual([PR_URL]);
});

test('task pr keeps its explicit two-argument form', () => {
  const result = runWard(['task', 'pr', 't1', PR_URL], ws);
  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain(`linked ${PR_URL}`);
  expect(result.stdout).not.toContain('from the working directory');
});

test('pause and resume, inferred from inside the worktree', () => {
  const paused = runWard(['task', 'pause'], wtDir);
  expect(paused.exitCode).toBe(0);
  expect(paused.stdout).toContain('paused t1 — feature');
  const resumed = runWard(['task', 'resume'], wtDir);
  expect(resumed.exitCode).toBe(0);
  expect(resumed.stdout).toContain('resumed t1 — feature');
});

test('worktree create, inferred: a second worktree for the task the caller stands in', () => {
  const result = runWard(['worktree', 'create', '--repo', 'demo', '--branch', 'second'], wtDir);
  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain('task t1 — from the working directory');
  expect(result.stdout).toContain('created worktrees/t1-second');
  const worktrees = JSON.parse(runWard(['worktree', 'list', '--json'], ws).stdout);
  expect(worktrees.map((w: { task: string; branch: string }) => `${w.task}:${w.branch}`)).toEqual([
    't1:feature',
    't1:second',
  ]);
});

test('outside any claimed worktree, the missing code is a legible error naming the fix', () => {
  const result = runWard(['task', 'pause'], ws);
  expect(result.exitCode).toBe(1);
  expect(result.stderr).toContain('no task worktree encloses this directory');
  expect(result.stderr).toContain('ward task pause CODE');
});

test('a declared agent is refused the inference, even standing inside the worktree', () => {
  const result = runWardEnv(['task', 'pause'], wtDir, { WARD_AGENT: '1' });
  expect(result.exitCode).toBe(1);
  expect(result.stderr).toContain('a declared agent passes scope explicitly');
  expect(result.stderr).toContain('ward task pause CODE');
});

test('a declared agent with an explicit code proceeds as ever', () => {
  const result = runWardEnv(['task', 'pause', 't1'], wtDir, { WARD_AGENT: '1' });
  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain('paused t1 — feature');
});

test('an explicit code wins from anywhere, with nothing echoed', () => {
  const result = runWard(['task', 'pause', 't1'], ws);
  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain('paused t1 — feature');
  expect(result.stdout).not.toContain('from the working directory');
});

test('task close always takes its code: without one it fails and mutates nothing', () => {
  const result = runWard(['task', 'close'], wtDir);
  expect(result.exitCode).not.toBe(0);
  const tasks = JSON.parse(runWard(['task', 'list', '--json'], ws).stdout);
  expect(tasks[0].state).toBe('active');
});

// -- setup ----------------------------------------------------------------
// A shared remote; a fresh workspace per test (the verbs mutate), each with
// one registered repository `demo` and one bare task t1 `feature` whose
// worktree is `worktrees/t1-feature`.

let scratch: string;
let remote: string;
let ws: string;
let wtDir: string;
let caseId = 0;

beforeAll(async () => {
  applyGitTestEnv();
  scratch = makeTempDir();
  remote = join(scratch, 'remote.git');
  gitOrThrow('.', 'init', '--bare', '--initial-branch=main', remote);
  const seed = join(scratch, 'seed');
  gitOrThrow('.', 'clone', remote, seed);
  await Bun.write(join(seed, 'src', 'lib.ts'), 'export {};\n');
  gitOrThrow(seed, 'checkout', '-b', 'main');
  gitOrThrow(seed, 'add', '-A');
  gitOrThrow(seed, 'commit', '-m', 'seed');
  gitOrThrow(seed, 'push', '-u', 'origin', 'main');
});

beforeEach(async () => {
  caseId += 1;
  ws = join(scratch, `ws-${caseId}`);
  await createWorkspace(ws);
  await addRepository(ws, remote, 'demo');
  await openTask(ws, 'feature', {});
  const { record } = await createWorktree(ws, 't1', 'demo');
  wtDir = join(ws, record.path);
});

afterAll(() => {
  removeDir(scratch);
});
