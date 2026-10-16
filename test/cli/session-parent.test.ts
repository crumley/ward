// The session that started a session (design/0052-session-parent-link/): a
// `ward session open` run from inside another session — its WARD_AGENT naming
// a session in this workspace — records that session as the new one's
// `parent`, on every path (task record-only, workspace record-only, launched).
// A declaration that names no session here records nothing and refuses
// nothing. Through the spawned CLI, never the real Claude Code.
import { afterAll, beforeEach, expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { type SessionMutationShape, sessionMutationShape } from '../../src/cli/schema.ts';
import type { SessionRecord } from '../../src/store/types.ts';
import { type OpenSessionListing, parentOf } from '../../src/workspace/sessions.ts';
import {
  applyGitTestEnv,
  makeTempDir,
  removeDir,
  runWard,
  runWardEnv,
  writeFakeClaude,
} from '../helpers.ts';

const COORDINATOR = 'workspace-1@test';

// -- parentOf: the rule, as a table ---------------------------------------------

test.each([
  // [what, declared, new handle, expected parent]
  ['nothing declared', undefined, undefined, undefined],
  ['an open session here', COORDINATOR, 'claude:child', COORDINATOR],
  [
    'a closed session here — it still opened this one',
    'feature-1@test',
    undefined,
    'feature-1@test',
  ],
  ['WARD_AGENT=1 — an agent with no session', '1', undefined, undefined],
  ["another workspace's session", 'workspace-9@elsewhere', undefined, undefined],
  ['the same run recording itself again', COORDINATOR, 'claude:coordinator', undefined],
] as const)('parentOf: %s', (_what, declared, handle, expected) => {
  expect(parentOf(SESSIONS, declared, handle)).toBe(expected);
});

// -- every open path records it -------------------------------------------------

test('a task session opened from inside a session records it as parent, and show says so', () => {
  const opened = openChild(['session', 'open', 'f0t1', '--purpose', 'build it', '--json']);
  expect(opened.parent).toBe(COORDINATOR);
  expect(opened.id).toBe('feature-1@test');

  const shown = runWard(['session', 'show', 'feature-1@test'], ws);
  expect(shown.exitCode).toBe(0);
  expect(shown.stdout).toContain(`parent   ${COORDINATOR}`);
  const json = runWard(['session', 'show', 'feature-1@test', '--json'], ws);
  expect(sessionMutationShape.parse(JSON.parse(json.stdout)).parent).toBe(COORDINATOR);
});

test('a record-only workspace session records its parent too', () => {
  const opened = openChild(['session', 'open', '--handle', 'pi:sub', '--json']);
  expect(opened).toMatchObject({ id: 'workspace-2@test', scope: 'workspace', parent: COORDINATOR });
});

test('a launched session records its parent, and its own run is declared as itself', () => {
  const stub = writeFakeClaude(scratch, `claude-${caseId}`, { logFile });
  const result = runWardEnv(['session', 'open', '--purpose', 'a child', '--json'], ws, {
    WARD_AGENT: COORDINATOR,
    WARD_CLAUDE_BIN: stub,
    CLAUDE_CONFIG_DIR: join(scratch, `claude-home-${caseId}`),
  });
  expect(result.exitCode).toBe(0);
  const opened = sessionMutationShape.parse(JSON.parse(result.stdout));
  expect(opened).toMatchObject({ id: 'workspace-2@test', parent: COORDINATOR });
  // The child is born declaring ITS OWN id, so whatever it opens names it.
  const [run] = readFileSync(logFile, 'utf8')
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line));
  expect(run.wardAgent).toBe('workspace-2@test');
});

test('grandchildren chain: each open names the session it was opened from', () => {
  openChild(['session', 'open', 'f0t1', '--purpose', 'child', '--json']);
  const grandchild = parse(
    runWardEnv(['session', 'open', 'f0t1', '--purpose', 'grandchild', '--json'], ws, {
      WARD_AGENT: 'feature-1@test',
    }),
  );
  expect(grandchild).toMatchObject({ id: 'feature-2@test', parent: 'feature-1@test' });
});

// -- what records nothing, and refuses nothing ----------------------------------

test.each([
  ['no WARD_AGENT at all', {}],
  ['WARD_AGENT=1', { WARD_AGENT: '1' }],
  ['an id this workspace never allocated', { WARD_AGENT: 'workspace-9@elsewhere' }],
] as const)('no parent when the caller declares %s — and the open still succeeds', (_what, env) => {
  const result = runWardEnv(['session', 'open', 'f0t1', '--purpose', 'p', '--json'], ws, env);
  expect(result.exitCode).toBe(0);
  expect(parse(result).parent).toBeUndefined();
  expect(runWard(['session', 'show', 'feature-1@test'], ws).stdout).not.toContain('parent');
});

test('a closed session still names the sessions it opened', () => {
  expect(runWard(['session', 'close', COORDINATOR], ws).exitCode).toBe(0);
  expect(openChild(['session', 'open', 'f0t1', '--purpose', 'after', '--json']).parent).toBe(
    COORDINATOR,
  );
});

// -- scaffolding ------------------------------------------------------------------

/** Two sessions in hand for the pure rule: one open with a handle, one closed. */
const SESSIONS: readonly OpenSessionListing[] = [
  { scopeDir: '', record: session(COORDINATOR, 'open', 'claude:coordinator') },
  {
    scopeDir: 'projects/0-workspace/tasks/t1-feature',
    record: session('feature-1@test', 'closed'),
  },
];

function session(id: string, state: 'open' | 'closed', handle?: string): SessionRecord {
  return {
    type: 'session',
    id,
    scope: 'workspace',
    purpose: 'p',
    workingDirectory: '.',
    ...(handle === undefined ? {} : { handle }),
    state,
    openedAt: '2026-10-16T00:00:00.000Z',
  };
}

/** Open a session from inside the coordinator, returning its document. */
function openChild(argv: string[]): SessionMutationShape {
  return parse(runWardEnv(argv, ws, { WARD_AGENT: COORDINATOR }));
}

function parse(result: { exitCode: number; stdout: string; stderr: string }): SessionMutationShape {
  expect(result.stderr).toBe('');
  expect(result.exitCode).toBe(0);
  return sessionMutationShape.parse(JSON.parse(result.stdout));
}

let scratch: string;
let ws: string;
let logFile: string;
let caseId = 0;

beforeEach(() => {
  applyGitTestEnv();
  caseId += 1;
  scratch ??= makeTempDir();
  ws = join(scratch, `ws-${caseId}`);
  logFile = join(scratch, `runs-${caseId}.jsonl`);
  expect(existsSync(logFile)).toBe(false);
  expect(runWard(['workspace', 'create', ws], scratch).exitCode).toBe(0);
  expect(runWard(['task', 'open', 'feature', '--project', '0'], ws).exitCode).toBe(0);
  // The coordinating session every case opens from: recorded, not launched.
  const coordinator = runWard(
    ['session', 'open', '--purpose', 'coordinate', '--handle', 'claude:coordinator'],
    ws,
  );
  expect(coordinator.exitCode).toBe(0);
});

afterAll(() => {
  if (scratch !== undefined) removeDir(scratch);
});
