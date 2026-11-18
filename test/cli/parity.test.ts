// In-process and spawned `ward` answer byte for byte alike
// (design/0074-in-process-cli-tests/). One script of invocations — every verb
// group, reads and mutations, success, refusal, usage error and help, human
// and agent callers, color forced and refused, stdin, completion, worktrees and
// the documents an agent parses — runs twice from the same starting state:
// once through the real binary, once in-process. Every step's exit code,
// stdout and stderr must be identical, the clock aside. A difference here is a
// process global the CLI reads that the in-process runner does not give it.
import { afterAll, beforeAll, expect, test } from 'bun:test';
import { cpSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createWorkspace } from '../../src/workspace/create.ts';
import { gitOrThrow } from '../../src/workspace/git.ts';
import { addRepository } from '../../src/workspace/repos.ts';
import {
  applyGitTestEnv,
  type CliResult,
  callWard,
  callWardEnv,
  makeTempDir,
  removeDir,
  runWard,
  runWardEnv,
  WARD_GLOBAL_ENV,
} from '../helpers.ts';

/** One invocation: where it stands, what it says, and whose environment it has. */
interface Step {
  readonly argv: string[];
  /** Relative to the workspace root; `outside` is a directory in no workspace. */
  readonly at?: string;
  /** A caller-controlled environment (runWardEnv); unset is runWard's. */
  readonly env?: Record<string, string>;
  readonly stdin?: string;
}

const AGENT = { WARD_AGENT: 'workspace-1@test', NO_COLOR: '1' };
const COLOR = { FORCE_COLOR: '1' };

const SCRIPT: readonly Step[] = [
  // The binary itself: bare, version, help, usage errors, completion.
  { argv: [] },
  { argv: ['--version'] },
  { argv: ['--version'], env: COLOR },
  { argv: ['--help'] },
  { argv: ['task', '--help'] },
  { argv: ['session', 'open', '--help'], env: { COLUMNS: '60', NO_COLOR: '1' } },
  { argv: ['task', 'nonesuch'] },
  { argv: ['task', 'nonesuch'], env: COLOR },
  { argv: ['completion', 'fish'] },
  { argv: ['completion', 'bash', 'task', 'sh'] },
  { argv: ['schema'] },
  { argv: ['schema', 'task', 'show'] },
  { argv: ['shell', 'init', 'fish'] },
  // The workspace's own verbs, and the record's.
  { argv: ['workspace', 'list', '--json'] },
  { argv: ['status'], at: 'outside', env: AGENT },
  { argv: ['status'], at: 'outside' },
  { argv: ['repo', 'list'] },
  { argv: ['repo', 'list', '--json'], env: AGENT },
  { argv: ['project', 'open', 'parity', '--emoji', '🧪'] },
  { argv: ['project', 'open', 'parity', '--emoji', '🧪'] },
  { argv: ['project', 'claim', '1', 'demo', '--json'] },
  { argv: ['project', 'note', '1', 'notes reach the floor'] },
  { argv: ['task', 'open', 'first', '--repo', 'demo'] },
  { argv: ['task', 'open', 'second', '--project', '0', '--json'], env: AGENT },
  { argv: ['task', 'brief', 'f1t1', '-'], stdin: '# First\n\nFrom stdin.\n' },
  { argv: ['task', 'brief', 'f1t1', 'no-such-file'] },
  { argv: ['task', 'pr', 'f1t1', 'https://github.com/example/demo/pull/7'] },
  { argv: ['task', 'pause', 'f0t1'] },
  { argv: ['task', 'list'] },
  { argv: ['task', 'list', '--state', 'paused', '--json'] },
  { argv: ['task', 'show', 'f1t1'], env: COLOR },
  { argv: ['task', 'show', 'nonesuch'] },
  { argv: ['worktree', 'create', 'f1t1'] },
  { argv: ['worktree', 'list'] },
  { argv: ['task', 'show', 'f1t1'], at: 'floors/1-parity/f1t1-first' },
  { argv: ['context', '--json'], at: 'floors/1-parity/f1t1-first' },
  { argv: ['session', 'open', 'f1t1', '--purpose', 'parity', '--handle', 'claude:p-1'] },
  { argv: ['session', 'open', '--floor', '1', '--purpose', 'floor', '--handle', 'claude:p-2'] },
  { argv: ['session', 'show', 'f1-1@test', '--json'], env: AGENT },
  { argv: ['status'] },
  { argv: ['status', '--json'], env: AGENT },
  { argv: ['status'], env: COLOR },
  { argv: ['project', 'list', '--all'] },
  { argv: ['session', 'close', 'f1-1@test'] },
  { argv: ['repo', 'refresh', '--json'] },
  { argv: ['task', 'close', 'f0t1'] },
  { argv: ['task', 'close', 'f0t1', '--outcome', 'abandoned', '--json'] },
  { argv: ['doctor', '--json'], env: AGENT },
];

