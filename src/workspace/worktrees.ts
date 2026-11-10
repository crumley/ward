// Worktrees (design/0004-work-spine/): created off the refreshed canonical
// checkout as worktrees *of* it, so branches live in the one repository the
// record names and teardown is `git worktree remove`. Disposition is recorded
// from day one; this entry builds only `deliverable`
// (intent/01-concepts/00-domain-model.md, Anchor).
import { existsSync, readdirSync, realpathSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { WardError } from '../errors.ts';
import { readDocument, writeDocument } from '../store/document.ts';
import { withStoreLock } from '../store/lock.ts';
import {
  repositoryRecordType,
  type SessionRecord,
  type WorktreeRecord,
  worktreeRecordType,
} from '../store/types.ts';
import { taskAddress, taskFloor } from './address.ts';
import { establishFloorView, floorViewDir } from './floor-views.ts';
import { git, gitOrThrow } from './git.ts';
import { LEGACY_WORKTREES_DIR } from './layout.ts';
import { readProjects } from './projects.ts';
import { type RefreshReport, refreshRepositories } from './repos.ts';
import { commitRecords, type FoundTask, readTasks, resolveOpenTask } from './scan.ts';
// The workspace's own main line resolves through the recorded name when the
// record carries one (design/0020-deterministic-upgrade/): a root standing on
// another branch is drift, and branching, rebase, and freshness must not
// silently follow it there.
import { resolveWorkspaceMainLine } from './steward.ts';

// -- placement (design/0057-context-from-root/) ------------------------------

/**
 * Where a task's worktree on `branch` belongs: under its floor's view,
 * `floors/<N>-<slug>/<address>-<branch>`, so the path down from the workspace
 * root to it passes the floor's manifest. A legacy bare task has no floor and
 * so no view; its worktrees stay at `worktrees/<address>-<branch>` while it
 * is open. The directory name keeps the task's address (0036) — the room is
 * not in the parent directory, and a worktree a human knows by name keeps it
 * when it moves. The one function every caller asks — create, the migration,
 * restore, doctor — so none of them spells the path.
 */
export function worktreePlacement(task: FoundTask, branch: string): string {
  const name = `${taskAddress(task)}-${branch.replaceAll('/', '-')}`;
  const projectDir = taskProjectDir(task);
  if (projectDir === undefined) return `${LEGACY_WORKTREES_DIR}/${name}`;
  return `${floorViewDir(projectDir)}/${name}`;
}

/** The record directory of the floor a task sits on, `projects/<N>-<slug>`, or undefined. */
function taskProjectDir(task: FoundTask): string | undefined {
  if (taskFloor(task) === undefined) return undefined;
  const match = /^(projects\/[^/]+)\/tasks\//.exec(task.dir);
  return match?.[1];
}

/** Put the floor's view in place before a worktree is created under it. */
async function prepareFloorView(root: string, task: FoundTask): Promise<void> {
  const projectDir = taskProjectDir(task);
  if (projectDir === undefined) return;
  const project = (await readProjects(root)).find((candidate) => candidate.dir === projectDir);
  if (project !== undefined) await establishFloorView(root, project);
}

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
  // Under the task's floor (design/0057-context-from-root/); the directory
  // still carries the task's ADDRESS (design/0036-floor-addressed-tasks/).
  const path = worktreePlacement(task, branch);

  if (existsSync(join(root, recordType.relPath))) {
    const existing = (await readDocument(root, recordType)).data;
    if (existsSync(join(root, existing.path))) {
      return { task, record: existing }; // convergent: already there
    }
  }

  // Branch from current code: the refresh the cadence would have done.
  await refreshRepositories(root, repoName);
  await prepareFloorView(root, task);

  const canonical = join(root, 'repos', repoName);
  // A task worktree is always cut fresh from the main line; an existing branch
  // of the same name is never adopted (`-b` below would refuse it anyway). Say
  // so before git does, with the ways forward
  // (design/0047-stewardship-fresh-branch/).
  if (branchExists(canonical, branch)) {
    throw new WardError(
      `branch '${branch}' already exists in repos/${repoName} — a task worktree is cut fresh ` +
        `from origin/${repoRecord.mainLine} and never adopts an existing branch. If it is a ` +
        `leftover whose work has landed, delete it (git -C repos/${repoName} branch -D ` +
        `${branch}); otherwise name a fresh branch with --branch NAME.`,
    );
  }
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
        `\`${taskAddress(task)}\`. Deliverable: its changes reach the main line only through a ` +
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
  const mainLine = resolveWorkspaceMainLine(root);
  const branch = branchInput ?? (await defaultStewardshipBranch(root, task));
  const fileName = `workspace--${branch.replaceAll('/', '-')}`;
  const recordType = worktreeRecordType(task.dir, fileName);
  const path = worktreePlacement(task, branch);

  let record: WorktreeRecord;
  if (existsSync(join(root, recordType.relPath))) {
    record = (await readDocument(root, recordType)).data;
    if (existsSync(join(root, record.path))) {
      return { task, record }; // convergent: already there
    }
  } else {
    // A new stewardship worktree starts from the current main-line tip
    // (design/0047-stewardship-fresh-branch/). A derived name is never taken
    // (above); a NAMED branch that already exists is adopted only when it
    // already holds that tip — anything behind it is a leftover whose copy of
    // the record is stale, and checking it out would classify and merge
    // against history the main line has moved past.
    if (branchInput !== undefined) refuseStaleStewardshipBranch(root, branch, mainLine);
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
          `task \`${taskAddress(task)}\` — the stewardship case: its changes reach the ` +
          "workspace's main line only through the gated merge (`ward workspace merge`).",
      });
      commitRecords(root, `Create stewardship worktree ${branch} for task ${taskCode}`, task.dir);
    });
  }
  // Establish (or re-establish) the worktree: a branch that already exists is
  // checked out where it stands — its commits are work, never recreated. A
  // stale registration left by a hand-deleted directory is pruned first.
  git(root, 'worktree', 'prune');
  await prepareFloorView(root, task);
  const args = branchExists(root, record.branch)
    ? ['worktree', 'add', join(root, record.path), record.branch]
    : ['worktree', 'add', '-b', record.branch, join(root, record.path), mainLine];
  const result = git(root, ...args);
  if (result.exitCode !== 0) {
    throw new WardError(`git worktree add failed: ${result.stderr.trim()}`);
  }
  return { task, record };
}

