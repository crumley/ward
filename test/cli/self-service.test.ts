// The self-service workspace upgrade through the spawned CLI
// (design/0030-upgrade-self-service/): `ward workspace upgrade` run bare by a
// human derives its own vehicle, publishes the stewardship branch to the
// workspace's forge, records the pull request on the task, and ends by naming
// the acts it deliberately did not take. A declared agent is refused the
// derivation exactly as it is refused every other one; the forge half degrades
// without costing the task, the worktree, or the commit; and
// `ward workspace upgrade TASK` is untouched — it opens no pull request and
// pushes nothing.
//
// The forge is faked twice over and never reached: WARD_GH points at the
// canned `gh` from test/helpers.ts, and `origin` is a GitHub-shaped URL whose
// `pushurl` is a bare repository in the scratch tree — so a real `git push`
// really runs, at a real remote, on this machine alone.
import { afterAll, beforeAll, expect, test } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { workspaceUpgradeShape } from '../../src/cli/schema.ts';
import { git, gitOrThrow } from '../../src/workspace/git.ts';
import { LEGACY_AGENTS_MD } from '../fixtures/legacy.ts';
import {
  applyGitTestEnv,
  type CliResult,
  makeTempDir,
  NO_GH,
  removeDir,
  runWardEnv,
  writeFakeGh,
} from '../helpers.ts';

const PR_URL = 'https://github.com/example/ws-main/pull/7';

test('bare and human: the derived vehicle, the pull request, and the four acts that remain', () => {
  const ws = workspace('served', { forge: true });

  const result = ward(ws, ['workspace', 'upgrade', '--json'], { WARD_GH: gh });
  expect(result.exitCode).toBe(0);
  const report = workspaceUpgradeShape.parse(JSON.parse(result.stdout));
  expect(report.vehicle).toBe('derived');
  expect(report.outcome).toBe('upgraded');
  expect(report.task).toBe('f1t1'); // the standing floor's room 1 (0036)
  expect(report.branch).toBe('steward/workspace-upgrade');
  expect(report.commit).toBeDefined();
  expect(report.artifacts.find((a) => a.path === 'AGENTS.md')?.action).toBe('upgraded');

  // The forge half: the main line published first so the pull request diffs
  // the upgrade alone, then the branch, then the PR — recorded on the task.
  expect(report.pullRequest).toMatchObject({ outcome: 'opened', url: PR_URL });
  expect(report.pullRequest?.base).toMatchObject({ ref: mainLine, outcome: 'published' });
  expect(remoteBranches(ws)).toContain('steward/workspace-upgrade');
  expect(remoteBranches(ws)).toContain(mainLine);
  const listing = JSON.parse(ward(ws, ['task', 'list', '--json'], {}).stdout) as {
    tasks: { address: string; prs: string[] }[];
  };
  expect(listing.tasks.find((task) => task.address === 'f1t1')?.prs).toEqual([PR_URL]);

  // What remains is the human's, in the order they do it — and the landing act
  // is the LOCAL gated merge, never the forge's button.
  expect(report.remaining.map((act) => [act.step, act.command])).toEqual([
    ['review', undefined],
    ['merge', 'ward workspace merge steward/workspace-upgrade'],
    ['publish', `git push origin ${mainLine}`],
    ['close', 'ward task close f1t1'],
  ]);
  expect(report.remaining[0]?.detail).toContain(PR_URL);

  // The derivation is echoed, never silent — and under --json it echoes on
  // stderr, so stdout carries one document alone (0005/0006).
  expect(result.stderr).toContain('task f1t1 — opened for this upgrade');
  expect(result.stderr).toContain('worktree worktrees/f1t1-steward-workspace-upgrade');
  expect(report.derived?.map((step) => step.step)).toEqual(['task', 'worktree']);
});

