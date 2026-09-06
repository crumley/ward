// The update owns convergence (design/0042-upgrade-owns-convergence/): the
// establishment steps are one list in one module, `workspace upgrade` runs
// them against the workspace root as phase 1 — directly, as one journal
// commit, before any vehicle exists — and only then reconciles the installed
// artifacts through the stewardship vehicle. A run that converged something
// and found the artifacts current is work done, not nothing to do.
import { afterAll, beforeAll, beforeEach, expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { convergeWorkspace, type StepReport } from '../../src/workspace/converge.ts';
import { createWorkspace } from '../../src/workspace/create.ts';
import { git, gitOrThrow } from '../../src/workspace/git.ts';
import {
  findStandingProject,
  GROUND_FLOOR,
  GROUND_FLOOR_DIR,
  nextFloor,
  openProject,
  requireGroundFloor,
} from '../../src/workspace/projects.ts';
import { readTasks } from '../../src/workspace/scan.ts';
import { openTask } from '../../src/workspace/tasks.ts';
import { selfServiceUpgrade, upgradeWorkspace } from '../../src/workspace/upgrade.ts';
import { createWorkspaceWorktree } from '../../src/workspace/worktrees.ts';
import { LEGACY_AGENTS_MD } from '../fixtures/legacy.ts';
import { applyGitTestEnv, makeTempDir, removeDir } from '../helpers.ts';

// The live bootstrap workspace's exact shape before this entry: ordinary
// floors 1–5, no standing project at all, and installed artifacts already at
// the current defaults — so nothing an artifact upgrade could carry, and
// everything a converge must.
test('upgrade converges the record and manufactures no vehicle when no default moved', async () => {
  const ws = await pre0018Workspace(5);
  expect(await findStandingProject(ws)).toBeUndefined();
  const before = commitCount(ws);

  const report = await selfServiceUpgrade(ws);
  expect(report.vehicle).toBe('none');
  expect(report.outcome).toBe('current');
  expect(outcome(report.converged, 'standing project')).toBe('established');
  expect(detail(report.converged, 'standing project')).toBe(`${GROUND_FLOOR_DIR}/`);
  expect(outcome(report.converged, 'workspace history')).toBe('established');
  expect(report.remaining).toEqual([]);

  // The ground floor really stands, and phase 1 took exactly one commit on the
  // workspace's own main line — no task, no worktree, no branch.
  expect(await requireGroundFloor(ws)).toBe(GROUND_FLOOR);
  expect(commitCount(ws)).toBe(before + 1);
  expect(await nextFloor(ws)).toBe(6); // the ordinary sequence is untouched
  expect(await readTasks(ws)).toEqual([]);
  expect(localBranches(ws)).toEqual([mainLine(ws)]);
  expect(git(ws, 'status', '--porcelain').stdout).toBe('');
});

test('a second run is satisfied throughout and commits nothing', async () => {
  const ws = await pre0018Workspace(5);
  await selfServiceUpgrade(ws);
  const settled = commitCount(ws);

  const again = await selfServiceUpgrade(ws);
  expect(again.vehicle).toBe('none');
  expect(again.outcome).toBe('current');
  expect(again.converged.map((step) => step.outcome)).toEqual(Array(12).fill('satisfied'));
  expect(commitCount(ws)).toBe(settled);
});

// Phase 1 is what makes phase 2 possible: the stewardship task opens on the
// ground floor, so the ground floor has to exist before a vehicle can. Before
// this entry the upgrade refused exactly this workspace.
test('artifacts behind: the converge runs first, then the vehicle opens on the ground floor', async () => {
  const ws = await pre0018Workspace(5);
  await Bun.write(join(ws, 'AGENTS.md'), LEGACY_AGENTS_MD);
  gitOrThrow(ws, 'add', '-A');
  gitOrThrow(ws, 'commit', '-m', 'Age the guidance (test fixture)');

  const report = await selfServiceUpgrade(ws);
  expect(outcome(report.converged, 'standing project')).toBe('established');
  expect(report.vehicle).toBe('derived');
  expect(report.outcome).toBe('upgraded');
  expect(report.task).toBe('f0t1'); // the floor phase 1 established, room 1
  expect(report.branch).toBe('steward/workspace-upgrade');
  expect(report.commit).toBeDefined();
  const derived = (await readTasks(ws))[0];
  expect(derived?.dir).toBe(`${GROUND_FLOOR_DIR}/tasks/t1-workspace-upgrade`);
  expect(derived?.record.floor).toBe(GROUND_FLOOR);
});

// The caller-named path — a declared agent's only form — converges too, and it
// does so before the task is even resolved, so the floor the task needs is
// there whichever order the caller reached it in.
test('the caller-named path converges before it resolves the task', async () => {
  const ws = await pre0018Workspace(2);
  expect(upgradeWorkspace(ws, 'f0t1')).rejects.toThrow(/f0t1/);
  expect(await requireGroundFloor(ws)).toBe(GROUND_FLOOR); // established anyway

  await openTask(ws, 'adopt-defaults', { floor: GROUND_FLOOR });
  await createWorkspaceWorktree(ws, 'f0t1');
  const report = await upgradeWorkspace(ws, 'f0t1');
  expect(report.vehicle).toBe('given');
  expect(report.converged.map((step) => step.outcome)).toEqual(Array(12).fill('satisfied'));
});

// The one module, from the other side: `create` no longer holds a copy of any
// step, so a creation interrupted after the marker is finished by the update.
test('a workspace left half-made by an interrupted create is finished by the converge', async () => {
  const ws = join(scratch, `interrupted-${counter}`);
  await createWorkspace(ws);
  removeDir(join(ws, GROUND_FLOOR_DIR));
  gitOrThrow(ws, 'commit', '-am', 'lose the ground floor (test fixture)');

  const report = await convergeWorkspace(ws);
  expect(outcome(report.steps, 'standing project')).toBe('established');
  expect(existsSync(join(ws, GROUND_FLOOR_DIR, 'project.md'))).toBe(true);
  expect(git(ws, 'status', '--porcelain').stdout).toBe('');
});

// -- setup ------------------------------------------------------------------

let scratch: string;
let counter = 0;

beforeAll(() => {
  applyGitTestEnv();
  scratch = makeTempDir();
});

beforeEach(() => {
  counter += 1;
});

afterAll(() => removeDir(scratch));

/**
 * A workspace shaped like one created before design/0018 and never converged:
 * ordinary floors, no standing project at all. This is the live bootstrap
 * workspace's shape, and the one the upgrade used to refuse.
 */
async function pre0018Workspace(floors: number): Promise<string> {
  const ws = join(scratch, `pre0018-${counter}-${floors}`);
  await createWorkspace(ws);
  removeDir(join(ws, GROUND_FLOOR_DIR));
  gitOrThrow(ws, 'commit', '-am', 'a workspace from before the standing project');
  for (let floor = 1; floor <= floors; floor += 1) {
    await openProject(ws, `floor-${floor}`);
  }
  return ws;
}

function commitCount(root: string): number {
  return Number(gitOrThrow(root, 'rev-list', '--count', 'HEAD').stdout.trim());
}

function mainLine(root: string): string {
  return gitOrThrow(root, 'symbolic-ref', '--short', 'HEAD').stdout.trim();
}

function localBranches(root: string): string[] {
  return gitOrThrow(root, 'branch', '--format=%(refname:short)')
    .stdout.split('\n')
    .filter((line) => line !== '');
}

function outcome(steps: readonly StepReport[], step: string): string | undefined {
  return steps.find((report) => report.step === step)?.outcome;
}

function detail(steps: readonly StepReport[], step: string): string | undefined {
  return steps.find((report) => report.step === step)?.detail;
}
