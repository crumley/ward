// Room lifecycle: opened on a worktree with a brief (the artifact that conjures and orients the
// hands-on agent), addressed by floor+room code (e.g. 1A1). Records its own open/closed state; a
// closed room stays closed (walkthrough §4). One active room per worktree at a time.

import { join } from "node:path";
import { writeDoc, readDoc, listDirs } from "../store/doc.ts";
import { roomDir, roomDocPath, artifactsDir } from "../store/paths.ts";
import { nextRoomCode, slugify } from "../store/ids.ts";
import { nowIso } from "../store/workspace.ts";
import { themeFor } from "../seams/theming.ts";
import { findTask, findRoom, roomAccentsOnFloor } from "./resolve.ts";
import type { RoomDoc, ArtifactDoc } from "../store/schemas.ts";

export async function openRoom(
  root: string,
  floor: string,
  taskSlug: string,
  opts: { worktree: string; briefTitle: string; briefBody: string; residentPersona: string },
): Promise<{ room: RoomDoc; code: string; brief: string }> {
  const t = await findTask(root, floor, taskSlug);
  if (!t) throw new Error(`no task ${taskSlug} on floor ${floor}`);

  // One active room per worktree at a time (domain-model).
  const existing = await activeRoomOnWorktree(root, floor, taskSlug, opts.worktree);
  if (existing) throw new Error(`worktree ${opts.worktree} already has an active room: ${existing}`);

  const code = await nextRoomCode(root, floor);
  const theme = themeFor("room", code, await roomAccentsOnFloor(root, floor));
  const rDir = roomDir(t.tDir, code);

  // The brief artifact, with provenance (who/persona, working dir, why) — domain-model: briefs.
  const briefName = slugify(opts.briefTitle) || "brief";
  const brief: ArtifactDoc = {
    type: "artifact",
    schemaVersion: 1,
    artifactType: "brief",
    name: briefName,
    provenance: {
      persona: opts.residentPersona,
      cwd: opts.worktree,
      why: `orient room ${code}`,
      derivedFrom: [],
    },
    for: `room:${code}`,
    createdAt: nowIso(),
  };
  await writeDoc(join(artifactsDir(rDir), `${briefName}.md`), brief, opts.briefBody);

  const doc: RoomDoc = {
    type: "room",
    schemaVersion: 1,
    identity: { slug: taskSlug, code },
    worktree: opts.worktree,
    task: taskSlug,
    brief: briefName,
    state: "open",
    theme: { accent: theme.accent, glyph: theme.glyph },
    createdAt: nowIso(),
  };
  await writeDoc(
    roomDocPath(rDir),
    doc,
    `# ${theme.glyph} Room ${code} (${theme.accent})\n\nOn worktree ${opts.worktree}. Brief: ${briefName}.`,
  );
  return { room: doc, code, brief: briefName };
}

export async function closeRoom(root: string, code: string): Promise<{ idempotent: boolean }> {
  const loc = await findRoom(root, code);
  if (!loc) throw new Error(`no room ${code}`);
  const path = roomDocPath(loc.rDir);
  const { doc, body } = await readDoc(path);
  if (doc.type !== "room") throw new Error("not a room record");
  if (doc.state === "closed") return { idempotent: true }; // closed stays closed
  await writeDoc(path, { ...doc, state: "closed" }, body);
  return { idempotent: false };
}

// A room's working directory is its worktree's path — where its sessions run and load context from
// (two axes: a room is specialized to its worktree). Resolves room → worktree record → path.
export async function roomWorkingDir(
  root: string,
  code: string,
): Promise<{ rDir: string; worktreePath: string; room: RoomDoc }> {
  const loc = await findRoom(root, code);
  if (!loc) throw new Error(`no room ${code}`);
  const { doc } = await readDoc(roomDocPath(loc.rDir));
  if (doc.type !== "room") throw new Error("not a room record");
  const [repo, branch] = doc.worktree.split(":");
  const { worktreeDocPath } = await import("../store/paths.ts");
  const { doc: wt } = await readDoc(worktreeDocPath(loc.tDir, repo!, branch!));
  if (wt.type !== "worktree") throw new Error(`worktree not found for room ${code}`);
  return { rDir: loc.rDir, worktreePath: wt.path, room: doc };
}

function roomsParent(tDir: string): string {
  return join(tDir, "rooms");
}

async function activeRoomOnWorktree(
  root: string,
  floor: string,
  taskSlug: string,
  worktree: string,
): Promise<string | null> {
  const t = await findTask(root, floor, taskSlug);
  if (!t) return null;
  for (const code of await listDirs(roomsParent(t.tDir))) {
    const { doc } = await readDoc(roomDocPath(roomDir(t.tDir, code)));
    if (doc.type === "room" && doc.worktree === worktree && doc.state === "open") return code;
  }
  return null;
}
