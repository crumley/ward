// Workspace creation converges: a fresh create establishes everything, a
// re-run is a no-op, a partial workspace is completed, customized artifacts
// are never touched, and unsafe targets are refused
// (intent/01-concepts/06-workspace-lifecycle.md; design/0002-store-and-workspace/).
import { afterAll, beforeAll, beforeEach, expect, test } from 'bun:test';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { createWorkspace } from '../../src/workspace/create.ts';
import { git } from '../../src/workspace/git.ts';
import { discoverWorkspace } from '../../src/workspace/layout.ts';
import { applyGitTestEnv, makeTempDir, removeDir } from '../helpers.ts';

test('a fresh create establishes every step and commits once', async () => {
  const report = await createWorkspace(root);
  expect(report.steps.map((step) => step.outcome)).toEqual(Array(10).fill('established'));
  for (const file of [
    'workspace.md',
    'catalog.md',
    'AGENTS.md',
    '.gitignore',
    '.ward/README.md',
    '.ward/baselines.md',
  ]) {
    expect(existsSync(join(root, file))).toBe(true);
  }
  expect(commitCount()).toBe(1);
  expect(git(root, 'status', '--porcelain').stdout).toBe('');
});

test('re-running create is satisfied throughout and changes nothing', async () => {
  await createWorkspace(root);
  const report = await createWorkspace(root);
  expect(report.steps.map((step) => step.outcome)).toEqual(Array(10).fill('satisfied'));
  expect(commitCount()).toBe(1);
  expect(git(root, 'status', '--porcelain').stdout).toBe('');
});

test('a missing artifact is re-established; the converge commit holds it and its baseline', async () => {
  await createWorkspace(root);
  rmSync(join(root, 'AGENTS.md'));
  git(root, 'commit', '-am', 'human removed guidance');
  const report = await createWorkspace(root);
  const outcomes = new Map(report.steps.map((step) => [step.step, step.outcome]));
  expect(outcomes.get('agent guidance')).toBe('established');
  expect(outcomes.get('workspace record')).toBe('satisfied');
  const committed = git(root, 'show', '--name-only', '--format=', 'HEAD').stdout.trim();
  expect(committed.split('\n').sort()).toEqual(['.ward/baselines.md', 'AGENTS.md']);
});

test('the installed AGENTS.md teaches an agent to drive ward', async () => {
  await createWorkspace(root);
  const guidance = await Bun.file(join(root, 'AGENTS.md')).text();
  for (const lesson of [
    'WARD_AGENT', // declare yourself an agent caller
    '--json', // read verbs have a parseable form
    'ward schema', // the shapes are discoverable from the tool itself
    'ward session open', // record your session…
    '--handle', // …with your harness's own run id
    'ward task pr', // link the PR to the task
    'ward worktree rebase', // stay atop the main line; publishing stays yours
    'Closing is gated', // task close needs the PR set resolved
    'Never merge or push to a repository', // the never-merge-to-main rule
    'commands concurrently', // 0013: the sequential-writes discipline is dropped
    '.ward/store.lock', // …because store writes serialize on a legible lock
  ]) {
    expect(guidance).toContain(lesson);
  }
});

test('a customized artifact is left alone, even when dirty', async () => {
  await createWorkspace(root);
  await Bun.write(join(root, 'AGENTS.md'), 'my own guidance\n');
  const report = await createWorkspace(root);
  const agents = report.steps.find((step) => step.step === 'agent guidance');
  expect(agents?.outcome).toBe('satisfied');
  expect(await Bun.file(join(root, 'AGENTS.md')).text()).toBe('my own guidance\n');
  // The human's uncommitted edit is not swept into any convergence commit.
  expect(git(root, 'status', '--porcelain').stdout).toContain('AGENTS.md');
});

test('create refuses a populated directory that is not a workspace', async () => {
  mkdirSync(root, { recursive: true });
  await Bun.write(join(root, 'unrelated.txt'), 'not a workspace\n');
  expect(createWorkspace(root)).rejects.toThrow(/not empty and is not a Ward workspace/);
});

test('create fails legibly on an invalid workspace record', async () => {
  await createWorkspace(root);
  await Bun.write(join(root, 'workspace.md'), '---\ntype: garbage\n---\n');
  expect(createWorkspace(root)).rejects.toThrow(/workspace\.md/);
});

test('discovery finds the root from a nested directory, and nothing outside one', async () => {
  await createWorkspace(root);
  const nested = join(root, 'projects', 'deep', 'down');
  mkdirSync(nested, { recursive: true });
  expect(discoverWorkspace(nested)).toBe(root);
  expect(discoverWorkspace(makeTempDir())).toBeNull();
});

// -- setup ----------------------------------------------------------------

let parent: string;
let root: string;

function commitCount(): number {
  return Number(git(root, 'rev-list', '--count', 'HEAD').stdout.trim());
}

beforeAll(() => {
  applyGitTestEnv();
  parent = makeTempDir();
});

let caseId = 0;
// A fresh root per test, so cases stay independent.
beforeEach(() => {
  caseId += 1;
  root = join(parent, `ws-${caseId}`);
});

afterAll(() => {
  removeDir(parent);
});
