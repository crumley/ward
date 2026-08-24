// Launched sessions, end to end through the spawned CLI
// (design/0029-launched-sessions/): `ward session open --purpose TEXT` opens a
// WORKSPACE-scope session, writes its record, and only then runs the agent —
// which the stub harness proves by looking for its own session document from
// inside the launch. Since design/0032-task-scope-session-launch/ the same
// spine launches at TASK scope: `session open TASK` stands the agent in the
// task's sole worktree, refuses legibly when there are none or several, and
// `--dir` says where. Then resume (with its events, failure included) and
// locate (found vs. gone), and the record-only paths that stayed as they were.
//
// No test here spawns the real Claude Code: WARD_CLAUDE_BIN points at the
// stub, the same hermeticity seam WARD_GH and WARD_CONFIG_DIR provide.
import { afterAll, beforeEach, expect, test } from 'bun:test';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { sessionLocateShape, sessionMutationShape } from '../../src/cli/schema.ts';
import { mungeCwd } from '../../src/harness/claude.ts';
import { readDocument, writeDocument } from '../../src/store/document.ts';
import {
  type SessionRecord,
  workspaceRecordType,
  worktreeRecordType,
} from '../../src/store/types.ts';
import { createWorkspace } from '../../src/workspace/create.ts';
import { gitOrThrow } from '../../src/workspace/git.ts';
import { openSession, readSessions } from '../../src/workspace/sessions.ts';
import { openTask } from '../../src/workspace/tasks.ts';
import {
  applyGitTestEnv,
  type CliResult,
  makeTempDir,
  removeDir,
  writeFakeClaude,
} from '../helpers.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// -- the launch -------------------------------------------------------------

test('open with no TASK: the record first, then the agent, in the workspace root', async () => {
  const opened = ward(['session', 'open', '--purpose', 'run the workspace']);
  expect(opened.exitCode).toBe(0);
  expect(opened.stdout).toContain('opened session workspace-1');
  expect(opened.stdout).toContain('launching the agent in .');

  const [record] = await readSessions(ws, '');
  expect(record).toMatchObject({
    id: 'workspace-1',
    scope: 'workspace',
    state: 'open',
    workingDirectory: '.',
    purpose: 'run the workspace',
  });
  expect(record?.task).toBeUndefined(); // no task invented to hold it
  expect(record?.events).toEqual([{ event: 'opened', at: expect.any(String) }]);

  const [run] = runs();
  // The stub looked for `sessions/workspace-1.md` from inside its own launch
  // and found it: the record precedes the process, always.
  expect(run?.recordSeen).toBe(true);
  expect(run?.wardAgent).toBe('workspace-1'); // born declared
  expect(run?.cwd).toBe(ws);
  expect(run?.argv[0]).toBe('--session-id');
  expect(run?.argv[1]).toMatch(UUID);
  // The handle Ward recorded IS the id the process was started under.
  expect(record?.handle).toBe(`claude:${run?.argv[1]}`);
});

test('the resolved configuration becomes the argv — absent keys omit their flags', async () => {
  // Global: model + effort + one arg. Workspace: the model alone, overriding
  // per key (design/0028-agent-configuration/) — so the launch must carry the
  // workspace's model, the global's effort, and the global's args.
  writeGlobalConfig({ model: 'fable', effort: 'high', args: ['--dangerously-skip-permissions'] });
  await writeWorkspaceAgent({ model: 'sonnet' });

  expect(ward(['session', 'open', '--purpose', 'configured']).exitCode).toBe(0);
  const [run] = runs();
  expect(run?.argv.slice(2)).toEqual([
    '--model',
    'sonnet',
    '--effort',
    'high',
    '--dangerously-skip-permissions',
  ]);
  // …and what it was started with is ON the record: reproduction reads the
  // session, not the machine that happened to launch it.
  expect((await readSessions(ws, ''))[0]).toMatchObject({ model: 'sonnet', effort: 'high' });

  // Nothing configured at all: the id and nothing else — no flag is invented.
  writeGlobalConfig(undefined);
  await writeWorkspaceAgent(undefined);
  expect(ward(['session', 'open', '--purpose', 'unconfigured']).exitCode).toBe(0);
  expect(runs()[1]?.argv.length).toBe(2);
  const unconfigured = (await readSessions(ws, ''))[1];
  expect(unconfigured?.model).toBeUndefined(); // nothing chosen, nothing recorded
  expect(unconfigured?.effort).toBeUndefined();
});

