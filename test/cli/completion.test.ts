// Shell completion (design/0022-shell-completion/): the script every shell
// installs is generated from the parser tree, and each TAB calls back into
// ward for candidates read from the record — open task codes, repository
// names, open session ids, stewardship branches, schema verbs. The callback
// runs inside the human's shell, so it must never error, never suggest what a
// verb would refuse, and never write a telemetry row.
import { afterAll, beforeAll, expect, test } from 'bun:test';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { verbPath } from '../../src/cli/telemetry.ts';
import { createWorkspace } from '../../src/workspace/create.ts';
import { gitOrThrow } from '../../src/workspace/git.ts';
import { addRepository } from '../../src/workspace/repos.ts';
import { closeSession, openSession } from '../../src/workspace/sessions.ts';
import { closeTask, openTask } from '../../src/workspace/tasks.ts';
import { createWorkspaceWorktree } from '../../src/workspace/worktrees.ts';
import { applyGitTestEnv, makeTempDir, removeDir, runWard } from '../helpers.ts';

test('`ward completion fish` emits a script that calls back into this very tree', () => {
  const result = runWard(['completion', 'fish'], ws);
  expect(result.exitCode).toBe(0);
  expect(result.stdout.length).toBeGreaterThan(500);
  // Derived from the parser, not hand-written: the function fish registers,
  // the registration itself, and the callback that re-enters `ward`.
  expect(result.stdout).toContain('function __ward_complete');
  expect(result.stdout).toContain("complete -c ward -f -a '(__ward_complete)'");
  expect(result.stdout).toContain("ward 'completion' 'fish' $prev $current");
});

test('every shell optique ships gets its own script; an unknown one is refused', () => {
  const table: ReadonlyArray<[string, string]> = [
    ['fish', 'function __ward_complete'],
    ['bash', 'function _ward ()'],
    ['zsh', '#compdef ward'],
    ['pwsh', 'Register-ArgumentCompleter'],
    ['nu', 'export def "nu-complete-ward"'],
  ];
  for (const [shell, marker] of table) {
    const result = runWard(['completion', shell], ws);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain(marker);
  }
  const unknown = runWard(['completion', 'csh'], ws);
  expect(unknown.exitCode).toBe(1);
  expect(unknown.stderr).toContain('Unsupported shell');
});

test('the noun/verb tree completes itself — the commands, from the parser', () => {
  expect(words([''])).toEqual(
    expect.arrayContaining([
      'workspace',
      'repo',
      'project',
      'task',
      'worktree',
      'session',
      'status',
      'doctor',
      'schema',
    ]),
  );
  expect(words(['w'])).toEqual(['workspace', 'worktree']);
});

test('task-addressed verbs complete to OPEN task codes, the slug as the cue', () => {
  const table: ReadonlyArray<readonly string[]> = [
    ['task', 'pause', ''],
    ['task', 'resume', ''],
    ['task', 'close', ''],
    ['task', 'pr', ''],
    ['worktree', 'create', ''],
    ['worktree', 'rebase', ''],
    ['session', 'open', ''],
    ['workspace', 'upgrade', ''],
  ];
  for (const argv of table) {
    expect(offers(argv)).toEqual(
      expect.arrayContaining([
        { text: 't1', description: 'alpha-task' },
        { text: 't2', description: 'beta-task' },
      ]),
    );
    // A closed task's code is reused after close, so offering it would name
    // either nothing or somebody else's task.
    expect(words(argv)).not.toContain('t3');
  }
});

test('only candidates that start with the prefix come back', () => {
  expect(offers(['task', 'pause', 't1'])).toEqual([{ text: 't1', description: 'alpha-task' }]);
  expect(offers(['task', 'pause', 'zz'])).toEqual([]);
});

test('repository arguments complete to registered names, the main line as the cue', () => {
  expect(offers(['repo', 'refresh', ''])).toEqual(
    expect.arrayContaining([{ text: 'demo', description: 'main' }]),
  );
  expect(offers(['worktree', 'create', 't1', '--repo', ''])).toEqual([
    { text: 'demo', description: 'main' },
  ]);
});

test('`session close ID` completes to OPEN session ids — closed stays closed', () => {
  expect(offers(['session', 'close', ''])).toEqual(
    expect.arrayContaining([{ text: 'alpha-task-1', description: 'task t1' }]),
  );
  expect(words(['session', 'close', ''])).not.toContain('beta-task-1');
});

test('`workspace merge BRANCH` completes to branches the main line does not hold', () => {
  expect(words(['workspace', 'merge', ''])).toEqual(['steward/beta-task']);
  // The main line itself is never a candidate — merging it into itself is refused.
  expect(words(['workspace', 'merge', ''])).not.toContain(mainLine);
});

test('`ward schema VERB…` completes one word at a time, from the shape registry', () => {
  expect(words(['schema', ''])).toEqual(
    expect.arrayContaining(['status', 'doctor', 'task', 'worktree', 'repo', 'workspace']),
  );
  // With `task` already typed, only what can follow it — never the first words again.
  const afterTask = words(['schema', 'task', '']);
  expect(afterTask).toEqual(
    expect.arrayContaining(['list', 'open', 'pause', 'resume', 'pr', 'close']),
  );
  expect(afterTask).not.toContain('task');
  expect(afterTask).not.toContain('doctor');
});

