// Where a worktree stands (design/0057-context-from-root/): a floor task's
// worktree is placed under its floor's view, `floors/<N>-<slug>/<address>-<branch>`,
// a stewardship worktree included, while a legacy bare task's stays at
// `worktrees/`. `ward workspace upgrade` moves an old-layout worktree there —
// found through git, moved with `git worktree move`, its record rewritten in
// one journal commit per task — and leaves a dirty one, one with an open
// session inside, and one git refuses to move exactly where they are, named
// as residue. A clone whose record already moved has its checkout moved, by
// upgrade or by restore, never cut twice. Once nothing holds `worktrees/`,
// the same upgrade retires it. All fixtures synthetic: bare repositories as
// remotes, no network, no forge.
import { afterAll, beforeAll, beforeEach, expect, test } from 'bun:test';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { type WorkspaceUpgradeShape, workspaceUpgradeShape } from '../../src/cli/schema.ts';
import { readDocument, writeDocument } from '../../src/store/document.ts';
import { type TaskRecord, taskRecordType, worktreeRecordType } from '../../src/store/types.ts';
import { convergeWorkspace } from '../../src/workspace/converge.ts';
import { createWorkspace } from '../../src/workspace/create.ts';
import { runDoctor } from '../../src/workspace/doctor.ts';
import { git, gitOrThrow } from '../../src/workspace/git.ts';
import { GROUND_FLOOR, openProject } from '../../src/workspace/projects.ts';
import { addRepository, checkoutPath } from '../../src/workspace/repos.ts';
import { restoreWorkspace } from '../../src/workspace/restore.ts';
import { readTasks, resolveOpenTask } from '../../src/workspace/scan.ts';
import { closeSession, openSession } from '../../src/workspace/sessions.ts';
import { openTask } from '../../src/workspace/tasks.ts';
import {
  createWorkspaceWorktree,
  createWorktree,
  readTaskWorktreeEntries,
} from '../../src/workspace/worktrees.ts';
import { applyGitTestEnv, makeTempDir, removeDir, runWardEnv } from '../helpers.ts';

// -- placement at create ---------------------------------------------------------

test('create places a floor worktree under its view, stewardship and legacy where they belong', async () => {
  await openProject(ws, 'alpha');
  await openProject(ws, 'beta');
  await openTask(ws, 'feature', { floor: 2 });
  const floor = await createWorktree(ws, 'f2t1', 'demo');
  expect(floor.record.path).toBe('floors/2-beta/f2t1-feature');
  expect(existsSync(join(ws, 'floors/2-beta/f2t1-feature/seed.txt'))).toBe(true);
  // The view is in place before the worktree under it: the path carries the manifest.
  expect(existsSync(join(ws, 'floors/2-beta/AGENTS.md'))).toBe(true);

  await openTask(ws, 'tend', { floor: GROUND_FLOOR });
  const steward = await createWorkspaceWorktree(ws, 'f0t1');
  expect(steward.record.path).toBe('floors/0-workspace/f0t1-steward-tend');

  oldIgnoreLine(); // a legacy task exists only in a workspace an older ward made
  await seedLegacyTask(9, 'old-work');
  const legacy = await createWorktree(ws, 'legacy-t9', 'demo', 'old-branch');
  expect(legacy.record.path).toBe('worktrees/legacy-t9-old-branch');

  expect(git(ws, 'status', '--porcelain').stdout).toBe('');
});

// -- the migration -------------------------------------------------------------------

