// Shared scanning and allocation for the work spine
// (design/0004-work-spine/): containment lives in the layout — tasks nest
// under their project directory or under tasks/ at the root — and addressing
// resolves by scan, because identity need not mirror containment and an index
// can drift where a scan cannot (intent/00-domain-model, §16).
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import pkg from '../../package.json' with { type: 'json' };
import { WardError } from '../errors.ts';
import { readDocument } from '../store/document.ts';
import { type TaskRecord, taskRecordType } from '../store/types.ts';
import { gitOrThrow } from './git.ts';

/** Workspace-relative project directories, e.g. `projects/1-agent-output`. */
export function projectDirs(root: string): string[] {
  return subdirs(join(root, 'projects')).map((name) => `projects/${name}`);
}

/** Workspace-relative task directories across every container. */
export function taskDirs(root: string): string[] {
  const containers = ['tasks', ...projectDirs(root).map((dir) => `${dir}/tasks`)];
  return containers.flatMap((container) =>
    subdirs(join(root, container)).map((name) => `${container}/${name}`),
  );
}

export interface FoundTask {
  readonly dir: string;
  readonly record: TaskRecord;
}

export async function readTasks(root: string): Promise<FoundTask[]> {
  const tasks: FoundTask[] = [];
  for (const dir of taskDirs(root)) {
    tasks.push({ dir, record: (await readDocument(root, taskRecordType(dir))).data });
  }
  return tasks;
}

/**
 * Resolve a bare task code to its non-closed task. Codes are unique among
 * open tasks and reused only after close, so at most one non-closed task can
 * carry a code (intent/00-domain-model, Identity).
 */
export async function resolveOpenTask(root: string, code: string): Promise<FoundTask> {
  const matches = (await readTasks(root)).filter(
    (task) => task.record.code === code && task.record.state !== 'closed',
  );
  const first = matches[0];
  if (first === undefined) {
    throw new WardError(`no open task has code '${code}' — see: ward task list`);
  }
  return first;
}

/** Smallest positive integer not taken, for codes sized to in-flight cardinality. */
export function smallestFree(taken: readonly number[]): number {
  const set = new Set(taken);
  let candidate = 1;
  while (set.has(candidate)) candidate += 1;
  return candidate;
}

const SLUG = /^[a-z0-9][a-z0-9-]*$/;

export function requireSlug(value: string): string {
  if (!SLUG.test(value)) {
    throw new WardError(
      `'${value}' is not a valid slug — use lowercase letters, digits, and hyphens`,
    );
  }
  return value;
}

/** Commit record changes under the given workspace-relative paths. */
export function commitRecords(root: string, subject: string, ...relPaths: string[]): void {
  gitOrThrow(root, 'add', '-A', '--', ...relPaths);
  gitOrThrow(root, 'commit', '-m', `${subject} (ward ${pkg.version})`);
}

function subdirs(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => statSync(join(dir, name)).isDirectory())
    .sort();
}
