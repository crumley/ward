// Workspace path layout. Directory nesting expresses scope containment
// (metadata-store); the durable record lives under `.ward/` (git-tracked), while
// the large regenerable git checkouts live under `repos/` and `worktrees/`
// (git-ignored, restored from origin + recorded branches — §16).
//
// Session/wake/message records are FLAT, keyed by their workspace-unique id (a
// bare id addresses them); their containment is a field on the record. Addressing
// and containment are different lookups on purpose (identity need not mirror it).

import { join } from 'node:path';

export const WARD_DIR = '.ward';

/** Filesystem-safe worktree filename from its natural key (repo + branch). */
export function worktreeKey(repo: string, branch: string): string {
  return `${repo}__${branch.replace(/\//g, '-')}`;
}

export function ward(root: string): string {
  return join(root, WARD_DIR);
}
export function workspaceDoc(root: string): string {
  return join(ward(root), 'workspace.md');
}
export function personasDir(root: string): string {
  return join(ward(root), 'personas');
}
export function personaDoc(root: string, name: string): string {
  return join(personasDir(root), `${name}.md`);
}

export function projectsDir(root: string): string {
  return join(ward(root), 'projects');
}
export function projectDirName(floor: number, slug: string): string {
  return `${floor}-${slug}`;
}
export function projectDir(root: string, floor: number, slug: string): string {
  return join(projectsDir(root), projectDirName(floor, slug));
}
export function projectDoc(projectDirPath: string): string {
  return join(projectDirPath, 'project.md');
}

export function tasksDir(projectDirPath: string): string {
  return join(projectDirPath, 'tasks');
}
export function taskDir(projectDirPath: string, taskSlug: string): string {
  return join(tasksDir(projectDirPath), taskSlug);
}
export function taskDoc(taskDirPath: string): string {
  return join(taskDirPath, 'task.md');
}
export function worktreesDir(taskDirPath: string): string {
  return join(taskDirPath, 'worktrees');
}
export function worktreeDoc(taskDirPath: string, repo: string, branch: string): string {
  return join(worktreesDir(taskDirPath), `${worktreeKey(repo, branch)}.md`);
}
export function roomsDir(taskDirPath: string): string {
  return join(taskDirPath, 'rooms');
}
export function roomDir(taskDirPath: string, code: string): string {
  return join(roomsDir(taskDirPath), code);
}
export function roomDoc(roomDirPath: string): string {
  return join(roomDirPath, 'room.md');
}

/** Append-only event log dir for ANY scope dir; artifacts dir for any scope dir. */
export function logDir(scopeDirPath: string): string {
  return join(scopeDirPath, 'log');
}
export function artifactsDir(scopeDirPath: string): string {
  return join(scopeDirPath, 'artifacts');
}
export function artifactDoc(scopeDirPath: string, name: string): string {
  return join(artifactsDir(scopeDirPath), `${name}.md`);
}

export function sessionsDir(root: string): string {
  return join(ward(root), 'sessions');
}
export function sessionDoc(root: string, id: string): string {
  return join(sessionsDir(root), `${id}.md`);
}
export function wakesDir(root: string): string {
  return join(ward(root), 'wakes');
}
export function wakeDoc(root: string, id: string): string {
  return join(wakesDir(root), `${id}.md`);
}
export function messagesDir(root: string): string {
  return join(ward(root), 'messages');
}
export function reflectionsDir(root: string): string {
  return join(ward(root), 'reflections');
}
export function reflectionDoc(root: string, scope: string, goal: string): string {
  return join(reflectionsDir(root), `${scope.replace(/\//g, '-')}--${goal}.md`);
}

// Regenerable git checkouts (git-ignored).
export function reposDir(root: string): string {
  return join(root, 'repos');
}
export function repoCheckout(root: string, repo: string): string {
  return join(reposDir(root), repo);
}
export function worktreeCheckout(root: string, repo: string, branch: string): string {
  return join(root, 'worktrees', repo, branch.replace(/\//g, '-'));
}
