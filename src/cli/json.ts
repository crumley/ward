// The --json shapes of the read verbs (design/0005-agent-audience/) and the
// mutation reports (design/0015-mutation-json/): built explicitly here —
// never by serializing internal structs — so the shape is a
// documented contract that survives refactors below it. Evolution is
// additive: fields may be added, existing fields keep their name and
// meaning, optional fields are omitted (never null) when unrecorded. One JSON
// document per invocation, alone on stdout; exit codes are unchanged.
//
// Each builder returns the type inferred from its verb's schema in schema.ts
// (design/0008-json-shape-home/): the schema is the contract's one source of
// truth, and a builder drifting from it is a compile error before it is a
// failing test. The builders stay hand-written because they are what pin key
// order — the byte-determinism (§6) a schema alone cannot promise.
import type { SessionLocation } from '../agent/run.ts';
import type { AgentProvenance, Resolved } from '../agent/settings.ts';
import type { PrForgeState } from '../forge/gh.ts';
import type { RepoLocation } from '../global/locate.ts';
import type { RegistryReport, WorkspaceListing } from '../global/registry.ts';
import { CLAUDE_HARNESS } from '../harness/claude.ts';
import type { AdoptionReport } from '../shell/adopt.ts';
import {
  type ProjectRecord,
  type RepositoryRecord,
  type SessionRecord,
  sessionScopeOf,
  type TaskRecord,
  type WorkState,
  type WorktreeRecord,
} from '../store/types.ts';
import { taskAddress } from '../workspace/address.ts';
import type { ClaimReport, ReleaseReport } from '../workspace/affinity.ts';
import type { CreateReport } from '../workspace/create.ts';
import type { DoctorReport } from '../workspace/doctor.ts';
import type { AddReport, RefreshReport, RemoveReport } from '../workspace/repos.ts';
import type { RestoreReport } from '../workspace/restore.ts';
import type { HiddenSummary, StatusReport, TaskStatus } from '../workspace/status.ts';
import type { MergeReport } from '../workspace/steward.ts';
import type { CloseReport } from '../workspace/tasks.ts';
import type { UpgradeReport } from '../workspace/upgrade.ts';
import type { RebaseReport, WorktreeListing, WorktreeStatus } from '../workspace/worktrees.ts';
import type {
  DoctorShape,
  PrForgeShape,
  ProjectClaimShape,
  ProjectListShape,
  ProjectOpenShape,
  RepoAddShape,
  RepoListShape,
  RepoPathShape,
  RepoRefreshShape,
  RepoRemoveShape,
  SessionLocateShape,
  SessionMutationShape,
  ShellAdoptShape,
  StatusShape,
  StatusTaskShape,
  StatusWorktreeShape,
  TaskCloseShape,
  TaskListShape,
  TaskMutationShape,
  TaskShape,
  WorkspaceCreateShape,
  WorkspaceListShape,
  WorkspaceMergeShape,
  WorkspacePathShape,
  WorkspaceRegistryShape,
  WorkspaceRestoreShape,
  WorkspaceUpgradeShape,
  WorktreeCreateShape,
  WorktreeListShape,
  WorktreeRebaseShape,
} from './schema.ts';

export function printJson(value: unknown): void {
  console.log(JSON.stringify(value, null, 2));
}

/**
 * The task shape shared by `task list` and `status`. `address` is derived,
 * never stored (design/0036-floor-addressed-tasks/): `code` keeps naming the
 * room the record carries, and the address composes it with the floor — so an
 * agent addresses a verb by `address` and still reads the record it knows.
 */
export function taskJson(
  record: TaskRecord,
  address: string,
  inReview: boolean,
  forge?: readonly PrForgeState[],
): TaskShape {
  return {
    code: record.code,
    address,
    slug: record.slug,
    state: record.state,
    ...(record.floor === undefined ? {} : { floor: record.floor }),
    ...(record.purpose === undefined ? {} : { purpose: record.purpose }),
    ...(record.repositories === undefined ? {} : { repositories: record.repositories }),
    prs: record.prs,
    ...(record.outcome === undefined ? {} : { outcome: record.outcome }),
    inReview,
    openedAt: record.openedAt,
    ...(record.closedAt === undefined ? {} : { closedAt: record.closedAt }),
    ...(forge === undefined ? {} : { forge: forge.map(prForgeJson) }),
  };
}

/** Live forge state per PR — present only when the forge answered. */
function prForgeJson(state: PrForgeState): PrForgeShape {
  return {
    url: state.url,
    state: state.state,
    ...(state.reviewDecision === undefined ? {} : { reviewDecision: state.reviewDecision }),
    ...(state.baseRefName === undefined ? {} : { baseRefName: state.baseRefName }),
  };
}

