// The workspace format guard, through the spawned CLI
// (design/0066-workspace-format-guard/). Two machines share a workspace; one
// raised its format and the other pulled before updating its ward. Here the
// second machine is this build standing in a workspace one level above what it
// reads: every verb that touches the record refuses with one message and
// writes nothing, the narrow set that must still run does, and the completion
// machinery stays silent. Then the other direction: this build on a workspace
// from before the marker works as it always did, and `workspace upgrade`
// raises the level in the convergence commit and says what that costs.
import { afterAll, beforeAll, expect, test } from 'bun:test';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { doctorShape, workspaceUpgradeShape } from '../../src/cli/schema.ts';
import { FORMAT_LEVEL } from '../../src/store/format.ts';
import { gitOrThrow } from '../../src/workspace/git.ts';
import { GROUND_FLOOR } from '../../src/workspace/projects.ts';
import { openTask } from '../../src/workspace/tasks.ts';
import {
  applyGitTestEnv,
  type CliResult,
  callWard,
  callWardEnv,
  cliPath,
  makeTempDir,
  NO_GH,
  removeDir,
} from '../helpers.ts';
import { preparedWorkspace } from '../prepared.ts';

// Every verb that reads or writes the record. A verb is in exactly one of the
// two tables below, and the last test in this group fails when the CLI gains
// a verb that is in neither — so a new verb is a decision, never an oversight.
const REFUSED: ReadonlyArray<readonly [action: string, argv: readonly string[]]> = [
  ['status', ['status']],
  ['status', ['status', '--json']],
  ['context', ['context']],
  ['project-list', ['project', 'list']],
  ['project-open', ['project', 'open', 'later']],
  ['project-claim', ['project', 'claim', '0', 'demo']],
  ['project-release', ['project', 'release', '0', 'demo']],
  ['project-identity', ['project', 'identity', '0', '--color', 'blue']],
  ['project-rename', ['project', 'rename', '1', 'later']],
  ['project-note', ['project', 'note', '0', 'a note']],
  ['reflection-packet', ['reflection', 'packet', '0']],
  ['reflection-open', ['reflection', 'open', '0']],
  ['reflection-record', ['reflection', 'record', '0', 'workspace.md']],
  ['task-list', ['task', 'list']],
  ['task-list', ['task', 'list', '--all', '--json']],
  ['task-open', ['task', 'open', 'another']],
  ['task-show', ['task', 'show', 'f0t1']],
  ['task-pause', ['task', 'pause', 'f0t1']],
  ['task-resume', ['task', 'resume', 'f0t1']],
  ['task-pr', ['task', 'pr', 'f0t1', 'https://example.com/pr/1']],
  ['task-brief', ['task', 'brief', 'f0t1', 'workspace.md']],
  ['task-close', ['task', 'close', 'f0t1', '--outcome', 'abandoned']],
  ['task-dispatch', ['task', 'dispatch', 'handed', '--to', '0', '--brief', 'workspace.md']],
  ['task-dispatches', ['task', 'dispatches']],
  ['task-dispatches', ['task', 'dispatches', '--mine', '--json']],
  ['worktree-list', ['worktree', 'list']],
  ['worktree-create', ['worktree', 'create', 'f0t1', '--workspace']],
  ['worktree-rebase', ['worktree', 'rebase', 'f0t1']],
  ['session-open', ['session', 'open', 'f0t1', '--purpose', 'p', '--handle', 'claude:x']],
  ['session-open', ['session', 'open', '--purpose', 'p', '--handle', 'claude:x']],
  ['session-resume', ['session', 'resume', 'workspace-1@test']],
  ['session-resume', ['session', 'resume', '--all']],
  ['session-resume', ['session', 'resume', '--all', '--go', '--json']],
  ['session-attach', ['session', 'attach', 'workspace-1@test']],
  ['session-observe', ['session', 'observe', 'workspace-1@test']],
  ['session-task', ['session', 'task', 'f1-1@test', 'f1t1']],
  ['session-show', ['session', 'show', 'workspace-1@test']],
  ['session-locate', ['session', 'locate', 'workspace-1@test']],
  ['session-close', ['session', 'close', 'workspace-1@test']],
  ['repo-list', ['repo', 'list']],
  ['repo-add', ['repo', 'add', '/nowhere/demo']],
  ['repo-refresh', ['repo', 'refresh']],
  ['repo-remove', ['repo', 'remove', 'demo']],
  ['repo-path', ['repo', 'path', 'demo']],
  ['workspace-upgrade', ['workspace', 'upgrade']],
  ['workspace-upgrade', ['workspace', 'upgrade', 'f0t1', '--json']],
  ['workspace-restore', ['workspace', 'restore']],
  ['workspace-merge', ['workspace', 'merge', 'main']],
  ['workspace-register', ['workspace', 'register']],
];