test('upgrade moves a clean old-layout worktree: one commit per task, git agrees, work intact', async () => {
  await openProject(ws, 'alpha');
  await openTask(ws, 'feature', { floor: 1 });
  await createWorktree(ws, 'f1t1', 'demo');
  await createWorktree(ws, 'f1t1', 'demo', 'second');
  await openTask(ws, 'other', { floor: 1 });
  await createWorktree(ws, 'f1t2', 'demo');
  await openTask(ws, 'tend', { floor: GROUND_FLOOR });
  await createWorkspaceWorktree(ws, 'f0t1'); // the stewardship case moves the same way
  await toOldLayout();
  const old = join(ws, 'worktrees/f1t1-feature');
  writeFileSync(join(old, 'work.txt'), 'committed work\n');
  gitOrThrow(old, 'add', '-A');
  gitOrThrow(old, 'commit', '-m', 'the work');
  writeFileSync(join(old, 'stashed.txt'), 'a stash\n');
  gitOrThrow(old, 'stash', 'push', '-u', '-m', 'kept');
  const head = tip(old);
  const stashes = stashCount(old);
  const before = commitCount();

  const report = upgrade();
  expect(placementStep(report)).toMatchObject({ outcome: 'established' });
  expect(placementStep(report)?.detail).toStartWith('4 moved, 0 already placed');
  expect(placementStep(report)?.residue).toBeUndefined();

  const moved = join(ws, 'floors/1-alpha/f1t1-feature');
  expect(existsSync(old)).toBe(false);
  expect(tip(moved)).toBe(head);
  expect(gitOrThrow(moved, 'symbolic-ref', '--short', 'HEAD').stdout.trim()).toBe('feature');
  expect(stashCount(moved)).toBe(stashes);
  expect(registered()).toEqual([
    `${ws}/floors/1-alpha/f1t1-feature`,
    `${ws}/floors/1-alpha/f1t1-second`,
    `${ws}/floors/1-alpha/f1t2-other`,
  ]);
  expect(await recordedPaths()).toEqual([
    'floors/0-workspace/f0t1-steward-tend',
    'floors/1-alpha/f1t1-feature',
    'floors/1-alpha/f1t1-second',
    'floors/1-alpha/f1t2-other',
  ]);
  expect(existsSync(join(ws, 'floors/0-workspace/f0t1-steward-tend/workspace.md'))).toBe(true);
  // One journal commit per task, then the retirement — worktrees/ is empty now.
  expect(subjectsSince(before)).toEqual([
    'Move worktree steward/tend for task f0t1 to floors/ (ward 0.1.0)',
    'Move worktrees feature, second for task f1t1 to floors/ (ward 0.1.0)',
    'Move worktree other for task f1t2 to floors/ (ward 0.1.0)',
    'Retire worktrees/ (ward 0.1.0)',
  ]);
  expect(git(ws, 'status', '--porcelain').stdout).toBe('');

  const again = commitCount();
  const second = upgrade();
  expect(placementStep(second)).toMatchObject({ outcome: 'satisfied' });
  expect(placementStep(second)?.detail).toBe('0 moved, 4 already placed');
  expect(commitCount()).toBe(again);
});

test('a dirty worktree, one with a session inside, and one git refuses each stay — until cleared', async () => {
  await openProject(ws, 'alpha');
  for (const slug of ['dirty', 'occupied', 'locked']) {
    const task = await openTask(ws, slug, { floor: 1 });
    await createWorktree(ws, `f1${task.record.code}`, 'demo');
  }
  await toOldLayout();
  writeFileSync(join(ws, 'worktrees/f1t1-dirty/scratch.txt'), 'unrecorded\n');
  const session = await openSession(ws, 'f1t2', 'working there', {
    workingDirectory: 'worktrees/f1t2-occupied/src',
  });
  gitOrThrow(checkoutPath(ws, 'demo'), 'worktree', 'lock', join(ws, 'worktrees/f1t3-locked'));

  const report = upgrade();
  expect(placementStep(report)).toMatchObject({ outcome: 'satisfied' });
  const residue = placementStep(report)?.residue ?? [];
  expect(residue.map((item) => item.path)).toEqual([
    'worktrees/f1t1-dirty',
    'worktrees/f1t2-occupied',
    'worktrees/f1t3-locked',
  ]);
  expect(residue[0]?.reason).toContain('f1t1 — uncommitted changes');
  expect(residue[1]?.reason).toContain(`open session ${session.id} works inside it`);
  expect(residue[1]?.command).toBe(`ward session close ${session.id}`);
  expect(residue[2]?.reason).toContain('git refused to move it');
  expect(residue[2]?.reason).toContain('locked');
  for (const dir of ['f1t1-dirty', 'f1t2-occupied', 'f1t3-locked']) {
    expect(existsSync(join(ws, 'worktrees', dir))).toBe(true);
  }
  expect(await recordedPaths()).toEqual([
    'worktrees/f1t1-dirty',
    'worktrees/f1t2-occupied',
    'worktrees/f1t3-locked',
  ]);
  // worktrees/ is held by all three, so the retirement names them and waits.
  expect(retireStep(report)?.residue?.map((item) => item.path)).toEqual(residue.map((i) => i.path));

  // Cleared, each moves on the next upgrade.
  gitOrThrow(join(ws, 'worktrees/f1t1-dirty'), 'clean', '-fdq');
  await closeSession(ws, session.id);
  gitOrThrow(checkoutPath(ws, 'demo'), 'worktree', 'unlock', join(ws, 'worktrees/f1t3-locked'));
  const cleared = upgrade();
  expect(placementStep(cleared)?.detail).toStartWith('3 moved');
  expect(placementStep(cleared)?.residue).toBeUndefined();
  expect(await recordedPaths()).toEqual([
    'floors/1-alpha/f1t1-dirty',
    'floors/1-alpha/f1t2-occupied',
    'floors/1-alpha/f1t3-locked',
  ]);
  expect(existsSync(join(ws, 'worktrees'))).toBe(false);
});