test('the human rendering names the same acts, and the second run is refused, naming both ways out', () => {
  const ws = workspace('rendered', { forge: true });

  const rendered = ward(ws, ['workspace', 'upgrade'], { WARD_GH: gh });
  expect(rendered.exitCode).toBe(0);
  expect(rendered.stdout).toContain('task f1t1 — opened for this upgrade');
  expect(rendered.stdout).toContain('upgraded  AGENTS.md');
  expect(rendered.stdout).toContain(`pull request ${PR_URL}`);
  expect(rendered.stdout).toContain('what remains is yours');
  expect(rendered.stdout).toContain('ward workspace merge steward/workspace-upgrade');
  expect(rendered.stdout).toContain('ward task close f1t1');

  // One open upgrade task per workspace: the second run refuses, exit 1 with
  // stdout empty, naming the task and the two ways out.
  const again = ward(ws, ['workspace', 'upgrade'], { WARD_GH: gh });
  expect(again.exitCode).toBe(1);
  expect(again.stdout).toBe('');
  expect(again.stderr).toContain('already in flight');
  expect(again.stderr).toContain('task f1t1 holds 1 commit');
  expect(again.stderr).toContain('ward workspace merge steward/workspace-upgrade');
  expect(again.stderr).toContain('ward task close f1t1 --outcome abandoned');

  // And the acts it named land it: merge, then the delivered close.
  expect(ward(ws, ['workspace', 'merge', 'steward/workspace-upgrade'], {}).exitCode).toBe(0);
  expect(readFileSync(join(ws, 'AGENTS.md'), 'utf8')).not.toBe(LEGACY_AGENTS_MD);
  // The PR is linked and the fake forge reports it merged, so the close gate
  // resolves the PR set and the reachability check verifies the branch.
  const closed = ward(ws, ['task', 'close', 'f1t1', '--json'], { WARD_GH: ghMerged });
  expect(closed.exitCode).toBe(0);
  const steps = (JSON.parse(closed.stdout) as { steps: { step: string; detail: string }[] }).steps;
  // Two reachability steps here — the forge PR's and the workspace worktree's;
  // it is the local one, read from the workspace's own history, that decides.
  expect(steps.filter((step) => step.step === 'reachability').length).toBe(2);
  expect(steps.some((step) => step.detail.includes(`reaches ${mainLine}`))).toBe(true);
});

test('a declared agent is refused the derivation and told to pass the task, exactly as everywhere else', () => {
  const ws = workspace('agent', { forge: true });

  const result = ward(ws, ['workspace', 'upgrade', '--json'], { WARD_GH: gh, WARD_AGENT: '1' });
  expect(result.exitCode).toBe(1);
  expect(result.stdout).toBe(''); // a refusal emits no document (0015)
  expect(result.stderr).toContain('a declared agent passes scope explicitly');
  expect(result.stderr).toContain('ward workspace upgrade TASK');
  // Nothing was manufactured on the agent's behalf.
  expect(JSON.parse(ward(ws, ['task', 'list', '--json'], {}).stdout).tasks).toEqual([]);
});

test('the no-op case manufactures nothing: no task, no worktree, no branch, no pull request', () => {
  const ws = workspace('current', { forge: true, stale: false });

  const result = ward(ws, ['workspace', 'upgrade', '--json'], { WARD_GH: gh });
  expect(result.exitCode).toBe(0);
  const report = workspaceUpgradeShape.parse(JSON.parse(result.stdout));
  expect(report.vehicle).toBe('none');
  expect(report.outcome).toBe('current');
  expect(report.task).toBeUndefined();
  expect(report.pullRequest).toBeUndefined();
  expect(report.remaining).toEqual([]);
  expect(JSON.parse(ward(ws, ['task', 'list', '--json'], {}).stdout).tasks).toEqual([]);
  expect(readdirSync(join(ws, 'worktrees'))).toEqual([]);
  expect(localBranches(ws)).toEqual([mainLine]);
});

test('forge absent: the upgrade still lands on its branch, and the preview is the review surface', () => {
  const ws = workspace('no-forge', { forge: false });

  const result = ward(ws, ['workspace', 'upgrade', '--json'], { WARD_GH: NO_GH });
  expect(result.exitCode).toBe(0);
  const report = workspaceUpgradeShape.parse(JSON.parse(result.stdout));
  expect(report.outcome).toBe('upgraded');
  expect(report.commit).toBeDefined();
  expect(report.pullRequest?.outcome).toBe('skipped');
  expect(report.pullRequest?.detail).toContain('no origin remote');
  expect(report.pullRequest?.base).toBeUndefined();
  expect(report.remaining.map((act) => act.step)).toEqual(['review', 'merge', 'close']);
  expect(report.remaining[0]?.command).toBe(
    'ward workspace merge steward/workspace-upgrade --preview',
  );
});

test('forge failure: the task, the worktree, and the commit stand, and the failure is named', () => {
  const ws = workspace('forge-down', { forge: true });

  const result = ward(ws, ['workspace', 'upgrade', '--json'], { WARD_GH: ghBroken });
  expect(result.exitCode).toBe(0); // the upgrade did its act; the forge is optional (§20)
  const report = workspaceUpgradeShape.parse(JSON.parse(result.stdout));
  expect(report.outcome).toBe('upgraded');
  expect(report.task).toBe('f1t1'); // the standing floor's room 1 (0036)
  expect(report.commit).toBeDefined();
  expect(report.pullRequest?.outcome).toBe('failed');
  expect(report.pullRequest?.detail).toContain('the forge said no');
  expect(report.pullRequest?.url).toBeUndefined();
  // The branch was pushed before the forge refused, and the local review
  // surface is what the remaining acts point at instead.
  expect(remoteBranches(ws)).toContain('steward/workspace-upgrade');
  expect(report.remaining.map((act) => act.step)).toEqual(['review', 'merge', 'close']);
  expect(report.remaining[0]?.detail).toContain('the forge half failed');
  // Nothing was linked to the task, because there is nothing to link.
  const tasks = JSON.parse(ward(ws, ['task', 'list', '--json'], {}).stdout).tasks as {
    prs: string[];
  }[];
  expect(tasks[0]?.prs).toEqual([]);
});

