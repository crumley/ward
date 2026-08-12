// The task lifecycle (design/0004-work-spine/): open → active, pause/resume,
// the PR-link set, and the close — outcome delivered|abandoned recorded at
// close, completion gated on the PR set resolved, teardown gated where it
// would destroy unmerged deliverable work (§18)
// (intent/01-concepts/03-work-lifecycle.md).
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { WardError } from '../errors.ts';
import { type PrForgeState, prBelongsToRemote, probeForge } from '../forge/gh.ts';
import { readDocument, writeDocument } from '../store/document.ts';
import { withStoreLock } from '../store/lock.ts';
import {
  type RepositoryRecord,
  type SessionRecord,
  sessionRecordType,
  type TaskRecord,
  taskRecordType,
  type WorktreeRecord,
} from '../store/types.ts';
import { git } from './git.ts';
import { taskContainer } from './projects.ts';
import {
  checkoutPath,
  listRepositories,
  type RefreshReport,
  refreshRepositories,
} from './repos.ts';
import {
  commitRecords,
  type FoundTask,
  readTasks,
  requireSlug,
  resolveOpenTask,
  smallestFree,
} from './scan.ts';
import { readSessions } from './sessions.ts';
import { readTaskWorktrees } from './worktrees.ts';

export interface OpenTaskOptions {
  readonly floor?: number;
  readonly purpose?: string;
}

export async function openTask(
  root: string,
  slugInput: string,
  options: OpenTaskOptions,
): Promise<FoundTask> {
  const slug = requireSlug(slugInput);
  // The code-allocation scan through the commit is the serialized critical
  // section (§17): two concurrent opens must not both read the same free
  // code, and their commits must not race (design/0013-telemetry-and-serialized-writes/).
  return withStoreLock(root, `task open ${slug}`, async () => {
    const container = await taskContainer(root, options.floor);
    const openCodes = (await readTasks(root))
      .filter((task) => task.record.state !== 'closed')
      .map((task) => Number.parseInt(task.record.code.replace(/^t/, ''), 10))
      .filter((code) => !Number.isNaN(code));
    const code = `t${smallestFree(openCodes)}`;
    const dir = `${container}/${code}-${slug}`;
    const record: TaskRecord = {
      type: 'task',
      code,
      slug,
      state: 'active',
      ...(options.floor === undefined ? {} : { floor: options.floor }),
      ...(options.purpose === undefined ? {} : { purpose: options.purpose }),
      prs: [],
      openedAt: new Date().toISOString(),
    };
    await writeDocument(root, taskRecordType(dir), {
      data: record,
      body:
        `The \`${slug}\` task, addressed by its bare code \`${code}\` while open. Its worktree ` +
        'and session records nest beside this document; its status is stored here, at the leaf.',
    });
    commitRecords(root, `Open task ${slug} (${code})`, dir);
    return { dir, record };
  });
}

export async function setTaskState(
  root: string,
  code: string,
  state: 'active' | 'paused',
): Promise<FoundTask> {
  const verb = state === 'paused' ? 'pause' : 'resume';
  return withStoreLock(root, `task ${verb} ${code}`, async () => {
    const task = await resolveOpenTask(root, code);
    if (task.record.state === state) return task;
    const record: TaskRecord = { ...task.record, state };
    await writeTask(root, task.dir, record);
    commitRecords(root, `${state === 'paused' ? 'Pause' : 'Resume'} task ${code}`, task.dir);
    return { dir: task.dir, record };
  });
}

export async function addTaskPr(root: string, code: string, url: string): Promise<FoundTask> {
  return withStoreLock(root, `task pr ${code}`, async () => {
    const task = await resolveOpenTask(root, code);
    if (task.record.prs.includes(url)) return task;
    const record: TaskRecord = { ...task.record, prs: [...task.record.prs, url] };
    await writeTask(root, task.dir, record);
    commitRecords(root, `Link PR to task ${code}`, task.dir);
    return { dir: task.dir, record };
  });
}

// -- close ----------------------------------------------------------------

export type Outcome = 'delivered' | 'abandoned';

export interface CloseStep {
  readonly step: string;
  readonly detail: string;
}

export interface CloseReport {
  readonly task: FoundTask;
  readonly outcome: Outcome;
  readonly steps: readonly CloseStep[];
}

