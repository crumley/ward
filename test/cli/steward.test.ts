// The stewardship rails through the spawned CLI
// (design/0019-stewardship-worktrees/): `worktree create --workspace`, the
// stewardship-copy guard (mutations refuse naming the enclosing workspace;
// reads proceed against the candidate copy), `ward workspace merge` with its
// preview and its 0015 postures (one document alone on stdout; refusals =
// stderr + exit 1 + empty stdout), the delivered close refused before the
// merge and verified after it, and the status glance reading the workspace
// worktree's freshness against the workspace's own main line.
import { afterAll, beforeAll, beforeEach, expect, test } from 'bun:test';
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  statusShape,
  workspaceMergeShape,
  worktreeCreateShape,
  worktreeListShape,
} from '../../src/cli/schema.ts';
import { verbPath } from '../../src/cli/telemetry.ts';
import { createWorkspace } from '../../src/workspace/create.ts';
import { gitOrThrow } from '../../src/workspace/git.ts';
import { workspaceMainLine } from '../../src/workspace/steward.ts';
import { openTask } from '../../src/workspace/tasks.ts';
import { createWorkspaceWorktree } from '../../src/workspace/worktrees.ts';
import { applyGitTestEnv, makeTempDir, removeDir, runWard } from '../helpers.ts';

// -- worktree create --workspace --------------------------------------------

test('worktree create --workspace: the stewardship worktree, both renderings', () => {
  const human = runWard(['worktree', 'create', 't1', '--workspace'], ws);
  expect(human.exitCode).toBe(0);
  expect(human.stdout).toContain('created worktrees/t1-steward-steward-work');
  expect(human.stdout).toContain("the workspace's own repository");
  expect(human.stdout).toContain('branch steward/steward-work');

  // Convergent re-run under --json: one document, alone, source named plainly.
  const json = runWard(['worktree', 'create', 't1', '--workspace', '--json'], ws);
  expect(json.exitCode).toBe(0);
  const doc = worktreeCreateShape.parse(JSON.parse(json.stdout));
  expect(doc).toEqual({
    task: 't1',
    address: 't1',
    source: 'workspace',
    branch: 'steward/steward-work',
    disposition: 'deliverable',
    path: 'worktrees/t1-steward-steward-work',
    createdAt: doc.createdAt,
  });
  expect(Object.keys(doc)).not.toContain('repo');
});

test('the worktree source is exactly one of --repo and --workspace', () => {
  const neither = runWard(['worktree', 'create', 't1'], ws);
  expect(neither.exitCode).toBe(1);
  expect(neither.stdout).toBe('');
  expect(neither.stderr).toContain('--repo NAME');
  expect(neither.stderr).toContain('--workspace');

  const both = runWard(['worktree', 'create', 't1', '--repo', 'demo', '--workspace'], ws);
  expect(both.exitCode).toBe(1);
  expect(both.stderr).toContain('exactly one of the two');
});

test('worktree list names the workspace source, in both renderings', async () => {
  await createWorkspaceWorktree(ws, 't1');
  const human = runWard(['worktree', 'list'], ws);
  expect(human.exitCode).toBe(0);
  expect(human.stdout).toContain('t1 workspace:steward/steward-work (deliverable)');

  const rows = worktreeListShape.parse(
    JSON.parse(runWard(['worktree', 'list', '--json'], ws).stdout),
  );
  expect(rows[0]?.source).toBe('workspace');
  expect(rows[0]?.repo).toBeUndefined();
  expect(rows[0]?.present).toBe(true);
});

// -- the stewardship-copy guard ---------------------------------------------

