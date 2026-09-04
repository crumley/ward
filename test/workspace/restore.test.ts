// Restore from a fresh clone (design/0021-restore-from-clone/): the record
// alone re-materializes the world — canonical checkouts re-cloned from the
// recorded remote onto the recorded main line, worktrees re-created at the
// recorded paths from surviving branches (local, or origin remote-tracking),
// a never-pushed branch named LOST with the record kept, open sessions named
// and never touched, and a run on an intact workspace all-satisfied with
// zero changes. All fixtures synthetic: bare repositories as remotes, the
// workspace cloned by local path — no network, no forge. The demo remote's
// branch is `trunk`, not `main`, proving the main line is recorded, never
// assumed.
import { afterAll, beforeAll, beforeEach, expect, test } from 'bun:test';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createWorkspace } from '../../src/workspace/create.ts';
import { runDoctor } from '../../src/workspace/doctor.ts';
import { git, gitOrThrow } from '../../src/workspace/git.ts';
import { addRepository, checkoutPath } from '../../src/workspace/repos.ts';
import { restoreConverged, restoreWorkspace } from '../../src/workspace/restore.ts';
import { openSession } from '../../src/workspace/sessions.ts';
import { openTask } from '../../src/workspace/tasks.ts';
import { createWorkspaceWorktree, createWorktree } from '../../src/workspace/worktrees.ts';
import { applyGitTestEnv, makeTempDir, removeDir } from '../helpers.ts';

// -- the fresh clone, end to end --------------------------------------------

test('a fresh clone restores: checkout re-cloned, worktrees re-created, doctor clean', async () => {
  await buildRepoWorktree({ push: true });
  await buildWorkspaceWorktree();
  const featureTip = tipOf(join(ws, 'worktrees/t1-feature-work'));
  const stewardTip = tipOf(join(ws, 'worktrees/t2-steward-steward-work'));
  const clone = cloneWorkspace();

  // The clone is record without world: that is what gitignore promises.
  expect(existsSync(join(clone, 'tasks/t1-feature-work/task.md'))).toBe(true);
  expect(existsSync(join(clone, 'repos'))).toBe(false);
  expect(existsSync(join(clone, 'worktrees'))).toBe(false);

  const report = await restoreWorkspace(clone);
  expect(restoreConverged(report)).toBe(true);
  expect(report.repositories).toMatchObject([{ name: 'demo', outcome: 'restored' }]);
  expect(report.repositories[0]?.detail).toContain('on trunk');
  expect(report.worktrees.map((item) => item.outcome)).toEqual(['restored', 'restored']);

  // The canonical checkout: recorded remote, recorded main line.
  const canonical = checkoutPath(clone, 'demo');
  expect(gitOrThrow(canonical, 'symbolic-ref', '--short', 'HEAD').stdout.trim()).toBe('trunk');
  // The worktrees stand at the recorded paths, on the recorded branches, at
  // the tips the branches survived with — never fabricated from a main line.
  const feature = join(clone, 'worktrees/t1-feature-work');
  expect(gitOrThrow(feature, 'symbolic-ref', '--short', 'HEAD').stdout.trim()).toBe('feature-work');
  expect(tipOf(feature)).toBe(featureTip);
  const steward = join(clone, 'worktrees/t2-steward-steward-work');
  expect(gitOrThrow(steward, 'symbolic-ref', '--short', 'HEAD').stdout.trim()).toBe(
    'steward/steward-work',
  );
  expect(tipOf(steward)).toBe(stewardTip);

  // Doctor is clean of restore-class findings — and healthy outright.
  const doctor = await runDoctor(clone);
  expect(doctor.healthy).toBe(true);
  for (const finding of materializationFindings(doctor.workspace)) {
    expect(finding.severity).toBe('ok');
  }
});

test('a workspace-source worktree is restored from an origin remote-tracking branch', async () => {
  await buildWorkspaceWorktree();
  const tip = tipOf(join(ws, stewardPath));
  const clone = cloneWorkspace();
  // In the clone the stewardship branch survives only as a remote-tracking ref.
  expect(git(clone, 'rev-parse', '--verify', 'refs/heads/steward/steward-work').exitCode).not.toBe(
    0,
  );
  expect(
    git(clone, 'rev-parse', '--verify', 'refs/remotes/origin/steward/steward-work').exitCode,
  ).toBe(0);

  const report = await restoreWorkspace(clone);
  const row = report.worktrees.find((item) => item.record.source === 'workspace');
  expect(row?.outcome).toBe('restored');
  expect(row?.detail).toContain('re-created from origin/steward/steward-work');
  // The local branch now exists, at the surviving tip, materialized as a
  // linked worktree of the workspace's own repository (the 0019 mechanics).
  expect(git(clone, 'rev-parse', '--verify', 'refs/heads/steward/steward-work').exitCode).toBe(0);
  expect(tipOf(join(clone, stewardPath))).toBe(tip);
  expect(gitOrThrow(clone, 'worktree', 'list').stdout).toContain(
    stewardPath.slice('worktrees/'.length),
  );
});

