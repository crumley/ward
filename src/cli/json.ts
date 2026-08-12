// The --json shapes of the read verbs (design/0005-agent-audience/): built
// explicitly here — never by serializing internal structs — so the shape is a
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
import type { PrForgeState } from '../forge/gh.ts';
import type { ProjectRecord, RepositoryRecord, TaskRecord, WorkState } from '../store/types.ts';
import type { DoctorReport } from '../workspace/doctor.ts';
import type { StatusReport, TaskStatus } from '../workspace/status.ts';
import type { WorktreeListing } from '../workspace/worktrees.ts';
import type {
  DoctorShape,
  PrForgeShape,
  ProjectListShape,
  RepoListShape,
  StatusShape,
  StatusTaskShape,
  TaskListShape,
  TaskShape,
  WorktreeListShape,
} from './schema.ts';

export function printJson(value: unknown): void {
  console.log(JSON.stringify(value, null, 2));
}

/** The task shape shared by `task list` and `status`. */
export function taskJson(
  record: TaskRecord,
  inReview: boolean,
  forge?: readonly PrForgeState[],
): TaskShape {
  return {
    code: record.code,
    slug: record.slug,
    state: record.state,
    ...(record.floor === undefined ? {} : { floor: record.floor }),
    ...(record.purpose === undefined ? {} : { purpose: record.purpose }),
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

/** In `status`, tasks additionally carry their open sessions. */
function statusTaskJson(status: TaskStatus): StatusTaskShape {
  return {
    ...taskJson(status.task, status.inReview, status.forge),
    openSessions: [...status.openSessions],
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
      tasks: project.tasks.map(statusTaskJson),
    })),
    bareTasks: report.bareTasks.map(statusTaskJson),
    ...(report.needsYou === undefined
      ? {}
      : {
          needsYou: report.needsYou.map((entry) => ({
            task: entry.task,
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

export function projectListJson(entries: readonly ProjectListEntry[]): ProjectListShape {
  return entries.map((entry) => ({
    floor: entry.record.floor,
    slug: entry.record.slug,
    state: entry.record.state,
    derived: entry.derived,
    taskCount: entry.taskCount,
    openedAt: entry.record.openedAt,
    ...(entry.record.closedAt === undefined ? {} : { closedAt: entry.record.closedAt }),
  }));
}

export function taskListJson(
  tasks: readonly { record: TaskRecord; inReview: boolean; forge?: readonly PrForgeState[] }[],
): TaskListShape {
  return tasks.map((task) => taskJson(task.record, task.inReview, task.forge));
}

export function worktreeListJson(listings: readonly WorktreeListing[]): WorktreeListShape {
  return listings.map((listing) => ({
    task: listing.taskCode,
    repo: listing.record.repo,
    branch: listing.record.branch,
    disposition: listing.record.disposition,
    path: listing.record.path,
    present: listing.present,
    createdAt: listing.record.createdAt,
  }));
}

export function repoListJson(records: readonly RepositoryRecord[]): RepoListShape {
  return records.map((record) => ({
    name: record.name,
    remote: record.remote,
    mainLine: record.mainLine,
    registeredAt: record.registeredAt,
  }));
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
    machine: report.machine.map(finding),
    workspace: report.workspace.map(finding),
  };
}
