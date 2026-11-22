// Hand-offs between floors (design/0067-floor-dispatch/): the first built
// slice of the messaging seam (intent/02-subsystems/02-messaging-coordination.md).
// A session hands a unit of work to a floor it names — the direct path, where
// the sender knows the target — and the hand-off is a record before it is
// anything else: one commit opens the task on the target floor, records its
// brief, and writes the hand-off beside them.
//
// What is stored is only what cannot be derived: who sent it, to which floor,
// when. Where it stands is read at the leaves every time it is asked — a
// hand-off is PICKED UP once a session has been opened on its task (or a
// floor's session has named it, design/0078-task-named-windows/), and
// CLOSED when the task is, with the task's outcome — so nothing here can
// disagree with the task it describes (intent/01-concepts/00-domain-model.md,
// Status: recorded at the leaves, derived above).
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { WardError } from '../errors.ts';
import { readDocument, writeDocument } from '../store/document.ts';
import { withStoreLock } from '../store/lock.ts';
import {
  type DispatchRecord,
  dispatchRecordType,
  type SessionRecord,
  sessionScopeOf,
  type TaskRecord,
} from '../store/types.ts';
import { distinctAddress, parseTaskAddress, qualifiedAddress, taskAddress } from './address.ts';
import { briefBody, writeBrief } from './briefs.ts';
import { commitRecords, type FoundTask, readTasks, requireSlug } from './scan.ts';
import { findSession, type OpenSessionListing, readSessions } from './sessions.ts';
import { writeOpenedTask } from './tasks.ts';

export interface DispatchOptions {
  /** The floor the work is handed to. Named by the sender: a claim never reroutes it. */
  readonly to: number;
  /** The brief's text, as `ward task brief` takes it. */
  readonly brief: string;
  readonly purpose?: string;
  readonly repositories?: readonly string[];
  /** The session the caller declares itself to be (`WARD_AGENT`), unverified. */
  readonly declared?: string;
}

export interface DispatchReport {
  readonly task: FoundTask;
  readonly address: string;
  readonly record: DispatchRecord;
  /** Workspace-relative path of the brief recorded with it. */
  readonly brief: string;
}

/** Who a hand-off is from, as far as the record can say. */
export interface Sender {
  readonly session?: string;
  readonly floor?: number;
}

const PROJECT_DIR = /^projects\/(\d+)-/;

/**
 * The sender a declaration names: its recorded session, and the floor that
 * session is responsible for (a floor's own session) or works on (a session
 * of a task on a floor). A workspace-scope session has no floor — it is
 * above them — and a declaration that names no session here (`WARD_AGENT=1`,
 * an id from elsewhere) is no sender at all: provenance is recorded only
 * where a source exists.
 */
export function senderOf(listing: OpenSessionListing | undefined): Sender {
  if (listing === undefined) return {};
  const { record, scopeDir } = listing;
  switch (sessionScopeOf(record)) {
    case 'workspace':
      return { session: record.id };
    case 'project':
      return { session: record.id, ...(record.floor === undefined ? {} : { floor: record.floor }) };
    case 'task': {
      const floor = PROJECT_DIR.exec(scopeDir)?.[1];
      return {
        session: record.id,
        ...(floor === undefined ? {} : { floor: Number.parseInt(floor, 10) }),
      };
    }
  }
}

/**
 * Hand a task to a floor: open it there, record its brief, and record the
 * hand-off — one store write, one commit. Everything that can refuse does so
 * before the lock: an empty brief, a bad slug, a sender handing work to its
 * own floor (that is `ward task open`, and a hand-off to oneself would have
 * no one to learn of it). A closed or missing floor refuses under the lock,
 * where the floor is read, before anything is written.
 */
