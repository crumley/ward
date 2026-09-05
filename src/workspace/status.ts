// Derived status (design/0004-work-spine/): recorded at the leaves, derived
// above, progress-biased — any child that can still move forward makes the
// container active; an empty container is active; in-review is an overlay
// computed from the PR set, never stored
// (intent/01-concepts/00-domain-model.md, Status). Since
// design/0009-live-forge-state/ the overlay reads the forge live when it
// answers: in-review means ≥1 OPEN PR (intent's exact rule) rather than the
// has-linked-PRs approximation, and the report carries the derived `needs
// you` items — nothing stored either way.
import type { PrForgeState } from '../forge/gh.ts';
import { type ForgeProbe, prBelongsToRemote, probeForge } from '../forge/gh.ts';
import type { ProjectRecord, RepositoryRecord, TaskRecord, WorkState } from '../store/types.ts';
import { taskAddress } from './address.ts';
import { type FoundProject, readProjects } from './projects.ts';
import { listRepositories } from './repos.ts';
import { type FoundTask, readTasks } from './scan.ts';
import { readSessions } from './sessions.ts';
import { type WorktreeStatus, worktreeStatuses } from './worktrees.ts';

/**
 * How long closed work stays on the glanceable surfaces
 * (design/0036-floor-addressed-tasks/). A week is the span over which "what
 * did I just finish?" is still a live question — a Monday still sees the
 * previous Monday's deliveries — and after which a closed task is history to
 * be queried, not attention to be spent. A named constant, not
 * configuration: the window is a property of the attention surface, and a
 * knob would only ask the human to decide something the surface can decide
 * for them (the prime directive). `--all` is the escape hatch, always.
 */
export const SETTLED_AFTER_DAYS = 7;

const SETTLED_AFTER_MS = SETTLED_AFTER_DAYS * 24 * 60 * 60 * 1000;

/**
 * Whether an instant is older than the window. An absent or unparseable
 * timestamp is NOT settled: hiding a record because its date could not be
 * read would drop work from the surface on the strength of a parse failure.
 */
export function settled(at: string | undefined, now: number = Date.now()): boolean {
  if (at === undefined) return false;
  const instant = Date.parse(at);
  return !Number.isNaN(instant) && now - instant > SETTLED_AFTER_MS;
}

/** A closed task whose close is older than the window — off the glance, still on the record. */
export function settledTask(record: TaskRecord, now: number = Date.now()): boolean {
  return record.state === 'closed' && settled(record.closedAt, now);
}

/**
 * A floor that has settled: it is closed, or every task it holds is — and the
 * newest of those closes (or its own) is older than the window. A floor with
 * no tasks at all never settles on its own: an empty container is `active`
 * (the derivation rule), and a freshly opened floor waiting for its first
 * task is exactly what the human still needs to see.
 */
export function settledProject(
  record: ProjectRecord,
  tasks: readonly TaskRecord[],
  now: number = Date.now(),
): boolean {
  if (record.standing === true) return false; // the workspace's own floor never leaves the glance
  const allClosed = tasks.length > 0 && tasks.every((task) => task.state === 'closed');
  if (record.state !== 'closed' && !allClosed) return false;
  const closes = [record.closedAt, ...tasks.map((task) => task.closedAt)].filter(
    (at): at is string => at !== undefined,
  );
  if (closes.length === 0) return false;
  return settled(
    closes.reduce((newest, at) => (at > newest ? at : newest)),
    now,
  );
}

/**
 * Open work first, closed after, stable within each group: the glance reads
 * top-down from what can still move to what is finished.
 */
export function glanceOrder<T>(items: readonly T[], state: (item: T) => WorkState): T[] {
  return [
    ...items.filter((item) => state(item) !== 'closed'),
    ...items.filter((item) => state(item) === 'closed'),
  ];
}

/** The derivation rule: precedence `active ▸ paused ▸ closed`; empty is active. */
export function deriveStatus(children: readonly WorkState[]): WorkState {
  if (children.length === 0) return 'active';
  if (children.includes('active')) return 'active';
  if (children.includes('paused')) return 'paused';
  return 'closed';
}

/**
 * In-review is derived, never stored: ≥1 open PR on a non-closed task. With
 * live forge state the rule is applied exactly — cleared only when every
 * linked PR is known resolved, so an unreadable PR degrades toward the
 * approximation, never toward false certainty. Without forge state (`forge`
 * undefined) the recorded approximation stands — linked PRs on a non-closed
 * task (design/0004-work-spine/).
 */
export function inReview(task: TaskRecord, forge?: readonly PrForgeState[]): boolean {
  if (task.state === 'closed') return false;
  if (forge !== undefined) {
    return forge.some((pr) => pr.state === 'open' || pr.state === 'unknown');
  }
  return task.prs.length > 0;
}