/**
 * One worktree row in `status` (0016): the record's identity plus the
 * derived freshness — `freshness` absent when local git could not be asked,
 * `behindBy`/`checkedOut` present exactly with their conditions.
 */
function statusWorktreeJson(status: WorktreeStatus): StatusWorktreeShape {
  return {
    ...(status.record.repo === undefined ? {} : { repo: status.record.repo }),
    ...(status.record.source === undefined ? {} : { source: status.record.source }),
    branch: status.record.branch,
    path: status.record.path,
    ...(status.freshness === undefined ? {} : { freshness: status.freshness }),
    ...(status.behindBy === undefined ? {} : { behindBy: status.behindBy }),
    ...(status.checkedOut === undefined ? {} : { checkedOut: status.checkedOut }),
  };
}

/** In `status`, tasks additionally carry their open sessions and worktrees. */
function statusTaskJson(status: TaskStatus): StatusTaskShape {
  return {
    ...taskJson(status.task, status.address, status.inReview, status.forge),
    openSessions: [...status.openSessions],
    ...(status.worktrees === undefined
      ? {}
      : { worktrees: status.worktrees.map(statusWorktreeJson) }),
  };
}

export function statusJson(report: StatusReport): StatusShape {
  return {
    workspace: report.workspace,
    projects: report.projects.map((project) => ({
      floor: project.project.floor,
      slug: project.project.slug,
      state: project.project.state,
      derived: project.derived,
      ...(project.project.repositories === undefined
        ? {}
        : { repositories: project.project.repositories }),
      tasks: project.tasks.map(statusTaskJson),
    })),
    bareTasks: report.bareTasks.map(statusTaskJson),
    hidden: {
      tasks: report.hidden.tasks,
      projects: report.hidden.projects,
      settledAfterDays: report.hidden.settledAfterDays,
    },
    machine: report.machine,
    sessions: report.sessions.map((session) => ({
      id: session.id,
      purpose: session.purpose,
      ...(session.machine === undefined ? {} : { machine: session.machine }),
      openedAt: session.openedAt,
      history: session.history,
    })),
    ...(report.needsYou === undefined
      ? {}
      : {
          needsYou: report.needsYou.map((entry) => ({
            task: entry.task,
            address: entry.address,
            reason: entry.reason,
            ...(entry.pr === undefined ? {} : { pr: entry.pr }),
            ...(entry.base === undefined ? {} : { base: entry.base }),
            ...(entry.mainLine === undefined ? {} : { mainLine: entry.mainLine }),
          })),
        }),
  };
}

export interface ProjectListEntry {
  readonly record: ProjectRecord;
  readonly derived: WorkState;
  readonly taskCount: number;
}

export function projectListJson(
  entries: readonly ProjectListEntry[],
  hidden: HiddenSummary,
): ProjectListShape {
  return {
    projects: entries.map((entry) => ({
      floor: entry.record.floor,
      slug: entry.record.slug,
      state: entry.record.state,
      derived: entry.derived,
      taskCount: entry.taskCount,
      ...(entry.record.repositories === undefined
        ? {}
        : { repositories: entry.record.repositories }),
      openedAt: entry.record.openedAt,
      ...(entry.record.closedAt === undefined ? {} : { closedAt: entry.record.closedAt }),
    })),
    hidden: {
      tasks: hidden.tasks,
      projects: hidden.projects,
      settledAfterDays: hidden.settledAfterDays,
    },
  };
}

export interface TaskListEntry {
  readonly record: TaskRecord;
  readonly address: string;
  readonly inReview: boolean;
  readonly forge?: readonly PrForgeState[];
}

export function taskListJson(
  tasks: readonly TaskListEntry[],
  hidden: HiddenSummary,
): TaskListShape {
  return {
    tasks: tasks.map((task) => taskJson(task.record, task.address, task.inReview, task.forge)),
    hidden: {
      tasks: hidden.tasks,
      projects: hidden.projects,
      settledAfterDays: hidden.settledAfterDays,
    },
  };
}

export function worktreeListJson(listings: readonly WorktreeListing[]): WorktreeListShape {
  return listings.map((listing) => ({
    task: listing.taskCode,
    address: listing.taskAddress,
    ...(listing.record.repo === undefined ? {} : { repo: listing.record.repo }),
    ...(listing.record.source === undefined ? {} : { source: listing.record.source }),
    branch: listing.record.branch,
    disposition: listing.record.disposition,
    path: listing.record.path,
    present: listing.present,
    createdAt: listing.record.createdAt,
  }));
}

