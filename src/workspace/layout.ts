// The on-disk layout of a workspace and its discovery from a working
// directory (design/0002-store-and-workspace/): records live in the visible
// tree; the hidden .ward/ holds only the marker and store mechanics.
import { existsSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

export const MARKER_DIR = '.ward';

/** Directories reserved by the layout. `tasks/` holds bare tasks — levels are elided, not faked. */
export const SCOPE_DIRS = ['repos', 'repositories', 'worktrees', 'projects', 'tasks'] as const;

/**
 * Checkouts and scratch are the world the record describes, not the record;
 * the store's transient mechanics (staging, the write lock) live and die
 * within a command; telemetry is local and personal (§4) — tracked telemetry
 * would be one push from leaving the workspace.
 */
export const IGNORE_LINES = [
  '/repos/',
  '/worktrees/',
  '/workdirs/',
  '/.ward/tmp/',
  '/.ward/store.lock',
  '/.ward/telemetry/',
] as const;

/**
 * Walk up from a working directory to the workspace root — the nearest
 * ancestor containing the .ward marker — or null when there is none.
 */
export function discoverWorkspace(from: string): string | null {
  let dir = resolve(from);
  while (true) {
    const marker = join(dir, MARKER_DIR);
    if (existsSync(marker) && statSync(marker).isDirectory()) return dir;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}
