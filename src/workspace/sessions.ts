// Session records (design/0004-work-spine/, extended by
// design/0029-launched-sessions/): the record side of a session — allocation,
// the scope it belongs to, and the append-only lifecycle trail. Ward now
// LAUNCHES the agent for a workspace-scope session (src/agent/run.ts drives
// that), but the record is still the authority: it is written BEFORE any
// process starts and it outlives every run, because open ≠ running
// (intent/01-concepts/02-sessions-and-lifecycle.md).
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { WardError } from '../errors.ts';
import { readMachine } from '../global/machine.ts';
import { readDocument, writeDocument } from '../store/document.ts';
import { withStoreLock } from '../store/lock.ts';
import {
  type SessionEvent,
  type SessionRecord,
  sessionRecordType,
  sessionScopeOf,
} from '../store/types.ts';
import { commitRecords, readTasks, resolveOpenTask } from './scan.ts';
import { readTaskWorktrees } from './worktrees.ts';

export interface OpenSessionOptions {
  readonly handle?: string;
  readonly workingDirectory?: string;
  /** What the agent was started with — recorded only where Ward did the starting. */
  readonly model?: string;
  readonly effort?: string;
}

/**
 * The id slug of a workspace-scope session. The scope's own plain name, the
 * same choice the standing project made for the same reason: ids read
 * `workspace-1`, `workspace-2`, and a human seeing one in `ward session
 * close ID` knows what it is responsible for without a lookup.
 */
const WORKSPACE_SESSION_SLUG = 'workspace';

/** Sessions of the workspace itself live at the root — the scope's own level. */
const WORKSPACE_SCOPE_DIR = '';

/**
 * What a workspace-scope session is for when the opener says nothing
 * (design/0034-workspace-session-shorthand/): coordinating work — such a
 * session is opened to receive and route work, not to do one named piece of
 * it; the tasks it opens carry their own purposes. Ward states that on the
 * human's behalf, stamped with the instant the record was opened, so two
 * such sessions read apart in a list and the phrase is a fact about THIS
 * record rather than a placeholder. The instant is `openedAt` itself — the
 * same value, never a second clock read — trimmed to the second because a
 * purpose is read by people.
 */
export function defaultWorkspaceSessionPurpose(openedAt: string): string {
  return `Coordinating work · opened ${openedAt.replace(/\.\d{3}Z$/, 'Z')}`;
}

export async function openSession(
  root: string,
  taskCode: string,
  purpose: string | undefined,
  options: OpenSessionOptions,
): Promise<SessionRecord> {
  // A task session states its purpose (design/0034-workspace-session-shorthand/):
  // when you open a task you have one in mind, and several episodes can run
  // against one task, so the purpose is what tells them apart on the log.
  // Only a workspace-scope session may leave it out — there Ward states one
  // on the human's behalf (`defaultWorkspaceSessionPurpose`). Refused before
  // the lock, so nothing is read or written for a call that cannot proceed.
  if (purpose === undefined) {
    throw new WardError(
      `a task session states its purpose — ward session open ${taskCode} --purpose TEXT ` +
        '(only a workspace-scope session, opened with no TASK, may leave it out)',
    );
  }
  // The id-allocation scan through the commit is the serialized critical
  // section (§17, design/0013-telemetry-and-serialized-writes/).
  return withStoreLock(root, `session open ${taskCode}`, async () => {
    const task = await resolveOpenTask(root, taskCode);
    const worktrees = await readTaskWorktrees(root, task.dir);
    const machine = (await readMachine()).name;
    const id = await allocateId(root, task.record.slug, machine);
    return writeOpened(root, task.dir, {
      id,
      scope: 'task',
      task: task.record.code,
      machine,
      purpose,
      workingDirectory: options.workingDirectory ?? worktrees[0]?.path ?? '.',
      ...(options.handle === undefined ? {} : { handle: options.handle }),
      subject: `Open session ${id} on task ${taskCode}`,
    });
  });
}

/**
 * Open a session at WORKSPACE scope: no task, and no task invented to hold it
 * (levels are elided, not faked — intent/01-concepts/00-domain-model.md). The
 * record lands in `sessions/` at the root, the workspace's own level, and its
 * working directory defaults to the root, which is where a workspace-scope
 * agent stands to load workspace-wide context.
 */
export async function openWorkspaceSession(
  root: string,
  purpose: string | undefined,
  options: OpenSessionOptions,
): Promise<SessionRecord> {
  return withStoreLock(root, 'session open (workspace)', async () => {
    const machine = (await readMachine()).name;
    const id = await allocateId(root, WORKSPACE_SESSION_SLUG, machine);
    return writeOpened(root, WORKSPACE_SCOPE_DIR, {
      id,
      scope: 'workspace',
      machine,
      purpose,
      workingDirectory: options.workingDirectory ?? '.',
      ...(options.handle === undefined ? {} : { handle: options.handle }),
      ...(options.model === undefined ? {} : { model: options.model }),
      ...(options.effort === undefined ? {} : { effort: options.effort }),
      subject: `Open session ${id} at workspace scope`,
    });
  });
}

