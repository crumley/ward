// Locate the workspace root from any cwd, and load/save the workspace record.
// Workspace discovery walks UP from the working directory looking for `.ward/`
// (human-shell: "workspace-aware from any working directory" — never ask which
// workspace when the cwd already determines it).

import { readdir, stat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { readAs, writeDocument } from './doc.ts';
import {
  projectDir,
  projectDoc,
  projectsDir,
  roomDir,
  taskDir,
  tasksDir,
  ward,
  workspaceDoc,
} from './paths.ts';
import {
  type Project,
  projectSchema,
  type ScopeRef,
  type Workspace,
  workspaceSchema,
} from './schemas.ts';

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

/** Walk up from `startDir` to the nearest workspace root (the dir holding `.ward/`), or null. */
export async function findWorkspaceRoot(startDir: string): Promise<string | null> {
  let dir = resolve(startDir);
  let parent = dirname(dir);
  while (dir !== parent) {
    if (await exists(workspaceDoc(dir))) {
      return dir;
    }
    dir = parent;
    parent = dirname(dir);
  }
  return (await exists(workspaceDoc(dir))) ? dir : null;
}

/** Like findWorkspaceRoot but throws a clear error when there is no workspace above the cwd. */
export async function requireWorkspaceRoot(startDir: string): Promise<string> {
  const root = await findWorkspaceRoot(startDir);
  if (root === null) {
    throw new Error(`no Ward workspace found at or above ${resolve(startDir)} (run \`ward init\`)`);
  }
  return root;
}

export async function loadWorkspace(root: string): Promise<Workspace> {
  return (await readAs(workspaceDoc(root), workspaceSchema)).doc;
}

export async function saveWorkspace(root: string, ws: Workspace): Promise<void> {
  await writeDocument(workspaceDoc(root), ws);
}

export async function workspaceExists(root: string): Promise<boolean> {
  return exists(ward(root));
}

/** List every project's `<floor>-<slug>` directory name (empty if none). */
async function projectDirNames(root: string): Promise<string[]> {
  const names = await readdir(projectsDir(root)).catch(() => [] as string[]);
  return names.filter((n) => /^\d+-/.test(n)).sort();
}

export async function listProjects(root: string): Promise<Project[]> {
  const projects: Project[] = [];
  for (const name of await projectDirNames(root)) {
    projects.push((await readAs(projectDoc(resolveDirName(root, name)), projectSchema)).doc);
  }
  return projects.sort((a, b) => a.floor - b.floor);
}

function resolveDirName(root: string, dirName: string): string {
  return projectDir(root, Number(dirName.split('-')[0]), dirName.split('-').slice(1).join('-'));
}

/** Resolve a floor number to its on-disk project directory (scans by prefix). */
export async function resolveProjectDir(root: string, floor: number): Promise<string> {
  const match = (await projectDirNames(root)).find((n) => n.startsWith(`${floor}-`));
  if (match === undefined) {
    throw new Error(`no project on floor ${floor}`);
  }
  return resolveDirName(root, match);
}

/**
 * Map a scope address to its on-disk directory, whose `log/` is the scope's
 * append-only session log. Room resolution is added when rooms are built.
 */
export async function resolveScopeDir(root: string, scope: ScopeRef): Promise<string> {
  switch (scope.kind) {
    case 'workspace':
      return ward(root);
    case 'project':
      return resolveProjectDir(root, Number(scope.ref));
    case 'task': {
      const [floor, slug] = scope.ref.split('/');
      return taskDir(await resolveProjectDir(root, Number(floor)), String(slug));
    }
    case 'room':
      return findRoomDir(root, scope.ref);
  }
}

/** Find a room's on-disk directory by its workspace-wide code (a bare code addresses it). */
export async function findRoomDir(root: string, code: string): Promise<string> {
  for (const name of await projectDirNames(root)) {
    const projectDirPath = resolveDirName(root, name);
    const taskNames = await readdir(tasksDir(projectDirPath)).catch(() => [] as string[]);
    for (const taskName of taskNames) {
      const candidate = roomDir(taskDir(projectDirPath, taskName), code);
      if (await exists(candidate)) {
        return candidate;
      }
    }
  }
  throw new Error(`no room ${code} found`);
}
