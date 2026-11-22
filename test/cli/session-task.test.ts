// A floor's session working one of its tasks, at the CLI
// (design/0078-task-named-windows/): `session open --task`, `session task`
// and its `--clear`, and every read that reports it — `session show`,
// `status`, `task show`, and the hand-off a naming picks up. Nothing here runs
// in a host: what a window and a harness are called is test/agent/naming.test.ts's
// and test/host/tmux-live.test.ts's.
import { afterAll, beforeAll, beforeEach, expect, test } from 'bun:test';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  mutationVerbShapes,
  sessionMutationShape,
  statusShape,
  taskDispatchesShape,
  taskShowShape,
} from '../../src/cli/schema.ts';
import { gitOrThrow } from '../../src/workspace/git.ts';
import { applyGitTestEnv, type CliResult, callWard, makeTempDir, removeDir } from '../helpers.ts';
import { preparedWorkspace } from '../prepared.ts';

test("open --task: a floor session on the task's floor, opened working it", async () => {
  const opened = sessionOf(await ward(['session', 'open', '--task', 'f1t1', ...recorded()]));
  expect(opened).toMatchObject({ scope: 'project', floor: 1 });
  expect(opened.events?.map(({ event, task }) => [event, task])).toEqual([
    ['opened', undefined],
    ['task-named', 'f1t1-fix-login'],
  ]);
  const shown = sessionOf(await ward(['session', 'show', opened.id, '--json']));
  expect(shown.workingOn).toEqual({ address: 'f1t1', slug: 'fix-login' });
  const human = await ward(['session', 'show', opened.id]);
  expect(human.stdout).toContain('  working  f1t1 fix-login\n');
  expect(human.stdout).toContain(' task-named f1t1-fix-login\n');
});

test.each<[string, string[], string]>([
  [
    'a task on another floor',
    ['session', 'open', '--floor', '2', '--task', 'f1t1'],
    "f1t1 is on floor 1 — a floor 2 session names its own floor's tasks",
  ],
  ['a TASK and --task', ['session', 'open', 'f1t1', '--task', 'f1t2'], 'a session has one scope'],
  ['a task that is not open', ['session', 'open', '--task', 'f1t9'], 'no open task at f1t9'],
])('open --task refuses %s', async (_name, argv, message) => {
  const refused = await ward([...argv, ...recorded()]);
  expect(refused.exitCode).toBe(1);
  expect(refused.stderr).toContain(message);
});

test('session task: names, says so once, moves on, and clears — every change appended', async () => {
  const id = await secondFloorSession();
  const named = sessionOf(await ward(['session', 'task', id, 'f1t1', '--json']));
  expect(named.workingOn).toEqual({ address: 'f1t1', slug: 'fix-login' });
  expect(mutationVerbShapes['session task']).toBe(sessionMutationShape);
  // Saying it again writes nothing.
  const again = await ward(['session', 'task', id, 'f1t1']);
  expect(again.stdout).toStartWith(`unchanged — session ${id} already works f1t1 fix-login`);
  expect(sessionOf(await ward(['session', 'show', id, '--json'])).events).toHaveLength(2);
  const moved = await ward(['session', 'task', id, 'f1t2']);
  expect(moved.stdout).toStartWith(`named f1t2 add-logout on session ${id}`);
  expect(moved.stdout).toContain(`the harness takes the name at its next resume`);
  const cleared = sessionOf(await ward(['session', 'task', id, '--clear', '--json']));
  expect(cleared.workingOn).toBeUndefined();
  expect(cleared.events?.map(({ event, task }) => [event, task])).toEqual([
    ['opened', undefined],
    ['task-named', 'f1t1-fix-login'],
    ['task-named', 'f1t2-add-logout'],
    ['task-cleared', undefined],
  ]);
});

