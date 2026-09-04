// --json on the mutation verbs (design/0015-mutation-json/): every mutation
// verb emits its existing typed report — steps, per-item outcomes, named
// trusts — as one JSON document alone on stdout, validating strictly under
// its registered schema, with the human rendering byte-identical without the
// flag and every exit code unchanged. The suite is sequenced: mutations are
// stateful, so the spine is built through the spawned CLI verb by verb, each
// document validated as the state it just recorded.
import { afterAll, beforeAll, expect, test } from 'bun:test';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import {
  mutationVerbShapes,
  projectOpenShape,
  repoAddShape,
  repoRefreshShape,
  repoRemoveShape,
  sessionMutationShape,
  taskCloseShape,
  taskMutationShape,
  workspaceCreateShape,
  worktreeCreateShape,
  worktreeRebaseShape,
} from '../../src/cli/schema.ts';
import { gitOrThrow } from '../../src/workspace/git.ts';
import {
  applyGitTestEnv,
  makeTempDir,
  removeDir,
  runWard,
  runWardEnv,
  writeFakeGh,
} from '../helpers.ts';

const PR_URL = 'https://example.com/pr/1';

/**
 * Parse a verb's stdout and validate it, strictly, under its registered
 * shape — asserting first that the shape passed for typing is the very one
 * the registry documents for the verb.
 */
function validated<T extends z.ZodType>(verb: string, shape: T, stdout: string): z.output<T> {
  expect(mutationVerbShapes[verb]).toBe(shape);
  return shape.parse(JSON.parse(stdout));
}

// -- the spine, verb by verb ------------------------------------------------

test('workspace create --json: the establishment report, one document alone on stdout', () => {
  const result = runWard(['workspace', 'create', ws, '--json'], scratch);
  expect(result.exitCode).toBe(0);
  const report = validated('workspace create', workspaceCreateShape, result.stdout);
  expect(report.root).toBe(ws);
  expect(report.steps.length).toBe(13); // 0018 added the standing-project step; 0020 the main-line step
  expect(report.steps.every((step) => step.outcome === 'established')).toBe(true);
});

test('re-running create converges — satisfied is legible in the document', () => {
  const result = runWard(['workspace', 'create', ws, '--json'], scratch);
  expect(result.exitCode).toBe(0);
  const report = validated('workspace create', workspaceCreateShape, result.stdout);
  expect(report.steps.every((step) => step.outcome === 'satisfied')).toBe(true);
});

test('repo add --json: the record as written plus how the run converged', () => {
  const first = runWard(['repo', 'add', remote, '--name', 'demo', '--json'], ws);
  expect(first.exitCode).toBe(0);
  const added = validated('repo add', repoAddShape, first.stdout);
  expect(added).toMatchObject({ name: 'demo', outcome: 'registered', mainLine: 'main' });
  expect(added.remote).toBe(remote);

  const again = runWard(['repo', 'add', remote, '--name', 'demo', '--json'], ws);
  expect(validated('repo add', repoAddShape, again.stdout).outcome).toBe('satisfied');
});

test('repo refresh --json: one row per repository; the empty set is []', () => {
  const result = runWard(['repo', 'refresh', '--json'], ws);
  expect(result.exitCode).toBe(0);
  const rows = validated('repo refresh', repoRefreshShape, result.stdout);
  expect(rows).toMatchObject([{ name: 'demo', outcome: 'current' }]);

  const empty = runWard(['repo', 'refresh', '--json'], emptyWs);
  expect(empty.exitCode).toBe(0);
  expect(JSON.parse(empty.stdout)).toEqual([]);
});

test('repo remove --json: the record as it stood, the remote carried as the undo', () => {
  const added = runWard(['repo', 'add', remote, '--name', 'doomed', '--json'], ws);
  expect(added.exitCode).toBe(0);
  const result = runWard(['repo', 'remove', 'doomed', '--json'], ws);
  expect(result.exitCode).toBe(0);
  const removed = validated('repo remove', repoRemoveShape, result.stdout);
  expect(removed).toMatchObject({ name: 'doomed', mainLine: 'main', checkout: 'deleted' });
  expect(removed.remote).toBe(remote);
});

test('project open --json: the opened floor', () => {
  // Floor 1 is the standing workspace project, established by create (0018).
  const result = runWard(['project', 'open', 'agent-output', '--json'], ws);
  expect(result.exitCode).toBe(0);
  const project = validated('project open', projectOpenShape, result.stdout);
  expect(project).toMatchObject({ floor: 2, slug: 'agent-output', state: 'active' });
  expect(typeof project.openedAt).toBe('string');
});

