// Worktrees (design/0004-work-spine/): created off the refreshed canonical
// checkout as worktrees *of* it, so branches live in the one repository the
// record names and teardown is `git worktree remove`. Disposition is recorded
// from day one; this entry builds only `deliverable`
// (intent/01-concepts/00-domain-model.md, Anchor).
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { WardError } from '../errors.ts';
import { readDocument, writeDocument } from '../store/document.ts';
import { withStoreLock } from '../store/lock.ts';
import { repositoryRecordType, type WorktreeRecord, worktreeRecordType } from '../store/types.ts';
import { git, gitOrThrow } from './git.ts';
import { type RefreshReport, refreshRepositories } from './repos.ts';
import { commitRecords, type FoundTask, readTasks, resolveOpenTask } from './scan.ts';
import { workspaceMainLine } from './steward.ts';

export async function createWorktree(
  root: string,
  taskCode: string,
  repoName: string,
  branchInput?: string,
): Promise<{ task: FoundTask; record: WorktreeRecord }> {
  const task = await resolveOpenTask(root, taskCode);
  if (!existsSync(join(root, repositoryRecordType(repoName).relPath))) {
    throw new WardError(`no repository named '${repoName}' is registered — see: ward repo list`);
  }
  const repoRecord = (await readDocument(root, repositoryRecordType(repoName))).data;
  const branch = branchInput ?? task.record.slug;
  const fileName = `${repoName}--${branch.replaceAll('/', '-')}`;
  const recordType = worktreeRecordType(task.dir, fileName);
  const path = `worktrees/${task.record.code}-${branch.replaceAll('/', '-')}`;

  if (existsSync(join(root, recordType.relPath))) {
    const existing = (await readDocument(root, recordType)).data;
    if (existsSync(join(root, existing.path))) {
      return { task, record: existing }; // convergent: already there
    }
  }

  // Branch from current code: the refresh the cadence would have done.
  await refreshRepositories(root, repoName);

  const canonical = join(root, 'repos', repoName);
  const result = git(
    canonical,
    'worktree',
    'add',
    '-b',
    branch,
    join(root, path),
    `origin/${repoRecord.mainLine}`,
  );
  if (result.exitCode !== 0) {
    throw new WardError(`git worktree add failed: ${result.stderr.trim()}`);
  }

  const record: WorktreeRecord = {
    type: 'worktree',
    repo: repoName,
    branch,
    disposition: 'deliverable',
    path,
    createdAt: new Date().toISOString(),
  };
  // Only the record write and its commit are serialized (§17) — the refresh
  // and `git worktree add` above stay outside the lock because they can be
  // slow (a fetch) and their collisions are git's own legible errors (a
  // branch that already exists), not store races.
  await withStoreLock(root, `worktree create ${taskCode}`, async () => {
    await writeDocument(root, recordType, {
      data: record,
      body:
        `Worktree of \`${repoName}\` on branch \`${branch}\`, occupied for task ` +
        `\`${task.record.code}\`. Deliverable: its changes reach the main line only through a ` +
        'pull request.',
    });
    commitRecords(root, `Create worktree ${branch} for task ${taskCode}`, task.dir);
  });
  return { task, record };
}

// -- the workspace as a worktree source -------------------------------------
// The stewardship case (design/0019-stewardship-worktrees/): a task anchored
// in a worktree of the workspace's OWN repository — the record itself, checked
// out as a candidate. The workspace repo is registered nowhere (the root IS
// its main-line checkout — intent/01-concepts/00-domain-model.md), so this
// path takes no repository name: the source is the workspace, said plainly.
// Git fully supports a linked worktree at an ignored path inside its own
// repository's working tree; only tracked files materialize, so the copy
// holds the record and none of the checkouts the record describes.

