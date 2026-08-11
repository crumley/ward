// Worktree rebase (design/0011-worktree-rebase/): a task's worktrees are
// brought up to date with their repository's main line by rebase — the
// canonical checkout refreshes first, a dirty tree is never touched, a
// conflict aborts and leaves the worktree exactly as found, and no workspace
// record changes. Remotes are local bare repositories — no network.
import { afterAll, beforeAll, beforeEach, expect, test } from 'bun:test';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createWorkspace } from '../../src/workspace/create.ts';
import { git, gitOrThrow } from '../../src/workspace/git.ts';
import { addRepository, checkoutPath } from '../../src/workspace/repos.ts';
import { openTask } from '../../src/workspace/tasks.ts';
import { createWorktree, rebaseTaskWorktrees } from '../../src/workspace/worktrees.ts';
import { applyGitTestEnv, makeTempDir, removeDir } from '../helpers.ts';

test('rebases onto a moved main line, refreshing the canonical checkout first', async () => {
  commitInWorktree('own.txt', 'the task work\n');
  commitToRemote('advance.txt', 'main moved\n');
  const wsHead = git(ws, 'rev-parse', 'HEAD').stdout;

  const { reports } = await rebaseTaskWorktrees(ws, 't1');
  expect(reports.map((r) => r.outcome)).toEqual(['rebased']);
  expect(reports[0]?.detail).toContain('onto origin/main');
  expect(reports[0]?.detail).not.toContain('force-with-lease'); // never published, nothing to push
  // The branch's own commit rides atop the new tip; both files present.
  expect(existsSync(join(wt, 'advance.txt'))).toBe(true);
  expect(existsSync(join(wt, 'own.txt'))).toBe(true);
  expect(git(wt, 'merge-base', '--is-ancestor', 'origin/main', 'HEAD').exitCode).toBe(0);
  expect(git(wt, 'rev-list', '--count', 'origin/main..HEAD').stdout.trim()).toBe('1');
  // Refresh-first: the canonical checkout learned the tip too.
  expect(existsSync(join(checkoutPath(ws, 'demo'), 'advance.txt'))).toBe(true);
  // No workspace record mutates: same record, no new commit, nothing staged.
  expect(git(ws, 'rev-parse', 'HEAD').stdout).toBe(wsHead);
  expect(git(ws, 'status', '--porcelain').stdout).toBe('');
});

test('already up to date says so and repeats cleanly — idempotent', async () => {
  const first = await rebaseTaskWorktrees(ws, 't1');
  expect(first.reports.map((r) => r.outcome)).toEqual(['current']);
  expect(first.reports[0]?.detail).toContain('already atop origin/main');

  commitToRemote('advance.txt', 'main moved\n');
  expect((await rebaseTaskWorktrees(ws, 't1')).reports.map((r) => r.outcome)).toEqual(['rebased']);
  const head = git(wt, 'rev-parse', 'HEAD').stdout;
  const again = await rebaseTaskWorktrees(ws, 't1');
  expect(again.reports.map((r) => r.outcome)).toEqual(['current']);
  expect(git(wt, 'rev-parse', 'HEAD').stdout).toBe(head); // repeat changed nothing
});

test('a dirty worktree is refused and left untouched — the fail-safe', async () => {
  await Bun.write(join(wt, 'src', 'lib.ts'), 'unrecorded work\n');
  commitToRemote('advance.txt', 'main moved\n');

  const { reports } = await rebaseTaskWorktrees(ws, 't1');
  expect(reports.map((r) => r.outcome)).toEqual(['dirty']);
  expect(reports[0]?.detail).toContain('uncommitted changes');
  expect(await Bun.file(join(wt, 'src', 'lib.ts')).text()).toBe('unrecorded work\n');
  expect(existsSync(join(wt, 'advance.txt'))).toBe(false); // no rebase happened
});

