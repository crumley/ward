// Worktrees (design/0004-work-spine/): created off the refreshed canonical
// checkout as worktrees *of* it, so branches live in the one repository the
// record names and teardown is `git worktree remove`. Disposition is recorded
// from day one; this entry builds only `deliverable`
// (intent/01-concepts/00-domain-model.md, Anchor).
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { WardError } from '../errors.ts';
import { readDocument, writeDocument } from '../store/document.ts';
import { repositoryRecordType, type WorktreeRecord, worktreeRecordType } from '../store/types.ts';
import { git, gitOrThrow } from './git.ts';
import { type RefreshReport, refreshRepositories } from './repos.ts';
import { commitRecords, type FoundTask, readTasks, resolveOpenTask } from './scan.ts';

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
  await writeDocument(root, recordType, {
    data: record,
    body:
      `Worktree of \`${repoName}\` on branch \`${branch}\`, occupied for task ` +
      `\`${task.record.code}\`. Deliverable: its changes reach the main line only through a ` +
      'pull request.',
  });
  commitRecords(root, `Create worktree ${branch} for task ${taskCode}`, task.dir);
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
  // The canonical checkout learns the tip first — the same refresh worktree
  // creation runs. Worktrees share the repository's object store, so a
  // refreshed origin/<mainLine> is current here too; a refresh that refuses
  // or fails refuses the rebase, rather than rebasing onto a stale tip.
  const refresh = await refreshRepo(root, record.repo, refreshed);
  if (refresh.outcome === 'dirty' || refresh.outcome === 'failed') {
    const why =
      refresh.outcome === 'dirty'
        ? `repos/${record.repo} is dirty — the canonical checkout is never worked in directly; clean it first`
        : `cannot refresh repos/${record.repo}: ${refresh.detail}`;
    return { record, outcome: 'failed', detail: why };
  }
  const mainLine = (await readDocument(root, repositoryRecordType(record.repo))).data.mainLine;
  const target = `origin/${mainLine}`;
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