// What must still run in a workspace this ward is too old for: what a human
// needs to see which ward this is and why it refuses, and the machinery that
// is about the machine or the build rather than this workspace's record.
const STILL_RUNS: ReadonlyArray<readonly [action: string, argv: readonly string[], exit: number]> =
  [
    ['version', ['--version'], 0],
    ['help', ['--help'], 0],
    ['doctor', ['doctor'], 1], // runs, and is unhealthy: it is the verb that says why
    ['schema', ['schema', 'task', 'list'], 0],
    ['shell-init', ['shell', 'init', 'fish'], 0],
    ['shell-candidates', ['shell', 'candidates', 'repos'], 0],
    ['shell-adopt', ['shell', 'adopt', 'fish'], 0],
    ['shell-diff', ['shell', 'diff', 'fish'], 0],
    ['workspace-list', ['workspace', 'list'], 0],
    // The three below answer from the registry alone, and the registry is
    // empty here: they run, and refuse for their own reason, not the guard's.
    ['workspace-path', ['workspace', 'path'], 1],
    ['workspace-default', ['workspace', 'default', 'nothing'], 1],
    ['workspace-unregister', ['workspace', 'unregister', 'nothing'], 1],
    ['workspace-create', ['workspace', 'create', '.'], 1], // "already a workspace", as ever
  ];

test('too new: every verb that touches the record refuses, with one message and no document', async () => {
  const results = await Promise.all(REFUSED.map(([, argv]) => wardIn(argv, tooNew)));
  for (const [index, result] of results.entries()) {
    const verb = REFUSED[index]?.[1].join(' ');
    expect([verb, result.exitCode]).toEqual([verb, 1]);
    expect([verb, result.stdout]).toEqual([verb, '']); // a refusal emits no document (0015)
    expect([verb, result.stderr.trim()]).toEqual([verb, `error: ${REFUSAL()}`]);
  }
});

test('too new: nothing was written — no commit, no change, no lock left behind', () => {
  expect(gitOrThrow(tooNew, 'rev-parse', 'HEAD').stdout.trim()).toBe(tooNewHead);
  expect(gitOrThrow(tooNew, 'status', '--porcelain').stdout).toBe('');
  expect(gitOrThrow(tooNew, 'worktree', 'list').stdout.trim().split('\n')).toHaveLength(1);
});

test('too new: the narrow set still runs, and none of it carries the refusal', async () => {
  const results = await Promise.all(STILL_RUNS.map(([, argv]) => wardIn(argv, tooNew)));
  for (const [index, result] of results.entries()) {
    const [action, argv, exit] = STILL_RUNS[index] ?? ['', [], 0];
    expect([argv.join(' '), result.exitCode]).toEqual([argv.join(' '), exit]);
    if (action !== 'doctor') expect(result.stderr).not.toContain('too old for the workspace');
  }
});

test('every verb the CLI has is in one of the two tables', () => {
  const source = readFileSync(cliPath, 'utf8');
  const actions = [...source.matchAll(/constant\('([a-z-]+)'\)/g)].map((match) => match[1]);
  expect(actions.length).toBeGreaterThan(40);
  const decided = new Set([...REFUSED, ...STILL_RUNS].map(([action]) => action));
  expect(actions.filter((action) => !decided.has(action ?? ''))).toEqual([]);
});

test('too new: doctor says exactly this — one workspace finding, the machine checks still run', async () => {
  const human = await callWard(['doctor'], tooNew);
  expect(human.exitCode).toBe(1);
  expect(human.stdout).toContain('✓ git');
  expect(human.stdout).toContain(`✗ workspace format — ${REFUSAL()}`);
  expect(human.stdout).not.toContain('workspace record');
  expect(human.stdout).toContain('unhealthy');

  const json = await callWard(['doctor', '--json'], tooNew);
  expect(json.exitCode).toBe(1);
  const report = doctorShape.parse(JSON.parse(json.stdout));
  expect(report.healthy).toBe(false);
  expect(report.format).toEqual({
    reads: FORMAT_LEVEL,
    workspace: FORMAT_LEVEL + 1,
    readable: false,
  });
  expect(report.workspace).toEqual([
    { check: 'workspace format', severity: 'error', message: REFUSAL() },
  ]);
  expect(report.agent).toBeNull();
  expect(report.workspaceId).toBeNull();
  expect(report.machine.length).toBeGreaterThan(3);
});

