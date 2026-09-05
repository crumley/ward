// The deterministic upgrade through the spawned CLI
// (design/0020-deterministic-upgrade/): `ward workspace upgrade TASK` emits
// its report (--json validating strictly under the registered shape, the
// human rendering naming every action and the residue), composes with the
// 0019 rails end to end (merge, delivered close), refuses with the 0015
// posture (stderr + exit 1 + empty stdout), and the journal's loud proceed
// surfaces on stderr while stdout stays intact.
import { afterAll, beforeAll, expect, test } from 'bun:test';
import { join } from 'node:path';
import { workspaceUpgradeShape } from '../../src/cli/schema.ts';
import { readDocument, writeDocument } from '../../src/store/document.ts';
import { baselinesType, workspaceRecordType } from '../../src/store/types.ts';
import { gitOrThrow } from '../../src/workspace/git.ts';
import { recordedWorkspaceMainLine, workspaceMainLine } from '../../src/workspace/steward.ts';
import { AGENTS_MD, WARD_INTERNAL_README } from '../../src/workspace/templates.ts';
import { LEGACY_AGENTS_MD, LEGACY_WARD_README } from '../fixtures/legacy.ts';
import { applyGitTestEnv, makeTempDir, removeDir, runWard } from '../helpers.ts';

test('workspace upgrade --json: one validating document; the fixture upgrades mechanically', async () => {
  runWard(['workspace', 'create', ws], scratch);
  mainLine = workspaceMainLine(ws);
  // Regress to the live workspace's shape: stale untouched artifacts, empty
  // baselines, no recorded main-line name.
  await Bun.write(join(ws, 'AGENTS.md'), LEGACY_AGENTS_MD);
  await Bun.write(join(ws, '.ward', 'README.md'), LEGACY_WARD_README);
  const baselines = await readDocument(ws, baselinesType);
  await writeDocument(ws, baselinesType, {
    data: { type: 'baselines', artifacts: [] },
    body: baselines.body,
  });
  const record = await readDocument(ws, workspaceRecordType);
  const { mainLine: _dropped, ...data } = record.data;
  await writeDocument(ws, workspaceRecordType, { data, body: record.body });
  gitOrThrow(ws, 'add', '-A');
  gitOrThrow(ws, 'commit', '-m', 'Regress to the live workspace shape (test fixture)');

  expect(runWard(['task', 'open', 'upgrade-ward', '--json'], ws).exitCode).toBe(0);
  expect(runWard(['worktree', 'create', 't1', '--workspace', '--json'], ws).exitCode).toBe(0);

  const result = runWard(['workspace', 'upgrade', 't1', '--json'], ws);
  expect(result.exitCode).toBe(0);
  const report = workspaceUpgradeShape.parse(JSON.parse(result.stdout));
  expect(report.outcome).toBe('upgraded');
  expect(report.branch).toBe('steward/upgrade-ward');
  expect(report.mainLine).toEqual({ name: mainLine, action: 'recorded' });
  expect(report.baselines).toBe('updated');
  expect(report.residue).toEqual([]);
  expect(report.commit).toBeDefined();
  expect(report.artifacts.map((a) => [a.path, a.action])).toEqual([
    ['.ward/README.md', 'upgraded'],
    ['catalog.md', 'current'],
    ['AGENTS.md', 'upgraded'],
    ['CLAUDE.md', 'current'],
  ]);
});

test('a second run converges: outcome current, no commit field, byte-identical document shape', () => {
  const again = runWard(['workspace', 'upgrade', 't1', '--json'], ws);
  expect(again.exitCode).toBe(0);
  const report = workspaceUpgradeShape.parse(JSON.parse(again.stdout));
  expect(report.outcome).toBe('current');
  expect(report.commit).toBeUndefined();
  expect(report.mainLine.action).toBe('already-recorded');
  expect(report.baselines).toBe('current');
});