test('inside a stewardship copy, mutating verbs refuse plainly and reads proceed', async () => {
  const { record } = await createWorkspaceWorktree(ws, 't1');
  const copy = join(ws, record.path);

  // Mutations refuse: exit 1, nothing on stdout, the enclosing workspace named.
  for (const argv of [
    ['task', 'open', 'sneaky'],
    ['task', 'pause'], // scope inference is also a mutation path
    ['session', 'open', 't1', '--purpose', 'x'],
    ['repo', 'refresh'],
    ['workspace', 'merge', record.branch],
  ]) {
    const refused = runWard(argv, copy);
    expect(refused.exitCode).toBe(1);
    expect(refused.stdout).toBe('');
    expect(refused.stderr).toContain('stewardship copy');
    expect(refused.stderr).toContain('false history');
    expect(refused.stderr).toContain('cd /');
  }

  // Reads proceed — against the candidate copy, which is the preview's point.
  const list = runWard(['task', 'list'], copy);
  expect(list.exitCode).toBe(0);
  expect(list.stdout).toContain('t1 steward-work');
  const status = runWard(['status'], copy);
  expect(status.exitCode).toBe(0);

  // And no journal entry landed anywhere: both histories are unmoved.
  expect(gitOrThrow(copy, 'status', '--porcelain').stdout.trim()).toBe('');
});

// -- the gated merge --------------------------------------------------------

test('preview, merge, converge: both renderings, the 0015 document postures', async () => {
  const { record } = await createWorkspaceWorktree(ws, 't1');
  commitInCopy(join(ws, record.path), 'note.md', 'stewardship change\n');

  const preview = runWard(['workspace', 'merge', record.branch, '--preview'], ws);
  expect(preview.exitCode).toBe(0);
  expect(preview.stdout).toContain(`would merge '${record.branch}' into ${mainLine} — 1 commit`);
  expect(preview.stdout).toContain('note.md');
  expect(preview.stdout).toContain(`merge with: ward workspace merge ${record.branch}`);

  const previewJson = runWard(['workspace', 'merge', record.branch, '--preview', '--json'], ws);
  expect(previewJson.exitCode).toBe(0);
  const previewDoc = workspaceMergeShape.parse(JSON.parse(previewJson.stdout));
  expect(previewDoc.outcome).toBe('previewed');
  expect(previewDoc.commits).toBe(1);
  expect(previewDoc.diffStat).toContain('note.md');
  expect(previewDoc.mergeCommit).toBeUndefined();

  const merge = runWard(['workspace', 'merge', record.branch, '--json'], ws);
  expect(merge.exitCode).toBe(0);
  const doc = workspaceMergeShape.parse(JSON.parse(merge.stdout));
  expect(doc.outcome).toBe('merged');
  expect(doc.commits).toBe(1);
  expect(doc.mainLine).toBe(mainLine);
  expect(doc.mergeCommit).toBeDefined();
  expect(doc.diffStat).toBeUndefined();
  expect(existsSync(join(ws, 'note.md'))).toBe(true);

  const again = runWard(['workspace', 'merge', record.branch], ws);
  expect(again.exitCode).toBe(0);
  expect(again.stdout).toContain('already merged');
});

test('a conflicted merge is a refusal: stderr + exit 1 + empty stdout, tree left clean', async () => {
  const { record } = await createWorkspaceWorktree(ws, 't1');
  commitInCopy(join(ws, record.path), 'AGENTS.md', 'branch version\n');
  writeFileSync(join(ws, 'AGENTS.md'), 'main version\n');
  gitOrThrow(ws, 'add', '-A', '--', 'AGENTS.md');
  gitOrThrow(ws, 'commit', '-m', 'Advance main');

  const result = runWard(['workspace', 'merge', record.branch, '--json'], ws);
  expect(result.exitCode).toBe(1);
  expect(result.stdout).toBe(''); // a refusal emits no document, --json or not
  expect(result.stderr).toContain('conflicts in: AGENTS.md');
  expect(result.stderr).toContain('Aborted');
  expect(gitOrThrow(ws, 'status', '--porcelain').stdout.trim()).toBe('');
});

test('a dirty root and an unknown branch refuse legibly', async () => {
  const { record } = await createWorkspaceWorktree(ws, 't1');
  commitInCopy(join(ws, record.path), 'note.md', 'x\n');
  writeFileSync(join(ws, 'stray.txt'), 'uncommitted\n');
  const dirty = runWard(['workspace', 'merge', record.branch], ws);
  expect(dirty.exitCode).toBe(1);
  expect(dirty.stdout).toBe('');
  expect(dirty.stderr).toContain('uncommitted changes');

  const unknown = runWard(['workspace', 'merge', 'no-such-branch'], ws);
  expect(unknown.exitCode).toBe(1);
  expect(unknown.stderr).toContain("no branch named 'no-such-branch'");
});

