// A repository's own commands (design/0065-external-checkouts-and-repo-commands/):
// an argument list, never a shell string. What is verified here is the one
// property the whole feature leans on — a value Ward substitutes is data
// wherever it lands: one argument stays one argument, and nothing in a branch
// name or a path is ever parsed as syntax.
import { afterAll, beforeAll, expect, test } from 'bun:test';
import { chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  COMMAND_VALUES,
  type CommandKind,
  describeFailure,
  expandCommand,
  runRepositoryCommand,
  shellWord,
  unknownPlaceholders,
} from '../../src/workspace/commands.ts';
import { makeTempDir, removeDir } from '../helpers.ts';

const HOSTILE = 'feat/$(touch pwned);`touch pwned`&&x|"q\'';

const EXPANSIONS: readonly (readonly [string, readonly string[], readonly string[]])[] = [
  ['a value fills a whole argument', ['tool', '{branch}'], ['tool', 'b']],
  [
    'a value fills part of an argument',
    ['tool', '--at={path}'],
    ['tool', '--at=/a path/with spaces'],
  ],
  ['a path with spaces stays one argument', ['tool', '{path}'], ['tool', '/a path/with spaces']],
  ['two values in one argument', ['{repo}:{branch}'], ['mono:b']],
  [
    'braces that are not a placeholder pass through',
    ['{}', '{A}', '${x}', '{a-b}'],
    ['{}', '{A}', '${x}', '{a-b}'],
  ],
  ['a literal with no placeholder is untouched', ['git', 'fetch'], ['git', 'fetch']],
];

test.each(EXPANSIONS)('expand: %s', (_name, argv, expected) => {
  const values = { repo: 'mono', branch: 'b', path: '/a path/with spaces' };
  expect(expandCommand('worktree.create', argv, values)).toEqual([...expected]);
});

test('expand: shell metacharacters in a value arrive verbatim, as one argument', () => {
  expect(
    expandCommand('worktree.create', ['tool', 'new', '{branch}'], { branch: HOSTILE }),
  ).toEqual(['tool', 'new', HOSTILE]);
});

test('expand: a value that looks like a placeholder is not expanded a second time', () => {
  const values = { branch: '{path}', path: '/secret' };
  expect(expandCommand('worktree.create', ['{branch}'], values)).toEqual(['{path}']);
});

const UNKNOWN: readonly (readonly [CommandKind, readonly string[], readonly string[]])[] = [
  ['update', ['sync', '{branch}'], ['branch']], // an update has no task and no branch
  ['update', ['sync', '{checkout}', '{mainline}'], []],
  ['worktree.create', ['wt', '{outcome}'], ['outcome']], // only removal has an outcome
  ['worktree.create', ['wt', '{task}', '{branch}', '{base}', '{path}'], []],
  ['worktree.remove', ['wt', '{base}', '{typo}'], ['base', 'typo']],
  ['worktree.remove', ['wt', '{path}', '{outcome}'], []],
];

test.each(UNKNOWN)('placeholders of %s: %j → unknown %j', (kind, argv, unknown) => {
  expect(unknownPlaceholders(kind, argv)).toEqual([...unknown]);
  if (unknown.length > 0) {
    expect(() => expandCommand(kind, argv, {})).toThrow(/which Ward does not provide/);
  }
});

test('every kind is given the repository values', () => {
  for (const kind of Object.keys(COMMAND_VALUES) as CommandKind[]) {
    expect(COMMAND_VALUES[kind]).toEqual(
      expect.arrayContaining(['repo', 'checkout', 'mainline', 'remote', 'workspace']),
    );
  }
});

test('run: the values reach the program as arguments and as environment, in the given directory', async () => {
  const out = join(scratch, 'seen.txt');
  const script = writeScript(
    'record',
    `{ printf '%s\\n' "$#" "$1" "$2" "$WARD_BRANCH" "$WARD_WORKTREE_PATH" "$WARD_TASK"; pwd; } > "${out}"`,
  );
  const cwd = join(scratch, 'a dir');
  Bun.spawnSync(['mkdir', '-p', cwd]);
  const run = await runRepositoryCommand(
    'worktree.create',
    [script, '{branch}', '{path}'],
    { branch: HOSTILE, path: '/a path/with spaces', task: 'f1t1' },
    cwd,
  );
  expect(run.exitCode).toBe(0);
  expect(readFileSync(out, 'utf8').trim().split('\n')).toEqual([
    '2',
    HOSTILE,
    '/a path/with spaces',
    HOSTILE,
    '/a path/with spaces',
    'f1t1',
    cwd,
  ]);
  expect(existsSync(join(cwd, 'pwned'))).toBe(false);
});

test('run: a command that asks for a shell still gets the values as data, through the environment', async () => {
  const cwd = join(scratch, 'shell');
  Bun.spawnSync(['mkdir', '-p', cwd]);
  const run = await runRepositoryCommand(
    'worktree.create',
    ['sh', '-c', 'printf "%s" "$WARD_BRANCH" > seen'],
    { branch: HOSTILE },
    cwd,
  );
  expect(run.exitCode).toBe(0);
  expect(readFileSync(join(cwd, 'seen'), 'utf8')).toBe(HOSTILE);
  expect(existsSync(join(cwd, 'pwned'))).toBe(false);
});

test('run: a failure is reported, never thrown — exit code and the end of what it said', async () => {
  const run = await runRepositoryCommand(
    'update',
    ['sh', '-c', 'echo starting; echo "first line" >&2; echo "the reason" >&2; exit 7'],
    {},
    scratch,
  );
  expect(run.exitCode).toBe(7);
  expect(describeFailure(run)).toBe('sh exited 7: first line the reason');
});

test('run: a program that cannot be started is a failure with no exit code', async () => {
  const run = await runRepositoryCommand('update', ['/no/such/program-ward-test'], {}, scratch);
  expect(run.exitCode).toBeNull();
  expect(describeFailure(run)).toMatch(/did not run to an exit code: cannot start it/);
});

test.each([
  ['/plain/path-1.x', '/plain/path-1.x'],
  ['/a path/with spaces', "'/a path/with spaces'"],
  ["it's", "'it'\\''s'"],
  ['x;$(y)', "'x;$(y)'"],
])('a suggested command spells %s as %s', (word, spelled) => {
  expect(shellWord(word)).toBe(spelled);
});

// -- fixtures ---------------------------------------------------------------

let scratch: string;

function writeScript(name: string, body: string): string {
  const path = join(scratch, name);
  writeFileSync(path, `#!/bin/sh\n${body}\n`);
  chmodSync(path, 0o755);
  return path;
}

beforeAll(() => {
  scratch = makeTempDir();
});

afterAll(() => {
  removeDir(scratch);
});
