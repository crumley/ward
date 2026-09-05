// The stale-base warning (design/0014-stale-base-warning/): an OPEN PR whose
// base is not the repository's main line joins `needs you` with the diagnosis
// and the remedy named — the motivating incident (PR #24 merged into a
// retired stacked base, design/0012-close-gate-reachability/) caught before
// the merge, while retargeting is still cheap. Derived at read time from the
// same single probe call plus the repository record's main line; never
// stored. Every unanswerable link — merged state, unreported base, unmappable
// URL, unavailable forge — degrades to honest silence, and the availability
// semantics of `needsYou` are unchanged.
//
// Hermetic mapping trick (0012's): the repository is registered with the
// forge-shaped remote https://forge.example/demo while git's
// url.<bare>.insteadOf (set via GIT_CONFIG_* env) rewrites that URL to a
// local bare repository — registration works offline and the PR URL maps.
import { afterAll, afterEach, beforeAll, expect, test } from 'bun:test';
import { join } from 'node:path';
import { statusShape } from '../../src/cli/schema.ts';
import { createWorkspace } from '../../src/workspace/create.ts';
import { gitOrThrow } from '../../src/workspace/git.ts';
import { addRepository } from '../../src/workspace/repos.ts';
import { addTaskPr, openTask } from '../../src/workspace/tasks.ts';
import {
  applyGitTestEnv,
  makeTempDir,
  NO_GH,
  removeDir,
  runWard,
  runWardEnv,
  writeFakeGh,
} from '../helpers.ts';

const REMOTE_URL = 'https://forge.example/demo';
const PR = 'https://forge.example/demo/pull/24';
const RETIRED = 'design/0009-live-forge-state';

// The incident's prequel, the exact #24 shape: an open PR stacked on another
// entry's branch, never retargeted after that branch's own PR merged. In the
// incident this was caught only at the close gate, after the merge had
// already stranded the work; the warning surfaces the same fact while the
// cheap fix — retarget the base on the forge — is still available.
test('the incident prequel: an open PR on a retired stacked base warns, with base, main line, and remedy', () => {
  const fake = writeFakeGh(scratch, 'gh-prequel', {
    responses: { [PR]: { state: 'OPEN', reviewDecision: 'APPROVED', baseRefName: RETIRED } },
  });
  const result = runWardEnv(['status'], ws, { NO_COLOR: '1', WARD_GH: fake });
  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain('needs you');
  expect(result.stdout).toContain(
    `  ! task t1 — PR ${PR} is based on '${RETIRED}', not the main line 'main' — ` +
      'merging as-is delivers into a branch that may never land (the close gate would refuse it); ' +
      `retarget first: gh pr edit ${PR} --base main`,
  );
});

test('the same warning in --json: the needsYou entry carries pr, base, and mainLine', () => {
  const fake = writeFakeGh(scratch, 'gh-prequel-json', {
    responses: { [PR]: { state: 'OPEN', reviewDecision: 'APPROVED', baseRefName: RETIRED } },
  });
  const result = runWardEnv(['status', '--json'], ws, { NO_COLOR: '1', WARD_GH: fake });
  expect(result.exitCode).toBe(0);
  const status = JSON.parse(result.stdout);
  expect(() => statusShape.parse(status)).not.toThrow();
  expect(status.needsYou).toEqual([
    {
      address: 't1',
      task: 't1',
      reason: 'stale-base',
      pr: PR,
      base: RETIRED,
      mainLine: 'main',
    },
  ]);
  // The per-PR row carries the raw datum the warning was derived from.
  expect(status.bareTasks[0].forge).toEqual([
    { url: PR, state: 'open', reviewDecision: 'approved', baseRefName: RETIRED },
  ]);
});

