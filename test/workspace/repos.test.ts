// The repository set (design/0003-repository-set/): registration clones or
// adopts into the contained canonical checkout with the main line read from
// the repository, re-running converges, refresh fast-forwards but never
// touches a dirty tree, and doctor reports record↔disk drift. Remotes are
// local bare repositories — no network.
import { afterAll, beforeAll, beforeEach, expect, test } from 'bun:test';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { createWorkspace } from '../../src/workspace/create.ts';
import { runDoctor } from '../../src/workspace/doctor.ts';
import { git, gitOrThrow } from '../../src/workspace/git.ts';
import {
  addRepository,
  checkoutPath,
  listRepositories,
  refreshRepositories,
} from '../../src/workspace/repos.ts';
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
  await addRepository(ws, remote);
  const records = await listRepositories(ws);
  expect(records.map((r) => r.name)).toEqual(['origin-repo']);
});

// -- setup ----------------------------------------------------------------
// Each test gets a fresh workspace and a fresh bare "remote" seeded with one
// commit on branch `trunk` (deliberately not `main`, proving the main line is
// read from the repository rather than assumed).

let scratch: string;
let ws: string;
let remote: string;
let caseId = 0;

function commitToRemote(file: string): void {
  const stage = join(scratch, `stage-${caseId}-${file}`);
  gitOrThrow('.', 'clone', remote, stage);
  Bun.spawnSync(['touch', join(stage, file)]);
  gitOrThrow(stage, 'add', '-A');
  gitOrThrow(stage, 'commit', '-m', `add ${file}`);
  gitOrThrow(stage, 'push', 'origin', 'trunk');
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
