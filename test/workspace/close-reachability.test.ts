// The close gate's main-line reachability check
// (design/0012-close-gate-reachability/): on a forge, "merged" means merged
// into the PR's base — not "reached the main line" — and the delivered close
// is the one place that difference destroys work. These tests replay the
// motivating incident (a PR merged into a retired base branch) against local
// bare remotes and a fake gh: a merged-but-unreachable PR refuses the close
// before any teardown; every unanswerable case — no merge commit, no mappable
// repository, a refresh that cannot run — degrades to the named-trust posture
// instead of a false "unreachable".
//
// Hermetic mapping trick: the repository is registered with the forge-shaped
// remote https://forge.example/demo while git's url.<bare>.insteadOf (set via
// GIT_CONFIG_* env, honored by every spawned git) rewrites that URL to the
// local bare repository — so the URL→repository mapping and every fetch both
// work without a network.
import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { createWorkspace } from '../../src/workspace/create.ts';
import { gitOrThrow } from '../../src/workspace/git.ts';
import { addRepository } from '../../src/workspace/repos.ts';
import { resolveOpenTask } from '../../src/workspace/scan.ts';
import { openSession, readSessions } from '../../src/workspace/sessions.ts';
import { addTaskPr, closeTask, openTask } from '../../src/workspace/tasks.ts';
import { createWorktree } from '../../src/workspace/worktrees.ts';
import {
  applyGitTestEnv,
  makeTempDir,
  NO_GH,
  removeDir,
  runWardEnv,
  writeFakeGh,
} from '../helpers.ts';

const REMOTE_URL = 'https://forge.example/demo';
const PR = 'https://forge.example/demo/pull/24';

test('the incident replay: a PR merged into a dead base refuses the close, before any teardown', async () => {
  await openTask(ws, 'entry', {});
  const { record: wt } = await createWorktree(ws, 't1', 'demo');
  const wtDir = join(ws, wt.path);
  await commitAndPush(wtDir, 'entry', 'work.txt');
  await openSession(ws, 't1', 'build the entry', {});
  await addTaskPr(ws, 't1', PR);

  // The forge merges the PR into a base branch that never reaches main —
  // exactly PR #24 landing on the retired design/0009 branch.
  const oid = mergeOnRemote('dead-base', 'entry');
  process.env.WARD_GH = writeFakeGh(scratch, `gh-${caseId}`, {
    responses: { [PR]: { state: 'MERGED', reviewDecision: 'APPROVED', mergeCommit: oid } },
  });

  let refusal = '';
  try {
    await closeTask(ws, 't1', 'delivered');
  } catch (error) {
    refusal = (error as Error).message;
  }
  // The situation named precisely (§20): which PR, which commit, what
  // happened, and the remedy.
  expect(refusal).toContain(PR);
  expect(refusal).toContain(oid.slice(0, 7));
  expect(refusal).toContain('not reachable from origin/main in repos/demo');
  expect(refusal).toContain('a base branch that never reached the main line');
  expect(refusal).toContain('Re-land it first');

  // Refused before any teardown: worktree on disk, session open, task active.
  expect(existsSync(wtDir)).toBe(true);
  const task = await resolveOpenTask(ws, 't1');
  expect(task.record.state).toBe('active');
  expect((await readSessions(ws, task.dir)).map((s) => s.state)).toEqual(['open']);
});

test('a merge commit that reached the main line closes — verified against the refreshed tip', async () => {
  await openTask(ws, 'entry', {});
  const { record: wt } = await createWorktree(ws, 't1', 'demo');
  const wtDir = join(ws, wt.path);
  await commitAndPush(wtDir, 'entry', 'work.txt');
  await addTaskPr(ws, 't1', PR);

  // The forge merges into main. The canonical checkout has not fetched since
  // the worktree was created, so only the gate's own refresh-first can see
  // the merge — a stale tip would misread this as unreachable.
  const oid = mergeOnRemote('main', 'entry');
  process.env.WARD_GH = writeFakeGh(scratch, `gh-${caseId}`, {
    responses: { [PR]: { state: 'MERGED', reviewDecision: 'APPROVED', mergeCommit: oid } },
  });

  const report = await closeTask(ws, 't1', 'delivered');
  expect(report.task.record.state).toBe('closed');
  expect(report.task.record.outcome).toBe('delivered');
  const reach = report.steps.find((step) => step.step === 'reachability');
  expect(reach?.detail).toBe(`${PR} — merge commit ${oid.slice(0, 7)} reaches origin/main in demo`);
  expect(existsSync(wtDir)).toBe(false); // torn down after the gate passed
});

