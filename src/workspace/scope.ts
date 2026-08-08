// Scope from the working directory (design/0006-scope-from-cwd/): a working
// directory inside a worktree that a worktree record claims fully implies the
// enclosing task, and Ward derives it rather than making the caller restate
// what the location already says (intent/02-subsystems/07-human-shell.md).
// Resolution is a pure read over the records — deterministic for the same
// state (§6), never a prompt.
import { isAbsolute, relative } from 'node:path';
import type { WorktreeRecord } from '../store/types.ts';
import { type FoundTask, readTasks } from './scan.ts';
import { readTaskWorktrees } from './worktrees.ts';

export interface CwdScope {
  readonly task: FoundTask;
  readonly worktree: WorktreeRecord;
}

/**
 * The enclosing task, when `cwd` sits at or below a worktree that a non-closed
 * task's record claims — null anywhere else. Closed tasks claim nothing: a
 * torn-down worktree's record survives the close, but the task it names can no
 * longer be operated on and its code may since have been reused. Among open
 * tasks at most one record can claim a directory (worktree paths embed the
 * task code, unique while open), so the scan-order match is the only match.
 */
export async function scopeFromCwd(root: string, cwd: string): Promise<CwdScope | null> {
  const rel = relative(root, cwd);
  if (rel === '' || rel.startsWith('..') || isAbsolute(rel)) return null;
  for (const task of await readTasks(root)) {
    if (task.record.state === 'closed') continue;
    for (const worktree of await readTaskWorktrees(root, task.dir)) {
      if (rel === worktree.path || rel.startsWith(`${worktree.path}/`)) {
        return { task, worktree };
      }
    }
  }
  return null;
}
