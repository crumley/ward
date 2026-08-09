// Live forge state through the spawned CLI (design/0009-live-forge-state/):
// status and task list read each linked PR's live state via the gh boundary
// (WARD_GH pointing at a fake — never the network), refine the in-review
// overlay to intent's ≥1-open-PR rule, and derive the needs-you items; when
// the forge cannot answer, both verbs render everything they render today
// with forge state marked unavailable — same exit code, no forge fields,
// byte-identical across runs. The close gate reads through the same boundary.
import { afterAll, beforeAll, expect, test } from 'bun:test';
import { join } from 'node:path';
import { statusShape, taskListShape } from '../../src/cli/schema.ts';
import {
  applyGitTestEnv,
  makeTempDir,
  removeDir,
  runWard,
  runWardEnv,
  writeFakeGh,
} from '../helpers.ts';

const PR_MERGED = 'https://example.com/x/pull/1';
const PR_CHANGES = 'https://example.com/x/pull/2';
const PR_DONE = 'https://example.com/x/pull/3';

// t1 links a merged PR and an open changes-requested one; t2's set is fully
// merged; t3 links nothing.
test('status --json live: per-PR forge state, the exact in-review rule, needs-you derived', () => {
  const result = runWardEnv(['status', '--json'], ws, { NO_COLOR: '1', WARD_GH: fakeGh });
  expect(result.exitCode).toBe(0);
  const status = JSON.parse(result.stdout);
  expect(() => statusShape.parse(status)).not.toThrow(); // the live doc honors the contract

  const [t1, t2, t3] = status.bareTasks;
  expect(t1.forge).toEqual([
    { url: PR_MERGED, state: 'merged' },
    { url: PR_CHANGES, state: 'open', reviewDecision: 'changes-requested' },
  ]);
  expect(t1.inReview).toBe(true);
  expect(t2.forge).toEqual([{ url: PR_DONE, state: 'merged', reviewDecision: 'approved' }]);
  expect(t2.inReview).toBe(false); // fully merged: linked PRs, but no longer in review
  expect(t3.forge).toBeUndefined(); // nothing linked, nothing to report
  expect(status.needsYou).toEqual([
    { task: 't1', reason: 'changes-requested', pr: PR_CHANGES },
    { task: 't2', reason: 'awaiting-close' },
  ]);
});

test('status human rendering live: PR summaries on the task lines, the needs-you block', () => {
  const result = runWardEnv(['status'], ws, { NO_COLOR: '1', WARD_GH: fakeGh });
  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain(
    't1 first [active · in-review] — prs: 1 open (changes requested) · 1 merged',
  );
  expect(result.stdout).toContain('t2 second [active] — prs: 1 merged');
  expect(result.stdout).toContain('needs you');
  expect(result.stdout).toContain('task t1 — changes requested on ' + PR_CHANGES);
  expect(result.stdout).toContain('task t2 — PR set fully merged; close it: ward task close t2');
  expect(result.stdout).not.toContain('unavailable');
});

test('task list carries the same live forge state, both renderings', () => {
  const json = runWardEnv(['task', 'list', '--json'], ws, { NO_COLOR: '1', WARD_GH: fakeGh });
  const tasks = JSON.parse(json.stdout);
  expect(() => taskListShape.parse(tasks)).not.toThrow();
  expect(tasks[0].forge.map((pr: { state: string }) => pr.state)).toEqual(['merged', 'open']);
  expect(tasks[1].inReview).toBe(false);
  expect(tasks[2].forge).toBeUndefined();

  const human = runWardEnv(['task', 'list'], ws, { NO_COLOR: '1', WARD_GH: fakeGh });
  expect(human.stdout).toContain(
    't1 first [active · in-review] — prs: 1 open (changes requested) · 1 merged',
  );
  expect(human.stdout).toContain('t2 second [active] — prs: 1 merged');
});

test('a declared agent gets the same live content as a human, without ANSI', () => {
  const human = runWardEnv(['status'], ws, { NO_COLOR: '1', WARD_GH: fakeGh });
  const agent = runWardEnv(['status'], ws, {
    WARD_AGENT: 'forge-state-1',
    FORCE_COLOR: '1',
    WARD_GH: fakeGh,
  });
  expect(agent.stdout).toBe(human.stdout);
  expect(agent.stdout).not.toContain('\x1b'); // no ANSI, even under FORCE_COLOR
});

test('without gh, status renders everything it renders today and marks the forge unavailable', () => {
  const result = runWard(['status'], ws); // runWard pins WARD_GH to an impossible path
  expect(result.exitCode).toBe(0);
  expect(result.stderr).toBe('');
  expect(result.stdout).toContain('t1 first [active · in-review]'); // the approximation stands
  expect(result.stdout).toContain('t2 second [active · in-review]'); // merged, but unknowable now
  expect(result.stdout).toContain('t3 third [active]');
  expect(result.stdout).toContain('forge state unavailable (gh)');
  expect(result.stdout).not.toContain('needs you');
  expect(result.stdout).not.toContain('prs:');
});