test('outside a workspace the callback answers empty and exit 0 — never an error', () => {
  const nowhere = makeTempDir();
  const table: ReadonlyArray<readonly string[]> = [
    ['task', 'pause', ''],
    ['repo', 'refresh', ''],
    ['session', 'close', ''],
    ['workspace', 'merge', ''],
    ['worktree', 'create', 't1', '--repo', ''],
  ];
  for (const argv of table) {
    const result = runWard(['completion', 'fish', ...argv], nowhere);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe('');
    expect(words(argv, nowhere)).toEqual([]);
  }
  // The tree still completes itself — that needs no record.
  expect(words([''], nowhere)).toContain('task');
  expect(existsSync(join(nowhere, '.ward'))).toBe(false);
  removeDir(nowhere);
});

test('a completion callback writes no telemetry row; generating the script writes one', async () => {
  const fresh = join(scratch, 'telemetry-ws');
  await createWorkspace(fresh);
  await openTask(fresh, 'counted', {});

  for (const argv of [
    [''],
    ['task', 'pause', ''],
    ['schema', 'task', ''],
    ['repo', 'refresh', ''],
  ]) {
    expect(runWard(['completion', 'fish', ...argv], fresh).exitCode).toBe(0);
  }
  expect(telemetryVerbs(fresh)).toEqual([]);

  expect(runWard(['completion', 'fish'], fresh).exitCode).toBe(0);
  expect(runWard(['status'], fresh).exitCode).toBe(0);
  expect(telemetryVerbs(fresh)).toEqual(['completion', 'status']);
});

test('the callback argv shape, and the verb path it produces', () => {
  const table: ReadonlyArray<[string[], string]> = [
    [['completion'], 'completion'], // no shell — an error the human sees, recorded
    [['completion', 'fish'], 'completion'], // generate the script
    [['completion', 'zsh'], 'completion'],
  ];
  for (const [argv, expected] of table) {
    expect(verbPath(argv)).toBe(expected);
  }
});

// -- helpers --------------------------------------------------------------

interface Offer {
  readonly text: string;
  readonly description: string;
}

/**
 * One completion callback, exactly as the generated script makes it: the
 * typed words then the word being completed (empty but always present). Fish
 * encodes each candidate as `text\tdescription`, blank lines between.
 */
function offers(argv: readonly string[], cwd = ws): Offer[] {
  const result = runWard(['completion', 'fish', ...argv], cwd);
  expect(result.exitCode).toBe(0);
  return result.stdout
    .split('\n')
    .filter((line) => line !== '')
    .map((line) => {
      const [text = '', description = ''] = line.split('\t');
      return { text, description };
    })
    .filter((offer) => !offer.text.startsWith('-')); // optique's own root options
}

/** The candidate words alone — for the cases where the cue is not the point. */
function words(argv: readonly string[], cwd = ws): string[] {
  return offers(argv, cwd).map((offer) => offer.text);
}

function telemetryVerbs(root: string): string[] {
  const dir = join(root, '.ward', 'telemetry');
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => name.endsWith('.jsonl'))
    .sort()
    .flatMap((name) =>
      readFileSync(join(dir, name), 'utf8')
        .split('\n')
        .filter((line) => line !== '')
        .map((line) => String((JSON.parse(line) as { verb: unknown }).verb)),
    );
}

// -- setup ----------------------------------------------------------------

let scratch: string;
let ws: string;
let mainLine: string;

beforeAll(async () => {
  applyGitTestEnv();
  scratch = makeTempDir();

  // A registered repository, so `--repo NAME` has something to offer.
  const remote = join(scratch, 'remote.git');
  gitOrThrow('.', 'init', '--bare', '--initial-branch=main', remote);
  const seed = join(scratch, 'seed');
  gitOrThrow('.', 'clone', remote, seed);
  await Bun.write(join(seed, 'file.txt'), 'seed\n');
  gitOrThrow(seed, 'add', '-A');
  gitOrThrow(seed, 'commit', '-m', 'seed');
  gitOrThrow(seed, 'push', '-u', 'origin', 'main');

  ws = join(scratch, 'ws');
  await createWorkspace(ws);
  mainLine = gitOrThrow(ws, 'symbolic-ref', '--short', 'HEAD').stdout.trim();
  await addRepository(ws, remote, 'demo');

  // t1 open, t2 open, t3 closed — the code a suggester must not offer.
  await openTask(ws, 'alpha-task', {});
  await openTask(ws, 'beta-task', {});
  await openTask(ws, 'gone-task', {});
  await closeTask(ws, 't3', 'abandoned');

  // One open session and one closed, so `session close` has both to sort.
  await openSession(ws, 't1', 'suggest the open one', {});
  await openSession(ws, 't2', 'and not this one', {});
  await closeSession(ws, 'beta-task-1');

  // A stewardship branch carrying a commit the main line lacks — the only
  // kind `workspace merge` can act on.
  const steward = await createWorkspaceWorktree(ws, 't2');
  const path = join(ws, steward.record.path);
  await Bun.write(join(path, 'catalog.md'), '\nstewardship change\n');
  gitOrThrow(path, 'add', '-A');
  gitOrThrow(path, 'commit', '-m', 'a stewardship change');
});

afterAll(() => {
  removeDir(scratch);
});