test('a retargeted PR — base is the main line — warns nothing', () => {
  const fake = writeFakeGh(scratch, 'gh-retargeted', {
    responses: { [PR]: { state: 'OPEN', reviewDecision: 'APPROVED', baseRefName: 'main' } },
  });
  const json = runWardEnv(['status', '--json'], ws, { NO_COLOR: '1', WARD_GH: fake });
  expect(JSON.parse(json.stdout).needsYou).toEqual([]);
  const human = runWardEnv(['status'], ws, { NO_COLOR: '1', WARD_GH: fake });
  expect(human.stdout).not.toContain('needs you');
});

test("a merged PR's base is history — the close gate owns that end, not the glance", () => {
  const fake = writeFakeGh(scratch, 'gh-merged-stacked', {
    responses: { [PR]: { state: 'MERGED', baseRefName: RETIRED } },
  });
  const json = runWardEnv(['status', '--json'], ws, { NO_COLOR: '1', WARD_GH: fake });
  expect(JSON.parse(json.stdout).needsYou).toEqual([
    { task: 't1', address: 't1', reason: 'awaiting-close' },
  ]);
  const human = runWardEnv(['status'], ws, { NO_COLOR: '1', WARD_GH: fake });
  expect(human.stdout).not.toContain('is based on');
});

test('a forge that reports no base warns nothing — absence is never guessed at', () => {
  const fake = writeFakeGh(scratch, 'gh-no-base', {
    responses: { [PR]: { state: 'OPEN', reviewDecision: 'APPROVED' } },
  });
  const json = runWardEnv(['status', '--json'], ws, { NO_COLOR: '1', WARD_GH: fake });
  expect(JSON.parse(json.stdout).needsYou).toEqual([]);
});

test('the availability semantics are unchanged: without gh, needsYou is omitted entirely', () => {
  const result = runWard(['status', '--json'], ws); // runWard pins WARD_GH to an impossible path
  expect(result.exitCode).toBe(0);
  expect('needsYou' in JSON.parse(result.stdout)).toBe(false);
  const human = runWard(['status'], ws);
  expect(human.stdout).toContain('forge state unavailable (gh)');
  expect(human.stdout).not.toContain('is based on');
});

// -- setup ----------------------------------------------------------------
// One workspace whose `demo` repository is recorded with the forge-shaped
// remote (so the PR URL maps to it and its main line answers `main`), and one
// task linking the incident's PR. No worktrees: the warning derives from the
// record plus the probe alone.

let scratch: string;
let ws: string;

beforeAll(async () => {
  applyGitTestEnv();
  scratch = makeTempDir();
  ws = join(scratch, 'ws');
  await createWorkspace(ws);
  const remote = join(scratch, 'remote.git');
  gitOrThrow('.', 'init', '--bare', '--initial-branch=main', remote);
  process.env.GIT_CONFIG_COUNT = '1';
  process.env.GIT_CONFIG_KEY_0 = `url.${remote}.insteadOf`;
  process.env.GIT_CONFIG_VALUE_0 = REMOTE_URL;
  const seed = join(scratch, 'seed');
  gitOrThrow('.', 'clone', remote, seed);
  await Bun.write(join(seed, 'README.md'), 'demo\n');
  gitOrThrow(seed, 'checkout', '-b', 'main');
  gitOrThrow(seed, 'add', '-A');
  gitOrThrow(seed, 'commit', '-m', 'seed');
  gitOrThrow(seed, 'push', '-u', 'origin', 'main');
  // Adoption reads the seed's origin, so the record carries the forge URL.
  gitOrThrow(seed, 'remote', 'set-url', 'origin', REMOTE_URL);
  await addRepository(ws, seed, 'demo');
  await openTask(ws, 'entry', {});
  await addTaskPr(ws, 't1', PR);
});

afterEach(() => {
  process.env.WARD_GH = NO_GH;
});

afterAll(() => {
  delete process.env.GIT_CONFIG_COUNT;
  delete process.env.GIT_CONFIG_KEY_0;
  delete process.env.GIT_CONFIG_VALUE_0;
  removeDir(scratch);
});