export async function createWorkspaceWorktree(
  root: string,
  taskCode: string,
  branchInput?: string,
): Promise<{ task: FoundTask; record: WorktreeRecord }> {
  const task = await resolveOpenTask(root, taskCode);
  // A namespaced default: stewardship branches sit beside the journal in the
  // workspace's own `git branch`, and the prefix is what announces them there.
  const branch = branchInput ?? `steward/${task.record.slug}`;
  const fileName = `workspace--${branch.replaceAll('/', '-')}`;
  const recordType = worktreeRecordType(task.dir, fileName);
  const path = `worktrees/${task.record.code}-${branch.replaceAll('/', '-')}`;
  const mainLine = workspaceMainLine(root);

  let record: WorktreeRecord;
  if (existsSync(join(root, recordType.relPath))) {
    record = (await readDocument(root, recordType)).data;
    if (existsSync(join(root, record.path))) {
      return { task, record }; // convergent: already there
    }
  } else {
    record = {
      type: 'worktree',
      source: 'workspace',
      branch,
      disposition: 'deliverable',
      path,
      createdAt: new Date().toISOString(),
    };
    // Record first, worktree second — the reverse of the repository path, on
    // purpose: the branch then materializes a copy that includes its own
    // worktree record (the candidate describes itself), and starts zero
    // commits behind the main line instead of one. A worktree-add failure
    // after the commit leaves a record whose path is missing — legible in
    // `worktree list` and converged by re-running this verb (§6).
    await withStoreLock(root, `worktree create ${taskCode}`, async () => {
      await writeDocument(root, recordType, {
        data: record,
        body:
          `Worktree of the workspace's own repository on branch \`${branch}\`, occupied for ` +
          `task \`${task.record.code}\` — the stewardship case: its changes reach the ` +
          "workspace's main line only through the gated merge (`ward workspace merge`).",
      });
      commitRecords(root, `Create stewardship worktree ${branch} for task ${taskCode}`, task.dir);
    });
  }
  // Establish (or re-establish) the worktree: a branch that already exists is
  // checked out where it stands — its commits are work, never recreated. A
  // stale registration left by a hand-deleted directory is pruned first.
  git(root, 'worktree', 'prune');
  const branchExists =
    git(root, 'rev-parse', '--verify', '--quiet', `refs/heads/${record.branch}`).exitCode === 0;
  const args = branchExists
    ? ['worktree', 'add', join(root, record.path), record.branch]
    : ['worktree', 'add', '-b', record.branch, join(root, record.path), mainLine];
  const result = git(root, ...args);
  if (result.exitCode !== 0) {
    throw new WardError(`git worktree add failed: ${result.stderr.trim()}`);
  }
  return { task, record };
}

// -- rebase ---------------------------------------------------------------
// The other half of the freshening toil (design/0011-worktree-rebase/):
// bring a task's worktrees up to date with their repository's main line.
// Rebase, not merge — task branches stay linear atop main and reach it only
// through a PR. Pure git on the worktree; no workspace record changes.

export type RebaseOutcome = 'rebased' | 'current' | 'dirty' | 'conflict' | 'failed';

export interface RebaseReport {
  readonly record: WorktreeRecord;
  readonly outcome: RebaseOutcome;
  readonly detail: string;
}

export async function rebaseTaskWorktrees(
  root: string,
  taskCode: string,
): Promise<{ task: FoundTask; reports: RebaseReport[] }> {
  const task = await resolveOpenTask(root, taskCode);
  const refreshed = new Map<string, RefreshReport>();
  const reports: RebaseReport[] = [];
  for (const record of await readTaskWorktrees(root, task.dir)) {
    reports.push(await rebaseOne(root, record, refreshed));
  }
  return { task, reports };
}