test('the human rendering names the actions, and the 0019 rails land and close the task', async () => {
  const rendered = runWard(['workspace', 'upgrade', 't1'], ws);
  expect(rendered.exitCode).toBe(0);
  expect(rendered.stdout).toContain('current');
  expect(rendered.stdout).toContain('nothing to upgrade — everything already current');

  const merged = runWard(['workspace', 'merge', 'steward/upgrade-ward'], ws);
  expect(merged.exitCode).toBe(0);
  expect(merged.stdout).toContain('merged');
  // The root now stands mechanically upgraded: current defaults, backfilled
  // baselines, the main-line name recorded.
  expect(await Bun.file(join(ws, 'AGENTS.md')).text()).toBe(AGENTS_MD);
  expect(await Bun.file(join(ws, '.ward', 'README.md')).text()).toBe(WARD_INTERNAL_README);
  expect((await readDocument(ws, baselinesType)).data.artifacts.length).toBe(3);
  expect(recordedWorkspaceMainLine(ws)).toBe(mainLine);

  const closed = runWard(['task', 'close', 't1', '--json'], ws);
  expect(closed.exitCode).toBe(0);
  const steps = JSON.parse(closed.stdout).steps as { step: string; detail: string }[];
  expect(steps.find((s) => s.step === 'reachability')?.detail).toContain(`reaches ${mainLine}`);
});

test('a refusal emits no document: a task with no workspace worktree is exit 1, stdout empty', () => {
  const opened = runWard(['task', 'open', 'no-worktree', '--json'], ws);
  expect(opened.exitCode).toBe(0);
  // Rooms run in opening order (0036) — the address is read from the record,
  // never assumed to be the smallest free room.
  const address = JSON.parse(opened.stdout).address as string;
  const result = runWard(['workspace', 'upgrade', address, '--json'], ws);
  expect(result.exitCode).toBe(1);
  expect(result.stdout).toBe('');
  expect(result.stderr).toContain(`ward worktree create ${address} --workspace`);
  expect(runWard(['task', 'close', address, '--outcome', 'abandoned'], ws).exitCode).toBe(0);
});

test('the loud proceed: a journal commit off the recorded main line says so on stderr, and lands', () => {
  gitOrThrow(ws, 'switch', '-c', 'experiment');
  const result = runWard(['task', 'open', 'loud-proceed'], ws);
  expect(result.exitCode).toBe(0); // proceeds — refusing would wedge the bookkeeping
  expect(result.stdout).toContain('opened ');
  loudCode = /opened (\S+)/.exec(result.stdout)?.[1] ?? '';
  expect(loudCode).not.toBe('');
  expect(result.stderr).toContain(`off the recorded main line '${mainLine}'`);
  expect(result.stderr).toContain(`git switch ${mainLine}`);
  // The commit really landed, on the branch the root stands on.
  expect(gitOrThrow(ws, 'log', '-1', '--format=%s').stdout).toContain('Open task loud-proceed');

  // Under --json the note stays on stderr and stdout stays one document.
  const json = runWard(['task', 'pause', loudCode, '--json'], ws);
  expect(json.exitCode).toBe(0);
  expect(JSON.parse(json.stdout).state).toBe('paused');
  expect(json.stderr).toContain('off the recorded main line');

  // And doctor names the drift with the way back.
  const doctor = runWard(['doctor'], ws);
  expect(doctor.exitCode).toBe(0); // warn reports; nothing is an error
  expect(doctor.stdout).toContain('workspace main line');
  expect(doctor.stdout).toContain(`git switch ${mainLine}`);
  gitOrThrow(ws, 'switch', mainLine);
});

test('on the recorded main line the journal is quiet: no note on stderr', () => {
  // The loud-proceed task's records live on 'experiment' — the honest
  // consequence of a journal advancing on a chosen branch history. This case
  // opens a fresh task on the recorded main line and hears nothing.
  const result = runWard(['task', 'open', 'quiet-check'], ws);
  expect(result.exitCode).toBe(0);
  expect(result.stderr).not.toContain('off the recorded main line');
});

// -- setup ------------------------------------------------------------------
// One sequenced workspace: the suite builds the live-workspace fixture, runs
// the upgrade through the CLI, lands it through the 0019 rails, then reuses
// the upgraded workspace for the refusal and loud-proceed cases.

let scratch: string;
let ws: string;
let mainLine: string;
let loudCode: string;

beforeAll(() => {
  applyGitTestEnv();
  scratch = makeTempDir();
  ws = join(scratch, 'ws');
});

afterAll(() => {
  removeDir(scratch);
});
