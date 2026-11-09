// The workspace's immutable id (design/0054-workspace-id/;
// intent/01-concepts/00-domain-model.md, Identity): minted once at creation,
// or once by the upgrade of a workspace made before it; never minted again by
// a re-run, and never changed by a move, a rename, or a clone — a clone
// shares it. Exposed through `workspaceId(root)`, doctor, and status --json.
import { afterAll, beforeAll, beforeEach, expect, test } from 'bun:test';
import { cpSync } from 'node:fs';
import { join } from 'node:path';
import { doctorShape, statusShape } from '../../src/cli/schema.ts';
import { readDocument, writeDocument } from '../../src/store/document.ts';
import { WORKSPACE_ID_PATTERN, workspaceRecordType } from '../../src/store/types.ts';
import { convergeWorkspace, type StepReport } from '../../src/workspace/converge.ts';
import { createWorkspace } from '../../src/workspace/create.ts';
import { runDoctor } from '../../src/workspace/doctor.ts';
import { gitOrThrow } from '../../src/workspace/git.ts';
import { recordedWorkspaceId, workspaceId } from '../../src/workspace/identity.ts';
import { GROUND_FLOOR } from '../../src/workspace/projects.ts';
import { mergeWorkspaceBranch } from '../../src/workspace/steward.ts';
import { openTask } from '../../src/workspace/tasks.ts';
import { selfServiceUpgrade, upgradeWorkspace } from '../../src/workspace/upgrade.ts';
import { createWorkspaceWorktree } from '../../src/workspace/worktrees.ts';
import { applyGitTestEnv, makeTempDir, removeDir, runWard } from '../helpers.ts';

// -- minted at creation -------------------------------------------------------

test('create mints a tmux-safe id into workspace.md, carried by the initial commit', async () => {
  const id = await workspaceId(ws);
  expect(id).toMatch(WORKSPACE_ID_PATTERN);
  expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  expect(gitOrThrow(ws, 'show', 'HEAD:workspace.md').stdout).toContain(`id: ${id}\n`);
  expect(commitCount(ws)).toBe(1);
});

test('two creates mint two different ids — unique with no help from context', async () => {
  const other = join(scratch, `other-${caseId}`);
  await createWorkspace(other);
  expect(await workspaceId(other)).not.toBe(await workspaceId(ws));
});

test('re-converging a created workspace is satisfied on the id and keeps it', async () => {
  const id = await workspaceId(ws);
  const report = await convergeWorkspace(ws);
  expect(idStep(report.steps)).toEqual({ step: 'workspace id', outcome: 'satisfied', detail: id });
  expect(await workspaceId(ws)).toBe(id);
  expect(commitCount(ws)).toBe(1);
});

// -- minted once for a workspace made before the id -------------------------

test('a pre-0054 workspace has no id: the accessor refuses naming upgrade, doctor says info', async () => {
  await dropId(ws);
  expect(workspaceId(ws)).rejects.toThrow(/no id yet.*ward workspace upgrade/);
  expect(await recordedWorkspaceId(ws)).toBeUndefined();
  const report = await runDoctor(ws);
  expect(report.workspaceId).toBeNull();
  const finding = report.workspace.find((f) => f.check === 'workspace id');
  expect(finding?.severity).toBe('info');
  expect(finding?.message ?? '').toContain('ward workspace upgrade');
  expect(report.healthy).toBe(true); // nothing inside the record needs it
});

test('upgrade mints the id once, in a converge commit holding only workspace.md', async () => {
  await dropId(ws);
  const first = await selfServiceUpgrade(ws);
  const minted = idStep(first.converged);
  expect(minted?.outcome).toBe('established');
  expect(minted?.detail).toMatch(WORKSPACE_ID_PATTERN);
  expect(await workspaceId(ws)).toBe(minted?.detail ?? '');
  const committed = gitOrThrow(ws, 'show', '--name-only', '--format=', 'HEAD').stdout.trim();
  expect(committed).toBe('workspace.md');
  expect(gitOrThrow(ws, 'status', '--porcelain').stdout).toBe('');

  // Idempotent: a second upgrade is satisfied on the id, mints nothing, commits nothing.
  const settled = commitCount(ws);
  const again = await selfServiceUpgrade(ws);
  expect(idStep(again.converged)).toMatchObject({ outcome: 'satisfied', detail: minted?.detail });
  expect(again.vehicle).toBe('none');
  expect(commitCount(ws)).toBe(settled);
  expect(await workspaceId(ws)).toBe(minted?.detail ?? '');
});

