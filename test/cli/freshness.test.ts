// Worktree freshness at the CLI (design/0016-worktree-freshness/): status
// renders one sub-line per worktree of each non-closed task — behind by N
// with the rebase remedy named, current, dirty, drifted, unreadable — and the
// status --json task rows carry the same as worktree rows. All from local git
// (the remote is renamed away before status answers), through the spawned CLI
// against local bare remotes; `worktree rebase` is what turns behind back
// into current, end to end.
import { afterAll, beforeAll, beforeEach, expect, test } from 'bun:test';
import { renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { statusShape } from '../../src/cli/schema.ts';
import { createWorkspace } from '../../src/workspace/create.ts';
import { gitOrThrow } from '../../src/workspace/git.ts';
import { addRepository } from '../../src/workspace/repos.ts';
import { openTask } from '../../src/workspace/tasks.ts';
import { createWorktree } from '../../src/workspace/worktrees.ts';
import { applyGitTestEnv, makeTempDir, removeDir, runWard } from '../helpers.ts';

const BEHIND_LINE =
  'worktrees/t1-feature — behind origin/main by 2 commits — rebase with: ward worktree rebase t1';

test('end to end: remote advances → refresh → behind by N with the remedy → rebase → current', () => {
  advanceRemote('advance-1.txt', 'main moved\n');
  advanceRemote('advance-2.txt', 'main moved again\n');
  expect(runWard(['repo', 'refresh'], ws).exitCode).toBe(0);

  // The remote disappears before status is asked: the answer below is
  // provably local reads alone — zero network at status time.
  renameSync(remote, `${remote}.offline`);
  const behind = runWard(['status'], ws);
  expect(behind.exitCode).toBe(0);
  expect(behind.stdout).toContain(BEHIND_LINE);

  const json = JSON.parse(runWard(['status', '--json'], ws).stdout);
  expect(() => statusShape.parse(json)).not.toThrow();
  expect(json.bareTasks[0].worktrees).toEqual([
    {
      repo: 'demo',
      branch: 'feature',
      path: 'worktrees/t1-feature',
      freshness: 'behind',
      behindBy: 2,
    },
  ]);

  // The named remedy is the 0011 verb; after it, the same glance reads current.
  renameSync(`${remote}.offline`, remote); // rebase refreshes first — it may fetch
  expect(runWard(['worktree', 'rebase', 't1'], ws).exitCode).toBe(0);
  const current = runWard(['status'], ws);
  expect(current.stdout).toContain('worktrees/t1-feature — current (atop origin/main)');
  expect(current.stdout).not.toContain('behind');
  const after = JSON.parse(runWard(['status', '--json'], ws).stdout);
  expect(after.bareTasks[0].worktrees).toEqual([
    { repo: 'demo', branch: 'feature', path: 'worktrees/t1-feature', freshness: 'current' },
  ]);
});

test('a dirty worktree reads as occupied — never a behind count', () => {
  advanceRemote('advance.txt', 'main moved\n');
  runWard(['repo', 'refresh'], ws);
  writeFileSync(join(wt, 'src', 'lib.ts'), 'unrecorded work\n');
  const result = runWard(['status'], ws);
  expect(result.stdout).toContain(
    'worktrees/t1-feature — dirty (uncommitted changes — treated as occupied)',
  );
  expect(result.stdout).not.toContain('behind');
  const json = JSON.parse(runWard(['status', '--json'], ws).stdout);
  expect(json.bareTasks[0].worktrees[0].freshness).toBe('dirty');
  expect(json.bareTasks[0].worktrees[0].behindBy).toBeUndefined();
});

test('a worktree off its recorded branch reads as drifted, naming both branches', () => {
  gitOrThrow(wt, 'checkout', '-b', 'sidetrack');
  const result = runWard(['status'], ws);
  expect(result.stdout).toContain(
    "worktrees/t1-feature — drifted (checked out 'sidetrack' where the record names 'feature')",
  );
  const json = JSON.parse(runWard(['status', '--json'], ws).stdout);
  expect(json.bareTasks[0].worktrees[0]).toMatchObject({
    freshness: 'drifted',
    checkedOut: 'sidetrack',
  });
});

test('a worktree missing on disk reads as unreadable — honest absence', () => {
  rmSync(wt, { recursive: true });
  const result = runWard(['status'], ws);
  expect(result.exitCode).toBe(0); // status still answers everything else
  expect(result.stdout).toContain('worktrees/t1-feature — unreadable (missing on disk)');
  const json = JSON.parse(runWard(['status', '--json'], ws).stdout);
  expect(json.bareTasks[0].worktrees[0].freshness).toBe('unreadable');
});

test('a task without worktrees renders no sub-line and carries the honest empty array', async () => {
  await openTask(ws, 'bare', {});
  const result = runWard(['status'], ws);
  expect(result.stdout).toContain('t2 bare [active]');
  const json = JSON.parse(runWard(['status', '--json'], ws).stdout);
  expect(json.bareTasks[1].worktrees).toEqual([]);
  // needs you stays quiet: a behind worktree is mid-flight state, not an
  // attention item — the sub-line with its remedy is the whole surface.
  advanceRemote('advance.txt', 'main moved\n');
  runWard(['repo', 'refresh'], ws);
  const behind = runWard(['status'], ws);
  expect(behind.stdout).toContain('behind origin/main by 1 commit —');
  expect(behind.stdout).not.toContain('needs you');
});

// -- setup ----------------------------------------------------------------
// A fresh workspace per test (statuses are read, but the scenarios mutate
// the trees) with one registered repository `demo` on branch `main` and one
// bare task t1 `feature` whose worktree is worktrees/t1-feature.

let scratch: string;
let remote: string;
let ws: string;
let wt: string;
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
