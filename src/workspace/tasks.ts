// The task lifecycle (design/0004-work-spine/): open → active, pause/resume,
// the PR-link set, and the close — outcome delivered|abandoned recorded at
// close, completion gated on the PR set resolved, teardown gated where it
// would destroy unmerged deliverable work (§18)
// (intent/01-concepts/03-work-lifecycle.md).
import { existsSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { teardownSession } from '../agent/host.ts';
import { WardError } from '../errors.ts';
import { type PrForgeState, prBelongsToRemote, probeForge } from '../forge/gh.ts';
import { readDocument, readDocumentSync, writeDocument } from '../store/document.ts';
import { withStoreLock } from '../store/lock.ts';
import {
  type RepositoryRecord,
  repositoryRecordType,
  type SessionRecord,
  sessionRecordType,
  type TaskRecord,
  taskRecordType,
  type WorktreeRecord,
} from '../store/types.ts';
import { nextRoom, ROOMS_PER_FLOOR, taskAddress, taskRoom } from './address.ts';
import { checkoutLabel, resolveCheckout, unboundMessage } from './checkouts.ts';
import {
  commandSucceeded,
  describeFailure,
  repositoryCommands,
  repositoryValues,
  runRepositoryCommand,
  shellWord,
} from './commands.ts';
import { git } from './git.ts';
import { taskContainer } from './projects.ts';
import { listRepositories, type RefreshReport, refreshRepositories } from './repos.ts';
import { commitRecords, type FoundTask, readTasks, requireSlug, resolveOpenTask } from './scan.ts';
import { readSessions, withEvent } from './sessions.ts';
import { resolveWorkspaceMainLine } from './steward.ts';
import {
  absentBecause,
  readTaskWorktrees,
  registeredCheckouts,
  removeOutsideLink,
  standsOutside,
  worktreeDir,
  worktreePlacement,
} from './worktrees.ts';

export interface OpenTaskOptions {
  /**
   * The floor the task opens on — REQUIRED since design/0041-ground-floor/:
   * every task lives on a floor, and a caller with nothing else to say passes
   * the ground floor (`requireGroundFloor`). It is the caller's to resolve, not
   * this module's to default, because the two callers resolve it differently:
   * the CLI weighs `--project` against repository affinity first, and the
   * derived stewardship task always takes the ground floor.
   */
  readonly floor: number;
  readonly purpose?: string;
  /**
   * The registered repositories this task touches
   * (design/0037-repo-floor-affinity/). Recorded on the task, and — when no
   * floor was named — what the floor was derived from. Validated by the
   * caller: the CLI refuses an unregistered name before anything is written.
   */
  readonly repositories?: readonly string[];
  /**
   * The stewardship act this task carries, when Ward derived the task itself
   * (design/0030-upgrade-self-service/). Never set from the CLI's `task open`:
   * the marker means "Ward built this vehicle", and only Ward's own derivation
   * may say so.
   */
  readonly stewardship?: 'upgrade' | 'reflection';
  /** The floor a reflection task reflects on (design/0069-floor-reflection/). */
  readonly reflects?: number;
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
    const task = await writeOpenedTask(root, slug, options);
    commitRecords(root, `Open task ${slug} (${taskAddress(task)})`, task.dir);
    return task;
  });
}

/**
 * Allocate a room and write the task record, without the commit: the caller
 * holds the store lock and commits what it wrote. `ward task open` commits
 * the record alone; a hand-off (design/0067-floor-dispatch/) commits it with
 * its brief and its hand-off record, so no commit holds one without the others.
 */