/**
 * The registry read verbs and the path verbs
 * (design/0024-global-config-registry/). `default` and `stale` are always
 * present booleans, not optional flags: "is this the default?" and "is this
 * entry still real?" have an answer for every row, and an omitted field would
 * read as unknown rather than false.
 */
export function workspaceListJson(listings: readonly WorkspaceListing[]): WorkspaceListShape {
  return listings.map((entry) => ({
    name: entry.name,
    path: entry.path,
    default: entry.isDefault,
    stale: entry.stale,
    registeredAt: entry.registeredAt,
    ...(entry.lastUsedAt === undefined ? {} : { lastUsedAt: entry.lastUsedAt }),
  }));
}

export function workspacePathJson(listing: WorkspaceListing): WorkspacePathShape {
  return { name: listing.name, path: listing.path };
}

export function repoPathJson(location: RepoLocation): RepoPathShape {
  return {
    repo: location.repo,
    workspace: location.workspace.name,
    workspacePath: location.workspace.path,
    path: location.path,
  };
}

/** One shape for the three registry mutations — the entry as it now reads. */
export function workspaceRegistryJson(report: RegistryReport): WorkspaceRegistryShape {
  return {
    name: report.entry.name,
    path: report.entry.path,
    default: report.entry.isDefault,
    outcome: report.outcome,
  };
}

export function repoListJson(records: readonly RepositoryRecord[]): RepoListShape {
  return records.map((record) => ({
    name: record.name,
    remote: record.remote,
    mainLine: record.mainLine,
    registeredAt: record.registeredAt,
  }));
}

// -- mutation reports (design/0015-mutation-json/) --------------------------
// Each builder emits the verb's existing typed report — the same steps,
// outcomes, and named trusts the human rendering shows. A verb that refuses
// before producing a report emits nothing here: refusals stay the error path
// (stderr + exit 1, stdout empty), the posture 0005 set.

export function workspaceCreateJson(report: CreateReport): WorkspaceCreateShape {
  return {
    root: report.root,
    steps: report.steps.map((step) => ({
      step: step.step,
      outcome: step.outcome,
      detail: step.detail,
    })),
  };
}

export function repoAddJson(report: AddReport): RepoAddShape {
  return {
    name: report.record.name,
    outcome: report.outcome,
    remote: report.record.remote,
    mainLine: report.record.mainLine,
    registeredAt: report.record.registeredAt,
  };
}

export function repoRefreshJson(reports: readonly RefreshReport[]): RepoRefreshShape {
  return reports.map((report) => ({
    name: report.name,
    outcome: report.outcome,
    detail: report.detail,
  }));
}

/** The removed record verbatim — its remote is the re-add argument (design/0033-repo-remove/). */
export function repoRemoveJson(report: RemoveReport): RepoRemoveShape {
  return {
    name: report.record.name,
    remote: report.record.remote,
    mainLine: report.record.mainLine,
    checkout: report.checkout,
  };
}

export function projectOpenJson(record: ProjectRecord): ProjectOpenShape {
  return {
    floor: record.floor,
    slug: record.slug,
    state: record.state,
    ...(record.repositories === undefined ? {} : { repositories: record.repositories }),
    openedAt: record.openedAt,
  };
}

/**
 * `project claim` and `project release` (design/0037-repo-floor-affinity/) —
 * one shape for both: the floor's claims as they now stand, plus what the
 * change left behind. `staying` is empty on a release, which never moves
 * routing away from work in flight.
 */
export function projectClaimJson(
  report: ClaimReport | ReleaseReport,
  staying: ClaimReport['staying'] = [],
): ProjectClaimShape {
  const from = 'from' in report ? report.from : undefined;
  return {
    floor: report.project.floor,
    slug: report.project.slug,
    repository: report.repository,
    outcome: report.outcome,
    ...(from === undefined ? {} : { from }),
    repositories: [...(report.project.repositories ?? [])],
    staying: staying.map((task) => ({
      address: task.address,
      slug: task.slug,
      ...(task.floor === undefined ? {} : { floor: task.floor }),
    })),
  };
}

/**
 * The task record as the mutation wrote it — no derived overlays (§16) beyond
 * the address, which is derived from the record and its containment and is
 * what the next verb is addressed by (0036).
 */
