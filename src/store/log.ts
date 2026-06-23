// Append-only event logs: one file per entry, so concurrent writers never target the same path and
// no update can be lost (§17, structurally — no locks). "The log" is the seq-sorted set of entries.
// State (session lifecycle, wake state) is DERIVED by folding events, never stored as a field.

import { join } from "node:path";
import { mkdir } from "node:fs/promises";
import { readDoc, writeDoc, listDocs } from "./doc.ts";
import type { Doc, DocInput, SessionEventDoc, WakeEventDoc } from "./schemas.ts";

function pad(n: number): number | string {
  return n.toString().padStart(4, "0");
}

function compactTs(iso: string): string {
  return iso.replace(/[-:.]/g, "").replace("T", "").replace("Z", "");
}

// Append one event to a log dir. Filename embeds seq + timestamp + id + verb, so entries sort by
// seq and even a racing duplicate seq yields a distinct file (distinct timestamp/hrtime).
export async function appendEvent(
  logDirPath: string,
  event: DocInput & { ts: string; verb?: string },
): Promise<string> {
  await mkdir(logDirPath, { recursive: true });
  const existing = await listDocs(logDirPath);
  const seq = existing.length + 1;
  const idPart =
    (event as Record<string, unknown>).session ??
    (event as Record<string, unknown>).wake ??
    (event as Record<string, unknown>).id ??
    "evt";
  const verb = event.verb ?? "evt";
  const uniq = process.hrtime.bigint().toString(36).slice(-4);
  const name = `${pad(seq)}-${compactTs(event.ts)}-${idPart}-${verb}-${uniq}.md`;
  await writeDoc(join(logDirPath, name), event);
  return name;
}

export async function readEvents(logDirPath: string): Promise<Doc[]> {
  const files = await listDocs(logDirPath); // already name-sorted => seq order
  const docs: Doc[] = [];
  for (const f of files) {
    const { doc } = await readDoc(join(logDirPath, f));
    docs.push(doc);
  }
  return docs;
}

export type SessionState = {
  session: string;
  state: "open" | "closed";
  persona?: string;
  scope?: string;
  cwd?: string;
  harness?: string;
  model?: string;
  handle?: string;
  events: number;
};

// Fold a scope's session events into per-session current state. `closed` is terminal (closed stays
// closed); `resume` is a re-attach marker that does not change recorded open/closed state, so
// resuming is idempotent. The recorded state is open|closed; "running" is live state the multiplexer
// caches over this record (§16), not stored here.
export function foldSessions(events: Doc[]): Map<string, SessionState> {
  const byId = new Map<string, SessionState>();
  for (const e of events) {
    if (e.type !== "session-event") continue;
    const ev = e as SessionEventDoc;
    let s = byId.get(ev.session);
    if (!s) {
      s = { session: ev.session, state: "open", events: 0 };
      byId.set(ev.session, s);
    }
    s.events++;
    if (ev.persona) s.persona = ev.persona;
    if (ev.scope) s.scope = ev.scope;
    if (ev.cwd) s.cwd = ev.cwd;
    if (ev.harness) s.harness = ev.harness;
    if (ev.model) s.model = ev.model;
    if (ev.handle) s.handle = ev.handle;
    if (ev.verb === "close") s.state = "closed"; // terminal
    // 'open' and 'resume' leave state at 'open' unless already closed:
    else if (s.state !== "closed" && ev.verb === "open") s.state = "open";
    // 'resume' is intentionally a no-op on recorded state (idempotent); attrs above still refresh.
  }
  return byId;
}

export function foldWake(events: Doc[]): "armed" | "satisfied" | "none" {
  let state: "armed" | "satisfied" | "none" = "none";
  for (const e of events) {
    if (e.type !== "wake-event") continue;
    const ev = e as WakeEventDoc;
    if (ev.verb === "satisfy") state = "satisfied"; // terminal once satisfied (fires once)
    else if (ev.verb === "arm" && state !== "satisfied") state = "armed";
  }
  return state;
}