// -- the lost branch ---------------------------------------------------------

test('a never-pushed branch is named lost — loudly, record kept, exit posture honest', async () => {
  await buildRepoWorktree({ push: false });
  const clone = cloneWorkspace();

  const report = await restoreWorkspace(clone);
  expect(restoreConverged(report)).toBe(false);
  // The checkout itself restores fine; the worktree's branch died unpushed.
  expect(report.repositories).toMatchObject([{ name: 'demo', outcome: 'restored' }]);
  const row = report.worktrees[0];
  expect(row?.outcome).toBe('lost');
  expect(row?.detail).toContain("branch 'feature-work' is reachable nowhere");
  expect(row?.detail).toContain('ward task close t1 --outcome abandoned');
  // Named, not skipped: the record stays for the human to adjudicate, and
  // nothing was fabricated at the recorded path.
  expect(existsSync(join(clone, 'tasks/t1-feature-work/worktrees/demo--feature-work.md'))).toBe(
    true,
  );
  expect(existsSync(join(clone, 'worktrees/t1-feature-work'))).toBe(false);

  // Converge-stable: a re-run names the same loss, resolving nothing by fiat.
  const again = await restoreWorkspace(clone);
  expect(again.worktrees[0]?.outcome).toBe('lost');
});

// -- idempotence / convergence ----------------------------------------------

test('restore on an intact workspace: every item satisfied, zero changes', async () => {
  await buildRepoWorktree({ push: true });
  await buildWorkspaceWorktree();

  const before = snapshot(ws);
  const report = await restoreWorkspace(ws);
  expect(restoreConverged(report)).toBe(true);
  expect(report.repositories.map((item) => item.outcome)).toEqual(['satisfied']);
  expect(report.worktrees.map((item) => item.outcome)).toEqual(['satisfied', 'satisfied']);
  expect(snapshot(ws)).toEqual(before);
});

test('a partial state restores only what is absent', async () => {
  await buildRepoWorktree({ push: true });
  await buildWorkspaceWorktree();

  // The worktree directory alone: its branch survives in the canonical
  // checkout, so restore checks it out where it stands.
  rmSync(join(ws, 'worktrees/t1-feature-work'), { recursive: true });
  let report = await restoreWorkspace(ws);
  expect(report.repositories.map((item) => item.outcome)).toEqual(['satisfied']);
  const restoredRow = report.worktrees.find((item) => item.record.repo === 'demo');
  expect(restoredRow?.outcome).toBe('restored');
  expect(restoredRow?.detail).toContain("surviving branch 'feature-work'");
  expect(report.worktrees.find((item) => item.record.source === 'workspace')?.outcome).toBe(
    'satisfied',
  );

  // The whole checkout (worktree and local branch die with it): the pushed
  // branch survives on origin, and the re-clone brings it back.
  rmSync(checkoutPath(ws, 'demo'), { recursive: true });
  rmSync(join(ws, 'worktrees/t1-feature-work'), { recursive: true });
  report = await restoreWorkspace(ws);
  expect(report.repositories.map((item) => item.outcome)).toEqual(['restored']);
  expect(report.worktrees.find((item) => item.record.repo === 'demo')?.detail).toContain(
    're-created from origin/feature-work',
  );
  expect(restoreConverged(report)).toBe(true);
});

// -- sessions ----------------------------------------------------------------

test('open session records are named, never restored and never touched', async () => {
  await buildRepoWorktree({ push: true });
  await openSession(ws, 't1', 'drive the feature', {});
  const clone = cloneWorkspace();

  const report = await restoreWorkspace(clone);
  expect(report.sessions.open).toBe(1);
  expect(report.sessions.detail).toContain('not restorable');
  expect(report.sessions.detail).toContain('ward session close');
  // The record is untouched: still open, exactly as the original machine left it.
  const sessionFile = join(clone, 'tasks/t1-feature-work/sessions/feature-work-1@test.md');
  expect(existsSync(sessionFile)).toBe(true);
  expect(await Bun.file(sessionFile).text()).toContain('state: open');
});

// -- doctor on the fresh clone -----------------------------------------------

test('doctor on a fresh clone names each missing materialization with the remedy', async () => {
  await buildRepoWorktree({ push: true });
  await buildWorkspaceWorktree();
  const clone = cloneWorkspace();

  const doctor = await runDoctor(clone);
  const findings = materializationFindings(doctor.workspace);
  expect(findings.length).toBe(3); // one repository, two worktrees
  for (const finding of findings) {
    expect(finding.severity).toBe('warn'); // named drift, not a wall of errors
    expect(finding.message).toContain('ward workspace restore');
  }
  const worktreeChecks = findings.filter((finding) => finding.check.startsWith('worktree '));
  expect(worktreeChecks.map((finding) => finding.check).sort()).toEqual([
    'worktree worktrees/t1-feature-work',
    'worktree worktrees/t2-steward-steward-work',
  ]);
  expect(worktreeChecks[0]?.message).toContain("branch 'feature-work' of repos/demo");
  expect(worktreeChecks[1]?.message).toContain("the workspace's own repository");
});

