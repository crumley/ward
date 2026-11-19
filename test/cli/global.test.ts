// Working from anywhere (design/0024-global-config-registry/), through the
// spawned CLI: the registry verbs and their idempotency, the two path verbs
// whose stdout is nothing but a path, the registry-backed fallback for a
// human standing outside any workspace — echoed on stderr, refused to a
// declared agent (the §8 asymmetry 0006 set) — and the MRU recency an
// invocation leaves behind. Every case runs against its own global state
// directory, so nothing here touches the machine's real registry.
import { afterAll, beforeAll, beforeEach, expect, test } from 'bun:test';
import { rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { runCli } from '../../src/cli/in-process.ts';
import { argumentReadVerbShapes, repoPathShape, workspacePathShape } from '../../src/cli/schema.ts';
import { addRepository } from '../../src/workspace/repos.ts';
import { applyGitTestEnv, type CliResult, makeTempDir, NO_GH, removeDir } from '../helpers.ts';
import { preparedRemote, preparedWorkspace } from '../prepared.ts';

// -- the registry verbs ----------------------------------------------------

test('register, list, default, unregister — the machine-level entry set', async () => {
  expect((await ward(['workspace', 'list'], scratch)).stdout).toContain('no workspaces registered');

  const registered = await ward(['workspace', 'register'], alpha);
  expect(registered.exitCode).toBe(0);
  expect(registered.stdout).toBe(`registered alpha ${alpha} (default)\n`);
  expect((await ward(['workspace', 'register'], alpha)).stdout).toBe(
    `unchanged alpha ${alpha} (default)\n`,
  );

  await ward(['workspace', 'register', beta], scratch);
  // MRU order: beta was registered last, so it leads; alpha keeps the star.
  expect((await ward(['workspace', 'list'], scratch)).stdout).toBe(
    `    beta ${beta}\n  * alpha ${alpha}\n`,
  );

  expect((await ward(['workspace', 'default', 'beta'], scratch)).stdout).toBe(
    `default set beta ${beta} (default)\n`,
  );
  expect((await ward(['workspace', 'unregister', 'beta'], scratch)).stdout).toBe(
    `unregistered beta ${beta}\n`,
  );
  expect((await ward(['workspace', 'list'], scratch)).stdout).toBe(`  * alpha ${alpha}\n`);
});

test('the registry mutations emit one document under --json, outcome included', async () => {
  const registered = JSON.parse((await ward(['workspace', 'register', '--json'], alpha)).stdout);
  expect(registered).toEqual({
    name: 'alpha',
    path: alpha,
    default: true,
    outcome: 'registered',
  });
  expect(JSON.parse((await ward(['workspace', 'register', '--json'], alpha)).stdout).outcome).toBe(
    'satisfied',
  );
  expect(
    JSON.parse((await ward(['workspace', 'unregister', 'alpha', '--json'], scratch)).stdout),
  ).toEqual({
    name: 'alpha',
    path: alpha,
    default: false,
    outcome: 'unregistered',
  });
});

test('a stale entry is reported, never hidden, and never resolved to', async () => {
  await ward(['workspace', 'register'], alpha);
  await ward(['workspace', 'register', beta], scratch);
  rmSync(join(beta, '.ward'), { recursive: true });

  expect((await ward(['workspace', 'list'], scratch)).stdout).toContain(
    '(stale — no workspace at that path)',
  );
  expect(JSON.parse((await ward(['workspace', 'list', '--json'], scratch)).stdout)).toMatchObject([
    { name: 'beta', stale: true },
    { name: 'alpha', stale: false },
  ]);
  // Resolution skips it: the fallback is alpha, and naming it is refused.
  expect((await ward(['workspace', 'path'], scratch)).stdout).toBe(`${alpha}\n`);
  const named = await ward(['workspace', 'path', 'beta'], scratch);
  expect(named.exitCode).toBe(1);
  expect(named.stdout).toBe('');
  expect(named.stderr).toContain('ward workspace unregister beta');
});

test('a registry that will not read is said so — never reported as "nothing registered"', async () => {
  await ward(['workspace', 'register'], alpha);
  writeFileSync(join(state, 'workspaces.md'), 'not a document\n');

  expect((await ward(['workspace', 'list'], scratch)).stdout).toContain(
    'the registry could not be read',
  );
  expect(JSON.parse((await ward(['workspace', 'list', '--json'], scratch)).stdout)).toEqual([]);
  expect((await ward(['workspace', 'path'], scratch)).stderr).toContain('could not be read');
  // And the workspace-local command it has nothing to do with is unaffected.
  expect((await ward(['task', 'list'], alpha)).exitCode).toBe(0);
});

// -- the path verbs: stdout is the path, and nothing else ------------------

test('workspace path: the default when unnamed, any registered name otherwise', async () => {
  const empty = await ward(['workspace', 'path'], scratch);
  expect(empty.exitCode).toBe(1);
  expect(empty.stderr).toContain('ward workspace register');

  await ward(['workspace', 'register'], alpha);
  await ward(['workspace', 'register', beta], scratch);
  expect((await ward(['workspace', 'path'], scratch)).stdout).toBe(`${alpha}\n`);
  expect((await ward(['workspace', 'path', 'beta'], scratch)).stdout).toBe(`${beta}\n`);
  expect((await ward(['workspace', 'path', 'beta'], scratch)).stderr).toBe('');
});

test('repo path: the checkout, found by search order, with the crossing echoed on stderr', async () => {
  await ward(['workspace', 'register'], alpha);
  await ward(['workspace', 'register', beta], scratch);

  // Standing in beta, beta's own copy answers and nothing is echoed — the
  // location is not an implicit input, it is where the caller is.
  const inBeta = await ward(['repo', 'path', 'shared'], beta);
  expect(inBeta.stdout).toBe(`${join(beta, 'repos', 'shared')}\n`);
  expect(inBeta.stderr).toBe('');

  // Standing outside, the default answers, and says so on stderr.
  const outside = await ward(['repo', 'path', 'shared'], scratch);
  expect(outside.stdout).toBe(`${join(alpha, 'repos', 'shared')}\n`);
  expect(outside.stderr).toContain(`workspace alpha — ${alpha} (from the registry)`);

  // A name only beta has is still found: the search continues past the default.
  expect((await ward(['repo', 'path', 'beta-only'], scratch)).stdout).toBe(
    `${join(beta, 'repos', 'beta-only')}\n`,
  );
  // --workspace asks exactly one, and a miss names where it looked.
  const missed = await ward(['repo', 'path', 'beta-only', '--workspace', 'alpha'], scratch);
  expect(missed.exitCode).toBe(1);
  expect(missed.stdout).toBe('');
  expect(missed.stderr).toContain(`no repository named 'beta-only' is registered in 'alpha'`);
});

test('an explicit target that names nothing is refused — never answered by where the caller stands', async () => {
  await ward(['workspace', 'register'], alpha);
  await ward(['workspace', 'register', beta], scratch);

  // Standing in beta, an unknown --workspace must not quietly become beta.
  const ghost = await ward(['repo', 'path', 'shared', '--workspace', 'ghost'], beta);
  expect(ghost.exitCode).toBe(1);
  expect(ghost.stdout).toBe('');
  expect(ghost.stderr).toContain("no registered workspace named 'ghost'");

  // Same class: a typo'd path must not register the workspace it sits under.
  const typo = await ward(['workspace', 'register', './typpo'], beta);
  expect(typo.exitCode).toBe(1);
  expect(typo.stderr).toContain('no Ward workspace encloses');
  expect(names((await ward(['workspace', 'list', '--json'], scratch)).stdout)).toEqual([
    'beta',
    'alpha',
  ]);
});

test('a stale registry lock is taken over silently — a convenience never noises up a command', async () => {
  await ward(['workspace', 'register'], alpha);
  await ward(['workspace', 'register', beta], scratch); // beta leads; alpha will want a write
  const holder = {
    pid: 999_999,
    host: 'somewhere-else',
    verb: 'workspace register',
    caller: 'human',
    startedAt: new Date(Date.now() - 120_000).toISOString(),
    nonce: 'abandoned',
  };
  writeFileSync(join(state, 'workspace-registry.lock'), `${JSON.stringify(holder)}\n`);

  const result = await ward(['task', 'list'], alpha);
  expect(result.exitCode).toBe(0);
  expect(result.stderr).toBe(''); // no takeover note out of an invisible write
  expect(names((await ward(['workspace', 'list', '--json'], scratch)).stdout)).toEqual([
    'alpha',
    'beta',
  ]);
  // But doctor names it while it is there — the lock's own refusal promises so.
  writeFileSync(join(state, 'workspace-registry.lock'), `${JSON.stringify(holder)}\n`);
  expect((await ward(['doctor'], scratch)).stdout).toContain('! workspace registry lock — stale');
});

test('both path verbs serve an agent too: they are registry queries, not inferences', async () => {
  await ward(['workspace', 'register'], alpha);
  const asAgent = { WARD_AGENT: 'sess-1' };
  expect((await ward(['workspace', 'path'], scratch, asAgent)).stdout).toBe(`${alpha}\n`);
  expect((await ward(['repo', 'path', 'shared'], scratch, asAgent)).stdout).toBe(
    `${join(alpha, 'repos', 'shared')}\n`,
  );
});

// -- resolution from anywhere ----------------------------------------------

test('a human outside any workspace gets the default, echoed on stderr', async () => {
  await ward(['workspace', 'register'], alpha);
  const status = await ward(['status'], scratch);
  expect(status.exitCode).toBe(0);
  expect(status.stderr).toContain(`workspace alpha — ${alpha} (from the registry)`);
  expect(status.stdout).toContain('Workspace: active');

  // Under --json the echo stays on stderr: stdout carries one document, alone.
  const json = await ward(['task', 'list', '--json'], scratch);
  expect(json.stderr).toContain('(from the registry)');
  expect(() => JSON.parse(json.stdout)).not.toThrow();
});

test('standing inside a workspace always wins over the registry, with nothing echoed', async () => {
  await ward(['workspace', 'register'], alpha);
  await ward(['workspace', 'register', beta], scratch);
  const inBeta = await ward(['repo', 'list'], beta);
  expect(inBeta.stderr).toBe('');
  expect(inBeta.stdout).toContain('beta-only'); // beta's repositories, not the default's
});

test('a declared agent is refused the fallback — it stands in a workspace explicitly', async () => {
  await ward(['workspace', 'register'], alpha);
  const result = await ward(['status'], scratch, { WARD_AGENT: 'sess-1' });
  expect(result.exitCode).toBe(1);
  expect(result.stderr).toContain('a declared agent stands in one explicitly');
  expect(result.stdout).toBe('');
});

test('with nothing registered, the miss is the old deterministic error plus the new remedy', async () => {
  const result = await ward(['status'], scratch);
  expect(result.exitCode).toBe(1);
  expect(result.stderr).toContain('ward workspace create PATH');
  expect(result.stderr).toContain('ward workspace register PATH');
});

// -- recency ---------------------------------------------------------------

test('an invocation inside a registered workspace makes it the most recently used', async () => {
  await ward(['workspace', 'register'], alpha);
  await ward(['workspace', 'register', beta], scratch);
  expect(names((await ward(['workspace', 'list', '--json'], scratch)).stdout)).toEqual([
    'beta',
    'alpha',
  ]);

  await ward(['task', 'list'], alpha);
  expect(names((await ward(['workspace', 'list', '--json'], scratch)).stdout)).toEqual([
    'alpha',
    'beta',
  ]);
  const listed = JSON.parse((await ward(['workspace', 'list', '--json'], scratch)).stdout);
  expect(typeof listed[0].lastUsedAt).toBe('string');
});

test('a completion callback is machinery, not usage: it never churns the recency', async () => {
  await ward(['workspace', 'register'], alpha);
  await ward(['workspace', 'register', beta], scratch);
  await ward(['task', 'list'], beta); // beta leads
  const before = (await ward(['workspace', 'list', '--json'], scratch)).stdout;

  expect((await ward(['completion', 'fish', 'task', 'pause', ''], alpha)).exitCode).toBe(0);
  expect((await ward(['workspace', 'list', '--json'], scratch)).stdout).toBe(before);
});

// -- the shell's own half --------------------------------------------------

test('completion offers registered workspace names, and repo names across the search order', async () => {
  await ward(['workspace', 'register'], alpha);
  await ward(['workspace', 'register', beta], scratch);

  const workspaces = (await ward(['completion', 'fish', 'workspace', 'path', ''], scratch)).stdout;
  expect(workspaces).toContain(`alpha\t${alpha}`);
  expect(workspaces).toContain(`beta\t${beta}`);

  // `repo path` completes every name the verb would actually find, with the
  // workspace that would answer as the cue.
  const repos = (await ward(['completion', 'fish', 'repo', 'path', ''], scratch)).stdout;
  expect(repos).toContain('shared\talpha');
  expect(repos).toContain('beta-only\tbeta');
  // Standing in beta, `shared` is beta's — the cue follows the search order.
  expect((await ward(['completion', 'fish', 'repo', 'path', ''], beta)).stdout).toContain(
    'shared\tbeta',
  );
});

// -- the --json contract ---------------------------------------------------

test('the path verbs validate against their registered shapes, and ward schema emits them', async () => {
  await ward(['workspace', 'register'], alpha);
  const workspacePath = JSON.parse((await ward(['workspace', 'path', '--json'], scratch)).stdout);
  expect(argumentReadVerbShapes['workspace path']).toBe(workspacePathShape);
  expect(workspacePathShape.parse(workspacePath)).toEqual({ name: 'alpha', path: alpha });

  const repoPath = JSON.parse((await ward(['repo', 'path', 'shared', '--json'], scratch)).stdout);
  expect(argumentReadVerbShapes['repo path']).toBe(repoPathShape);
  expect(repoPathShape.parse(repoPath)).toEqual({
    repo: 'shared',
    workspace: 'alpha',
    workspacePath: alpha,
    path: join(alpha, 'repos', 'shared'),
  });

  for (const [verb, shape] of Object.entries(argumentReadVerbShapes)) {
    const emitted = await ward(['schema', ...verb.split(' ')], scratch);
    expect(emitted.exitCode).toBe(0);
    expect(JSON.parse(emitted.stdout)).toEqual(JSON.parse(JSON.stringify(z.toJSONSchema(shape))));
  }
});

// -- doctor names what degrades (§20) --------------------------------------

test('doctor names the registry and the global config, and never fails over them', async () => {
  const empty = await ward(['doctor'], scratch);
  expect(empty.stdout).toContain('i workspace registry — no registry at');
  expect(empty.stdout).toContain('i global config — none at');

  await ward(['workspace', 'register'], alpha);
  expect((await ward(['doctor'], scratch)).stdout).toContain(
    "✓ workspace registry — 1 registered — 'alpha' answers from outside a workspace",
  );

  rmSync(join(alpha, '.ward'), { recursive: true });
  const stale = await ward(['doctor'], scratch);
  expect(stale.stdout).toContain('! workspace registry — 1 registered, 1 stale (alpha)');
  expect(stale.stdout).toContain('ward workspace unregister alpha');
  expect(stale.exitCode).toBe(0); // a convenience is never an error
});

// -- setup -----------------------------------------------------------------
// A fresh global state directory per case (the registry verbs mutate it), two
// workspaces — `alpha` with a repository `shared`, `beta` with `shared` and
// `beta-only` — and one bare remote behind them all.

let scratch: string;
let remote: string;
let alpha: string;
let beta: string;
let state: string;
let caseId = 0;

function names(json: string): string[] {
  return (JSON.parse(json) as { name: string }[]).map((entry) => entry.name);
}

/**
 * The CLI, in-process (design/0074-in-process-cli-tests/), with this case's
 * global directories and a hermetic environment.
 */
function ward(argv: string[], cwd: string, env: Record<string, string> = {}): Promise<CliResult> {
  return runCli({
    argv,
    cwd,
    env: {
      ...process.env,
      NO_COLOR: '1',
      WARD_GH: NO_GH,
      WARD_STATE_DIR: state,
      WARD_CONFIG_DIR: join(state, '..', 'config'),
      WARD_AGENT: undefined,
      ...env,
    },
  });
}

beforeAll(async () => {
  applyGitTestEnv();
  scratch = makeTempDir();
  remote = join(scratch, 'remote.git');
  preparedRemote(remote, { branch: 'main', files: { 'README.md': 'demo\n' } });
});

beforeEach(async () => {
  caseId += 1;
  const home = join(scratch, `case-${caseId}`);
  state = join(home, 'state');
  alpha = join(home, 'alpha');
  beta = join(home, 'beta');
  await preparedWorkspace(alpha);
  await preparedWorkspace(beta);
  await addRepository(alpha, remote, 'shared');
  await addRepository(beta, remote, 'shared');
  await addRepository(beta, remote, 'beta-only');
});

afterAll(() => {
  removeDir(scratch);
});