test.each<[string, (ids: Ids) => string[], string]>([
  [
    'a workspace session',
    (ids) => ['session', 'task', ids.workspace, 'f1t1'],
    "only a floor's own session names the task it works",
  ],
  [
    'a task session',
    (ids) => ['session', 'task', ids.task, 'f1t1'],
    "only a floor's own session names the task it works",
  ],
  [
    'both a task and --clear',
    (ids) => ['session', 'task', ids.floor, 'f1t1', '--clear'],
    '--clear',
  ],
  ['neither', (ids) => ['session', 'task', ids.floor], 'name the task the session is working'],
  [
    "the floor's attending (design/0089-floor-attending/)",
    (ids) => ['session', 'task', ids.attending, 'f1t1'],
    "is floor 1's attending — the floor's general session, window 1 of its host — and stays " +
      'general. Give the task its own window: ward session open --task f1t1',
  ],
  [
    'a legacy-free floor mismatch',
    (ids) => ['session', 'task', ids.floor, 'f2t1'],
    "f2t1 is on floor 2 — a floor 1 session names its own floor's tasks",
  ],
])('session task refuses %s', async (_name, argv, message) => {
  const refused = await ward(argv(await everyScope()));
  expect(refused.exitCode).toBe(1);
  expect(refused.stderr).toContain(message);
});

test("the floor's attending is refused a task, writes nothing, and reads as the attending", async () => {
  const attending = sessionOf(await ward(['session', 'open', '--floor', '1', ...recorded()])).id;
  const second = sessionOf(await ward(['session', 'open', '--floor', '1', ...recorded()])).id;
  const refused = await ward(['session', 'task', attending, 'f1t1']);
  expect(refused.exitCode).toBe(1);
  expect(refused.stderr).toContain('ward session open --floor 1 --new-task SLUG');
  // Clearing what it never named says so and writes nothing.
  expect((await ward(['session', 'task', attending, '--clear'])).exitCode).toBe(0);
  const shown = sessionOf(await ward(['session', 'show', attending, '--json']));
  expect(shown.events).toHaveLength(1);
  expect(shown.attending).toBe(true);
  expect(sessionOf(await ward(['session', 'show', second, '--json'])).attending).toBeUndefined();
  expect((await ward(['session', 'show', attending])).stdout).toContain(
    '  attends  floor 1 — its attending, window 1 of its host, what wsa 1 joins\n',
  );
  const status = statusShape.parse(JSON.parse((await ward(['status', '--json'])).stdout));
  expect(
    status.projects
      .find((project) => project.floor === 1)
      ?.sessions.map((session) => [session.id, session.attending]),
  ).toEqual([
    [attending, true],
    [second, undefined],
  ]);
  expect((await ward(['status'])).stdout).toContain(`${attending} — attending · p `);
  // The attending closes: the second general session is the floor's attending now.
  expect((await ward(['session', 'close', attending])).exitCode).toBe(0);
  expect(sessionOf(await ward(['session', 'show', second, '--json'])).attending).toBe(true);
});

test('status and task show report the task a floor session is working, until it closes', async () => {
  const id = sessionOf(await ward(['session', 'open', '--task', 'f1t1', ...recorded()])).id;
  const status = statusShape.parse(JSON.parse((await ward(['status', '--json'])).stdout));
  const floor = status.projects.find((project) => project.floor === 1);
  expect(floor?.sessions).toEqual([
    expect.objectContaining({ id, workingOn: { address: 'f1t1', slug: 'fix-login' } }),
  ]);
  expect((await ward(['status'])).stdout).toContain(`${id} — working f1t1 fix-login · `);
  const shown = taskShowShape.parse(
    JSON.parse((await ward(['task', 'show', 'f1t1', '--json'])).stdout),
  );
  expect(shown.sessions.map((session) => session.id)).toEqual([id]);
  // The task closes: the trail keeps the naming, and nothing says it is in hand.
  expect((await ward(['task', 'close', 'f1t1', '--outcome', 'abandoned'])).exitCode).toBe(0);
  const after = sessionOf(await ward(['session', 'show', id, '--json']));
  expect(after.workingOn).toBeUndefined();
  expect(after.state).toBe('open'); // a task's close sweeps its own sessions, not its floor's
  expect(after.events?.at(-1)).toMatchObject({ event: 'task-named', task: 'f1t1-fix-login' });
});

