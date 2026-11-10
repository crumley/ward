// Restoring the materialized state from the record
// (design/0021-restore-from-clone/): a fresh clone of the workspace
// repository carries the complete record and none of the world it describes —
// repos/, floors/, and the branches living in them are ignored by the
// workspace's own git and die with the machine that held them. This verb is
// where "self-sufficient" is proven: the record alone re-materializes the
// working state (intent/01-concepts/06-workspace-lifecycle.md, §3).
//
// Restore is the converse of every other verb: it changes the WORLD to match
// the record and writes no record at all — no document, no journal commit,
// nothing in the record advances — which is also why it takes no store lock.
// And it never fabricates: a worktree is re-created only from a branch that
// survives, locally or on origin; a branch reachable nowhere is named lost,
// loudly, with the record left intact for the human to adjudicate — never
// silently skipped, never re-invented from the main line.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { WardError } from '../errors.ts';
import { readDocument } from '../store/document.ts';
import { repositoryRecordType, type WorktreeRecord } from '../store/types.ts';
import { taskAddress } from './address.ts';
import { establishFloorViews } from './floor-views.ts';
import { git } from './git.ts';
import { readProjects } from './projects.ts';
import { addRepository, checkoutPath, listRepositoryNames } from './repos.ts';
import { readOpenSessions } from './sessions.ts';
import { refuseStewardshipCopy } from './steward.ts';
import {
  moveCheckout,
  moveRefusal,
  type OpenSessionsAt,
  openWorktreeClaims,
  ownCheckout,
  registeredCheckouts,
  type WorktreeClaim,
} from './worktrees.ts';

export type RestoreRepositoryOutcome = 'restored' | 'satisfied' | 'failed';

export interface RestoreRepositoryItem {
  readonly name: string;
  readonly outcome: RestoreRepositoryOutcome;
  readonly detail: string;
}

export type RestoreWorktreeOutcome = 'restored' | 'satisfied' | 'lost' | 'failed';

export interface RestoreWorktreeItem {
  readonly taskCode: string;
  readonly record: WorktreeRecord;
  readonly outcome: RestoreWorktreeOutcome;
  readonly detail: string;
}

/** Open sessions are named, never restored — a run is not machine-portable state. */
export interface RestoreSessionsNote {
  readonly open: number;
  readonly detail: string;
}

/** The floors' views, established after the worktrees (design/0057-context-from-root/). */
export interface RestoreFloorViewsNote {
  readonly floors: number;
  /** Workspace-relative links written this run. */
  readonly written: readonly string[];
  readonly detail: string;
}

export interface RestoreReport {
  readonly root: string;
  readonly repositories: readonly RestoreRepositoryItem[];
  readonly worktrees: readonly RestoreWorktreeItem[];
  readonly floorViews: RestoreFloorViewsNote;
  readonly sessions: RestoreSessionsNote;
}

/** True when nothing failed and nothing was lost — the converged state. */
export function restoreConverged(report: RestoreReport): boolean {
  return (
    report.repositories.every((item) => item.outcome !== 'failed') &&
    report.worktrees.every((item) => item.outcome !== 'lost' && item.outcome !== 'failed')
  );
}

/**
 * Converge the workspace's materialized state toward its record: canonical
 * checkouts first (worktrees of registered repositories branch off them),
 * then the worktrees of every non-closed task, then the honest note about
 * session records that cannot be live here. Per-item failures are contained —
 * one dead remote must not block the rest — and re-running on an intact
 * workspace reports every item satisfied and changes nothing (§6).
 */
export async function restoreWorkspace(root: string): Promise<RestoreReport> {
  // Materializing the world inside a stewardship copy would build repos and
  // worktrees into a preview; restore is the enclosing workspace's act
  // (design/0019-stewardship-worktrees/).
  refuseStewardshipCopy(root);

  const repositories: RestoreRepositoryItem[] = [];
  for (const name of listRepositoryNames(root)) {
    repositories.push(await restoreRepository(root, name));
  }

  const worktrees: RestoreWorktreeItem[] = [];
  // Every scope's open sessions, the workspace's own included since
  // design/0029-launched-sessions/ — one reader, so a launched workspace
  // session is named here exactly as a task session is.
  const openSessions = (await readOpenSessions(root)).map((listing) => listing.record);
  const open = openSessions.length;
  // Closed tasks are not asked: their worktrees settled at the gated close,
  // and re-materializing one would undo a correct teardown (the 0016 posture).
  const claims = await openWorktreeClaims(root);
  for (const claim of claims) {
    worktrees.push(
      await restoreWorktree(root, claim, repositories, { sessions: openSessions, claims }),
    );
  }

  // The floors' views last (design/0057-context-from-root/): `floors/` is
  // ignored, so a fresh clone has none until now — and the worktrees above
  // are what first gives a view anything to hold.
  const views = await establishFloorViews(root, await readProjects(root));
  const floorViews: RestoreFloorViewsNote = {
    floors: views.floors,
    written: views.written,
    detail:
      views.written.length === 0
        ? `${views.floors} open floor${views.floors === 1 ? '' : 's'}, every view in place`
        : `${views.floors} open floor${views.floors === 1 ? '' : 's'}; ${views.written.length} ` +
          `link${views.written.length === 1 ? '' : 's'} written under floors/`,
  };

  const detail =
    open === 0
      ? 'no open session records'
      : `${open} open session record${open === 1 ? '' : 's'} — a session is not restorable ` +
        'state: its run lived in a harness on the machine that recorded it. Resume the work ' +
        'in new sessions, or close what died there: ward session close ID';
  return { root, repositories, worktrees, floorViews, sessions: { open, detail } };
}

