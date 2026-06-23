// Messaging seam: dispatch (down) / report (up) / wake (notify), all RECORDED-FIRST in the store so
// they survive a reboot and are inspectable by human and agent at any time (§16; messaging seam).
// Wakes are idempotent — a satisfied wake fires once — and re-armable on recovery (the crux: the
// system exists for the reboot-with-threads-in-flight case). See design/messaging-dispatch-wake.md.

import { join } from "node:path";
import { writeDoc, readDoc, listDocs } from "../store/doc.ts";
import { appendEvent, readEvents, foldWake } from "../store/log.ts";
import {
  messagesDir,
  messageDocPath,
  wakesDir,
  wakeDocPath,
  wakeLogDir,
} from "../store/paths.ts";
import { nowIso } from "../store/workspace.ts";
import type { MessageDoc, WakeDoc } from "../store/schemas.ts";

function genId(prefix: string): string {
  return `${prefix}-${process.hrtime.bigint().toString(36).slice(-8)}`;
}

// ---- dispatch (down) / report (up) ------------------------------------------------------------

export async function dispatch(
  root: string,
  args: { from: string; to: string; ref?: string; body: string },
): Promise<MessageDoc> {
  const id = genId("m");
  const doc: MessageDoc = {
    type: "message",
    schemaVersion: 1,
    id,
    kind: "dispatch",
    from: args.from,
    to: args.to,
    ref: args.ref,
    body: args.body,
    ts: nowIso(),
  };
  await writeDoc(messageDocPath(root, id), doc, `dispatch ${args.from} → ${args.to}\n\n${args.body}`);
  return doc;
}

export async function report(
  root: string,
  args: { from: string; to: string; ref?: string; body: string },
): Promise<MessageDoc> {
  const id = genId("m");
  const doc: MessageDoc = {
    type: "message",
    schemaVersion: 1,
    id,
    kind: "report",
    from: args.from,
    to: args.to,
    ref: args.ref,
    body: args.body,
    ts: nowIso(),
  };
  await writeDoc(messageDocPath(root, id), doc, `report ${args.from} → ${args.to}\n\n${args.body}`);
  return doc;
}

// The inspection surface: every message, sorted, optionally filtered by endpoint. "What has crossed,
// from where to where" — answerable at any time (observability constraint).
export async function listMessages(
  root: string,
  filter: { to?: string; from?: string } = {},
): Promise<MessageDoc[]> {
  const out: MessageDoc[] = [];
  for (const f of await listDocs(messagesDir(root))) {
    const { doc } = await readDoc(join(messagesDir(root), f));
    if (doc.type !== "message") continue;
    if (filter.to && doc.to !== filter.to) continue;
    if (filter.from && doc.from !== filter.from) continue;
    out.push(doc);
  }
  out.sort((a, b) => (a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0));
  return out;
}

// ---- wake (notify on a condition) -------------------------------------------------------------

export async function armWake(
  root: string,
  args: { condition: string; armer: string },
): Promise<{ id: string; state: "armed" }> {
  const id = genId("w");
  const doc: WakeDoc = {
    type: "wake",
    schemaVersion: 1,
    id,
    condition: args.condition,
    armer: args.armer,
    ts: nowIso(),
  };
  await writeDoc(wakeDocPath(root, id), doc, `wake: ${args.armer} on \`${args.condition}\``);
  await appendEvent(wakeLogDir(root, id), {
    type: "wake-event",
    wake: id,
    verb: "arm",
    ts: nowIso(),
  });
  return { id, state: "armed" };
}

export async function wakeState(root: string, id: string): Promise<"armed" | "satisfied" | "none"> {
  return foldWake(await readEvents(wakeLogDir(root, id)));
}

export type WakeView = WakeDoc & { state: "armed" | "satisfied" | "none" };

export async function listWakes(root: string): Promise<WakeView[]> {
  const out: WakeView[] = [];
  for (const f of await listDocs(wakesDir(root))) {
    const { doc } = await readDoc(join(wakesDir(root), f));
    if (doc.type !== "wake") continue;
    out.push({ ...doc, state: await wakeState(root, doc.id) });
  }
  return out;
}

// Satisfy every armed wake whose condition matches. IDEMPOTENT: an already-satisfied wake is a
// no-op (it fires once); folding tolerates duplicate satisfy events. Returns which fired now vs were
// already satisfied — so a caller can see the once-only semantics.
export async function satisfyCondition(
  root: string,
  condition: string,
): Promise<{ fired: string[]; alreadySatisfied: string[] }> {
  const fired: string[] = [];
  const alreadySatisfied: string[] = [];
  for (const w of await listWakes(root)) {
    if (w.condition !== condition) continue;
    if (w.state === "satisfied") {
      alreadySatisfied.push(w.id);
      continue;
    }
    await appendEvent(wakeLogDir(root, w.id), {
      type: "wake-event",
      wake: w.id,
      verb: "satisfy",
      ts: nowIso(),
    });
    fired.push(w.id);
  }
  return { fired, alreadySatisfied };
}

// Recovery: the still-armed wakes that must be re-armed after a cold start. The record already holds
// them (recorded-first), so "re-arm" is re-registering any live notifier and surfacing what remains
// pending; a condition satisfied while the machine was down still fires exactly once via
// satisfyCondition's idempotency.
export async function pendingWakes(root: string): Promise<WakeView[]> {
  return (await listWakes(root)).filter((w) => w.state === "armed");
}
