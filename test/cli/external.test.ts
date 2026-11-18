// External checkouts and repository commands, through the spawned CLI
// (design/0065-external-checkouts-and-repo-commands/): `repo add --external`
// and what every surface then says about a repository whose checkout — and
// whose worktree — stand outside the workspace. Each document is validated
// strictly under its registered schema: the new fields are additions to
// shapes that are a contract. The suite is sequenced; one workspace carries
// the whole story.
import { afterAll, beforeAll, expect, test } from 'bun:test';
import { chmodSync, existsSync, mkdirSync, realpathSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  contextShape,
  repoAddShape,
  repoListShape,
  repoPathShape,
  repoRemoveShape,
  taskCloseShape,
  worktreeCreateShape,
  worktreeListShape,
} from '../../src/cli/schema.ts';
import { gitOrThrow } from '../../src/workspace/git.ts';
import { applyGitTestEnv, callWardEnv, makeTempDir, NO_GH, removeDir } from '../helpers.ts';

test('repo add --external: registered where it stands, and the human form says it is never moved', async () => {
  const added = repoAddShape.parse(await json(['repo', 'add', mine, '--external', '--json']));
  expect(added).toMatchObject({
    name: 'mono',
    outcome: 'registered',
    checkout: 'external',
    path: mine,
  });
  expect(existsSync(join(ws, 'repos', 'mono'))).toBe(false);

  const again = await ward(['repo', 'add', mine, '--external']);
  expect(again.stdout).toContain('already registered mono');
  expect(again.stdout).toContain(
    `checkout  ${mine} (external — bound on this machine, never moved or deleted)`,
  );
});

test('repo list and repo path answer with where the checkout stands on this machine', async () => {
  expect(repoListShape.parse(await json(['repo', 'list', '--json']))).toMatchObject([
    { name: 'mono', checkout: 'external', path: mine },
  ]);
  expect((await ward(['repo', 'list'])).stdout).toContain(`external: ${mine}`);
  expect(repoPathShape.parse(await json(['repo', 'path', 'mono', '--json'])).path).toBe(mine);
  expect((await ward(['repo', 'path', 'mono'])).stdout.trim()).toBe(mine);
});

test('a machine that has not bound it: list says so, path and refresh refuse naming the command', async () => {
  const unbound = { WARD_STATE_DIR: join(scratch, 'another-machine') };
  const [row] = repoListShape.parse(await json(['repo', 'list', '--json'], unbound));
  expect(row).toMatchObject({ name: 'mono', checkout: 'external' });
  expect(row?.path).toBeUndefined();
  expect((await ward(['repo', 'list'], unbound)).stdout).toContain('not bound on this machine');
  for (const verb of [
    ['repo', 'path', 'mono'],
    ['repo', 'refresh', 'mono'],
  ]) {
    const refused = await ward(verb, unbound);
    expect(refused.exitCode).toBe(1);
    expect(refused.stdout + refused.stderr).toContain('ward repo add PATH --external --name mono');
  }
});

test("worktree create with the repository's own command: the record names the outside path and this machine", async () => {
  await ward(['project', 'open', 'main']);
  await ward(['task', 'open', 'work', '--project', '1', '--repo', 'mono']);
  const created = worktreeCreateShape.parse(await json(['worktree', 'create', 'f1t1', '--json']));
  outside = join(trees, 'work');
  expect(created).toMatchObject({ repo: 'mono', branch: 'work', path: outside, machine: 'test' });
  expect(realpathSync(join(ws, 'floors/1-main/f1t1-work'))).toBe(outside);

  expect(worktreeListShape.parse(await json(['worktree', 'list', '--json']))).toMatchObject([
    { address: 'f1t1', path: outside, machine: 'test', present: true },
  ]);
  const shown = (await json(['task', 'show', 'f1t1', '--json'])) as { worktrees: unknown[] };
  expect(shown.worktrees).toMatchObject([{ path: outside, machine: 'test', freshness: 'current' }]);
});

test('ward context walks to an outside worktree through its floor, however the path is spelled', async () => {
  const through = ['AGENTS.md', 'floors/1-main/AGENTS.md'];
  for (const path of [join(outside, 'src'), join(ws, 'floors/1-main/f1t1-work/src')]) {
    const chain = contextShape.parse(await json(['context', path, '--json']));
    expect(chain.path).toBe('floors/1-main/f1t1-work/src');
    expect(chain.chain.map((level) => level.agents)).toEqual(through);
  }
  expect((await ward(['context', join(scratch, 'unrelated')])).exitCode).toBe(1);
});

