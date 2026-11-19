// Hand-offs at the CLI (design/0067-floor-dispatch/): `ward task dispatch`
// and what it reports, to a human and as its document; `ward task
// dispatches`, the read that says where hand-offs stand; and the places a
// hand-off shows without being asked for — `ward status` on both floors'
// rows, `ward task show`, and the line said to whoever opens or resumes the
// session of a floor that has work waiting. No session here runs in a host,
// so nothing is typed anywhere: the typing is test/host/tmux-nudge-live.test.ts's.
import { afterAll, beforeAll, beforeEach, expect, test } from 'bun:test';
import { join } from 'node:path';
import {
  mutationVerbShapes,
  readVerbShapes,
  sessionMutationShape,
  statusShape,
  taskDispatchesShape,
  taskDispatchShape,
  taskShowShape,
} from '../../src/cli/schema.ts';
import { gitOrThrow } from '../../src/workspace/git.ts';
import { addRepository } from '../../src/workspace/repos.ts';
import {
  applyGitTestEnv,
  type CliResult,
  callWard,
  callWardEnv,
  makeTempDir,
  NO_GH,
  removeDir,
} from '../helpers.ts';
import { preparedRemote, preparedWorkspace } from '../prepared.ts';

test('task dispatch: a human reads what was handed, to whom, and that it waits', async () => {
  const result = await callWard(
    ['task', 'dispatch', 'fix-login', '--to', '2', '--brief', brief],
    ws,
  );
  expect(result.exitCode).toBe(0);
  expect(result.stdout.trim().split('\n')).toEqual([
    'handed f2t1 — fix-login to floor 2 (brief projects/2-beta/tasks/t1-fix-login/brief.md; ' +
      'from a human at a terminal)',
    'floor 2 has no open session — the hand-off waits in the record, and shows in ward status',
    'where it stands: ward task dispatches --to 2',
  ]);
});

test('task dispatch --json: the hand-off as recorded, the brief, and every nudge with its answer', async () => {
  const sender = await floorSession(1);
  const target = await floorSession(2);
  const result = await as(sender, [
    'task',
    'dispatch',
    'fix-login',
    '--to',
    '2',
    '--brief',
    brief,
    '--purpose',
    'the login page',
    '--json',
  ]);
  expect(result.exitCode).toBe(0);
  const report = taskDispatchShape.parse(JSON.parse(result.stdout));
  expect(report).toEqual({
    dispatch: {
      task: 't1',
      address: 'f2t1',
      slug: 'fix-login',
      to: 2,
      fromSession: sender,
      fromFloor: 1,
      sentAt: report.dispatch.sentAt,
      state: 'pending',
      taskState: 'active',
    },
    brief: 'projects/2-beta/tasks/t1-fix-login/brief.md',
    // The target's session was recorded, not launched into a host: Ward says
    // it cannot reach it, and the verb succeeds all the same.
    nudges: [
      {
        session: target,
        outcome: 'unreachable',
        detail: 'its run is in a terminal of its own, not a host Ward can type into',
      },
    ],
  });
  expect(mutationVerbShapes['task dispatch']).toBe(taskDispatchShape);
  expect(readVerbShapes['task dispatches']).toBe(taskDispatchesShape);
});

test('the brief may come from stdin, and a claim never moves a hand-off off the floor named', async () => {
  expect((await callWard(['project', 'claim', '1', 'demo'], ws)).exitCode).toBe(0);
  const result = Bun.spawnSync(
    ['bun', cli, 'task', 'dispatch', 'touch-demo', '--to', '2', '--repo', 'demo', '--brief', '-'],
    { cwd: ws, env: humanEnv(), stdin: Buffer.from('Touch the demo.\n') },
  );
  expect(result.exitCode).toBe(0);
  const shown = taskShowShape.parse(
    JSON.parse((await callWard(['task', 'show', 'f2t1', '--json'], ws)).stdout),
  );
  expect(shown.task).toMatchObject({ floor: 2, repositories: ['demo'] });
  expect(shown.brief.standing).toBe('typed');
  expect(shown.dispatch).toMatchObject({ to: 2, state: 'pending' });
});