export async function closeSession(root: string, id: string): Promise<SessionRecord> {
  return withStoreLock(root, `session close ${id}`, async () => {
    const open = await requireOpenSession(root, id);
    const closedAt = new Date().toISOString();
    const record = withEvent(
      { ...open.record, state: 'closed', closedAt },
      {
        event: 'closed',
        at: closedAt,
      },
    );
    await writeSession(root, open.scopeDir, record);
    commitRecords(root, `Close session ${id}`, sessionRecordType(open.scopeDir, id).relPath);
    return record;
  });
}

/**
 * Append one lifecycle event to an open session's record and commit it. The
 * trail is what makes a struggling resume visible: a `resume-failed` with its
 * cause is a recorded fact, where a silent retry is indistinguishable from a
 * session that is open and healthy (the intent's session-log contract).
 */
export async function appendSessionEvent(
  root: string,
  id: string,
  event: SessionEvent['event'],
  cause?: string,
): Promise<SessionRecord> {
  return withStoreLock(root, `session ${event} ${id}`, async () => {
    const open = await requireOpenSession(root, id);
    const record = withEvent(open.record, {
      event,
      at: new Date().toISOString(),
      ...(cause === undefined ? {} : { cause }),
    });
    await writeSession(root, open.scopeDir, record);
    commitRecords(
      root,
      `Record ${event} on session ${id}`,
      sessionRecordType(open.scopeDir, id).relPath,
    );
    return record;
  });
}

/**
 * Append an event to a record in hand. The array is append-only by discipline:
 * nothing here (or anywhere) rewrites or drops an entry, so the trail reads in
 * the order it happened. It lives ON the session document rather than in a
 * log beside it because a session is one document in a store of typed
 * documents (ADR 0005) — one read answers "what is this session, and what has
 * happened to it?", and appends never collide because every writer holds the
 * store lock (§17).
 */
export function withEvent(record: SessionRecord, event: SessionEvent): SessionRecord {
  return { ...record, events: [...(record.events ?? []), event] };
}

export async function readSessions(root: string, scopeDir: string): Promise<SessionRecord[]> {
  const dir = join(root, sessionsDir(scopeDir));
  if (!existsSync(dir)) return [];
  const records: SessionRecord[] = [];
  for (const file of readdirSync(dir)
    .filter((name) => name.endsWith('.md'))
    .sort()) {
    records.push((await readDocument(root, sessionRecordType(scopeDir, file.slice(0, -3)))).data);
  }
  return records;
}

export interface OpenSessionListing {
  /** The scope directory the record lives under; empty for workspace scope. */
  readonly scopeDir: string;
  readonly record: SessionRecord;
}

/**
 * Every open session in the workspace, at every scope. Exported since
 * design/0022-shell-completion/, so `session close ID` completes from the
 * very listing `closeSession` resolves against — one reader, so what the
 * shell offers and what the verb accepts cannot disagree. Since
 * design/0029-launched-sessions/ it also carries the workspace's own sessions,
 * at every scope.
 */
export async function readOpenSessions(root: string): Promise<OpenSessionListing[]> {
  return (await readAllSessions(root)).filter((listing) => listing.record.state === 'open');
}

/** Every session record in the workspace, at every scope, open and closed. */
export async function readAllSessions(root: string): Promise<OpenSessionListing[]> {
  const listings: OpenSessionListing[] = [];
  for (const scopeDir of [
    WORKSPACE_SCOPE_DIR,
    ...(await readTasks(root)).map((task) => task.dir),
  ]) {
    for (const record of await readSessions(root, scopeDir)) {
      listings.push({ scopeDir, record });
    }
  }
  return listings;
}

/**
 * Resolve a bare id to a session, open or closed — the read a reflection makes
 * when it wants a finished session's history. Since
 * design/0038-machine-bound-sessions/ a bare id addresses ONE session over the
 * whole history of the workspace, not merely one among those open: numbers are
 * never reused and the machine is part of the id. The open-wins tie-break is
 * kept for the records that predate that rule, where a slug's numbers really
 * were recycled after close.
 */
export async function findSession(root: string, id: string): Promise<OpenSessionListing> {
  const matches = (await readAllSessions(root)).filter((session) => session.record.id === id);
  const match = matches.find((session) => session.record.state === 'open') ?? matches.at(-1);
  if (match === undefined) {
    throw new WardError(`no session has id '${id}' — see: ward status`);
  }
  return match;
}

/** Resolve a bare id to its open session, at whatever scope holds it. */
export async function requireOpenSession(root: string, id: string): Promise<OpenSessionListing> {
  const open = (await readOpenSessions(root)).find((session) => session.record.id === id);
  if (open === undefined) {
    throw new WardError(`no open session has id '${id}' — closed stays closed, and ids are bare`);
  }
  return open;
}