test('a merged PR with no merge commit cannot be verified — the trust is named, never guessed', async () => {
  await openTask(ws, 'entry', {});
  await addTaskPr(ws, 't1', PR);
  process.env.WARD_GH = writeFakeGh(scratch, `gh-${caseId}`, {
    responses: { [PR]: { state: 'MERGED' } },
  });
  const report = await closeTask(ws, 't1', 'delivered');
  expect(report.task.record.state).toBe('closed');
  const reach = report.steps.find((step) => step.step === 'reachability');
  expect(reach?.detail).toBe(
    `${PR} — the forge reports no merge commit; cannot verify it reached the main line — ` +
      "trusting the stated outcome 'delivered'",
  );
});

test('a PR no registered repository can answer for is trusted aloud', async () => {
  const elsewhere = 'https://elsewhere.example/other/pull/9';
  await openTask(ws, 'entry', {});
  await addTaskPr(ws, 't1', elsewhere);
  process.env.WARD_GH = writeFakeGh(scratch, `gh-${caseId}`, {
    responses: { [elsewhere]: { state: 'MERGED', mergeCommit: '1'.repeat(40) } },
  });
  const report = await closeTask(ws, 't1', 'delivered');
  expect(report.task.record.state).toBe('closed');
  const reach = report.steps.find((step) => step.step === 'reachability');
  expect(reach?.detail).toBe(
    `${elsewhere} — no registered repository matches its remote; cannot verify it reached the ` +
      "main line — trusting the stated outcome 'delivered'",
  );
});

test('a refresh that cannot run degrades to named trust, never to a false "unreachable"', async () => {
  await openTask(ws, 'entry', {});
  const { record: wt } = await createWorktree(ws, 't1', 'demo');
  await commitAndPush(join(ws, wt.path), 'entry', 'work.txt');
  await addTaskPr(ws, 't1', PR);
  const oid = mergeOnRemote('dead-base', 'entry'); // genuinely never reached main
  // A dirty canonical checkout refuses its refresh (the 0003 fail-safe), so
  // the gate cannot distinguish "stale" from "unreachable" — and must not guess.
  await Bun.write(join(ws, 'repos', 'demo', 'drift.txt'), 'x\n');
  process.env.WARD_GH = writeFakeGh(scratch, `gh-${caseId}`, {
    responses: { [PR]: { state: 'MERGED', mergeCommit: oid } },
  });
  const report = await closeTask(ws, 't1', 'delivered');
  expect(report.task.record.state).toBe('closed');
  const reach = report.steps.find((step) => step.step === 'reachability');
  expect(reach?.detail).toBe(
    `${PR} — cannot refresh repos/demo (uncommitted changes — refusing to touch it); ` +
      "reachability unverifiable — trusting the stated outcome 'delivered'",
  );
});

test('a reachable answer stays sound even when the refresh fails — history is only gained', async () => {
  await openTask(ws, 'entry', {});
  const { record: wt } = await createWorktree(ws, 't1', 'demo');
  const wtDir = join(ws, wt.path);
  await commitAndPush(wtDir, 'entry', 'work.txt');
  await addTaskPr(ws, 't1', PR);
  const oid = mergeOnRemote('main', 'entry');
  // Let the canonical checkout learn the merge, then break its refresh: an
  // ancestor of the last-fetched tip is an ancestor of the current one.
  gitOrThrow(join(ws, 'repos', 'demo'), 'fetch', 'origin');
  await Bun.write(join(ws, 'repos', 'demo', 'drift.txt'), 'x\n');
  process.env.WARD_GH = writeFakeGh(scratch, `gh-${caseId}`, {
    responses: { [PR]: { state: 'MERGED', mergeCommit: oid } },
  });
  const report = await closeTask(ws, 't1', 'delivered');
  const reach = report.steps.find((step) => step.step === 'reachability');
  expect(reach?.detail).toBe(`${PR} — merge commit ${oid.slice(0, 7)} reaches origin/main in demo`);
});