test('--json: one document, emitted before the run takes the terminal', () => {
  const result = ward(['session', 'open', '--purpose', 'machine-readable', '--json']);
  expect(result.exitCode).toBe(0);
  const document = sessionMutationShape.parse(JSON.parse(result.stdout));
  expect(document).toMatchObject({ id: 'workspace-1', scope: 'workspace', state: 'open' });
  expect(document.task).toBeUndefined();
  expect(document.events).toEqual([{ event: 'opened', at: expect.any(String) }]);
  expect(runs()[0]?.recordSeen).toBe(true);
});

test("the run's exit code is the invocation's, and the session stays open", async () => {
  const result = ward(['session', 'open', '--purpose', 'fails'], { exitCode: 3 });
  expect(result.exitCode).toBe(3);
  // An exit is not a close (open ≠ running) — the record still says open, and
  // the affordance says how to pick it back up.
  expect(result.stdout).toContain('session workspace-1 is still open — an exit is not a close');
  expect(result.stdout).toContain('ward session resume workspace-1');
  expect((await readSessions(ws, ''))[0]?.state).toBe('open');
});

test('a harness that will not start: refused legibly, with the record standing', async () => {
  const result = ward(['session', 'open', '--purpose', 'no binary'], {
    bin: '/nonexistent/claude',
  });
  expect(result.exitCode).toBe(1);
  expect(result.stdout).toContain('opened session workspace-1'); // written before the attempt
  expect(result.stderr).toContain('the agent did not start');
  expect(result.stderr).toContain('ward session resume workspace-1');
  const [record] = await readSessions(ws, '');
  expect(record).toMatchObject({ state: 'open', scope: 'workspace' });
});

// -- the launch, at task scope (design/0032-task-scope-session-launch/) -----

test('open TASK: the record beside its task, the agent standing in the sole worktree', async () => {
  writeGlobalConfig({ model: 'fable', effort: 'high' });
  await openTask(ws, 'feature', {});
  await fabricateWorktree('tasks/t1-feature', 't1-feature');

  const opened = ward(['session', 'open', 't1', '--purpose', 'drive the feature']);
  expect(opened.exitCode).toBe(0);
  expect(opened.stdout).toContain('opened session feature-1');
  expect(opened.stdout).toContain('(task t1, handle claude:');
  expect(opened.stdout).toContain('launching the agent in worktrees/t1-feature');

  const [record] = await readSessions(ws, 'tasks/t1-feature');
  expect(record).toMatchObject({
    id: 'feature-1',
    scope: 'task',
    task: 't1',
    state: 'open',
    workingDirectory: 'worktrees/t1-feature',
    purpose: 'drive the feature',
    model: 'fable', // what it was started with, on the record — same as workspace scope
    effort: 'high',
  });
  const [run] = runs();
  expect(run?.recordSeen).toBe(true); // the record precedes the process at this scope too
  expect(run?.wardAgent).toBe('feature-1');
  expect(run?.cwd).toBe(join(ws, 'worktrees', 't1-feature')); // the task's own room
  expect(run?.argv[0]).toBe('--session-id');
  // The handle Ward recorded IS the id the process was started under.
  expect(record?.handle).toBe(`claude:${run?.argv[1]}`);

  // …and the session still open after the exit, with the resume affordance.
  expect(opened.stdout).toContain('session feature-1 is still open');
});

test('open TASK --json: one document, task-shaped, before the run', async () => {
  await openTask(ws, 'feature', {});
  await fabricateWorktree('tasks/t1-feature', 't1-feature');
  const result = ward(['session', 'open', 't1', '--purpose', 'machine-readable', '--json']);
  expect(result.exitCode).toBe(0);
  const document = sessionMutationShape.parse(JSON.parse(result.stdout));
  expect(document).toMatchObject({
    id: 'feature-1',
    scope: 'task',
    task: 't1',
    state: 'open',
    workingDirectory: 'worktrees/t1-feature',
  });
  expect(runs()[0]?.recordSeen).toBe(true);
});

