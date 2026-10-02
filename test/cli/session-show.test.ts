// Records read through Ward, not the files (design/0045-agent-record-reads/):
// `ward session show ID` answers for one session, open or closed; a refusal
// to close or resume says WHICH miss it is; a task session opened from inside
// a harness run records that run's handle without the agent spelling it.
// Through the spawned CLI, never the real Claude Code.
import { afterAll, beforeEach, expect, test } from 'bun:test';
import { join } from 'node:path';
import { sessionMutationShape } from '../../src/cli/schema.ts';
import { ambientHandle } from '../../src/harness/index.ts';
import { applyGitTestEnv, makeTempDir, removeDir, runWard, runWardEnv } from '../helpers.ts';

const RUN_ID = '0f8fad5b-d9cb-469f-a165-70867728950e';

// -- session show ---------------------------------------------------------------

test('session show: an open task session — scope, state, handle, and its trail', () => {
  runWard(['session', 'open', 'f0t1', '--purpose', 'drive it', '--handle', `claude:${RUN_ID}`], ws);
  const result = runWard(['session', 'show', 'feature-1@test'], ws);
  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain('feature-1@test open — drive it');
  expect(result.stdout).toContain('scope    task t1');
  expect(result.stdout).toContain('machine  test');
  expect(result.stdout).toContain(`handle   claude:${RUN_ID}`);
  expect(result.stdout).toMatch(/events\n {2}\S+ opened\n$/);
});

test('session show --json: a session closed by its task is the record session close emits', () => {
  runWard(['session', 'open', 'f0t1', '--purpose', 'swept up'], ws);
  expect(runWard(['task', 'close', 'f0t1', '--outcome', 'abandoned'], ws).exitCode).toBe(0);

  const result = runWard(['session', 'show', 'feature-1@test', '--json'], ws);
  expect(result.exitCode).toBe(0);
  const document = sessionMutationShape.parse(JSON.parse(result.stdout));
  expect(document).toMatchObject({
    id: 'feature-1@test',
    scope: 'task',
    task: 't1',
    purpose: 'swept up',
    state: 'closed',
  });
  expect(document.closedAt).toBeString();
  expect(document.events?.map((event) => event.event)).toEqual(['opened', 'closed']);
  expect(document.handle).toBeUndefined();
});

test('session show: an id that names nothing is refused, pointing at status', () => {
  const result = runWard(['session', 'show', 'nobody-1@test'], ws);
  expect(result.exitCode).toBe(1);
  expect(result.stdout).toBe('');
  expect(result.stderr).toContain("no session has id 'nobody-1@test'");
});

// -- the refusals say which miss ------------------------------------------------

test('closing a session its task already closed says so, with when, and where to read it', () => {
  runWard(['session', 'open', 'f0t1', '--purpose', 'swept up'], ws);
  runWard(['task', 'close', 'f0t1', '--outcome', 'abandoned'], ws);

  for (const verb of ['close', 'resume']) {
    const result = runWard(['session', verb, 'feature-1@test'], ws);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(
      /session 'feature-1@test' is already closed at \S+Z — closed stays closed; its record: ward session show feature-1@test/,
    );
  }
  // An id that was never allocated is the other miss, and reads as one.
  const unknown = runWard(['session', 'close', 'feature-9@test'], ws);
  expect(unknown.exitCode).toBe(1);
  expect(unknown.stderr).toContain("no session has id 'feature-9@test'");
});

// -- the handle comes from the run ----------------------------------------------

test('a task session opened inside a Claude Code run records that run, unasked', () => {
  const result = runWardEnv(['session', 'open', 'f0t1', '--purpose', 'from inside', '--json'], ws, {
    CLAUDE_CODE_SESSION_ID: RUN_ID,
  });
  expect(result.exitCode).toBe(0);
  expect(sessionMutationShape.parse(JSON.parse(result.stdout)).handle).toBe(`claude:${RUN_ID}`);
});

test('--handle still wins over the run, and outside any run nothing is recorded', () => {
  const explicit = runWardEnv(
    ['session', 'open', 'f0t1', '--purpose', 'named', '--handle', 'pi:abc', '--json'],
    ws,
    { CLAUDE_CODE_SESSION_ID: RUN_ID },
  );
  expect(sessionMutationShape.parse(JSON.parse(explicit.stdout)).handle).toBe('pi:abc');

  const outside = runWard(['session', 'open', 'f0t1', '--purpose', 'bare', '--json'], ws);
  expect(sessionMutationShape.parse(JSON.parse(outside.stdout)).handle).toBeUndefined();
});

test('ambientHandle: the run Claude Code names, and an empty value is no run', () => {
  expect(ambientHandle({ CLAUDE_CODE_SESSION_ID: RUN_ID })).toBe(`claude:${RUN_ID}`);
  expect(ambientHandle({ CLAUDE_CODE_SESSION_ID: '' })).toBeNull();
  expect(ambientHandle({})).toBeNull();
});

// -- scaffolding ------------------------------------------------------------------

let scratch: string;
let ws: string;
let caseId = 0;

beforeEach(() => {
  applyGitTestEnv();
  caseId += 1;
  scratch ??= makeTempDir();
  ws = join(scratch, `ws-${caseId}`);
  expect(runWard(['workspace', 'create', ws], scratch).exitCode).toBe(0);
  expect(runWard(['task', 'open', 'feature', '--project', '0'], ws).exitCode).toBe(0);
});

afterAll(() => {
  if (scratch !== undefined) removeDir(scratch);
});