test('a clone whose record moved but whose checkout did not: upgrade and restore both move it', async () => {
  await openProject(ws, 'alpha');
  await openTask(ws, 'feature', { floor: 1 });
  await createWorktree(ws, 'f1t1', 'demo');
  const placed = 'floors/1-alpha/f1t1-feature';
  const behind = 'worktrees/f1t1-feature';

  // The checkout stands at the old path; the record (moved elsewhere) says floors/.
  checkoutBack(placed, behind);
  const before = commitCount();
  const report = upgrade();
  expect(placementStep(report)?.detail).toStartWith('1 moved');
  expect(subjectsSince(before)).toEqual([]); // the record already said floors/: nothing to journal
  expect(registered()).toEqual([`${ws}/${placed}`]);

  // The same shape again, put right by restore instead.
  mkdirSync(join(ws, 'worktrees'));
  checkoutBack(placed, behind);
  const restored = await restoreWorkspace(ws);
  expect(restored.worktrees).toMatchObject([{ outcome: 'restored' }]);
  expect(restored.worktrees[0]?.detail).toBe(`moved the checkout of 'feature' here from ${behind}`);
  expect(registered()).toEqual([`${ws}/${placed}`]); // one checkout, never a second
  expect(existsSync(join(ws, behind))).toBe(false);
});

// Two open tasks can record the same branch (a task reopened as another); the
// branch's one checkout is the task's that stands there, never the other's.
test("a branch two open tasks record: its checkout stays the standing task's", async () => {
  await openProject(ws, 'alpha');
  await openTask(ws, 'first', { floor: 1 });
  await openTask(ws, 'second', { floor: 1 });
  const { record } = await createWorktree(ws, 'f1t2', 'demo', 'shared');
  const first = (await resolveOpenTask(ws, 'f1t1')).dir;
  await writeDocument(ws, worktreeRecordType(first, 'demo--shared'), {
    data: { ...record, path: 'floors/1-alpha/f1t1-shared' },
    body: 'the earlier task, recording the same branch',
  });
  await toOldLayout();
  expect(existsSync(join(ws, 'worktrees/f1t1-shared'))).toBe(false); // never on disk

  const report = upgrade();
  expect(placementStep(report)?.residue).toBeUndefined();
  expect(registered()).toEqual([`${ws}/floors/1-alpha/f1t2-shared`]); // the second task's, moved
  expect(await recordedPaths()).toEqual([
    'floors/1-alpha/f1t1-shared',
    'floors/1-alpha/f1t2-shared',
  ]);

  // Restore, asked for the first task's missing worktree, does not take the second's.
  const restored = await restoreWorkspace(ws);
  expect(restored.worktrees.map((item) => item.outcome)).toEqual(['failed', 'satisfied']);
  expect(registered()).toEqual([`${ws}/floors/1-alpha/f1t2-shared`]);
});

test("doctor's worktree placement names each misplaced worktree, and is silent once all are placed", async () => {
  await openProject(ws, 'alpha');
  await openTask(ws, 'clean', { floor: 1 });
  await createWorktree(ws, 'f1t1', 'demo');
  await openTask(ws, 'dirty', { floor: 1 });
  await createWorktree(ws, 'f1t2', 'demo');
  await toOldLayout();
  writeFileSync(join(ws, 'worktrees/f1t2-dirty/scratch.txt'), 'unrecorded\n');

  expect(await placementFindings()).toEqual([
    'task f1t1: worktrees/f1t1-clean belongs at floors/1-alpha/f1t1-clean — move it: ward workspace upgrade',
    'task f1t2: worktrees/f1t2-dirty belongs at floors/1-alpha/f1t2-dirty — the move would be ' +
      'refused: uncommitted changes — commit or clean them, then run it again',
  ]);
  gitOrThrow(join(ws, 'worktrees/f1t2-dirty'), 'clean', '-fdq');
  upgrade();
  expect(await placementFindings()).toEqual([]);
});