test('open TASK with no worktree: refused legibly, nothing manufactured — unless --dir', async () => {
  await openTask(ws, 'feature', {});
  const refused = ward(['session', 'open', 't1', '--purpose', 'nowhere to stand']);
  expect(refused.exitCode).toBe(1);
  expect(refused.stderr).toContain("task 't1' has no worktree to stand the agent in");
  expect(refused.stderr).toContain('ward worktree create t1 --repo NAME');
  expect(refused.stderr).toContain('--dir PATH');
  expect(await readSessions(ws, 'tasks/t1-feature')).toEqual([]); // no record, no id spent
  expect(runs()).toEqual([]); // no process either

  // --dir says where, and the launch proceeds exactly there.
  const placed = ward(['session', 'open', 't1', '--purpose', 'placed by hand', '--dir', '.']);
  expect(placed.exitCode).toBe(0);
  expect((await readSessions(ws, 'tasks/t1-feature'))[0]?.workingDirectory).toBe('.');
  expect(runs()[0]?.cwd).toBe(ws);
});

test('open TASK with several worktrees: refused naming each — --dir picks one', async () => {
  await openTask(ws, 'feature', {});
  await fabricateWorktree('tasks/t1-feature', 't1-feature');
  await fabricateWorktree('tasks/t1-feature', 't1-second');

  const refused = ward(['session', 'open', 't1', '--purpose', 'which room?']);
  expect(refused.exitCode).toBe(1);
  expect(refused.stderr).toContain("task 't1' has 2 worktrees");
  expect(refused.stderr).toContain('worktrees/t1-feature');
  expect(refused.stderr).toContain('worktrees/t1-second');
  expect(await readSessions(ws, 'tasks/t1-feature')).toEqual([]);
  expect(runs()).toEqual([]);

  const placed = ward([
    'session',
    'open',
    't1',
    '--purpose',
    'the second room',
    '--dir',
    'worktrees/t1-second',
  ]);
  expect(placed.exitCode).toBe(0);
  expect((await readSessions(ws, 'tasks/t1-feature'))[0]?.workingDirectory).toBe(
    'worktrees/t1-second',
  );
  expect(runs()[0]?.cwd).toBe(join(ws, 'worktrees', 't1-second'));
});

test('open TASK --handle stays record-only — a run Ward did not start', async () => {
  await openTask(ws, 'feature', {});
  await fabricateWorktree('tasks/t1-feature', 't1-feature');
  const result = ward([
    'session',
    'open',
    't1',
    '--purpose',
    'already running',
    '--handle',
    'claude:existing',
  ]);
  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain('opened session feature-1 (task t1, in worktrees/t1-feature)');
  expect(runs()).toEqual([]); // nothing was started
  const [record] = await readSessions(ws, 'tasks/t1-feature');
  expect(record).toMatchObject({ handle: 'claude:existing', scope: 'task', task: 't1' });
  expect(record?.model).toBeUndefined(); // recorded only where Ward did the starting
});

test('resume of a launched task session re-attaches in the recorded worktree', async () => {
  await openTask(ws, 'feature', {});
  await fabricateWorktree('tasks/t1-feature', 't1-feature');
  ward(['session', 'open', 't1', '--purpose', 'resume me']);
  const nativeId = runs()[0]?.argv[1] ?? '';

  const resumed = ward(['session', 'resume', 'feature-1']);
  expect(resumed.exitCode).toBe(0);
  expect(resumed.stdout).toContain('resuming session feature-1');
  expect(runs()[1]?.argv).toEqual(['--resume', nativeId]);
  expect(runs()[1]?.cwd).toBe(join(ws, 'worktrees', 't1-feature')); // the recorded directory
  expect(eventsOf(await readSessions(ws, 'tasks/t1-feature'))).toEqual(['opened', 'resumed']);
});

// -- resume -----------------------------------------------------------------

