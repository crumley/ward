// The deterministic upgrade (design/0020-deterministic-upgrade/), end to end
// at the module level. The fixture is the live bootstrap workspace's exact
// state: stale untouched AGENTS.md (the c7962cc-era default), stale
// .ward/README.md (the a71b091-era default), an EMPTY baselines document, and
// no recorded main-line name — upgraded mechanically through a stewardship
// worktree, previewed and landed by the 0019 rails, verified by the delivered
// close. A customized artifact is left byte-untouched and named as
// reconciliation residue: the tool's part ends at naming it.
import { afterAll, beforeAll, beforeEach, expect, test } from 'bun:test';
import { existsSync, lstatSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { readDocument, writeDocument } from '../../src/store/document.ts';
import { baselinesType, workspaceRecordType } from '../../src/store/types.ts';
import { createWorkspace } from '../../src/workspace/create.ts';
import { gitOrThrow } from '../../src/workspace/git.ts';
import { sha256OfText } from '../../src/workspace/lineage.ts';
import {
  mergeWorkspaceBranch,
  recordedWorkspaceMainLine,
  workspaceMainLine,
} from '../../src/workspace/steward.ts';
import { closeTask, openTask } from '../../src/workspace/tasks.ts';
import { AGENTS_MD, WARD_INTERNAL_README } from '../../src/workspace/templates.ts';
import { upgradeWorkspace } from '../../src/workspace/upgrade.ts';
import { createWorkspaceWorktree } from '../../src/workspace/worktrees.ts';
import { LEGACY_AGENTS_MD, LEGACY_WARD_README } from '../fixtures/legacy.ts';
import { applyGitTestEnv, makeTempDir, removeDir } from '../helpers.ts';

/**
 * Regress a freshly created workspace to the live workspace's shape: stale
 * untouched installed artifacts, empty baselines, no recorded main-line name
 * — with the CLAUDE.md link and a current catalog.md left standing, exactly
 * as the live workspace has them.
 */
async function regressToLiveShape(root: string): Promise<void> {
  await Bun.write(join(root, 'AGENTS.md'), LEGACY_AGENTS_MD);
  await Bun.write(join(root, '.ward', 'README.md'), LEGACY_WARD_README);
  const baselines = await readDocument(root, baselinesType);
  await writeDocument(root, baselinesType, {
    data: { type: 'baselines', artifacts: [] },
    body: baselines.body,
  });
  const record = await readDocument(root, workspaceRecordType);
  const { mainLine: _dropped, ...data } = record.data;
  await writeDocument(root, workspaceRecordType, { data, body: record.body });
  gitOrThrow(root, 'add', '-A');
  gitOrThrow(root, 'commit', '-m', 'Regress to the live workspace shape (test fixture)');
}

test('the live-workspace fixture upgrades deterministically, end to end through the 0019 rails', async () => {
  await regressToLiveShape(ws);
  expect(recordedWorkspaceMainLine(ws)).toBeUndefined();
  await openTask(ws, 'upgrade-ward', {});
  const { record: worktree } = await createWorkspaceWorktree(ws, 't1');

  const report = await upgradeWorkspace(ws, 't1');
  expect(report.outcome).toBe('upgraded');
  expect(report.task).toBe('t1');
  expect(report.branch).toBe(worktree.branch);
  expect(report.commit).toBeDefined();
  expect(report.residue).toEqual([]);
  expect(report.mainLine).toEqual({ name: mainLine, action: 'recorded' });
  expect(report.stamp.action).toBe('current'); // this CLI is still the stamped 0.1.0
  expect(report.baselines).toBe('updated');
  expect(report.artifacts).toEqual([
    {
      path: '.ward/README.md',
      action: 'upgraded',
      detail: 'untouched since a71b091 (design 0002) — brought to the current default',
    },
    { path: 'catalog.md', action: 'current', detail: 'already the current default' },
    {
      path: 'AGENTS.md',
      action: 'upgraded',
      detail: 'untouched since c7962cc (design 0004) — brought to the current default',
    },
    { path: 'CLAUDE.md', action: 'current', detail: 'CLAUDE.md → AGENTS.md' },
  ]);

  // The candidate copy carries the whole act; the root is untouched until the
  // human's gated merge.
  const copy = join(ws, worktree.path);
  expect(await Bun.file(join(copy, 'AGENTS.md')).text()).toBe(AGENTS_MD);
  expect(await Bun.file(join(copy, '.ward', 'README.md')).text()).toBe(WARD_INTERNAL_README);
  const copyBaselines = (await readDocument(copy, baselinesType)).data.artifacts;
  expect(copyBaselines.map((entry) => [entry.path, entry.sha256])).toEqual([
    ['.ward/README.md', sha256OfText(WARD_INTERNAL_README)],
    ['catalog.md', sha256OfText(await Bun.file(join(copy, 'catalog.md')).text())],
    ['AGENTS.md', sha256OfText(AGENTS_MD)],
  ]);
  expect((await readDocument(copy, workspaceRecordType)).data.mainLine).toBe(mainLine);
  expect(await Bun.file(join(ws, 'AGENTS.md')).text()).toBe(LEGACY_AGENTS_MD);
  expect(recordedWorkspaceMainLine(ws)).toBeUndefined();

  // Convergence: a second run finds everything current and commits nothing.
  const tip = gitOrThrow(copy, 'rev-parse', 'HEAD').stdout.trim();
  const again = await upgradeWorkspace(ws, 't1');
  expect(again.outcome).toBe('current');
  expect(again.commit).toBeUndefined();
  expect(again.baselines).toBe('current');
  expect(again.mainLine.action).toBe('already-recorded');
  expect(gitOrThrow(copy, 'rev-parse', 'HEAD').stdout.trim()).toBe(tip);

  // The human's gated merge lands it; the delivered close verifies and tears down.
  const merged = await mergeWorkspaceBranch(ws, worktree.branch);
  expect(merged.outcome).toBe('merged');
  expect(await Bun.file(join(ws, 'AGENTS.md')).text()).toBe(AGENTS_MD);
  expect(await Bun.file(join(ws, '.ward', 'README.md')).text()).toBe(WARD_INTERNAL_README);
  expect(recordedWorkspaceMainLine(ws)).toBe(mainLine);
  expect((await readDocument(ws, baselinesType)).data.artifacts.length).toBe(3);

  const close = await closeTask(ws, 't1', 'delivered');
  expect(close.steps.find((step) => step.step === 'reachability')?.detail).toContain(
    `reaches ${mainLine}`,
  );
  expect(existsSync(join(ws, worktree.path))).toBe(false);
});

test('a customized artifact is left byte-identical and named as reconciliation residue', async () => {
  await regressToLiveShape(ws);
  const customized = `${LEGACY_AGENTS_MD}\n## House rules\n\nOurs, not ward's.\n`;
  await Bun.write(join(ws, 'AGENTS.md'), customized);
  gitOrThrow(ws, 'add', '-A');
  gitOrThrow(ws, 'commit', '-m', 'Customize the guidance (test fixture)');
  await openTask(ws, 'upgrade-ward', {});
  const { record: worktree } = await createWorkspaceWorktree(ws, 't1');

  const report = await upgradeWorkspace(ws, 't1');
  expect(report.outcome).toBe('upgraded'); // the README still upgrades mechanically
  expect(report.residue).toEqual(['AGENTS.md']);
  expect(report.artifacts.find((a) => a.path === 'AGENTS.md')).toMatchObject({
    action: 'kept',
    detail: expect.stringContaining('left byte-untouched'),
  });

  const copy = join(ws, worktree.path);
  expect(await Bun.file(join(copy, 'AGENTS.md')).text()).toBe(customized); // byte-identical
  expect(await Bun.file(join(copy, '.ward', 'README.md')).text()).toBe(WARD_INTERNAL_README);
  // No baseline is invented for content Ward never wrote: absent reads as
  // customized, which is exactly its standing (0005's conservative direction).
  const paths = (await readDocument(copy, baselinesType)).data.artifacts.map((e) => e.path);
  expect(paths).toEqual(['.ward/README.md', 'catalog.md']);

  await mergeWorkspaceBranch(ws, worktree.branch);
  expect(await Bun.file(join(ws, 'AGENTS.md')).text()).toBe(customized);
});

test('a missing artifact is installed, and a pre-0017 workspace gains the CLAUDE.md bridge', async () => {
  await regressToLiveShape(ws);
  rmSync(join(ws, 'AGENTS.md'));
  rmSync(join(ws, 'CLAUDE.md')); // the pre-0017 shape: no bridge at all
  gitOrThrow(ws, 'add', '-A');
  gitOrThrow(ws, 'commit', '-m', 'Remove guidance (test fixture)');
  await openTask(ws, 'upgrade-ward', {});
  const { record: worktree } = await createWorkspaceWorktree(ws, 't1');

  const report = await upgradeWorkspace(ws, 't1');
  expect(report.artifacts.find((a) => a.path === 'AGENTS.md')?.action).toBe('installed');
  expect(report.artifacts.find((a) => a.path === 'CLAUDE.md')?.action).toBe('installed');
  const copy = join(ws, worktree.path);
  expect(await Bun.file(join(copy, 'AGENTS.md')).text()).toBe(AGENTS_MD);
  expect(lstatSync(join(copy, 'CLAUDE.md')).isSymbolicLink()).toBe(true);

  await mergeWorkspaceBranch(ws, worktree.branch);
  expect(lstatSync(join(ws, 'CLAUDE.md')).isSymbolicLink()).toBe(true);
  expect(await Bun.file(join(ws, 'CLAUDE.md')).text()).toBe(AGENTS_MD);
});

test("a CLAUDE.md of the human's own is kept and named as residue, never rewritten", async () => {
  await regressToLiveShape(ws);
  rmSync(join(ws, 'CLAUDE.md'));
  writeFileSync(join(ws, 'CLAUDE.md'), 'my own claude guidance\n');
  gitOrThrow(ws, 'add', '-A');
  gitOrThrow(ws, 'commit', '-m', 'Own CLAUDE.md (test fixture)');
  await openTask(ws, 'upgrade-ward', {});
  const { record: worktree } = await createWorkspaceWorktree(ws, 't1');

  const report = await upgradeWorkspace(ws, 't1');
  expect(report.residue).toEqual(['CLAUDE.md']);
  expect(report.artifacts.find((a) => a.path === 'CLAUDE.md')).toMatchObject({
    action: 'kept',
    detail: expect.stringContaining('your own'),
  });
  expect(await Bun.file(join(ws, worktree.path, 'CLAUDE.md')).text()).toBe(
    'my own claude guidance\n',
  );
});

test('the upgrade refuses a task with no workspace worktree, naming the 0019 rail to build first', async () => {
  await openTask(ws, 'upgrade-ward', {});
  expect(upgradeWorkspace(ws, 't1')).rejects.toThrow(/ward worktree create t1 --workspace/);
});

test('the upgrade refuses a dirty candidate copy before writing anything', async () => {
  await openTask(ws, 'upgrade-ward', {});
  const { record: worktree } = await createWorkspaceWorktree(ws, 't1');
  writeFileSync(join(ws, worktree.path, 'stray.txt'), 'uncommitted\n');
  expect(upgradeWorkspace(ws, 't1')).rejects.toThrow(/uncommitted changes/);
});

// -- setup ------------------------------------------------------------------
// A fresh workspace per test: the verbs mutate, and each case builds its own
// shape before opening the upgrade task.

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
