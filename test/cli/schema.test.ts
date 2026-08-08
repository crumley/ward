// The self-describing contract (design/0008-json-shape-home/): `ward schema`
// emits the JSON Schema of every --json read verb's output, and the schema is
// proven against the tool's own live output — each verb is run against a real
// workspace and its document validated, strictly, under the shape the schema
// is emitted from. The table derives each verb's argv from its registry key,
// so a future --json verb is covered by adding its registry row, not by
// editing this file.
import { afterAll, beforeAll, expect, test } from 'bun:test';
import { join } from 'node:path';
import { z } from 'zod';
import { jsonVerbShapes } from '../../src/cli/schema.ts';
import { gitOrThrow } from '../../src/workspace/git.ts';
import { applyGitTestEnv, makeTempDir, removeDir, runWard } from '../helpers.ts';

const PR_URL = 'https://example.com/pr/1';

// -- the table: every --json verb, validated live against its own schema ----

for (const [verb, shape] of Object.entries(jsonVerbShapes)) {
  const argv = [...verb.split(' '), '--json'];

  test(`${verb} --json: the live document validates against the verb's schema`, () => {
    const result = runWard(argv, ws);
    expect(result.exitCode).toBe(0);
    expect(() => shape.parse(JSON.parse(result.stdout))).not.toThrow();
  });

  test(`ward schema ${verb}: emits exactly the JSON Schema of the verb's shape`, () => {
    const result = runWard(['schema', ...verb.split(' ')], ws);
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual(JSON.parse(JSON.stringify(z.toJSONSchema(shape))));
  });
}

// -- the whole-contract document -------------------------------------------

test('ward schema: one document covering every --json verb, keyed by its CLI words', () => {
  const result = runWard(['schema'], ws);
  expect(result.exitCode).toBe(0);
  const contract = JSON.parse(result.stdout);
  expect(Object.keys(contract)).toEqual(Object.keys(jsonVerbShapes));
  for (const verb of Object.keys(jsonVerbShapes)) {
    // The slice invariant: the whole-contract entry is the one-verb document.
    const single = JSON.parse(runWard(['schema', ...verb.split(' ')], ws).stdout);
    expect(contract[verb]).toEqual(single);
  }
});

test('ward schema is byte-identical across runs', () => {
  const first = runWard(['schema'], ws);
  const second = runWard(['schema'], ws);
  expect(first.stdout).toBe(second.stdout);
});

test('ward schema needs no workspace — the contract is the build, not the record', () => {
  const result = runWard(['schema'], scratch);
  expect(result.exitCode).toBe(0);
  expect(Object.keys(JSON.parse(result.stdout))).toEqual(Object.keys(jsonVerbShapes));
});

test('an unknown verb is refused legibly, with nothing on stdout', () => {
  const result = runWard(['schema', 'flimflam'], ws);
  expect(result.exitCode).toBe(1);
  expect(result.stdout).toBe('');
  expect(result.stderr).toContain("no --json verb named 'flimflam'");
  expect(result.stderr).toContain('task list'); // the known verbs are named
});

test('the emitted schemas carry the 0005 stability policy', () => {
  // Exact per build (`additionalProperties: false`) — the schema travels with
  // the binary that emits it — and optional fields are simply not required.
  const taskList = JSON.parse(runWard(['schema', 'task', 'list'], ws).stdout);
  const task = taskList.items;
  expect(task.additionalProperties).toBe(false);
  expect(task.required).toEqual(['code', 'slug', 'state', 'prs', 'inReview', 'openedAt']);
  for (const optional of ['floor', 'purpose', 'outcome', 'closedAt']) {
    expect(Object.keys(task.properties)).toContain(optional);
    expect(task.required).not.toContain(optional);
  }
});

// -- setup ----------------------------------------------------------------
// One workspace with the full spine in flight — repo, project, task,
// worktree, session, linked PR — so every verb's live document has substance
// to validate, plus a bare scratch directory for the no-workspace case.

let scratch: string;
let ws: string;

beforeAll(async () => {
  applyGitTestEnv();
  scratch = makeTempDir();
  ws = join(scratch, 'ws');
  runWard(['workspace', 'create', ws], scratch);

  const remote = join(scratch, 'remote.git');
  gitOrThrow('.', 'init', '--bare', '--initial-branch=main', remote);
  const seed = join(scratch, 'seed');
  gitOrThrow('.', 'clone', remote, seed);
  await Bun.write(join(seed, 'README.md'), 'demo\n');
  gitOrThrow(seed, 'checkout', '-b', 'main');
  gitOrThrow(seed, 'add', '-A');
  gitOrThrow(seed, 'commit', '-m', 'seed');
  gitOrThrow(seed, 'push', '-u', 'origin', 'main');

  runWard(['repo', 'add', remote, '--name', 'demo'], ws);
  runWard(['project', 'open', 'agent-output'], ws);
  runWard(
    ['task', 'open', 'json-output', '--project', '1', '--purpose', 'machine-readable output'],
    ws,
  );
  runWard(['worktree', 'create', 't1', '--repo', 'demo'], ws);
  runWard(
    ['session', 'open', 't1', '--purpose', 'drive the feature', '--handle', 'claude:run'],
    ws,
  );
  runWard(['task', 'pr', 't1', PR_URL], ws);
});

afterAll(() => {
  removeDir(scratch);
});
