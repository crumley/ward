// Session lifecycle (02-sessions-and-lifecycle). A session is a leaf that records
// its own durable state (open|closed); "running" is a live overlay (SF-002).
//
// Guarantees this module upholds:
//   - resume is idempotent (re-attach; never a second session, never mutates the record)
//   - closed stays closed (resume of a closed session is a hard error)
//   - the record is authoritative and kept current (open/close write promptly)
//   - session ids are unique among OPEN sessions workspace-wide (a bare id addresses)

import { readdir, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { type Harness, stubHarness } from '../seams/harness.ts';
import { resolveTier } from '../seams/model.ts';
import { readAs, writeDocument } from '../store/doc.ts';
import { allocateId, slugify } from '../store/ids.ts';
import { appendEvent, type Clock, systemClock } from '../store/log.ts';
import { logDir, sessionDoc, sessionsDir } from '../store/paths.ts';
import {
  type PersonaRef,
  type ScopeRef,
  type Session,
  sessionSchema,
  type Tier,
} from '../store/schemas.ts';
import { resolveScopeDir } from '../store/workspace.ts';

export async function listSessions(root: string): Promise<Session[]> {
  const files = await readdir(sessionsDir(root)).catch(() => [] as string[]);
  const sessions: Session[] = [];
  for (const file of files.filter((n) => n.endsWith('.md'))) {
    sessions.push((await readAs(sessionDoc(root, file.replace(/\.md$/, '')), sessionSchema)).doc);
  }
  return sessions;
}

export async function loadSession(root: string, id: string): Promise<Session> {
  return (await readAs(sessionDoc(root, id), sessionSchema)).doc;
}

// A session id is reusable once freed (unique among OPEN sessions), but records
// live at `<id>.md`. Before reusing an id, move the prior CLOSED record aside so
// its history is retained (§15) rather than clobbered — the new open session
// then owns the `<id>.md` address.
async function archivePriorClosedRecord(root: string, id: string): Promise<void> {
  let prior: Session;
  try {
    prior = await loadSession(root, id);
  } catch {
    return; // nothing at this address
  }
  if (prior.state === 'closed') {
    const stamp = prior.openedAt.replace(/[:.]/g, '-');
    await rename(sessionDoc(root, id), join(sessionsDir(root), `${id}__${stamp}.md`));
  }
}

/** Ids of sessions currently OPEN (not closed) — the uniqueness set for allocation. */
export async function openSessionIds(root: string): Promise<Set<string>> {
  const open = (await listSessions(root)).filter((s) => s.state !== 'closed');
  return new Set(open.map((s) => s.id));
}

export interface OpenSessionOptions {
  scope: ScopeRef;
  persona: PersonaRef;
  workingDir: string;
  /** Explicit model-tier override (narrowest scope); defaults follow the persona's role. */
  tier?: Tier;
  harness?: Harness;
  now?: Clock;
}

/** Open a session: allocate a workspace-unique id, start the harness, record it, log it. */
export async function openSession(root: string, opts: OpenSessionOptions): Promise<Session> {
  const now = opts.now ?? systemClock;
  const harness = opts.harness ?? stubHarness;
  const id = allocateId(slugify(opts.persona.name), await openSessionIds(root));
  await archivePriorClosedRecord(root, id);
  const handle = harness.start({ sessionId: id, workingDir: opts.workingDir });
  const session: Session = {
    type: 'session',
    id,
    scope: opts.scope,
    persona: opts.persona,
    workingDir: opts.workingDir,
    harness: handle,
    model: resolveTier(opts.persona.role, [opts.tier]),
    state: 'open',
    openedAt: now(),
  };
  await writeDocument(sessionDoc(root, id), session);
  await appendEvent(
    logDir(await resolveScopeDir(root, opts.scope)),
    {
      kind: 'session-opened',
      actor: id,
      data: { persona: opts.persona.name, role: opts.persona.role },
    },
    now,
  );
  return session;
}

export interface ResumeOptions {
  harness?: Harness;
  now?: Clock;
}

/** Resume a session: re-attach to its recorded run. Idempotent; closed stays closed. */
export async function resumeSession(
  root: string,
  id: string,
  opts: ResumeOptions = {},
): Promise<Session> {
  const now = opts.now ?? systemClock;
  const harness = opts.harness ?? stubHarness;
  const session = await loadSession(root, id);
  if (session.state === 'closed') {
    throw new Error(`closed stays closed: session ${id} cannot be resumed`);
  }
  // Re-attach via the recorded handle. This does NOT mutate the durable record
  // (running is a live overlay), so resuming twice is a safe no-op on state.
  harness.resume(session.harness);
  await appendEvent(
    logDir(await resolveScopeDir(root, session.scope)),
    { kind: 'session-resumed', actor: id },
    now,
  );
  return session;
}

export interface CloseOptions {
  now?: Clock;
}

/** Close a session: terminal. Idempotent — closing a closed session is a no-op. */
export async function closeSession(
  root: string,
  id: string,
  opts: CloseOptions = {},
): Promise<Session> {
  const now = opts.now ?? systemClock;
  const session = await loadSession(root, id);
  if (session.state === 'closed') {
    return session;
  }
  const closed: Session = { ...session, state: 'closed', closedAt: now() };
  await writeDocument(sessionDoc(root, id), closed);
  await appendEvent(
    logDir(await resolveScopeDir(root, session.scope)),
    { kind: 'session-closed', actor: id },
    now,
  );
  return closed;
}