/** How a session record reads in prose, for a human scanning `sessions/`. */
export function describeScope(record: SessionRecord): string {
  return sessionScopeOf(record) === 'workspace' ? 'workspace scope' : `task ${record.task ?? '?'}`;
}

function sessionsDir(scopeDir: string): string {
  return scopeDir === '' ? 'sessions' : `${scopeDir}/sessions`;
}

/**
 * A session id, taken apart: `workspace-7@gcp` is slug `workspace`, number 7,
 * machine `gcp`. Ids written before design/0038-machine-bound-sessions/ carry
 * no `@`, and their machine parses as undefined — unrecorded, never guessed.
 */
export interface SessionIdParts {
  readonly slug: string;
  readonly n: number;
  readonly machine?: string;
}

const SESSION_ID = /^(?<slug>.+)-(?<n>\d+)(?:@(?<machine>[^@]+))?$/;

/** The parts of an id Ward allocated, or null for anything else. */
export function parseSessionId(id: string): SessionIdParts | null {
  const groups = SESSION_ID.exec(id)?.groups;
  if (groups === undefined) return null;
  const n = Number.parseInt(groups.n ?? '', 10);
  if (Number.isNaN(n)) return null;
  return {
    slug: groups.slug ?? '',
    n,
    ...(groups.machine === undefined ? {} : { machine: groups.machine }),
  };
}

/**
 * Allocate the next id for a slug on THIS machine: `<slug>-<n>@<machine>`,
 * where `n` is one more than the highest ever recorded — never the smallest
 * free one (design/0038-machine-bound-sessions/).
 *
 * Two rules, each closing a way the record could be falsified:
 *
 * - **The machine is part of the id.** Two clones of one workspace, on two
 *   machines, each allocating from their own records would otherwise mint the
 *   same id, and the git sync that joins them is an add/add conflict on two
 *   different sessions' records.
 * - **A number is never reused.** The scan reads every session at every
 *   scope, OPEN AND CLOSED, because reusing a closed session's number would
 *   have the next open overwrite that record — spending "closed stays closed"
 *   (intent/01-concepts/02-sessions-and-lifecycle.md) on an id nobody needed
 *   to recycle. Nothing is stored to count with: the records ARE the counter,
 *   read under the same lock that writes them (§17).
 *
 * Ids with no machine — everything written before this entry — count toward
 * this machine's numbering, so the sequence a human reads keeps climbing
 * (`workspace-6` is followed by `workspace-7@gcp`) instead of restarting at
 * one beside them.
 */
async function allocateId(root: string, slug: string, machine: string): Promise<string> {
  const used = (await readAllSessions(root))
    .map((session) => parseSessionId(session.record.id))
    .filter((parts) => parts !== null && parts.slug === slug)
    .filter((parts) => parts?.machine === undefined || parts.machine === machine)
    .map((parts) => parts?.n ?? 0);
  return `${slug}-${Math.max(0, ...used) + 1}@${machine}`;
}

interface OpenedFields {
  readonly id: string;
  readonly scope: SessionRecord['scope'];
  readonly task?: string;
  /** Absent only at workspace scope, where the record states one itself. */
  readonly purpose?: string | undefined;
  readonly workingDirectory: string;
  readonly handle?: string;
  /** This machine, always — a record Ward writes always knows where it was written. */
  readonly machine: string;
  readonly model?: string;
  readonly effort?: string;
  readonly subject: string;
}

/** One writer for both scopes: the record, its `opened` event, and the commit. */
async function writeOpened(
  root: string,
  scopeDir: string,
  fields: OpenedFields,
): Promise<SessionRecord> {
  const openedAt = new Date().toISOString();
  const record: SessionRecord = {
    type: 'session',
    id: fields.id,
    scope: fields.scope,
    ...(fields.task === undefined ? {} : { task: fields.task }),
    purpose: fields.purpose ?? defaultWorkspaceSessionPurpose(openedAt),
    workingDirectory: fields.workingDirectory,
    ...(fields.handle === undefined ? {} : { handle: fields.handle }),
    machine: fields.machine,
    ...(fields.model === undefined ? {} : { model: fields.model }),
    ...(fields.effort === undefined ? {} : { effort: fields.effort }),
    state: 'open',
    events: [{ event: 'opened', at: openedAt }],
    openedAt,
  };
  await writeSession(root, scopeDir, record);
  commitRecords(root, fields.subject, sessionRecordType(scopeDir, fields.id).relPath);
  return record;
}

async function writeSession(root: string, scopeDir: string, record: SessionRecord): Promise<void> {
  await writeDocument(root, sessionRecordType(scopeDir, record.id), {
    data: record,
    body:
      sessionScopeOf(record) === 'workspace'
        ? `Session \`${record.id}\` at workspace scope.`
        : `Session \`${record.id}\` of task \`${record.task ?? '?'}\`.`,
  });
}