/** Every PR URL whose live state matters: the non-closed tasks' linked sets. */
export function openPrUrls(records: readonly TaskRecord[]): string[] {
  return records.filter((record) => record.state !== 'closed').flatMap((record) => record.prs);
}

/**
 * One task's live forge states, in PR-set order — or undefined when the
 * forge did not answer, the task is closed (its set was resolved at close;
 * probing settled work spends latency for nothing), or there is nothing
 * linked.
 */
export function forgeStates(
  record: TaskRecord,
  probe: ForgeProbe,
): readonly PrForgeState[] | undefined {
  if (!probe.live || record.state === 'closed' || record.prs.length === 0) return undefined;
  return record.prs.map((url) => probe.states.get(url) ?? { url, state: 'unknown' });
}

export interface NeedsYouEntry {
  readonly task: string;
  /** The task's full address — what every human-facing line says (0036). */
  readonly address: string;
  readonly reason: 'awaiting-close' | 'changes-requested' | 'stale-base';
  /** The PR awaiting action, when the reason names one. */
  readonly pr?: string;
  /** The PR's current base branch, when the reason is stale-base. */
  readonly base?: string;
  /** The main line the base should be — the repository record's, when the reason is stale-base. */
  readonly mainLine?: string;
}

/**
 * The "what needs me?" surface (intent/02-subsystems/07-human-shell.md): the
 * unambiguous, purely derivable conditions — a fully merged PR set awaiting
 * the human's gated close (§18), an open PR with changes requested, and an
 * open PR whose base is not the repository's main line
 * (design/0014-stale-base-warning/: merged as-is it delivers into a branch
 * that may never land — the incident 0012's close gate now refuses, caught
 * here while it is still cheap to retarget). Derived from records plus live
 * forge state, nothing stored; a task with an unreadable PR never claims
 * awaiting-close (all-merged must be known, not assumed); a PR no repository
 * record can answer for, or whose base the forge did not report, warns
 * nothing — honest silence, and the close gate still backstops.
 */
export function deriveNeedsYou(
  tasks: readonly TaskStatus[],
  repositories: readonly RepositoryRecord[],
): NeedsYouEntry[] {
  const entries: NeedsYouEntry[] = [];
  for (const status of tasks) {
    const forge = status.forge;
    if (forge === undefined || forge.length === 0) continue;
    if (forge.every((pr) => pr.state === 'merged')) {
      entries.push({ task: status.task.code, address: status.address, reason: 'awaiting-close' });
      continue;
    }
    for (const pr of forge) {
      if (pr.state !== 'open') continue;
      if (pr.reviewDecision === 'changes-requested') {
        entries.push({
          task: status.task.code,
          address: status.address,
          reason: 'changes-requested',
          pr: pr.url,
        });
      }
      const stale = staleBase(pr, repositories);
      if (stale !== undefined) {
        entries.push({
          task: status.task.code,
          address: status.address,
          reason: 'stale-base',
          pr: pr.url,
          ...stale,
        });
      }
    }
  }
  return entries;
}

/**
 * An open PR's base and the main line it should be — when it verifiably is
 * not: the PR maps to a repository record (0012's URL→remote identity) and
 * its reported base differs from that repository's recorded main line. Only
 * OPEN PRs qualify (a merged PR's base is history; the close gate owns that
 * end). Undefined everywhere the question cannot be answered honestly.
 */
function staleBase(
  pr: PrForgeState,
  repositories: readonly RepositoryRecord[],
): { base: string; mainLine: string } | undefined {
  if (pr.state !== 'open' || pr.baseRefName === undefined) return undefined;
  const repo = repositories.find((record) => prBelongsToRemote(pr.url, record.remote));
  if (repo === undefined || pr.baseRefName === repo.mainLine) return undefined;
  return { base: pr.baseRefName, mainLine: repo.mainLine };
}

export interface TaskStatus {
  readonly task: TaskRecord;
  /** The derived address — `f3t22` on a floor, `t18` in the bare pool (0036). */
  readonly address: string;
  readonly inReview: boolean;
  /** Live forge state per linked PR; absent when the forge did not answer. */
  readonly forge?: readonly PrForgeState[];
  readonly openSessions: readonly string[];
  /**
   * Per-worktree freshness against the main line, derived from local git at
   * read time (design/0016-worktree-freshness/). Absent on closed tasks —
   * their worktrees were settled at the gated close, and asking again spends
   * reads on settled work (the 0009 posture, applied to git).
   */
  readonly worktrees?: readonly WorktreeStatus[];
}