test('without gh, the JSON omits every forge-state field — vanished, never null', () => {
  const result = runWard(['status', '--json'], ws);
  expect(result.exitCode).toBe(0);
  const status = JSON.parse(result.stdout);
  for (const task of status.bareTasks) {
    expect('forge' in task).toBe(false);
  }
  expect('needsYou' in status).toBe(false);
  expect(runWard(['status', '--json'], ws).stdout).toBe(result.stdout); // byte-identical
  const tasks = JSON.parse(runWard(['task', 'list', '--json'], ws).stdout);
  for (const task of tasks) {
    expect('forge' in task).toBe(false);
  }
});

test('a forge that errors on every PR degrades exactly like an absent one', () => {
  const broken = writeFakeGh(scratch, 'gh-all-errors', { responses: {} });
  const result = runWardEnv(['status'], ws, { NO_COLOR: '1', WARD_GH: broken });
  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain('forge state unavailable (gh)');
  expect(result.stdout).toBe(runWard(['status'], ws).stdout);
});

test('a hung forge is cut at the deadline; status still answers, degraded', () => {
  const hung = writeFakeGh(scratch, 'gh-hung', {
    responses: { [PR_MERGED]: { state: 'MERGED' } },
    delayMs: 30_000,
  });
  const started = Date.now();
  const result = runWardEnv(['status'], ws, {
    NO_COLOR: '1',
    WARD_GH: hung,
    WARD_GH_TIMEOUT_MS: '300',
  });
  expect(result.exitCode).toBe(0);
  expect(Date.now() - started).toBeLessThan(15_000); // the deadline, not the 30s hang
  expect(result.stdout).toContain('forge state unavailable (gh)');
});

test('with no PRs anywhere needs-you is vacuously empty — present even without gh', () => {
  const result = runWard(['status', '--json'], emptyWs);
  expect(JSON.parse(result.stdout).needsYou).toEqual([]);
  const human = runWard(['status'], emptyWs);
  expect(human.stdout).not.toContain('unavailable'); // nothing forge-dependent was shown
  expect(human.stdout).not.toContain('needs you');
});

// The close gate reads the same boundary: an open PR refuses the close, a
// fully merged set delivers, and the trusted path reports its trust.
test('task close reads the forge through the same seam', () => {
  const refused = runWardEnv(['task', 'close', 't1'], ws, { NO_COLOR: '1', WARD_GH: fakeGh });
  expect(refused.exitCode).toBe(1);
  expect(refused.stderr).toContain('a linked PR is still open');

  const trusted = runWard(['task', 'close', 't2'], ws); // no gh: stated outcome trusted
  expect(trusted.exitCode).toBe(0);
  expect(trusted.stdout).toContain("forge unavailable — trusting the stated outcome 'delivered'");
});

test('task close delivers a fully merged set the forge confirmed', () => {
  runWard(['task', 'open', 'done', '--purpose', 'merged elsewhere'], ws);
  runWard(['task', 'pr', 't2', PR_DONE], ws); // t2 was freed by the close above
  const result = runWardEnv(['task', 'close', 't2'], ws, { NO_COLOR: '1', WARD_GH: fakeGh });
  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain('resolved (merged)');
});

// -- setup ----------------------------------------------------------------
// One workspace with three bare tasks — t1 (merged + open/changes-requested),
// t2 (fully merged), t3 (no PRs) — and one fake gh serving all three answers;
// plus an empty workspace for the vacuous needs-you case. No repos: PR links
// need no worktree, which keeps the forge behavior isolated from git.

let scratch: string;
let ws: string;
let emptyWs: string;
let fakeGh: string;

beforeAll(() => {
  applyGitTestEnv();
  scratch = makeTempDir();
  ws = join(scratch, 'ws');
  emptyWs = join(scratch, 'empty');
  runWard(['workspace', 'create', ws], scratch);
  runWard(['workspace', 'create', emptyWs], scratch);
  runWard(['task', 'open', 'first'], ws);
  runWard(['task', 'open', 'second'], ws);
  runWard(['task', 'open', 'third'], ws);
  runWard(['task', 'pr', 't1', PR_MERGED], ws);
  runWard(['task', 'pr', 't1', PR_CHANGES], ws);
  runWard(['task', 'pr', 't2', PR_DONE], ws);
  runWard(['task', 'open', 'idle'], emptyWs);
  fakeGh = writeFakeGh(scratch, 'gh-live', {
    responses: {
      [PR_MERGED]: { state: 'MERGED' },
      [PR_CHANGES]: { state: 'OPEN', reviewDecision: 'CHANGES_REQUESTED' },
      [PR_DONE]: { state: 'MERGED', reviewDecision: 'APPROVED' },
    },
  });
});

afterAll(() => {
  removeDir(scratch);
});