// A stewardship copy cut before the mint lacks the id. The upgrade carries the
// root's id into the copy's record write rather than minting its own, so the
// merge lands one id, the root's.
test('a stewardship copy cut before the mint carries the root id, and the merge keeps it', async () => {
  await dropId(ws, { wardVersion: '0.0.1' }); // an old stamp, so the copy's record is rewritten
  await openTask(ws, 'adopt-defaults', { floor: GROUND_FLOOR });
  const { record } = await createWorkspaceWorktree(ws, 'f0t1');
  const copy = join(ws, record.path);
  expect(await recordedWorkspaceId(copy)).toBeUndefined();

  const report = await upgradeWorkspace(ws, 'f0t1');
  const id = await workspaceId(ws);
  expect(idStep(report.converged)).toMatchObject({ outcome: 'established', detail: id });
  expect(report.stamp.action).toBe('advanced');
  expect(await workspaceId(copy)).toBe(id); // carried, not minted again

  const merged = await mergeWorkspaceBranch(ws, record.branch);
  expect(merged.outcome).toBe('merged');
  expect(await workspaceId(ws)).toBe(id);
});

// -- never changed by a move, a rename, or a clone --------------------------

test('a move (and rename) on disk keeps the id; converge there is satisfied on it', async () => {
  const id = await workspaceId(ws);
  const moved = join(scratch, `renamed-elsewhere-${caseId}`);
  cpSync(ws, moved, { recursive: true, verbatimSymlinks: true });
  removeDir(ws);
  expect(await workspaceId(moved)).toBe(id);
  const report = await convergeWorkspace(moved);
  expect(idStep(report.steps)).toMatchObject({ outcome: 'satisfied', detail: id });
  expect((await runDoctor(moved)).workspaceId).toBe(id);
});

test('a clone shares the id — the same workspace standing somewhere else', async () => {
  const id = await workspaceId(ws);
  const clone = join(scratch, `clone-${caseId}`);
  gitOrThrow(scratch, 'clone', '--quiet', ws, clone);
  expect(await workspaceId(clone)).toBe(id);
  const report = await convergeWorkspace(clone);
  expect(idStep(report.steps)).toMatchObject({ outcome: 'satisfied', detail: id });
  expect(await workspaceId(clone)).toBe(id);
});

test('a hand-tampered id outside the tmux-safe alphabet is refused by the record schema', async () => {
  const record = await readDocument(ws, workspaceRecordType);
  const text = (await Bun.file(join(ws, 'workspace.md')).text()).replace(
    `id: ${record.data.id}`,
    'id: not safe; rm -rf',
  );
  await Bun.write(join(ws, 'workspace.md'), text);
  expect(workspaceId(ws)).rejects.toThrow(/not a valid workspace record — id/);
  expect(await recordedWorkspaceId(ws)).toBeUndefined();
});

// -- exposed on the read verbs ----------------------------------------------

test('status --json and doctor --json both carry the id, within their schemas', async () => {
  const id = await workspaceId(ws);
  const status = runWard(['status', '--json'], ws);
  expect(status.exitCode).toBe(0);
  expect(statusShape.parse(JSON.parse(status.stdout)).workspaceId).toBe(id);
  const doctor = runWard(['doctor', '--json'], ws);
  const parsed = doctorShape.parse(JSON.parse(doctor.stdout));
  expect(parsed.workspaceId).toBe(id);
  expect(parsed.workspace.find((f) => f.check === 'workspace id')).toEqual({
    check: 'workspace id',
    severity: 'ok',
    message: id,
  });
});

test('status --json omits the id on an unminted workspace; doctor --json says null', async () => {
  await dropId(ws);
  const status = runWard(['status', '--json'], ws);
  expect(status.exitCode).toBe(0);
  expect(statusShape.parse(JSON.parse(status.stdout))).not.toHaveProperty('workspaceId');
  const doctor = doctorShape.parse(JSON.parse(runWard(['doctor', '--json'], ws).stdout));
  expect(doctor.workspaceId).toBeNull();
});

// -- setup ------------------------------------------------------------------

let scratch: string;
let ws: string;
let caseId = 0;

beforeAll(() => {
  applyGitTestEnv();
  scratch = makeTempDir();
});

beforeEach(async () => {
  caseId += 1;
  ws = join(scratch, `ws-${caseId}`);
  await createWorkspace(ws);
});

afterAll(() => removeDir(scratch));

/** Rewrite the record without its id — the pre-0054 shape — and commit it. */
async function dropId(root: string, extra: { wardVersion?: string } = {}): Promise<void> {
  const record = await readDocument(root, workspaceRecordType);
  const { id: _dropped, ...data } = record.data;
  await writeDocument(root, workspaceRecordType, {
    data: { ...data, ...extra },
    body: record.body,
  });
  gitOrThrow(root, 'add', '-A');
  gitOrThrow(root, 'commit', '-m', 'A workspace from before the id (test fixture)');
}

function idStep(steps: readonly StepReport[]): StepReport | undefined {
  return steps.find((step) => step.step === 'workspace id');
}

function commitCount(root: string): number {
  return Number(gitOrThrow(root, 'rev-list', '--count', 'HEAD').stdout.trim());
}