test('resume: the same id, in the recorded directory, with the attempt recorded', async () => {
  writeGlobalConfig({ model: 'fable', args: ['--dangerously-skip-permissions'] });
  ward(['session', 'open', '--purpose', 'resume me']);
  const nativeId = runs()[0]?.argv[1] ?? '';

  const resumed = ward(['session', 'resume', 'workspace-1']);
  expect(resumed.exitCode).toBe(0);
  expect(resumed.stdout).toContain('resuming session workspace-1');
  // The model is NOT passed — the run restores its own — while the
  // per-invocation args ride along.
  expect(runs()[1]?.argv).toEqual(['--resume', nativeId, '--dangerously-skip-permissions']);
  expect(runs()[1]?.cwd).toBe(ws);
  expect(eventsOf(await readSessions(ws, ''))).toEqual(['opened', 'resumed']);

  // Under --json the mutation report is the record with the attempt on it,
  // emitted before the run takes the terminal — the same posture as open.
  const document = sessionMutationShape.parse(
    JSON.parse(ward(['session', 'resume', 'workspace-1', '--json']).stdout),
  );
  expect(document.state).toBe('open');
  expect(document.events?.map((event) => event.event)).toEqual(['opened', 'resumed', 'resumed']);
});

test('a resume that cannot start records resume-failed, with its cause', async () => {
  ward(['session', 'open', '--purpose', 'resume me']);
  const failed = ward(['session', 'resume', 'workspace-1'], { bin: '/nonexistent/claude' });
  expect(failed.exitCode).toBe(1);
  expect(failed.stderr).toContain('the agent did not start');

  const [record] = await readSessions(ws, '');
  expect(eventsOf([record as SessionRecord])).toEqual(['opened', 'resumed', 'resume-failed']);
  const last = record?.events?.at(-1);
  expect(last?.cause).toContain('/nonexistent/claude');
  expect(record?.state).toBe('open'); // a failed re-attach closes nothing
});

test('resume works on a manually recorded task session — any claude: handle', async () => {
  await openTask(ws, 'feature', {});
  ward(['session', 'open', 't1', '--purpose', 'hand-recorded', '--handle', 'claude:abc-123']);
  const resumed = ward(['session', 'resume', 'feature-1']);
  expect(resumed.exitCode).toBe(0);
  expect(runs()[0]?.argv).toEqual(['--resume', 'abc-123']);
  expect(eventsOf(await readSessions(ws, 'tasks/t1-feature'))).toEqual(['opened', 'resumed']);
});

test('a session Ward cannot re-attach to is refused by name, never guessed at', async () => {
  await openTask(ws, 'feature', {});
  // A record with no handle at all — the store API still writes them (a
  // pre-0029 shape); the CLI's handle-less path now launches instead.
  await openSession(ws, 't1', 'no handle', {});
  const noHandle = ward(['session', 'resume', 'feature-1']);
  expect(noHandle.exitCode).toBe(1);
  expect(noHandle.stderr).toContain('has no harness handle');

  ward(['session', 'open', 't1', '--purpose', 'foreign', '--handle', 'codex:xyz']);
  const foreign = ward(['session', 'resume', 'feature-2']);
  expect(foreign.exitCode).toBe(1);
  expect(foreign.stderr).toContain('no harness Ward has can resolve');
  expect(runs()).toEqual([]); // neither ever reached a spawn
});

// -- locate -----------------------------------------------------------------

test('locate: gone and found are distinct outcomes, both exit 0', () => {
  ward(['session', 'open', '--purpose', 'locate me']);
  const nativeId = runs()[0]?.argv[1] ?? '';

  const gone = ward(['session', 'locate', 'workspace-1']);
  expect(gone.exitCode).toBe(0);
  expect(gone.stdout).toContain('gone');
  expect(gone.stdout).toContain('the harness owns retention');

  fabricateTranscript(nativeId, ws);
  const found = ward(['session', 'locate', 'workspace-1']);
  expect(found.exitCode).toBe(0);
  expect(found.stdout).toContain('found');
  expect(found.stdout).toContain(join(claudeHome, 'projects', mungeCwd(ws), `${nativeId}.jsonl`));
});

test('locate --json: the handle, the address, and the outcome as data', () => {
  ward(['session', 'open', '--purpose', 'locate me']);
  const nativeId = runs()[0]?.argv[1] ?? '';
  fabricateTranscript(nativeId, ws);

  const document = sessionLocateShape.parse(
    JSON.parse(ward(['session', 'locate', 'workspace-1', '--json']).stdout),
  );
  expect(document).toEqual({
    id: 'workspace-1',
    scope: 'workspace',
    state: 'open',
    handle: `claude:${nativeId}`,
    harness: 'claude',
    nativeId,
    workingDirectory: '.',
    outcome: 'found',
    path: join(claudeHome, 'projects', mungeCwd(ws), `${nativeId}.jsonl`),
  });
});

