// Derived status (domain-model). A container's status is a QUERY over its
// children, never a stored field (§17: a stored roll-up goes stale and turns
// every child transition into a parent write). The derivation is progress-biased:
// any child that can still move forward makes the container active.

import type { Task, TaskState } from '../store/schemas.ts';
import { listProjects } from '../store/workspace.ts';
import { listTasks } from './task.ts';

export type ContainerStatus = 'active' | 'paused' | 'closed';

/**
 * Roll child states up to a container. Precedence active ▸ paused ▸ closed; an
 * EMPTY container is active (nothing blocks it). This is the whole rule.
 */
export function rollup(children: readonly ContainerStatus[]): ContainerStatus {
  if (children.length === 0) {
    return 'active';
  }
  if (children.includes('active')) {
    return 'active';
  }
  if (children.includes('paused')) {
    return 'paused';
  }
  return 'closed';
}

/** `in-review` is a derived overlay: a non-closed task with ≥1 open PR. It rolls up as active. */
export function isInReview(state: TaskState, openPrCount: number): boolean {
  return state !== 'closed' && openPrCount >= 1;
}

/** A project's status — derived from its tasks, resolved fresh from the record. */
export async function projectStatus(root: string, floor: number): Promise<ContainerStatus> {
  const tasks = await listTasks(root, floor);
  return rollup(tasks.map(taskRollupState));
}

/** The workspace's status — derived from its projects (each itself derived from its tasks). */
export async function workspaceStatus(root: string): Promise<ContainerStatus> {
  const projects = await listProjects(root);
  const statuses = await Promise.all(projects.map((p) => projectStatus(root, p.floor)));
  return rollup(statuses);
}

// A task contributes its stored state to the roll-up; in-review is active-flavored
// and never a competing roll-up input (domain-model, derivation rule).
function taskRollupState(task: Task): ContainerStatus {
  return task.state;
}