export async function closeTask(
  root: string,
  code: string,
  outcome: Outcome,
): Promise<CloseReport> {
  const task = await resolveOpenTask(root, code);
  const steps: CloseStep[] = [];

  // Every gate is checked before anything mutates: a refused close must
  // leave the task exactly as it found it, or retrying it closes less than
  // the first attempt did (§6 — the only safe operation repeats cleanly).
  // The gates run outside the store lock — they are read-only and may wait
  // on the forge — so the lock covers only the brief mutate-and-commit span.
  steps.push(...(await resolvePrSet(root, task.record, outcome)));
  const worktrees = await readTaskWorktrees(root, task.dir);
  for (const worktree of worktrees) {
    validateTeardown(root, task.record, worktree, outcome);
  }

  const record = await withStoreLock(root, `task close ${code}`, async () => {
    // Re-resolve under the lock: a concurrent close of the same code loses
    // here with the legible "no open task" refusal instead of half-applying.
    await resolveOpenTask(root, code);

    const sessions = await readSessions(root, task.dir);
    const open = sessions.filter((session) => session.state === 'open');
    for (const session of open) {
      const closed: SessionRecord = {
        ...session,
        state: 'closed',
        closedAt: new Date().toISOString(),
      };
      await writeDocument(root, sessionRecordType(task.dir, session.id), {
        data: closed,
        body: `Session \`${session.id}\` of task \`${task.record.code}\`.`,
      });
    }
    steps.push({
      step: 'sessions',
      detail: open.length === 0 ? 'none open' : `closed ${open.map((s) => s.id).join(', ')}`,
    });

    for (const worktree of worktrees) {
      steps.push(removeWorktree(root, worktree, outcome));
    }
    if (worktrees.length === 0) steps.push({ step: 'worktrees', detail: 'none to tear down' });

    const closedRecord: TaskRecord = {
      ...task.record,
      state: 'closed',
      outcome,
      closedAt: new Date().toISOString(),
    };
    await writeTask(root, task.dir, closedRecord);
    commitRecords(root, `Close task ${code} (${outcome})`, task.dir);
    steps.push({ step: 'record', detail: `closed with outcome ${outcome}` });
    return closedRecord;
  });

  for (const worktree of worktrees) {
    await refreshRepositories(root, worktree.repo).catch(() => undefined);
  }

  return { task: { dir: task.dir, record }, outcome, steps };
}

/**
 * Completion requires the PR set resolved (every PR merged for a delivered
 * close). The forge is asked through the same probe status reads
 * (design/0009-live-forge-state/); when it cannot answer — for the whole set
 * or any one PR — the human's stated outcome is trusted and the trust is
 * reported. A delivered close then verifies each merged PR actually reached
 * the main line (design/0012-close-gate-reachability/): on a forge, "merged"
 * means merged into the PR's base, and a base that never reached the main
 * line strands the work — the one place that difference destroys a
 * deliverable is exactly here, where the answer decides teardown.
 */
async function resolvePrSet(
  root: string,
  record: TaskRecord,
  outcome: Outcome,
): Promise<CloseStep[]> {
  const step = 'pr set';
  if (record.prs.length === 0) return [{ step, detail: 'no linked PRs' }];
  const probe = await probeForge(record.prs);
  if (!probe.live) {
    return [{ step, detail: `forge unavailable — trusting the stated outcome '${outcome}'` }];
  }
  const states = record.prs.map(
    (url) => probe.states.get(url) ?? { url, state: 'unknown' as const },
  );
  if (states.some((pr) => pr.state === 'unknown')) {
    return [{ step, detail: `could not read every PR — trusting the stated outcome '${outcome}'` }];
  }
  if (states.some((pr) => pr.state === 'open')) {
    throw new WardError(
      'a linked PR is still open — merge or close it first, or pause the task instead',
    );
  }
  if (outcome === 'delivered' && states.some((pr) => pr.state !== 'merged')) {
    throw new WardError(
      'a linked PR was closed without merging — a delivered close requires every PR merged; ' +
        'use --outcome abandoned if this work is being set aside',
    );
  }
  const resolved = { step, detail: `resolved (${states.map((pr) => pr.state).join(', ')})` };
  if (outcome !== 'delivered') return [resolved];
  return [resolved, ...(await verifyMainLine(root, states))];
}

// -- main-line reachability (design/0012-close-gate-reachability/) ---------

const TRUST = "trusting the stated outcome 'delivered'";

/**
 * One step per merged PR: verify its merge commit is reachable from
 * origin/<mainLine> in the repository's canonical checkout. The precise
 * question is affordable here — the close is a low-frequency gated act whose
 * answer changes what happens next (§20) — and every unanswerable case
 * degrades honestly: the stated outcome is trusted and the trust is named,
 * the same posture as an unavailable forge. Only a *fresh* "not reachable"
 * refuses, because that is the one answer proven against the current main
 * line rather than assumed.
 */
async function verifyMainLine(root: string, prs: readonly PrForgeState[]): Promise<CloseStep[]> {
  const repositories = await listRepositories(root);
  const refreshed = new Map<string, RefreshReport>();
  const steps: CloseStep[] = [];
  for (const pr of prs) {
    steps.push(await verifyReachability(root, pr, repositories, refreshed));
  }
  return steps;
}