test('task open --json: the record as written, optional fields omitted', () => {
  const result = runWard(
    ['task', 'open', 'json-output', '--project', '2', '--purpose', 'mutation reports', '--json'],
    ws,
  );
  expect(result.exitCode).toBe(0);
  const task = validated('task open', taskMutationShape, result.stdout);
  expect(task).toMatchObject({
    code: 't1',
    address: 'f2t1', // the room composed with its floor (0036)
    slug: 'json-output',
    state: 'active',
    floor: 2,
    purpose: 'mutation reports',
    prs: [],
  });
  expect(task.outcome).toBeUndefined(); // omitted, never null
  expect(task.closedAt).toBeUndefined();
});

test('worktree create --json: identity flat, like the worktree list rows', () => {
  const result = runWard(['worktree', 'create', 't1', '--repo', 'demo', '--json'], ws);
  expect(result.exitCode).toBe(0);
  expect(validated('worktree create', worktreeCreateShape, result.stdout)).toMatchObject({
    task: 't1',
    address: 'f2t1',
    repo: 'demo',
    branch: 'json-output',
    disposition: 'deliverable',
    path: 'worktrees/f2t1-json-output',
  });
});

test('session open --json: the session record, handle included', () => {
  const result = runWard(
    ['session', 'open', 't1', '--purpose', 'drive the feature', '--handle', 'claude:run', '--json'],
    ws,
  );
  expect(result.exitCode).toBe(0);
  expect(validated('session open', sessionMutationShape, result.stdout)).toMatchObject({
    id: 'json-output-1',
    task: 't1',
    purpose: 'drive the feature',
    workingDirectory: 'worktrees/f2t1-json-output',
    handle: 'claude:run',
    state: 'open',
  });
});

test('task pr --json: the grown PR set; repeating converges byte-identically (§6)', () => {
  const first = runWard(['task', 'pr', 't1', PR_URL, '--json'], ws);
  expect(first.exitCode).toBe(0);
  expect(validated('task pr', taskMutationShape, first.stdout).prs).toEqual([PR_URL]);

  const again = runWard(['task', 'pr', 't1', PR_URL, '--json'], ws);
  expect(again.stdout).toBe(first.stdout);
});

test('task pause / resume --json: the state transition as recorded', () => {
  const paused = runWard(['task', 'pause', 't1', '--json'], ws);
  expect(paused.exitCode).toBe(0);
  expect(validated('task pause', taskMutationShape, paused.stdout).state).toBe('paused');

  const resumed = runWard(['task', 'resume', 't1', '--json'], ws);
  expect(resumed.exitCode).toBe(0);
  expect(validated('task resume', taskMutationShape, resumed.stdout).state).toBe('active');
});

test('the human renderings are byte-identical without the flag (pause, resume)', () => {
  const paused = runWard(['task', 'pause', 't1'], ws);
  expect(paused.exitCode).toBe(0);
  expect(paused.stdout).toBe('paused f2t1 — json-output\n');

  const resumed = runWard(['task', 'resume', 't1'], ws);
  expect(resumed.exitCode).toBe(0);
  expect(resumed.stdout).toBe('resumed f2t1 — json-output\n');
});

test('worktree rebase --json: per-worktree rows; current when already atop', () => {
  const result = runWard(['worktree', 'rebase', 't1', '--json'], ws);
  expect(result.exitCode).toBe(0);
  const report = validated('worktree rebase', worktreeRebaseShape, result.stdout);
  expect(report.task).toBe('t1');
  expect(report.address).toBe('f2t1');
  expect(report.reports).toMatchObject([
    { repo: 'demo', branch: 'json-output', path: 'worktrees/f2t1-json-output', outcome: 'current' },
  ]);
});

test('the derivation echo moves to stderr under --json — stdout stays one document', () => {
  const wtDir = join(ws, 'worktrees', 'f2t1-json-output');
  const result = runWard(['task', 'pr', 'https://example.com/pr/2', '--json'], wtDir);
  expect(result.exitCode).toBe(0);
  expect(result.stderr).toContain('task f2t1 — from the working directory');
  expect(validated('task pr', taskMutationShape, result.stdout).prs).toEqual([
    PR_URL,
    'https://example.com/pr/2',
  ]);
});

test('session close --json: closed, with closedAt recorded', () => {
  const result = runWard(['session', 'close', 'json-output-1', '--json'], ws);
  expect(result.exitCode).toBe(0);
  const session = validated('session close', sessionMutationShape, result.stdout);
  expect(session).toMatchObject({ id: 'json-output-1', state: 'closed' });
  expect(typeof session.closedAt).toBe('string');
});

test('task close --json, forge unavailable: the named trust survives in the steps', () => {
  // runWard pins WARD_GH at an impossible executable, so the probe cannot
  // answer — the degraded close trusts the stated outcome and says so (0012).
  const result = runWard(['task', 'close', 't1', '--json'], ws);
  expect(result.exitCode).toBe(0);
  const report = validated('task close', taskCloseShape, result.stdout);
  expect(report.outcome).toBe('delivered');
  expect(report.task).toMatchObject({ code: 't1', state: 'closed', outcome: 'delivered' });
  expect(typeof report.task.closedAt).toBe('string');
  const steps = new Map(report.steps.map((step) => [step.step, step.detail]));
  expect(steps.get('pr set')).toBe("forge unavailable — trusting the stated outcome 'delivered'");
  expect(steps.get('worktree worktrees/f2t1-json-output')).toBe('removed');
  expect(steps.get('record')).toBe('closed with outcome delivered');
});

