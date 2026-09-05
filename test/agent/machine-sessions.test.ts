// Machine-bound sessions, end to end through the spawned CLI
// (design/0038-machine-bound-sessions/): ids that carry the machine and never
// reuse a number, a resume that is honest about a history this machine does
// not hold, the workspace-scope sessions in `ward status`, and the question
// Ward asks a present human when a run exits — asked of nobody else.
//
// No test here spawns the real Claude Code: WARD_CLAUDE_BIN points at the
// stub, and WARD_MACHINE pins what this machine is called, so every id in an
// assertion is written down rather than derived from the developer's hostname.
import { afterAll, beforeEach, expect, test } from 'bun:test';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { sessionMutationShape, statusShape } from '../../src/cli/schema.ts';
import { mungeCwd } from '../../src/harness/claude.ts';
import { createWorkspace } from '../../src/workspace/create.ts';
import { gitOrThrow } from '../../src/workspace/git.ts';
import { readSessions } from '../../src/workspace/sessions.ts';
import {
  applyGitTestEnv,
  type CliResult,
  makeTempDir,
  removeDir,
  writeFakeClaude,
} from '../helpers.ts';

// -- ids carry the machine, and never reuse a number -------------------------

test('the id names the machine, the record states it, and --json carries it', async () => {
  const opened = ward(['session', 'open', '--purpose', 'on the laptop'], { machine: 'mbp' });
  expect(opened.exitCode).toBe(0);
  expect(opened.stdout).toContain('opened session workspace-1@mbp');

  const [record] = await readSessions(ws, '');
  expect(record).toMatchObject({ id: 'workspace-1@mbp', machine: 'mbp', state: 'open' });
  expect(existsSync(join(ws, 'sessions', 'workspace-1@mbp.md'))).toBe(true);

  const document = sessionMutationShape.parse(
    JSON.parse(
      ward(['session', 'open', '--purpose', 'again', '--json'], { machine: 'mbp' }).stdout,
    ),
  );
  expect(document).toMatchObject({ id: 'workspace-2@mbp', machine: 'mbp' });
});

test('two machines allocate side by side — the sync has nothing to collide over', async () => {
  ward(['session', 'open', '--purpose', 'laptop'], { machine: 'mbp' });
  // The other machine's clone, allocating from the same records: its own
  // counter, its own suffix, so the two documents are two files.
  ward(['session', 'open', '--purpose', 'server'], { machine: 'gcp' });
  expect((await readSessions(ws, '')).map((record) => record.id)).toEqual([
    'workspace-1@gcp',
    'workspace-1@mbp',
  ]);
});

test('a pre-0038 id keeps working, and the numbering climbs past it', async () => {
  writeLegacySession('workspace-6');
  // No `@`, no machine on the record — and the next allocation does not sit
  // down beside it at 1: unmachined ids count toward every machine's count.
  expect(ward(['session', 'open', '--purpose', 'after the old ones']).exitCode).toBe(0);
  const ids = (await readSessions(ws, '')).map((record) => record.id);
  expect(ids).toEqual(['workspace-6', 'workspace-7@test']);

  // The old id still resolves everywhere a bare id is taken.
  expect(ward(['session', 'locate', 'workspace-6']).stdout).toContain('gone');
  expect(ward(['session', 'close', 'workspace-6']).exitCode).toBe(0);
  expect((await readSessions(ws, ''))[0]?.state).toBe('closed');
});

// -- resume is honest about whose history it is ------------------------------

test('a session that ran on another machine is refused here, with nothing recorded', async () => {
  ward(['session', 'open', '--purpose', 'on the laptop'], { machine: 'mbp' });
  clearRuns();

  const refused = ward(['session', 'resume', 'workspace-1@mbp'], { machine: 'gcp' });
  expect(refused.exitCode).toBe(1);
  expect(refused.stderr).toContain('ran on mbp');
  expect(refused.stderr).toContain('is not on gcp');
  expect(refused.stderr).toContain('Resume it on mbp');
  expect(refused.stderr).toContain('ward session open --purpose TEXT');
  expect(runs()).toEqual([]); // refused BEFORE any launch

  // No `resumed` event: nothing was attempted here, and the trail says so.
  const [record] = await readSessions(ws, '');
  expect(record?.events?.map((event) => event.event)).toEqual(['opened']);
  expect(record?.state).toBe('open'); // and nothing was closed on its behalf
});

