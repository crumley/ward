// Session lifecycle as operations over the append-only event log + the harness seam. Open / close /
// resume / (state derived by fold). Guarantees (sessions seam): resume is idempotent, closed stays
// closed, the record (not the process) is authoritative.

import { logDir } from "../store/paths.ts";
import { appendEvent, readEvents, foldSessions, type SessionState } from "../store/log.ts";
import { sessionId } from "../store/ids.ts";
import { nowIso } from "../store/workspace.ts";
import * as harness from "../seams/harness.ts";

export async function openSession(
  root: string,
  scopeDir: string,
  args: { scope: string; persona?: string; model?: string; cwd: string },
): Promise<{ session: string; handle: string }> {
  const dir = logDir(scopeDir);
  const events = await readEvents(dir);
  const priorOpens = events.filter((e) => e.type === "session-event" && e.verb === "open").length;
  const id = sessionId(args.persona ?? "session", priorOpens + 1);
  const live = await harness.start({
    root,
    scope: args.scope,
    persona: args.persona,
    model: args.model,
    cwd: args.cwd,
  });
  await appendEvent(dir, {
    type: "session-event",
    session: id,
    verb: "open",
    persona: args.persona,
    scope: args.scope,
    cwd: args.cwd,
    harness: "stub",
    model: args.model,
    handle: live.handle,
    ts: nowIso(),
  });
  return { session: id, handle: live.handle };
}

export async function closeSession(
  scopeDir: string,
  id: string,
): Promise<{ idempotent: boolean }> {
  const dir = logDir(scopeDir);
  const st = foldSessions(await readEvents(dir)).get(id);
  if (!st) throw new Error(`no such session: ${id}`);
  if (st.state === "closed") return { idempotent: true }; // closed stays closed → no-op
  await appendEvent(dir, { type: "session-event", session: id, verb: "close", ts: nowIso() });
  return { idempotent: false };
}

export async function resumeSession(
  root: string,
  scopeDir: string,
  id: string,
): Promise<{ handle: string }> {
  const dir = logDir(scopeDir);
  const st = foldSessions(await readEvents(dir)).get(id);
  if (!st) throw new Error(`no such session: ${id}`);
  if (st.state === "closed") throw new Error(`closed stays closed: ${id}`);
  if (!st.handle) throw new Error(`no harness handle recorded for ${id}`);
  await harness.resume(root, st.handle); // idempotent re-attach
  await appendEvent(dir, { type: "session-event", session: id, verb: "resume", ts: nowIso() });
  return { handle: st.handle };
}

export async function sessionStates(scopeDir: string): Promise<Map<string, SessionState>> {
  return foldSessions(await readEvents(logDir(scopeDir)));
}
