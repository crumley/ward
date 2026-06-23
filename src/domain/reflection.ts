// Scope-boundary reflection (§9; reflection concept). A goal-directed map-reduce over a closing
// scope's arc: CHUNK the work (per session), DISTILL each chunk to a core learning, ROLL UP into
// proposals — advancing a per-(scope, goal) CURSOR so the next run only processes what is new.
// Asynchronous and non-blocking: it produces PROPOSALS, never silent edits. v1 distills
// deterministically (the map-reduce SHAPE is the point; a real harness would distill richer content).

import { join } from "node:path";
import { readDoc, writeDoc, listDirs } from "../store/doc.ts";
import { readEvents, foldSessions, type SessionState } from "../store/log.ts";
import { logDir, roomsDir, roomDir, reflectionDocPath } from "../store/paths.ts";
import { findTask } from "./resolve.ts";
import { nowIso } from "../store/workspace.ts";
import type { ReflectionDoc } from "../store/schemas.ts";

const GOAL = "task-close";

export async function reflectOnTaskClose(
  root: string,
  floor: string,
  taskSlug: string,
): Promise<ReflectionDoc> {
  const t = await findTask(root, floor, taskSlug);
  if (!t) throw new Error(`no task ${taskSlug} on floor ${floor}`);

  // CHUNK: every session at the task scope and in its rooms.
  const scopeDirs = [logDir(t.tDir)];
  for (const code of await listDirs(roomsDir(t.tDir))) {
    scopeDirs.push(logDir(roomDir(t.tDir, code)));
  }
  const sessions: SessionState[] = [];
  for (const dir of scopeDirs) {
    for (const s of (foldSessions(await readEvents(dir))).values()) sessions.push(s);
  }
  sessions.sort((a, b) => (a.session < b.session ? -1 : a.session > b.session ? 1 : 0));

  // CURSOR: only process sessions beyond what a prior reflection already covered (incremental).
  const scope = `task:${floor}/${taskSlug}`;
  const path = reflectionDocPath(root, scope, GOAL);
  let priorCursor = 0;
  try {
    const { doc } = await readDoc(path);
    if (doc.type === "reflection") priorCursor = Number(doc.cursor) || 0;
  } catch {
    // first reflection for this scope/goal
  }
  const fresh = sessions.slice(priorCursor);

  // DISTILL each chunk to a core learning.
  const learnings = fresh.map(
    (s) => `session ${s.session} (${s.persona ?? "?"}, ${s.state}) ran ${s.events} lifecycle event(s)`,
  );

  // ROLL UP into proposals (skills / standards / tooling), per the reflection contract.
  const proposals: { kind: string; summary: string }[] = [];
  if (fresh.length) {
    proposals.push({
      kind: "skill",
      summary: `Capture a '${taskSlug}' skill so future agents don't rediscover this work.`,
    });
    proposals.push({
      kind: "standard",
      summary: `Sharpen the brief template using lessons from ${fresh.length} session(s) at this task.`,
    });
  }

  const doc: ReflectionDoc = {
    type: "reflection",
    schemaVersion: 1,
    scope,
    goal: GOAL,
    cursor: String(sessions.length), // advanced so the next run starts where this one stopped
    proposals,
    ts: nowIso(),
  };
  await writeDoc(
    path,
    doc,
    `# Reflection — ${GOAL} (${scope})\n\n## Distilled learnings\n\n` +
      (learnings.length ? learnings.map((l) => `- ${l}`).join("\n") : "(nothing new since last reflection)") +
      `\n\n## Proposals\n\n` +
      (proposals.length ? proposals.map((p) => `- **${p.kind}:** ${p.summary}`).join("\n") : "(none)"),
  );
  return doc;
}
