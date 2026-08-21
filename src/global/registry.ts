// The machine-level workspace registry (design/0023-global-config-registry/):
// which workspaces exist on this machine, which one is the default, and which
// was used most recently — so `ward` can answer from any directory instead of
// only from inside a workspace.
//
// It is a CONVENIENCE, and the boundary that governs it is absolute
// (intent/01-concepts/06-workspace-lifecycle.md): global state may hold
// preferences and conveniences only, never anything the understanding or
// resumption of work depends on. Everything here is derivable by walking to a
// workspace and reading it; delete `workspaces.md` and every workspace is
// exactly as complete as it was. That is why nothing in this file is allowed
// to fail a command: a lost registry loses a shortcut, not work.
//
// Identity is the LOCATION (intent/01-concepts/00-domain-model.md — a
// workspace is identified by where it is), so entries are keyed by absolute
// path; the name is a label for recall, disambiguated when two workspaces
// share a basename.
import { existsSync, realpathSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { z } from 'zod';
import { WardError } from '../errors.ts';
import { type DocumentType, readDocument } from '../store/document.ts';
import { workspaceRecordType } from '../store/types.ts';
import { discoverWorkspace, isWorkspaceRoot } from '../workspace/layout.ts';
import { refuseStewardshipCopy } from '../workspace/steward.ts';
import { stateDir } from './paths.ts';
import {
  type GlobalRead,
  globalLockPath,
  readGlobal,
  reasonOf,
  withGlobalLock,
  writeGlobal,
} from './store.ts';

export const registryRecordSchema = z.object({
  type: z.literal('ward-registry'),
  /**
   * The default workspace's absolute path — a pointer INTO `workspaces`,
   * not a standalone preference: a default that names no entry means nothing,
   * and keeping the two in one document makes that unrepresentable across
   * files. A pointer at a removed entry simply resolves to no default.
   */
  default: z.string().min(1).optional(),
  workspaces: z.array(
    z.object({
      name: z.string().min(1),
      path: z.string().min(1),
      registeredAt: z.string().min(1),
      /**
       * When this workspace last BECAME the most recently used one — not the
       * last invocation inside it. Ordering is all recency is for, and an
       * invocation in the workspace already at the head changes no order, so
       * it is not written (see `touchWorkspace`). Reading it as "last used"
       * would overstate what is recorded.
       */
      lastUsedAt: z.string().min(1).optional(),
    }),
  ),
});
export type RegistryRecord = z.infer<typeof registryRecordSchema>;
export type RegistryEntry = RegistryRecord['workspaces'][number];

export const registryRecordType: DocumentType<RegistryRecord> = {
  name: 'ward-registry',
  relPath: 'workspaces.md',
  schema: registryRecordSchema,
};

const EMPTY: RegistryRecord = { type: 'ward-registry', workspaces: [] };

/** One registered workspace, as every read verb and resolver sees it. */
export interface WorkspaceListing {
  readonly name: string;
  readonly path: string;
  readonly registeredAt: string;
  readonly lastUsedAt?: string;
  readonly isDefault: boolean;
  /** The path no longer holds a workspace: reported by `list`, skipped in resolution. */
  readonly stale: boolean;
}

export type RegistryOutcome = 'registered' | 'satisfied' | 'unregistered' | 'default-set';

export interface RegistryReport {
  readonly entry: WorkspaceListing;
  readonly outcome: RegistryOutcome;
}

export function registryPath(dir: string = stateDir()): string {
  return join(dir, registryRecordType.relPath);
}

/** What the registry's writes serialize on — named here so doctor can read it. */
const REGISTRY_LOCK = 'workspace registry';

export function registryLockPath(dir: string = stateDir()): string {
  return globalLockPath(dir, REGISTRY_LOCK);
}

/**
 * The registry as listings: MRU first, the default marked, stale entries
 * flagged rather than hidden. Never throws — an unreadable registry is an
 * empty one at the point of use, and doctor is where its state is named.
 */
export async function listWorkspaces(dir: string = stateDir()): Promise<WorkspaceListing[]> {
  return listingsOf(await readRegistry(dir));
}

/** The registry read with its state kept, for the diagnostic surface (§20). */
export async function readRegistry(dir: string = stateDir()): Promise<GlobalRead<RegistryRecord>> {
  return readGlobal(dir, registryRecordType);
}

/**
 * The listings plus the one bit a surface must not swallow: whether an empty
 * answer means "nothing registered" or "the registry would not read". Both
 * degrade to the same behavior (§20's honest bit at the point of use), but
 * telling a human to register a workspace they already registered would be a
 * lie the surface could have avoided for free.
 */
export interface RegistryView {
  readonly listings: WorkspaceListing[];
  readonly unreadable: boolean;
}

export async function viewRegistry(dir: string = stateDir()): Promise<RegistryView> {
  const read = await readRegistry(dir);
  return { listings: listingsOf(read), unreadable: read.state === 'unreadable' };
}

/**
 * Register the workspace containing `from` (the caller's cwd by default).
 * Idempotent: a path already registered converges to `satisfied`, keeping the
 * name it was recorded under — a re-registration is not a rename. The first
 * workspace registered becomes the default, because a registry of one with no
 * default would make `ward workspace path` fail for no reason a human could
 * act on.
 */
export async function registerWorkspace(
  from: string,
  dir: string = stateDir(),
): Promise<RegistryReport> {
  const root = workspaceAt(from);
  if (root === null) {
    throw new WardError(
      `no Ward workspace encloses ${resolve(from)} — name one, or create it: ` +
        'ward workspace create PATH',
    );
  }
  // A stewardship copy is not a second workspace
  // (intent/01-concepts/06-workspace-lifecycle.md): it materializes the
  // enclosing workspace's record, so registering it would put a candidate copy
  // in the machine's fallback order and let a verb resolve to a preview.
  refuseStewardshipCopy(root);
  const name = await workspaceName(root);
  return mutate(dir, `workspace register ${name}`, (record) => {
    const existing = record.workspaces.find((entry) => samePath(entry.path, root));
    if (existing !== undefined) {
      return { record, entry: existing, outcome: 'satisfied' };
    }
    const entry: RegistryEntry = {
      name: uniqueName(name, record.workspaces),
      path: root,
      registeredAt: new Date().toISOString(),
    };
    return {
      record: {
        ...record,
        default: record.default ?? entry.path,
        workspaces: [...record.workspaces, entry],
      },
      entry,
      outcome: 'registered',
    };
  });
}

/**
 * Drop an entry. The registry only — nothing on disk is touched, which is
 * what makes unregistering as safe as registering: the workspace remains a
 * workspace, findable by standing in it.
 */
export async function unregisterWorkspace(
  target: string,
  dir: string = stateDir(),
): Promise<RegistryReport> {
  return mutate(dir, `workspace unregister ${target}`, (record) => {
    const entry = matchEntry(target, record);
    const remaining = record.workspaces.filter((other) => other.path !== entry.path);
    // A default pointing at a removed entry would resolve to nothing; handing
    // it to the next-most-recent keeps `ward workspace path` answering, which
    // is the whole point of having a default. The record is rebuilt rather
    // than spread, so dropping the last workspace really drops the default.
    const nextDefault = isDefaultPath(record, entry)
      ? mruOrder(remaining)[0]?.path
      : record.default;
    return {
      record: {
        type: record.type,
        ...(nextDefault === undefined ? {} : { default: nextDefault }),
        workspaces: remaining,
      },
      entry,
      outcome: 'unregistered',
    };
  });
}

/** Point the default at a registered workspace; repeating converges. */
export async function setDefaultWorkspace(
  target: string,
  dir: string = stateDir(),
): Promise<RegistryReport> {
  return mutate(dir, `workspace default ${target}`, (record) => {
    const entry = matchEntry(target, record);
    return {
      record: { ...record, default: entry.path },
      entry,
      outcome: isDefaultPath(record, entry) ? 'satisfied' : 'default-set',
    };
  });
}

/**
 * Note that an invocation ran inside `root`, if it is registered. Two rules
 * keep this cheap and failure-proof, since it rides EVERY invocation:
 *
 *   1. Nothing to change, nothing to write. Recency only exists to order the
 *      list, so a workspace already at the head of the MRU order is left
 *      alone — a day of work in one workspace writes once, and the hot path
 *      is a single small read.
 *   2. Nothing here may fail a command. A locked, unwritable, or corrupt
 *      registry means the touch does not happen; the verb the caller actually
 *      asked for is unaffected (§20).
 */
export async function touchWorkspace(root: string, dir: string = stateDir()): Promise<void> {
  try {
    const read = await readRegistry(dir);
    if (read.state !== 'read') return;
    // Deliberately off the listings: staleness would stat every registered
    // path on every invocation — including one on a dead network mount — for
    // an answer only the ordering needs.
    const mine = leadIfBehind(read.document.data.workspaces, root);
    if (mine === undefined) return;
    await mutate(
      dir,
      'workspace use',
      (record) => {
        // Re-checked under the lock: the workspace may have been touched
        // between the read above and the acquire, and N concurrent
        // invocations in the same workspace should produce one write, not N.
        const entry = leadIfBehind(record.workspaces, mine.path);
        if (entry === undefined) return { record, entry: mine, outcome: 'satisfied' };
        const touched = { ...entry, lastUsedAt: new Date().toISOString() };
        return {
          record: {
            ...record,
            workspaces: record.workspaces.map((other) =>
              other.path === entry.path ? touched : other,
            ),
          },
          entry: touched,
          outcome: 'satisfied',
        };
      },
      250,
    );
  } catch {
    // Rule 2: a recency note is never worth a failed command.
  }
}

/** The entry for `root`, unless it already leads the order (rule 1) or is unregistered. */
function leadIfBehind(entries: readonly RegistryEntry[], root: string): RegistryEntry | undefined {
  const mine = entries.find((entry) => samePath(entry.path, root));
  if (mine === undefined) return undefined;
  return mruOrder(entries)[0]?.path === mine.path ? undefined : mine;
}

// -- resolution -----------------------------------------------------------

/**
 * The workspaces a verb may fall back to, best first: the default, then the
 * most recently used. Stale entries are skipped — a path that no longer holds
 * a workspace is not an answer, and silently resolving to one would be the
 * fabrication §17 forbids.
 */
export function resolutionOrder(listings: readonly WorkspaceListing[]): WorkspaceListing[] {
  const live = listings.filter((entry) => !entry.stale);
  const preferred = live.filter((entry) => entry.isDefault);
  return [...preferred, ...live.filter((entry) => !entry.isDefault)];
}

/** Find a listing by name or by path — the two ways a human names a workspace. */
export function findListing(
  target: string,
  listings: readonly WorkspaceListing[],
): WorkspaceListing | undefined {
  return (
    listings.find((entry) => entry.name === target) ??
    listings.find((entry) => samePath(entry.path, resolve(target)))
  );
}

/**
 * The workspace a caller MEANT by a path: the walk up from it, but only when
 * the path itself exists. Without the existence check, a typo'd or bogus path
 * (`ward workspace register ./typpo`, `--workspace ghost`) resolves by walking
 * up past a directory that was never there and lands on whatever workspace
 * encloses the CWD — an explicit argument silently answered by the caller's
 * location, which is precisely the mis-targeting this codebase refuses
 * everywhere else.
 */
export function workspaceAt(target: string): string | null {
  const path = resolve(target);
  return existsSync(path) ? discoverWorkspace(path) : null;
}

/** Whether two paths name the same directory, symlinks and all. */
export function samePath(a: string, b: string): boolean {
  if (a === b) return true;
  return real(a) === real(b);
}

// -- plumbing -------------------------------------------------------------

function listingsOf(read: GlobalRead<RegistryRecord>): WorkspaceListing[] {
  if (read.state !== 'read') return [];
  const record = read.document.data;
  return mruOrder(record.workspaces).map((entry) => toListing(entry, record.default));
}

/**
 * Whether an entry is the recorded default — through `samePath`, the same
 * test the listings use, so a hand-edited registry naming the default by a
 * symlink alias cannot read as the default in one place and not the other.
 */
function isDefaultPath(record: RegistryRecord, entry: RegistryEntry): boolean {
  return record.default !== undefined && samePath(record.default, entry.path);
}

/** One entry as it reads: the default marked, staleness checked against disk. */
function toListing(entry: RegistryEntry, defaultPath: string | undefined): WorkspaceListing {
  return {
    name: entry.name,
    path: entry.path,
    registeredAt: entry.registeredAt,
    ...(entry.lastUsedAt === undefined ? {} : { lastUsedAt: entry.lastUsedAt }),
    isDefault: defaultPath !== undefined && samePath(defaultPath, entry.path),
    stale: !isWorkspaceRoot(entry.path),
  };
}

/**
 * Most-recently-used first, derived from the recorded timestamps rather than
 * stored as an order (§17 — derive shared state rather than maintain it): the
 * file's array order is then just insertion order, and two writers can never
 * disagree about what "the order" is. Never-used entries fall back to when
 * they were registered, and the path breaks ties so the answer is the same
 * every time (§6).
 */
function mruOrder<T extends RegistryEntry>(entries: readonly T[]): T[] {
  return [...entries].sort((a, b) => {
    const left = a.lastUsedAt ?? a.registeredAt;
    const right = b.lastUsedAt ?? b.registeredAt;
    return left === right ? a.path.localeCompare(b.path) : left < right ? 1 : -1;
  });
}

/** Read → change → write, serialized, with the changed entry reported back. */
async function mutate(
  dir: string,
  verb: string,
  change: (record: RegistryRecord) => {
    record: RegistryRecord;
    entry: RegistryEntry;
    outcome: RegistryOutcome;
  },
  timeoutMs?: number,
): Promise<RegistryReport> {
  try {
    return await locked(dir, verb, change, timeoutMs);
  } catch (error) {
    if (error instanceof WardError) throw error;
    // An unwritable state directory, a lock that cannot be taken: every one
    // of them reaches the caller as one legible sentence naming the file and
    // the stake, never as a stack trace out of a convenience.
    throw new WardError(
      `cannot update ${registryPath(dir)} — ${reasonOf(error)}; the registry holds ` +
        'conveniences only, so nothing in any workspace is affected',
    );
  }
}

async function locked(
  dir: string,
  verb: string,
  change: (record: RegistryRecord) => {
    record: RegistryRecord;
    entry: RegistryEntry;
    outcome: RegistryOutcome;
  },
  timeoutMs?: number,
): Promise<RegistryReport> {
  return withGlobalLock(
    dir,
    REGISTRY_LOCK,
    verb,
    async () => {
      // Re-read inside the lock: the copy a caller decided on may be stale by
      // the time the write happens, and a whole-document rewrite from a stale
      // read is exactly the lost update §17 forbids.
      const read = await readRegistry(dir);
      if (read.state === 'unreadable') {
        throw new WardError(
          `${registryPath(dir)} is not a valid workspace registry — ${read.reason}; ` +
            'it holds conveniences only, so deleting it loses nothing but the shortcuts',
        );
      }
      const before = read.state === 'read' ? read.document.data : EMPTY;
      const body = read.state === 'read' ? read.document.body : REGISTRY_BODY;
      const changed = change(before);
      if (changed.record !== before) {
        await writeGlobal(dir, registryRecordType, { data: changed.record, body });
      }
      // Reported as it now reads — including an unregistered entry, which is
      // gone from the record and therefore never the default any more.
      return {
        entry: toListing(changed.entry, changed.record.default),
        outcome: changed.outcome,
      };
    },
    timeoutMs,
  );
}

function matchEntry(target: string, record: RegistryRecord): RegistryEntry {
  const entry =
    record.workspaces.find((other) => other.name === target) ??
    record.workspaces.find((other) => samePath(other.path, resolve(target)));
  if (entry === undefined) {
    const known = record.workspaces.map((other) => other.name).join(', ');
    throw new WardError(
      `no registered workspace named '${target}'` +
        (known === '' ? ' — none are registered yet' : ` — registered: ${known}`),
    );
  }
  return entry;
}

/** The workspace's own recorded name, falling back to its directory name. */
async function workspaceName(root: string): Promise<string> {
  try {
    return (await readDocument(root, workspaceRecordType)).data.name;
  } catch {
    // A workspace whose record will not read is still a workspace on disk;
    // registering it by directory name is honest, and doctor names the record.
    return basename(root);
  }
}

/** Names are labels, so a collision suffixes rather than refusing the act. */
function uniqueName(base: string, entries: readonly RegistryEntry[]): string {
  const taken = new Set(entries.map((entry) => entry.name));
  if (!taken.has(base)) return base;
  for (let n = 2; ; n += 1) {
    const candidate = `${base}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
}

function real(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    return path;
  }
}

const REGISTRY_BODY =
  'The workspaces `ward` knows about on this machine, the default among them, and when each ' +
  'was last used — so `ward` can answer from any directory.\n\n' +
  'This file is a **convenience**. Everything in it is derivable by standing in a workspace and ' +
  'reading it; nothing about understanding or resuming work depends on it. Deleting it loses ' +
  'the shortcuts and nothing else — re-register with `ward workspace register`.';
