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
import {
  type AddressedTask,
  addressMatches,
  distinctAddress,
  qualifiedAddress,
  requireTaskAddress,
  spellAddress,
  taskAddress,
} from './address.ts';
import { gitOrThrow } from './git.ts';
import { warnJournalOffMainLine } from './steward.ts';

/**
 * Workspace-relative project directories, e.g. `projects/1-agent-output`, in
 * FLOOR order — by the number the directory leads with, then by name
 * (design/0077-floor-chosen-number/). Sorted as text, floor 10 would come
 * between 1 and 2; every listing, every scan over tasks and sessions, and every
 * resolver that takes the first match reads this order, so it is fixed here
 * once. Two directories that lead with one number (a floor collision) keep
 * their name order, which is what makes "the first" a stable answer. A
 * directory that leads with no number sorts last.
 */
export function projectDirs(root: string): string[] {
  return subdirs(join(root, 'projects'))
    .sort(byFloorThenName)
    .map((name) => `projects/${name}`);
}

/** The floor a project directory's name leads with (`12-night-shift` → 12), if any. */
export function dirFloor(name: string): number | undefined {
  const match = /^(\d+)-/.exec(name.split('/').pop() ?? '');
  return match?.[1] === undefined ? undefined : Number.parseInt(match[1], 10);
}

function byFloorThenName(a: string, b: string): number {
  const fa = dirFloor(a) ?? Number.POSITIVE_INFINITY;
  const fb = dirFloor(b) ?? Number.POSITIVE_INFINITY;
  if (fa !== fb) return fa < fb ? -1 : 1;
  return a < b ? -1 : a > b ? 1 : 0;
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
 * The full address — `f<floor>t<room>`, or `legacy-t<room>` for a legacy bare
 * task (design/0053-legacy-task-address/) — names exactly one container and
 * one room in it, so it always resolves or refuses. A bare `t<room>` is a SHORTHAND:
 * it resolves while it is unique among the workspace's open tasks — the bare
 * pool and every floor — and when several floors hold that room it refuses
 * deterministically, naming every candidate by its full address and slug — so
 * the refusal itself spells what to type, the legacy candidate included. Any
 * form qualified by the slug (`f5t45-distill-2026-10-18`) names the one task in
 * that room with that slug — the spelling for a room two machines both handed
 * out before their records synced (design/0058-room-collisions/). Refusing is
 * the point: the alternative is picking one, and a verb that picks silently
 * between two live tasks is how a close lands on the wrong one. Closed tasks
 * are addressable by neither form; their rooms belong to whoever holds them
 * next (intent/01-concepts/00-domain-model.md, Identity).
 */
export async function resolveOpenTask(root: string, input: string): Promise<FoundTask> {
  const wanted = requireTaskAddress(input);
  const everyone = await readTasks(root);
  const open = everyone.filter((task) => task.record.state !== 'closed');
  const matches = open.filter((task) => addressMatches(task, wanted));
  const first = matches[0];
  if (first === undefined) {
    throw new WardError(
      wanted.legacy === true
        ? `no open task at ${spellAddress(wanted)} — the legacy pool (tasks/) holds no open ` +
            `task in room ${wanted.room} (see: ward task list)`
        : wanted.floor === undefined
          ? `no open task has code '${input}' — see: ward task list`
          : `no open task at ${spellAddress(wanted)} — floor ${wanted.floor} holds no open ` +
            `task in room ${wanted.room} (see: ward task list)`,
    );
  }
  if (matches.length > 1) throw ambiguous(input, matches, everyone);
  return first;
}

/**
 * The refusal for an address several tasks answer to, naming each candidate
 * by the spelling that resolves to it (designs 0053 and 0058): its room
 * address with the slug beside it (`f1t2 (statement-ingest)`) where the room
 * alone names it, and the slug-qualified address alone
 * (`f5t45-distill-2026-10-18`) where another task holds the same room. Both
 * resolvers refuse through here, so the candidates are spelled one way.
 */
export function ambiguous(
  input: string,
  matches: readonly FoundTask[],
  everyone: readonly AddressedTask[],
): WardError {
  const named = matches
    .map((task) => {
      const address = distinctAddress(task, everyone);
      return address === qualifiedAddress(task) && address !== taskAddress(task)
        ? address
        : `${address} (${task.record.slug})`;
    })
    .sort()
    .join(', ');
  return new WardError(`${input.toLowerCase()} is ambiguous — ${named}; name one`);
}

/**
 * The address that names `task` in the workspace as it stands — the room
 * address, or the slug-qualified one when another task holds the room
 * (design/0058-room-collisions/). For callers holding one task that must
 * speak it or hand it back to a resolver.
 */
export async function resolvableAddress(root: string, task: FoundTask): Promise<string> {
  return distinctAddress(task, await readTasks(root));
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
