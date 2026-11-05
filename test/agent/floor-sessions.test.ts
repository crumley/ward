// Floor-scope sessions, end to end through the spawned CLI
// (design/0051-floor-scope-sessions/): `ward session open --floor N` records a
// PROJECT-scope session beside the floor's project record and launches the
// agent at the workspace root, exactly as a workspace-scope open does; the
// record-only paths (`--handle`, or the run the caller stands in) record
// without launching; and every session verb — status, show, locate, resume,
// close, `--json`, `ward schema` — reads the new scope.
//
// No test here spawns the real Claude Code: WARD_CLAUDE_BIN points at the
// stub harness, which looks for its own record from inside the launch.
import { afterAll, beforeEach, expect, test } from 'bun:test';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { sessionLocateShape, sessionMutationShape, statusShape } from '../../src/cli/schema.ts';
import { mungeCwd } from '../../src/harness/claude.ts';
import { sessionSchema } from '../../src/store/types.ts';
import { createWorkspace } from '../../src/workspace/create.ts';
import { openProject } from '../../src/workspace/projects.ts';
import { defaultFloorSessionPurpose, readSessions } from '../../src/workspace/sessions.ts';
import {
  applyGitTestEnv,
  type CliResult,
  makeTempDir,
  removeDir,
  writeFakeClaude,
} from '../helpers.ts';

const FLOOR_DIR = 'projects/1-alpha';
const DEFAULT_PURPOSE = /^Coordinating floor 1 · opened \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
const RUN_ID = '0f8fad5b-d9cb-469f-a165-70867728950e';

// -- the launch -------------------------------------------------------------

test('open --floor N: the record beside the project, then the agent, in the workspace root', async () => {
  const opened = ward(['session', 'open', '--floor', '1']);
  expect(opened.exitCode).toBe(0);
  expect(opened.stdout).toContain('opened session f1-1@test (floor 1, handle claude:');

  const [record] = await readSessions(ws, FLOOR_DIR);
  expect(record).toMatchObject({
    id: 'f1-1@test',
    scope: 'project',
    floor: 1,
    machine: 'test',
    workingDirectory: '.',
    state: 'open',
  });
  expect(record?.task).toBeUndefined();
  expect(record?.purpose).toMatch(DEFAULT_PURPOSE);
  expect(record?.purpose).toBe(defaultFloorSessionPurpose(1, record?.openedAt ?? ''));
  // Not a workspace-scope session: the workspace's own sessions/ stays empty.
  expect(await readSessions(ws, '')).toEqual([]);

  const [run] = runs();
  expect(run?.recordSeen).toBe(true); // record, then launch — at floor scope too
  expect(run?.wardAgent).toBe('f1-1@test');
  expect(run?.cwd).toBe(ws);
  expect(record?.handle).toBe(`claude:${run?.argv[1]}`);
});

test('the ground floor has its own session, distinct from workspace scope', async () => {
  expect(ward(['session', 'open', '--floor', '0', '--purpose', 'steward']).exitCode).toBe(0);
  expect(ward(['session', 'open', '--purpose', 'route']).exitCode).toBe(0);
  expect((await readSessions(ws, 'projects/0-workspace'))[0]).toMatchObject({
    id: 'f0-1@test',
    scope: 'project',
    floor: 0,
    purpose: 'steward',
  });
  expect((await readSessions(ws, ''))[0]).toMatchObject({
    id: 'workspace-1@test',
    scope: 'workspace',
  });
});

test.each([
  [['--floor', '9'], 'no project on floor 9'],
  [['f0t1', '--floor', '1', '--purpose', 'both'], 'a session has one scope'],
])('refused before anything is written or launched: %p', async (args, message) => {
  ward(['task', 'open', 'feature', '--project', '0']);
  const result = ward(['session', 'open', ...args]);
  expect(result.exitCode).toBe(1);
  expect(result.stderr).toContain(message);
  expect(runs()).toEqual([]);
  expect(await readSessions(ws, FLOOR_DIR)).toEqual([]);
});