async function rebaseOne(
  root: string,
  record: WorktreeRecord,
  refreshed: Map<string, RefreshReport>,
): Promise<RebaseReport> {
  const worktree = join(root, record.path);
  if (!existsSync(worktree)) {
    return {
      record,
      outcome: 'failed',
      detail: 'worktree is missing on disk — recreate it with: ward worktree create',
    };
  }
  // The fail-safe first, before any other work: evidence of unrecorded work
  // is occupancy, whatever the record says (intent/01-concepts/03-work-lifecycle.md).
  if (git(worktree, 'status', '--porcelain').stdout.trim() !== '') {
    return { record, outcome: 'dirty', detail: 'uncommitted changes — refusing to touch it' };
  }
  // Rebase only the branch the record claims (§16): anything else checked
  // out here is drift this verb must not compound.
  const current = git(worktree, 'symbolic-ref', '--short', 'HEAD').stdout.trim();
  if (current !== record.branch) {
    return {
      record,
      outcome: 'failed',
      detail: `checked out '${current || '(detached)'}' where the record names '${record.branch}' — refusing to rebase`,
    };
  }
  // The rebase target. For a registered repository, the canonical checkout
  // learns the tip first — the same refresh worktree creation runs; worktrees
  // share the repository's object store, so a refreshed origin/<mainLine> is
  // current here too, and a refresh that refuses or fails refuses the rebase
  // rather than rebasing onto a stale tip. The workspace's own repository
  // needs no refresh — the root checkout IS its current main line, one object
  // store away — so the target is that branch itself
  // (design/0019-stewardship-worktrees/).
  let target: string;
  if (record.repo === undefined) {
    target = workspaceMainLine(root);
  } else {
    const refresh = await refreshRepo(root, record.repo, refreshed);
    if (refresh.outcome === 'dirty' || refresh.outcome === 'failed') {
      const why =
        refresh.outcome === 'dirty'
          ? `repos/${record.repo} is dirty — the canonical checkout is never worked in directly; clean it first`
          : `cannot refresh repos/${record.repo}: ${refresh.detail}`;
      return { record, outcome: 'failed', detail: why };
    }
    const mainLine = (await readDocument(root, repositoryRecordType(record.repo))).data.mainLine;
    target = `origin/${mainLine}`;
  }
  if (git(worktree, 'merge-base', '--is-ancestor', target, 'HEAD').exitCode === 0) {
    return { record, outcome: 'current', detail: `already atop ${target}` };
  }
  const before = git(worktree, 'rev-parse', '--short', 'HEAD').stdout.trim();
  const rebase = git(worktree, 'rebase', target);
  if (rebase.exitCode !== 0) {
    // Never resolve, never leave a tree mid-rebase: name what conflicted,
    // abort, and hand back the worktree exactly as found.
    const conflicted = git(worktree, 'diff', '--name-only', '--diff-filter=U')
      .stdout.trim()
      .split('\n')
      .filter((line) => line !== '');
    gitOrThrow(worktree, 'rebase', '--abort');
    const what =
      conflicted.length > 0 ? `conflicts in: ${conflicted.join(', ')}` : rebase.stderr.trim();
    return {
      record,
      outcome: 'conflict',
      detail: `${what} — aborted, the worktree is exactly as it was`,
    };
  }
  const after = git(worktree, 'rev-parse', '--short', 'HEAD').stdout.trim();
  return {
    record,
    outcome: 'rebased',
    detail: `${before} → ${after} onto ${target}${pushHint(worktree, record.branch)}`,
  };
}

async function refreshRepo(
  root: string,
  name: string,
  cache: Map<string, RefreshReport>,
): Promise<RefreshReport> {
  const cached = cache.get(name);
  if (cached !== undefined) return cached;
  let report: RefreshReport;
  try {
    report = (await refreshRepositories(root, name))[0] ?? {
      name,
      outcome: 'failed',
      detail: 'refresh produced no report',
    };
  } catch (error) {
    report = { name, outcome: 'failed', detail: (error as Error).message };
  }
  cache.set(name, report);
  return report;
}

/**
 * A rebase rewrites history, so a branch already published now differs from
 * its remote. Pushing is the worker's act, not this verb's (§17, §18) — the
 * report names the exact command instead of running it.
 */
function pushHint(worktree: string, branch: string): string {
  const remote = git(worktree, 'rev-parse', '--verify', '--quiet', `refs/remotes/origin/${branch}`);
  if (remote.exitCode !== 0) return '';
  const head = git(worktree, 'rev-parse', 'HEAD').stdout.trim();
  if (remote.stdout.trim() === head) return '';
  return `; origin/${branch} differs — push with: git push --force-with-lease`;
}

export async function readTaskWorktrees(root: string, taskDir: string): Promise<WorktreeRecord[]> {
  const dir = join(root, taskDir, 'worktrees');
  if (!existsSync(dir)) return [];
  const records: WorktreeRecord[] = [];
  for (const file of readdirSync(dir)
    .filter((name) => name.endsWith('.md'))
    .sort()) {
    const type = worktreeRecordType(taskDir, file.slice(0, -3));
    records.push((await readDocument(root, type)).data);
  }
  return records;
}

// -- freshness --------------------------------------------------------------
// The glance the rebase verb answers to (design/0016-worktree-freshness/):
// which worktrees are behind the main line, which are clean — derived at read
// time, never stored (§17). LOCAL git reads only: worktrees are worktrees of
// the canonical checkout and share its object store and refs, so
// origin/<mainLine> is readable here with zero network — which makes the
// answer exactly as fresh as the last `ward repo refresh`, and status (the
// high-frequency glance) affords it (§20: precision is a cost decision).

export type WorktreeFreshness = 'current' | 'behind' | 'dirty' | 'drifted' | 'unreadable';

export interface WorktreeStatus {
  readonly record: WorktreeRecord;
  /** Present exactly when local git could be asked (the availability convention). */
  readonly freshness?: WorktreeFreshness;
  /** Commits origin/<mainLine> holds that the worktree lacks — present exactly when behind. */
  readonly behindBy?: number;
  /** The branch actually checked out — present exactly when drifted onto another branch. */
  readonly checkedOut?: string;
  /** The honest phrase behind the verdict — present with freshness. */
  readonly detail?: string;
}