// -- retiring worktrees/ ----------------------------------------------------------------

test('retirement: an empty worktrees/ and its ignore line go in one commit, once', async () => {
  mkdirSync(join(ws, 'worktrees'));
  oldIgnoreLine();
  const before = commitCount();

  const report = upgrade();
  expect(retireStep(report)).toMatchObject({ outcome: 'established' });
  expect(existsSync(join(ws, 'worktrees'))).toBe(false);
  expect(readFileSync(join(ws, '.gitignore'), 'utf8').split('\n')).not.toContain('/worktrees/');
  expect(subjectsSince(before)).toEqual(['Retire worktrees/ (ward 0.1.0)']);

  const again = commitCount();
  expect(retireStep(upgrade())).toMatchObject({ outcome: 'satisfied' });
  expect(commitCount()).toBe(again);
  // Converge does not bring the directory back, and doctor no longer expects its line.
  await convergeWorkspace(ws);
  expect(existsSync(join(ws, 'worktrees'))).toBe(false);
  const doctor = await runDoctor(ws);
  expect(doctor.workspace.find((finding) => finding.check === 'ignore policy')?.severity).toBe(
    'ok',
  );
});

test('retirement waits on an open legacy task, a leftover checkout, and a stray file', async () => {
  oldIgnoreLine();
  await seedLegacyTask(2, 'old-work');
  await createWorktree(ws, 'legacy-t2', 'demo', 'old-branch');
  // A checkout no open task records: a close that never tore it down.
  gitOrThrow(
    checkoutPath(ws, 'demo'),
    'worktree',
    'add',
    '-b',
    'leftover',
    join(ws, 'worktrees/t8-leftover'),
    'origin/trunk',
  );
  writeFileSync(join(ws, 'worktrees/.DS_Store'), '');
  const before = commitCount();

  const report = upgrade();
  const retire = retireStep(report);
  expect(retire).toMatchObject({ outcome: 'satisfied' });
  expect(retire?.residue).toEqual([
    {
      path: 'worktrees/legacy-t2-old-branch',
      reason: 'the worktree of open legacy task legacy-t2 — it goes when the task closes',
    },
    {
      path: 'worktrees/t8-leftover',
      reason: expect.stringContaining('a checkout no open task records'),
      command: 'git -C repos/demo worktree remove worktrees/t8-leftover',
    },
    {
      path: 'worktrees/.DS_Store',
      reason: 'not a checkout Ward or git knows — yours to move or remove',
    },
  ]);
  // Untouched: every one of them still stands, the line stays, nothing committed.
  for (const name of ['legacy-t2-old-branch', 't8-leftover', '.DS_Store']) {
    expect(existsSync(join(ws, 'worktrees', name))).toBe(true);
  }
  expect(readFileSync(join(ws, '.gitignore'), 'utf8').split('\n')).toContain('/worktrees/');
  expect(subjectsSince(before)).toEqual([]);
  // The legacy task's worktree is not a floor's to place.
  expect(placementStep(report)?.detail).toBe('0 moved, 0 already placed');
});

// -- scaffolding ----------------------------------------------------------------------
// Each case gets a fresh workspace with one registered repository, `demo`, whose
// bare remote's main line is `trunk`. "The old layout" is what a pre-0057 ward
// left: every open task's worktree at `worktrees/<name>`, its record saying so,
// and `/worktrees/` in the ignore list.

let scratch: string;
let ws: string;
let caseId = 0;

function upgrade(): WorkspaceUpgradeShape {
  const result = runWardEnv(['workspace', 'upgrade', '--json'], ws, { NO_COLOR: '1' });
  if (result.exitCode !== 0) throw new Error(result.stderr);
  return workspaceUpgradeShape.parse(JSON.parse(result.stdout));
}

function placementStep(report: WorkspaceUpgradeShape) {
  return report.converged.find((step) => step.step === 'worktree placement');
}

function retireStep(report: WorkspaceUpgradeShape) {
  return report.converged.find((step) => step.step === 'retire worktrees/');
}

/** Move every open task's worktree back to `worktrees/`, record and checkout both. */
async function toOldLayout(): Promise<void> {
  oldIgnoreLine();
  for (const task of await readTasks(ws)) {
    for (const entry of await readTaskWorktreeEntries(ws, task.dir)) {
      const old = `worktrees/${basename(entry.record.path)}`;
      if (existsSync(join(ws, entry.record.path))) {
        checkoutBack(entry.record.path, old, entry.record.repo === undefined ? ws : undefined);
      }
      await writeDocument(ws, worktreeRecordType(task.dir, entry.fileName), {
        data: { ...entry.record, path: old },
        body: entry.body,
      });
    }
  }
  gitOrThrow(ws, 'add', '-A');
  gitOrThrow(ws, 'commit', '-qm', 'the layout an older ward left');
}