test('a conflict aborts and leaves the worktree exactly as it was found', async () => {
  commitInWorktree('src/lib.ts', 'export const ours = true;\n');
  commitToRemote('src/lib.ts', 'export const theirs = true;\n');
  const head = git(wt, 'rev-parse', 'HEAD').stdout;

  const { reports } = await rebaseTaskWorktrees(ws, 't1');
  expect(reports.map((r) => r.outcome)).toEqual(['conflict']);
  expect(reports[0]?.detail).toContain('src/lib.ts'); // what conflicted, named honestly
  expect(reports[0]?.detail).toContain('aborted');
  // Exactly as found: same HEAD, same branch, same content, clean, no rebase in flight.
  expect(git(wt, 'rev-parse', 'HEAD').stdout).toBe(head);
  expect(git(wt, 'symbolic-ref', '--short', 'HEAD').stdout.trim()).toBe('feature');
  expect(await Bun.file(join(wt, 'src', 'lib.ts')).text()).toBe('export const ours = true;\n');
  expect(git(wt, 'status', '--porcelain').stdout).toBe('');
  expect(git(wt, 'rev-parse', '--verify', '--quiet', 'REBASE_HEAD').exitCode).not.toBe(0);
});

test('a published branch that now differs gets the force-with-lease hint', async () => {
  commitInWorktree('own.txt', 'the task work\n');
  gitOrThrow(wt, 'push', 'origin', 'feature');
  commitToRemote('advance.txt', 'main moved\n');

  const { reports } = await rebaseTaskWorktrees(ws, 't1');
  expect(reports.map((r) => r.outcome)).toEqual(['rebased']);
  expect(reports[0]?.detail).toContain('push with: git push --force-with-lease');
  // Saying is not doing: the remote branch still holds the pre-rebase commits.
  expect(git(wt, 'rev-parse', 'origin/feature').stdout).not.toBe(
    git(wt, 'rev-parse', 'HEAD').stdout,
  );
});

test('a missing worktree and a wrong checked-out branch are legible failures', async () => {
  gitOrThrow(wt, 'checkout', '-b', 'sidetrack');
  const sidetracked = await rebaseTaskWorktrees(ws, 't1');
  expect(sidetracked.reports.map((r) => r.outcome)).toEqual(['failed']);
  expect(sidetracked.reports[0]?.detail).toContain("'sidetrack'");
  expect(sidetracked.reports[0]?.detail).toContain("'feature'");

  gitOrThrow(wt, 'checkout', 'feature');
  rmSync(wt, { recursive: true });
  const missing = await rebaseTaskWorktrees(ws, 't1');
  expect(missing.reports.map((r) => r.outcome)).toEqual(['failed']);
  expect(missing.reports[0]?.detail).toContain('missing');
});

// -- setup ----------------------------------------------------------------
// A fresh workspace per test with one registered repository `demo` (bare
// remote, branch `main`), one bare task t1 `feature`, and its worktree at
// worktrees/t1-feature. Remote movement goes through a staging clone —
// exactly the state a merged PR leaves behind (design/0004-work-spine/).

let scratch: string;
let remote: string;
let ws: string;
let wt: string;
let caseId = 0;

function commitToRemote(file: string, content: string): void {
  const stage = join(scratch, `stage-${caseId}-${file.replaceAll('/', '-')}`);
  gitOrThrow('.', 'clone', remote, stage);
  mkdirSync(dirname(join(stage, file)), { recursive: true });
  writeFileSync(join(stage, file), content);
  gitOrThrow(stage, 'add', '-A');
  gitOrThrow(stage, 'commit', '-m', `advance main: ${file}`);
  gitOrThrow(stage, 'push', 'origin', 'main');
}

function commitInWorktree(file: string, content: string): void {
  writeFileSync(join(wt, file), content);
  gitOrThrow(wt, 'add', '-A');
  gitOrThrow(wt, 'commit', '-m', `work: ${file}`);
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
  await Bun.write(join(seed, 'src', 'lib.ts'), 'export {};\n');
  gitOrThrow(seed, 'checkout', '-b', 'main');
  gitOrThrow(seed, 'add', '-A');
  gitOrThrow(seed, 'commit', '-m', 'seed');
  gitOrThrow(seed, 'push', '-u', 'origin', 'main');
  await addRepository(ws, remote, 'demo');
  await openTask(ws, 'feature', {});
  const { record } = await createWorktree(ws, 't1', 'demo');
  wt = join(ws, record.path);
});

afterAll(() => {
  removeDir(scratch);
});