/**
 * The branch a stewardship worktree rides when none is named
 * (design/0047-stewardship-fresh-branch/). A task that already holds a
 * workspace worktree converges on its branch — re-running the verb must find
 * the same worktree, not mint a second. Otherwise `steward/<slug>`, unless a
 * branch of that name already exists: teardown leaves merged and abandoned
 * stewardship branches behind (0019 defers pruning), and slugs repeat — every
 * upgrade task is `workspace-upgrade` — so the bare name is routinely someone
 * else's history. A taken name gets the task's address appended, and a
 * counter after that (rooms are reused once a task closes): deterministic,
 * legible in `git branch`, and always cut fresh from the main-line tip.
 */
async function defaultStewardshipBranch(root: string, task: FoundTask): Promise<string> {
  const held = (await readTaskWorktrees(root, task.dir)).find(
    (record) => record.source === 'workspace',
  );
  if (held !== undefined) return held.branch;
  const base = `steward/${task.record.slug}`;
  if (!branchExists(root, base)) return base;
  const addressed = `${base}-${taskAddress(task)}`;
  let candidate = addressed;
  for (let n = 2; branchExists(root, candidate); n++) candidate = `${addressed}-${n}`;
  return candidate;
}

/**
 * Refuses a named stewardship branch that exists but does not contain the
 * main line's tip — naming how far behind it is and the ways forward.
 */