test('a closed session still locates — reflection reads finished work', () => {
  ward(['session', 'open', '--purpose', 'closed later']);
  const nativeId = runs()[0]?.argv[1] ?? '';
  fabricateTranscript(nativeId, ws);
  expect(ward(['session', 'close', 'workspace-1']).exitCode).toBe(0);

  const document = sessionLocateShape.parse(
    JSON.parse(ward(['session', 'locate', 'workspace-1', '--json']).stdout),
  );
  expect(document).toMatchObject({ state: 'closed', outcome: 'found' });
  // …but resuming it is refused: closed stays closed.
  expect(ward(['session', 'resume', 'workspace-1']).exitCode).toBe(1);
});

// -- the record-only paths, and what came before ----------------------------

test('--handle at workspace scope records without launching', async () => {
  const result = ward([
    'session',
    'open',
    '--purpose',
    'already running',
    '--handle',
    'claude:existing',
  ]);
  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain('opened session workspace-1 (workspace scope, in .)');
  expect(runs()).toEqual([]); // nothing was started
  expect((await readSessions(ws, ''))[0]?.handle).toBe('claude:existing');
});

test('a session record written before 0029 still parses, closes, and locates', async () => {
  await openTask(ws, 'feature', {});
  // Exactly the front matter a pre-0029 ward wrote: a task, no scope, no events.
  const dir = join(ws, 'tasks', 't1-feature', 'sessions');
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, 'feature-1.md'),
    ['---', 'type: session', 'id: feature-1', 'task: t1', 'purpose: legacy', ...LEGACY_TAIL].join(
      '\n',
    ),
  );
  gitOrThrow(ws, 'add', '-A');
  gitOrThrow(ws, 'commit', '-m', 'a pre-0029 session record');

  // It reads as a task session, and `--json` says so without inventing fields.
  const located = sessionLocateShape.parse(
    JSON.parse(ward(['session', 'locate', 'feature-1', '--json']).stdout),
  );
  expect(located).toMatchObject({ scope: 'task', task: 't1', outcome: 'gone' });

  const closed = sessionMutationShape.parse(
    JSON.parse(ward(['session', 'close', 'feature-1', '--json']).stdout),
  );
  expect(closed).toMatchObject({ scope: 'task', task: 't1', state: 'closed' });
  // The trail starts where the record starts: one `closed` event, no
  // fabricated `opened` for an event nobody recorded.
  expect(closed.events).toEqual([{ event: 'closed', at: expect.any(String) }]);
});

test('ids stay unique among open sessions across scopes', async () => {
  await openTask(ws, 'workspace-ish', {});
  ward(['session', 'open', '--purpose', 'first']);
  ward(['session', 'open', '--purpose', 'second', '--handle', 'claude:two']);
  expect((await readSessions(ws, '')).map((record) => record.id)).toEqual([
    'workspace-1',
    'workspace-2',
  ]);
  // …and the discriminator is reused once the first closes.
  expect(ward(['session', 'close', 'workspace-1']).exitCode).toBe(0);
  ward(['session', 'open', '--purpose', 'third', '--handle', 'claude:three']);
  const open = (await readSessions(ws, '')).filter((record) => record.state === 'open');
  expect(open.map((record) => record.id).sort()).toEqual(['workspace-1', 'workspace-2']);
});

// -- scaffolding ------------------------------------------------------------
// A fresh workspace per case (every verb here mutates), a stub harness whose
// invocations are read back from a log, and a throwaway CLAUDE_CONFIG_DIR so
// transcript lookups never touch the developer's own.

const LEGACY_TAIL = [
  'workingDirectory: worktrees/t1-feature',
  'handle: claude:legacy-run',
  'state: open',
  'openedAt: "2026-08-01T00:00:00.000Z"',
  '---',
  '',
  'Session `feature-1` of task `t1`.',
  '',
];