export async function writeOpenedTask(
  root: string,
  slug: string,
  options: OpenTaskOptions,
): Promise<FoundTask> {
  const container = await taskContainer(root, options.floor);
  // Rooms run as a per-container sequence in opening order
  // (design/0036-floor-addressed-tasks/): every floor has its own, and so
  // does the legacy bare pool, which is read but never written again
  // (design/0041-ground-floor/). The cursor is the container's most recently opened
  // task — open or closed, because the sequence is about the order rooms
  // were HANDED OUT, not about what is in flight — and it is read from the
  // records, never stored (§17).
  const own = (await readTasks(root)).filter((task) => task.dir.startsWith(`${container}/`));
  const cursor = mostRecentRoom(own);
  const room = nextRoom(
    {
      ...(cursor === undefined ? {} : { mostRecentRoom: cursor }),
      occupied: own
        .filter((task) => task.record.state !== 'closed')
        .flatMap((task) => taskRoom(task) ?? []),
    },
    // A closed task's records SURVIVE at `<code>-<slug>/`, so a free room
    // can still name a directory that is occupied, and writing there would
    // overwrite a closed task's record with a new one (§17, and the record
    // is the truth, §16). Only ever reachable when the same slug comes round
    // again, which is exactly what a DERIVED slug does
    // (design/0030-upgrade-self-service/).
    (candidate) => existsSync(join(root, `${container}/t${candidate}-${slug}`)),
  );
  if (room === 0) {
    throw new WardError(
      `floor ${options.floor} has no free room — every one of the ` +
        `${ROOMS_PER_FLOOR} rooms is held by an open task; close or pause one first`,
    );
  }
  const code = `t${room}`;
  const dir = `${container}/${code}-${slug}`;
  const record: TaskRecord = {
    type: 'task',
    code,
    slug,
    state: 'active',
    floor: options.floor,
    ...(options.purpose === undefined ? {} : { purpose: options.purpose }),
    ...(options.stewardship === undefined ? {} : { stewardship: options.stewardship }),
    ...(options.reflects === undefined ? {} : { reflects: options.reflects }),
    ...(options.repositories === undefined || options.repositories.length === 0
      ? {}
      : { repositories: [...options.repositories] }),
    prs: [],
    openedAt: new Date().toISOString(),
  };
  const address = taskAddress({ dir, record });
  await writeDocument(root, taskRecordType(dir), {
    data: record,
    body:
      `The \`${slug}\` task, addressed \`${address}\` while open — room \`${code}\` on ` +
      `floor ${options.floor}. ` +
      'Its worktree and session records nest beside this document; its status is stored here, ' +
      'at the leaf.',
  });
  return { dir, record };
}

/**
 * The room the container handed out most recently, by `openedAt` across every
 * record it holds — the cursor the next room follows. Undefined for an empty
 * container, where the sequence starts at room 1.
 */
function mostRecentRoom(tasks: readonly FoundTask[]): number | undefined {
  let latest: FoundTask | undefined;
  for (const task of tasks) {
    if (taskRoom(task) === undefined) continue;
    if (latest === undefined || task.record.openedAt > latest.record.openedAt) latest = task;
  }
  return latest === undefined ? undefined : taskRoom(latest);
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
    const verbed = state === 'paused' ? 'Pause' : 'Resume';
    commitRecords(root, `${verbed} task ${taskAddress(task)}`, task.dir);
    return { dir: task.dir, record };
  });
}

export async function addTaskPr(root: string, code: string, url: string): Promise<FoundTask> {
  return withStoreLock(root, `task pr ${code}`, async () => {
    const task = await resolveOpenTask(root, code);
    if (task.record.prs.includes(url)) return task;
    const record: TaskRecord = { ...task.record, prs: [...task.record.prs, url] };
    await writeTask(root, task.dir, record);
    commitRecords(root, `Link PR to task ${taskAddress(task)}`, task.dir);
    return { dir: task.dir, record };
  });
}

/**
 * Take a pull request out of a task's PR set (design/0046-task-pr-unlink/).
 * The set is what the close reads to decide delivered or abandoned, so a PR
 * withdrawn from the work — closed on purpose, superseded by another — must be
 * removable, or a task that delivered through its other PRs can only close as
 * abandoned, a false outcome on a terminal record. The commit is the trail:
 * the journal says the PR was linked and later unlinked, and when.
 */
