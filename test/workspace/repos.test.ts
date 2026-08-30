// The repository set (design/0003-repository-set/): registration clones or
// adopts into the contained canonical checkout with the main line read from
// the repository, re-running converges, refresh fast-forwards but never
// touches a dirty tree, and doctor reports record↔disk drift. Remotes are
// local bare repositories — no network. Plus, from
// design/0023-refresh-concurrency-ux/: the set refreshes concurrently and
// still reports in the registered order, `--stash` is the human's explicit
// exception to the dirty-tree fail-safe, and `conflicted` is derived off the
// checkout on every refresh rather than remembered anywhere.
import { afterAll, beforeAll, beforeEach, expect, test } from 'bun:test';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createWorkspace } from '../../src/workspace/create.ts';
import { runDoctor } from '../../src/workspace/doctor.ts';
import { git, gitOrThrow } from '../../src/workspace/git.ts';
import {
  addRepository,
  checkoutPath,
  listRepositories,
  type RefreshRow,
  refreshRepositories,
  removeRepository,
} from '../../src/workspace/repos.ts';
import { closeTask, openTask } from '../../src/workspace/tasks.ts';
import { createWorktree } from '../../src/workspace/worktrees.ts';
import { applyGitTestEnv, makeTempDir, removeDir } from '../helpers.ts';

test('add clones a remote, reads its main line, and commits the record', async () => {
  const report = await addRepository(ws, remote);
  expect(report.outcome).toBe('registered');
  expect(report.record).toMatchObject({ name: 'origin-repo', remote, mainLine: 'trunk' });
  expect(existsSync(join(checkoutPath(ws, 'origin-repo'), 'seed.txt'))).toBe(true);
  const lastCommit = git(ws, 'log', '-1', '--format=%s').stdout;
  expect(lastCommit).toContain('Register repository origin-repo');
  expect(git(ws, 'status', '--porcelain').stdout).toBe('');
});

test('re-running add is satisfied; a conflicting remote is refused', async () => {
  await addRepository(ws, remote);
  expect((await addRepository(ws, remote)).outcome).toBe('satisfied');
  expect(addRepository(ws, '/some/other/remote.git', 'origin-repo')).rejects.toThrow(
    /already registered/,
  );
});

test('add adopts a local checkout untouched, recording its own origin', async () => {
  const theirs = join(scratch, 'their-checkout');
  gitOrThrow('.', 'clone', remote, theirs);
  const before = git(theirs, 'rev-parse', 'HEAD').stdout;

  const report = await addRepository(ws, theirs, 'adopted');
  expect(report.record.remote).toBe(remote); // the source's origin, not the source path
  expect(report.record.mainLine).toBe('trunk');
  expect(git(checkoutPath(ws, 'adopted'), 'remote', 'get-url', 'origin').stdout.trim()).toBe(
    remote,
  );
  expect(git(theirs, 'rev-parse', 'HEAD').stdout).toBe(before); // untouched
});

test('adopting a source parked on a feature branch still records the real main line', async () => {
  const theirs = join(scratch, 'feature-checkout');
  gitOrThrow('.', 'clone', remote, theirs);
  gitOrThrow(theirs, 'checkout', '-b', 'my-feature');

  const report = await addRepository(ws, theirs, 'adopted');
  expect(report.record.mainLine).toBe('trunk'); // the remote's HEAD, not their branch
  const canonical = checkoutPath(ws, 'adopted');
  expect(git(canonical, 'symbolic-ref', '--short', 'HEAD').stdout.trim()).toBe('trunk');
});

test('a record whose checkout is missing is re-converged by add', async () => {
  await addRepository(ws, remote);
  rmSync(checkoutPath(ws, 'origin-repo'), { recursive: true });
  const report = await addRepository(ws, remote);
  expect(report.outcome).toBe('converged');
  expect(existsSync(checkoutPath(ws, 'origin-repo'))).toBe(true);
});

test('refresh fast-forwards a stale checkout and reports a current one', async () => {
  await addRepository(ws, remote);
  expect((await refreshRepositories(ws)).map((r) => r.outcome)).toEqual(['current']);
  commitToRemote('advance.txt');
  const after = await refreshRepositories(ws);
  expect(after.map((r) => r.outcome)).toEqual(['refreshed']);
  expect(existsSync(join(checkoutPath(ws, 'origin-repo'), 'advance.txt'))).toBe(true);
});

