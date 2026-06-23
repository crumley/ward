// Scope resolvers: from a human-typed reference (floor number, task slug, room code) to the on-disk
// scope dir and record. Identity need not mirror containment, so a room code resolves by scanning
// (domain-model: identity). Also collects sibling accents for collision-free theming.

import { join } from "node:path";
import { existsSync } from "node:fs";
import { readDoc, listDirs, listDocs } from "../store/doc.ts";
import {
  projectsDir,
  tasksDir,
  taskDir,
  roomsDir,
  roomDir,
  projectDocPath,
  taskDocPath,
  roomDocPath,
  worktreesMetaDir,
} from "../store/paths.ts";
import type { ProjectDoc } from "../store/schemas.ts";

export type ProjectLoc = { pDir: string; floor: string; slug: string; doc: ProjectDoc };

export async function findProject(root: string, floor: string): Promise<ProjectLoc | null> {
  const dirs = await listDirs(projectsDir(root));
  const name = dirs.find((d) => d.startsWith(`${floor}-`));
  if (!name) return null;
  const pDir = join(projectsDir(root), name);
  const { doc } = await readDoc(projectDocPath(pDir));
  if (doc.type !== "project") return null;
  return { pDir, floor, slug: name.slice(`${floor}-`.length), doc };
}

export async function findTask(
  root: string,
  floor: string,
  taskSlug: string,
): Promise<{ tDir: string; project: ProjectLoc } | null> {
  const project = await findProject(root, floor);
  if (!project) return null;
  const tDir = taskDir(project.pDir, taskSlug);
  if (!existsSync(taskDocPath(tDir))) return null;
  return { tDir, project };
}

export type RoomLoc = {
  rDir: string;
  code: string;
  floor: string;
  taskSlug: string;
  tDir: string;
  pDir: string;
};

// Resolve a room by its workspace-wide code (e.g. "1A1") by scanning floors/tasks.
export async function findRoom(root: string, code: string): Promise<RoomLoc | null> {
  const floors = await listDirs(projectsDir(root));
  for (const f of floors) {
    const pDir = join(projectsDir(root), f);
    const floor = f.split("-")[0]!;
    for (const t of await listDirs(tasksDir(pDir))) {
      const tDir = join(tasksDir(pDir), t);
      const rDir = roomDir(tDir, code);
      if (existsSync(roomDocPath(rDir))) {
        return { rDir, code, floor, taskSlug: t, tDir, pDir };
      }
    }
  }
  return null;
}

// ---- sibling accent collectors (for collision-free theming) -----------------------------------

export async function projectAccents(root: string): Promise<string[]> {
  const out: string[] = [];
  for (const d of await listDirs(projectsDir(root))) {
    const { doc } = await readDoc(projectDocPath(join(projectsDir(root), d)));
    if (doc.type === "project") out.push(doc.theme.accent);
  }
  return out;
}

export async function roomAccentsOnFloor(root: string, floor: string): Promise<string[]> {
  const project = await findProject(root, floor);
  if (!project) return [];
  const out: string[] = [];
  for (const t of await listDirs(tasksDir(project.pDir))) {
    const tDir = join(tasksDir(project.pDir), t);
    for (const code of await listDirs(roomsDir(tDir))) {
      const { doc } = await readDoc(roomDocPath(roomDir(tDir, code)));
      if (doc.type === "room") out.push(doc.theme.accent);
    }
  }
  return out;
}

export async function worktreeAccentsInTask(tDir: string): Promise<string[]> {
  const out: string[] = [];
  const dir = worktreesMetaDir(tDir);
  for (const f of await listDocs(dir)) {
    const { doc } = await readDoc(join(dir, f));
    if (doc.type === "worktree") out.push(doc.theme.accent);
  }
  return out;
}