function refuseStaleStewardshipBranch(root: string, branch: string, mainLine: string): void {
  if (!branchExists(root, branch)) return;
  if (git(root, 'merge-base', '--is-ancestor', mainLine, branch).exitCode === 0) return;
  const behind = git(root, 'rev-list', '--count', `${branch}..${mainLine}`).stdout.trim();
  throw new WardError(
    `branch '${branch}' already exists in the workspace's own repository and is ${behind} ` +
      `commit(s) behind ${mainLine} — a stewardship worktree starts from the current tip of ` +
      `${mainLine}, and adopting this branch would work against a stale copy of the record. ` +
      `If its work has landed, delete it at the workspace root (git branch -d ${branch}); if ` +
      `it holds work to keep, rebase it onto ${mainLine} first; or name a fresh branch with ` +
      '--branch NAME, or omit --branch to let Ward choose one.',
  );
}

function branchExists(dir: string, branch: string): boolean {
  return git(dir, 'rev-parse', '--verify', '--quiet', `refs/heads/${branch}`).exitCode === 0;
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
    target = resolveWorkspaceMainLine(root);
  } else {
    const refresh = await refreshRepo(root, record.repo, refreshed);
    if (
      refresh.outcome === 'dirty' ||
      refresh.outcome === 'conflicted' ||
      refresh.outcome === 'failed'
    ) {
      // A conflicted canonical checkout refuses its own refresh exactly as a
      // dirty one does (design/0023-refresh-concurrency-ux/), so its tip may
      // be stale — rebasing onto it would be rebasing onto yesterday.
      const why =
        refresh.outcome === 'dirty'
          ? `repos/${record.repo} is dirty — the canonical checkout is never worked in directly; clean it first`
          : refresh.outcome === 'conflicted'
            ? `repos/${record.repo} has unresolved conflicts — resolve them there first (${refresh.detail})`
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

/**
 * The verdict a worktree whose directory is gone carries. A named constant
 * because the next-step ladder (design/0043-task-next-surface/) matches on
 * it: a missing worktree is unreadable for a reason with its own remedy, and
 * two spellings of the same sentence would let the surfaces disagree.
 */
export const MISSING_ON_DISK = 'unreadable (missing on disk)';

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
    return { record, freshness: 'unreadable', detail: MISSING_ON_DISK };
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
      target = resolveWorkspaceMainLine(root);
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
  /** The task's full address — what Ward speaks (design/0036-floor-addressed-tasks/). */
  readonly taskAddress: string;
  readonly record: WorktreeRecord;
  readonly present: boolean;
}

export async function listWorktrees(root: string): Promise<WorktreeListing[]> {
  const listings: WorktreeListing[] = [];
  for (const task of await readTasks(root)) {
    for (const record of await readTaskWorktrees(root, task.dir)) {
      listings.push({
        taskCode: task.record.code,
        taskAddress: taskAddress(task),
        record,
        present: existsSync(join(root, record.path)),
      });
    }
  }
  return listings;
}

// -- relocation (design/0057-context-from-root/) ------------------------------
// Bringing a worktree to its placement: find where it actually is from git,
// move it there with `git worktree move`, and rewrite the record's `path`. The
// caller — the `worktree placement` step of phase 1 — holds the store lock and
// commits each task's rewrites as one journal commit. The checks run in order
// and every refusal leaves the worktree exactly where it was: the move is
// never forced, because a checkout a human has open may hold the only copy of
// some work.

/** One worktree record as it sits in its task's `worktrees/`, with its file name. */
export interface WorktreeEntry {
  readonly fileName: string;
  readonly record: WorktreeRecord;
  readonly body: string;
}

export async function readTaskWorktreeEntries(
  root: string,
  taskDir: string,
): Promise<WorktreeEntry[]> {
  const dir = join(root, taskDir, 'worktrees');
  if (!existsSync(dir)) return [];
  const entries: WorktreeEntry[] = [];
  for (const file of readdirSync(dir)
    .filter((name) => name.endsWith('.md'))
    .sort()) {
    const fileName = file.slice(0, -3);
    const document = await readDocument(root, worktreeRecordType(taskDir, fileName));
    entries.push({ fileName, record: document.data, body: document.body });
  }
  return entries;
}

/** One checkout `git worktree list --porcelain` names, its path absolute. */
export interface RegisteredCheckout {
  readonly path: string;
  /** The checked-out branch's short name; absent for a detached HEAD. */
  readonly branch?: string;
  readonly locked: boolean;
  readonly prunable: boolean;
}

/**
 * Every linked worktree registered in the repository at `repoDir` — the main
 * checkout itself excluded. Null when git cannot answer (no repository there).
 */
export function registeredCheckouts(repoDir: string): RegisteredCheckout[] | null {
  if (!existsSync(repoDir)) return null;
  const list = git(repoDir, 'worktree', 'list', '--porcelain');
  if (list.exitCode !== 0) return null;
  const blocks = list.stdout.split('\n\n').filter((block) => block.trim() !== '');
  const checkouts: RegisteredCheckout[] = [];
  for (const block of blocks.slice(1)) {
    const lines = block.split('\n');
    const path = lines.find((line) => line.startsWith('worktree '))?.slice('worktree '.length);
    if (path === undefined) continue;
    const ref = lines.find((line) => line.startsWith('branch '))?.slice('branch '.length);
    checkouts.push({
      path,
      ...(ref === undefined ? {} : { branch: ref.replace(/^refs\/heads\//, '') }),
      locked: lines.some((line) => line === 'locked' || line.startsWith('locked ')),
      prunable: lines.some((line) => line === 'prunable' || line.startsWith('prunable ')),
    });
  }
  return checkouts;
}

/** The repository a worktree record's checkout is a worktree of. */
export function sourceRepositoryDir(root: string, record: WorktreeRecord): string {
  return record.repo === undefined ? root : join(root, 'repos', record.repo);
}

/** A path git reported, made workspace-relative; undefined when it is outside the workspace. */
export function workspaceRelative(root: string, absolute: string): string | undefined {
  const base = existsSync(root) ? realpathSync(root) : resolve(root);
  const target = existsSync(absolute) ? realpathSync(absolute) : resolve(absolute);
  const rel = relative(base, target);
  if (rel.startsWith('..') || isAbsolute(rel)) return undefined;
  return rel === '' ? '.' : rel;
}

/** Whether `inner` is `outer` or lies beneath it (both workspace-relative). */
function within(inner: string, outer: string): boolean {
  return inner === outer || inner.startsWith(`${outer}/`);
}

/** The open sessions a relocation must not move a directory out from under. */
export type OpenSessionsAt = readonly Pick<SessionRecord, 'id' | 'workingDirectory'>[];

/**
 * What relocating one worktree would do, decided from the record, git, and
 * the open sessions — mutating nothing. `placed`: already there, record and
 * disk. `record`: the record alone is behind — the checkout already stands at
 * its placement (a move whose commit failed), or there is no checkout of the
 * branch here to move. `move`: a clean checkout to move. `refused`: left
 * where it is, with the reason and, where there is one, the command that
 * clears it.
 */
export type RelocationPlan =
  | { readonly kind: 'placed'; readonly placement: string }
  | { readonly kind: 'record'; readonly placement: string; readonly detail: string }
  | { readonly kind: 'move'; readonly placement: string; readonly from: string }
  | {
      readonly kind: 'refused';
      readonly placement: string;
      readonly at: string;
      readonly reason: string;
      readonly command?: string;
    };

/** One open task's worktree record — what every claim on a path is read from. */
export interface WorktreeClaim {
  readonly task: FoundTask;
  readonly record: WorktreeRecord;
}

/** Every worktree record of every task that is not closed: the paths the record claims. */
export async function openWorktreeClaims(root: string): Promise<WorktreeClaim[]> {
  const claims: WorktreeClaim[] = [];
  for (const task of await readTasks(root)) {
    if (task.record.state === 'closed') continue;
    for (const record of await readTaskWorktrees(root, task.dir)) claims.push({ task, record });
  }
  return claims;
}

/**
 * The paths one record can stand for: where it says it is, its placement,
 * and the pre-0057 spelling of the placement's name under `worktrees/` —
 * where a machine that never upgraded still has the checkout.
 */
function claimedBy(claim: WorktreeClaim): string[] {
  const placement = worktreePlacement(claim.task, claim.record.branch);
  return [claim.record.path, placement, `${LEGACY_WORKTREES_DIR}/${basename(placement)}`];
}

/**
 * The checkout git has of `record`'s branch, workspace-relative — when it is
 * this record's. Git holds a branch in at most one worktree, so there is one
 * candidate; it is refused when it stands at a path another open record
 * claims. Two open tasks can record the same branch name (a task reopened
 * as another), and the branch's one checkout then belongs to whichever task
 * stands there: taking it for the other would move one task's work under
 * another's name.
 */
export function ownCheckout(
  root: string,
  record: WorktreeRecord,
  checkouts: readonly RegisteredCheckout[],
  own: WorktreeClaim,
  claims: readonly WorktreeClaim[],
): { readonly checkout: RegisteredCheckout; readonly actual: string } | undefined {
  const found = checkouts.find(
    (checkout) => checkout.branch === record.branch && !checkout.prunable,
  );
  const actual = found === undefined ? undefined : workspaceRelative(root, found.path);
  if (found === undefined || actual === undefined) return undefined;
  if (claimedBy(own).includes(actual)) return { checkout: found, actual };
  const others = claims.filter(
    (claim) => !(claim.task.dir === own.task.dir && claim.record.path === own.record.path),
  );
  if (others.some((claim) => claimedBy(claim).includes(actual))) return undefined;
  return { checkout: found, actual };
}

export function planRelocation(
  root: string,
  task: FoundTask,
  record: WorktreeRecord,
  sessions: OpenSessionsAt,
  claims: readonly WorktreeClaim[],
): RelocationPlan {
  const placement = worktreePlacement(task, record.branch);
  const repoDir = sourceRepositoryDir(root, record);
  const checkouts = registeredCheckouts(repoDir);
  if (checkouts === null) {
    if (record.path === placement) return { kind: 'placed', placement };
    return {
      kind: 'refused',
      placement,
      at: record.path,
      reason: `repos/${record.repo ?? '?'} is not on this machine to ask where the branch is`,
      command: 'ward workspace restore',
    };
  }
  // Where the branch actually is — git's answer, never the record's.
  const found = ownCheckout(root, record, checkouts, { task, record }, claims);
  const actual = found?.actual;
  if (actual === undefined) {
    // Nothing of this branch is checked out here. A checkout still standing at
    // the recorded path on some other branch is drift the move must not
    // compound; anything else at that path is not a checkout git knows.
    if (record.path !== placement && existsSync(join(root, record.path))) {
      return {
        kind: 'refused',
        placement,
        at: record.path,
        reason: `the checkout there is not on '${record.branch}', the branch the record names`,
      };
    }
    if (record.path === placement) return { kind: 'placed', placement };
    return {
      kind: 'record',
      placement,
      detail: `no checkout of '${record.branch}' on this machine — the record moves alone`,
    };
  }
  if (actual === placement) {
    if (record.path === placement) return { kind: 'placed', placement };
    return { kind: 'record', placement, detail: `already standing at ${placement}` };
  }
  if (existsSync(join(root, placement))) {
    return {
      kind: 'refused',
      placement,
      at: actual,
      reason: `${placement} already exists — move it aside, then upgrade again`,
    };
  }
  const refusal = moveRefusal(root, actual, record.path, sessions);
  if (refusal !== undefined) return { kind: 'refused', placement, at: actual, ...refusal };
  // A locked worktree, or one holding submodules, is refused by git itself;
  // the move reports git's own words rather than second-guessing them here.
  return { kind: 'move', placement, from: actual };
}

/**
 * Why a checkout at `actual` must not be moved now, or undefined when it may:
 * uncommitted changes (evidence of unrecorded work), or an open session whose
 * working directory lies inside it or inside the path its record names — a
 * session resumed there would land in a directory that is gone. Shared by the
 * migration and by restore's move, so the two can never disagree on what is
 * safe to move.
 */
export function moveRefusal(
  root: string,
  actual: string,
  recordPath: string,
  sessions: OpenSessionsAt,
): { readonly reason: string; readonly command?: string } | undefined {
  const tree = git(join(root, actual), 'status', '--porcelain');
  if (tree.exitCode !== 0) return { reason: `git cannot read it: ${tree.stderr.trim()}` };
  if (tree.stdout.trim() !== '') {
    return { reason: 'uncommitted changes — commit or clean them, then run it again' };
  }
  const inside = sessions.find((session) => {
    const at = workspaceRelative(root, resolve(root, session.workingDirectory));
    return at !== undefined && (within(at, actual) || within(at, recordPath));
  });
  if (inside === undefined) return undefined;
  return {
    reason: `open session ${inside.id} works inside it — close it or let it finish, then run it again`,
    command: `ward session close ${inside.id}`,
  };
}

/**
 * Move a checkout from `from` to `to` (both workspace-relative) with `git
 * worktree move`, run from its source repository, creating the parent first.
 * Returns git's refusal in its own words, or undefined on success.
 */
export async function moveCheckout(
  root: string,
  record: WorktreeRecord,
  from: string,
  to: string,
): Promise<string | undefined> {
  await mkdir(dirname(join(root, to)), { recursive: true });
  const move = git(
    sourceRepositoryDir(root, record),
    'worktree',
    'move',
    join(root, from),
    join(root, to),
  );
  if (move.exitCode === 0) return undefined;
  return `git refused to move it: ${move.stderr.trim().replace(/^fatal: /, '')}`;
}

/** What relocating one worktree did. */
export type RelocationOutcome =
  | { readonly kind: 'placed'; readonly path: string }
  | {
      readonly kind: 'moved';
      readonly from: string;
      readonly path: string;
      /** The record file rewritten — absent when the record already said `path`. */
      readonly relPath?: string;
    }
  | {
      readonly kind: 'recorded';
      readonly path: string;
      readonly relPath: string;
      readonly detail: string;
    }
  | {
      readonly kind: 'refused';
      readonly at: string;
      readonly reason: string;
      readonly command?: string;
    };

/**
 * Relocate one worktree: plan, then move with `git worktree move` from its
 * source repository, then rewrite the record's `path` — no commit, which is
 * the caller's (one per task, under the lock it holds). If the move succeeds
 * and the caller's commit then fails, the next run finds the checkout at its
 * placement and the record behind, and finishes the update (`record`).
 */
export async function relocateWorktree(
  root: string,
  task: FoundTask,
  entry: WorktreeEntry,
  sessions: OpenSessionsAt,
  claims: readonly WorktreeClaim[],
): Promise<RelocationOutcome> {
  const plan = planRelocation(root, task, entry.record, sessions, claims);
  switch (plan.kind) {
    case 'placed':
      return { kind: 'placed', path: plan.placement };
    case 'refused':
      return {
        kind: 'refused',
        at: plan.at,
        reason: plan.reason,
        ...(plan.command === undefined ? {} : { command: plan.command }),
      };
    case 'record':
      return {
        kind: 'recorded',
        path: plan.placement,
        relPath: (await rewriteWorktreePath(root, task, entry, plan.placement)) ?? '',
        detail: plan.detail,
      };
    case 'move': {
      const refused = await moveCheckout(root, entry.record, plan.from, plan.placement);
      if (refused !== undefined) return { kind: 'refused', at: plan.from, reason: refused };
      const relPath = await rewriteWorktreePath(root, task, entry, plan.placement);
      return {
        kind: 'moved',
        from: plan.from,
        path: plan.placement,
        ...(relPath === undefined ? {} : { relPath }),
      };
    }
  }
}

async function rewriteWorktreePath(
  root: string,
  task: FoundTask,
  entry: WorktreeEntry,
  path: string,
): Promise<string | undefined> {
  if (entry.record.path === path) return undefined; // a second machine: the record already moved
  const type = worktreeRecordType(task.dir, entry.fileName);
  await writeDocument(root, type, { data: { ...entry.record, path }, body: entry.body });
  return type.relPath;
}
