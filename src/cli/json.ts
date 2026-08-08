// The --json shapes of the read verbs (design/0005-agent-audience/): built
// explicitly here — never by serializing internal structs — so the shape is a
// documented contract that survives refactors below it. Evolution is
// additive: fields may be added, existing fields keep their name and
// meaning, optional fields are omitted (never null) when unrecorded. One JSON
// document per invocation, alone on stdout; exit codes are unchanged.
import type { ProjectRecord, RepositoryRecord, TaskRecord, WorkState } from '../store/types.ts';
import type { DoctorReport } from '../workspace/doctor.ts';
import type { StatusReport, TaskStatus } from '../workspace/status.ts';
import type { WorktreeListing } from '../workspace/worktrees.ts';

export function printJson(value: unknown): void {
  console.log(JSON.stringify(value, null, 2));
}

/** The task shape shared by `task list` and `status`. */
export function taskJson(record: TaskRecord, inReview: boolean): Record<string, unknown> {
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
  };
}

/** In `status`, tasks additionally carry their open sessions. */
function statusTaskJson(status: TaskStatus): Record<string, unknown> {
  return { ...taskJson(status.task, status.inReview), openSessions: status.openSessions };
}

export function statusJson(report: StatusReport): unknown {
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
  };
}

export interface ProjectListEntry {
  readonly record: ProjectRecord;
  readonly derived: WorkState;
  readonly taskCount: number;
}

export function projectListJson(entries: readonly ProjectListEntry[]): unknown {
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

export function taskListJson(tasks: readonly { record: TaskRecord; inReview: boolean }[]): unknown {
  return tasks.map((task) => taskJson(task.record, task.inReview));
}

export function worktreeListJson(listings: readonly WorktreeListing[]): unknown {
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

export function repoListJson(records: readonly RepositoryRecord[]): unknown {
  return records.map((record) => ({
    name: record.name,
    remote: record.remote,
    mainLine: record.mainLine,
    registeredAt: record.registeredAt,
  }));
}

export function doctorJson(report: DoctorReport): unknown {
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