// -- failure containment -----------------------------------------------------

test('a dead remote fails its rows and blocks nothing else', async () => {
  await buildRepoWorktree({ push: true });
  await buildWorkspaceWorktree();
  const clone = cloneWorkspace();
  rmSync(remote, { recursive: true }); // the demo remote is gone

  const report = await restoreWorkspace(clone);
  expect(restoreConverged(report)).toBe(false);
  expect(report.repositories).toMatchObject([{ name: 'demo', outcome: 'failed' }]);
  const repoRow = report.worktrees.find((item) => item.record.repo === 'demo');
  expect(repoRow?.outcome).toBe('failed');
  expect(repoRow?.detail).toContain("'demo' was not restored");
  // The workspace-source worktree needs no remote and restores regardless.
  expect(report.worktrees.find((item) => item.record.source === 'workspace')?.outcome).toBe(
    'restored',
  );
});

// -- setup ------------------------------------------------------------------
// Each test gets a fresh original workspace; fixtures are built per test from
// two helpers: a registered repository (bare remote on branch `trunk`) with a
// worktree on task t1 whose branch is pushed or deliberately not, and a
// workspace-source (stewardship) worktree on task t2 with one commit. The
// "fresh clone" is a plain `git clone` of the original workspace by local
// path — its origin is a directory, never a forge.

let scratch: string;
let ws: string;
let remote: string;
let stewardPath: string;
let caseId = 0;

async function buildRepoWorktree(options: { push: boolean }): Promise<void> {
  remote = join(scratch, `remote-${caseId}`, 'demo.git');
  mkdirSync(remote, { recursive: true });
  gitOrThrow('.', 'init', '--bare', '--initial-branch=trunk', remote);
  const seed = join(scratch, `seed-${caseId}`);
  gitOrThrow('.', 'clone', remote, seed);
  writeFileSync(join(seed, 'seed.txt'), 'seed\n');
  gitOrThrow(seed, 'checkout', '-b', 'trunk');
  gitOrThrow(seed, 'add', '-A');
  gitOrThrow(seed, 'commit', '-m', 'seed');
  gitOrThrow(seed, 'push', '-u', 'origin', 'trunk');

  await addRepository(ws, remote, 'demo');
  await openTask(ws, 'feature-work', {});
  await createWorktree(ws, 't1', 'demo');
  const worktree = join(ws, 'worktrees/t1-feature-work');
  writeFileSync(join(worktree, 'work.txt'), 'the work\n');
  gitOrThrow(worktree, 'add', '-A');
  gitOrThrow(worktree, 'commit', '-m', 'the work');
  if (options.push) gitOrThrow(worktree, 'push', '-u', 'origin', 'feature-work');
}

async function buildWorkspaceWorktree(): Promise<void> {
  const opened = await openTask(ws, 'steward-work', {});
  const { record } = await createWorkspaceWorktree(ws, opened.record.code);
  stewardPath = record.path;
  const copy = join(ws, record.path);
  writeFileSync(join(copy, 'stewardship-note.md'), 'a deliberate change\n');
  gitOrThrow(copy, 'add', '-A', '--', 'stewardship-note.md');
  gitOrThrow(copy, 'commit', '-m', 'Stewardship note');
}

/** Clone the original workspace by local path — the fresh machine's first act. */
function cloneWorkspace(): string {
  const clone = join(scratch, `clone-${caseId}`);
  gitOrThrow('.', 'clone', ws, clone);
  return clone;
}

function tipOf(dir: string): string {
  return gitOrThrow(dir, 'rev-parse', 'HEAD').stdout.trim();
}

/** Everything a restore could disturb: history, registrations, porcelain. */
function snapshot(root: string): Record<string, string> {
  const canonical = checkoutPath(root, 'demo');
  return {
    head: gitOrThrow(root, 'rev-parse', 'HEAD').stdout.trim(),
    porcelain: gitOrThrow(root, 'status', '--porcelain').stdout,
    rootWorktrees: gitOrThrow(root, 'worktree', 'list').stdout,
    demoHead: gitOrThrow(canonical, 'rev-parse', 'HEAD').stdout.trim(),
    demoWorktrees: gitOrThrow(canonical, 'worktree', 'list').stdout,
  };
}

function materializationFindings(
  findings: readonly { check: string; severity: string; message: string }[],
) {
  return findings.filter(
    (finding) => finding.check.startsWith('repository ') || finding.check.startsWith('worktree '),
  );
}

beforeAll(() => {
  applyGitTestEnv();
  scratch = makeTempDir();
});

beforeEach(async () => {
  caseId += 1;
  ws = join(scratch, `original-${caseId}`);
  await createWorkspace(ws);
});

afterAll(() => {
  removeDir(scratch);
});
