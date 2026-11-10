// The on-disk layout of a workspace and its discovery from a working
// directory (design/0002-store-and-workspace/): records live in the visible
// tree; the hidden .ward/ holds only the marker and store mechanics.
import { existsSync, lstatSync, readlinkSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

export const MARKER_DIR = '.ward';

/**
 * Directories reserved by the layout. `tasks/` holds bare tasks and
 * `sessions/` holds the workspace's OWN sessions
 * (design/0029-launched-sessions/) — both are the same move: a scope's records
 * live at that scope's level, because levels are elided, not faked.
 *
 * `worktrees/` is not among them (design/0057-context-from-root/): working
 * checkouts live under their floor's view in `floors/`, and the old directory
 * is retired by `ward workspace upgrade` once nothing holds it, so converge
 * must not bring it back. `floors/` is not among them either: each floor's
 * view is established per floor, by the views module, never as a bare tree.
 */
export const SCOPE_DIRS = ['repos', 'repositories', 'projects', 'tasks', 'sessions'] as const;

/**
 * The directory that held every task worktree before design 0057, and still
 * holds an open legacy bare task's (a legacy task has no floor to stand
 * under). Named once, because the placement rule, the retirement step, and
 * doctor all have to agree on it.
 */
export const LEGACY_WORKTREES_DIR = 'worktrees';

/** The ignore line `worktrees/` carried while it existed; dropped when it is retired. */
export const LEGACY_WORKTREES_IGNORE = '/worktrees/';

/** Where the floors' views stand: `floors/<N>-<slug>/`, one per open floor. */
export const FLOORS_DIR = 'floors';

/**
 * Checkouts and scratch are the world the record describes, not the record;
 * the store's transient mechanics (staging, the write lock) live and die
 * within a command; telemetry is local and personal (§4) — tracked telemetry
 * would be one push from leaving the workspace.
 */
export const IGNORE_LINES = [
  '/repos/',
  // The floors' views (design/0057-context-from-root/): links onto the record
  // and the floors' task worktrees — derived entirely, so nothing in them is
  // the record, and a worktree under a tracked directory would be one `git add`
  // from being recorded as an embedded repository.
  '/floors/',
  '/workdirs/',
  '/.ward/tmp/',
  '/.ward/store.lock',
  '/.ward/telemetry/',
] as const;

/**
 * The state of the workspace root's CLAUDE.md — the bridge that gives Claude
 * Code its expected filename over the harness-neutral AGENTS.md
 * (design/0017-claude-md-symlink/). One classifier serves both creation
 * (converge or leave alone) and doctor (name the state), so the two verbs can
 * never disagree about what counts as linked. `linked` means the link's
 * target resolves to this workspace's own AGENTS.md, however spelled —
 * a link that reads the right guidance is not divergence.
 */
export type ClaudeGuidance = 'linked' | 'absent' | 'file' | 'elsewhere';

export function inspectClaudeGuidance(root: string): ClaudeGuidance {
  const link = join(root, 'CLAUDE.md');
  let stat: ReturnType<typeof lstatSync>;
  try {
    stat = lstatSync(link); // lstat: a dangling symlink still *exists* as an arrangement
  } catch {
    return 'absent';
  }
  if (!stat.isSymbolicLink()) return 'file';
  const target = resolve(root, readlinkSync(link));
  return target === join(root, 'AGENTS.md') ? 'linked' : 'elsewhere';
}

/**
 * Whether a directory IS a workspace root — it carries the marker directory.
 * One test, so everything that asks the question (discovery below, the
 * registry's staleness check in design/0024-global-config-registry/) can never
 * disagree about what counts: a `.ward` FILE is not a marker.
 */
export function isWorkspaceRoot(dir: string): boolean {
  const marker = join(dir, MARKER_DIR);
  return existsSync(marker) && statSync(marker).isDirectory();
}

/**
 * Walk up from a working directory to the workspace root — the nearest
 * ancestor containing the .ward marker — or null when there is none.
 */
export function discoverWorkspace(from: string): string | null {
  let dir = resolve(from);
  while (true) {
    if (isWorkspaceRoot(dir)) return dir;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}
