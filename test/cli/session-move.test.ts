// `ward session move` at the CLI (design/0084-session-move/): the pair of
// records a move writes in one commit, the link each side shows, every
// refusal, the one-open-record-per-handle rule at `session open --handle`
// and in `doctor`, and the reflection packet reading the pair as one
// conversation. Nothing here runs in a host: sessions are recorded with
// --handle, so their latest run is a foreground one Ward cannot see. The
// hosted order is test/agent/move.test.ts's, and a real tmux's is
// test/host/tmux-live.test.ts's.
import { afterAll, beforeAll, beforeEach, expect, test } from 'bun:test';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  doctorShape,
  mutationVerbShapes,
  reflectionPacketShape,
  sessionMoveShape,
  sessionMutationShape,
} from '../../src/cli/schema.ts';
import { gitOrThrow } from '../../src/workspace/git.ts';
import {
  applyGitTestEnv,
  type CliResult,
  callWard,
  callWardEnv,
  makeTempDir,
  removeDir,
} from '../helpers.ts';
import { preparedWorkspace } from '../prepared.ts';

test('floor to floor: the old record closes naming its successor, the new one continues the run', async () => {
  const old = await floorSession(1, 'claude:conv', ['--purpose', 'chase the login bug']);
  const before = commits();
  const moved = moveOf(await ward(['session', 'move', old, '--floor', '2', '--json']));
  expect(mutationVerbShapes['session move']).toBe(sessionMoveShape);
  // One journal commit holds both records.
  expect(commits()).toBe(before + 1);
  expect(lastCommitFiles()).toEqual([
    'projects/1-alpha/sessions/f1-1@test.md',
    'projects/2-beta/sessions/f2-1@test.md',
  ]);
  expect(gitOrThrow(ws, 'log', '-1', '--format=%s').stdout).toStartWith(
    'Move session f1-1@test to floor 2 as f2-1@test',
  );
  expect(moved.from).toMatchObject({ id: old, state: 'closed', handle: 'claude:conv' });
  expect(moved.from.events?.map(({ event, session }) => [event, session])).toEqual([
    ['opened', undefined],
    ['continued', 'f2-1@test'],
    ['closed', undefined],
  ]);
  expect(moved.to).toMatchObject({
    id: 'f2-1@test',
    scope: 'project',
    floor: 2,
    handle: 'claude:conv',
    workingDirectory: '.',
    purpose: 'chase the login bug',
    continues: old,
    state: 'open',
  });
  expect(moved.to.parent).toBeUndefined();
  expect(moved.next).toStartWith('its last run was in the foreground, where Ward cannot see it');
  expect(moved.next).toEndWith('ward session resume f2-1@test');
});

test('session show names the link from either side', async () => {
  const old = await floorSession(1, 'claude:conv');
  await ward(['session', 'move', old, '--floor', '2']);
  const before = await ward(['session', 'show', old]);
  expect(before.stdout).toContain('  moved    to f2-1@test, which continues it\n');
  expect(before.stdout).toContain(' continued as f2-1@test\n');
  const after = await ward(['session', 'show', 'f2-1@test']);
  expect(after.stdout).toContain(`  moved    from ${old}, continuing it\n`);
  const json = sessionMutationShape.parse(
    JSON.parse((await ward(['session', 'show', 'f2-1@test', '--json'])).stdout),
  );
  expect(json.continues).toBe(old);
});

test('the human report says what moved and what to run', async () => {
  const old = await floorSession(1, 'claude:conv');
  const moved = await ward(['session', 'move', old, '--floor', '2', '--task', 'f2t1']);
  expect(moved.exitCode).toBe(0);
  expect(moved.stdout).toStartWith(
    `moved session ${old} → f2-1@test (floor 2, handle claude:conv)\n  working f2t1 elsewhere\n`,
  );
  expect(moved.stdout).toContain('next: its last run was in the foreground');
});

test("a purpose Ward stated is restated for the new scope; --purpose replaces the old one's", async () => {
  const stated = await floorSession(1, 'claude:a', []);
  const restated = moveOf(await ward(['session', 'move', stated, '--floor', '2', '--json']));
  expect(restated.to.purpose).toMatch(/^Coordinating floor 2 · opened /);
  const given = await floorSession(1, 'claude:b', ['--purpose', 'p']);
  const replaced = moveOf(
    await ward(['session', 'move', given, '--floor', '2', '--purpose', 'route beta', '--json']),
  );
  expect(replaced.to.purpose).toBe('route beta');
});

test('--task: the continuation opens working an open task of its new floor', async () => {
  const old = await floorSession(1, 'claude:conv');
  const moved = moveOf(
    await ward(['session', 'move', old, '--floor', '2', '--task', 'f2t1', '--json']),
  );
  expect(moved.to.events?.map(({ event, task }) => [event, task])).toEqual([
    ['opened', undefined],
    ['task-named', 'f2t1-elsewhere'],
  ]);
  expect(moved.to.workingOn).toEqual({ address: 'f2t1', slug: 'elsewhere' });
});