/** Put the checkout at `from` back at `to`, as a machine that never upgraded has it. */
function checkoutBack(from: string, to: string, repoDir = checkoutPath(ws, 'demo')): void {
  mkdirSync(join(ws, 'worktrees'), { recursive: true });
  gitOrThrow(repoDir, 'worktree', 'move', join(ws, from), join(ws, to));
}

/** The ignore line every pre-0057 workspace carries. */
function oldIgnoreLine(): void {
  const file = join(ws, '.gitignore');
  if (readFileSync(file, 'utf8').split('\n').includes('/worktrees/')) return;
  appendFileSync(file, '/worktrees/\n');
  gitOrThrow(ws, 'commit', '-qam', 'the ignore line an older ward wrote');
}

async function seedLegacyTask(room: number, slug: string): Promise<void> {
  const dir = `tasks/t${room}-${slug}`;
  mkdirSync(join(ws, dir), { recursive: true });
  const record: TaskRecord = {
    type: 'task',
    code: `t${room}`,
    slug,
    state: 'active',
    prs: [],
    openedAt: '2026-08-24T01:35:00.278Z',
  };
  await writeDocument(ws, taskRecordType(dir), { data: record, body: 'a task from before' });
  gitOrThrow(ws, 'add', '-A');
  gitOrThrow(ws, 'commit', '-qm', 'a legacy bare task');
  await resolveOpenTask(ws, `legacy-t${room}`); // resolvable, as an older ward left it
}

async function recordedPaths(): Promise<string[]> {
  const paths: string[] = [];
  for (const task of await readTasks(ws)) {
    if (task.record.state === 'closed') continue;
    for (const entry of await readTaskWorktreeEntries(ws, task.dir)) {
      paths.push((await readDocument(ws, worktreeRecordType(task.dir, entry.fileName))).data.path);
    }
  }
  return paths.sort();
}

async function placementFindings(): Promise<string[]> {
  return (await runDoctor(ws)).workspace
    .filter((finding) => finding.check === 'worktree placement')
    .map((finding) => finding.message);
}

/** The linked worktrees the canonical checkout has registered, sorted. */
function registered(): string[] {
  return gitOrThrow(checkoutPath(ws, 'demo'), 'worktree', 'list', '--porcelain')
    .stdout.split('\n')
    .filter((line) => line.startsWith('worktree '))
    .map((line) => line.slice('worktree '.length))
    .slice(1)
    .sort();
}

function tip(dir: string): string {
  return gitOrThrow(dir, 'rev-parse', 'HEAD').stdout.trim();
}

function stashCount(dir: string): number {
  return gitOrThrow(dir, 'stash', 'list')
    .stdout.split('\n')
    .filter((line) => line !== '').length;
}

function commitCount(): number {
  return Number.parseInt(gitOrThrow(ws, 'rev-list', '--count', 'HEAD').stdout.trim(), 10);
}

function subjectsSince(count: number): string[] {
  const total = commitCount();
  if (total === count) return [];
  return gitOrThrow(ws, 'log', '--format=%s', '--reverse', `-${total - count}`)
    .stdout.trim()
    .split('\n');
}

beforeAll(() => {
  applyGitTestEnv();
  scratch = makeTempDir();
});

beforeEach(async () => {
  caseId += 1;
  ws = join(scratch, `ws-${caseId}`);
  await createWorkspace(ws);
  const remote = join(scratch, `remote-${caseId}.git`);
  gitOrThrow('.', 'init', '-q', '--bare', '--initial-branch=trunk', remote);
  const seed = join(scratch, `seed-${caseId}`);
  gitOrThrow('.', 'clone', '-q', remote, seed);
  gitOrThrow(seed, 'checkout', '-q', '-b', 'trunk');
  writeFileSync(join(seed, 'seed.txt'), 'seed\n');
  gitOrThrow(seed, 'add', '-A');
  gitOrThrow(seed, 'commit', '-qm', 'seed');
  gitOrThrow(seed, 'push', '-q', '-u', 'origin', 'trunk');
  await addRepository(ws, remote, 'demo');
});

afterAll(() => removeDir(scratch));