export async function dispatchTask(
  root: string,
  slugInput: string,
  options: DispatchOptions,
  now: Date = new Date(),
): Promise<DispatchReport> {
  const slug = requireSlug(slugInput);
  const body = briefBody(options.brief);
  const sender = senderOf(await declaredListing(root, options.declared));
  if (sender.floor === options.to) {
    throw new WardError(
      `floor ${options.to} is the floor you are on — a hand-off goes to another floor; ` +
        `open the task here with: ward task open ${slug} --project ${options.to}`,
    );
  }
  return withStoreLock(root, `task dispatch ${slug}`, async () => {
    const task = await writeOpenedTask(root, slug, {
      floor: options.to,
      ...(options.purpose === undefined ? {} : { purpose: options.purpose }),
      ...(options.repositories === undefined ? {} : { repositories: options.repositories }),
    });
    const address = taskAddress(task);
    const brief = await writeBrief(root, task, body, sender.session, now);
    const record: DispatchRecord = {
      type: 'dispatch',
      task: address,
      to: options.to,
      ...(sender.session === undefined ? {} : { fromSession: sender.session }),
      ...(sender.floor === undefined ? {} : { fromFloor: sender.floor }),
      sentAt: now.toISOString(),
    };
    await writeDocument(root, dispatchRecordType(task.dir), {
      data: record,
      body:
        `Task \`${address}\` was handed to floor ${options.to} by ${describeSender(record)}. ` +
        'This document records the hand-off only. Where the work stands is read from the task ' +
        `beside it and its sessions: \`ward task show ${address}\`.`,
    });
    commitRecords(
      root,
      `Dispatch task ${slug} (${address}) to floor ${options.to}${fromClause(record)}`,
      task.dir,
    );
    return { task, address, record, brief: brief.path };
  });
}

async function declaredListing(
  root: string,
  declared: string | undefined,
): Promise<OpenSessionListing | undefined> {
  if (declared === undefined) return undefined;
  try {
    return await findSession(root, declared);
  } catch (error) {
    if (error instanceof WardError) return undefined;
    throw error;
  }
}

/** Who sent a hand-off, in words: the floor when one is recorded, then the session. */
export function describeSender(record: DispatchRecord): string {
  if (record.fromFloor !== undefined) {
    return (
      `floor ${record.fromFloor}` +
      (record.fromSession === undefined ? '' : ` (session ${record.fromSession})`)
    );
  }
  if (record.fromSession !== undefined) return `session ${record.fromSession}`;
  return 'a human at a terminal';
}

function fromClause(record: DispatchRecord): string {
  if (record.fromFloor !== undefined) return ` from floor ${record.fromFloor}`;
  if (record.fromSession !== undefined) return ` from ${record.fromSession}`;
  return '';
}

// -- where a hand-off stands: derived, never stored ----------------------------

export type DispatchState = 'pending' | 'picked-up' | 'closed';

/**
 * The session that picked a hand-off up: the first one opened on its task, or
 * the first of its floor's sessions to name it (design/0078-task-named-windows/).
 */
export interface PickUp {
  readonly session: string;
  readonly at: string;
}

/**
 * The first session to take a task up — open or closed, since a session that
 * has ended still picked the work up. Undefined while none has. A task's own
 * session takes it up when it is opened; a floor's session, when its trail
 * first names the task (`named`, the task's slug-qualified address) — the same
 * act in substance, an agent now working the task, and the one a floor's
 * session makes when the hand-off's line reaches it.
 */
export function pickUpOf(sessions: readonly SessionRecord[], named?: string): PickUp | undefined {
  let first: PickUp | undefined;
  for (const session of sessions) {
    const at = takenUpAt(session, named);
    if (at !== undefined && (first === undefined || at < first.at)) {
      first = { session: session.id, at };
    }
  }
  return first;
}

function takenUpAt(session: SessionRecord, named: string | undefined): string | undefined {
  if (sessionScopeOf(session) !== 'project') return session.openedAt;
  if (named === undefined) return undefined;
  return session.events?.find(
    (event) => event.event === 'task-named' && sameRoom(event.task, named),
  )?.at;
}

/**
 * Whether a `task-named` event's address names the task `named` spells. The
 * sessions asked are the task's floor's own, so the room and slug are enough:
 * together they name one task on a floor for good. The floor half is not
 * compared, because a renumber (design/0081-floor-renumber/) changes it while
 * the trail keeps the address as it was said — and a hand-off picked up
 * before the renumber was still picked up.
 */