test('workspace upgrade TASK is unchanged: no push, no pull request, the task the caller named', () => {
  const ws = workspace('explicit', { forge: true });
  expect(ward(ws, ['task', 'open', 'adopt-defaults'], {}).exitCode).toBe(0);
  expect(ward(ws, ['worktree', 'create', 't1', '--workspace'], {}).exitCode).toBe(0);

  const result = ward(ws, ['workspace', 'upgrade', 't1', '--json'], { WARD_GH: gh });
  expect(result.exitCode).toBe(0);
  const report = workspaceUpgradeShape.parse(JSON.parse(result.stdout));
  expect(report.vehicle).toBe('given');
  expect(report.task).toBe('t1'); // a bare task: its room IS its address
  expect(report.branch).toBe('steward/adopt-defaults');
  expect(report.derived).toBeUndefined();
  expect(report.pullRequest).toBeUndefined();
  expect(report.remaining.map((act) => act.step)).toEqual(['review', 'merge', 'close']);
  // Nothing outward happened: the forge remote holds nothing at all.
  expect(remoteBranches(ws)).toEqual([]);
  // And the task the human opened carries no derived marker, so it never
  // blocks a later self-service run — detection is what Ward itself wrote.
  const record = readFileSync(join(ws, 'tasks', 't1-adopt-defaults', 'task.md'), 'utf8');
  expect(record).not.toContain('stewardship');
});

// -- setup ------------------------------------------------------------------
// One scratch tree, one workspace per case (each case's vehicle is exactly
// what the next must not inherit), and three fake `gh` binaries: one that
// opens a pull request, one that reports it merged (the close gate's read),
// and one whose forge refuses.

let scratch: string;
let gh: string;
let ghMerged: string;
let ghBroken: string;
let mainLine: string;
let workspaceId = 0;

function ward(cwd: string, argv: string[], env: Record<string, string>): CliResult {
  return runWardEnv(argv, cwd, { NO_COLOR: '1', WARD_GH: NO_GH, ...env });
}

interface WorkspaceShape {
  /** Give the workspace a GitHub-shaped `origin` whose pushes land in a local bare repo. */
  readonly forge: boolean;
  /** Age AGENTS.md to a default Ward really shipped, so an upgrade has work to do. */
  readonly stale?: boolean;
}

function workspace(name: string, shape: WorkspaceShape): string {
  workspaceId += 1;
  const root = join(scratch, `${workspaceId}-${name}`);
  expect(ward(scratch, ['workspace', 'create', root], {}).exitCode).toBe(0);
  mainLine = gitOrThrow(root, 'symbolic-ref', '--short', 'HEAD').stdout.trim();
  if (shape.forge) {
    const bare = join(scratch, `${workspaceId}-${name}.git`);
    gitOrThrow(scratch, 'init', '--bare', '--quiet', bare);
    gitOrThrow(root, 'remote', 'add', 'origin', 'https://github.com/example/ws-main.git');
    // The remote READS as a forge (that is what decides whether a pull request
    // is even possible) and PUSHES to the bare repository beside it — so the
    // push under test is a real one that never leaves this machine.
    gitOrThrow(root, 'config', 'remote.origin.pushurl', bare);
  }
  if (shape.stale !== false) {
    Bun.write(join(root, 'AGENTS.md'), LEGACY_AGENTS_MD);
    gitOrThrow(root, 'add', '-A');
    gitOrThrow(root, 'commit', '--quiet', '-m', 'Age the guidance (test fixture)');
  }
  return root;
}

/** The branches the workspace's push target actually received. */
function remoteBranches(root: string): string[] {
  const url = git(root, 'config', 'remote.origin.pushurl').stdout.trim();
  if (url === '') return [];
  return gitOrThrow(url, 'branch', '--format=%(refname:short)')
    .stdout.split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '');
}

function localBranches(root: string): string[] {
  return gitOrThrow(root, 'branch', '--format=%(refname:short)')
    .stdout.split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '');
}

beforeAll(() => {
  applyGitTestEnv();
  scratch = makeTempDir();
  gh = writeFakeGh(scratch, 'gh-open', { responses: {}, create: PR_URL });
  ghMerged = writeFakeGh(scratch, 'gh-merged', {
    responses: { [PR_URL]: { state: 'MERGED' } },
    create: PR_URL,
  });
  ghBroken = writeFakeGh(scratch, 'gh-broken', { responses: {}, create: 'error' });
});

afterAll(() => {
  removeDir(scratch);
});
