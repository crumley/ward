// Worktree freshness (design/0016-worktree-freshness/): per worktree, is it
// behind the main line — derived at read time from LOCAL git alone (worktrees
// share the canonical checkout's refs, so origin/<mainLine> needs no network),
// honest about being as fresh as the last refresh, occupancy-first (a dirty
// tree is the fact, never a count), and never a mutation. Remotes are local
// bare repositories; the no-network case removes the remote outright.
import { afterAll, beforeAll, beforeEach, expect, test } from 'bun:test';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createWorkspace } from '../../src/workspace/create.ts';
import { gitOrThrow } from '../../src/workspace/git.ts';
import { addRepository, refreshRepositories } from '../../src/workspace/repos.ts';
import { statusReport } from '../../src/workspace/status.ts';
import { closeTask, openTask } from '../../src/workspace/tasks.ts';
import { createWorktree, worktreeStatuses } from '../../src/workspace/worktrees.ts';
import { applyGitTestEnv, makeTempDir, removeDir } from '../helpers.ts';

test('current after create; a moved remote counts only after the refresh — honest to the last refresh', async () => {
  const fresh = await worktreeStatuses(ws, taskDir);
  expect(fresh.map((s) => s.freshness)).toEqual(['current']);
  expect(fresh[0]?.detail).toBe('current (atop origin/main)');
  expect(fresh[0]?.behindBy).toBeUndefined();

  // The remote moves; nothing local has fetched yet. Freshness answers from
  // local refs alone, so it honestly still says current — the answer is as
  // fresh as the last `repo refresh`, and says nothing it cannot know.
  commitToRemote('advance-1.txt', 'main moved\n');
  commitToRemote('advance-2.txt', 'main moved again\n');
  const unfetched = await worktreeStatuses(ws, taskDir);
  expect(unfetched.map((s) => s.freshness)).toEqual(['current']);

  // The canonical checkout refreshes (the toil's first half, 0003); the
  // worktree shares its refs, so the same read now names the gap.
  await refreshRepositories(ws, 'demo');
  const behind = await worktreeStatuses(ws, taskDir);
  expect(behind[0]?.freshness).toBe('behind');
  expect(behind[0]?.behindBy).toBe(2);
  expect(behind[0]?.detail).toBe('behind origin/main by 2 commits');
});

test('the read is local: with the remote gone entirely, freshness still answers', async () => {
  commitToRemote('advance.txt', 'main moved\n');
  await refreshRepositories(ws, 'demo');
  rmSync(remote, { recursive: true, force: true }); // no network could answer now
  const statuses = await worktreeStatuses(ws, taskDir);
  expect(statuses[0]?.freshness).toBe('behind');
  expect(statuses[0]?.behindBy).toBe(1);
  expect(statuses[0]?.detail).toBe('behind origin/main by 1 commit');
});

test('a dirty tree is occupancy, not a count — reported before behind is even asked', async () => {
  commitToRemote('advance.txt', 'main moved\n');
  await refreshRepositories(ws, 'demo');
  writeFileSync(join(wt, 'src', 'lib.ts'), 'unrecorded work\n');
  const statuses = await worktreeStatuses(ws, taskDir);
  expect(statuses[0]?.freshness).toBe('dirty');
  expect(statuses[0]?.behindBy).toBeUndefined(); // no number under the fail-safe
  expect(statuses[0]?.detail).toBe('dirty (uncommitted changes — treated as occupied)');
  // A read verb: the uncommitted content is exactly as it was.
  expect(await Bun.file(join(wt, 'src', 'lib.ts')).text()).toBe('unrecorded work\n');
});

test('a worktree off its recorded branch is drifted, named in §16 language', async () => {
  gitOrThrow(wt, 'checkout', '-b', 'sidetrack');
  const branched = await worktreeStatuses(ws, taskDir);
  expect(branched[0]?.freshness).toBe('drifted');
  expect(branched[0]?.checkedOut).toBe('sidetrack');
  expect(branched[0]?.detail).toBe(
    "drifted (checked out 'sidetrack' where the record names 'feature')",
  );

  gitOrThrow(wt, 'checkout', '--detach');
  const detached = await worktreeStatuses(ws, taskDir);
  expect(detached[0]?.freshness).toBe('drifted');
  expect(detached[0]?.checkedOut).toBeUndefined(); // no branch to name — honest absence
  expect(detached[0]?.detail).toBe(
    "drifted (checked out a detached HEAD where the record names 'feature')",
  );
});

test('a worktree missing on disk is unreadable — honest absence, not a failure', async () => {
  rmSync(wt, { recursive: true });
  const statuses = await worktreeStatuses(ws, taskDir);
  expect(statuses[0]?.freshness).toBe('unreadable');
  expect(statuses[0]?.detail).toBe('unreadable (missing on disk)');
});

test('statusReport carries worktrees per non-closed task and never asks settled work', async () => {
  await openTask(ws, 'bare', {});
  const report = await statusReport(ws);
  const [t1, t2] = report.bareTasks;
  expect(t1?.worktrees?.map((s) => s.freshness)).toEqual(['current']);
  expect(t1?.worktrees?.[0]?.record.path).toBe('worktrees/t1-feature');
  expect(t2?.worktrees).toEqual([]); // none recorded — the honest empty, not absence

  await closeTask(ws, 't2', 'abandoned');
  const closed = (await statusReport(ws)).bareTasks.find((s) => s.task.state === 'closed');
  expect(closed?.worktrees).toBeUndefined(); // settled at close; not asked again
});

test('without git on PATH the rows keep their identity and freshness vanishes', async () => {
  const path = process.env.PATH;
  const empty = join(scratch, 'no-bin'); // a real but git-less PATH — '' falls back to defaults
  mkdirSync(empty, { recursive: true });
  process.env.PATH = empty;
  try {
    const statuses = await worktreeStatuses(ws, taskDir);
    expect(statuses.length).toBe(1);
    expect(statuses[0]?.record.branch).toBe('feature'); // the record still answers
    expect(statuses[0]?.freshness).toBeUndefined(); // the derivation honestly cannot
    expect(statuses[0]?.detail).toBeUndefined();
  } finally {
    process.env.PATH = path;
  }
});

// -- setup ----------------------------------------------------------------
// A fresh workspace per test with one registered repository `demo` (bare
// remote, branch `main`), one bare task t1 `feature`, and its worktree at
// worktrees/t1-feature — the rebase suite's scaffold, read instead of mutated.

let scratch: string;
let remote: string;
let ws: string;
let wt: string;
let taskDir: string;
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
  taskDir = (await openTask(ws, 'feature', {})).dir;
  const { record } = await createWorktree(ws, 't1', 'demo');
  wt = join(ws, record.path);
});

afterAll(() => {
  removeDir(scratch);
});
