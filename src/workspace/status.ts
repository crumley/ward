// Derived status (design/0004-work-spine/): recorded at the leaves, derived
// above, progress-biased — any child that can still move forward makes the
// container active; an empty container is active; in-review is an overlay
// computed from the PR-link set, never stored
// (intent/01-concepts/00-domain-model.md, Status).
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

/** In-review is derived: linked PRs on a task that is not closed. */
export function inReview(task: TaskRecord): boolean {
  return task.prs.length > 0 && task.state !== 'closed';
}

export interface TaskStatus {
  readonly task: TaskRecord;
  readonly inReview: boolean;
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
}

export async function statusReport(root: string): Promise<StatusReport> {
  const tasks = await readTasks(root);
  const projects = await readProjects(root);

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
      tasks: await taskStatuses(root, own),
    });
  }

  const bare = tasks.filter((task) => task.dir.startsWith('tasks/'));
  const workspace = deriveStatus([
    ...projectStatuses.map((project) => project.derived),
    ...bare.map((task) => task.record.state),
  ]);

  return {
    workspace,
    projects: projectStatuses,
    bareTasks: await taskStatuses(root, bare),
  };
}

async function taskStatuses(root: string, tasks: readonly FoundTask[]): Promise<TaskStatus[]> {
  const statuses: TaskStatus[] = [];
  for (const task of tasks) {
    const sessions = await readSessions(root, task.dir);
    statuses.push({
      task: task.record,
      inReview: inReview(task.record),
      openSessions: sessions
        .filter((session) => session.state === 'open')
        .map((session) => session.id),
    });
  }
  return statuses;
}