test('every step of the script answers alike, spawned and in-process', async () => {
  const spawned = await play('spawned');
  const called = await play('in-process');
  // Labeled, so a difference names the invocation that diverged.
  expect(called.map(labeled)).toEqual(spawned.map(labeled));
  // The script is not vacuous: it reaches success, refusal and usage error,
  // color, and both channels.
  const codes = new Set(spawned.map((result) => result.exitCode));
  expect(codes).toEqual(new Set([0, 1]));
  expect(spawned.some((result) => result.stdout.includes('\u001b['))).toBe(true);
  expect(spawned.filter((result) => result.stderr !== '').length).toBeGreaterThan(3);
  // One case plays the script twice, ~50 spawns on one side: it gets the time
  // the spawns take on a loaded worker, not the gate's per-case default.
}, 180_000);

// -- the two players ------------------------------------------------------

/**
 * Play the whole script in one mode, from the same starting state: the
 * workspace and the machine's state directory are put back from the snapshot
 * first, at the same paths, so both modes meet the same record.
 */
async function play(mode: 'spawned' | 'in-process'): Promise<CliResult[]> {
  restore();
  const results: CliResult[] = [];
  for (const step of SCRIPT) {
    const cwd = step.at === 'outside' ? outside : join(ws, step.at ?? '');
    const options = step.stdin === undefined ? {} : { stdin: step.stdin };
    if (mode === 'spawned') {
      results.push(
        step.env === undefined
          ? runWard(step.argv, cwd, options)
          : runWardEnv(step.argv, cwd, step.env, options),
      );
    } else {
      results.push(
        step.env === undefined
          ? await callWard(step.argv, cwd, options)
          : await callWardEnv(step.argv, cwd, step.env, options),
      );
    }
  }
  return results;
}

/**
 * A step's result, named for its step. The clock is the one thing two plays
 * of the same script may disagree on, so recorded instants read as <instant>.
 */
function labeled(result: CliResult, i: number) {
  const clockless = (text: string) => text.replace(INSTANT, '<instant>');
  return {
    step: label(SCRIPT[i] as Step),
    exitCode: result.exitCode,
    stdout: clockless(result.stdout),
    stderr: clockless(result.stderr),
  };
}

const INSTANT = /\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z/g;

function label(step: Step): string {
  const env = step.env === undefined ? '' : ` ${JSON.stringify(step.env)}`;
  return `ward ${step.argv.join(' ')}${step.at === undefined ? '' : ` (in ${step.at})`}${env}`;
}

// -- fixtures -------------------------------------------------------------

let scratch: string;
let ws: string;
let outside: string;
let snapshot: string;

beforeAll(async () => {
  applyGitTestEnv();
  scratch = makeTempDir();
  ws = join(scratch, 'ws');
  outside = join(scratch, 'outside');
  mkdirSync(outside);
  await createWorkspace(ws);
  await addRepository(ws, makeRemote(join(scratch, 'remote')), 'demo');
  // Registered, so the machine's registry is part of the state both modes meet.
  expect(runWard(['workspace', 'register', ws], ws).exitCode).toBe(0);
  // The starting state both modes are played from, taken once it is built.
  snapshot = join(scratch, 'snapshot');
  cpSync(ws, join(snapshot, 'ws'), { recursive: true, verbatimSymlinks: true });
  cpSync(WARD_GLOBAL_ENV.WARD_STATE_DIR as string, join(snapshot, 'state'), { recursive: true });
});

afterAll(() => removeDir(scratch));

function restore(): void {
  removeDir(ws);
  removeDir(WARD_GLOBAL_ENV.WARD_STATE_DIR as string);
  cpSync(join(snapshot, 'ws'), ws, { recursive: true, verbatimSymlinks: true });
  cpSync(join(snapshot, 'state'), WARD_GLOBAL_ENV.WARD_STATE_DIR as string, { recursive: true });
}

function makeRemote(dir: string): string {
  mkdirSync(dir, { recursive: true });
  gitOrThrow(dir, 'init', '--quiet', '--initial-branch=main');
  writeFileSync(join(dir, 'README.md'), '# demo\n');
  gitOrThrow(dir, 'add', '.');
  gitOrThrow(dir, 'commit', '--quiet', '-m', 'initial');
  return dir;
}
