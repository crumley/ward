// Workspace path layout. Directory nesting expresses scope containment (metadata-store seam). One
// place owns every path so a store relocation re-points here. See design/00-foundation.md.

import { join } from "node:path";
import { existsSync } from "node:fs";
import { dirname } from "node:path";

export const WARD_DIR = ".ward";

export function wardDir(root: string): string {
  return join(root, WARD_DIR);
}
export function workspaceDocPath(root: string): string {
  return join(wardDir(root), "workspace.md");
}
export function personasDir(root: string): string {
  return join(wardDir(root), "personas");
}
export function projectsDir(root: string): string {
  return join(wardDir(root), "projects");
}
export function projectDir(root: string, floor: string, slug: string): string {
  return join(projectsDir(root), `${floor}-${slug}`);
}
export function projectDocPath(projDir: string): string {
  return join(projDir, "project.md");
}
export function tasksDir(projDir: string): string {
  return join(projDir, "tasks");
}
export function taskDir(projDir: string, slug: string): string {
  return join(tasksDir(projDir), slug);
}
export function taskDocPath(tDir: string): string {
  return join(tDir, "task.md");
}
export function worktreesMetaDir(tDir: string): string {
  return join(tDir, "worktrees");
}
export function worktreeDocPath(tDir: string, repo: string, branch: string): string {
  return join(worktreesMetaDir(tDir), `${repo}__${branch.replace(/\//g, "-")}.md`);
}
export function roomsDir(tDir: string): string {
  return join(tDir, "rooms");
}
export function roomDir(tDir: string, code: string): string {
  return join(roomsDir(tDir), code);
}
export function roomDocPath(rDir: string): string {
  return join(rDir, "room.md");
}
export function artifactsDir(scopeDir: string): string {
  return join(scopeDir, "artifacts");
}
export function logDir(scopeDir: string): string {
  return join(scopeDir, "log");
}
export function wakesDir(root: string): string {
  return join(wardDir(root), "wakes");
}
export function wakeDocPath(root: string, id: string): string {
  return join(wakesDir(root), `${id}.md`);
}
export function wakeLogDir(root: string, id: string): string {
  return join(wakesDir(root), `${id}.log`);
}
export function messagesDir(root: string): string {
  return join(wardDir(root), "messages");
}
export function messageDocPath(root: string, id: string): string {
  return join(messagesDir(root), `${id}.md`);
}
export function reflectionsDir(root: string): string {
  return join(wardDir(root), "reflections");
}
export function reflectionDocPath(root: string, scope: string, goal: string): string {
  return join(reflectionsDir(root), scope.replace(/[/:]/g, "_"), `${goal}.md`);
}

// Regenerable git checkouts (git-ignored by the workspace): canonical mains + per-task worktrees.
export function reposDir(root: string): string {
  return join(root, "repos");
}
export function repoCheckoutDir(root: string, name: string): string {
  return join(reposDir(root), name);
}
export function worktreesRootDir(root: string): string {
  return join(root, "worktrees");
}
export function worktreePath(root: string, repo: string, branch: string): string {
  return join(worktreesRootDir(root), repo, branch.replace(/\//g, "-"));
}

// Walk up from a starting dir to find the workspace root (the dir containing `.ward/`).
export function findWorkspaceRoot(start: string = process.cwd()): string | null {
  let dir = start;
  for (;;) {
    if (existsSync(join(dir, WARD_DIR))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}
