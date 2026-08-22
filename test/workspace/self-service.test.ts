// The self-service workspace upgrade (design/0030-upgrade-self-service/) at
// the module level: `ward workspace upgrade` run bare builds its own vehicle —
// a derived stewardship task, its worktree, the upgrade commit — publishes
// what it can, and ends by naming what remains for the human. The rules under
// test are the ones that keep that honest: one open upgrade task per
// workspace (refused when it holds work, converged when it holds none),
// structural detection through the record rather than a slug guess, and no
// vehicle manufactured at all when the workspace is already current.
import { afterAll, beforeAll, beforeEach, expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { readDocument } from '../../src/store/document.ts';
import { taskRecordType } from '../../src/store/types.ts';
import { createWorkspace } from '../../src/workspace/create.ts';
import { gitOrThrow } from '../../src/workspace/git.ts';
import { findStandingProject } from '../../src/workspace/projects.ts';
import { readTasks } from '../../src/workspace/scan.ts';
import { mergeWorkspaceBranch, workspaceMainLine } from '../../src/workspace/steward.ts';
import { closeTask, openTask } from '../../src/workspace/tasks.ts';
import { AGENTS_MD } from '../../src/workspace/templates.ts';
import { findOpenUpgradeTask, selfServiceUpgrade } from '../../src/workspace/upgrade.ts';
import { readTaskWorktrees } from '../../src/workspace/worktrees.ts';
import { LEGACY_AGENTS_MD } from '../fixtures/legacy.ts';
import { applyGitTestEnv, makeTempDir, removeDir } from '../helpers.ts';

test('the bare path builds its own vehicle end to end, and ends by naming what remains', async () => {
  await regressGuidance(ws);

  const report = await selfServiceUpgrade(ws);
  expect(report.vehicle).toBe('derived');
  expect(report.outcome).toBe('upgraded');
  expect(report.task).toBe('t1');
  expect(report.branch).toBe('steward/workspace-upgrade');
  expect(report.commit).toBeDefined();
  expect(report.derived?.map((step) => [step.step, step.outcome])).toEqual([
    ['task', 'derived'],
    ['worktree', 'derived'],
  ]);

  // The vehicle really exists: a task record, a workspace-sourced worktree
  // record, and the copy on disk holding the upgraded bytes.
  const task = (await readTasks(ws)).find((found) => found.record.code === 't1');
  expect(task?.record.slug).toBe('workspace-upgrade');
  const worktrees = await readTaskWorktrees(ws, task?.dir ?? '');
  expect(worktrees.map((record) => record.source)).toEqual(['workspace']);
  const copy = join(ws, report.path ?? '');
  expect(await Bun.file(join(copy, 'AGENTS.md')).text()).toBe(AGENTS_MD);
  // The root is untouched until the human's gated merge — nothing landed.
  expect(await Bun.file(join(ws, 'AGENTS.md')).text()).toBe(LEGACY_AGENTS_MD);

  // No forge here, so the branch itself is the review surface, and the
  // remaining acts say so — review, merge, close, each with its command.
  expect(report.pullRequest?.outcome).toBe('skipped');
  expect(report.pullRequest?.url).toBeUndefined();
  expect(report.pullRequest?.detail).toContain('no origin remote');
  expect(report.remaining.map((act) => [act.step, act.command])).toEqual([
    ['review', 'ward workspace merge steward/workspace-upgrade --preview'],
    ['merge', 'ward workspace merge steward/workspace-upgrade'],
    ['close', 'ward task close t1'],
  ]);

  // And the acts it named are the acts that work: the gated merge lands it,
  // the delivered close verifies reachability and tears the worktree down.
  expect((await mergeWorkspaceBranch(ws, 'steward/workspace-upgrade')).outcome).toBe('merged');
  expect(await Bun.file(join(ws, 'AGENTS.md')).text()).toBe(AGENTS_MD);
  const closed = await closeTask(ws, 't1', 'delivered');
  expect(closed.steps.find((step) => step.step === 'reachability')?.detail).toContain(
    `reaches ${mainLine}`,
  );
  expect(existsSync(copy)).toBe(false);
});

test('the derived task carries the structural marker and lives in the standing project', async () => {
  await regressGuidance(ws);
  const report = await selfServiceUpgrade(ws);

  const standing = await findStandingProject(ws);
  const dir = `${standing?.dir}/tasks/t1-workspace-upgrade`;
  const record = (await readDocument(ws, taskRecordType(dir))).data;
  expect(record.stewardship).toBe('upgrade'); // the record says what it is (§16)
  expect(record.floor).toBe(standing?.record.floor);
  expect(record.purpose).toContain('installed artifacts to the defaults ward');
  expect((await findOpenUpgradeTask(ws))?.task.record.code).toBe(report.task);
});

test('the no-op case manufactures nothing: no task, no worktree, no branch', async () => {
  // A freshly created workspace already stands at the current defaults.
  const report = await selfServiceUpgrade(ws);
  expect(report.vehicle).toBe('none');
  expect(report.outcome).toBe('current');
  expect(report.task).toBeUndefined();
  expect(report.branch).toBeUndefined();
  expect(report.pullRequest).toBeUndefined();
  expect(report.remaining).toEqual([]);
  expect(await readTasks(ws)).toEqual([]);
  expect(gitOrThrow(ws, 'branch', '--format=%(refname:short)').stdout.trim()).toBe(mainLine);
});

test('a second upgrade is refused while the first holds work — naming it and both ways out', async () => {
  await regressGuidance(ws);
  await selfServiceUpgrade(ws);

  expect(selfServiceUpgrade(ws)).rejects.toThrow(/already in flight/);
  expect(selfServiceUpgrade(ws)).rejects.toThrow(/task t1 holds 1 commit/);
  // The two ways out, both named with their exact command.
  expect(selfServiceUpgrade(ws)).rejects.toThrow(
    /ward workspace merge steward\/workspace-upgrade, then ward task close t1/,
  );
  expect(selfServiceUpgrade(ws)).rejects.toThrow(/ward task close t1 --outcome abandoned/);

  // Discarding it is one of the ways out, and it really is a way out. The
  // discarded branch survives the close (0019 defers pruning), so the next
  // upgrade takes a branch of its own rather than adopting work the human
  // just threw away.
  await closeTask(ws, 't1', 'abandoned');
  const second = await selfServiceUpgrade(ws);
  expect(second.outcome).toBe('upgraded');
  expect(second.task).toBe('t2');
  expect(second.branch).toBe('steward/workspace-upgrade-t2');
  expect(second.commit).toBeDefined();
});

test('an interrupted run converges: an upgrade task holding nothing is reused, not refused', async () => {
  await regressGuidance(ws);
  // The shape a crash between `task open` and the commit leaves behind.
  await openTask(ws, 'workspace-upgrade', { stewardship: 'upgrade' });

  const report = await selfServiceUpgrade(ws);
  expect(report.task).toBe('t1'); // the same task, finished — not a second one
  expect(report.derived?.[0]).toMatchObject({ step: 'task', outcome: 'reused' });
  expect(report.outcome).toBe('upgraded');
  expect((await readTasks(ws)).length).toBe(1);
});

test('detection is structural, not a slug match: an unmarked task named for an upgrade never blocks', async () => {
  await regressGuidance(ws);
  // Free text a human chose. It says "upgrade" and it is not this verb's.
  await openTask(ws, 'upgrade-the-api-client', {});
  expect(await findOpenUpgradeTask(ws)).toBeUndefined();

  const report = await selfServiceUpgrade(ws);
  expect(report.task).toBe('t2');
  expect(report.branch).toBe('steward/workspace-upgrade');
});

// -- setup ------------------------------------------------------------------
// A fresh workspace per case: every case mutates, and the vehicle a case
// builds is exactly what the next one must not inherit.

let scratch: string;
let ws: string;
let mainLine: string;
let caseId = 0;

/**
 * Age the workspace's guidance to a default Ward really shipped (the
 * 0004-era `AGENTS.md`): untouched but stale, which is precisely the state an
 * upgrade exists to carry forward — and the only kind of change it may make
 * mechanically.
 */
async function regressGuidance(root: string): Promise<void> {
  await Bun.write(join(root, 'AGENTS.md'), LEGACY_AGENTS_MD);
  gitOrThrow(root, 'add', '-A');
  gitOrThrow(root, 'commit', '-m', 'Age the guidance (test fixture)');
}

beforeAll(() => {
  applyGitTestEnv();
  scratch = makeTempDir();
});

beforeEach(async () => {
  caseId += 1;
  ws = join(scratch, `ws-${caseId}`);
  await createWorkspace(ws);
  mainLine = workspaceMainLine(ws);
});

afterAll(() => {
  removeDir(scratch);
});