export interface ProjectStatus {
  readonly project: FoundProject['record'];
  /** Derived from the project's tasks — the stored state only pauses/closes it explicitly. */
  readonly derived: WorkState;
  readonly tasks: readonly TaskStatus[];
}

/**
 * What the window took off the glance (design/0036-floor-addressed-tasks/):
 * always present, so a reader — human footer or agent — can never mistake a
 * filtered listing for the whole record. Under `--all` the counts are zero
 * and the field still stands: absent would read as "unknown", which is the
 * one thing it never is.
 */
export interface HiddenSummary {
  readonly tasks: number;
  readonly projects: number;
  readonly settledAfterDays: number;
}

export interface StatusReport {
  readonly workspace: WorkState;
  readonly projects: readonly ProjectStatus[];
  readonly bareTasks: readonly TaskStatus[];
  /** Present exactly when the forge answered — its absence marks forge state unavailable. */
  readonly needsYou?: readonly NeedsYouEntry[];
  /** What the settled-work window omitted from the listing above (0036). */
  readonly hidden: HiddenSummary;
}

export interface StatusOptions {
  /** Lift the settled-work window: show every task and every floor (0036). */
  readonly all?: boolean;
}

/**
 * The whole report. The derivation — status, in-review, needs-you, freshness
 * — runs over EVERY record, exactly as it always has; the window is applied
 * afterwards, to what is shown. A rollup that skipped settled children would
 * be a different answer to "where does everything stand", and the answer is
 * not what this entry changes.
 */
export async function statusReport(
  root: string,
  options: StatusOptions = {},
): Promise<StatusReport> {
  const tasks = await readTasks(root);
  const projects = await readProjects(root);
  const repositories = await listRepositories(root);
  const probe = await probeForge(openPrUrls(tasks.map((task) => task.record)));
  const now = Date.now();

  const projectStatuses: ProjectStatus[] = [];
  let hiddenTasks = 0;
  let hiddenProjects = 0;
  for (const project of projects) {
    const own = tasks.filter((task) => task.dir.startsWith(`${project.dir}/`));
    const derived =
      project.record.state === 'active'
        ? deriveStatus(own.map((task) => task.record.state))
        : project.record.state;
    if (
      options.all !== true &&
      settledProject(
        project.record,
        own.map((task) => task.record),
        now,
      )
    ) {
      hiddenProjects += 1;
      hiddenTasks += own.length;
      continue;
    }
    const shown = options.all === true ? own : own.filter((task) => !settledTask(task.record, now));
    hiddenTasks += own.length - shown.length;
    projectStatuses.push({
      project: project.record,
      derived,
      tasks: glanceOrder(await taskStatuses(root, shown, probe), (status) => status.task.state),
    });
  }

  const bare = tasks.filter((task) => task.dir.startsWith('tasks/'));
  const workspace = deriveStatus([
    ...projects.map((project) =>
      project.record.state === 'active'
        ? deriveStatus(
            tasks
              .filter((task) => task.dir.startsWith(`${project.dir}/`))
              .map((task) => task.record.state),
          )
        : project.record.state,
    ),
    ...bare.map((task) => task.record.state),
  ]);

  const shownBare =
    options.all === true ? bare : bare.filter((task) => !settledTask(task.record, now));
  hiddenTasks += bare.length - shownBare.length;
  const bareStatuses = glanceOrder(
    await taskStatuses(root, shownBare, probe),
    (status) => status.task.state,
  );
  const all = [...projectStatuses.flatMap((project) => project.tasks), ...bareStatuses];
  return {
    workspace,
    projects: projectStatuses,
    bareTasks: bareStatuses,
    ...(probe.live ? { needsYou: deriveNeedsYou(all, repositories) } : {}),
    hidden: { tasks: hiddenTasks, projects: hiddenProjects, settledAfterDays: SETTLED_AFTER_DAYS },
  };
}

async function taskStatuses(
  root: string,
  tasks: readonly FoundTask[],
  probe: ForgeProbe,
): Promise<TaskStatus[]> {
  const statuses: TaskStatus[] = [];
  for (const task of tasks) {
    const sessions = await readSessions(root, task.dir);
    const forge = forgeStates(task.record, probe);
    const worktrees =
      task.record.state === 'closed' ? undefined : await worktreeStatuses(root, task.dir);
    statuses.push({
      task: task.record,
      address: taskAddress(task),
      inReview: inReview(task.record, forge),
      ...(forge === undefined ? {} : { forge }),
      openSessions: sessions
        .filter((session) => session.state === 'open')
        .map((session) => session.id),
      ...(worktrees === undefined ? {} : { worktrees }),
    });
  }
  return statuses;
}