test('naming a handed-over task on a floor session picks the hand-off up', async () => {
  const brief = join(scratch, `brief-${counter}.md`);
  writeFileSync(brief, '# Rotate the keys\n');
  expect(
    (await ward(['task', 'dispatch', 'rotate-keys', '--to', '1', '--brief', brief])).exitCode,
  ).toBe(0);
  const pending = await dispatches();
  expect(pending.map((entry) => entry.state)).toEqual(['pending']);
  const id = await secondFloorSession();
  expect((await dispatches()).map((entry) => entry.state)).toEqual(['pending']); // the floor alone is not the task
  await ward(['session', 'task', id, pending[0]?.address ?? '']);
  expect((await dispatches()).map((entry) => [entry.state, entry.pickedUp?.session])).toEqual([
    ['picked-up', id],
  ]);
});

test('a workspace below format 3 refuses a naming, with the remedy, and writes nothing', async () => {
  const id = await secondFloorSession();
  const record = join(ws, 'workspace.md');
  writeFileSync(record, readFileSync(record, 'utf8').replace(/^format: \d+$/m, 'format: 2'));
  gitOrThrow(ws, 'commit', '-qam', 'an older workspace');
  const refused = await ward(['session', 'task', id, 'f1t1']);
  expect(refused.exitCode).toBe(1);
  expect(refused.stderr).toContain('this session record needs workspace format 3');
  expect(refused.stderr).toContain('ward workspace upgrade');
  expect(sessionOf(await ward(['session', 'show', id, '--json'])).events).toHaveLength(1);
});

// -- scaffolding ------------------------------------------------------------------

let recordings = 0;
/** A recorded open, with a run of its own: one handle is one open session (design 0084). */
function recorded(): string[] {
  recordings += 1;
  return ['--handle', `claude:recorded-${recordings}`, '--purpose', 'p', '--json'];
}

interface Ids {
  readonly workspace: string;
  /** Floor 1's attending: its first general session. */
  readonly attending: string;
  /** A second general session of floor 1, which may name a task. */
  readonly floor: string;
  readonly task: string;
}

async function everyScope(): Promise<Ids> {
  return {
    // A run of its own: one handle is one open session (design/0084-session-move/).
    workspace: sessionOf(
      await ward(['session', 'open', '--handle', 'claude:ws', '--purpose', 'p', '--json']),
    ).id,
    attending: sessionOf(await ward(['session', 'open', '--floor', '1', ...recorded()])).id,
    floor: sessionOf(await ward(['session', 'open', '--floor', '1', ...recorded()])).id,
    task: sessionOf(await ward(['session', 'open', 'f1t1', ...recorded()])).id,
  };
}

/**
 * A general floor-1 session that is NOT the floor's attending — the attending
 * stays general (design/0089-floor-attending/), so naming is a second
 * session's — opened after the attending.
 */
async function secondFloorSession(): Promise<string> {
  sessionOf(await ward(['session', 'open', '--floor', '1', ...recorded()]));
  return sessionOf(await ward(['session', 'open', '--floor', '1', ...recorded()])).id;
}

function sessionOf(result: CliResult) {
  if (result.exitCode !== 0) throw new Error(`ward failed (${result.exitCode}): ${result.stderr}`);
  return sessionMutationShape.parse(JSON.parse(result.stdout));
}

async function dispatches() {
  const result = await ward(['task', 'dispatches', '--json']);
  return taskDispatchesShape.parse(JSON.parse(result.stdout)).dispatches;
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
    ['task', 'open', 'add-logout', '--project', '1'],
    ['task', 'open', 'elsewhere', '--project', '2'],
  ]) {
    expect((await ward(argv)).exitCode).toBe(0);
  }
});