export async function removeTaskPr(root: string, code: string, url: string): Promise<FoundTask> {
  return withStoreLock(root, `task pr --unlink ${code}`, async () => {
    const task = await resolveOpenTask(root, code);
    if (!task.record.prs.includes(url)) {
      const set = task.record.prs.length === 0 ? 'none linked' : task.record.prs.join(', ');
      throw new WardError(
        `${taskAddress(task)} has no linked PR ${url} — its PR set: ${set} (see: ward task show ${taskAddress(task)})`,
      );
    }
    const record: TaskRecord = { ...task.record, prs: task.record.prs.filter((pr) => pr !== url) };
    await writeTask(root, task.dir, record);
    commitRecords(root, `Unlink PR from task ${taskAddress(task)}`, task.dir);
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
  // The local delivered-close gate (design/0019-stewardship-worktrees/): a
  // workspace-anchored worktree has no forge and no PR — its delivery claim
  // is verified against the workspace repository's own history, before any
  // teardown, exactly as 0012 verifies a merged PR against the main line.
  if (outcome === 'delivered') {
    for (const worktree of worktrees) {
      if (worktree.source === 'workspace') {
        steps.push(verifyWorkspaceReachability(root, worktree));
      }
    }
  }

  const record = await withStoreLock(root, `task close ${code}`, async () => {
    // Re-resolve under the lock: a concurrent close of the same code loses
    // here with the legible "no open task" refusal instead of half-applying.
    await resolveOpenTask(root, code);

    const sessions = await readSessions(root, task.dir);
    const open = sessions.filter((session) => session.state === 'open');
    const swept: SessionRecord[] = [];
    for (const session of open) {
      const closedAt = new Date().toISOString();
      // The cascade closes like `session close` does, event and all: a session
      // swept up by its task's close is still a session that closed, and the
      // trail must say so (design/0029-launched-sessions/).
      const closed: SessionRecord = withEvent(
        { ...session, state: 'closed', closedAt },
        { event: 'closed', at: closedAt },
      );
      await writeDocument(root, sessionRecordType(task.dir, session.id), {
        data: closed,
        body: `Session \`${session.id}\` of task \`${task.record.code}\`.`,
      });
      swept.push(closed);
    }
    steps.push({
      step: 'sessions',
      detail: open.length === 0 ? 'none open' : `closed ${open.map((s) => s.id).join(', ')}`,
    });

    for (const worktree of worktrees) {
      steps.push(await removeWorktree(root, task, worktree, outcome));
    }
    if (worktrees.length === 0) steps.push({ step: 'worktrees', detail: 'none to tear down' });

    const closedRecord: TaskRecord = {
      ...task.record,
      state: 'closed',
      outcome,
      closedAt: new Date().toISOString(),
    };
    await writeTask(root, task.dir, closedRecord);
    commitRecords(root, `Close task ${taskAddress(task)} (${outcome})`, task.dir);
    steps.push({ step: 'record', detail: `closed with outcome ${outcome}` });
    // A swept session whose latest run was placed in a detached host has its
    // own window ended, as `session close` would — record first, window second
    // (design/0031-detached-session-hosting/).
    for (const closed of swept) {
      const teardown = await teardownSession(root, { scopeDir: task.dir, record: closed });
      if (teardown !== undefined) {
        steps.push({ step: 'live windows', detail: `${closed.id}: ${teardown.detail}` });
      }
    }
    return closedRecord;
  });

  for (const worktree of worktrees) {
    // The workspace's own repository has no canonical checkout to refresh —
    // the root already is its current main line.
    if (worktree.repo === undefined) continue;
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
  const canonical = resolveCheckout(root, repo.name).path;
  const reachable =
    canonical !== undefined &&
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
      detail: `${pr.url} — cannot refresh ${checkoutLabel(root, repo.name)} (${refresh.detail}); reachability unverifiable — ${TRUST}`,
    };
  }
  throw new WardError(
    `${pr.url} is merged, but its merge commit ${short} is not reachable from ${target} in ` +
      `${checkoutLabel(root, repo.name)} — it merged into a base branch that never reached the main line, so a ` +
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

// -- workspace-anchored reachability (design/0019-stewardship-worktrees/) --

/**
 * The delivered close of a stewardship worktree asserts what every delivered
 * close asserts — the work reached the main line — and verifies it against
 * the workspace repository's own history rather than any forge's word
 * (intent/01-concepts/06-workspace-lifecycle.md, completion verified on the
 * workspace's own main line). Unlike the forge path there is no trust to
 * degrade to: the repository is the workspace itself, always local, so the
 * question is always answerable — a tip that has not reached the main line
 * refuses, before any teardown, with the landing verb as the remedy.
 */
function verifyWorkspaceReachability(root: string, worktree: WorktreeRecord): CloseStep {
  const step = 'reachability';
  // Resolved through the recorded name (0020): a drifted root must not make
  // "reached the main line" mean "reached whatever branch the root is on".
  const mainLine = resolveWorkspaceMainLine(root);
  const branchRef = git(root, 'rev-parse', '--verify', '--quiet', `refs/heads/${worktree.branch}`);
  let tip: string;
  if (branchRef.exitCode === 0) {
    tip = branchRef.stdout.trim();
  } else if (existsSync(worktreeDir(root, worktree))) {
    // The branch ref is gone but the worktree still stands (a detached copy):
    // what teardown would destroy is its HEAD, so that is what must be proven.
    tip = git(worktreeDir(root, worktree), 'rev-parse', 'HEAD').stdout.trim();
  } else {
    return {
      step,
      detail:
        `branch '${worktree.branch}' no longer exists and ${worktree.path} is gone — ` +
        'nothing left to verify',
    };
  }
  const short = tip.slice(0, 7);
  if (git(root, 'merge-base', '--is-ancestor', tip, mainLine).exitCode === 0) {
    return {
      step,
      detail:
        `branch '${worktree.branch}' (tip ${short}) reaches ${mainLine} ` +
        "in the workspace's own history",
    };
  }
  throw new WardError(
    `branch '${worktree.branch}' has not reached the workspace's main line — its tip ${short} ` +
      `is not an ancestor of ${mainLine}, so a delivered close would tear down ` +
      `${worktree.path} and strand the work. Land it first: ward workspace merge ` +
      `${worktree.branch} — or close with --outcome abandoned to discard it.`,
  );
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
  const absolute = worktreeDir(root, worktree);
  if (!existsSync(absolute)) return;
  if (git(absolute, 'status', '--porcelain').stdout.trim() !== '') {
    throw new WardError(
      `${worktree.path} has uncommitted changes — commit or discard them, ` +
        'or close with --outcome abandoned to discard the worktree',
    );
  }
  // A workspace-anchored worktree's delivery question is owned by the
  // reachability gate (verifyWorkspaceReachability) — stronger than the
  // ahead-of-main heuristic, and never forge-shaped.
  if (worktree.repo === undefined) return;
  if (task.prs.length === 0 && aheadOfMain(root, worktree.repo, worktree.branch)) {
    throw new WardError(
      `${worktree.path} holds commits that never reached a PR — open one and link it ` +
        '(ward task pr), or close with --outcome abandoned to discard them',
    );
  }
}

/**
 * Tear one worktree down. Teardown speaks to the repository the worktree is
 * of: the canonical checkout for a registered one, the workspace root itself
 * for the stewardship case (design/0019-stewardship-worktrees/). A
 * repository's own removal command runs in place of `git worktree remove`
 * when this machine names one (design/0065-external-checkouts-and-repo-commands/);
 * with none, git removes it wherever it stands — a worktree a custom command
 * made is still a git worktree of the canonical checkout, which is the
 * contract that lets it be removed without knowing how it was made.
 */
async function removeWorktree(
  root: string,
  task: FoundTask,
  worktree: WorktreeRecord,
  outcome: Outcome,
): Promise<CloseStep> {
  const step = `worktree ${worktree.path}`;
  const absolute = worktreeDir(root, worktree);
  const canonical = worktree.repo === undefined ? root : resolveCheckout(root, worktree.repo).path;
  const outside = standsOutside(worktree);
  // The floor's link onto an outside worktree goes with it — or stays, with
  // the worktree, when it stands on another machine.
  const unlink = (): void => {
    if (outside) removeOutsideLink(root, worktreePlacement(task, worktree.branch), absolute);
  };
  if (!existsSync(absolute)) {
    const absent = await absentBecause(worktree);
    if (absent !== undefined) {
      return {
        step,
        detail:
          `stands on machine '${absent.elsewhere}' — not removed from here; remove it there ` +
          `(git worktree remove ${shellWord(worktree.path)})`,
      };
    }
    if (canonical !== undefined && existsSync(canonical)) git(canonical, 'worktree', 'prune');
    unlink();
    return { step, detail: 'already gone' };
  }
  if (canonical === undefined) {
    throw new WardError(
      `cannot remove ${worktree.path}: ${unboundMessage(worktree.repo ?? '')}, then close`,
    );
  }
  const remove =
    worktree.repo === undefined
      ? undefined
      : (await repositoryCommands(worktree.repo)).worktree?.remove;
  if (remove !== undefined && worktree.repo !== undefined) {
    // The path is about to be handed to somebody's tool, and it comes from a
    // record a pull can rewrite: it is given only what git itself lists as a
    // worktree of this checkout.
    const known = (registeredCheckouts(canonical) ?? []).some(
      (checkout) =>
        !checkout.prunable &&
        existsSync(checkout.path) &&
        realpathSync(checkout.path) === realpathSync(absolute),
    );
    if (!known) {
      throw new WardError(
        `cannot remove ${worktree.path}: it is not a worktree of ` +
          `${checkoutLabel(root, worktree.repo)} that git knows, so the removal command is not ` +
          'run on it — remove the directory by hand if it should go, then close',
      );
    }
    const repo = readDocumentSync(root, repositoryRecordType(worktree.repo)).data;
    const run = await runRepositoryCommand(
      'worktree.remove',
      remove,
      {
        ...repositoryValues(root, repo, canonical),
        task: taskAddress(task),
        branch: worktree.branch,
        path: absolute,
        outcome,
      },
      canonical,
    );
    if (!commandSucceeded(run)) {
      throw new WardError(
        `cannot remove ${worktree.path}: the removal command failed — ${describeFailure(run)}`,
      );
    }
    // The command's word is not taken for it: the directory is looked at.
    if (existsSync(absolute)) {
      throw new WardError(
        `cannot remove ${worktree.path}: the removal command exited 0 but the directory is ` +
          'still there — a removal command must remove the worktree it is given ({path})',
      );
    }
    git(canonical, 'worktree', 'prune');
    unlink();
    return {
      step,
      detail:
        outcome === 'abandoned'
          ? 'discarded by the removal command'
          : 'removed by the removal command',
    };
  }
  const args =
    outcome === 'abandoned'
      ? ['worktree', 'remove', '--force', absolute]
      : ['worktree', 'remove', absolute];
  const result = git(canonical, ...args);
  if (result.exitCode !== 0) {
    throw new WardError(`cannot remove ${worktree.path}: ${result.stderr.trim()}`);
  }
  unlink();
  return { step, detail: outcome === 'abandoned' ? 'discarded' : 'removed' };
}

/**
 * Whether the branch holds commits the main line lacks. A contained checkout
 * stands on its main line, kept there by registration and refresh, so its
 * HEAD is the comparison. An external checkout stands wherever its owner left
 * it, so the comparison is the ref Ward keeps current there:
 * origin/<mainLine>, by the record
 * (design/0065-external-checkouts-and-repo-commands/).
 */
function aheadOfMain(root: string, repo: string, branch: string): boolean {
  const checkout = resolveCheckout(root, repo);
  if (checkout.path === undefined) return false;
  const mainLine = checkout.external
    ? `origin/${readDocumentSync(root, repositoryRecordType(repo)).data.mainLine}`
    : git(checkout.path, 'symbolic-ref', '--short', 'HEAD').stdout.trim();
  const count = git(checkout.path, 'rev-list', '--count', `${mainLine}..${branch}`);
  return count.exitCode === 0 && Number.parseInt(count.stdout.trim(), 10) > 0;
}

async function writeTask(root: string, dir: string, record: TaskRecord): Promise<void> {
  const existing = await readDocument(root, taskRecordType(dir));
  await writeDocument(root, taskRecordType(dir), { data: record, body: existing.body });
}
