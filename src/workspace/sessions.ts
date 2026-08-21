// Session records (design/0004-work-spine/, extended by
// design/0028-launched-sessions/): the record side of a session — allocation,
// the scope it belongs to, and the append-only lifecycle trail. Ward now
// LAUNCHES the agent for a workspace-scope session (src/agent/run.ts drives
// that), but the record is still the authority: it is written BEFORE any
// process starts and it outlives every run, because open ≠ running
// (intent/01-concepts/02-sessions-and-lifecycle.md).
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { WardError } from '../errors.ts';
import { readDocument, writeDocument } from '../store/document.ts';
import { withStoreLock } from '../store/lock.ts';
import {
  type SessionEvent,
  type SessionRecord,
  sessionRecordType,
  sessionScopeOf,
} from '../store/types.ts';
import { commitRecords, readTasks, resolveOpenTask, smallestFree } from './scan.ts';
import { readTaskWorktrees } from './worktrees.ts';

export interface OpenSessionOptions {
  readonly handle?: string;
  readonly workingDirectory?: string;
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

export async function openSession(
  root: string,
  taskCode: string,
  purpose: string,
  options: OpenSessionOptions,
): Promise<SessionRecord> {
  // The id-allocation scan through the commit is the serialized critical
  // section (§17, design/0013-telemetry-and-serialized-writes/).
  return withStoreLock(root, `session open ${taskCode}`, async () => {
    const task = await resolveOpenTask(root, taskCode);
    const worktrees = await readTaskWorktrees(root, task.dir);
    const id = await allocateId(root, task.record.slug);
    return writeOpened(root, task.dir, {
      id,
      scope: 'task',
      task: task.record.code,
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
  purpose: string,
  options: OpenSessionOptions,
): Promise<SessionRecord> {
  return withStoreLock(root, 'session open (workspace)', async () => {
    const id = await allocateId(root, WORKSPACE_SESSION_SLUG);
    return writeOpened(root, WORKSPACE_SCOPE_DIR, {
      id,
      scope: 'workspace',
      purpose,
      workingDirectory: options.workingDirectory ?? '.',
      ...(options.handle === undefined ? {} : { handle: options.handle }),
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
 * design/0028-launched-sessions/ it also carries the workspace's own sessions,
 * which is why ids remain unique among OPEN sessions workspace-wide.
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
 * when it wants a finished session's history. An open session wins over a
 * closed one carrying the same id, because ids are unique among OPEN sessions
 * and only reused after close (intent/01-concepts/00-domain-model.md): the
 * open one is the thing a bare id addresses today.
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
 * Ids are unique among open sessions workspace-wide, so a bare id addresses
 * every operation; discriminators are reused only after close
 * (intent/01-concepts/00-domain-model.md, Identity). The scan covers every
 * scope, which is what keeps a workspace session and a task session from
 * both answering to `workspace-1`.
 */
async function allocateId(root: string, slug: string): Promise<string> {
  const taken = (await readOpenSessions(root))
    .filter((session) => session.record.id.startsWith(`${slug}-`))
    .map((session) => Number.parseInt(session.record.id.slice(slug.length + 1), 10))
    .filter((n) => !Number.isNaN(n));
  return `${slug}-${smallestFree(taken)}`;
}

interface OpenedFields {
  readonly id: string;
  readonly scope: SessionRecord['scope'];
  readonly task?: string;
  readonly purpose: string;
  readonly workingDirectory: string;
  readonly handle?: string;
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
    purpose: fields.purpose,
    workingDirectory: fields.workingDirectory,
    ...(fields.handle === undefined ? {} : { handle: fields.handle }),
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
