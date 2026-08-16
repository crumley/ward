// The workspace's own main-line name, recorded — not assumed
// (design/0020-deterministic-upgrade/, resolving 0019's SF-001): creation
// reads it from the repository and records it in the workspace record; doctor
// names a root standing elsewhere as record↔disk drift and an unrecorded name
// as the pre-0020 workspace; the stewardship rails aim at the recorded name,
// so a drifted root cannot silently retarget branching or the merge.
import { afterAll, beforeAll, beforeEach, expect, test } from 'bun:test';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { readDocument, writeDocument } from '../../src/store/document.ts';
import { workspaceRecordType } from '../../src/store/types.ts';
import { createWorkspace } from '../../src/workspace/create.ts';
import { runDoctor } from '../../src/workspace/doctor.ts';
import { gitOrThrow } from '../../src/workspace/git.ts';
import {
  mergeWorkspaceBranch,
  recordedWorkspaceMainLine,
  resolveWorkspaceMainLine,
  workspaceMainLine,
} from '../../src/workspace/steward.ts';
import { openTask } from '../../src/workspace/tasks.ts';
import { createWorkspaceWorktree } from '../../src/workspace/worktrees.ts';
import { applyGitTestEnv, makeTempDir, removeDir } from '../helpers.ts';

/** Rewrite the workspace record without its mainLine — the pre-0020 shape. */
async function dropRecordedMainLine(root: string): Promise<void> {
  const record = await readDocument(root, workspaceRecordType);
  const { mainLine: _dropped, ...data } = record.data;
  await writeDocument(root, workspaceRecordType, { data, body: record.body });
  gitOrThrow(root, 'add', '-A');
  gitOrThrow(root, 'commit', '-m', 'Drop the recorded main line (test fixture)');
}

// -- creation records the name ----------------------------------------------

test('creation records the main-line name from the repository, in the workspace record', async () => {
  const record = (await readDocument(ws, workspaceRecordType)).data;
  expect(record.mainLine).toBe(mainLine); // read from git, never assumed
  expect(recordedWorkspaceMainLine(ws)).toBe(mainLine);
  expect(resolveWorkspaceMainLine(ws)).toBe(mainLine);
});

test('converge backfills an unrecorded name, and the convergence commit carries it', async () => {
  await dropRecordedMainLine(ws);
  const report = await createWorkspace(ws);
  const step = report.steps.find((s) => s.step === 'workspace main line');
  expect(step).toMatchObject({ outcome: 'established', detail: mainLine });
  expect(recordedWorkspaceMainLine(ws)).toBe(mainLine);
  const committed = gitOrThrow(ws, 'show', '--name-only', '--format=', 'HEAD').stdout.trim();
  expect(committed).toBe('workspace.md');
});

test('converge never re-records over a drifted root: the record is the truth, drift is drift', async () => {
  gitOrThrow(ws, 'switch', '-c', 'elsewhere');
  const report = await createWorkspace(ws);
  const step = report.steps.find((s) => s.step === 'workspace main line');
  expect(step).toMatchObject({ outcome: 'satisfied', detail: mainLine });
  expect(recordedWorkspaceMainLine(ws)).toBe(mainLine); // not silently moved to 'elsewhere'
});

// -- doctor names the states ------------------------------------------------

test('doctor: the root on its recorded main line reads ok, naming the branch', async () => {
  const report = await runDoctor(ws);
  const finding = report.workspace.find((f) => f.check === 'workspace main line');
  expect(finding).toMatchObject({
    severity: 'ok',
    message: expect.stringContaining(`'${mainLine}', the recorded main line`),
  });
  expect(report.healthy).toBe(true);
});

test('doctor: an unrecorded name is the pre-0020 workspace — info, pointing at upgrade and converge', async () => {
  await dropRecordedMainLine(ws);
  const report = await runDoctor(ws);
  const finding = report.workspace.find((f) => f.check === 'workspace main line');
  expect(finding?.severity).toBe('info');
  expect(finding?.message ?? '').toContain('ward workspace upgrade');
  expect(finding?.message ?? '').toContain(`ward workspace create ${ws}`);
  expect(report.healthy).toBe(true); // report-only: nothing is broken
});

test('doctor: a root standing off the recorded main line is record↔disk drift — warn, with the way back', async () => {
  gitOrThrow(ws, 'switch', '-c', 'experiment');
  const report = await runDoctor(ws);
  const finding = report.workspace.find((f) => f.check === 'workspace main line');
  expect(finding?.severity).toBe('warn');
  expect(finding?.message ?? '').toContain(`git switch ${mainLine}`);
  expect(finding?.message ?? '').toContain("'experiment'");
  expect(report.healthy).toBe(true); // warn reports; the workspace still operates
});

test('doctor: a detached root, and a recorded branch that no longer exists, both warn', async () => {
  gitOrThrow(ws, 'checkout', '--detach');
  const detached = await runDoctor(ws);
  expect(detached.workspace.find((f) => f.check === 'workspace main line')).toMatchObject({
    severity: 'warn',
    message: expect.stringContaining('detached'),
  });
  gitOrThrow(ws, 'switch', mainLine);
  const record = await readDocument(ws, workspaceRecordType);
  await writeDocument(ws, workspaceRecordType, {
    data: { ...record.data, mainLine: 'renamed-away' },
    body: record.body,
  });
  const gone = await runDoctor(ws);
  expect(gone.workspace.find((f) => f.check === 'workspace main line')).toMatchObject({
    severity: 'warn',
    message: expect.stringContaining('no such branch exists'),
  });
});

// -- the rails aim at the recorded name -------------------------------------

test('a stewardship worktree branches from the recorded main line, not a drifted root', async () => {
  await openTask(ws, 'steward-work', {});
  const recordedTip = gitOrThrow(ws, 'rev-parse', mainLine).stdout.trim();
  gitOrThrow(ws, 'switch', '-c', 'experiment');
  const { record } = await createWorkspaceWorktree(ws, 't1');
  // The journal commit for the worktree record landed on 'experiment' (the
  // loud proceed), but the branch itself is based on the recorded main line.
  expect(gitOrThrow(ws, 'rev-parse', record.branch).stdout.trim()).toBe(recordedTip);
});

test('the gated merge refuses a drifted root, and lands after the way back', async () => {
  await openTask(ws, 'steward-work', {});
  const { record } = await createWorkspaceWorktree(ws, 't1');
  const copy = join(ws, record.path);
  writeFileSync(join(copy, 'note.md'), 'stewardship change\n');
  gitOrThrow(copy, 'add', '-A');
  gitOrThrow(copy, 'commit', '-m', 'Stewardship: note');
  gitOrThrow(ws, 'switch', '-c', 'experiment');
  expect(mergeWorkspaceBranch(ws, record.branch)).rejects.toThrow(
    new RegExp(`git switch ${mainLine}`),
  );
  gitOrThrow(ws, 'switch', mainLine);
  const merged = await mergeWorkspaceBranch(ws, record.branch);
  expect(merged.outcome).toBe('merged');
  expect(merged.mainLine).toBe(mainLine);
});

test('a pre-0020 record falls back to the live root read everywhere', async () => {
  await dropRecordedMainLine(ws);
  expect(recordedWorkspaceMainLine(ws)).toBeUndefined();
  expect(resolveWorkspaceMainLine(ws)).toBe(workspaceMainLine(ws));
});

// -- setup ------------------------------------------------------------------

let scratch: string;
let ws: string;
let mainLine: string;
let caseId = 0;

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