// The completion callback and the shell layer's candidate feed run inside the
// human's shell on a keystroke (design/0022-shell-completion/,
// design/0025-fish-shell-layer/): fast, silent, never failing. In a workspace
// this ward cannot read they offer nothing from the record — a name read from
// a record this ward may misread is a candidate the verb then refuses.
test('too new: completion and the candidate feeds exit 0, say nothing on stderr, and offer no record', async () => {
  const table: ReadonlyArray<readonly [argv: readonly string[], absent: string]> = [
    [['completion', 'fish', 'task', 'show', ''], 'f0t1'],
    [['completion', 'fish', 'project', 'note', ''], '0'],
    [['completion', 'fish', 'session', 'show', ''], 'workspace-1'],
    [['completion', 'fish', 'repo', 'refresh', ''], 'demo'],
    [['completion', 'fish', 'repo', 'path', ''], 'demo'],
    [['shell', 'candidates', 'repos'], 'demo'],
    [['shell', 'candidates', 'coordinators'], 'workspace-1'],
  ];
  for (const [argv, absent] of table) {
    const result = await callWard([...argv], tooNew);
    expect([argv.join(' '), result.exitCode, result.stderr]).toEqual([argv.join(' '), 0, '']);
    const offered = result.stdout.split('\n').map((line) => line.split('\t')[0]);
    expect(offered).not.toContain(absent);
  }
  // The tree itself is the build's, not the record's: it still completes.
  expect((await callWard(['completion', 'fish', ''], tooNew)).stdout).toContain('doctor');
  // And the same feeds do offer the record where this ward can read it.
  expect((await callWard(['completion', 'fish', 'task', 'show', ''], current)).stdout).toContain(
    'f0t1',
  );
});

test('too new, from outside: the registry fallback is refused the same way', async () => {
  // A human standing nowhere gets the registered workspace — and the guard
  // with it, whichever way the workspace was found.
  const env = { WARD_STATE_DIR: join(scratch, 'state-outside'), NO_COLOR: '1' };
  expect((await callWardEnv(['workspace', 'register', current], scratch, env)).exitCode).toBe(0);
  const registry = join(env.WARD_STATE_DIR, 'workspaces.md');
  writeFileSync(registry, readFileSync(registry, 'utf8').replaceAll(current, tooNew));
  const result = await callWardEnv(['status'], scratch, env);
  expect(result.exitCode).toBe(1);
  expect(result.stdout).toBe('');
  expect(result.stderr).toContain(REFUSAL());
});

// -- the other direction: this ward on an older workspace ---------------------

test('a workspace from before the marker reads and writes as it always did', async () => {
  const ws = unmarked('older');
  expect((await callWard(['status'], ws)).exitCode).toBe(0);
  expect((await callWard(['task', 'open', 'more'], ws)).stdout).toContain('opened f0t2');
  expect((await callWard(['task', 'list'], ws)).stdout).toContain('f0t2');
  // A write that is not the upgrade's does not raise the level on the way past.
  expect(readFileSync(join(ws, 'workspace.md'), 'utf8')).not.toContain('format:');

  const doctor = await callWard(['doctor', '--json'], ws);
  expect(doctor.exitCode).toBe(0); // surfaced, never blocking
  const report = doctorShape.parse(JSON.parse(doctor.stdout));
  expect(report.format).toEqual({ reads: FORMAT_LEVEL, workspace: 0, readable: true });
  expect(report.workspace.find((finding) => finding.check === 'workspace format')).toEqual({
    check: 'workspace format',
    severity: 'warn',
    message:
      `the workspace records format 0 and this ward writes format ${FORMAT_LEVEL} — raise it, ` +
      'so an older ward on another machine refuses instead of misreading: ward workspace upgrade',
  });
});

test('workspace upgrade raises the level in the convergence commit, and says what it costs', async () => {
  const ws = unmarked('raise');
  const before = Number(gitOrThrow(ws, 'rev-list', '--count', 'HEAD').stdout);

  const result = await callWardEnv(['workspace', 'upgrade', '--json'], ws, {
    NO_COLOR: '1',
    WARD_GH: NO_GH,
  });
  expect(result.exitCode).toBe(0);
  const report = workspaceUpgradeShape.parse(JSON.parse(result.stdout));
  expect(report.converged.map((step) => step.step).slice(0, 3)).toEqual([
    'workspace marker',
    'workspace record',
    'workspace format', // ahead of every step that writes a record
  ]);
  const raised = report.converged.find((step) => step.step === 'workspace format');
  expect(raised?.outcome).toBe('established');
  expect(raised?.detail).toStartWith(`format 0 → ${FORMAT_LEVEL} — `);
  expect(raised?.detail).toContain('is NOT stopped by it');
  expect(raised?.detail).toContain('refuses before it reads anything');

  // One journal commit, and the marker is in it: last line of the front matter.
  expect(Number(gitOrThrow(ws, 'rev-list', '--count', 'HEAD').stdout)).toBe(before + 1);
  expect(gitOrThrow(ws, 'show', '--stat', '--format=%s', 'HEAD').stdout).toContain('workspace.md');
  expect(readFileSync(join(ws, 'workspace.md'), 'utf8')).toContain(
    `\nformat: ${FORMAT_LEVEL}\n---\n`,
  );
  expect(gitOrThrow(ws, 'status', '--porcelain').stdout).toBe('');

  // Convergent: the second run finds the level in place and commits nothing.
  const again = await callWardEnv(['workspace', 'upgrade'], ws, { NO_COLOR: '1', WARD_GH: NO_GH });
  expect(again.stdout).toContain(`satisfied  workspace format (format ${FORMAT_LEVEL})`);
  expect(Number(gitOrThrow(ws, 'rev-list', '--count', 'HEAD').stdout)).toBe(before + 1);
  expect((await callWard(['doctor'], ws)).stdout).toContain(
    `✓ workspace format — format ${FORMAT_LEVEL} — this ward reads up to ${FORMAT_LEVEL}`,
  );
});

