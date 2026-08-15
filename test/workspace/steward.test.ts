// The stewardship rails at the module level
// (design/0019-stewardship-worktrees/): a worktree of the workspace's OWN
// repository — branched from the root's main line, which the root checkout
// never leaves — the stewardship-copy detection, the gated merge that lands
// a stewardship branch without switching the root, and the local
// delivered-close gate that verifies the branch reached the workspace's own
// history before any teardown. The workspace's main-line name is read, never
// assumed: under the hermetic git env a fresh `git init` names it `master`,
// so these tests derive it exactly as the code does.
import { afterAll, beforeAll, beforeEach, expect, test } from 'bun:test';
import { existsSync, realpathSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { WardError } from '../../src/errors.ts';
import { createWorkspace } from '../../src/workspace/create.ts';
import { gitOrThrow } from '../../src/workspace/git.ts';
import { readTasks } from '../../src/workspace/scan.ts';
import { scopeFromCwd } from '../../src/workspace/scope.ts';
import {
  mergeWorkspaceBranch,
  stewardshipEnclosure,
  workspaceMainLine,
} from '../../src/workspace/steward.ts';
import { closeTask, openTask } from '../../src/workspace/tasks.ts';
import {
  createWorkspaceWorktree,
  rebaseTaskWorktrees,
  worktreeStatuses,
} from '../../src/workspace/worktrees.ts';
import { applyGitTestEnv, makeTempDir, removeDir } from '../helpers.ts';

// -- creation ---------------------------------------------------------------

test('a workspace worktree: branched from main, record encoding, the root never switched', async () => {
  const { record } = await createWorkspaceWorktree(ws, 't1');
  expect(record.source).toBe('workspace');
  expect(record.repo).toBeUndefined();
  expect(record.branch).toBe('steward/steward-work');
  expect(record.disposition).toBe('deliverable');
  expect(record.path).toBe('worktrees/t1-steward-steward-work');
  // The root checkout IS the main-line checkout and never leaves it.
  expect(gitOrThrow(ws, 'symbolic-ref', '--short', 'HEAD').stdout.trim()).toBe(mainLine);
  // Only tracked files materialize: the record is there, the world is not.
  const copy = join(ws, record.path);
  expect(existsSync(join(copy, 'workspace.md'))).toBe(true);
  expect(existsSync(join(copy, '.ward', 'baselines.md'))).toBe(true);
  expect(existsSync(join(copy, 'repos'))).toBe(false);
  expect(existsSync(join(copy, 'worktrees'))).toBe(false);
  // Record-first: the copy includes its own worktree record, and the branch
  // starts zero commits behind the main line.
  const ownRecord = 'tasks/t1-steward-work/worktrees/workspace--steward-steward-work.md';
  expect(existsSync(join(copy, ownRecord))).toBe(true);
  expect(gitOrThrow(ws, 'rev-list', '--count', `${mainLine}..${record.branch}`).stdout.trim()).toBe(
    '0',
  );
  // The stewardship worktree sits at an ignored path: the root stays clean.
  expect(gitOrThrow(ws, 'status', '--porcelain').stdout.trim()).toBe('');
});

test('creation converges: same record back, and a hand-deleted worktree is re-established', async () => {
  const first = await createWorkspaceWorktree(ws, 't1');
  const again = await createWorkspaceWorktree(ws, 't1');
  expect(again.record).toEqual(first.record);
  // Tear the directory out from under the record; re-running converges —
  // the existing branch is checked out where it stands, never recreated.
  removeDir(join(ws, first.record.path));
  const restored = await createWorkspaceWorktree(ws, 't1');
  expect(restored.record.path).toBe(first.record.path);
  expect(existsSync(join(ws, first.record.path, 'workspace.md'))).toBe(true);
});

// -- the stewardship copy ---------------------------------------------------

test('a stewardship copy is recognized, and the enclosing workspace is named', async () => {
  const { record } = await createWorkspaceWorktree(ws, 't1');
  const copy = join(ws, record.path);
  // Git answers in real paths (macOS /var is a symlink to /private/var), so
  // the named enclosure is the workspace root's real path.
  expect(stewardshipEnclosure(copy)).toBe(realpathSync(ws));
  expect(stewardshipEnclosure(ws)).toBeNull();
});

test('scopeFromCwd resolves a cwd inside a stewardship worktree to the claiming task (0006)', async () => {
  const { record } = await createWorkspaceWorktree(ws, 't1');
  const copy = join(ws, record.path);
  const atRoot = await scopeFromCwd(ws, copy);
  expect(atRoot?.task.record.code).toBe('t1');
  expect(atRoot?.worktree.path).toBe(record.path);
  // And from a subdirectory of the copy — even one that looks like a record tree.
  const below = await scopeFromCwd(ws, join(copy, 'tasks'));
  expect(below?.task.record.code).toBe('t1');
});

// -- the gated merge --------------------------------------------------------

test('preview then merge: the branch lands, the root stays on main, nothing is left dirty', async () => {
  const { record } = await createWorkspaceWorktree(ws, 't1');
  commitInCopy(join(ws, record.path), 'stewardship-note.md', 'a deliberate change\n');

  const preview = await mergeWorkspaceBranch(ws, record.branch, true);
  expect(preview.outcome).toBe('previewed');
  expect(preview.commits).toBe(1);
  expect(preview.mainLine).toBe(mainLine);
  expect(preview.diffStat).toContain('stewardship-note.md');
  expect(existsSync(join(ws, 'stewardship-note.md'))).toBe(false); // preview mutates nothing

  const merged = await mergeWorkspaceBranch(ws, record.branch);
  expect(merged.outcome).toBe('merged');
  expect(merged.commits).toBe(1);
  expect(merged.mergeCommit).toBeDefined();
  expect(existsSync(join(ws, 'stewardship-note.md'))).toBe(true);
  expect(gitOrThrow(ws, 'symbolic-ref', '--short', 'HEAD').stdout.trim()).toBe(mainLine);
  expect(gitOrThrow(ws, 'status', '--porcelain').stdout.trim()).toBe('');
  // The merge commit names the act.
  expect(gitOrThrow(ws, 'log', '-1', '--format=%s').stdout).toContain(
    `Merge stewardship branch '${record.branch}'`,
  );

  const again = await mergeWorkspaceBranch(ws, record.branch);
  expect(again.outcome).toBe('already-merged');
  expect(again.commits).toBe(0);
});

test('a dirty root refuses the merge before anything happens', async () => {
  const { record } = await createWorkspaceWorktree(ws, 't1');
  commitInCopy(join(ws, record.path), 'note.md', 'x\n');
  writeFileSync(join(ws, 'stray.txt'), 'uncommitted\n');
  expect(mergeWorkspaceBranch(ws, record.branch)).rejects.toThrow(/uncommitted changes/);
});

test('a conflicted merge aborts cleanly: files named, the root exactly as it was', async () => {
  const { record } = await createWorkspaceWorktree(ws, 't1');
  // The branch and the main line disagree about AGENTS.md.
  commitInCopy(join(ws, record.path), 'AGENTS.md', 'the branch version\n');
  writeFileSync(join(ws, 'AGENTS.md'), 'the main-line version\n');
  gitOrThrow(ws, 'add', '-A', '--', 'AGENTS.md');
  gitOrThrow(ws, 'commit', '-m', 'Advance main');
  const head = gitOrThrow(ws, 'rev-parse', 'HEAD').stdout.trim();

  let refusal = '';
  try {
    await mergeWorkspaceBranch(ws, record.branch);
  } catch (error) {
    expect(error).toBeInstanceOf(WardError);
    refusal = (error as Error).message;
  }
  expect(refusal).toContain('conflicts in: AGENTS.md');
  expect(refusal).toContain('Aborted');
  expect(refusal).toContain('ward worktree rebase');
  expect(gitOrThrow(ws, 'rev-parse', 'HEAD').stdout.trim()).toBe(head);
  expect(gitOrThrow(ws, 'status', '--porcelain').stdout.trim()).toBe('');
  expect(gitOrThrow(ws, 'symbolic-ref', '--short', 'HEAD').stdout.trim()).toBe(mainLine);
});

test('merge refusals: an unknown branch, and the main line itself', async () => {
  expect(mergeWorkspaceBranch(ws, 'no-such-branch')).rejects.toThrow(/no branch named/);
  expect(mergeWorkspaceBranch(ws, mainLine)).rejects.toThrow(/main line itself/);
});

test('the merge refuses inside a stewardship copy, naming the enclosing workspace', async () => {
  const { record } = await createWorkspaceWorktree(ws, 't1');
  const copy = join(ws, record.path);
  expect(mergeWorkspaceBranch(copy, record.branch)).rejects.toThrow(/stewardship copy/);
});

// -- the local delivered-close gate -----------------------------------------

test('an unmerged stewardship branch refuses the delivered close before any teardown', async () => {
  const { task, record } = await createWorkspaceWorktree(ws, 't1');
  commitInCopy(join(ws, record.path), 'change.md', 'unlanded work\n');

  let refusal = '';
  try {
    await closeTask(ws, 't1', 'delivered');
  } catch (error) {
    expect(error).toBeInstanceOf(WardError);
    refusal = (error as Error).message;
  }
  expect(refusal).toContain(`branch '${record.branch}' has not reached the workspace's main line`);
  expect(refusal).toContain(`ward workspace merge ${record.branch}`);
  expect(refusal).toContain('--outcome abandoned');
  // Refused before the first write: worktree on disk, task still active.
  expect(existsSync(join(ws, record.path))).toBe(true);
  const after = (await readTasks(ws)).find((t) => t.dir === task.dir);
  expect(after?.record.state).toBe('active');
});

test('after the gated merge the delivered close verifies, tears down, and records', async () => {
  const { record } = await createWorkspaceWorktree(ws, 't1');
  commitInCopy(join(ws, record.path), 'change.md', 'landed work\n');
  await mergeWorkspaceBranch(ws, record.branch);

  const report = await closeTask(ws, 't1', 'delivered');
  const reach = report.steps.find((step) => step.step === 'reachability');
  expect(reach?.detail).toContain(`branch '${record.branch}'`);
  expect(reach?.detail).toContain(`reaches ${mainLine} in the workspace's own history`);
  expect(existsSync(join(ws, record.path))).toBe(false);
  expect(report.task.record.state).toBe('closed');
  expect(report.task.record.outcome).toBe('delivered');
  // The teardown spoke to the workspace's own repository: no stale registration.
  expect(gitOrThrow(ws, 'worktree', 'list').stdout).not.toContain(record.path);
});

test('the abandoned close of an unmerged stewardship worktree is the stated authority', async () => {
  const { record } = await createWorkspaceWorktree(ws, 't1');
  commitInCopy(join(ws, record.path), 'discarded.md', 'set aside\n');
  const report = await closeTask(ws, 't1', 'abandoned');
  expect(report.steps.find((step) => step.step === `worktree ${record.path}`)?.detail).toBe(
    'discarded',
  );
  expect(existsSync(join(ws, record.path))).toBe(false);
  expect(existsSync(join(ws, 'discarded.md'))).toBe(false); // nothing merged
});

// -- rebase and freshness ---------------------------------------------------

test('freshness and rebase read the workspace main line — behind, rebased, current', async () => {
  const { task } = await createWorkspaceWorktree(ws, 't1');
  // Advance the workspace main line past the branch (journal-style commit).
  writeFileSync(join(ws, 'advance.md'), 'the journal moves\n');
  gitOrThrow(ws, 'add', '-A', '--', 'advance.md');
  gitOrThrow(ws, 'commit', '-m', 'Advance main');

  const behind = await worktreeStatuses(ws, task.dir);
  expect(behind[0]?.freshness).toBe('behind');
  expect(behind[0]?.behindBy).toBe(1);
  expect(behind[0]?.detail).toBe(`behind ${mainLine} by 1 commit`);

  const { reports } = await rebaseTaskWorktrees(ws, 't1');
  expect(reports[0]?.outcome).toBe('rebased');
  expect(reports[0]?.detail).toContain(`onto ${mainLine}`);

  const current = await worktreeStatuses(ws, task.dir);
  expect(current[0]?.freshness).toBe('current');
  expect(current[0]?.detail).toBe(`current (atop ${mainLine})`);
  expect(gitOrThrow(ws, 'symbolic-ref', '--short', 'HEAD').stdout.trim()).toBe(mainLine);
});

test('workspaceMainLine reads the root checkout branch, never assumes a name', () => {
  expect(workspaceMainLine(ws)).toBe(
    gitOrThrow(ws, 'symbolic-ref', '--short', 'HEAD').stdout.trim(),
  );
});

// -- setup ------------------------------------------------------------------
// A fresh workspace per test (the verbs mutate), each with one bare task t1
// `steward-work`. No registered repositories: the workspace's own repository
// is not a member of the set and needs none.

let scratch: string;
let ws: string;
let mainLine: string;
let caseId = 0;

/** Commit one file on the stewardship branch, inside its worktree. */
function commitInCopy(copy: string, file: string, content: string): void {
  writeFileSync(join(copy, file), content);
  gitOrThrow(copy, 'add', '-A', '--', file);
  gitOrThrow(copy, 'commit', '-m', `Stewardship: ${file}`);
}

beforeAll(() => {
  applyGitTestEnv();
  scratch = makeTempDir();
});

beforeEach(async () => {
  caseId += 1;
  ws = join(scratch, `ws-${caseId}`);
  await createWorkspace(ws);
  await openTask(ws, 'steward-work', {});
  mainLine = workspaceMainLine(ws);
});

afterAll(() => {
  removeDir(scratch);
});
