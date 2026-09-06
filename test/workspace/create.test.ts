// Workspace creation and the convergence it runs: a fresh create establishes
// everything, a path that is already a workspace is refused with the verb that
// owns updating it, a converge run over an existing workspace is a no-op, a
// partial workspace is completed, customized artifacts are never touched, and
// unsafe targets are refused (intent/01-concepts/06-workspace-lifecycle.md;
// design/0002-store-and-workspace/; design/0042-upgrade-owns-convergence/).
import { afterAll, beforeAll, beforeEach, expect, test } from 'bun:test';
import { existsSync, lstatSync, mkdirSync, readlinkSync, rmSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { convergeWorkspace } from '../../src/workspace/converge.ts';
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
    'projects/0-workspace/project.md',
  ]) {
    expect(existsSync(join(root, file))).toBe(true);
  }
  expect(commitCount()).toBe(1);
  expect(git(root, 'status', '--porcelain').stdout).toBe('');
});

test('re-converging an existing workspace is satisfied throughout and changes nothing', async () => {
  await createWorkspace(root);
  const report = await convergeWorkspace(root);
  expect(report.steps.map((step) => step.outcome)).toEqual(Array(12).fill('satisfied'));
  expect(commitCount()).toBe(1);
  expect(git(root, 'status', '--porcelain').stdout).toBe('');
});

// Creation is a one-time, located act: a path that is already a workspace is
// REFUSED, and the refusal names the verb that owns bringing it forward
// (design/0042-upgrade-owns-convergence/). "Did I already init this?" stays a
// safe question because the answer is a refusal, never a clobber.
test('create refuses a path that is already a workspace, naming upgrade', async () => {
  await createWorkspace(root);
  const before = await Bun.file(join(root, 'AGENTS.md')).text();
  await Bun.write(join(root, 'AGENTS.md'), 'my own guidance\n');
  expect(createWorkspace(root)).rejects.toThrow(
    `${root} is already a Ward workspace — bring it to this release with: ward workspace upgrade`,
  );
  // Nothing was written and nothing was committed: the refusal is total.
  expect(await Bun.file(join(root, 'AGENTS.md')).text()).toBe('my own guidance\n');
  expect(before).not.toBe('my own guidance\n');
  expect(commitCount()).toBe(1);
});

test('create still succeeds on an absent path and on an existing empty directory', async () => {
  const empty = join(root, 'inside');
  mkdirSync(empty, { recursive: true });
  for (const [path, first] of [
    [join(root, 'absent'), 'established'],
    [empty, 'satisfied'],
  ] as const) {
    const report = await createWorkspace(path);
    expect(report.steps[0]).toMatchObject({ step: 'root directory', outcome: first });
    expect(report.steps.slice(1).every((step) => step.outcome === 'established')).toBe(true);
    expect(existsSync(join(path, 'projects/0-workspace/project.md'))).toBe(true);
  }
});

// A creation that crashed between the marker step and the converge commit
// leaves a workspace `upgrade` finishes, because the steps are the same list.
test('a run interrupted after the marker is finished by a converge, not by a second create', async () => {
  mkdirSync(join(root, '.ward', 'tmp'), { recursive: true });
  expect(createWorkspace(root)).rejects.toThrow(/already a Ward workspace/);
  const report = await convergeWorkspace(root);
  expect(report.steps.map((step) => step.outcome)).toEqual(Array(12).fill('established'));
  expect(existsSync(join(root, 'projects/0-workspace/project.md'))).toBe(true);
  expect(commitCount()).toBe(1);
  expect(git(root, 'status', '--porcelain').stdout).toBe('');
});

test('a missing artifact is re-established; the converge commit holds it and its baseline', async () => {
  await createWorkspace(root);
  rmSync(join(root, 'AGENTS.md'));
  git(root, 'commit', '-am', 'human removed guidance');
  const report = await convergeWorkspace(root);
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
  const report = await convergeWorkspace(root);
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
  let report = await convergeWorkspace(root);
  expect(report.steps.find((step) => step.step === 'claude guidance')?.outcome).toBe('satisfied');
  expect(await Bun.file(join(root, 'CLAUDE.md')).text()).toBe('my own claude guidance\n');
  rmSync(join(root, 'CLAUDE.md'));
  symlinkSync('somewhere/else.md', join(root, 'CLAUDE.md')); // dangling — still theirs
  report = await convergeWorkspace(root);
  expect(report.steps.find((step) => step.step === 'claude guidance')?.outcome).toBe('satisfied');
  expect(readlinkSync(join(root, 'CLAUDE.md'))).toBe('somewhere/else.md');
});

// The standing workspace project (design/0018-standing-workspace-project/) is
// the ground floor (design/0041-ground-floor/): floor 0 in every workspace,
// identified by the `standing` marker in its typed front matter — which only
// creation writes, so `project open` cannot mint a second one — and outside
// the ordinary sequence, which still starts at 1.
test('creation establishes the ground floor at floor 0, marked in its record', async () => {
  await createWorkspace(root);
  const standing = await findStandingProject(root);
  expect(standing?.dir).toBe('projects/0-workspace');
  expect(standing?.record).toMatchObject({
    floor: 0,
    slug: 'workspace',
    standing: true,
    state: 'active',
  });
  // An ordinary project — whatever it is named — never carries the marker,
  // and takes floor 1: the reserved number is not in its sequence.
  const ordinary = await openProject(root, 'workspace-lookalike');
  expect(ordinary.floor).toBe(1);
  expect(ordinary.standing).toBeUndefined();
  expect((await findStandingProject(root))?.dir).toBe('projects/0-workspace');
});

test('a removed ground floor is re-established at floor 0 — the reserved number, not the next one', async () => {
  await createWorkspace(root);
  rmSync(join(root, 'projects', '0-workspace'), { recursive: true });
  git(root, 'commit', '-am', 'human removed the standing project');
  await openProject(root, 'theirs'); // an ordinary floor 1 stands where it always would
  const report = await convergeWorkspace(root);
  const outcomes = new Map(report.steps.map((step) => [step.step, step.outcome]));
  expect(outcomes.get('standing project')).toBe('established');
  expect((await findStandingProject(root))?.dir).toBe('projects/0-workspace');
  // The converge commit holds exactly the re-established record.
  const committed = git(root, 'show', '--name-only', '--format=', 'HEAD').stdout.trim();
  expect(committed).toBe('projects/0-workspace/project.md');
});

test('a customized artifact is left alone, even when dirty', async () => {
  await createWorkspace(root);
  await Bun.write(join(root, 'AGENTS.md'), 'my own guidance\n');
  const report = await convergeWorkspace(root);
  const agents = report.steps.find((step) => step.step === 'agent guidance');
  expect(agents?.outcome).toBe('satisfied');
  expect(await Bun.file(join(root, 'AGENTS.md')).text()).toBe('my own guidance\n');
  // The human's uncommitted edit is not swept into any convergence commit.
  expect(git(root, 'status', '--porcelain').stdout).toContain('AGENTS.md');
});

test('create refuses a populated directory that is not a workspace', async () => {
  mkdirSync(root, { recursive: true });
  await Bun.write(join(root, 'unrelated.txt'), 'not a workspace\n');
  expect(createWorkspace(root)).rejects.toThrow(
    /not empty and is not a Ward workspace — choose a new or empty location/,
  );
});

test('converge fails legibly on an invalid workspace record', async () => {
  await createWorkspace(root);
  await Bun.write(join(root, 'workspace.md'), '---\ntype: garbage\n---\n');
  expect(convergeWorkspace(root)).rejects.toThrow(/workspace\.md/);
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
