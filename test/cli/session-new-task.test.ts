// A topic session in one step, at the CLI (design/0078-task-named-windows/,
// build log 2026-11-22): `session open --floor N --new-task SLUG` opens the
// task on the floor, then the floor's session working it, and reports both.
// The record-only (`--handle`) path is exercised here; the launched path is
// test/agent/floor-sessions.test.ts's, and the hosted one
// test/host/tmux-live.test.ts's.
import { afterAll, beforeAll, beforeEach, expect, test } from 'bun:test';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { sessionMutationShape, taskListShape } from '../../src/cli/schema.ts';
import { gitOrThrow } from '../../src/workspace/git.ts';
import { addRepository } from '../../src/workspace/repos.ts';
import { applyGitTestEnv, type CliResult, callWard, makeTempDir, removeDir } from '../helpers.ts';
import { preparedRemote, preparedWorkspace } from '../prepared.ts';

test('--new-task: the task opened on the floor, then a floor session working it, both reported', async () => {
  const opened = sessionOf(
    await ward(['session', 'open', '--floor', '1', '--new-task', 'tidy-docs', ...RECORDED]),
  );
  expect(opened).toMatchObject({ scope: 'project', floor: 1, purpose: 'the topic' });
  expect(opened.task).toBeUndefined(); // a floor's session, not a task session
  expect(opened.openedTask).toMatchObject({
    address: 'f1t2',
    slug: 'tidy-docs',
    floor: 1,
    state: 'active',
    purpose: 'the topic', // --purpose is both of theirs
  });
  expect(opened.events?.map(({ event, task }) => [event, task])).toEqual([
    ['opened', undefined],
    ['task-named', 'f1t2-tidy-docs'],
  ]);
  const shown = sessionOf(await ward(['session', 'show', opened.id, '--json']));
  expect(shown.workingOn).toEqual({ address: 'f1t2', slug: 'tidy-docs' });
  expect(shown.openedTask).toBeUndefined(); // the open's report alone carries it
  // Two commits: the task's, then the session's.
  const subjects = gitOrThrow(ws, 'log', '-2', '--format=%s').stdout.trim().split('\n');
  expect(subjects.map((subject) => subject.replace(/ \(ward [^)]+\)$/, ''))).toEqual([
    `Open session ${opened.id} on floor 1`,
    'Open task tidy-docs (f1t2)',
  ]);
});

test('--new-task, human output: the task line, then the session line', async () => {
  const opened = await ward([
    'session',
    'open',
    '--floor',
    '1',
    '--new-task',
    'tidy-docs',
    '--handle',
    'claude:recorded',
  ]);
  expect(opened.exitCode).toBe(0);
  const lines = opened.stdout.split('\n');
  expect(lines[0]).toBe('opened f1t2 — tidy-docs');
  expect(lines[1]).toStartWith('opened session f1-1@test (floor 1, in .)');
});

test('--new-task --repo: no --floor needed when a floor claims the repository', async () => {
  await addRepository(ws, remote('demo'), 'demo');
  expect((await ward(['project', 'claim', '2', 'demo'])).exitCode).toBe(0);
  const opened = sessionOf(
    await ward(['session', 'open', '--new-task', 'demo-fix', '--repo', 'demo', ...RECORDED]),
  );
  expect(opened.floor).toBe(2);
  expect(opened.openedTask).toMatchObject({
    address: 'f2t2',
    floor: 2,
    repositories: ['demo'],
  });
  const human = await ward([
    'session',
    'open',
    '--new-task',
    'demo-two',
    '--repo',
    'demo',
    '--handle',
    'claude:recorded',
  ]);
  expect(human.stdout).toStartWith('opened f2t3 — demo-two (floor 2 by affinity: demo)\n');
});

test.each<[string, string[], string]>([
  [
    'no floor and no --repo',
    ['session', 'open', '--new-task', 'stray'],
    '--new-task opens its task on a floor, and none was named — name it with --floor N, or route ' +
      'it with --repo NAME',
  ],
  [
    'a --repo no floor claims',
    ['session', 'open', '--new-task', 'stray', '--repo', 'demo'],
    'no floor claims demo — ward project claim FLOOR demo',
  ],
  [
    'an unregistered --repo',
    ['session', 'open', '--floor', '1', '--new-task', 'stray', '--repo', 'nonesuch'],
    'nonesuch',
  ],
  [
    '--task beside it',
    ['session', 'open', '--floor', '1', '--new-task', 'stray', '--task', 'f1t1'],
    '--new-task opens the task the session works, and --task names one already open',
  ],
  [
    'a TASK beside it',
    ['session', 'open', 'f1t1', '--new-task', 'stray'],
    '--new-task opens the task the session works, and a TASK names one already open',
  ],
  [
    '--repo without --new-task',
    ['session', 'open', '--floor', '1', '--repo', 'demo'],
    '--repo names what a new task touches — it goes with --new-task SLUG',
  ],
  ['a floor that is not there', ['session', 'open', '--floor', '9', '--new-task', 'stray'], '9'],
])('--new-task refuses %s, and opens no task', async (_name, argv, message) => {
  await addRepository(ws, remote('demo'), 'demo');
  const before = await openTasks();
  const refused = await ward([...argv, ...RECORDED]);
  expect(refused.exitCode).toBe(1);
  expect(refused.stderr).toContain(message);
  expect(await openTasks()).toEqual(before);
});