test('the refusal reaches the CLI as an error exit, like every gate', async () => {
  await openTask(ws, 'entry', {});
  const { record: wt } = await createWorktree(ws, 't1', 'demo');
  await commitAndPush(join(ws, wt.path), 'entry', 'work.txt');
  await addTaskPr(ws, 't1', PR);
  const oid = mergeOnRemote('dead-base', 'entry');
  const fakeGh = writeFakeGh(scratch, `gh-${caseId}`, {
    responses: { [PR]: { state: 'MERGED', mergeCommit: oid } },
  });
  const result = runWardEnv(['task', 'close', 't1'], ws, { NO_COLOR: '1', WARD_GH: fakeGh });
  expect(result.exitCode).toBe(1);
  expect(result.stderr).toContain('not reachable from origin/main in repos/demo');
  expect(result.stderr).toContain('Re-land it first');
  expect(existsSync(join(ws, wt.path))).toBe(true); // still not torn down
});

// -- setup ----------------------------------------------------------------
// Each case gets a fresh workspace whose `demo` repository is recorded with
// the forge-shaped remote (so PR URLs map to it) while insteadOf points every
// git operation at a local bare repository on branch main.

let scratch: string;
let ws: string;
let remote: string;
let caseId = 0;

/** Commit one file on the worktree's branch and publish the branch. */
async function commitAndPush(worktree: string, branch: string, file: string): Promise<void> {
  await Bun.write(join(worktree, file), 'work\n');
  gitOrThrow(worktree, 'add', '-A');
  gitOrThrow(worktree, 'commit', '-m', `add ${file}`);
  gitOrThrow(worktree, 'push', 'origin', branch);
}

/**
 * Simulate the forge merging a PR from `branch` into `base` with a real merge
 * commit, pushed to the bare remote; returns the merge commit's oid. A base
 * other than main constructs the incident: the merge exists, the forge calls
 * the PR merged, and main never received it.
 */
function mergeOnRemote(base: string, branch: string): string {
  const stage = join(scratch, `stage-${caseId}-${base}`);
  gitOrThrow('.', 'clone', remote, stage);
  if (base === 'main') {
    gitOrThrow(stage, 'checkout', 'main');
  } else {
    gitOrThrow(stage, 'checkout', '-b', base, 'origin/main');
  }
  gitOrThrow(stage, 'merge', '--no-ff', `origin/${branch}`, '-m', `Merge PR into ${base}`);
  gitOrThrow(stage, 'push', 'origin', base);
  return gitOrThrow(stage, 'rev-parse', 'HEAD').stdout.trim();
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
  // Every git spawned from here on rewrites the forge-shaped remote URL to
  // the local bare repository — fetch, push, and ls-remote all stay offline.
  process.env.GIT_CONFIG_COUNT = '1';
  process.env.GIT_CONFIG_KEY_0 = `url.${remote}.insteadOf`;
  process.env.GIT_CONFIG_VALUE_0 = REMOTE_URL;
  const seed = join(scratch, `seed-${caseId}`);
  gitOrThrow('.', 'clone', remote, seed);
  await Bun.write(join(seed, 'README.md'), 'demo\n');
  gitOrThrow(seed, 'checkout', '-b', 'main');
  gitOrThrow(seed, 'add', '-A');
  gitOrThrow(seed, 'commit', '-m', 'seed');
  gitOrThrow(seed, 'push', '-u', 'origin', 'main');
  // Adoption reads the seed's origin, so the record carries the forge URL.
  gitOrThrow(seed, 'remote', 'set-url', 'origin', REMOTE_URL);
  await addRepository(ws, seed, 'demo');
});

afterEach(() => {
  process.env.WARD_GH = NO_GH;
});

afterAll(() => {
  delete process.env.GIT_CONFIG_COUNT;
  delete process.env.GIT_CONFIG_KEY_0;
  delete process.env.GIT_CONFIG_VALUE_0;
  process.env.WARD_GH = NO_GH;
  removeDir(scratch);
});
