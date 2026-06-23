// Identity allocation: floor numbers, room codes, slugs, session ids. Codes are sized to in-flight
// cardinality and lean on memorable conventions, not entropy (domain-model: Identity).

import { listDirs } from "./doc.ts";
import { projectsDir, tasksDir, roomsDir, projectDir } from "./paths.ts";

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "untitled";
}

// Next floor number = max existing + 1, starting at 1 (project code = floor number).
export async function nextFloor(root: string): Promise<number> {
  const dirs = await listDirs(projectsDir(root));
  let max = 0;
  for (const d of dirs) {
    const m = d.match(/^(\d+)-/);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return max + 1;
}

// Find a project's on-disk dir name (`<floor>-<slug>`) by floor number.
export async function projectDirByFloor(root: string, floor: string): Promise<string | null> {
  const dirs = await listDirs(projectsDir(root));
  return dirs.find((d) => d.startsWith(`${floor}-`)) ?? null;
}

// Next per-floor room number. Rooms are addressed floor-wide (e.g. `1A1`), so the sequence runs
// across every task on the floor, not per task (domain-model: identity need not mirror containment).
export async function nextRoomCode(root: string, floor: string): Promise<string> {
  const dirName = await projectDirByFloor(root, floor);
  if (!dirName) return `${floor}A1`;
  const slug = dirName.slice(`${floor}-`.length);
  const pDir = projectDir(root, floor, slug);
  const taskSlugs = await listDirs(tasksDir(pDir));
  let max = 0;
  for (const t of taskSlugs) {
    const codes = await listDirs(roomsDir(`${tasksDir(pDir)}/${t}`));
    for (const c of codes) {
      const m = c.match(/A(\d+)$/);
      if (m) max = Math.max(max, Number(m[1]));
    }
  }
  return `${floor}A${max + 1}`;
}

// Short, scope-relative session code. Deterministic given a sequence number; callers pass the count
// of prior sessions in the scope. Base36 keeps it short and typeable.
export function sessionCode(seq: number): string {
  return seq.toString(36);
}

export function sessionId(personaOrSlug: string, seq: number): string {
  return `${slugify(personaOrSlug)}-${sessionCode(seq)}`;
}
