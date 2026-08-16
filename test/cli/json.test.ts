// The --json read verbs (design/0005-agent-audience/): each emits exactly one
// parseable JSON document on stdout in the documented shape, byte-identical
// for the same state, with the human rendering left untouched. Shapes are
// asserted through the spawned CLI — the contract is the output, not the
// module that produced it.
import { afterAll, beforeAll, expect, test } from 'bun:test';
import { join } from 'node:path';
import { gitOrThrow } from '../../src/workspace/git.ts';
import { applyGitTestEnv, makeTempDir, removeDir, runWard } from '../helpers.ts';

const PR_URL = 'https://example.com/pr/1';

test('status --json: one parseable document carrying the derived rollup', () => {
  const result = runWard(['status', '--json'], ws);
  expect(result.exitCode).toBe(0);
  const status = JSON.parse(result.stdout);
  expect(status.workspace).toBe('active');
  expect(status.bareTasks).toEqual([]);
  // projects/1-workspace sorts first: the standing project, empty and honestly
  // active, one ordinary row (design/0018-standing-workspace-project/).
  expect(status.projects[0]).toMatchObject({
    floor: 1,
    slug: 'workspace',
    state: 'active',
    derived: 'active',
    tasks: [],
  });
  const project = status.projects[1];
  expect(project.floor).toBe(2);
  expect(project.slug).toBe('agent-output');
  expect(project.state).toBe('active');
  expect(project.derived).toBe('active');
  const task = project.tasks[0];
  expect(task.code).toBe('t1');
  expect(task.slug).toBe('json-output');
  expect(task.state).toBe('active');
  expect(task.floor).toBe(2);
  expect(task.purpose).toBe('machine-readable output');
  expect(task.prs).toEqual([PR_URL]);
  expect(task.inReview).toBe(true);
  expect(task.openSessions).toEqual(['json-output-1']);
  expect(task.outcome).toBeUndefined(); // optional fields are omitted, never null
});

test('status --json is byte-identical across runs on the same state', () => {
  const first = runWard(['status', '--json'], ws);
  const second = runWard(['status', '--json'], ws);
  expect(first.stdout).toBe(second.stdout);
});

test('task list --json: the record plus the derived in-review overlay', () => {
  const tasks = JSON.parse(runWard(['task', 'list', '--json'], ws).stdout);
  expect(tasks.length).toBe(1);
  expect(tasks[0].code).toBe('t1');
  expect(tasks[0].floor).toBe(2);
  expect(tasks[0].prs).toEqual([PR_URL]);
  expect(tasks[0].inReview).toBe(true);
  expect(typeof tasks[0].openedAt).toBe('string');
});

test('project list --json: stored state, derived status, task count', () => {
  const projects = JSON.parse(runWard(['project', 'list', '--json'], ws).stdout);
  expect(projects).toMatchObject([
    { floor: 1, slug: 'workspace', state: 'active', derived: 'active', taskCount: 0 },
    { floor: 2, slug: 'agent-output', state: 'active', derived: 'active', taskCount: 1 },
  ]);
});

test('worktree list --json: identity, disposition, and presence on disk', () => {
  const worktrees = JSON.parse(runWard(['worktree', 'list', '--json'], ws).stdout);
  expect(worktrees).toMatchObject([
    {
      task: 't1',
      repo: 'demo',
      branch: 'json-output',
      disposition: 'deliverable',
      path: 'worktrees/t1-json-output',
      present: true,
    },
  ]);
});

test('repo list --json: the registered set with remote and main line', () => {
  const repos = JSON.parse(runWard(['repo', 'list', '--json'], ws).stdout);
  expect(repos.length).toBe(1);
  expect(repos[0].name).toBe('demo');
  expect(repos[0].remote).toBe(remote);
  expect(repos[0].mainLine).toBe('main');
});

test('doctor --json: findings as data, healthy as the verdict, exit code kept', () => {
  const result = runWard(['doctor', '--json'], ws);
  expect(result.exitCode).toBe(0);
  const report = JSON.parse(result.stdout);
  expect(report.healthy).toBe(true);
  expect(typeof report.workspaceRoot).toBe('string');
  expect(report.machine.length).toBeGreaterThan(0);
  expect(report.machine[0]).toMatchObject({ check: 'git', severity: 'ok' });
  const checks = report.workspace.map((finding: { check: string }) => finding.check);
  expect(checks).toContain('version stamp');
  expect(checks).toContain('baseline AGENTS.md');
  expect(checks).toContain('standing project');
});

test('the human rendering is unchanged by the flag existing', () => {
  const result = runWard(['status'], ws);
  expect(result.stdout).toContain('Workspace: active');
  expect(result.stdout).toContain('floor 1 — workspace');
  expect(result.stdout).toContain('floor 2 — agent-output');
  expect(result.stdout).not.toContain('{');
});

test('empty sets are empty arrays, not prose', () => {
  for (const argv of [
    ['task', 'list', '--json'],
    ['worktree', 'list', '--json'],
    ['repo', 'list', '--json'],
  ]) {
    const result = runWard(argv, emptyWs);
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual([]);
  }
});

test('a fresh workspace already lists its standing project — never an empty set', () => {
  const result = runWard(['project', 'list', '--json'], emptyWs);
  expect(result.exitCode).toBe(0);
  expect(JSON.parse(result.stdout)).toMatchObject([
    { floor: 1, slug: 'workspace', state: 'active', derived: 'active', taskCount: 0 },
  ]);
});

// -- setup ----------------------------------------------------------------
// One workspace with the full spine in flight — repo, project, task,
// worktree, session, linked PR — plus an empty one for the empty-set shapes.

let scratch: string;
let ws: string;
let emptyWs: string;
let remote: string;

beforeAll(async () => {
  applyGitTestEnv();
  scratch = makeTempDir();
  ws = join(scratch, 'ws');
  emptyWs = join(scratch, 'empty');
  runWard(['workspace', 'create', ws], scratch);
  runWard(['workspace', 'create', emptyWs], scratch);

  remote = join(scratch, 'remote.git');
  gitOrThrow('.', 'init', '--bare', '--initial-branch=main', remote);
  const seed = join(scratch, 'seed');
  gitOrThrow('.', 'clone', remote, seed);
  await Bun.write(join(seed, 'README.md'), 'demo\n');
  gitOrThrow(seed, 'checkout', '-b', 'main');
  gitOrThrow(seed, 'add', '-A');
  gitOrThrow(seed, 'commit', '-m', 'seed');
  gitOrThrow(seed, 'push', '-u', 'origin', 'main');

  runWard(['repo', 'add', remote, '--name', 'demo'], ws);
  runWard(['project', 'open', 'agent-output'], ws); // floor 2 — the standing project holds 1
  runWard(
    ['task', 'open', 'json-output', '--project', '2', '--purpose', 'machine-readable output'],
    ws,
  );
  runWard(['worktree', 'create', 't1', '--repo', 'demo'], ws);
  runWard(
    ['session', 'open', 't1', '--purpose', 'drive the feature', '--handle', 'claude:run'],
    ws,
  );
  runWard(['task', 'pr', 't1', PR_URL], ws);
});

afterAll(() => {
  removeDir(scratch);
});