test('workspace to a floor, and back again: each hop one more record of one conversation', async () => {
  const coordinator = sessionOf(
    await ward(['session', 'open', '--handle', 'claude:conv', '--purpose', 'p', '--json']),
  ).id;
  const onFloor = moveOf(await ward(['session', 'move', coordinator, '--floor', '1', '--json']));
  expect(onFloor.to).toMatchObject({ id: 'f1-1@test', scope: 'project', continues: coordinator });
  const back = moveOf(await ward(['session', 'move', 'f1-1@test', '--workspace', '--json']));
  expect(back.to).toMatchObject({
    id: 'workspace-2@test',
    scope: 'workspace',
    continues: 'f1-1@test',
    handle: 'claude:conv',
  });
  expect(back.to.floor).toBeUndefined();
});

test.each<[string, (ids: Ids) => string[], string]>([
  [
    'a task session',
    (ids) => ['session', 'move', ids.task, '--floor', '2'],
    'a task-scope session is moved by moving its task (ward task move), not by this verb',
  ],
  [
    'its own floor',
    (ids) => ['session', 'move', ids.floor, '--floor', '1'],
    "session f1-1@test is already floor 1's — to work another of its tasks: ward session task",
  ],
  [
    'the workspace, for a workspace session',
    (ids) => ['session', 'move', ids.workspace, '--workspace'],
    'is already at workspace scope',
  ],
  ['no destination', (ids) => ['session', 'move', ids.floor], 'name where the conversation moves'],
  [
    'two destinations',
    (ids) => ['session', 'move', ids.floor, '--floor', '2', '--workspace'],
    'name where the conversation moves',
  ],
  [
    '--task without a floor',
    (ids) => ['session', 'move', ids.floor, '--workspace', '--task', 'f2t1'],
    '--task names a task on the target floor',
  ],
  [
    "another floor's task",
    (ids) => ['session', 'move', ids.floor, '--floor', '2', '--task', 'f1t1'],
    "f1t1 is on floor 1 — a floor 2 session names its own floor's tasks",
  ],
  [
    'a floor that does not exist',
    (ids) => ['session', 'move', ids.floor, '--floor', '9'],
    'floor 9',
  ],
])('move refuses %s, and writes nothing', async (_name, argv, message) => {
  const ids = await everyScope();
  const before = commits();
  const refused = await ward(argv(ids));
  expect(refused.exitCode).toBe(1);
  expect(refused.stdout).toBe('');
  expect(refused.stderr).toContain(message);
  expect(commits()).toBe(before);
});

test('a closed session cannot be moved, and a closed predecessor points at its successor', async () => {
  const old = await floorSession(1, 'claude:conv');
  await ward(['session', 'move', old, '--floor', '2']);
  const again = await ward(['session', 'move', old, '--floor', '2']);
  expect(again.exitCode).toBe(1);
  expect(again.stderr).toContain(`session '${old}' is already closed at `);
  expect(again.stderr).toContain(
    'its conversation continues as f2-1@test: ward session show f2-1@test',
  );
  const resume = await ward(['session', 'resume', old, '--foreground']);
  expect(resume.stderr).toContain('its conversation continues as f2-1@test');
});

test('a session another machine ran is moved there, where its run is', async () => {
  const old = sessionOf(
    await callWardEnv(
      ['session', 'open', '--floor', '1', '--handle', 'claude:conv', '--purpose', 'p', '--json'],
      ws,
      { WARD_MACHINE: 'mbp' },
    ),
  ).id;
  const refused = await ward(['session', 'move', old, '--floor', '2']);
  expect(refused.exitCode).toBe(1);
  expect(refused.stderr).toContain(
    `session ${old} ran on mbp, and this is test — move it on mbp, where its run and its window are`,
  );
});

test.each<[string, Record<string, string>]>([
  ['declared as the session', { WARD_AGENT: 'f1-1@test' }],
  ['standing in its run', { WARD_AGENT: '1', CLAUDE_CODE_SESSION_ID: 'conv' }],
])('a session cannot move itself (%s)', async (_name, env) => {
  const old = await floorSession(1, 'claude:conv');
  const before = commits();
  const refused = await callWardEnv(['session', 'move', old, '--floor', '2'], ws, env);
  expect(refused.exitCode).toBe(1);
  expect(refused.stderr).toContain(
    `session ${old} is the one this command is running in — a move ends its window`,
  );
  expect(refused.stderr).toContain(
    `run the move from another terminal: ward session move ${old} --floor 2`,
  );
  expect(commits()).toBe(before);
});

test('a workspace below format 4 refuses the move with the remedy, and writes nothing', async () => {
  const old = await floorSession(1, 'claude:conv');
  const record = join(ws, 'workspace.md');
  writeFileSync(record, readFileSync(record, 'utf8').replace(/^format: \d+$/m, 'format: 3'));
  gitOrThrow(ws, 'commit', '-qam', 'an older workspace');
  const before = commits();
  const refused = await ward(['session', 'move', old, '--floor', '2']);
  expect(refused.exitCode).toBe(1);
  expect(refused.stderr).toContain('this session record needs workspace format 4');
  expect(refused.stderr).toContain('ward workspace upgrade');
  expect(commits()).toBe(before);
  expect(gitOrThrow(ws, 'status', '--porcelain').stdout).toBe('');
});