// -- the record-only paths ------------------------------------------------------

test('--handle at floor scope records without launching', async () => {
  const result = ward(['session', 'open', '--floor', '1', '--handle', 'claude:existing']);
  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain('opened session f1-1@test (floor 1, in .)');
  expect(runs()).toEqual([]);
  expect((await readSessions(ws, FLOOR_DIR))[0]?.handle).toBe('claude:existing');
});

test('inside a harness run, a floor or workspace open records that run — no agent nested in it', async () => {
  const ambient = { CLAUDE_CODE_SESSION_ID: RUN_ID };
  for (const args of [['--floor', '1'], []]) {
    const result = ward(['session', 'open', ...args, '--json'], { env: ambient });
    expect(result.exitCode).toBe(0);
    expect(sessionMutationShape.parse(JSON.parse(result.stdout)).handle).toBe(`claude:${RUN_ID}`);
  }
  expect(runs()).toEqual([]);
  // --handle still wins over the run.
  const named = ward(['session', 'open', '--floor', '1', '--handle', 'pi:abc', '--json'], {
    env: ambient,
  });
  expect(sessionMutationShape.parse(JSON.parse(named.stdout)).handle).toBe('pi:abc');
});

// -- every session verb reads the scope ----------------------------------------

test('status: the floor session rides its floor row, not the workspace block', () => {
  ward(['session', 'open', '--floor', '1', '--purpose', 'run alpha', '--handle', 'claude:a']);
  ward(['session', 'open', '--purpose', 'route', '--handle', 'claude:w']);

  const document = statusShape.parse(JSON.parse(ward(['status', '--json']).stdout));
  const alpha = document.projects.find((project) => project.floor === 1);
  expect(alpha?.sessions.map((session) => [session.id, session.purpose])).toEqual([
    ['f1-1@test', 'run alpha'],
  ]);
  expect(document.projects.find((project) => project.floor === 0)?.sessions).toEqual([]);
  expect(document.sessions.map((session) => session.id)).toEqual(['workspace-1@test']);

  const human = ward(['status']).stdout;
  expect(human).toMatch(/floor 1 — alpha \[active\]\n {2}session f1-1@test — run alpha \(/);
});

test('show, locate, resume, close: one floor session through every verb, with --json', () => {
  ward([
    'session',
    'open',
    '--floor',
    '1',
    '--purpose',
    'run alpha',
    '--handle',
    `claude:${RUN_ID}`,
  ]);

  const shown = ward(['session', 'show', 'f1-1@test']);
  expect(shown.stdout).toContain('scope    floor 1');
  const record = sessionMutationShape.parse(
    JSON.parse(ward(['session', 'show', 'f1-1@test', '--json']).stdout),
  );
  expect(record).toMatchObject({ scope: 'project', floor: 1, state: 'open' });
  expect(record.task).toBeUndefined();

  const gone = sessionLocateShape.parse(
    JSON.parse(ward(['session', 'locate', 'f1-1@test', '--json']).stdout),
  );
  expect(gone).toMatchObject({ scope: 'project', floor: 1, outcome: 'gone' });

  // Gone here: the fresh start it offers is another floor session.
  const refused = ward(['session', 'resume', 'f1-1@test']);
  expect(refused.exitCode).toBe(1);
  expect(refused.stderr).toContain('ward session open --floor 1 --purpose TEXT');

  fabricateTranscript(RUN_ID, ws);
  expect(ward(['session', 'resume', 'f1-1@test']).exitCode).toBe(0);
  expect(runs()[0]?.argv).toEqual(['--resume', RUN_ID]);
  expect(runs()[0]?.wardAgent).toBe('f1-1@test');

  const closed = sessionMutationShape.parse(
    JSON.parse(ward(['session', 'close', 'f1-1@test', '--json']).stdout),
  );
  expect(closed).toMatchObject({ scope: 'project', floor: 1, state: 'closed' });
  expect(closed.events?.map((event) => event.event)).toEqual([
    'opened',
    'resume-failed',
    'resumed',
    'closed',
  ]);
});

test('floor ids climb per floor and never repeat', async () => {
  for (const purpose of ['one', 'two']) {
    ward(['session', 'open', '--floor', '1', '--purpose', purpose, '--handle', 'claude:x']);
  }
  ward(['session', 'close', 'f1-1@test']);
  ward(['session', 'open', '--floor', '1', '--purpose', 'three', '--handle', 'claude:x']);
  ward(['session', 'open', '--floor', '0', '--purpose', 'ground', '--handle', 'claude:x']);
  expect((await readSessions(ws, FLOOR_DIR)).map((record) => record.id)).toEqual([
    'f1-1@test',
    'f1-2@test',
    'f1-3@test',
  ]);
  expect((await readSessions(ws, 'projects/0-workspace'))[0]?.id).toBe('f0-1@test');
});

test('the record names its floor exactly when its scope is a project', () => {
  const base = {
    type: 'session',
    id: 'f1-1@test',
    purpose: 'p',
    workingDirectory: '.',
    state: 'open',
    openedAt: '2026-10-16T00:00:00.000Z',
  };
  expect(sessionSchema.safeParse({ ...base, scope: 'project', floor: 1 }).success).toBe(true);
  expect(sessionSchema.safeParse({ ...base, scope: 'project' }).success).toBe(false);
  expect(sessionSchema.safeParse({ ...base, scope: 'workspace', floor: 1 }).success).toBe(false);
  expect(sessionSchema.safeParse({ ...base, task: 't1', floor: 1 }).success).toBe(false);
  // A pre-0029 task record — no scope, no floor — still parses unchanged.
  expect(sessionSchema.safeParse({ ...base, task: 't1' }).success).toBe(true);
});

test('ward schema documents the scope and the floor', () => {
  const schema = ward(['schema', 'session', 'open']).stdout;
  expect(schema).toContain('"project"');
  expect(schema).toContain('"floor"');
});

// -- scaffolding ------------------------------------------------------------

interface Run {
  readonly argv: string[];
  readonly cwd: string;
  readonly wardAgent: string | null;
  readonly recordSeen: boolean;
}

let scratch: string;
let ws: string;
let claudeHome: string;
let logFile: string;
let stub: string;
let caseId = 0;

const cliPath = new URL('../../src/cli/index.ts', import.meta.url).pathname;

function ward(argv: string[], options: { env?: Record<string, string> } = {}): CliResult {
  const result = Bun.spawnSync(['bun', cliPath, ...argv], {
    cwd: ws,
    env: {
      ...process.env,
      NO_COLOR: '1',
      WARD_CLAUDE_BIN: stub,
      CLAUDE_CONFIG_DIR: claudeHome,
      ...options.env,
    },
  });
  return {
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  };
}

function runs(): Run[] {
  if (!existsSync(logFile)) return [];
  return readFileSync(logFile, 'utf8')
    .split('\n')
    .filter((line) => line !== '')
    .map((line) => JSON.parse(line) as Run);
}

function fabricateTranscript(nativeId: string, cwd: string): void {
  const dir = join(claudeHome, 'projects', mungeCwd(cwd));
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${nativeId}.jsonl`), '{"type":"user"}\n');
}

beforeEach(async () => {
  applyGitTestEnv();
  caseId += 1;
  scratch ??= makeTempDir();
  ws = join(scratch, `ws-${caseId}`);
  claudeHome = join(scratch, `claude-home-${caseId}`);
  logFile = join(scratch, `runs-${caseId}.jsonl`);
  stub = writeFakeClaude(scratch, `claude-${caseId}`, { logFile });
  await createWorkspace(ws);
  await openProject(ws, 'alpha');
});

afterAll(() => {
  if (scratch !== undefined) removeDir(scratch);
});