test('refresh never touches a dirty checkout — the fail-safe', async () => {
  await addRepository(ws, remote);
  await Bun.write(join(checkoutPath(ws, 'origin-repo'), 'seed.txt'), 'unrecorded work\n');
  commitToRemote('advance.txt');
  const reports = await refreshRepositories(ws);
  expect(reports.map((r) => r.outcome)).toEqual(['dirty']);
  expect(existsSync(join(checkoutPath(ws, 'origin-repo'), 'advance.txt'))).toBe(false);
});

test('doctor reports a deleted checkout as drift, with the converging command', async () => {
  await addRepository(ws, remote);
  expect(await doctorRepoFindings()).toMatchObject([{ severity: 'ok' }]);
  rmSync(checkoutPath(ws, 'origin-repo'), { recursive: true });
  const findings = await doctorRepoFindings();
  expect(findings).toMatchObject([{ severity: 'warn' }]);
  expect(findings[0]?.message).toContain('ward repo add');
});

test('list returns the registered set', async () => {
  const records = await listRepositories(ws);
  expect(records.map((r) => r.name)).toEqual([]);
  await addRepository(ws, remote);
  expect((await listRepositories(ws)).map((r) => r.name)).toEqual(['origin-repo']);
});

// -- remove (design/0033-repo-remove/) -------------------------------------

test('remove deletes the checkout, unregisters the record, and commits the journal entry', async () => {
  await addRepository(ws, remote);
  const report = await removeRepository(ws, 'origin-repo');
  expect(report.checkout).toBe('deleted');
  expect(report.record.remote).toBe(remote); // the re-add argument, carried out of the record
  expect(existsSync(checkoutPath(ws, 'origin-repo'))).toBe(false);
  expect((await listRepositories(ws)).map((r) => r.name)).toEqual([]);
  expect(git(ws, 'log', '-1', '--format=%s').stdout).toContain('Unregister repository origin-repo');
  expect(git(ws, 'status', '--porcelain').stdout).toBe('');
});

test('removing an unregistered name is refused legibly', async () => {
  expect(removeRepository(ws, 'nope')).rejects.toThrow(/no repository named 'nope'/);
});

test('remove is refused while an open task worktree stands on the repository', async () => {
  await addRepository(ws, remote);
  await openTask(ws, 'holder', {});
  await createWorktree(ws, 't1', 'origin-repo');
  expect(removeRepository(ws, 'origin-repo')).rejects.toThrow(/open task t1/);
  expect(existsSync(checkoutPath(ws, 'origin-repo'))).toBe(true); // untouched

  // The close tears the worktree down; its branch, holding nothing the
  // remote's main line lacks, goes with the checkout without a refusal.
  await closeTask(ws, 't1', 'abandoned');
  expect((await removeRepository(ws, 'origin-repo')).checkout).toBe('deleted');
});

test('the dirty-tree fail-safe refuses the delete', async () => {
  await addRepository(ws, remote);
  await Bun.write(join(checkoutPath(ws, 'origin-repo'), 'seed.txt'), 'unrecorded work\n');
  expect(removeRepository(ws, 'origin-repo')).rejects.toThrow(/uncommitted changes/);
  expect(existsSync(checkoutPath(ws, 'origin-repo'))).toBe(true);
  expect((await listRepositories(ws)).map((r) => r.name)).toEqual(['origin-repo']);
});

test('a stash entry refuses the delete — parked work is still work', async () => {
  await addRepository(ws, remote);
  const checkout = checkoutPath(ws, 'origin-repo');
  await Bun.write(join(checkout, 'seed.txt'), 'parked\n');
  gitOrThrow(checkout, 'stash', 'push', '-u');
  expect(removeRepository(ws, 'origin-repo')).rejects.toThrow(/stash entries/);
});

test('a local branch with unlanded commits refuses the delete; deleting it clears the way', async () => {
  await addRepository(ws, remote);
  const checkout = checkoutPath(ws, 'origin-repo');
  gitOrThrow(checkout, 'checkout', '-b', 'stranded');
  writeFileSync(join(checkout, 'work.txt'), 'never pushed\n');
  gitOrThrow(checkout, 'add', '-A');
  gitOrThrow(checkout, 'commit', '-m', 'unlanded work');
  gitOrThrow(checkout, 'checkout', 'trunk');
  expect(removeRepository(ws, 'origin-repo')).rejects.toThrow(/stranded/);

  gitOrThrow(checkout, 'branch', '-D', 'stranded');
  expect((await removeRepository(ws, 'origin-repo')).checkout).toBe('deleted');
});

test('a record whose checkout is already gone is still unregistered', async () => {
  await addRepository(ws, remote);
  rmSync(checkoutPath(ws, 'origin-repo'), { recursive: true });
  const report = await removeRepository(ws, 'origin-repo');
  expect(report.checkout).toBe('missing');
  expect((await listRepositories(ws)).map((r) => r.name)).toEqual([]);
});