async function verifyReachability(
  root: string,
  pr: PrForgeState,
  repositories: readonly RepositoryRecord[],
  refreshed: Map<string, RefreshReport>,
): Promise<CloseStep> {
  const step = 'reachability';
  if (pr.mergeCommit === undefined) {
    return {
      step,
      detail: `${pr.url} — the forge reports no merge commit; cannot verify it reached the main line — ${TRUST}`,
    };
  }
  const repo = repositories.find((candidate) => prBelongsToRemote(pr.url, candidate.remote));
  if (repo === undefined) {
    return {
      step,
      detail: `${pr.url} — no registered repository matches its remote; cannot verify it reached the main line — ${TRUST}`,
    };
  }
  // Freshness first: against a stale origin/<mainLine> a landed merge reads
  // as unreachable, so the canonical checkout refreshes through the same
  // machinery worktree create and rebase use (design/0011-worktree-rebase/),
  // once per repository per close.
  const refresh = await refreshOnce(root, repo.name, refreshed);
  const fresh = refresh.outcome === 'refreshed' || refresh.outcome === 'current';
  const target = `origin/${repo.mainLine}`;
  const canonical = checkoutPath(root, repo.name);
  const reachable =
    existsSync(canonical) &&
    git(canonical, 'merge-base', '--is-ancestor', pr.mergeCommit, target).exitCode === 0;
  const short = pr.mergeCommit.slice(0, 7);
  if (reachable) {
    // Sound even when the refresh failed: the main line only gains history,
    // so an ancestor of the last-fetched tip is an ancestor of the current one.
    return { step, detail: `${pr.url} — merge commit ${short} reaches ${target} in ${repo.name}` };
  }
  if (!fresh) {
    // "Not reachable from a tip we could not refresh" proves nothing — an
    // honest "cannot verify" beats a false "unreachable" (§20).
    return {
      step,
      detail: `${pr.url} — cannot refresh repos/${repo.name} (${refresh.detail}); reachability unverifiable — ${TRUST}`,
    };
  }
  throw new WardError(
    `${pr.url} is merged, but its merge commit ${short} is not reachable from ${target} in ` +
      `repos/${repo.name} — it merged into a base branch that never reached the main line, so a ` +
      `delivered close would tear down the worktree and strand the work. Re-land it first: open ` +
      `a PR onto ${repo.mainLine} from the surviving branch (the one that received the merge) ` +
      `and merge that, then close.`,
  );
}

async function refreshOnce(
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
 * The §18 gate, checked before anything mutates: a dirty tree or, for a task
 * with no PR record, a branch ahead of the main line refuses a delivered
 * close — `--outcome abandoned` is the explicit authority that forces it.
 */
function validateTeardown(
  root: string,
  task: TaskRecord,
  worktree: WorktreeRecord,
  outcome: Outcome,
): void {
  if (outcome !== 'delivered') return;
  const absolute = join(root, worktree.path);
  if (!existsSync(absolute)) return;
  const canonical = join(root, 'repos', worktree.repo);
  if (git(absolute, 'status', '--porcelain').stdout.trim() !== '') {
    throw new WardError(
      `${worktree.path} has uncommitted changes — commit or discard them, ` +
        'or close with --outcome abandoned to discard the worktree',
    );
  }
  if (task.prs.length === 0 && aheadOfMain(canonical, worktree.branch)) {
    throw new WardError(
      `${worktree.path} holds commits that never reached a PR — open one and link it ` +
        '(ward task pr), or close with --outcome abandoned to discard them',
    );
  }
}

function removeWorktree(root: string, worktree: WorktreeRecord, outcome: Outcome): CloseStep {
  const step = `worktree ${worktree.path}`;
  const absolute = join(root, worktree.path);
  const canonical = join(root, 'repos', worktree.repo);
  if (!existsSync(absolute)) {
    git(canonical, 'worktree', 'prune');
    return { step, detail: 'already gone' };
  }
  const args =
    outcome === 'abandoned'
      ? ['worktree', 'remove', '--force', absolute]
      : ['worktree', 'remove', absolute];
  const result = git(canonical, ...args);
  if (result.exitCode !== 0) {
    throw new WardError(`cannot remove ${worktree.path}: ${result.stderr.trim()}`);
  }
  return { step, detail: outcome === 'abandoned' ? 'discarded' : 'removed' };
}

function aheadOfMain(canonical: string, branch: string): boolean {
  const mainLine = git(canonical, 'symbolic-ref', '--short', 'HEAD').stdout.trim();
  const count = git(canonical, 'rev-list', '--count', `${mainLine}..${branch}`);
  return count.exitCode === 0 && Number.parseInt(count.stdout.trim(), 10) > 0;
}

async function writeTask(root: string, dir: string, record: TaskRecord): Promise<void> {
  const existing = await readDocument(root, taskRecordType(dir));
  await writeDocument(root, taskRecordType(dir), { data: record, body: existing.body });
}
