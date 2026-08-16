// Workspace creation converges: a fresh create establishes everything, a
// re-run is a no-op, a partial workspace is completed, customized artifacts
// are never touched, and unsafe targets are refused
// (intent/01-concepts/06-workspace-lifecycle.md; design/0002-store-and-workspace/).
import { afterAll, beforeAll, beforeEach, expect, test } from 'bun:test';
import { existsSync, lstatSync, mkdirSync, readlinkSync, rmSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { createWorkspace } from '../../src/workspace/create.ts';
import { git } from '../../src/workspace/git.ts';
import { discoverWorkspace } from '../../src/workspace/layout.ts';
import { findStandingProject, openProject } from '../../src/workspace/projects.ts';
import { applyGitTestEnv, makeTempDir, removeDir } from '../helpers.ts';

test('a fresh create establishes every step and commits once', async () => {
  const report = await createWorkspace(root);
  expect(report.steps.map((step) => step.outcome)).toEqual(Array(13).fill('established'));
  for (const file of [
    'workspace.md',
    'catalog.md',
    'AGENTS.md',
    'CLAUDE.md',
    '.gitignore',
    '.ward/README.md',
    '.ward/baselines.md',
    'projects/1-workspace/project.md',
  ]) {
    expect(existsSync(join(root, file))).toBe(true);
  }
  expect(commitCount()).toBe(1);
  expect(git(root, 'status', '--porcelain').stdout).toBe('');
});

test('re-running create is satisfied throughout and changes nothing', async () => {
  await createWorkspace(root);
  const report = await createWorkspace(root);
  expect(report.steps.map((step) => step.outcome)).toEqual(Array(13).fill('satisfied'));
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
    'Mutations report as JSON too', // 0015: mutation reports have one as well
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

// The CLAUDE.md bridge (design/0017-claude-md-symlink/): Claude Code's
// expected filename symlinked onto the harness-neutral guidance — one source
// of truth, tracked in the workspace's own history like AGENTS.md itself.
test('CLAUDE.md is a relative symlink resolving to the AGENTS.md guidance', async () => {
  await createWorkspace(root);
  const link = join(root, 'CLAUDE.md');
  expect(lstatSync(link).isSymbolicLink()).toBe(true);
  expect(readlinkSync(link)).toBe('AGENTS.md'); // relative — survives moving the workspace
  expect(await Bun.file(link).text()).toBe(await Bun.file(join(root, 'AGENTS.md')).text());
  // Tracked as a symlink (git mode 120000), not as a copy of the content.
  expect(git(root, 'ls-files', '-s', '--', 'CLAUDE.md').stdout).toStartWith('120000');
});

test('a removed CLAUDE.md link is re-established on converge, with no baseline entry', async () => {
  await createWorkspace(root);
  rmSync(join(root, 'CLAUDE.md'));
  git(root, 'commit', '-am', 'human removed the link');
  const report = await createWorkspace(root);
  const outcomes = new Map(report.steps.map((step) => [step.step, step.outcome]));
  expect(outcomes.get('claude guidance')).toBe('established');
  expect(outcomes.get('agent guidance')).toBe('satisfied');
  // The link's content is its target, read directly — never fingerprinted,
  // so the convergence commit holds the link and nothing else.
  const committed = git(root, 'show', '--name-only', '--format=', 'HEAD').stdout.trim();
  expect(committed).toBe('CLAUDE.md');
});

test('a pre-existing CLAUDE.md — regular file or link aimed elsewhere — is never overwritten', async () => {
  await createWorkspace(root);
  rmSync(join(root, 'CLAUDE.md'));
  await Bun.write(join(root, 'CLAUDE.md'), 'my own claude guidance\n');
  let report = await createWorkspace(root);
  expect(report.steps.find((step) => step.step === 'claude guidance')?.outcome).toBe('satisfied');
  expect(await Bun.file(join(root, 'CLAUDE.md')).text()).toBe('my own claude guidance\n');
  rmSync(join(root, 'CLAUDE.md'));
  symlinkSync('somewhere/else.md', join(root, 'CLAUDE.md')); // dangling — still theirs
  report = await createWorkspace(root);
  expect(report.steps.find((step) => step.step === 'claude guidance')?.outcome).toBe('satisfied');
  expect(readlinkSync(join(root, 'CLAUDE.md'))).toBe('somewhere/else.md');
});

// The standing workspace project (design/0018-standing-workspace-project/):
// creation establishes the one project for work on the workspace itself,
// identified by the `standing` marker in its typed front matter — which only
// creation writes, so `project open` cannot mint a second one.
test('creation establishes the standing project on floor 1, marked in its record', async () => {
  await createWorkspace(root);
  const standing = await findStandingProject(root);
  expect(standing?.dir).toBe('projects/1-workspace');
  expect(standing?.record).toMatchObject({
    floor: 1,
    slug: 'workspace',
    standing: true,
    state: 'active',
  });
  // An ordinary project — whatever it is named — never carries the marker.
  const ordinary = await openProject(root, 'workspace-lookalike');
  expect(ordinary.floor).toBe(2);
  expect(ordinary.standing).toBeUndefined();
  expect((await findStandingProject(root))?.dir).toBe('projects/1-workspace');
});

test('a removed standing project is re-established on converge at the next floor, never a reused one', async () => {
  await createWorkspace(root);
  rmSync(join(root, 'projects', '1-workspace'), { recursive: true });
  git(root, 'commit', '-am', 'human removed the standing project');
  await openProject(root, 'theirs'); // now shaped like a pre-0018 workspace: floor 1 is theirs
  const report = await createWorkspace(root);
  const outcomes = new Map(report.steps.map((step) => [step.step, step.outcome]));
  expect(outcomes.get('standing project')).toBe('established');
  expect((await findStandingProject(root))?.dir).toBe('projects/2-workspace');
  // The converge commit holds exactly the re-established record.
  const committed = git(root, 'show', '--name-only', '--format=', 'HEAD').stdout.trim();
  expect(committed).toBe('projects/2-workspace/project.md');
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