// -- concurrency (design/0023-refresh-concurrency-ux/) ---------------------

test('the set refreshes concurrently and still reports in the registered order', async () => {
  for (const name of ['alpha', 'beta', 'gamma']) await addRepository(ws, seedRemote(name), name);

  const snapshots: RefreshRow[][] = [];
  const reports = await refreshRepositories(ws, undefined, {
    observe: (rows) => snapshots.push([...rows]),
  });

  // Registration order, not completion order — the same set always produces
  // the same document, whatever the network did (§6).
  expect(reports.map((r) => r.name)).toEqual(['alpha', 'beta', 'gamma']);
  expect(reports.map((r) => r.outcome)).toEqual(['current', 'current', 'current']);
  // The first snapshot is the whole roster, pending, before any work starts.
  expect(snapshots[0]).toEqual([
    { name: 'alpha', state: 'pending' },
    { name: 'beta', state: 'pending' },
    { name: 'gamma', state: 'pending' },
  ]);
  // Concurrency, asserted by evidence rather than by timing: more than one
  // repository was in flight in the same snapshot.
  const inFlight = snapshots.map((rows) => rows.filter((row) => row.state === 'fetching').length);
  expect(Math.max(...inFlight)).toBeGreaterThan(1);
  // Every snapshot is the complete roster in the same order — the contract a
  // renderer holds no state to satisfy.
  expect(snapshots.every((rows) => rows.map((r) => r.name).join() === 'alpha,beta,gamma')).toBe(
    true,
  );
  expect(snapshots.at(-1)?.map((row) => row.state)).toEqual(['current', 'current', 'current']);
});

test('one conflicted repository never stops the rest of the set', async () => {
  const alpha = seedRemote('alpha');
  const beta = seedRemote('beta');
  await addRepository(ws, alpha, 'alpha');
  await addRepository(ws, beta, 'beta');
  await makeConflicted('alpha', alpha);
  commitToRemote('advance.txt', '', beta);

  const reports = await refreshRepositories(ws);
  expect(reports.map((r) => [r.name, r.outcome])).toEqual([
    ['alpha', 'conflicted'],
    ['beta', 'refreshed'],
  ]);
});

// -- the stash cycle (design/0023-refresh-concurrency-ux/) -----------------

test('--stash refreshes a dirty checkout and puts the work back', async () => {
  await addRepository(ws, remote);
  const checkout = checkoutPath(ws, 'origin-repo');
  await Bun.write(join(checkout, 'notes.txt'), 'unrecorded work\n');
  commitToRemote('advance.txt');

  const [report] = await refreshRepositories(ws, undefined, { stash: true });
  expect(report?.outcome).toBe('refreshed');
  expect(report?.detail).toContain('stashed and restored');
  expect(existsSync(join(checkout, 'advance.txt'))).toBe(true); // the refresh landed
  expect(await Bun.file(join(checkout, 'notes.txt')).text()).toBe('unrecorded work\n'); // and so did the work
  expect(git(checkout, 'stash', 'list').stdout.trim()).toBe(''); // nothing left parked
});

test('--stash on a clean checkout is the plain refresh — no stash cycle claimed', async () => {
  await addRepository(ws, remote);
  commitToRemote('advance.txt');
  const [report] = await refreshRepositories(ws, undefined, { stash: true });
  expect(report?.outcome).toBe('refreshed');
  expect(report?.detail).not.toContain('stash');
});

test('--stash: a pop that conflicts reports conflicted and leaves the tree as git left it', async () => {
  await addRepository(ws, remote);
  const checkout = checkoutPath(ws, 'origin-repo');
  await Bun.write(join(checkout, 'seed.txt'), 'my local edit\n');
  commitToRemote('seed.txt', 'the remote edit\n');

  const [report] = await refreshRepositories(ws, undefined, { stash: true });
  expect(report?.outcome).toBe('conflicted');
  expect(report?.detail).toContain('repos/origin-repo');
  expect(report?.detail).toContain('git stash');
  // Exactly as git left it: markers in the tree, the path unmerged, and the
  // entry still on the stack — nothing resolved, nothing discarded.
  expect(git(checkout, 'status', '--porcelain').stdout).toContain('UU seed.txt');
  expect(await Bun.file(join(checkout, 'seed.txt')).text()).toContain('<<<<<<<');
  expect(git(checkout, 'stash', 'list').stdout.trim()).not.toBe('');
});

