// `ward task show ADDRESS` and the PR lines in `status`
// (design/0043-task-next-surface/): one task on one screen — header, pull
// requests with live review and check state, worktrees with their freshness,
// open sessions, and the derived next step — through the spawned CLI, with
// the forge faked (WARD_GH), never the network.
import { afterAll, beforeAll, expect, test } from 'bun:test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { taskShowShape } from '../../src/cli/schema.ts';
import { writeDocument } from '../../src/store/document.ts';
import { type TaskRecord, taskRecordType } from '../../src/store/types.ts';
import {
  applyGitTestEnv,
  makeTempDir,
  removeDir,
  runWard,
  runWardEnv,
  writeFakeGh,
} from '../helpers.ts';

const PR_OPEN = 'https://example.com/x/pull/10';
const PR_MERGED = 'https://example.com/x/pull/11';

// -- the one-screen answer -------------------------------------------------

test('task show: header, PR lines with live state, worktrees, sessions, and the next step', () => {
  const result = runWardEnv(['task', 'show', 'f1t1'], ws, { NO_COLOR: '1', WARD_GH: fakeGh });
  expect(result.exitCode).toBe(0);
  const out = result.stdout;
  expect(out).toContain('f1t1 shipping [active · in-review]');
  expect(out).toContain('floor    1 — delivery');
  expect(out).toContain('purpose  ship the thing');
  expect(out).toContain('repos    demo');

  expect(out).toContain('pull requests');
  expect(out).toContain(`    ${PR_MERGED} — merged`);
  expect(out).toContain(`    ${PR_OPEN} — open · review: none yet · checks: failing`);

  expect(out).toContain('worktrees');
  expect(out).toContain('worktrees/f1t1-shipping');
  expect(out).toContain('sessions');
  expect(out).toContain('shipping-1@test — drive it (no harness handle)');

  // Checks failing outranks a pending review: there is nothing to review
  // until it builds.
  expect(out).toContain(`next\n    fix checks on ${PR_OPEN}`);
});

test('task show --json: the documented shape, with the next step carrying its noun', () => {
  const result = runWardEnv(['task', 'show', 'f1t1', '--json'], ws, {
    NO_COLOR: '1',
    WARD_GH: fakeGh,
  });
  expect(result.exitCode).toBe(0);
  const document = JSON.parse(result.stdout);
  expect(() => taskShowShape.parse(document)).not.toThrow();
  expect(document.task).toMatchObject({ address: 'f1t1', slug: 'shipping', inReview: true });
  expect(document.project).toEqual({ floor: 1, slug: 'delivery', state: 'active' });
  expect(document.task.forge).toEqual([
    { url: PR_MERGED, state: 'merged', checks: 'passing' },
    { url: PR_OPEN, state: 'open', checks: 'failing' },
  ]);
  expect(document.next).toEqual({
    reason: 'fix-checks',
    text: `fix checks on ${PR_OPEN}`,
    pr: PR_OPEN,
  });
  expect(document.machine).toBe('test');
  expect(document.sessions[0]).toMatchObject({
    id: 'shipping-1@test',
    purpose: 'drive it',
    machine: 'test',
    history: 'unlocatable',
  });
});

test('task show: the same document twice, byte-identical — nothing is stored between reads', () => {
  const first = runWardEnv(['task', 'show', 'f1t1', '--json'], ws, { WARD_GH: fakeGh });
  const second = runWardEnv(['task', 'show', 'f1t1', '--json'], ws, { WARD_GH: fakeGh });
  expect(first.stdout).toBe(second.stdout);
});

test('a declared agent gets the same text as a human, deterministic and without colour', () => {
  const human = runWardEnv(['task', 'show', 'f1t1'], ws, { NO_COLOR: '1', WARD_GH: fakeGh });
  const agent = runWardEnv(['task', 'show', 'f1t1'], ws, {
    WARD_AGENT: 'task-show-1',
    FORCE_COLOR: '1',
    WARD_GH: fakeGh,
  });
  expect(agent.stdout).toBe(human.stdout);
  expect(agent.stdout).not.toContain('\x1b');
});