// -- the error posture ------------------------------------------------------

test('a refused close emits no document: stderr + exit 1, stdout empty', () => {
  const opened = runWard(['task', 'open', 'refused', '--json'], ws);
  refusedCode = validated('task open', taskMutationShape, opened.stdout).address;
  const pr = 'https://example.com/pr/3';
  runWard(['task', 'pr', refusedCode, pr, '--json'], ws);
  const fakeGh = writeFakeGh(scratch, 'gh-open-pr', {
    responses: { [pr]: { state: 'OPEN', reviewDecision: 'REVIEW_REQUIRED' } },
  });
  const result = runWardEnv(['task', 'close', refusedCode, '--json'], ws, {
    NO_COLOR: '1',
    WARD_GH: fakeGh,
  });
  expect(result.exitCode).toBe(1);
  expect(result.stdout).toBe('');
  expect(result.stderr).toContain('a linked PR is still open');
});

test('a rebase conflict under --json: the outcome in the document, the verdict in $?', () => {
  runWard(['worktree', 'create', refusedCode, '--repo', 'demo', '--json'], ws);
  const wtDir = join(ws, 'worktrees', `${refusedCode}-refused`);
  writeFileSync(join(wtDir, 'README.md'), 'ours\n');
  gitOrThrow(wtDir, 'add', '-A');
  gitOrThrow(wtDir, 'commit', '-m', 'ours');
  advanceRemote('README.md', 'theirs\n');

  const result = runWard(['worktree', 'rebase', refusedCode, '--json'], ws);
  expect(result.exitCode).toBe(1);
  const report = validated('worktree rebase', worktreeRebaseShape, result.stdout);
  expect(report.reports).toMatchObject([{ branch: 'refused', outcome: 'conflict' }]);
  const detail = report.reports[0]?.detail ?? '';
  expect(detail).toContain('README.md');
  expect(detail).toContain('exactly as it was');
});

test('worktree rebase --json on a task with no worktrees: reports is []', () => {
  const opened = runWard(['task', 'open', 'bare', '--json'], ws);
  const address = validated('task open', taskMutationShape, opened.stdout).address;
  const result = runWard(['worktree', 'rebase', address, '--json'], ws);
  expect(result.exitCode).toBe(0);
  expect(validated('worktree rebase', worktreeRebaseShape, result.stdout)).toEqual({
    task: address.replace(/^f\d+/, ''),
    address,
    reports: [],
  });
});

// -- the contract's home ----------------------------------------------------
// `ward schema <verb>` documents every mutation shape — the same one-place
// registry growth the read verbs got in 0008.

for (const [verb, shape] of Object.entries(mutationVerbShapes)) {
  test(`ward schema ${verb}: emits exactly the JSON Schema of the verb's shape`, () => {
    const result = runWard(['schema', ...verb.split(' ')], scratch);
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual(JSON.parse(JSON.stringify(z.toJSONSchema(shape))));
  });
}

// -- setup ------------------------------------------------------------------
// One scratch area; the spine workspace is created by the first test (that
// *is* the workspace create case), plus an empty workspace for the empty-set
// shapes and a bare remote the repo verbs work against.

let scratch: string;
let ws: string;
let emptyWs: string;
let remote: string;
let refusedCode: string;

/** Advance the remote's main line via a staging clone (the 0011 test idiom). */
function advanceRemote(file: string, content: string): void {
  const stage = join(scratch, `stage-${file.replaceAll('/', '-')}-${Date.now()}`);
  gitOrThrow('.', 'clone', remote, stage);
  writeFileSync(join(stage, file), content);
  gitOrThrow(stage, 'add', '-A');
  gitOrThrow(stage, 'commit', '-m', `advance main: ${file}`);
  gitOrThrow(stage, 'push', 'origin', 'main');
}

beforeAll(async () => {
  applyGitTestEnv();
  scratch = makeTempDir();
  ws = join(scratch, 'ws');
  emptyWs = join(scratch, 'empty');
  runWard(['workspace', 'create', emptyWs], scratch);

  remote = join(scratch, 'remote.git');
  gitOrThrow('.', 'init', '--bare', '--initial-branch=main', remote);
  const seed = join(scratch, 'seed');
  gitOrThrow('.', 'clone', remote, seed);
  await Bun.write(join(seed, 'README.md'), 'demo\n');
  gitOrThrow(seed, 'checkout', '-b', 'main');
  gitOrThrow(seed, 'add', '-A');
  gitOrThrow(seed, 'commit', '-m', 'seed');
  gitOrThrow(seed, 'push', '-u', 'origin', 'main');
});

afterAll(() => {
  removeDir(scratch);
});
