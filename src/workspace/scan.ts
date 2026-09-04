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
import { requireTaskAddress, taskAddress, taskFloor, taskRoom } from './address.ts';
import { gitOrThrow } from './git.ts';
import { warnJournalOffMainLine } from './steward.ts';

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
 * Resolve what a caller typed to its non-closed task
 * (design/0036-floor-addressed-tasks/).
 *
 * The full address `f<floor>t<room>` names exactly one container and one room
 * in it, so it always resolves or refuses. A bare `t<room>` is a SHORTHAND:
 * it resolves while it is unique among the workspace's open tasks — the bare
 * pool and every floor — and when several floors hold that room it refuses
 * deterministically, naming every candidate by address and slug. Refusing is
 * the point: the alternative is picking one, and a verb that picks silently
 * between two live tasks is how a close lands on the wrong one. Closed tasks
 * are addressable by neither form; their rooms belong to whoever holds them
 * next (intent/01-concepts/00-domain-model.md, Identity).
 */
export async function resolveOpenTask(root: string, input: string): Promise<FoundTask> {
  const wanted = requireTaskAddress(input);
  const open = (await readTasks(root)).filter((task) => task.record.state !== 'closed');
  const matches = open.filter(
    (task) =>
      taskRoom(task) === wanted.room &&
      (wanted.floor === undefined || taskFloor(task) === wanted.floor),
  );
  const first = matches[0];
  if (first === undefined) {
    throw new WardError(
      wanted.floor === undefined
        ? `no open task has code '${input}' — see: ward task list`
        : `no open task at ${input.toLowerCase()} — floor ${wanted.floor} holds no open task in ` +
            `room ${wanted.room} (see: ward task list)`,
    );
  }
  if (matches.length > 1) {
    const named = matches
      .map((task) => `${taskAddress(task)} (${task.record.slug})`)
      .sort()
      .join(', ');
    throw new WardError(`${input.toLowerCase()} is ambiguous — ${named}; name one`);
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

/**
 * Commit record changes under the given workspace-relative paths — the
 * journal advancing. A journal commit landing while the root stands off the
 * recorded main line proceeds (refusing would wedge the record's own
 * bookkeeping) but never silently: the verb surfaces it as it writes
 * (design/0020-deterministic-upgrade/; intent/01-concepts/06-workspace-lifecycle.md).
 */
export function commitRecords(root: string, subject: string, ...relPaths: string[]): void {
  gitOrThrow(root, 'add', '-A', '--', ...relPaths);
  gitOrThrow(root, 'commit', '-m', `${subject} (ward ${pkg.version})`);
  warnJournalOffMainLine(root);
}

function subdirs(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => statSync(join(dir, name)).isDirectory())
    .sort();
}