test('the human rendering marks the raise where it cannot be read past', async () => {
  const ws = unmarked('render');
  const result = await callWardEnv(['workspace', 'upgrade'], ws, { NO_COLOR: '1', WARD_GH: NO_GH });
  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain(`established  workspace format ! format 0 → ${FORMAT_LEVEL} — `);
});

test('a fresh workspace is born at this ward’s level', () => {
  expect(readFileSync(join(current, 'workspace.md'), 'utf8')).toContain(
    `\nformat: ${FORMAT_LEVEL}\n`,
  );
});

// -- setup ------------------------------------------------------------------

let scratch: string;
/** A workspace at this ward's level, with a task, a session and a repository record. */
let current: string;
/** The same workspace as another machine sees it after a newer ward raised its format. */
let tooNew: string;
let tooNewHead: string;
let count = 0;

/** The refusal, whole — the one message every refused verb prints. */
function REFUSAL(): string {
  return (
    `this ward is too old for the workspace at ${tooNew} — the workspace needs a ward that ` +
    `reads workspace format ${FORMAT_LEVEL + 1}, and this ward (0.1.0) reads up to format ` +
    `${FORMAT_LEVEL}. No record was read or written. Update ward on this machine, then run the ` +
    'command again; until then only ward doctor, ward --version and ward --help answer here.'
  );
}

/** A workspace as a ward from before the marker left it: converged, and carrying none. */
function unmarked(name: string): string {
  const ws = join(scratch, `${name}-${count++}`);
  gitOrThrow(scratch, 'clone', '-q', current, ws);
  const file = join(ws, 'workspace.md');
  writeFileSync(file, readFileSync(file, 'utf8').replace(/^format: \d+\n/m, ''));
  gitOrThrow(ws, 'commit', '-qam', 'a workspace from before the format marker (test fixture)');
  return ws;
}

/** Every verb in turn, in-process (design/0074-in-process-cli-tests/). */
function wardIn(argv: readonly string[], cwd: string): Promise<CliResult> {
  return callWard([...argv], cwd);
}

beforeAll(async () => {
  applyGitTestEnv();
  scratch = makeTempDir();
  current = join(scratch, 'current');
  await preparedWorkspace(current);
  await openTask(current, 'work', { floor: GROUND_FLOOR });
  expect(
    (
      await callWard(
        ['session', 'open', '--purpose', 'coordinate', '--handle', 'claude:fixture'],
        current,
      )
    ).exitCode,
  ).toBe(0);
  // A repository record with no checkout: enough to be a name the feeds read.
  writeFileSync(
    join(current, 'repositories', 'demo.md'),
    '---\ntype: repository\nname: demo\nremote: /nowhere/demo\nmainLine: main\n' +
      'registeredAt: 2026-11-16T00:00:00.000Z\n---\n',
  );
  gitOrThrow(current, 'add', '-A');
  gitOrThrow(current, 'commit', '-qm', 'a repository record (test fixture)');

  // The second machine: a clone, pulled after a newer ward raised the format.
  tooNew = join(scratch, 'too-new');
  gitOrThrow(scratch, 'clone', '-q', current, tooNew);
  const file = join(tooNew, 'workspace.md');
  writeFileSync(
    file,
    readFileSync(file, 'utf8').replace(/^format: \d+$/m, `format: ${FORMAT_LEVEL + 1}`),
  );
  gitOrThrow(tooNew, 'commit', '-qam', 'a newer ward raised the format (test fixture)');
  tooNewHead = gitOrThrow(tooNew, 'rev-parse', 'HEAD').stdout.trim();
});

afterAll(() => {
  removeDir(scratch);
});
