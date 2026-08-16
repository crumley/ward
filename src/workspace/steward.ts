// Stewardship of the workspace's own repository
// (design/0019-stewardship-worktrees/): the workspace record is itself a git
// repository whose main line has two writers — the journal (Ward's
// bookkeeping, landing directly) and stewardship (deliberate change to the
// workspace itself, traveling as work: a branch in a worktree of the
// workspace's own repository, landed only by the human's gated merge)
// (intent/01-concepts/06-workspace-lifecycle.md, the workspace's own main
// line). This module holds the pieces every other module leans on: reading
// the workspace's own main line, recognizing a stewardship copy, and the
// gated merge itself.
import { lstatSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import pkg from '../../package.json' with { type: 'json' };
import { WardError } from '../errors.ts';
import { withStoreLock } from '../store/lock.ts';
import { git } from './git.ts';

/**
 * The workspace's own main line: the branch its root checkout is on. The
 * workspace repository is registered nowhere and records no main-line name —
 * the root checkout IS the main-line checkout and never leaves it
 * (intent/01-concepts/00-domain-model.md, Repositories and the main line) —
 * so the branch under the root is the one honest answer. A detached root has
 * left the invariant and is refused, not guessed around.
 */
export function workspaceMainLine(root: string): string {
  const head = git(root, 'symbolic-ref', '--short', 'HEAD');
  const branch = head.stdout.trim();
  if (head.exitCode !== 0 || branch === '') {
    throw new WardError(
      `the workspace root at ${root} is not on a branch — its checkout must stay on the ` +
        "workspace's own main line; check a branch out there before continuing",
    );
  }
  return branch;
}

/**
 * A stewardship copy is a discovered root that is itself a linked worktree of
 * an enclosing repository: its `.git` is a file, and git's common dir lives
 * elsewhere. Returns the enclosing repository's working-tree root (the real
 * workspace), or null for an ordinary root. Detection is cheap where it
 * matters: a real root's `.git` is a directory, answered by one lstat; git is
 * spawned only for the rare `.git`-file case.
 */
export function stewardshipEnclosure(root: string): string | null {
  const gitPath = join(root, '.git');
  let isFile: boolean;
  try {
    isFile = lstatSync(gitPath).isFile();
  } catch {
    return null; // no .git at all — an untracked root is not a worktree of anything
  }
  if (!isFile) return null;
  const gitDir = git(root, 'rev-parse', '--path-format=absolute', '--git-dir');
  const commonDir = git(root, 'rev-parse', '--path-format=absolute', '--git-common-dir');
  if (gitDir.exitCode !== 0 || commonDir.exitCode !== 0) return null;
  const dir = resolve(gitDir.stdout.trim());
  const common = resolve(commonDir.stdout.trim());
  if (dir === common) return null;
  return dirname(common);
}

/**
 * The stewardship-copy guard, for mutating verbs: a stewardship worktree
 * materializes the record — workspace document and all — so discovery finds
 * what looks like a root there. Reads proceed (checking the candidate copy is
 * the preview's point); a mutation refuses plainly, naming the enclosing
 * workspace — a journal entry recorded on a stewardship branch would merge
 * back into the main line as false history
 * (intent/01-concepts/06-workspace-lifecycle.md, a stewardship copy is not a
 * second workspace).
 */
export function refuseStewardshipCopy(root: string): void {
  const enclosing = stewardshipEnclosure(root);
  if (enclosing === null) return;
  throw new WardError(
    `this directory is a stewardship copy — a worktree of the workspace at ${enclosing}, ` +
      'holding a candidate version of its record. Reads work here (that is what the copy is ' +
      'for); a record written here would merge back into the main line as false history, so ' +
      `mutating verbs run at the enclosing workspace: cd ${enclosing}`,
  );
}

// -- the gated merge --------------------------------------------------------

export type MergeOutcome = 'merged' | 'already-merged' | 'previewed';

export interface MergeReport {
  readonly branch: string;
  readonly mainLine: string;
  readonly outcome: MergeOutcome;
  /** Commits the branch holds beyond the main line, at the moment of asking. */
  readonly commits: number;
  /** The landed merge commit (short) — present exactly when merged. */
  readonly mergeCommit?: string;
  /** `git diff --stat` against the merge base — present exactly when previewed. */
  readonly diffStat?: string;
}

/**
 * The human's act that lands a stewardship branch
 * (intent/01-concepts/06-workspace-lifecycle.md: "stewardship reaches the
 * workspace's main line through a branch the human explicitly merges").
 * Runs at the workspace root, merges into the main line WITHOUT the root
 * checkout ever leaving it (the root is already on the main line — merging
 * there advances the branch it is on, switching nothing), refuses honestly
 * on a dirty root, and aborts cleanly on conflicts — no resolution is ever
 * attempted, the tree is handed back exactly as found. `preview` is the
 * smallest honest look before the act: the commit count and diff stat,
 * mutating nothing (the fuller preview UX belongs to the upgrade entry).
 */
export async function mergeWorkspaceBranch(
  root: string,
  branch: string,
  preview = false,
): Promise<MergeReport> {
  refuseStewardshipCopy(root); // the merge is the enclosing workspace's act
  const mainLine = workspaceMainLine(root);
  if (branch === mainLine) {
    throw new WardError(`'${branch}' is the workspace's main line itself — nothing to merge`);
  }
  if (git(root, 'rev-parse', '--verify', '--quiet', `refs/heads/${branch}`).exitCode !== 0) {
    throw new WardError(
      `no branch named '${branch}' in the workspace's own repository — ` +
        'see: git branch (run at the workspace root)',
    );
  }
  const count = countAhead(root, mainLine, branch);
  if (count === 0) {
    return { branch, mainLine, outcome: 'already-merged', commits: 0 };
  }
  if (preview) {
    const diffStat = git(root, 'diff', '--stat', `${mainLine}...${branch}`).stdout.trimEnd();
    return { branch, mainLine, outcome: 'previewed', commits: count, diffStat };
  }
  if (git(root, 'status', '--porcelain').stdout.trim() !== '') {
    throw new WardError(
      'the workspace root has uncommitted changes — the merge lands on the root checkout, and ' +
        'a dirty tree could tangle those changes into it; commit or remove them first',
    );
  }
  // The merge is a mutate-and-commit span racing the journal (every lifecycle
  // verb commits to the same main line), so it serializes on the store lock
  // (design/0013-telemetry-and-serialized-writes/).
  return withStoreLock(root, `workspace merge ${branch}`, async () => {
    // Re-derived under the lock: a concurrent merge of the same branch
    // converges to already-merged instead of double-merging (§6).
    const commits = countAhead(root, mainLine, branch);
    if (commits === 0) {
      return { branch, mainLine, outcome: 'already-merged' as const, commits: 0 };
    }
    const merge = git(
      root,
      'merge',
      '--no-ff',
      '-m',
      `Merge stewardship branch '${branch}' (ward ${pkg.version})`,
      branch,
    );
    if (merge.exitCode !== 0) {
      // Never resolve, never leave the root mid-merge: name what conflicted,
      // abort, and hand the tree back exactly as found (§20).
      const conflicted = git(root, 'diff', '--name-only', '--diff-filter=U')
        .stdout.trim()
        .split('\n')
        .filter((line) => line !== '');
      git(root, 'merge', '--abort'); // a merge that never started has nothing to abort
      const what =
        conflicted.length > 0 ? `conflicts in: ${conflicted.join(', ')}` : merge.stderr.trim();
      throw new WardError(
        `merging '${branch}' into ${mainLine} failed — ${what}. Aborted; the root is exactly ` +
          `as it was. Rebase the stewardship branch onto ${mainLine} in its own worktree ` +
          `(ward worktree rebase TASK), resolve there, then merge again.`,
      );
    }
    const mergeCommit = git(root, 'rev-parse', '--short', 'HEAD').stdout.trim();
    return { branch, mainLine, outcome: 'merged' as const, commits, mergeCommit };
  });
}

/** Commits `branch` holds that `mainLine` lacks — 0 means already landed. */
function countAhead(root: string, mainLine: string, branch: string): number {
  const count = git(root, 'rev-list', '--count', `${mainLine}..${branch}`);
  const parsed = Number.parseInt(count.stdout.trim(), 10);
  if (count.exitCode !== 0 || Number.isNaN(parsed)) {
    throw new WardError(`cannot compare '${branch}' against ${mainLine}: ${count.stderr.trim()}`);
  }
  return parsed;
}