test.each<[string, string[], string]>([
  ['no floor named', ['task', 'dispatch', 'x', '--brief', 'BRIEF'], '--to'],
  ['no brief', ['task', 'dispatch', 'x', '--to', '2'], '--brief'],
  [
    'a brief that is not there',
    ['task', 'dispatch', 'x', '--to', '2', '--brief', 'nowhere.md'],
    "no file at 'nowhere.md'",
  ],
  [
    'an unregistered repository',
    ['task', 'dispatch', 'x', '--to', '2', '--brief', 'BRIEF', '--repo', 'ghost'],
    'ghost',
  ],
  [
    'a floor that does not exist',
    ['task', 'dispatch', 'x', '--to', '9', '--brief', 'BRIEF'],
    'floor 9',
  ],
])('refused, with nothing recorded: %s', async (_name, argv, message) => {
  const head = gitOrThrow(ws, 'rev-parse', 'HEAD').stdout;
  const result = await callWard(
    argv.map((word) => (word === 'BRIEF' ? brief : word)),
    ws,
  );
  expect(result.exitCode).not.toBe(0);
  expect(result.stdout).toBe('');
  expect(result.stderr).toContain(message);
  expect(gitOrThrow(ws, 'rev-parse', 'HEAD').stdout).toBe(head);
});

test('a sender refuses to hand work to its own floor, and is told the verb it wants', async () => {
  const sender = await floorSession(1);
  const result = await as(sender, ['task', 'dispatch', 'mine', '--to', '1', '--brief', brief]);
  expect(result.exitCode).toBe(1);
  expect(result.stderr).toContain('ward task open mine --project 1');
});

test('status shows a hand-off on both floors, and task show says who handed it over', async () => {
  const sender = await floorSession(1);
  await as(sender, ['task', 'dispatch', 'fix-login', '--to', '2', '--brief', brief]);
  await callWard(['task', 'dispatch', 'from-a-human', '--to', '2', '--brief', brief], ws);

  const status = (await callWard(['status'], ws)).stdout;
  // On the sender's floor, what it handed off; on the target's, what waits.
  expect(status).toContain('  handed off f2t1 fix-login floor 1 → floor 2 [pending]');
  expect(status).toContain(
    `  f2t1 fix-login [active]\n    handed over by floor 1 (session ${sender}) [pending]`,
  );
  expect(status).toContain('    handed over by a human at a terminal [pending]');
  // A hand-off from above the floors has no floor row to sit on.
  expect(status).toContain('\nhanded off\n  f2t2 from-a-human a human → floor 2 [pending]');

  const document = statusShape.parse(JSON.parse((await callWard(['status', '--json'], ws)).stdout));
  expect(document.dispatches.map((each) => [each.address, each.fromFloor, each.state])).toEqual([
    ['f2t1', 1, 'pending'],
    ['f2t2', undefined, 'pending'],
  ]);

  expect((await callWard(['task', 'show', 'f2t1'], ws)).stdout).toMatch(
    /handed {3}over by floor 1 \(session f1-1@\S+\) at \S+ \[pending\]/,
  );
});

test('task dispatches: pending, then picked up by the session that opened on it, then closed and how', async () => {
  const sender = await floorSession(1);
  await as(sender, ['task', 'dispatch', 'fix-login', '--to', '2', '--brief', brief]);
  await as(sender, ['task', 'dispatch', 'second', '--to', '2', '--brief', brief]);
  const listed = async () =>
    (await callWard(['task', 'dispatches'], ws)).stdout.trimEnd().split('\n');
  expect(await listed()).toEqual([
    '  f2t1 fix-login floor 1 → floor 2 [pending]',
    '  f2t2 second floor 1 → floor 2 [pending]',
  ]);

  const worker = session(
    await callWard(
      ['session', 'open', 'f2t1', '--purpose', 'fix it', '--handle', 'claude:w', '--json'],
      ws,
    ),
  );
  expect((await listed())[0]).toBe(`  f2t1 fix-login floor 1 → floor 2 [picked up by ${worker}]`);
  expect((await callWard(['task', 'close', 'f2t1', '--outcome', 'abandoned'], ws)).exitCode).toBe(
    0,
  );
  expect((await listed())[0]).toBe('  f2t1 fix-login floor 1 → floor 2 [closed · abandoned]');

  // The filters, and the sender's own question.
  const json = async (argv: string[], caller?: string) => {
    const result = caller === undefined ? await callWard(argv, ws) : await as(caller, argv);
    return taskDispatchesShape
      .parse(JSON.parse(result.stdout))
      .dispatches.map((each) => `${each.address} ${each.state}`);
  };
  expect(await json(['task', 'dispatches', '--to', '2', '--state', 'pending', '--json'])).toEqual([
    'f2t2 pending',
  ]);
  expect(await json(['task', 'dispatches', '--from', '2', '--json'])).toEqual([]);
  expect(await json(['task', 'dispatches', '--mine', '--json'], sender)).toHaveLength(2);
  const closed = taskDispatchesShape.parse(
    JSON.parse((await callWard(['task', 'dispatches', '--state', 'closed', '--json'], ws)).stdout),
  ).dispatches[0];
  expect(closed).toMatchObject({
    state: 'closed',
    outcome: 'abandoned',
    taskState: 'closed',
    pickedUp: { session: worker },
  });

  const nobody = await callWard(['task', 'dispatches', '--mine'], ws);
  expect(nobody.exitCode).toBe(1);
  expect(nobody.stderr).toContain('--mine needs a recorded session');
});

