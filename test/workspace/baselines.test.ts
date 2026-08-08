// Installed baselines (design/0005-agent-audience/): create fingerprints
// what it installs, re-runs converge, a re-installed artifact replaces its
// entry, and doctor reads the record without ever failing the workspace over
// it — customization is the yours-tier working as intended
// (intent/01-concepts/06-workspace-lifecycle.md).
import { afterAll, beforeAll, beforeEach, expect, test } from 'bun:test';
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import pkg from '../../package.json' with { type: 'json' };
import { readDocument } from '../../src/store/document.ts';
import { baselinesType } from '../../src/store/types.ts';
import { sha256OfFile } from '../../src/workspace/baselines.ts';
import { createWorkspace } from '../../src/workspace/create.ts';
import { type DoctorReport, runDoctor } from '../../src/workspace/doctor.ts';
import { git } from '../../src/workspace/git.ts';
import { applyGitTestEnv, makeTempDir, removeDir } from '../helpers.ts';

test('a fresh create fingerprints every installed artifact', async () => {
  await createWorkspace(root);
  const { artifacts } = (await readDocument(root, baselinesType)).data;
  expect(artifacts.map((artifact) => artifact.path)).toEqual([
    '.ward/README.md',
    'catalog.md',
    'AGENTS.md',
  ]);
  for (const artifact of artifacts) {
    expect(artifact.sha256).toBe(await sha256OfFile(join(root, artifact.path)));
    expect(artifact.wardVersion).toBe(pkg.version);
  }
});

test('re-running create leaves the baselines byte-identical', async () => {
  await createWorkspace(root);
  const before = await Bun.file(join(root, baselinesType.relPath)).text();
  const report = await createWorkspace(root);
  expect(stepOutcome(report.steps, 'installed baselines')).toBe('satisfied');
  expect(await Bun.file(join(root, baselinesType.relPath)).text()).toBe(before);
});

test('a re-installed artifact replaces its entry, never duplicates it', async () => {
  await createWorkspace(root);
  rmSync(join(root, 'AGENTS.md'));
  git(root, 'commit', '-am', 'human removed guidance');
  await createWorkspace(root);
  const { artifacts } = (await readDocument(root, baselinesType)).data;
  const entries = artifacts.filter((artifact) => artifact.path === 'AGENTS.md');
  expect(entries.length).toBe(1);
  expect(entries[0]?.sha256).toBe(await sha256OfFile(join(root, 'AGENTS.md')));
});

test('doctor: untouched is ok, customized is info — expected, never unhealthy', async () => {
  await createWorkspace(root);
  expect(findingFor(await runDoctor(root), 'baseline AGENTS.md')?.severity).toBe('ok');
  await Bun.write(join(root, 'AGENTS.md'), 'my own guidance\n');
  const report = await runDoctor(root);
  const finding = findingFor(report, 'baseline AGENTS.md');
  expect(finding?.severity).toBe('info');
  expect(finding?.message).toContain('customized');
  expect(report.healthy).toBe(true);
});

test('doctor: a missing installed artifact is a warning, and report-only', async () => {
  await createWorkspace(root);
  rmSync(join(root, 'AGENTS.md'));
  const report = await runDoctor(root);
  expect(findingFor(report, 'baseline AGENTS.md')?.severity).toBe('warn');
  expect(report.healthy).toBe(true); // report-only: nothing repaired, nothing failed
});

test('no baseline record: doctor points at converge, and converge starts one', async () => {
  await createWorkspace(root);
  rmSync(join(root, baselinesType.relPath));
  git(root, 'commit', '-am', 'simulate a workspace created before baselines');
  expect(findingFor(await runDoctor(root), 'installed baselines')?.severity).toBe('info');
  const report = await createWorkspace(root);
  expect(stepOutcome(report.steps, 'installed baselines')).toBe('established');
  // Nothing was installed by this run, so nothing can honestly be fingerprinted:
  // pre-existing artifacts have unknown provenance and stay unrecorded.
  expect((await readDocument(root, baselinesType)).data.artifacts).toEqual([]);
});

// -- setup ----------------------------------------------------------------

let parent: string;
let root: string;
let caseId = 0;

function findingFor(report: DoctorReport, check: string) {
  return report.workspace.find((finding) => finding.check === check);
}

function stepOutcome(steps: readonly { step: string; outcome: string }[], name: string) {
  return steps.find((step) => step.step === name)?.outcome;
}

beforeAll(() => {
  applyGitTestEnv();
  parent = makeTempDir();
});

beforeEach(() => {
  caseId += 1;
  root = join(parent, `ws-${caseId}`);
});

afterAll(() => {
  removeDir(parent);
});