/**
 * The canonical checkout, re-established from the record alone: the remote
 * and the main line were recorded at registration exactly so this moment
 * needs nothing else (intent/01-concepts/06-workspace-lifecycle.md, the
 * repository set). The mechanism is 0003's own converge path — `repo add`
 * with the recorded remote clones and lands on the recorded main line — so
 * restore cannot drift from what registration means. A checkout already on
 * disk is satisfied untouched: drift *within* it (wrong origin, dirty tree)
 * is doctor's to name, and overwriting it could destroy work.
 */
async function restoreRepository(root: string, name: string): Promise<RestoreRepositoryItem> {
  try {
    const record = (await readDocument(root, repositoryRecordType(name))).data;
    if (existsSync(checkoutPath(root, name))) {
      return { name, outcome: 'satisfied', detail: `checkout present at repos/${name}/` };
    }
    await addRepository(root, record.remote, name);
    return {
      name,
      outcome: 'restored',
      detail: `cloned from ${record.remote} on ${record.mainLine}`,
    };
  } catch (error) {
    if (error instanceof WardError) return { name, outcome: 'failed', detail: error.message };
    throw error;
  }
}

/**
 * One worktree, re-created at the recorded path from the recorded branch —
 * and only from it. Resolution is honest, in order: the branch surviving
 * locally is checked out where it stands; a branch surviving only as
 * origin/<branch> (the fresh-clone case — pushed work outlives the machine)
 * is re-created from that ref; before naming a branch lost, origin itself is
 * asked once (a targeted fetch, so a stale mirror cannot turn "pushed since
 * the last refresh" into a false loss). A branch reachable nowhere is LOST:
 * the record stays, the outcome says so, and nothing is fabricated.
 */
async function restoreWorktree(
  root: string,
  claim: WorktreeClaim,
  repositories: readonly RestoreRepositoryItem[],
  around: { readonly sessions: OpenSessionsAt; readonly claims: readonly WorktreeClaim[] },
): Promise<RestoreWorktreeItem> {
  const { record } = claim;
  const taskCode = taskAddress(claim.task);
  const item = (outcome: RestoreWorktreeOutcome, detail: string): RestoreWorktreeItem => ({
    taskCode,
    record,
    outcome,
    detail,
  });
  const destination = join(root, record.path);
  if (existsSync(destination)) return item('satisfied', 'on disk');

  // The repository the worktree is of: the canonical checkout for a
  // registered one, the workspace root itself for the stewardship case —
  // the 0019 teardown rule, pointed the other way.
  let repoDir: string;
  if (record.repo === undefined) {
    repoDir = root;
  } else {
    const repository = repositories.find((candidate) => candidate.name === record.repo);
    if (repository === undefined) {
      return item('failed', `no repository named '${record.repo}' is registered`);
    }
    if (repository.outcome === 'failed') {
      return item('failed', `its repository '${record.repo}' was not restored — see that row`);
    }
    repoDir = checkoutPath(root, record.repo);
  }

  // A hand-deleted directory can leave a stale registration behind; prune
  // first so re-adding at the recorded path cannot collide with a ghost.
  git(repoDir, 'worktree', 'prune');

  // The branch already checked out at another path is how a clone that missed
  // the move to `floors/` looks (design/0057-context-from-root/): the record
  // moved on another machine, the checkout here did not. That checkout is
  // moved, never cut a second time beside it — under the same guards the
  // migration applies, because it may be in use.
  // A checkout another open record claims is that task's, never this one's.
  const from = ownCheckout(
    root,
    record,
    registeredCheckouts(repoDir) ?? [],
    claim,
    around.claims,
  )?.actual;
  if (from !== undefined) {
    const refusal = moveRefusal(root, from, record.path, around.sessions);
    if (refusal !== undefined) {
      return item(
        'failed',
        `branch '${record.branch}' is checked out at ${from}, which cannot be moved to the ` +
          `recorded path now: ${refusal.reason}`,
      );
    }
    const refused = await moveCheckout(root, record, from, record.path);
    if (refused !== undefined) return item('failed', `${from}: ${refused}`);
    return item('restored', `moved the checkout of '${record.branch}' here from ${from}`);
  }

  if (
    git(repoDir, 'rev-parse', '--verify', '--quiet', `refs/heads/${record.branch}`).exitCode === 0
  ) {
    const add = git(repoDir, 'worktree', 'add', destination, record.branch);
    if (add.exitCode !== 0) return item('failed', `git worktree add failed: ${add.stderr.trim()}`);
    return item('restored', `checked out surviving branch '${record.branch}'`);
  }

  const remoteRef = `refs/remotes/origin/${record.branch}`;
  let onOrigin = git(repoDir, 'rev-parse', '--verify', '--quiet', remoteRef).exitCode === 0;
  if (!onOrigin) {
    const fetch = git(repoDir, 'fetch', 'origin', `+refs/heads/${record.branch}:${remoteRef}`);
    onOrigin =
      fetch.exitCode === 0 &&
      git(repoDir, 'rev-parse', '--verify', '--quiet', remoteRef).exitCode === 0;
  }
  if (onOrigin) {
    const add = git(
      repoDir,
      'worktree',
      'add',
      '-b',
      record.branch,
      destination,
      `origin/${record.branch}`,
    );
    if (add.exitCode !== 0) return item('failed', `git worktree add failed: ${add.stderr.trim()}`);
    return item('restored', `branch '${record.branch}' re-created from origin/${record.branch}`);
  }

  return item(
    'lost',
    `branch '${record.branch}' is reachable nowhere — not in the local repository, not on ` +
      'origin. The work it held was never pushed and died with the clone that held it; nothing ' +
      'can honestly re-materialize it. The record is kept for you to adjudicate: recover the ' +
      `branch by other means, or close the task (ward task close ${taskCode} --outcome ` +
      'abandoned) to let it go.',
  );
}
