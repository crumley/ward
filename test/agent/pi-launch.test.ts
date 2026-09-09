// A pi session, end to end through the spawned CLI (design/0044-pi-harness/):
// with `harness: pi` configured, `ward session open` selects the pi adapter,
// mints a `pi:` handle, and launches the pi CLI under Ward's assigned
// `--session-id`; resume re-attaches with `--session`; locate resolves the
// handle to pi's own per-cwd history and names the harness. No test spawns the
// real pi — WARD_PI_BIN points at the same stub the claude launch tests use
// (the stub only records the argv, cwd, and declared env, which is harness-
// agnostic), and PI_CODING_AGENT_DIR points pi's storage at a scratch dir.
import { afterAll, beforeEach, expect, test } from 'bun:test';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { piNativeId, piSessionDir } from '../../src/harness/pi.ts';
import { createWorkspace } from '../../src/workspace/create.ts';
import { readSessions } from '../../src/workspace/sessions.ts';
import {
  applyGitTestEnv,
  type CliResult,
  makeTempDir,
  removeDir,
  runWardEnv,
  writeFakeClaude,
} from '../helpers.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

interface Run {
  readonly argv: string[];
  readonly cwd: string;
  readonly wardAgent: string | null;
  readonly recordSeen: boolean;
}

let scratch: string | undefined;
let ws: string;
let piHome: string;
let configHome: string;
let logFile: string;
let stub: string;
let caseId = 0;

/** One CLI invocation with the pi stub wired in through WARD_PI_BIN. */
function ward(argv: string[]): CliResult {
  return runWardEnv(argv, ws, {
    NO_COLOR: '1',
    WARD_PI_BIN: stub,
    PI_CODING_AGENT_DIR: piHome,
    WARD_CONFIG_DIR: configHome,
  });
}

function runs(): Run[] {
  if (!existsSync(logFile)) return [];
  return readFileSync(logFile, 'utf8')
    .split('\n')
    .filter((line) => line !== '')
    .map((line) => JSON.parse(line) as Run);
}

/** A pi history file where pi would have written one: `<ts>_<id>.jsonl`. */
function fabricatePiHistory(nativeId: string): string {
  const dir = piSessionDir(ws, { PI_CODING_AGENT_DIR: piHome });
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `2026-09-09T22-15-00-000Z_${nativeId}.jsonl`);
  writeFileSync(file, '{"type":"session"}\n');
  return file;
}

beforeEach(async () => {
  applyGitTestEnv();
  caseId += 1;
  scratch ??= makeTempDir();
  ws = join(scratch, `ws-${caseId}`);
  piHome = join(scratch, `pi-home-${caseId}`);
  configHome = join(scratch, `config-${caseId}`);
  logFile = join(scratch, `runs-${caseId}.jsonl`);
  stub = writeFakeClaude(scratch, `pi-${caseId}`, { logFile });
  await createWorkspace(ws);
  mkdirSync(configHome, { recursive: true });
  writeFileSync(
    join(configHome, 'config.md'),
    '---\ntype: ward-config\nagent:\n  harness: pi\n---\n',
  );
});

afterAll(() => {
  if (scratch !== undefined) removeDir(scratch);
});

test('open with harness pi: a pi: handle, the pi CLI under Ward’s --session-id', async () => {
  const opened = ward(['session', 'open', '--purpose', 'run pi']);
  expect(opened.exitCode).toBe(0);
  expect(opened.stdout).toContain('opened session workspace-1@test');

  const [record] = await readSessions(ws, '');
  expect(record?.handle).toMatch(/^pi:[0-9a-f-]+$/);

  const [run] = runs();
  expect(run?.recordSeen).toBe(true); // record precedes the process, as for claude
  expect(run?.wardAgent).toBe('workspace-1@test'); // born declared
  expect(run?.cwd).toBe(ws);
  expect(run?.argv[0]).toBe('--session-id');
  expect(run?.argv[1]).toMatch(UUID);
  // The handle Ward recorded IS the id the process was started under.
  expect(record?.handle).toBe(`pi:${run?.argv[1]}`);
});

test('locate resolves the pi handle to pi’s own history and names the harness', async () => {
  const opened = ward(['session', 'open', '--purpose', 'run pi']);
  expect(opened.exitCode).toBe(0);
  const [record] = await readSessions(ws, '');
  const nativeId = piNativeId(record?.handle ?? '');
  expect(nativeId).not.toBeNull();

  // Gone before pi writes anything: an ordinary outcome, exit 0.
  const gone = ward(['session', 'locate', 'workspace-1@test', '--json']);
  expect(gone.exitCode).toBe(0);
  expect(JSON.parse(gone.stdout)).toMatchObject({ harness: 'pi', outcome: 'gone' });

  const file = fabricatePiHistory(nativeId ?? '');
  const found = ward(['session', 'locate', 'workspace-1@test', '--json']);
  expect(JSON.parse(found.stdout)).toMatchObject({ harness: 'pi', outcome: 'found', path: file });
});

test('resume re-attaches with --session, no model or thinking', async () => {
  const opened = ward(['session', 'open', '--purpose', 'run pi']);
  expect(opened.exitCode).toBe(0);
  const [record] = await readSessions(ws, '');
  const nativeId = piNativeId(record?.handle ?? '') ?? '';
  fabricatePiHistory(nativeId); // resume locates first; the history must be here

  const resumed = ward(['session', 'resume', 'workspace-1@test']);
  expect(resumed.exitCode).toBe(0);
  const resumeRun = runs()[1];
  expect(resumeRun?.argv[0]).toBe('--session');
  expect(resumeRun?.argv[1]).toBe(nativeId);
  expect(resumeRun?.argv).not.toContain('--model');
  expect(resumeRun?.argv).not.toContain('--thinking');
});

test('doctor names the pi command and its own WARD_PI_BIN override', async () => {
  const report = JSON.parse(ward(['doctor', '--json']).stdout);
  expect(report.agent.harness).toEqual({ provenance: 'global', value: 'pi' });
  const command = report.workspace.find((f: { check: string }) => f.check === 'agent command');
  expect(command.severity).toBe('ok');
  expect(command.message).toBe(`${stub} (WARD_PI_BIN) — ${stub}`);
});