// -- deriving the address, and refusing to for an agent --------------------

test('inside a task worktree the address is derived for a human, and echoed', () => {
  const result = runWardEnv(['task', 'show'], join(ws, 'worktrees/f1t1-shipping'), {
    NO_COLOR: '1',
    WARD_GH: fakeGh,
  });
  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain('task f1t1 — from the working directory');
  expect(result.stdout).toContain('f1t1 shipping');
});

test('a declared agent is refused the derivation and told the form to pass', () => {
  const result = runWardEnv(['task', 'show'], join(ws, 'worktrees/f1t1-shipping'), {
    WARD_AGENT: 'task-show-2',
    WARD_GH: fakeGh,
  });
  expect(result.exitCode).toBe(1);
  expect(result.stdout).toBe('');
  expect(result.stderr).toContain('ward task show ADDRESS');
});

// -- the states other than active -----------------------------------------

test('a paused task: the resume is the only next step, whatever else is true', () => {
  const result = runWard(['task', 'show', 'f2t1'], ws);
  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain('f2t1 set-down [paused]');
  expect(result.stdout).toContain('next\n    ward task resume f2t1');
});

test('a task with no worktree names the repository its record already carries', () => {
  const result = runWard(['task', 'show', 'f2t2'], ws);
  expect(result.stdout).toContain('next\n    ward worktree create f2t2 --repo demo');
});

test('a recently closed task shows as closed, with nothing to do and no worktrees block', () => {
  const result = runWard(['task', 'show', 'f2t3'], ws);
  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain('f2t3 just-landed [closed · delivered]');
  expect(result.stdout).toContain(`closed   ${closedRecently}`);
  expect(result.stdout).not.toContain('worktrees');
  expect(result.stdout).toContain(
    `next\n    Nothing — closed ${closedRecently.slice(0, 10)} (delivered).`,
  );
});

test('a settled close is refused with --all named, never silently hidden', () => {
  const refused = runWard(['task', 'show', 'f2t4'], ws);
  expect(refused.exitCode).toBe(1);
  expect(refused.stdout).toBe('');
  expect(refused.stderr).toContain('closed and settled');
  expect(refused.stderr).toContain('ward task show f2t4 --all');

  const shown = runWard(['task', 'show', 'f2t4', '--all'], ws);
  expect(shown.exitCode).toBe(0);
  expect(shown.stdout).toContain('f2t4 long-settled [closed · abandoned]');
});

test('an address no task holds refuses legibly, with nothing on stdout', () => {
  const result = runWard(['task', 'show', 'f9t9'], ws);
  expect(result.exitCode).toBe(1);
  expect(result.stdout).toBe('');
  expect(result.stderr).toContain('no task at f9t9');
});

// -- the forge degrading ---------------------------------------------------

test('without a forge the links still print, marked state unknown, and the step says so', () => {
  const result = runWard(['task', 'show', 'f1t1'], ws); // runWard pins gh to an impossible path
  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain(`    ${PR_OPEN} — state unknown`);
  expect(result.stdout).toContain(`next\n    state unknown — check ${PR_MERGED}`);
  expect(result.stdout).toContain('forge state unavailable (gh)');
});

// -- status's PR lines -----------------------------------------------------

test('status: one line per PR under the task, in PR-set order, with live check state', () => {
  const result = runWardEnv(['status'], ws, { NO_COLOR: '1', WARD_GH: fakeGh });
  expect(result.exitCode).toBe(0);
  const lines = result.stdout.split('\n');
  const task = lines.findIndex((line) => line.includes('f1t1 shipping'));
  expect(lines[task + 1]).toBe(`    ${PR_MERGED} — merged`);
  expect(lines[task + 2]).toBe(`    ${PR_OPEN} — open · review: none yet · checks: failing`);
  // …then the worktree line, which the PR lines sit above.
  expect(lines[task + 3]).toContain('worktrees/f1t1-shipping');
});