export function taskMutationJson(record: TaskRecord, address: string): TaskMutationShape {
  return {
    code: record.code,
    address,
    slug: record.slug,
    state: record.state,
    ...(record.floor === undefined ? {} : { floor: record.floor }),
    ...(record.purpose === undefined ? {} : { purpose: record.purpose }),
    ...(record.repositories === undefined ? {} : { repositories: record.repositories }),
    prs: record.prs,
    ...(record.outcome === undefined ? {} : { outcome: record.outcome }),
    openedAt: record.openedAt,
    ...(record.closedAt === undefined ? {} : { closedAt: record.closedAt }),
  };
}

/** The close report: steps verbatim — the trust language lives in `detail`. */
export function taskCloseJson(report: CloseReport): TaskCloseShape {
  return {
    task: taskMutationJson(report.task.record, taskAddress(report.task)),
    outcome: report.outcome,
    steps: report.steps.map((step) => ({ step: step.step, detail: step.detail })),
  };
}

export function worktreeCreateJson(
  taskCode: string,
  address: string,
  record: WorktreeRecord,
): WorktreeCreateShape {
  return {
    task: taskCode,
    address,
    ...(record.repo === undefined ? {} : { repo: record.repo }),
    ...(record.source === undefined ? {} : { source: record.source }),
    branch: record.branch,
    disposition: record.disposition,
    path: record.path,
    createdAt: record.createdAt,
  };
}

export function worktreeRebaseJson(
  taskCode: string,
  address: string,
  reports: readonly RebaseReport[],
): WorktreeRebaseShape {
  return {
    task: taskCode,
    address,
    reports: reports.map((report) => ({
      ...(report.record.repo === undefined ? {} : { repo: report.record.repo }),
      ...(report.record.source === undefined ? {} : { source: report.record.source }),
      branch: report.record.branch,
      path: report.record.path,
      outcome: report.outcome,
      detail: report.detail,
    })),
  };
}

/** The gated merge's report (design/0019-stewardship-worktrees/) — outcome-conditional fields. */
export function workspaceMergeJson(report: MergeReport): WorkspaceMergeShape {
  return {
    branch: report.branch,
    mainLine: report.mainLine,
    outcome: report.outcome,
    commits: report.commits,
    ...(report.mergeCommit === undefined ? {} : { mergeCommit: report.mergeCommit }),
    ...(report.diffStat === undefined ? {} : { diffStat: report.diffStat }),
  };
}

/** The restore report (design/0021-restore-from-clone/) — per-item rows, sessions named. */
export function workspaceRestoreJson(report: RestoreReport): WorkspaceRestoreShape {
  return {
    root: report.root,
    repositories: report.repositories.map((item) => ({
      name: item.name,
      outcome: item.outcome,
      detail: item.detail,
    })),
    worktrees: report.worktrees.map((item) => ({
      task: item.taskCode,
      ...(item.record.repo === undefined ? {} : { repo: item.record.repo }),
      ...(item.record.source === undefined ? {} : { source: item.record.source }),
      branch: item.record.branch,
      path: item.record.path,
      outcome: item.outcome,
      detail: item.detail,
    })),
    sessions: { open: report.sessions.open, detail: report.sessions.detail },
  };
}

/** The deterministic upgrade's report (design/0020-deterministic-upgrade/). */
export function workspaceUpgradeJson(report: UpgradeReport): WorkspaceUpgradeShape {
  return {
    vehicle: report.vehicle,
    ...(report.task === undefined ? {} : { task: report.task }),
    ...(report.branch === undefined ? {} : { branch: report.branch }),
    ...(report.path === undefined ? {} : { path: report.path }),
    outcome: report.outcome,
    mainLine: { name: report.mainLine.name, action: report.mainLine.action },
    stamp: { wardVersion: report.stamp.wardVersion, action: report.stamp.action },
    baselines: report.baselines,
    artifacts: report.artifacts.map((artifact) => ({
      path: artifact.path,
      action: artifact.action,
      detail: artifact.detail,
    })),
    residue: [...report.residue],
    ...(report.commit === undefined ? {} : { commit: report.commit }),
    ...(report.derived === undefined
      ? {}
      : {
          derived: report.derived.map((step) => ({
            step: step.step,
            outcome: step.outcome,
            detail: step.detail,
          })),
        }),
    ...(report.pullRequest === undefined
      ? {}
      : {
          pullRequest: {
            outcome: report.pullRequest.outcome,
            ...(report.pullRequest.url === undefined ? {} : { url: report.pullRequest.url }),
            detail: report.pullRequest.detail,
            ...(report.pullRequest.base === undefined
              ? {}
              : {
                  base: {
                    ref: report.pullRequest.base.ref,
                    outcome: report.pullRequest.base.outcome,
                    detail: report.pullRequest.base.detail,
                  },
                }),
          },
        }),
    remaining: report.remaining.map((act) => ({
      step: act.step,
      detail: act.detail,
      ...(act.command === undefined ? {} : { command: act.command }),
    })),
  };
}

