// worktree rebase at the CLI (design/0011-worktree-rebase/): TASK is inferred
// for a human standing inside a claimed worktree (echoed, per 0006), a
// declared agent is refused the inference, a conflict exits 1 with the honest
// per-worktree report, and a dirty refusal keeps repo refresh's exit posture.
// Proven through the spawned CLI against local bare remotes.
import { afterAll, beforeAll, beforeEach, expect, test } from 'bun:test';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gitOrThrow } from '../../src/workspace/git.ts';
import { GROUND_FLOOR } from '../../src/workspace/projects.ts';
import { addRepository } from '../../src/workspace/repos.ts';
import { openTask } from '../../src/workspace/tasks.ts';
import { createWorktree } from '../../src/workspace/worktrees.ts';
import { applyGitTestEnv, callWard, callWardEnv, makeTempDir, removeDir } from '../helpers.ts';
import { preparedRemote, preparedWorkspace } from '../prepared.ts';

test('inferred inside the worktree: the echoed task, then the per-worktree report', async () => {
  advanceRemote('advance.txt', 'main moved\n');
  const result = await callWard(['worktree', 'rebase'], wtDir);
  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain('task f0t1 — from the working directory');
  expect(result.stdout).toContain('rebased');
  expect(result.stdout).toContain('floors/0-workspace/f0t1-feature');
});

test('a declared agent is refused the inference; with an explicit code it proceeds', async () => {
  const refused = await callWardEnv(['worktree', 'rebase'], wtDir, { WARD_AGENT: '1' });
  expect(refused.exitCode).toBe(1);
  expect(refused.stderr).toContain('a declared agent passes scope explicitly');
  expect(refused.stderr).toContain('ward worktree rebase ADDRESS');

  const explicit = await callWardEnv(['worktree', 'rebase', 't1'], wtDir, { WARD_AGENT: '1' });
  expect(explicit.exitCode).toBe(0);
  expect(explicit.stdout).toContain('current');
  expect(explicit.stdout).not.toContain('from the working directory');
});

test('an explicit code works from anywhere, with nothing echoed; repeating is current', async () => {
  advanceRemote('advance.txt', 'main moved\n');
  const first = await callWard(['worktree', 'rebase', 't1'], ws);
  expect(first.exitCode).toBe(0);
  expect(first.stdout).toContain('rebased');
  expect(first.stdout).not.toContain('from the working directory');
  const again = await callWard(['worktree', 'rebase', 't1'], ws);
  expect(again.exitCode).toBe(0);
  expect(again.stdout).toContain('already atop origin/main');
});

test('a conflict exits 1 and reports what conflicted', async () => {
  writeFileSync(join(wtDir, 'src', 'lib.ts'), 'export const ours = true;\n');
  gitOrThrow(wtDir, 'add', '-A');
  gitOrThrow(wtDir, 'commit', '-m', 'ours');
  advanceRemote('src/lib.ts', 'export const theirs = true;\n');

  const result = await callWard(['worktree', 'rebase', 't1'], ws);
  expect(result.exitCode).toBe(1);
  expect(result.stdout).toContain('conflict');
  expect(result.stdout).toContain('src/lib.ts');
  expect(result.stdout).toContain('exactly as it was');
});

test('a dirty worktree is a respected refusal, not a failure — exit 0', async () => {
  writeFileSync(join(wtDir, 'src', 'lib.ts'), 'unrecorded work\n');
  const result = await callWard(['worktree', 'rebase', 't1'], ws);
  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain('dirty');
  expect(result.stdout).toContain('refusing to touch it');
});

test('a task with no worktrees says so and succeeds', async () => {
  await openTask(ws, 'bare', { floor: GROUND_FLOOR });
  const result = await callWard(['worktree', 'rebase', 't2'], ws);
  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain('no worktrees on task f0t2');
});

// -- setup ----------------------------------------------------------------
// A fresh workspace per test (the verbs mutate) with one registered
// repository `demo` on branch `main` and one bare task t1 `feature` whose
// worktree is floors/0-workspace/f0t1-feature.

let scratch: string;
let remote: string;
let ws: string;
let wtDir: string;
let caseId = 0;

function advanceRemote(file: string, content: string): void {
  const stage = join(scratch, `stage-${caseId}-${file.replaceAll('/', '-')}`);
  gitOrThrow('.', 'clone', remote, stage);
  writeFileSync(join(stage, file), content);
  gitOrThrow(stage, 'add', '-A');
  gitOrThrow(stage, 'commit', '-m', `advance main: ${file}`);
  gitOrThrow(stage, 'push', 'origin', 'main');
}

beforeAll(() => {
  applyGitTestEnv();
  scratch = makeTempDir();
});

beforeEach(async () => {
  caseId += 1;
  ws = join(scratch, `ws-${caseId}`);
  await preparedWorkspace(ws);
  remote = join(scratch, `remote-${caseId}.git`);
  preparedRemote(remote, { branch: 'main', files: { 'src/lib.ts': 'export {};\n' } });
  await addRepository(ws, remote, 'demo');
  await openTask(ws, 'feature', { floor: GROUND_FLOOR });
  const { record } = await createWorktree(ws, 't1', 'demo');
  wtDir = join(ws, record.path);
});

afterAll(() => {
  removeDir(scratch);
});