function sameRoom(said: string | undefined, named: string): boolean {
  if (said === undefined) return false;
  if (said === named) return true;
  const a = parseTaskAddress(said);
  const b = parseTaskAddress(named);
  return a !== null && b !== null && a.slug !== undefined && a.room === b.room && a.slug === b.slug;
}

/**
 * Where a hand-off stands, from its task and the sessions that may have taken
 * it up: `closed` once the task is — whatever came before, the outcome is the
 * answer — `picked-up` once a session has (`pickUpOf`), `pending` until then.
 */
export function dispatchState(
  task: TaskRecord,
  sessions: readonly SessionRecord[],
  named?: string,
): DispatchState {
  if (task.state === 'closed') return 'closed';
  return pickUpOf(sessions, named) === undefined ? 'pending' : 'picked-up';
}

/** One hand-off with everything derived about it. */
export interface DispatchStanding {
  readonly record: DispatchRecord;
  readonly task: FoundTask;
  /** The address that names the task now (design/0058-room-collisions/). */
  readonly address: string;
  readonly state: DispatchState;
  readonly pickedUp?: PickUp;
}

/** A floor task's directory → its floor's project directory. */
const FLOOR_OF_TASK = /^(projects\/[^/]+)\/tasks\/[^/]+$/;

/** The hand-off a task was opened by, with where it stands — undefined for a task nobody handed over. */
export async function dispatchOf(
  root: string,
  task: FoundTask,
  everyone: readonly FoundTask[],
): Promise<DispatchStanding | undefined> {
  const type = dispatchRecordType(task.dir);
  if (!existsSync(join(root, type.relPath))) return undefined;
  const record = (await readDocument(root, type)).data;
  // The task's own sessions, and its floor's, which may have named it (0078).
  const floorDir = FLOOR_OF_TASK.exec(task.dir)?.[1];
  const sessions = [
    ...(await readSessions(root, task.dir)),
    ...(floorDir === undefined ? [] : await readSessions(root, floorDir)),
  ];
  const named = qualifiedAddress(task);
  const pickedUp = pickUpOf(sessions, named);
  return {
    record,
    task,
    address: distinctAddress(task, everyone),
    state: dispatchState(task.record, sessions, named),
    ...(pickedUp === undefined ? {} : { pickedUp }),
  };
}

/** Every hand-off in the workspace, oldest first. A read: takes no lock. */
export async function readDispatches(root: string): Promise<DispatchStanding[]> {
  const everyone = await readTasks(root);
  const found: DispatchStanding[] = [];
  for (const task of everyone) {
    const standing = await dispatchOf(root, task, everyone);
    if (standing !== undefined) found.push(standing);
  }
  return found.sort((a, b) => a.record.sentAt.localeCompare(b.record.sentAt));
}

/** The narrowing `ward task dispatches` takes; every field present must hold. */
export interface DispatchFilter {
  readonly from?: number;
  readonly to?: number;
  readonly state?: DispatchState;
  /** Sent by this session — how a sender with no floor asks for its own. */
  readonly session?: string;
}

export function matchesDispatchFilter(standing: DispatchStanding, filter: DispatchFilter): boolean {
  const { record } = standing;
  if (filter.from !== undefined && record.fromFloor !== filter.from) return false;
  if (filter.to !== undefined && record.to !== filter.to) return false;
  if (filter.state !== undefined && standing.state !== filter.state) return false;
  if (filter.session !== undefined && record.fromSession !== filter.session) return false;
  return true;
}

/**
 * The filter that selects a declared session's own hand-offs: its floor's
 * when it has one — a floor's hand-offs outlive any one of its sessions — and
 * the session's own when it stands above the floors.
 */
export async function ownDispatchFilter(
  root: string,
  declared: string | undefined,
): Promise<DispatchFilter> {
  const sender = senderOf(await declaredListing(root, declared));
  if (sender.floor !== undefined) return { from: sender.floor };
  if (sender.session !== undefined) return { session: sender.session };
  throw new WardError(
    '--mine needs a recorded session to ask for: set WARD_AGENT to your session id, or name ' +
      'the floor with --from FLOOR',
  );
}