export function sessionMutationJson(record: SessionRecord): SessionMutationShape {
  return {
    id: record.id,
    // Always present, including for a record written before 0029: the scope a
    // record states, or the one a carried task implies. An agent reading this
    // never has to infer the level from which fields happen to be here.
    scope: sessionScopeOf(record),
    ...(record.task === undefined ? {} : { task: record.task }),
    purpose: record.purpose,
    workingDirectory: record.workingDirectory,
    ...(record.handle === undefined ? {} : { handle: record.handle }),
    ...(record.machine === undefined ? {} : { machine: record.machine }),
    ...(record.model === undefined ? {} : { model: record.model }),
    ...(record.effort === undefined ? {} : { effort: record.effort }),
    state: record.state,
    ...(record.events === undefined
      ? {}
      : {
          events: record.events.map((event) => ({
            event: event.event,
            at: event.at,
            ...(event.cause === undefined ? {} : { cause: event.cause }),
          })),
        }),
    openedAt: record.openedAt,
    ...(record.closedAt === undefined ? {} : { closedAt: record.closedAt }),
  };
}

/**
 * `ward shell adopt <shell>` (design/0027-shell-adoption/). The offering and
 * the write report share a document because they are one verb's two answers,
 * and the difference is `offeredOnly` plus whether the file rows are there —
 * so an agent reads "what is on offer and where it stands" and "what I just
 * wrote" through one shape.
 */
export function shellAdoptJson(report: AdoptionReport): ShellAdoptShape {
  return {
    shell: report.shell,
    dir: report.dir,
    offeredOnly: report.offeredOnly,
    shorthands: report.shorthands.map((shorthand) => ({
      name: shorthand.name,
      summary: shorthand.summary,
      status: shorthand.status,
      files: shorthand.files.map((file) => ({
        path: file.relativePath,
        outcome: file.outcome,
      })),
    })),
  };
}

/** `session locate` (0029): the handle resolved, found or gone, with the path either way. */
export function sessionLocateJson(location: SessionLocation): SessionLocateShape {
  return {
    id: location.record.id,
    scope: sessionScopeOf(location.record),
    ...(location.record.task === undefined ? {} : { task: location.record.task }),
    state: location.record.state,
    handle: location.handle,
    harness: CLAUDE_HARNESS,
    nativeId: location.nativeId,
    workingDirectory: location.record.workingDirectory,
    ...(location.record.machine === undefined ? {} : { machine: location.record.machine }),
    outcome: location.outcome,
    path: location.path,
  };
}

export function doctorJson(report: DoctorReport): DoctorShape {
  const finding = (f: DoctorReport['machine'][number]) => ({
    check: f.check,
    severity: f.severity,
    message: f.message,
  });
  return {
    healthy: report.healthy,
    workspaceRoot: report.workspaceRoot,
    machineName: { name: report.machineName.name, source: report.machineName.source },
    agent: report.agent === null ? null : agentConfigJson(report.agent),
    machine: report.machine.map(finding),
    workspace: report.workspace.map(finding),
  };
}

/**
 * The resolved agent configuration as data (design/0028-agent-configuration/):
 * the same resolution the human reads as one doctor line, keyed so an agent
 * can act on it without parsing prose (§8). An `absent` key carries no
 * `value` — omitted, never null, and never a stand-in default: the omission
 * IS the answer, and a caller building a launch command passes no flag for it.
 */
function agentConfigJson(agent: NonNullable<DoctorReport['agent']>): DoctorShape['agent'] {
  return {
    harness: resolvedKeyJson(agent.harness),
    model: resolvedKeyJson(agent.model),
    effort: resolvedKeyJson(agent.effort),
    // Copied, not aliased: the report's array is readonly, and the JSON
    // document is the caller's to keep.
    args: resolvedListJson(agent.args),
    command: resolvedListJson(agent.command),
  };
}

function resolvedListJson(resolved: Resolved<readonly string[]>): {
  provenance: AgentProvenance;
  value?: string[];
} {
  return resolved.provenance === 'absent'
    ? { provenance: 'absent' }
    : { provenance: resolved.provenance, value: [...resolved.value] };
}

function resolvedKeyJson(resolved: Resolved<string>): {
  provenance: AgentProvenance;
  value?: string;
} {
  return resolved.provenance === 'absent'
    ? { provenance: 'absent' }
    : { provenance: resolved.provenance, value: resolved.value };
}