// -- one conversation, one open record --------------------------------------------

test('open --handle refuses a handle an open workspace or floor session holds, naming it and move', async () => {
  const holder = await floorSession(1, 'claude:conv');
  for (const argv of [
    ['session', 'open', '--floor', '2', '--handle', 'claude:conv', '--purpose', 'p'],
    ['session', 'open', '--handle', 'claude:conv', '--purpose', 'p'],
  ]) {
    const refused = await ward(argv);
    expect(refused.exitCode).toBe(1);
    expect(refused.stderr).toContain(
      `handle claude:conv is already held by open session ${holder} (floor 1) — one ` +
        'conversation is one open session, or resuming would start it twice. To carry it to ' +
        `another floor: ward session move ${holder} --floor N; to end that record first: ` +
        `ward session close ${holder}`,
    );
  }
  // A task episode recorded from inside the same run is not a second conversation.
  const task = await ward(['session', 'open', 'f1t1', '--handle', 'claude:conv', '--purpose', 'p']);
  expect(task.exitCode).toBe(0);
  // Once the holder closes, the handle is free to record again.
  await ward(['session', 'close', holder]);
  expect(
    (await ward(['session', 'open', '--handle', 'claude:conv', '--purpose', 'p'])).exitCode,
  ).toBe(0);
});

test('doctor reports two open records of one conversation, and both remedies', async () => {
  const first = await floorSession(1, 'claude:one');
  const second = await floorSession(2, 'claude:two');
  // What an older Ward, or two machines, leave behind: written past the rule.
  const file = join(ws, 'projects/2-beta/sessions', `${second}.md`);
  writeFileSync(file, readFileSync(file, 'utf8').replace('claude:two', 'claude:one'));
  const report = doctorShape.parse(JSON.parse((await ward(['doctor', '--json'])).stdout));
  const shared = report.workspace.filter((finding) => finding.check === 'shared handles');
  expect(shared).toEqual([
    {
      check: 'shared handles',
      severity: 'warn',
      message:
        `handle claude:one is held by 2 open sessions: ${first}, ${second} — one conversation ` +
        'recorded twice, which resume --all would start twice. Keep the one that belongs and ' +
        `close the rest (ward session close ${first}), or carry one to another floor with: ` +
        `ward session move ${first} --floor N`,
    },
  ]);
});

test("the reflection packet reads a moved session's pair as one conversation", async () => {
  const old = await floorSession(1, 'claude:conv');
  await ward(['session', 'move', old, '--floor', '2']);
  const from = reflectionPacketShape.parse(
    JSON.parse((await ward(['reflection', 'packet', '1', '--json'])).stdout),
  );
  expect(from.floorSessions).toEqual([
    expect.objectContaining({ id: old, state: 'closed', continuedBy: 'f2-1@test' }),
  ]);
  const to = reflectionPacketShape.parse(
    JSON.parse((await ward(['reflection', 'packet', '2', '--json'])).stdout),
  );
  expect(to.floorSessions).toEqual([
    expect.objectContaining({ id: 'f2-1@test', state: 'open', continues: old }),
  ]);
  const human = await ward(['reflection', 'packet', '2']);
  expect(human.stdout).toContain(`one conversation with ${old} — its history from `);
});

// -- scaffolding ------------------------------------------------------------------

interface Ids {
  readonly workspace: string;
  readonly floor: string;
  readonly task: string;
}

async function everyScope(): Promise<Ids> {
  return {
    workspace: sessionOf(
      await ward(['session', 'open', '--handle', 'claude:ws', '--purpose', 'p', '--json']),
    ).id,
    floor: await floorSession(1, 'claude:floor'),
    task: sessionOf(
      await ward([
        'session',
        'open',
        'f1t1',
        '--handle',
        'claude:task',
        '--purpose',
        'p',
        '--json',
      ]),
    ).id,
  };
}

async function floorSession(
  floor: number,
  handle: string,
  extra: string[] = ['--purpose', 'p'],
): Promise<string> {
  return sessionOf(
    await ward([
      'session',
      'open',
      '--floor',
      String(floor),
      '--handle',
      handle,
      ...extra,
      '--json',
    ]),
  ).id;
}

function sessionOf(result: CliResult) {
  if (result.exitCode !== 0) throw new Error(`ward failed (${result.exitCode}): ${result.stderr}`);
  return sessionMutationShape.parse(JSON.parse(result.stdout));
}

function moveOf(result: CliResult) {
  if (result.exitCode !== 0) throw new Error(`ward failed (${result.exitCode}): ${result.stderr}`);
  return sessionMoveShape.parse(JSON.parse(result.stdout));
}

function commits(): number {
  return Number(gitOrThrow(ws, 'rev-list', '--count', 'HEAD').stdout.trim());
}

function lastCommitFiles(): string[] {
  return gitOrThrow(ws, 'show', '--name-only', '--format=', 'HEAD')
    .stdout.trim()
    .split('\n')
    .sort();
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