test('a history gone on THIS machine records resume-failed instead of a doomed spawn', async () => {
  ward(['session', 'open', '--purpose', 'no transcript']);
  clearRuns();

  const refused = ward(['session', 'resume', 'workspace-1@test']);
  expect(refused.exitCode).toBe(1);
  expect(refused.stderr).toContain('no harness history on test');
  expect(refused.stderr).toContain('resume-failed');
  expect(runs()).toEqual([]); // the run that could only fail never started

  const [record] = await readSessions(ws, '');
  expect(record?.events?.map((event) => event.event)).toEqual(['opened', 'resume-failed']);
  expect(record?.events?.at(-1)?.cause).toContain('history not found at');
  expect(record?.state).toBe('open'); // unresumable is not closed
});

test('a transcript that is here resumes, whatever machine the record names', () => {
  // Facts beat assumptions: a synced transcript is a history this machine
  // really holds, so the record's machine does not veto it.
  ward(['session', 'open', '--purpose', 'carried across'], { machine: 'mbp' });
  fabricateTranscript(runs()[0]?.argv[1] ?? '', ws);
  const resumed = ward(['session', 'resume', 'workspace-1@mbp'], { machine: 'gcp' });
  expect(resumed.exitCode).toBe(0);
  expect(resumed.stdout).toContain('resuming session workspace-1@mbp');
});

test('locate names the machine the run stood on', () => {
  ward(['session', 'open', '--purpose', 'locate me'], { machine: 'mbp' });
  expect(ward(['session', 'locate', 'workspace-1@mbp']).stdout).toContain('ran on mbp in .');
});

// -- the workspace's sessions, in status -------------------------------------

test('status names the open workspace sessions, each with what to do about it', () => {
  ward(['session', 'open', '--purpose', 'here and now']);
  fabricateTranscript(runs()[0]?.argv[1] ?? '', ws);
  ward(['session', 'open', '--purpose', 'on the laptop'], { machine: 'mbp' });
  writeLegacySession('workspace-9');

  const shown = ward(['status']).stdout;
  expect(shown).toContain('sessions');
  expect(shown).toContain('workspace-1@test — here and now (history here)');
  expect(shown).toContain('workspace-1@mbp — on the laptop (on mbp — resume it there)');
  expect(shown).toContain(
    'workspace-9 — legacy (machine unrecorded · history gone — ' +
      'close with: ward session close workspace-9)',
  );

  const report = statusShape.parse(JSON.parse(ward(['status', '--json']).stdout));
  expect(report.machine).toBe('test');
  expect(report.sessions).toEqual([
    {
      id: 'workspace-1@mbp',
      purpose: 'on the laptop',
      machine: 'mbp',
      openedAt: expect.any(String),
      history: 'gone',
    },
    {
      id: 'workspace-1@test',
      purpose: 'here and now',
      machine: 'test',
      openedAt: expect.any(String),
      history: 'found',
    },
    { id: 'workspace-9', purpose: 'legacy', openedAt: expect.any(String), history: 'gone' },
  ]);

  // A closed session leaves the block: closed stays closed, and a list that
  // only grew would stop being read.
  expect(ward(['session', 'close', 'workspace-9']).exitCode).toBe(0);
  expect(ward(['status']).stdout).not.toContain('workspace-9');
});

// -- the exit question -------------------------------------------------------

test('--on-exit close: the run exits and the session closes, no question asked', async () => {
  const result = ward(['session', 'open', '--purpose', 'a quick look', '--on-exit', 'close']);
  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain('closed session workspace-1@test');
  expect(result.stdout).not.toContain('Close session'); // nothing was asked
  expect(result.stdout).not.toContain('is still open');

  const [record] = await readSessions(ws, '');
  expect(record?.state).toBe('closed');
  // The close is the ordinary one: the same event, the same journal commit.
  expect(record?.events?.map((event) => event.event)).toEqual(['opened', 'closed']);
  expect(typeof record?.closedAt).toBe('string');
});