test('doctor reports the external checkout, the outside worktree, and the commands this machine runs', async () => {
  const out = (await ward(['doctor'])).stdout;
  expect(out).toContain(`external checkout present at ${mine}, reading origin/trunk`);
  expect(out).toContain(`branch 'work' of ${mine}, linked from floors/1-main/f1t1-work`);
  expect(out).toContain(
    `repository mono worktree.create command — runs: ${JSON.stringify([wt, trees, '{branch}', '{base}'])}`,
  );
});

test('task close removes the outside worktree and its link; repo remove leaves the checkout in place', async () => {
  const closed = taskCloseShape.parse(
    await json(['task', 'close', 'f1t1', '--outcome', 'abandoned', '--json']),
  );
  expect(closed.steps).toContainEqual({ step: `worktree ${outside}`, detail: 'discarded' });
  expect(existsSync(outside)).toBe(false);
  expect(existsSync(join(ws, 'floors/1-main/f1t1-work'))).toBe(false);

  const removed = repoRemoveShape.parse(await json(['repo', 'remove', 'mono', '--json']));
  expect(removed).toMatchObject({ name: 'mono', checkout: 'kept', path: mine });
  expect(existsSync(join(mine, 'seed.txt'))).toBe(true);

  await ward(['repo', 'add', mine, '--external']);
  const human = (await ward(['repo', 'remove', 'mono'])).stdout;
  expect(human).toContain(`checkout  ${mine} left in place (external)`);
  expect(human).toContain(`re-add with ward repo add ${mine} --external`);
});

// -- fixtures ---------------------------------------------------------------

let scratch: string;
let ws: string;
let mine: string;
let trees: string;
let wt: string;
let outside: string;
let env: Record<string, string>;

async function ward(argv: string[], extra: Record<string, string> = {}) {
  return await callWardEnv(argv, ws, { ...env, ...extra });
}

async function json(argv: string[], extra: Record<string, string> = {}): Promise<unknown> {
  const result = await ward(argv, extra);
  expect(result.stderr).toBe('');
  expect(result.exitCode).toBe(0);
  return JSON.parse(result.stdout);
}

beforeAll(async () => {
  applyGitTestEnv();
  scratch = makeTempDir();
  ws = join(scratch, 'ws');
  trees = join(scratch, 'their trees');
  const config = join(scratch, 'config');
  env = {
    NO_COLOR: '1',
    WARD_GH: NO_GH,
    WARD_CONFIG_DIR: config,
    WARD_STATE_DIR: join(scratch, 'state'),
  };

  const remote = join(scratch, 'remote', 'mono.git');
  mkdirSync(remote, { recursive: true });
  gitOrThrow('.', 'init', '--bare', '--initial-branch=trunk', remote);
  mine = join(scratch, 'src', 'mono');
  mkdirSync(join(scratch, 'src'));
  gitOrThrow('.', 'clone', remote, mine);
  gitOrThrow(mine, 'checkout', '-b', 'trunk');
  writeFileSync(join(mine, 'seed.txt'), '');
  gitOrThrow(mine, 'add', '-A');
  gitOrThrow(mine, 'commit', '-m', 'seed');
  gitOrThrow(mine, 'push', '-u', 'origin', 'trunk');

  // The machine's own worktree tool: its own layout, outside the workspace.
  wt = join(scratch, 'wt');
  writeFileSync(wt, '#!/bin/sh\nmkdir -p "$1"\ngit worktree add -q -b "$2" "$1/$2" "$3"\n');
  chmodSync(wt, 0o755);
  mkdirSync(config, { recursive: true });
  writeFileSync(
    join(config, 'config.md'),
    [
      '---',
      'type: ward-config',
      'repositories:',
      '  mono:',
      '    worktree:',
      `      create: ["${wt}", "${trees}", "{branch}", "{base}"]`,
      '---',
      '',
    ].join('\n'),
  );
  expect((await callWardEnv(['workspace', 'create', ws], scratch, env)).exitCode).toBe(0);
});

afterAll(() => {
  removeDir(scratch);
});