/**
 * Whether the git this module would spawn actually exists: Bun.which reads
 * the process's original environment, while git() spawns with the runtime
 * env — passing PATH explicitly keeps the guard and the guarded spawn in
 * agreement (and testable the same way the hermetic git pins are).
 */
function gitOnPath(): boolean {
  return Bun.which('git', { PATH: process.env.PATH ?? '' }) !== null;
}

/** One task's worktrees with their freshness, in record order. A read: mutates nothing. */
export async function worktreeStatuses(root: string, taskDir: string): Promise<WorktreeStatus[]> {
  const withGit = gitOnPath();
  const statuses: WorktreeStatus[] = [];
  for (const record of await readTaskWorktrees(root, taskDir)) {
    // Without git the rows keep their record identity and the freshness
    // fields vanish — degraded honestly, not failed (§20).
    statuses.push(withGit ? await freshnessOf(root, record) : { record });
  }
  return statuses;
}

async function freshnessOf(root: string, record: WorktreeRecord): Promise<WorktreeStatus> {
  const worktree = join(root, record.path);
  if (!existsSync(worktree)) {
    return { record, freshness: 'unreadable', detail: 'unreadable (missing on disk)' };
  }
  const tree = git(worktree, 'status', '--porcelain');
  if (tree.exitCode !== 0) {
    return { record, freshness: 'unreadable', detail: `unreadable (${tree.stderr.trim()})` };
  }
  // Occupancy first, the same order the toil checks it (0011): uncommitted
  // changes are evidence of unrecorded work, and a behind-count under them
  // would invite the very rebase the fail-safe refuses — the occupancy is
  // the fact worth reporting (intent/01-concepts/03-work-lifecycle.md).
  if (tree.stdout.trim() !== '') {
    return {
      record,
      freshness: 'dirty',
      detail: 'dirty (uncommitted changes — treated as occupied)',
    };
  }
  // The record claims the branch (§16); anything else checked out is drift
  // the freshness question must not paper over with a number.
  const head = git(worktree, 'symbolic-ref', '--short', 'HEAD');
  const checkedOut = head.exitCode === 0 ? head.stdout.trim() : '';
  if (checkedOut !== record.branch) {
    return {
      record,
      freshness: 'drifted',
      ...(checkedOut === '' ? {} : { checkedOut }),
      detail:
        `drifted (checked out ${checkedOut === '' ? 'a detached HEAD' : `'${checkedOut}'`} ` +
        `where the record names '${record.branch}')`,
    };
  }
  // The comparison target: origin/<mainLine> for a registered repository (as
  // fresh as the last `repo refresh`); for the workspace's own repository the
  // root checkout is the main line itself, always current by construction
  // (design/0019-stewardship-worktrees/).
  let target: string;
  if (record.repo === undefined) {
    try {
      target = workspaceMainLine(root);
    } catch (error) {
      return {
        record,
        freshness: 'unreadable',
        detail: `unreadable (${(error as Error).message})`,
      };
    }
  } else {
    if (!existsSync(join(root, repositoryRecordType(record.repo).relPath))) {
      return {
        record,
        freshness: 'unreadable',
        detail: `unreadable (no repository record for '${record.repo}')`,
      };
    }
    const mainLine = (await readDocument(root, repositoryRecordType(record.repo))).data.mainLine;
    target = `origin/${mainLine}`;
  }
  const count = git(worktree, 'rev-list', '--count', `HEAD..${target}`);
  const behindBy = Number.parseInt(count.stdout.trim(), 10);
  if (count.exitCode !== 0 || Number.isNaN(behindBy)) {
    return {
      record,
      freshness: 'unreadable',
      detail: `unreadable (cannot read ${target}: ${count.stderr.trim()})`,
    };
  }
  if (behindBy > 0) {
    return {
      record,
      freshness: 'behind',
      behindBy,
      detail: `behind ${target} by ${behindBy} commit${behindBy === 1 ? '' : 's'}`,
    };
  }
  return { record, freshness: 'current', detail: `current (atop ${target})` };
}

export interface WorktreeListing {
  readonly taskCode: string;
  readonly record: WorktreeRecord;
  readonly present: boolean;
}

export async function listWorktrees(root: string): Promise<WorktreeListing[]> {
  const listings: WorktreeListing[] = [];
  for (const task of await readTasks(root)) {
    for (const record of await readTaskWorktrees(root, task.dir)) {
      listings.push({
        taskCode: task.record.code,
        record,
        present: existsSync(join(root, record.path)),
      });
    }
  }
  return listings;
}