interface Run {
  readonly argv: string[];
  readonly cwd: string;
  readonly wardAgent: string | null;
  readonly recordSeen: boolean;
}

let scratch: string;
let ws: string;
let claudeHome: string;
let configHome: string;
let logFile: string;
let stub: string;
let caseId = 0;

/** One CLI invocation with the stub harness wired in (a row may override it). */
function ward(argv: string[], options: { bin?: string; exitCode?: number } = {}): CliResult {
  const bin =
    options.bin ??
    (options.exitCode === undefined
      ? stub
      : writeFakeClaude(scratch, `claude-exit-${caseId}`, { logFile, exitCode: options.exitCode }));
  const result = Bun.spawnSync(['bun', cliPath, ...argv], {
    cwd: ws,
    env: {
      ...process.env,
      NO_COLOR: '1',
      WARD_CLAUDE_BIN: bin,
      CLAUDE_CONFIG_DIR: claudeHome,
      WARD_CONFIG_DIR: configHome,
    },
  });
  return {
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  };
}

/** Every harness invocation this case made, in order. */
function runs(): Run[] {
  if (!existsSync(logFile)) return [];
  return readFileSync(logFile, 'utf8')
    .split('\n')
    .filter((line) => line !== '')
    .map((line) => JSON.parse(line) as Run);
}

function eventsOf(records: readonly (SessionRecord | undefined)[]): string[] {
  return (records[0]?.events ?? []).map((event) => event.event);
}

/**
 * A worktree the task can stand its agent in: the record (which is what the
 * launch reads) plus the directory (which is what the spawn stands in). No
 * repository is registered and no git worktree exists — the launch consumes
 * the RECORD, which is the point: the directory question is answered from the
 * store, never from a git scan.
 */
async function fabricateWorktree(taskDir: string, name: string): Promise<void> {
  const path = `worktrees/${name}`;
  await writeDocument(ws, worktreeRecordType(taskDir, name), {
    data: {
      type: 'worktree',
      repo: 'demo',
      branch: name,
      disposition: 'deliverable',
      path,
      createdAt: new Date().toISOString(),
    },
    body: `Worktree \`${path}\` (test fixture).`,
  });
  mkdirSync(join(ws, path), { recursive: true });
}

/** A transcript where the harness would have written one. */
function fabricateTranscript(nativeId: string, cwd: string): void {
  const dir = join(claudeHome, 'projects', mungeCwd(cwd));
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${nativeId}.jsonl`), '{"type":"user"}\n');
}

function writeGlobalConfig(agent: Record<string, unknown> | undefined): void {
  mkdirSync(configHome, { recursive: true });
  const body = agent === undefined ? '' : `agent:\n${indent(agent)}`;
  writeFileSync(join(configHome, 'config.md'), `---\ntype: ward-config\n${body}---\n`);
}

async function writeWorkspaceAgent(agent: Record<string, unknown> | undefined): Promise<void> {
  const document = await readDocument(ws, workspaceRecordType);
  const data = { ...document.data };
  if (agent === undefined) delete (data as { agent?: unknown }).agent;
  else Object.assign(data, { agent });
  await writeDocument(ws, workspaceRecordType, { data, body: document.body });
}

/** The agent block as YAML, two spaces in — the front matter a human would type. */
function indent(agent: Record<string, unknown>): string {
  return Object.entries(agent)
    .map(([key, value]) =>
      Array.isArray(value)
        ? `  ${key}:\n${value.map((item) => `    - ${String(item)}`).join('\n')}\n`
        : `  ${key}: ${String(value)}\n`,
    )
    .join('');
}

const cliPath = new URL('../../src/cli/index.ts', import.meta.url).pathname;

beforeEach(async () => {
  applyGitTestEnv();
  caseId += 1;
  scratch ??= makeTempDir();
  ws = join(scratch, `ws-${caseId}`);
  claudeHome = join(scratch, `claude-home-${caseId}`);
  configHome = join(scratch, `config-${caseId}`);
  logFile = join(scratch, `runs-${caseId}.jsonl`);
  stub = writeFakeClaude(scratch, `claude-${caseId}`, { logFile });
  await createWorkspace(ws);
  writeGlobalConfig(undefined);
});

afterAll(() => {
  if (scratch !== undefined) removeDir(scratch);
});