test('--on-exit keep, and the default for a caller with no terminal: nothing is asked', async () => {
  const kept = ward(['session', 'open', '--purpose', 'keep it', '--on-exit', 'keep']);
  expect(kept.stdout).toContain('session workspace-1@test is still open');
  expect(kept.stdout).not.toContain('Close session');

  // The default is `ask`, and this caller's stdin is a pipe — so it degrades
  // to keep, and the deterministic output a script relies on is unchanged.
  const piped = ward(['session', 'open', '--purpose', 'piped']);
  expect(piped.stdout).toContain('session workspace-2@test is still open');
  expect(piped.stdout).not.toContain('Close session');
  expect((await readSessions(ws, '')).every((record) => record.state === 'open')).toBe(true);
});

test('--on-exit close on a resume, and the run’s exit code still propagates', async () => {
  ward(['session', 'open', '--purpose', 'resume then close']);
  fabricateTranscript(runs()[0]?.argv[1] ?? '', ws);

  const resumed = ward(['session', 'resume', 'workspace-1@test', '--on-exit', 'close'], {
    exitCode: 3,
  });
  expect(resumed.exitCode).toBe(3); // the run's verdict, after the session is settled
  expect(resumed.stdout).toContain('closed session workspace-1@test');
  expect((await readSessions(ws, ''))[0]?.state).toBe('closed');
});

test('--on-exit close under --json closes without a second document', async () => {
  const result = ward([
    'session',
    'open',
    '--purpose',
    'machine-readable',
    '--json',
    '--on-exit',
    'close',
  ]);
  expect(result.exitCode).toBe(0);
  // Still exactly one document on stdout (0005) — the record as it stood
  // before the run, which is what a caller parses.
  const document = sessionMutationShape.parse(JSON.parse(result.stdout));
  expect(document).toMatchObject({ id: 'workspace-1@test', state: 'open' });
  expect((await readSessions(ws, ''))[0]?.state).toBe('closed');
});

// -- scaffolding ------------------------------------------------------------
// A fresh workspace per case, a stub harness whose invocations are read back
// from a log, and a throwaway CLAUDE_CONFIG_DIR so transcript lookups never
// touch the developer's own.

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

/** One CLI invocation: the stub harness, and the machine this run believes it is on. */
function ward(argv: string[], options: { machine?: string; exitCode?: number } = {}): CliResult {
  const bin =
    options.exitCode === undefined
      ? stub
      : writeFakeClaude(scratch, `claude-exit-${caseId}`, { logFile, exitCode: options.exitCode });
  const result = Bun.spawnSync(['bun', cliPath, ...argv], {
    cwd: ws,
    env: {
      ...process.env,
      NO_COLOR: '1',
      WARD_CLAUDE_BIN: bin,
      CLAUDE_CONFIG_DIR: claudeHome,
      WARD_CONFIG_DIR: configHome,
      ...(options.machine === undefined ? {} : { WARD_MACHINE: options.machine }),
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

function clearRuns(): void {
  writeFileSync(logFile, '');
}

/** A transcript where the harness would have written one. */
function fabricateTranscript(nativeId: string, cwd: string): void {
  const dir = join(claudeHome, 'projects', mungeCwd(cwd));
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${nativeId}.jsonl`), '{"type":"user"}\n');
}

/** A workspace-scope record as a pre-0038 ward wrote it: a bare id, no machine. */
function writeLegacySession(id: string): void {
  const dir = join(ws, 'sessions');
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, `${id}.md`),
    [
      '---',
      'type: session',
      `id: ${id}`,
      'scope: workspace',
      'purpose: legacy',
      'workingDirectory: .',
      'handle: claude:legacy-run',
      'state: open',
      'openedAt: "2026-08-01T00:00:00.000Z"',
      '---',
      '',
      `Session \`${id}\` at workspace scope.`,
      '',
    ].join('\n'),
  );
  gitOrThrow(ws, 'add', '-A');
  gitOrThrow(ws, 'commit', '-m', `a pre-0038 session record: ${id}`);
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
});

afterAll(() => {
  if (scratch !== undefined) removeDir(scratch);
});
