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
import { type ForgeProbe, probeForge } from '../forge/gh.ts';
import type { TaskRecord, WorkState } from '../store/types.ts';
import { type FoundProject, readProjects } from './projects.ts';
import { type FoundTask, readTasks } from './scan.ts';
import { readSessions } from './sessions.ts';

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
  readonly reason: 'awaiting-close' | 'changes-requested';
  /** The PR awaiting action, when the reason names one. */
  readonly pr?: string;
}

/**
 * The seed of the "what needs me?" surface
 * (intent/02-subsystems/07-human-shell.md): the two unambiguous, purely
 * derivable conditions — a fully merged PR set awaiting the human's gated
 * close (§18), and an open PR with changes requested. Derived from records
 * plus live forge state, nothing stored; a task with an unreadable PR never
 * claims awaiting-close (all-merged must be known, not assumed).
 */
export function deriveNeedsYou(tasks: readonly TaskStatus[]): NeedsYouEntry[] {
  const entries: NeedsYouEntry[] = [];
  for (const status of tasks) {
    const forge = status.forge;
    if (forge === undefined || forge.length === 0) continue;
    if (forge.every((pr) => pr.state === 'merged')) {
      entries.push({ task: status.task.code, reason: 'awaiting-close' });
      continue;
    }
    for (const pr of forge) {
      if (pr.state === 'open' && pr.reviewDecision === 'changes-requested') {
        entries.push({ task: status.task.code, reason: 'changes-requested', pr: pr.url });
      }
    }
  }
  return entries;
}

export interface TaskStatus {
  readonly task: TaskRecord;
  readonly inReview: boolean;
  /** Live forge state per linked PR; absent when the forge did not answer. */
  readonly forge?: readonly PrForgeState[];
  readonly openSessions: readonly string[];
}

export interface ProjectStatus {
  readonly project: FoundProject['record'];
  /** Derived from the project's tasks — the stored state only pauses/closes it explicitly. */
  readonly derived: WorkState;
  readonly tasks: readonly TaskStatus[];
}

export interface StatusReport {
  readonly workspace: WorkState;
  readonly projects: readonly ProjectStatus[];
  readonly bareTasks: readonly TaskStatus[];
  /** Present exactly when the forge answered — its absence marks forge state unavailable. */
  readonly needsYou?: readonly NeedsYouEntry[];
}

export async function statusReport(root: string): Promise<StatusReport> {
  const tasks = await readTasks(root);
  const projects = await readProjects(root);
  const probe = await probeForge(openPrUrls(tasks.map((task) => task.record)));

  const projectStatuses: ProjectStatus[] = [];
  for (const project of projects) {
    const own = tasks.filter((task) => task.dir.startsWith(`${project.dir}/`));
    const derived =
      project.record.state === 'active'
        ? deriveStatus(own.map((task) => task.record.state))
        : project.record.state;
    projectStatuses.push({
      project: project.record,
      derived,
      tasks: await taskStatuses(root, own, probe),
    });
  }

  const bare = tasks.filter((task) => task.dir.startsWith('tasks/'));
  const workspace = deriveStatus([
    ...projectStatuses.map((project) => project.derived),
    ...bare.map((task) => task.record.state),
  ]);

  const bareStatuses = await taskStatuses(root, bare, probe);
  const all = [...projectStatuses.flatMap((project) => project.tasks), ...bareStatuses];
  return {
    workspace,
    projects: projectStatuses,
    bareTasks: bareStatuses,
    ...(probe.live ? { needsYou: deriveNeedsYou(all) } : {}),
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
    statuses.push({
      task: task.record,
      inReview: inReview(task.record, forge),
      ...(forge === undefined ? {} : { forge }),
      openSessions: sessions
        .filter((session) => session.state === 'open')
        .map((session) => session.id),
    });
  }
  return statuses;
}