test('--new-task with --detach and --handle refuses before the task is opened', async () => {
  const before = await openTasks();
  const refused = await ward([
    'session',
    'open',
    '--floor',
    '1',
    '--new-task',
    'stray',
    '--detach',
    '--handle',
    'claude:recorded',
  ]);
  expect(refused.exitCode).toBe(1);
  expect(refused.stderr).toContain('--detach chooses where a launched run is hosted');
  expect(await openTasks()).toEqual(before);
});

test('a workspace below format 3 refuses --new-task with the remedy, before the task is written', async () => {
  const record = join(ws, 'workspace.md');
  writeFileSync(record, readFileSync(record, 'utf8').replace(/^format: \d+$/m, 'format: 2'));
  gitOrThrow(ws, 'commit', '-qam', 'an older workspace');
  const before = await openTasks();
  const refused = await ward([
    'session',
    'open',
    '--floor',
    '1',
    '--new-task',
    'stray',
    ...RECORDED,
  ]);
  expect(refused.exitCode).toBe(1);
  expect(refused.stderr).toContain('this session record needs workspace format 3');
  expect(refused.stderr).toContain('ward workspace upgrade');
  expect(await openTasks()).toEqual(before);
});

test('a session open that fails after the task is opened leaves the task open, and says so', async () => {
  // The floor's sessions directory is a file, so the session's write fails
  // after the task's commit.
  writeFileSync(join(ws, 'projects', '1-alpha', 'sessions'), 'in the way\n');
  const opened = await ward([
    'session',
    'open',
    '--floor',
    '1',
    '--new-task',
    'tidy-docs',
    '--handle',
    'claude:recorded',
  ]);
  expect(opened.exitCode).toBe(1);
  expect(opened.stderr).toContain('task f1t2 tidy-docs is opened and stays open — ');
  expect(opened.stderr).toContain(
    "open its floor's session on it with: ward session open --task f1t2",
  );
  expect((await openTasks()).map((task) => task.address)).toEqual(['f1t1', 'f1t2', 'f2t1']);
});

test('ward schema session open carries the opened task', async () => {
  const schema = JSON.parse((await ward(['schema', 'session', 'open'])).stdout);
  expect(Object.keys(schema.properties)).toContain('openedTask');
  expect(Object.keys(schema.properties.openedTask.properties)).toContain('address');
});

// -- scaffolding ------------------------------------------------------------------

const RECORDED = ['--handle', 'claude:recorded', '--purpose', 'the topic', '--json'];

function sessionOf(result: CliResult) {
  if (result.exitCode !== 0) throw new Error(`ward failed (${result.exitCode}): ${result.stderr}`);
  return sessionMutationShape.parse(JSON.parse(result.stdout));
}

async function openTasks() {
  const listed = await ward(['task', 'list', '--json']);
  return taskListShape
    .parse(JSON.parse(listed.stdout))
    .tasks.filter((task) => task.state !== 'closed')
    .sort((a, b) => a.address.localeCompare(b.address));
}

/** A bare repository with one commit — the source `repo add` clones from. */
function remote(name: string): string {
  const path = join(scratch, `remote-${counter}-${name}`);
  preparedRemote(path, { branch: 'main', files: { 'README.md': '# seed\n' } });
  return path;
}

function ward(argv: string[]): Promise<CliResult> {
  return callWard(argv, ws);
}

let scratch: string;
let ws: string;
let counter = 0;

beforeAll(() => {
  applyGitTestEnv();
  scratch = makeTempDir();
});

afterAll(() => removeDir(scratch));

beforeEach(async () => {
  counter += 1;
  ws = join(scratch, `case-${counter}`);
  await preparedWorkspace(ws);
  for (const argv of [
    ['project', 'open', 'alpha'],
    ['project', 'open', 'beta'],
    ['task', 'open', 'fix-login', '--project', '1'],
    ['task', 'open', 'elsewhere', '--project', '2'],
  ]) {
    expect((await ward(argv)).exitCode).toBe(0);
  }
});