// -- setup -----------------------------------------------------------------
// One workspace with a live spine on floor 1 — repo, worktree, session, two
// PRs of different states — plus seeded records on floor 2 for the paused,
// worktree-less, recently closed, and long-settled cases.

let scratch: string;
let ws: string;
let fakeGh: string;

const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();
const closedRecently = daysAgo(2);

beforeAll(async () => {
  applyGitTestEnv();
  scratch = makeTempDir();
  ws = join(scratch, 'ws');
  runWard(['workspace', 'create', ws], scratch);

  const remote = join(scratch, 'remote.git');
  runWard(['--version'], scratch); // no-op: keeps the spawn shape uniform below
  Bun.spawnSync(['git', 'init', '--bare', '--initial-branch=main', remote], { env: process.env });
  const seed = join(scratch, 'seed');
  Bun.spawnSync(['git', 'clone', remote, seed], { env: process.env });
  await Bun.write(join(seed, 'README.md'), 'demo\n');
  for (const argv of [
    ['checkout', '-b', 'main'],
    ['add', '-A'],
    ['commit', '-m', 'seed'],
    ['push', '-u', 'origin', 'main'],
  ]) {
    Bun.spawnSync(['git', '-C', seed, ...argv], { env: process.env });
  }

  runWard(['repo', 'add', remote, '--name', 'demo'], ws);
  runWard(['project', 'open', 'delivery', '--repo', 'demo'], ws);
  runWard(['task', 'open', 'shipping', '--repo', 'demo', '--purpose', 'ship the thing'], ws);
  runWard(['worktree', 'create', 'f1t1', '--repo', 'demo'], ws);
  runWard(['session', 'open', 'f1t1', '--purpose', 'drive it', '--handle', 'other:show-run'], ws);
  runWard(['task', 'pr', 'f1t1', PR_MERGED], ws);
  runWard(['task', 'pr', 'f1t1', PR_OPEN], ws);

  runWard(['project', 'open', 'assorted'], ws);
  await seedTask(2, 1, 'set-down', { state: 'paused' });
  await seedTask(2, 2, 'unstarted', { state: 'active', repositories: ['demo'] });
  await seedTask(2, 3, 'just-landed', {
    state: 'closed',
    outcome: 'delivered',
    closedAt: closedRecently,
  });
  await seedTask(2, 4, 'long-settled', {
    state: 'closed',
    outcome: 'abandoned',
    closedAt: daysAgo(30),
  });

  fakeGh = writeFakeGh(scratch, 'gh-show', {
    responses: {
      [PR_MERGED]: {
        state: 'MERGED',
        statusCheckRollup: [{ status: 'COMPLETED', conclusion: 'SUCCESS' }],
      },
      [PR_OPEN]: {
        state: 'OPEN',
        statusCheckRollup: [
          { status: 'COMPLETED', conclusion: 'SUCCESS' },
          { status: 'COMPLETED', conclusion: 'FAILURE' },
        ],
      },
    },
  });
});

afterAll(() => removeDir(scratch));

/** A task written straight into floor 2, so its state and close can be dated. */
async function seedTask(
  floor: number,
  room: number,
  slug: string,
  over: Partial<TaskRecord>,
): Promise<void> {
  const dir = `projects/${floor}-assorted/tasks/t${room}-${slug}`;
  mkdirSync(join(ws, dir), { recursive: true });
  const record = {
    type: 'task',
    code: `t${room}`,
    slug,
    state: 'active',
    floor,
    prs: [],
    openedAt: daysAgo(45),
    ...over,
  } as TaskRecord;
  await writeDocument(ws, taskRecordType(dir), { data: record, body: 'seeded' });
}
