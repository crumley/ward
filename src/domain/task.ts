// Task lifecycle (03-work-lifecycle). A task is the unit of trackable work and a
// LEAF that records its own state: active | paused | closed. `in-review` is
// DERIVED from the open-PR set (status.ts), never stored. The only legal
// transitions are active ⇄ paused and active → closed; closed is terminal.

import { readdir } from 'node:fs/promises';
import { readAs, writeDocument } from '../store/doc.ts';
import { slugify } from '../store/ids.ts';
import { appendEvent, type Clock, systemClock } from '../store/log.ts';
import { logDir, taskDir, taskDoc, tasksDir } from '../store/paths.ts';
import { type Task, type TaskState, taskSchema } from '../store/schemas.ts';
import { resolveProjectDir } from '../store/workspace.ts';
import { defaultPersonaForRole } from './personas.ts';

// Legal targets from each state (self-target is an idempotent no-op). Enforces
// "the only transitions are active ⇄ paused and active → closed" and that closed
// is terminal — paused → closed must route through active.
const LEGAL_TARGETS: Record<TaskState, readonly TaskState[]> = {
  active: ['active', 'paused', 'closed'],
  paused: ['paused', 'active'],
  closed: ['closed'],
};

export interface OpenTaskOptions {
  floor: number;
  title: string;
  slug?: string;
  successCriteria: string;
  resident?: string;
  repos?: readonly string[];
  now?: Clock;
}

export async function openTask(root: string, opts: OpenTaskOptions): Promise<Task> {
  const now = opts.now ?? systemClock;
  const projectDirPath = await resolveProjectDir(root, opts.floor);
  const slug = opts.slug ?? slugify(opts.title);
  const task: Task = {
    type: 'task',
    slug,
    floor: opts.floor,
    title: opts.title,
    state: 'active',
    resident: opts.resident ?? defaultPersonaForRole('resident').name,
    successCriteria: opts.successCriteria,
    repos: [...(opts.repos ?? [])],
  };
  const dir = taskDir(projectDirPath, slug);
  await writeDocument(taskDoc(dir), task);
  await appendEvent(logDir(dir), { kind: 'task-opened', data: { slug } }, now);
  return task;
}

export async function loadTask(root: string, floor: number, slug: string): Promise<Task> {
  const dir = taskDir(await resolveProjectDir(root, floor), slug);
  return (await readAs(taskDoc(dir), taskSchema)).doc;
}

export async function listTasks(root: string, floor: number): Promise<Task[]> {
  const projectDirPath = await resolveProjectDir(root, floor);
  const names = await readdir(tasksDir(projectDirPath)).catch(() => [] as string[]);
  const tasks: Task[] = [];
  for (const name of names) {
    tasks.push((await readAs(taskDoc(taskDir(projectDirPath, name)), taskSchema)).doc);
  }
  return tasks.sort((a, b) => a.slug.localeCompare(b.slug));
}

export interface TransitionOptions {
  now?: Clock;
}

/** Move a task to a target state, enforcing legal transitions; self-target is a no-op. */
export async function setTaskState(
  root: string,
  floor: number,
  slug: string,
  target: TaskState,
  opts: TransitionOptions = {},
): Promise<Task> {
  const now = opts.now ?? systemClock;
  const task = await loadTask(root, floor, slug);
  if (!LEGAL_TARGETS[task.state].includes(target)) {
    throw new Error(`illegal task transition ${task.state} -> ${target} (${floor}/${slug})`);
  }
  if (task.state === target) {
    return task;
  }
  const next: Task = { ...task, state: target };
  const dir = taskDir(await resolveProjectDir(root, floor), slug);
  await writeDocument(taskDoc(dir), next);
  await appendEvent(logDir(dir), { kind: `task-${target}` }, now);
  return next;
}

export function pauseTask(
  root: string,
  floor: number,
  slug: string,
  opts?: TransitionOptions,
): Promise<Task> {
  return setTaskState(root, floor, slug, 'paused', opts);
}

export function unpauseTask(
  root: string,
  floor: number,
  slug: string,
  opts?: TransitionOptions,
): Promise<Task> {
  return setTaskState(root, floor, slug, 'active', opts);
}

export function closeTask(
  root: string,
  floor: number,
  slug: string,
  opts?: TransitionOptions,
): Promise<Task> {
  return setTaskState(root, floor, slug, 'closed', opts);
}
