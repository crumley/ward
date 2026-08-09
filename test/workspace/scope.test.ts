// Scope from the working directory (design/0006-scope-from-cwd/): a cwd at or
// below a worktree that a non-closed task's record claims resolves to that
// task; every other location — the workspace root, the record tree, a closed
// task's stale path, anywhere outside — resolves to nothing. Resolution is a
// pure read: the table runs against one shared workspace.
import { afterAll, beforeAll, expect, test } from 'bun:test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createWorkspace } from '../../src/workspace/create.ts';
import { gitOrThrow } from '../../src/workspace/git.ts';
import { addRepository } from '../../src/workspace/repos.ts';
import { scopeFromCwd } from '../../src/workspace/scope.ts';
import { closeTask, openTask } from '../../src/workspace/tasks.ts';
import { createWorktree } from '../../src/workspace/worktrees.ts';
import { applyGitTestEnv, makeTempDir, removeDir } from '../helpers.ts';

const rows: readonly { name: string; dir: () => string; task: string | null }[] = [
  {
    name: "a worktree's root resolves to its task",
    dir: () => join(ws, 'worktrees/t1-feature'),
    task: 't1',
  },
  {
    name: 'a directory nested deep inside a worktree resolves the same',
    dir: () => join(ws, 'worktrees/t1-feature/deep/down'),
    task: 't1',
  },
  {
    name: "a second task's worktree resolves to the second task",
    dir: () => join(ws, 'worktrees/t2-other'),
    task: 't2',
  },
  { name: 'the workspace root implies no task', dir: () => ws, task: null },
  {
    name: 'the record tree is not the worktree it describes',
    dir: () => join(ws, 'tasks/t1-feature/worktrees'),
    task: null,
  },
  {
    name: 'a sibling under worktrees/ that no record claims',
    dir: () => join(ws, 'worktrees/unclaimed'),
    task: null,
  },
  {
    name: "a closed task's stale record claims nothing, even if the directory returns",
    dir: () => join(ws, 'worktrees/t3-gone'),
    task: null,
  },
  { name: 'a directory outside the workspace implies no task', dir: () => outside, task: null },
];

for (const row of rows) {
  test(row.name, async () => {
    const scope = await scopeFromCwd(ws, row.dir());
    expect(scope?.task.record.code ?? null).toBe(row.task);
  });
}

test('the resolved scope carries the claiming worktree record', async () => {
  const scope = await scopeFromCwd(ws, join(ws, 'worktrees/t1-feature/deep/down'));
  expect(scope?.worktree.path).toBe('worktrees/t1-feature');
  expect(scope?.worktree.repo).toBe('demo');
  expect(scope?.task.record.slug).toBe('feature');
});

// -- setup ----------------------------------------------------------------
// One workspace with a registered repository and three tasks: t1 and t2 open
// with worktrees, t3 closed after its worktree existed — its directory is
// recreated by hand to prove a stale record claims nothing.

let scratch: string;
let ws: string;
let outside: string;

beforeAll(async () => {
  applyGitTestEnv();
  scratch = makeTempDir();
  ws = join(scratch, 'ws');
  outside = join(scratch, 'elsewhere');
  mkdirSync(outside, { recursive: true });
  await createWorkspace(ws);

  const remote = join(scratch, 'remote.git');
  gitOrThrow('.', 'init', '--bare', '--initial-branch=main', remote);
  const seed = join(scratch, 'seed');
  gitOrThrow('.', 'clone', remote, seed);
  await Bun.write(join(seed, 'README.md'), 'demo\n');
  gitOrThrow(seed, 'checkout', '-b', 'main');
  gitOrThrow(seed, 'add', '-A');
  gitOrThrow(seed, 'commit', '-m', 'seed');
  gitOrThrow(seed, 'push', '-u', 'origin', 'main');
  await addRepository(ws, remote, 'demo');

  await openTask(ws, 'feature', {});
  await createWorktree(ws, 't1', 'demo');
  await openTask(ws, 'other', {});
  await createWorktree(ws, 't2', 'demo', 'other');
  await openTask(ws, 'gone', {});
  await createWorktree(ws, 't3', 'demo', 'gone');
  await closeTask(ws, 't3', 'abandoned');
  mkdirSync(join(ws, 'worktrees/t3-gone'), { recursive: true });
  mkdirSync(join(ws, 'worktrees/t1-feature/deep/down'), { recursive: true });
});

afterAll(() => {
  removeDir(scratch);
});
