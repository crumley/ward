// Session records (design/0004-work-spine/, extended by
// design/0029-launched-sessions/): the record side of a session — allocation,
// the scope it belongs to, and the append-only lifecycle trail. Ward now
// LAUNCHES the agent for a workspace-scope session (src/agent/run.ts drives
// that), but the record is still the authority: it is written BEFORE any
// process starts and it outlives every run, because open ≠ running
// (intent/01-concepts/02-sessions-and-lifecycle.md).
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { isAttending } from '../agent/placement.ts';
import { WardError } from '../errors.ts';
import { readMachine } from '../global/machine.ts';
import { readDocument, writeDocument } from '../store/document.ts';
import { requireFormatFor } from '../store/format.ts';
import { withStoreLock } from '../store/lock.ts';
import {
  type HostedKind,
  type SessionEvent,
  type SessionRecord,
  sessionRecordType,
  sessionScopeOf,
} from '../store/types.ts';
import { addressMatches, parseTaskAddress, qualifiedAddress, taskFloor } from './address.ts';
import { resolveProject } from './projects.ts';
import { commitRecords, type FoundTask, projectDirs, readTasks, resolveOpenTask } from './scan.ts';

export interface OpenSessionOptions {
  readonly handle?: string;
  readonly workingDirectory?: string;
  /** What the agent was started with — recorded only where Ward did the starting. */
  readonly model?: string;
  readonly effort?: string;
  /**
   * The session the caller declares itself to be — WARD_AGENT, unverified.
   * It becomes the record's `parent` only if it names a session here
   * (`parentOf`, design/0052-session-parent-link/).
   */
  readonly startedBy?: string;
  /**
   * The detached host the launch is placed in, recorded on the `opened` event
   * (design/0031-detached-session-hosting/); absent for a foreground run.
   */
  readonly host?: HostedKind;
  /**
   * Work that must run INSIDE the store write that records the open, after its
   * commit: the hosted open's probe, host lookup-or-mint, and window create
   * (design/0031-detached-session-hosting/, the race), so two concurrent opens
   * on an empty floor cannot each mint a host.
   */
  readonly withinLock?: (opened: OpenSessionListing) => Promise<void>;
  /**
   * The task a floor session opens working (design/0078-task-named-windows/):
   * an address of an open task on the session's own floor, recorded as a
   * `task-named` event beside `opened`. Floor scope only.
   */
  readonly task?: string;
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

/**
 * The id slug of a floor's own session (design/0051-floor-scope-sessions/):
 * `f7` for floor 7, so ids read `f7-1@mbp` — the floor half of the task
 * address `f7t14`, which a human already reads as "floor 7". The scope and
 * its referent in two characters, like `workspace` for the workspace.
 */
export function floorSessionSlug(floor: number): string {
  return `f${floor}`;
}

/**
 * What a floor session is for when the opener says nothing
 * (design/0051-floor-scope-sessions/): the floor's counterpart of
 * `defaultWorkspaceSessionPurpose`. A floor session is opened to receive the
 * floor's work and route it — the tasks it opens carry the purposes — so the
 * kind of session stands as its purpose, naming the floor it coordinates.
 */
export function defaultFloorSessionPurpose(floor: number, openedAt: string): string {
  return `Coordinating floor ${floor} · opened ${openedAt.replace(/\.\d{3}Z$/, 'Z')}`;
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
  // Only a workspace or floor session may leave it out — there Ward states
  // one on the human's behalf (`defaultWorkspaceSessionPurpose`,
  // `defaultFloorSessionPurpose`). Refused before
  // the lock, so nothing is read or written for a call that cannot proceed.
  if (purpose === undefined) {
    throw new WardError(
      `a task session states its purpose — ward session open ${taskCode} --purpose TEXT ` +
        '(only a workspace or floor session, opened with no TASK, may leave it out)',
    );
  }
  // The id-allocation scan through the commit is the serialized critical
  // section (§17, design/0013-telemetry-and-serialized-writes/).
  return withStoreLock(root, `session open ${taskCode}`, async () => {
    const task = await resolveOpenTask(root, taskCode);
    const machine = (await readMachine()).name;
    const id = await allocateId(root, task.record.slug, machine);
    return writeOpened(root, task.dir, {
      id,
      scope: 'task',
      task: task.record.code,
      machine,
      purpose,
      // Every session starts at the workspace root
      // (design/0057-context-from-root/), so the root is the honest default:
      // the first worktree was a guess, and after the move to `floors/` a
      // guess that names a path that moved. `--dir` still records what the
      // caller names.
      workingDirectory: options.workingDirectory ?? '.',
      ...(options.handle === undefined ? {} : { handle: options.handle }),
      ...(options.startedBy === undefined ? {} : { startedBy: options.startedBy }),
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
      ...(options.startedBy === undefined ? {} : { startedBy: options.startedBy }),
      ...hosting(options),
      subject: `Open session ${id} at workspace scope`,
    });
  });
}

/**
 * Open a session at PROJECT scope — a floor's own session
 * (design/0051-floor-scope-sessions/), responsible for the floor's outcome
 * rather than for any one task on it. The record lands beside the project
 * record (`projects/<floor>-<slug>/sessions/`), the floor's own level, as a
 * task's sessions land beside the task's; its working directory defaults to
 * the workspace root, where the agent stands to read every floor and route
 * work, exactly as a workspace-scope session does. The ground floor is a floor
 * like any other here: its session owns the workspace's own work, where a
 * workspace-scope session holds the status of every floor.
 */
export async function openFloorSession(
  root: string,
  floor: number,
  purpose: string | undefined,
  options: OpenSessionOptions,
): Promise<SessionRecord> {
  return withStoreLock(root, `session open --floor ${floor}`, async () => {
    const project = await resolveProject(root, floor);
    // A closed floor's outcome is settled; a session responsible for it would
    // own nothing. Paused is not closed — a paused floor still has an owner.
    if (project.record.state === 'closed') {
      throw new WardError(`project on floor ${floor} is closed — a session cannot open on it`);
    }
    const named =
      options.task === undefined ? undefined : await floorTask(root, floor, options.task);
    const machine = (await readMachine()).name;
    const id = await allocateId(root, floorSessionSlug(floor), machine);
    return writeOpened(root, project.dir, {
      id,
      scope: 'project',
      floor,
      ...(named === undefined ? {} : { named: qualifiedAddress(named) }),
      machine,
      purpose,
      workingDirectory: options.workingDirectory ?? '.',
      ...(options.handle === undefined ? {} : { handle: options.handle }),
      ...(options.model === undefined ? {} : { model: options.model }),
      ...(options.effort === undefined ? {} : { effort: options.effort }),
      ...(options.startedBy === undefined ? {} : { startedBy: options.startedBy }),
      ...hosting(options),
      subject: `Open session ${id} on floor ${floor}`,
    });
  });
}

/**
 * Close a session's record — and, through `afterClose`, run whatever must
 * follow the record mutation inside the same store write: the hosted
 * session's teardown (design/0031-detached-session-hosting/), record first and
 * window second, serialized against a resume that would place a new one.
 */
export async function closeSession(
  root: string,
  id: string,
  afterClose?: (closed: OpenSessionListing) => Promise<void>,
): Promise<SessionRecord> {
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
    await afterClose?.({ scopeDir: open.scopeDir, record });
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

export interface ResumeRecording {
  /** The detached host the resumed run is placed in; absent for a foreground one. */
  readonly host?: HostedKind;
  /**
   * Checked under the lock BEFORE the event is written: it may refuse (a live
   * hosted window means the run is still going) or return a cause for the
   * `resumed` event (how the previous hosted run ended).
   */
  readonly guard?: (open: OpenSessionListing) => Promise<string | undefined>;
  /** Run under the lock AFTER the event's commit — the hosted resume's placement. */
  readonly withinLock?: (resumed: OpenSessionListing) => Promise<void>;
}

/**
 * Append the `resumed` event (design/0029-launched-sessions/), with the
 * hosted resume's gate and placement inside the same store write
 * (design/0031-detached-session-hosting/): two resumes racing past each other
 * are serialized, and the second sees the first's live window and is refused.
 */
export async function recordResume(
  root: string,
  id: string,
  recording: ResumeRecording = {},
): Promise<SessionRecord> {
  return withStoreLock(root, `session resumed ${id}`, async () => {
    const open = await requireOpenSession(root, id);
    const cause = await recording.guard?.(open);
    const record = withEvent(open.record, {
      event: 'resumed',
      at: new Date().toISOString(),
      ...(cause === undefined ? {} : { cause }),
      ...(recording.host === undefined ? {} : { host: recording.host }),
    });
    await writeSession(root, open.scopeDir, record);
    commitRecords(
      root,
      `Record resumed on session ${id}`,
      sessionRecordType(open.scopeDir, id).relPath,
    );
    await recording.withinLock?.({ scopeDir: open.scopeDir, record });
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
 * and since design/0051-floor-scope-sessions/ every floor's.
 */
export async function readOpenSessions(root: string): Promise<OpenSessionListing[]> {
  return (await readAllSessions(root)).filter((listing) => listing.record.state === 'open');
}

/** Every session record in the workspace, at every scope, open and closed. */
export async function readAllSessions(root: string): Promise<OpenSessionListing[]> {
  const listings: OpenSessionListing[] = [];
  for (const scopeDir of [
    WORKSPACE_SCOPE_DIR,
    ...projectDirs(root),
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

/**
 * Resolve a bare id to its open session, at whatever scope holds it. A refusal
 * says WHICH miss it is (design/0045-agent-record-reads/): an id that names a
 * session already closed — most often swept up by its task's close — is told
 * so, with when, rather than reading the same as an id that names nothing.
 * The two misses call for different next moves, and a caller left unable to
 * tell them apart goes looking in the record files for the answer.
 */
export async function requireOpenSession(root: string, id: string): Promise<OpenSessionListing> {
  const matches = (await readAllSessions(root)).filter((session) => session.record.id === id);
  const open = matches.find((session) => session.record.state === 'open');
  if (open !== undefined) return open;
  const closed = matches.at(-1)?.record;
  if (closed !== undefined) {
    const when = closed.closedAt === undefined ? '' : ` at ${closed.closedAt}`;
    const successor = continuedBy(closed);
    throw new WardError(
      `session '${id}' is already closed${when} — closed stays closed; ` +
        (successor === undefined
          ? `its record: ward session show ${id}`
          : `its conversation continues as ${successor}: ward session show ${successor}`),
    );
  }
  throw new WardError(`no session has id '${id}' — ids are bare; see: ward status`);
}

/** How a session record reads in prose, for a human scanning `sessions/`. */
export function describeScope(record: SessionRecord): string {
  switch (sessionScopeOf(record)) {
    case 'workspace':
      return 'workspace scope';
    case 'project':
      return `floor ${record.floor ?? '?'}`;
    case 'task':
      return `task ${record.task ?? '?'}`;
  }
}

// -- the task a floor session works (design/0078-task-named-windows/) ----------

/**
 * The task a session's trail names now: the address on its latest
 * `task-named` event, unless a `task-cleared` came after it. Read from the
 * trail, never from a field, so every naming the session ever made stays on
 * the record in the order it happened.
 */
export function namedTaskOf(record: SessionRecord): string | undefined {
  for (const event of [...(record.events ?? [])].reverse()) {
    if (event.event === 'task-named') return event.task;
    if (event.event === 'task-cleared') return undefined;
  }
  return undefined;
}

/**
 * The task a floor session is working NOW: the one its trail names, while
 * that task is open and stands on the session's floor. A task that has since
 * closed names nothing — the trail keeps the naming, and the session reads as
 * its floor's again — because a window that says a finished task is still in
 * hand would be the record contradicting itself. Derived per read.
 */
export function workingTaskOf(
  record: SessionRecord,
  tasks: readonly FoundTask[],
): FoundTask | undefined {
  const named = namedTaskOf(record);
  if (named === undefined || sessionScopeOf(record) !== 'project') return undefined;
  const wanted = parseTaskAddress(named);
  if (wanted === null) return undefined;
  return tasks.find(
    (task) =>
      task.record.state !== 'closed' &&
      taskFloor(task) === record.floor &&
      addressMatches(task, wanted),
  );
}

/** What naming (or clearing) a floor session's task came to. */
export interface TaskNamed {
  readonly record: SessionRecord;
  readonly scopeDir: string;
  /** False when the trail already said this — nothing was written. */
  readonly changed: boolean;
  /** The task now named; absent once cleared. */
  readonly task?: FoundTask;
}

/**
 * Name the task a floor session works, or (`address` undefined) clear it
 * (design/0078-task-named-windows/). Appends `task-named` or `task-cleared`
 * and commits; a call that would say again what the trail already says writes
 * nothing. Only a floor's own session names a task: a task session already is
 * its task's, and a workspace session answers for every floor at once.
 */
export async function nameSessionTask(
  root: string,
  id: string,
  address: string | undefined,
): Promise<TaskNamed> {
  return withStoreLock(root, `session task ${id}`, async () => {
    const open = await requireOpenSession(root, id);
    const { record, scopeDir } = open;
    if (sessionScopeOf(record) !== 'project' || record.floor === undefined) {
      throw new WardError(
        `session ${id} is at ${describeScope(record)} — only a floor's own session names the ` +
          "task it works (a task session is already its task's)",
      );
    }
    const current = workingTaskOf(record, await readTasks(root));
    if (address === undefined) {
      if (namedTaskOf(record) === undefined) return { record, scopeDir, changed: false };
      const cleared = withEvent(record, { event: 'task-cleared', at: new Date().toISOString() });
      await writeSession(root, scopeDir, cleared);
      commitRecords(
        root,
        `Clear the task of session ${id}`,
        sessionRecordType(scopeDir, id).relPath,
      );
      return { record: cleared, scopeDir, changed: true };
    }
    // The floor's attending stays general (design/0089-floor-attending/): it is
    // the first window of the floor's host and what `wsa N` joins, so a task
    // is given a window of its own beside it rather than taking the attending's.
    if (isAttending(record, await readAllSessions(root))) {
      throw new WardError(
        `session ${id} is floor ${record.floor}'s attending — the floor's general session, ` +
          'window 1 of its host — and stays general. Give the task its own window: ' +
          `ward session open --task ${address.toLowerCase()} (or, for a new task, ` +
          `ward session open --floor ${record.floor} --new-task SLUG)`,
      );
    }
    const task = await floorTask(root, record.floor, address);
    if (current?.dir === task.dir) return { record, scopeDir, changed: false, task };
    const named = withEvent(record, {
      event: 'task-named',
      at: new Date().toISOString(),
      task: qualifiedAddress(task),
    });
    await writeSession(root, scopeDir, named);
    commitRecords(
      root,
      `Name task ${qualifiedAddress(task)} on session ${id}`,
      sessionRecordType(scopeDir, id).relPath,
    );
    return { record: named, scopeDir, changed: true, task };
  });
}

/**
 * Resolve an address to an open task on `floor`, refusing one elsewhere: a
 * floor session works its own floor's tasks — handing work to another floor is
 * a hand-off (design/0067-floor-dispatch/), not a name.
 */
async function floorTask(root: string, floor: number, address: string): Promise<FoundTask> {
  const task = await resolveOpenTask(root, address);
  const on = taskFloor(task);
  if (on !== floor) {
    throw new WardError(
      `${address.toLowerCase()} is ${on === undefined ? 'a legacy bare task' : `on floor ${on}`} ` +
        `— a floor ${floor} session names its own floor's tasks (hand work to another floor ` +
        'with: ward task dispatch SLUG --to FLOOR --brief FILE)',
    );
  }
  return task;
}

// -- one conversation, one open record (design/0084-session-move/) --------------

/**
 * Whether a session is one a run is resumed into: a workspace or floor
 * session. A task session may share its conversation's handle — an agent
 * records each task episode it works from inside one run, and a task session
 * is never hosted, so nothing resumes it in bulk — and is outside the rule.
 */
function holdsConversation(record: SessionRecord): boolean {
  return record.state === 'open' && sessionScopeOf(record) !== 'task';
}

/**
 * The open workspace- and floor-scope sessions that hold one handle between
 * them, by handle — each entry a violation of the one-open-record-per-handle
 * rule, which `ward session resume --all` would turn into two runs of one
 * conversation. Ward's own writes never make one; a record written by an
 * older Ward, or two machines each recording the same handle, can.
 */
export function sharedHandles(
  sessions: readonly OpenSessionListing[],
): { readonly handle: string; readonly ids: readonly string[] }[] {
  const byHandle = new Map<string, string[]>();
  for (const { record } of sessions) {
    if (!holdsConversation(record) || record.handle === undefined) continue;
    byHandle.set(record.handle, [...(byHandle.get(record.handle) ?? []), record.id]);
  }
  return [...byHandle.entries()]
    .filter(([, ids]) => ids.length > 1)
    .map(([handle, ids]) => ({ handle, ids }));
}

/**
 * Refuse to record a workspace or floor session over a handle another open
 * one already holds: two open records of one conversation are resumed into
 * two runs of it. The refusal names the holder and the verb that carries a
 * conversation to another floor, which is what such a second record is
 * usually reaching for.
 */
function requireUnheldHandle(
  sessions: readonly OpenSessionListing[],
  handle: string | undefined,
): void {
  if (handle === undefined) return;
  const holder = sessions.find(
    ({ record }) => holdsConversation(record) && record.handle === handle,
  )?.record;
  if (holder === undefined) return;
  throw new WardError(
    `handle ${handle} is already held by open session ${holder.id} (${describeScope(holder)}) ` +
      '— one conversation is one open session, or resuming would start it twice. To carry it ' +
      `to another floor: ward session move ${holder.id} --floor N; to end that record first: ` +
      `ward session close ${holder.id}`,
  );
}

/** The session that continues a closed one — named on its `continued` event. */
export function continuedBy(record: SessionRecord): string | undefined {
  return record.events?.find((event) => event.event === 'continued')?.session;
}

/** Where a continuation stands: the workspace itself, or a floor (and a task of it). */
export type ContinuationScope =
  | { readonly scope: 'workspace' }
  | { readonly scope: 'project'; readonly floor: number; readonly task?: string | undefined };

export interface ContinueOptions {
  /** The new record's purpose; the old one's when absent (a default is restated for the new scope). */
  readonly purpose?: string | undefined;
}

/** The two records a continuation wrote, in the one commit. */
export interface Continuation {
  readonly from: OpenSessionListing;
  readonly to: OpenSessionListing;
}

/**
 * Carry an open session's conversation to another scope
 * (design/0084-session-move/): close its record with a `continued` event
 * naming the successor, and open the successor at the new scope with the same
 * handle, working directory, model and effort, `continues` naming the old id —
 * both records in ONE journal commit, so no reader ever sees the handle held
 * twice or not at all. Ids stay permanent and each scope's log stays true: the
 * episode on the old scope ended, one on the new scope began. Nothing is
 * started or ended here; the run's half is src/agent/move.ts's.
 *
 * The successor records no `parent`: it was not started by a run but carries
 * one on, so who opened the conversation is read through `continues` — and a
 * parent would pull its window back to the parent's floor (placement), which
 * is the opposite of a move.
 */
export async function continueSession(
  root: string,
  id: string,
  target: ContinuationScope,
  options: ContinueOptions = {},
): Promise<Continuation> {
  return withStoreLock(root, `session move ${id}`, async () => {
    const open = await requireOpenSession(root, id);
    const { record } = open;
    const from = describeScope(record);
    if (sessionScopeOf(record) === 'task') {
      throw new WardError(
        `session ${id} is at ${from} — a task-scope session is moved by moving its task, not by ` +
          'this verb',
      );
    }
    if (record.handle === undefined) {
      throw new WardError(
        `session ${id} records no harness handle, so there is no conversation to carry — close ` +
          'it, and open a session where the work belongs',
      );
    }
    const machine = (await readMachine()).name;
    if (record.machine !== undefined && record.machine !== machine) {
      throw new WardError(
        `session ${id} ran on ${record.machine}, and this is ${machine} — move it on ` +
          `${record.machine}, where its run and its window are`,
      );
    }
    const at = await continuationScope(root, record, target);
    const successor = await allocateId(root, at.slug, machine);
    const now = new Date().toISOString();
    const closed = withEvent(
      withEvent(
        { ...record, state: 'closed', closedAt: now },
        { event: 'continued', at: now, session: successor },
      ),
      { event: 'closed', at: now },
    );
    const opened = openedRecord(
      {
        id: successor,
        scope: at.scope,
        ...(at.floor === undefined ? {} : { floor: at.floor }),
        ...(at.named === undefined ? {} : { named: at.named }),
        machine,
        purpose: options.purpose ?? restatedPurpose(record),
        workingDirectory: record.workingDirectory,
        handle: record.handle,
        ...(record.model === undefined ? {} : { model: record.model }),
        ...(record.effort === undefined ? {} : { effort: record.effort }),
        continues: id,
        subject: '',
      },
      undefined,
      now,
    );
    // Both shapes need the same level; asked before either is written, so a
    // workspace below it is refused with nothing on disk.
    requireFormatFor(root, 'session', closed);
    await writeSession(root, open.scopeDir, closed);
    await writeSession(root, at.dir, opened);
    commitRecords(
      root,
      `Move session ${id} to ${describeScope(opened)} as ${successor}`,
      sessionRecordType(open.scopeDir, id).relPath,
      sessionRecordType(at.dir, successor).relPath,
    );
    return {
      from: { scopeDir: open.scopeDir, record: closed },
      to: { scopeDir: at.dir, record: opened },
    };
  });
}

/** The scope a continuation opens at, checked: where it lives, its id slug, its fields. */
async function continuationScope(
  root: string,
  record: SessionRecord,
  target: ContinuationScope,
): Promise<{
  readonly scope: 'workspace' | 'project';
  readonly dir: string;
  readonly slug: string;
  readonly floor?: number;
  readonly named?: string;
}> {
  if (target.scope === 'workspace') {
    if (sessionScopeOf(record) === 'workspace') {
      throw new WardError(`session ${record.id} is already at workspace scope — nothing to move`);
    }
    return { scope: 'workspace', dir: WORKSPACE_SCOPE_DIR, slug: WORKSPACE_SESSION_SLUG };
  }
  const { floor } = target;
  if (sessionScopeOf(record) === 'project' && record.floor === floor) {
    throw new WardError(
      `session ${record.id} is already floor ${floor}'s — to work another of its tasks: ` +
        `ward session task ${record.id} ADDRESS`,
    );
  }
  const project = await resolveProject(root, floor);
  if (project.record.state === 'closed') {
    throw new WardError(`project on floor ${floor} is closed — a session cannot move onto it`);
  }
  const named = target.task === undefined ? undefined : await floorTask(root, floor, target.task);
  return {
    scope: 'project',
    dir: project.dir,
    slug: floorSessionSlug(floor),
    floor,
    ...(named === undefined ? {} : { named: qualifiedAddress(named) }),
  };
}

/**
 * The purpose a continuation carries: the old record's — unless that is the
 * one Ward stated for its kind of session ("Coordinating floor 7 · opened
 * …"), which would be false at the new scope. Left undefined then, so the
 * open states the new scope's own.
 */
function restatedPurpose(record: SessionRecord): string | undefined {
  const stated =
    record.floor === undefined
      ? defaultWorkspaceSessionPurpose(record.openedAt)
      : defaultFloorSessionPurpose(record.floor, record.openedAt);
  return record.purpose === stated ? undefined : record.purpose;
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
  readonly floor?: number;
  /** The slug-qualified address of the task a floor session opens working (0078). */
  readonly named?: string;
  /** Absent only at workspace and floor scope, where the record states one itself. */
  readonly purpose?: string | undefined;
  readonly workingDirectory: string;
  readonly handle?: string;
  /** This machine, always — a record Ward writes always knows where it was written. */
  readonly machine: string;
  readonly model?: string;
  readonly effort?: string;
  /** The caller's declared session, not yet checked against the store. */
  readonly startedBy?: string;
  readonly host?: HostedKind;
  /** The session a continuation carries on from (design/0084-session-move/). */
  readonly continues?: string;
  readonly withinLock?: (opened: OpenSessionListing) => Promise<void>;
  readonly subject: string;
}

function hosting(options: OpenSessionOptions): Pick<OpenedFields, 'host' | 'withinLock'> {
  return {
    ...(options.host === undefined ? {} : { host: options.host }),
    ...(options.withinLock === undefined ? {} : { withinLock: options.withinLock }),
  };
}

/**
 * The session that started a new one (design/0052-session-parent-link/), or
 * undefined — resolved under the store lock, at open, because the moment of
 * opening is the only time the relation is observable at all.
 *
 * The caller's declaration becomes the link only when it names a session in
 * THIS workspace, open or closed. Anything else records nothing, and nothing
 * is refused: `WARD_AGENT=1` is the documented way to declare an agent with no
 * session, and an id from another workspace is a real session somewhere
 * else, so a refusal would fail an open that is entirely legitimate in order
 * to protect a field that is optional by intent. A closed session still
 * links: the link says who opened this one, and a run keeps running after its
 * record is closed (a task close sweeps its sessions without stopping a
 * process). The one declared session that is NOT a parent is the same run
 * recording itself again — matching handles mean nothing was started.
 */
export function parentOf(
  sessions: readonly OpenSessionListing[],
  startedBy: string | undefined,
  handle: string | undefined,
): string | undefined {
  if (startedBy === undefined) return undefined;
  const opener = sessions.find((session) => session.record.id === startedBy)?.record;
  if (opener === undefined) return undefined;
  if (handle !== undefined && opener.handle === handle) return undefined;
  return opener.id;
}

/** One writer for every scope: the record, its `opened` event, and the commit. */
async function writeOpened(
  root: string,
  scopeDir: string,
  fields: OpenedFields,
): Promise<SessionRecord> {
  const sessions = await readAllSessions(root);
  if (fields.scope !== 'task') requireUnheldHandle(sessions, fields.handle);
  const parent =
    fields.startedBy === undefined
      ? undefined
      : parentOf(sessions, fields.startedBy, fields.handle);
  const record = openedRecord(fields, parent, new Date().toISOString());
  await writeSession(root, scopeDir, record);
  commitRecords(root, fields.subject, sessionRecordType(scopeDir, fields.id).relPath);
  await fields.withinLock?.({ scopeDir, record });
  return record;
}

/** The record an open writes, with its `opened` event (and a `task-named` beside it). */
function openedRecord(
  fields: OpenedFields,
  parent: string | undefined,
  openedAt: string,
): SessionRecord {
  return {
    type: 'session',
    id: fields.id,
    scope: fields.scope,
    ...(fields.task === undefined ? {} : { task: fields.task }),
    ...(fields.floor === undefined ? {} : { floor: fields.floor }),
    purpose:
      fields.purpose ??
      (fields.floor === undefined
        ? defaultWorkspaceSessionPurpose(openedAt)
        : defaultFloorSessionPurpose(fields.floor, openedAt)),
    workingDirectory: fields.workingDirectory,
    ...(fields.handle === undefined ? {} : { handle: fields.handle }),
    machine: fields.machine,
    ...(fields.model === undefined ? {} : { model: fields.model }),
    ...(fields.effort === undefined ? {} : { effort: fields.effort }),
    ...(parent === undefined ? {} : { parent }),
    ...(fields.continues === undefined ? {} : { continues: fields.continues }),
    state: 'open',
    events: [
      {
        event: 'opened',
        at: openedAt,
        ...(fields.host === undefined ? {} : { host: fields.host }),
      },
      ...(fields.named === undefined
        ? []
        : [{ event: 'task-named' as const, at: openedAt, task: fields.named }]),
    ],
    openedAt,
  };
}

/** Write a session record with the body its scope gives it — no commit: the caller's. */
export async function writeSession(
  root: string,
  scopeDir: string,
  record: SessionRecord,
): Promise<void> {
  await writeDocument(root, sessionRecordType(scopeDir, record.id), {
    data: record,
    body: sessionBody(record),
  });
}

function sessionBody(record: SessionRecord): string {
  switch (sessionScopeOf(record)) {
    case 'workspace':
      return `Session \`${record.id}\` at workspace scope.`;
    case 'project':
      return `Session \`${record.id}\` of floor ${record.floor ?? '?'}.`;
    case 'task':
      return `Session \`${record.id}\` of task \`${record.task ?? '?'}\`.`;
  }
}