// -- the delivered close, end to end ----------------------------------------

test('close refused before the merge, delivered after it — through the CLI', async () => {
  const { record } = await createWorkspaceWorktree(ws, 't1');
  commitInCopy(join(ws, record.path), 'work.md', 'the deliverable\n');

  const refused = runWard(['task', 'close', 't1'], ws);
  expect(refused.exitCode).toBe(1);
  expect(refused.stdout).toBe('');
  expect(refused.stderr).toContain("has not reached the workspace's main line");
  expect(refused.stderr).toContain(`ward workspace merge ${record.branch}`);
  expect(existsSync(join(ws, record.path))).toBe(true); // refusal precedes teardown

  expect(runWard(['workspace', 'merge', record.branch], ws).exitCode).toBe(0);
  const closed = runWard(['task', 'close', 't1'], ws);
  expect(closed.exitCode).toBe(0);
  expect(closed.stdout).toContain('reachability');
  expect(closed.stdout).toContain(`reaches ${mainLine} in the workspace's own history`);
  expect(closed.stdout).toContain('delivered');
  expect(existsSync(join(ws, record.path))).toBe(false);
});

// -- the status glance ------------------------------------------------------

test('status reads workspace-worktree freshness against the workspace main line', async () => {
  const { record } = await createWorkspaceWorktree(ws, 't1');
  // The journal advances the main line (a second task opens); the branch is
  // now honestly behind it — the normal mid-flight state of stewardship work.
  expect(runWard(['task', 'open', 'second'], ws).exitCode).toBe(0);

  const status = runWard(['status'], ws);
  expect(status.exitCode).toBe(0);
  expect(status.stdout).toContain(
    `${record.path} — behind ${mainLine} by 1 commit — rebase with: ward worktree rebase t1`,
  );

  const doc = statusShape.parse(JSON.parse(runWard(['status', '--json'], ws).stdout));
  const rows = doc.bareTasks.find((task) => task.code === 't1')?.worktrees;
  expect(rows).toEqual([
    {
      source: 'workspace',
      branch: record.branch,
      path: record.path,
      freshness: 'behind',
      behindBy: 1,
    },
  ]);

  // The rebase remedy works, and the glance then reads current.
  expect(runWard(['worktree', 'rebase', 't1'], ws).exitCode).toBe(0);
  expect(runWard(['status'], ws).stdout).toContain(`${record.path} — current (atop ${mainLine})`);
});

// -- the contract's home ----------------------------------------------------

test('ward schema workspace merge documents the new verb, and telemetry knows its words', () => {
  const result = runWard(['schema', 'workspace', 'merge'], ws);
  expect(result.exitCode).toBe(0);
  const schema = JSON.parse(result.stdout);
  expect(schema.required).toEqual(['branch', 'mainLine', 'outcome', 'commits']);
  for (const optional of ['mergeCommit', 'diffStat']) {
    expect(Object.keys(schema.properties)).toContain(optional);
    expect(schema.required).not.toContain(optional);
  }
  expect(verbPath(['workspace', 'merge', 'steward/x'])).toBe('workspace merge');
});

// -- setup ------------------------------------------------------------------
// A fresh workspace per test (the verbs mutate), each with one bare task t1
// `steward-work`. No registered repositories — the workspace's own repository
// is not a member of the set and needs none.

let scratch: string;
let ws: string;
let mainLine: string;
let caseId = 0;

/** Commit one file on the stewardship branch, inside its worktree. */
function commitInCopy(copy: string, file: string, content: string): void {
  writeFileSync(join(copy, file), content);
  gitOrThrow(copy, 'add', '-A', '--', file);
  gitOrThrow(copy, 'commit', '-m', `Stewardship: ${file}`);
}

beforeAll(() => {
  applyGitTestEnv();
  scratch = makeTempDir();
});

beforeEach(async () => {
  caseId += 1;
  ws = join(scratch, `ws-${caseId}`);
  await createWorkspace(ws);
  await openTask(ws, 'steward-work', {});
  mainLine = workspaceMainLine(ws);
});

afterAll(() => {
  removeDir(scratch);
});