test('nothing handed: the listing says so, and status carries an empty list', async () => {
  expect((await callWard(['task', 'dispatches'], ws)).stdout).toContain('no hand-offs');
  expect(JSON.parse((await callWard(['status', '--json'], ws)).stdout).dispatches).toEqual([]);
});

test('whoever opens a session on a floor with work waiting is told, beside an intact document', async () => {
  await callWard(['task', 'dispatch', 'fix-login', '--to', '2', '--brief', brief], ws);
  await callWard(['task', 'dispatch', 'second', '--to', '2', '--brief', brief], ws);
  const opened = await callWard(
    ['session', 'open', '--floor', '2', '--handle', 'claude:m', '--json'],
    ws,
  );
  expect(opened.exitCode).toBe(0);
  expect(sessionMutationShape.parse(JSON.parse(opened.stdout)).floor).toBe(2);
  expect(opened.stderr.trim()).toBe(
    'floor 2 has 2 hand-offs waiting (f2t1, f2t2) — ' +
      'see: ward task dispatches --to 2 --state pending',
  );
  // A floor nothing waits on, and a session of another scope, hear nothing.
  expect(
    (await callWard(['session', 'open', '--floor', '1', '--handle', 'claude:n', '--json'], ws))
      .stderr,
  ).toBe('');
  expect(
    (await callWard(['session', 'open', 'f2t1', '--purpose', 'p', '--handle', 'claude:o'], ws))
      .stderr,
  ).toBe('');
});

// -- setup ----------------------------------------------------------------

let scratch: string;
let ws: string;
let brief: string;
const cli = new URL('../../src/cli/index.ts', import.meta.url).pathname;

beforeAll(() => {
  applyGitTestEnv();
  scratch = makeTempDir();
  brief = join(scratch, 'brief.md');
});

afterAll(() => removeDir(scratch));

let counter = 0;
beforeEach(async () => {
  counter += 1;
  ws = join(scratch, `case-${counter}`);
  await preparedWorkspace(ws);
  await Bun.write(brief, '# Fix the login page\n\nIt rejects every password.\n');
  await addRepository(ws, makeRemote(join(scratch, `remote-${counter}`)), 'demo');
  expect((await callWard(['project', 'open', 'alpha'], ws)).exitCode).toBe(0);
  expect((await callWard(['project', 'open', 'beta'], ws)).exitCode).toBe(0);
});

/** Record a floor's own session — recorded, never launched — and return its id. */
async function floorSession(floor: number): Promise<string> {
  return session(
    await callWard(
      ['session', 'open', '--floor', String(floor), '--handle', `claude:floor-${floor}`, '--json'],
      ws,
    ),
  );
}

function session(result: CliResult): string {
  if (result.exitCode !== 0) throw new Error(`ward failed (${result.exitCode}): ${result.stderr}`);
  return sessionMutationShape.parse(JSON.parse(result.stdout)).id;
}

/** Run a verb as a declared session. */
async function as(agent: string, argv: string[]): Promise<CliResult> {
  return await callWardEnv(argv, ws, { WARD_AGENT: agent, NO_COLOR: '1', WARD_GH: NO_GH });
}

function humanEnv(): Record<string, string> {
  const env: Record<string, string | undefined> = { ...process.env, NO_COLOR: '1', WARD_GH: NO_GH };
  delete env.WARD_AGENT;
  return Object.fromEntries(
    Object.entries(env).filter((entry): entry is [string, string] => entry[1] !== undefined),
  );
}

/** A bare repository with one commit — the source `repo add` clones from. */
function makeRemote(path: string): string {
  preparedRemote(path, { branch: 'main', files: { 'README.md': '# seed\n' } });
  return path;
}
