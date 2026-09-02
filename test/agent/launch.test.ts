// Launched sessions, end to end through the spawned CLI
// (design/0029-launched-sessions/): `ward session open --purpose TEXT` opens a
// WORKSPACE-scope session, writes its record, and only then runs the agent —
// which the stub harness proves by looking for its own session document from
// inside the launch. Then resume (with its events, failure included) and
// locate (found vs. gone), and the record-only paths that stayed as they were.
//
// No test here spawns the real Claude Code: WARD_CLAUDE_BIN points at the
// stub, the same hermeticity seam WARD_GH and WARD_CONFIG_DIR provide — and
// the cases that exercise a configured `agent.command` (design/0035) leave the
// override unset and point the command itself at the stub.
import { afterAll, beforeEach, expect, test } from 'bun:test';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { sessionLocateShape, sessionMutationShape } from '../../src/cli/schema.ts';
import { mungeCwd } from '../../src/harness/claude.ts';
import { readDocument, writeDocument } from '../../src/store/document.ts';
import { type SessionRecord, workspaceRecordType } from '../../src/store/types.ts';
import { createWorkspace } from '../../src/workspace/create.ts';
import { gitOrThrow } from '../../src/workspace/git.ts';
import { defaultWorkspaceSessionPurpose, readSessions } from '../../src/workspace/sessions.ts';
import { openTask } from '../../src/workspace/tasks.ts';
import {
  applyGitTestEnv,
  type CliResult,
  makeTempDir,
  removeDir,
  writeFakeClaude,
} from '../helpers.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const DEFAULT_PURPOSE = /^Coordinating work · opened \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;

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

test('open with no TASK and no --purpose: the launch runs, and the record states the purpose itself', async () => {
  // design/0034-workspace-session-shorthand/: `wws` opens a workspace session
  // without making the human invent a purpose — Ward states one on their
  // behalf, stamped with the record's own opening instant.
  const opened = ward(['session', 'open']);
  expect(opened.exitCode).toBe(0);
  expect(opened.stdout).toContain('opened session workspace-1');
  expect(runs()[0]?.recordSeen).toBe(true);
  const [launched] = await readSessions(ws, '');
  expect(launched?.scope).toBe('workspace');
  expect(launched?.purpose).toBe(defaultWorkspaceSessionPurpose(launched?.openedAt ?? ''));
  expect(launched?.purpose).toMatch(DEFAULT_PURPOSE);
  // …and the record-only path at workspace scope may leave it out too.
  const recorded = ward(['session', 'open', '--handle', 'claude:by-hand']);
  expect(recorded.exitCode).toBe(0);
  const [, byHand] = await readSessions(ws, '');
  expect(byHand?.handle).toBe('claude:by-hand');
  expect(byHand?.purpose).toBe(defaultWorkspaceSessionPurpose(byHand?.openedAt ?? ''));
});

test("the default purpose is the record's own instant, to the second", () => {
  expect(defaultWorkspaceSessionPurpose('2026-09-02T22:41:07.123Z')).toBe(
    'Coordinating work · opened 2026-09-02T22:41:07Z',
  );
  expect(defaultWorkspaceSessionPurpose('2026-09-02T22:41:07Z')).toBe(
    'Coordinating work · opened 2026-09-02T22:41:07Z',
  );
});

test('a task session still states its purpose — refused before any record is written', async () => {
  await openTask(ws, 'feature', {});
  const refused = ward(['session', 'open', 't1']);
  expect(refused.exitCode).toBe(1);
  expect(refused.stderr).toContain('ward session open t1 --purpose TEXT');
  expect(await readSessions(ws, 'tasks/t1-feature')).toEqual([]);
  expect(runs()).toEqual([]); // nothing launched
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

test("agent.command is how the harness is invoked here: its words first, then Ward's flags, then args", async () => {
  // The work machine's case (design/0035-agent-command/): the CLI is reached
  // through a launcher, so the command is `[launcher, claude]` and Ward's own
  // flags follow the launcher's words. The stub stands in for the launcher
  // and records everything after itself — so `claude` shows up as argv[0].
  writeGlobalConfig({ command: [stub, 'claude'], args: ['--dangerously-skip-permissions'] });
  const opened = ward(['session', 'open', '--purpose', 'through a launcher'], { bin: null });
  expect(opened.exitCode).toBe(0);
  const [run] = runs();
  expect(run?.argv[0]).toBe('claude');
  expect(run?.argv[1]).toBe('--session-id');
  expect(run?.argv[2]).toMatch(UUID);
  expect(run?.argv.slice(3)).toEqual(['--dangerously-skip-permissions']);
  expect(run?.wardAgent).toBe('workspace-1');
  expect(run?.recordSeen).toBe(true);

  // A resume goes through the same command — the launcher is a property of
  // this machine, needed exactly as much the second time.
  const nativeId = run?.argv[2] ?? '';
  expect(ward(['session', 'resume', 'workspace-1'], { bin: null }).exitCode).toBe(0);
  expect(runs()[1]?.argv).toEqual([
    'claude',
    '--resume',
    nativeId,
    '--dangerously-skip-permissions',
  ]);

  // The workspace overrides the whole list, and the record never carries the
  // command: how the harness is reached is the machine's fact, not the run's.
  await writeWorkspaceAgent({ command: [stub] });
  expect(ward(['session', 'open', '--purpose', 'direct here'], { bin: null }).exitCode).toBe(0);
  expect(runs()[2]?.argv[0]).toBe('--session-id');
  const records = await readSessions(ws, '');
  expect(records.every((record) => !('command' in record))).toBe(true);
});

test('a configured command that cannot start is the same legible refusal, naming the key', async () => {
  writeGlobalConfig({ command: ['/nonexistent/launcher', 'claude'] });
  const result = ward(['session', 'open', '--purpose', 'no launcher'], { bin: null });
  expect(result.exitCode).toBe(1);
  expect(result.stderr).toContain('the agent did not start');
  expect(result.stderr).toContain('/nonexistent/launcher');
  expect(result.stderr).toContain('agent.command');
  expect((await readSessions(ws, ''))[0]?.state).toBe('open'); // recorded before the attempt
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
  ward(['session', 'open', 't1', '--purpose', 'no handle']);
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

/**
 * One CLI invocation with the stub harness wired in through WARD_CLAUDE_BIN (a
 * row may override it — or pass `bin: null` to leave the override unset, so
 * the configured `agent.command` is what runs).
 */
function ward(argv: string[], options: { bin?: string | null; exitCode?: number } = {}): CliResult {
  const bin =
    options.bin === null
      ? undefined
      : (options.bin ??
        (options.exitCode === undefined
          ? stub
          : writeFakeClaude(scratch, `claude-exit-${caseId}`, {
              logFile,
              exitCode: options.exitCode,
            })));
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