test('a conflicted checkout is derived on every later refresh and skipped, --stash or not', async () => {
  await addRepository(ws, remote);
  const checkout = checkoutPath(ws, 'origin-repo');
  await makeConflicted('origin-repo', remote);
  commitToRemote('later.txt');

  expect((await refreshRepositories(ws)).map((r) => r.outcome)).toEqual(['conflicted']);
  expect((await refreshRepositories(ws, undefined, { stash: true })).map((r) => r.outcome)).toEqual(
    ['conflicted'],
  );
  expect(existsSync(join(checkout, 'later.txt'))).toBe(false); // skipped, not refreshed

  // Derived, never stored: resolving the conflict is all it takes for the
  // very next refresh to proceed — no Ward state to clear.
  gitOrThrow(checkout, 'checkout', '--theirs', '--', 'seed.txt');
  gitOrThrow(checkout, 'add', '--', 'seed.txt');
  gitOrThrow(checkout, 'stash', 'drop');
  gitOrThrow(checkout, 'reset', '--hard');
  expect((await refreshRepositories(ws)).map((r) => r.outcome)).toEqual(['refreshed']);
  expect(existsSync(join(checkout, 'later.txt'))).toBe(true);
});

// -- setup ----------------------------------------------------------------
// Each test gets a fresh workspace and a fresh bare "remote" seeded with one
// commit on branch `trunk` (deliberately not `main`, proving the main line is
// read from the repository rather than assumed). Cases needing more than one
// repository seed extra remotes with `seedRemote`.

let scratch: string;
let ws: string;
let remote: string;
let caseId = 0;
let remoteId = 0;

function commitToRemote(file: string, content = '', target = remote): void {
  remoteId += 1;
  const stage = join(scratch, `stage-${caseId}-${remoteId}`);
  gitOrThrow('.', 'clone', target, stage);
  writeFileSync(join(stage, file), content);
  gitOrThrow(stage, 'add', '-A');
  gitOrThrow(stage, 'commit', '-m', `add ${file}`);
  gitOrThrow(stage, 'push', 'origin', 'trunk');
}

/** A fresh bare remote seeded like the default one, for multi-repository cases. */
function seedRemote(name: string): string {
  const path = join(scratch, `remote-${caseId}`, `${name}.git`);
  mkdirSync(path, { recursive: true });
  gitOrThrow('.', 'init', '--bare', '--initial-branch=trunk', path);
  const seed = join(scratch, `seed-${caseId}-${name}`);
  gitOrThrow('.', 'clone', path, seed);
  writeFileSync(join(seed, 'seed.txt'), '');
  gitOrThrow(seed, 'checkout', '-b', 'trunk');
  gitOrThrow(seed, 'add', '-A');
  gitOrThrow(seed, 'commit', '-m', 'seed');
  gitOrThrow(seed, 'push', '-u', 'origin', 'trunk');
  return path;
}

/**
 * Drive a registered repository into the conflicted state the honest way —
 * through a real `--stash` cycle whose pop conflicts — so what the later
 * cases read off the checkout is what git actually produces, not a fixture
 * imitating it.
 */
async function makeConflicted(name: string, target: string): Promise<void> {
  await Bun.write(join(checkoutPath(ws, name), 'seed.txt'), 'my local edit\n');
  commitToRemote('seed.txt', 'the remote edit\n', target);
  const [report] = await refreshRepositories(ws, name, { stash: true });
  expect(report?.outcome).toBe('conflicted'); // the premise of every case that calls this
}

async function doctorRepoFindings() {
  const report = await runDoctor(ws);
  return report.workspace.filter((finding) => finding.check.startsWith('repository '));
}

beforeAll(() => {
  applyGitTestEnv();
  scratch = makeTempDir();
});

beforeEach(async () => {
  caseId += 1;
  ws = join(scratch, `ws-${caseId}`);
  await createWorkspace(ws);
  remote = join(scratch, `remote-${caseId}`, 'origin-repo.git');
  mkdirSync(remote, { recursive: true });
  gitOrThrow('.', 'init', '--bare', '--initial-branch=trunk', remote);
  const seed = join(scratch, `seed-${caseId}`);
  gitOrThrow('.', 'clone', remote, seed);
  Bun.spawnSync(['touch', join(seed, 'seed.txt')]);
  gitOrThrow(seed, 'checkout', '-b', 'trunk');
  gitOrThrow(seed, 'add', '-A');
  gitOrThrow(seed, 'commit', '-m', 'seed');
  gitOrThrow(seed, 'push', '-u', 'origin', 'trunk');
});

afterAll(() => {
  removeDir(scratch);
});
