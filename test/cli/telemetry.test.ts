// Local usage telemetry (design/0013-telemetry-and-serialized-writes/): one
// JSONL row per invocation, human- and agent-shaped callers both recorded;
// a telemetry failure never touches the command's exit code or output; and
// nothing telemetry-related ever shows in the store's git status — even in
// a workspace whose root .gitignore predates the telemetry ignore line.
import { afterAll, beforeAll, beforeEach, expect, test } from 'bun:test';
import { existsSync, readdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import pkg from '../../package.json' with { type: 'json' };
import { verbPath } from '../../src/cli/telemetry.ts';
import { createWorkspace } from '../../src/workspace/create.ts';
import { runDoctor } from '../../src/workspace/doctor.ts';
import { gitOrThrow } from '../../src/workspace/git.ts';
import { addRepository } from '../../src/workspace/repos.ts';
import { openTask } from '../../src/workspace/tasks.ts';
import { createWorktree } from '../../src/workspace/worktrees.ts';
import { applyGitTestEnv, makeTempDir, NO_GH, removeDir, runWard, runWardEnv } from '../helpers.ts';

test('a human invocation appends one row: verb, caller, cwd, outcome, duration', () => {
  const result = runWard(['status'], ws);
  expect(result.exitCode).toBe(0);

  const rows = telemetryRows(ws);
  expect(rows.length).toBe(1);
  const row = rows[0] as Record<string, unknown>;
  expect(row.verb).toBe('status');
  expect(row.caller).toBe('human');
  expect(row.agent).toBeUndefined();
  expect(realpathSync(String(row.cwd))).toBe(realpathSync(ws));
  expect(row.exit).toBe(0);
  expect(typeof row.ms).toBe('number');
  expect(Number.isNaN(Date.parse(String(row.at)))).toBe(false);
  expect(row.ward).toBe(pkg.version);
});

test('a declared agent is recorded as one, with its declared value', () => {
  const result = runWardEnv(['task', 'list'], ws, { WARD_AGENT: 'sess-42', WARD_GH: NO_GH });
  expect(result.exitCode).toBe(0);
  const row = telemetryRows(ws)[0] as Record<string, unknown>;
  expect(row.verb).toBe('task list');
  expect(row.caller).toBe('agent');
  expect(row.agent).toBe('sess-42');
});

test('a failing command records its verb and non-zero outcome', () => {
  const result = runWard(['task', 'pause', 't99'], ws);
  expect(result.exitCode).toBe(1);
  const row = telemetryRows(ws)[0] as Record<string, unknown>;
  expect(row.verb).toBe('task pause');
  expect(row.exit).toBe(1);
});

test('the verb path is the command words, never the arguments', () => {
  const table: ReadonlyArray<[string[], string]> = [
    [[], 'version'],
    [['-v'], 'version'],
    [['--help'], 'help'],
    [['status', '--json'], 'status'],
    [['task', 'open', 'my-secret-slug'], 'task open'],
    [['task', 'nonsense'], 'task'],
    [['session', 'open', 't1', '--purpose', 'long private text'], 'session open'],
    // The registry verbs (design/0023-global-config-registry/) — the path
    // verbs' argument is an identity, never part of the verb.
    [['workspace', 'register'], 'workspace register'],
    [['workspace', 'path', 'main'], 'workspace path'],
    [['repo', 'path', 'ward'], 'repo path'],
    [['frobnicate', 'everything'], 'frobnicate'],
  ];
  for (const [argv, expected] of table) {
    expect(verbPath(argv)).toBe(expected);
  }
});

test('the row records the invocation scope, anchor-shaped: task, repo, workspace', async () => {
  // A registered repository and a claimed worktree to stand in.
  const remote = join(scratch, `remote-${caseId}.git`);
  gitOrThrow('.', 'init', '--bare', '--initial-branch=main', remote);
  const seed = join(scratch, `seed-${caseId}`);
  gitOrThrow('.', 'clone', remote, seed);
  await Bun.write(join(seed, 'src', 'lib.ts'), 'export {};\n');
  gitOrThrow(seed, 'checkout', '-b', 'main');
  gitOrThrow(seed, 'add', '-A');
  gitOrThrow(seed, 'commit', '-m', 'seed');
  gitOrThrow(seed, 'push', '-u', 'origin', 'main');
  await addRepository(ws, remote, 'demo');
  await openTask(ws, 'scoped', {});
  const { record } = await createWorktree(ws, 't1', 'demo');

  const table: ReadonlyArray<[string, string]> = [
    [ws, 'workspace'],
    [join(ws, record.path), 'task:t1'],
    [join(ws, record.path, 'src'), 'task:t1'],
    [join(ws, 'repos', 'demo'), 'repo:demo'],
  ];
  for (const [dir, expected] of table) {
    expect(runWard(['task', 'list'], dir).exitCode).toBe(0);
    const row = telemetryRows(ws).at(-1) as Record<string, unknown>;
    expect(row.scope).toBe(expected);
  }
});

test('a telemetry failure never fails or noisies the command it records', async () => {
  // Blocked at the root: a file where the telemetry directory must go.
  writeFileSync(join(ws, '.ward', 'telemetry'), 'not a directory\n');
  const blocked = runWard(['status'], ws);
  const healthy = runWard(['status'], await freshWorkspace());
  expect(blocked.exitCode).toBe(0);
  expect(blocked.stdout).toBe(healthy.stdout); // the command's work is the work
  expect(blocked.stderr).toBe(healthy.stderr); // and no complaint rides along
});

test('nothing telemetry-related ever shows in the store git status', async () => {
  runWard(['status'], ws);
  runWard(['task', 'open', 'tracked-check'], ws);
  expect(existsSync(join(ws, '.ward', 'telemetry'))).toBe(true);
  expect(gitOrThrow(ws, 'status', '--porcelain').stdout.trim()).toBe('');

  // A workspace created before 0013's ignore lines: the telemetry directory
  // defends itself with its own catch-all .gitignore.
  const old = await freshWorkspace();
  const gitignore = join(old, '.gitignore');
  const stripped = readFileSync(gitignore, 'utf8')
    .split('\n')
    .filter((line) => !line.includes('.ward/telemetry') && !line.includes('.ward/store.lock'))
    .join('\n');
  writeFileSync(gitignore, stripped);
  gitOrThrow(old, 'add', '--', '.gitignore');
  gitOrThrow(old, 'commit', '-m', 'simulate a pre-0013 ignore policy');

  runWard(['status'], old);
  expect(existsSync(join(old, '.ward', 'telemetry', '.gitignore'))).toBe(true);
  expect(gitOrThrow(old, 'status', '--porcelain').stdout).not.toContain('telemetry');
});

test('outside any workspace, nothing is recorded and nothing is created', () => {
  const nowhere = makeTempDir();
  const result = runWard(['doctor'], nowhere);
  expect(result.exitCode).toBe(0);
  expect(existsSync(join(nowhere, '.ward'))).toBe(false);
  removeDir(nowhere);
});

test('doctor guards the boundary: tracked telemetry is a warning, local is ok', async () => {
  runWard(['status'], ws); // produce a telemetry file
  expect(telemetryFinding(await runDoctor(ws))?.severity).toBe('ok');

  const shard = readdirSync(join(ws, '.ward', 'telemetry')).find((f) => f.endsWith('.jsonl'));
  expect(shard).toBeDefined();
  gitOrThrow(ws, 'add', '-f', '--', `.ward/telemetry/${shard}`);
  gitOrThrow(ws, 'commit', '-m', 'wrongly track telemetry');
  const finding = telemetryFinding(await runDoctor(ws));
  expect(finding?.severity).toBe('warn');
  expect(finding?.message).toContain('local and personal');
  expect(finding?.message).toContain('git rm -r --cached .ward/telemetry');
});

// -- helpers --------------------------------------------------------------

function telemetryRows(root: string): unknown[] {
  const dir = join(root, '.ward', 'telemetry');
  const shards = readdirSync(dir)
    .filter((name) => name.endsWith('.jsonl'))
    .sort();
  return shards.flatMap((name) =>
    readFileSync(join(dir, name), 'utf8')
      .split('\n')
      .filter((line) => line !== '')
      .map((line) => JSON.parse(line)),
  );
}

function telemetryFinding(report: Awaited<ReturnType<typeof runDoctor>>) {
  return report.workspace.find((finding) => finding.check === 'telemetry');
}

async function freshWorkspace(): Promise<string> {
  caseId += 1;
  const dir = join(scratch, `ws-${caseId}`);
  await createWorkspace(dir);
  return dir;
}

// -- setup ----------------------------------------------------------------

let scratch: string;
let ws: string;
let caseId = 0;

beforeAll(() => {
  applyGitTestEnv();
  scratch = makeTempDir();
});

beforeEach(async () => {
  caseId += 1;
  ws = join(scratch, `ws-${caseId}`);
  await createWorkspace(ws);
});

afterAll(() => {
  removeDir(scratch);
});
