// Publishing a stewardship branch to the workspace's forge
// (design/0030-upgrade-self-service/): the second technique intent leaves open
// for the stewardship review boundary — "where the workspace does have a forge
// remote, the same boundary may be reviewed as a pull request instead" (§19;
// intent/01-concepts/06-workspace-lifecycle.md, The review boundary is the
// branch, not a forge).
//
// The invariant this module is built around: **the pull request is a review
// surface, not the landing act.** Landing stays 0019's local gated merge
// (`ward workspace merge`), because the workspace's root checkout IS its
// main-line checkout — a merge performed on the forge would create a commit
// the root does not have and diverge the very record it was reviewing. So this
// module pushes and asks; it never merges, and nothing here is reachable from
// a declared agent's invocation.
//
// Everything is degradation-shaped (§20): no forge remote, no gh, a refused
// push, a forge that says no — each is an outcome with its reason, never a
// throw. The upgrade that called this has already committed, and its task,
// worktree, and commit must stand and be named whatever the forge did.
import { ensurePullRequest, forgeRemote } from '../forge/gh.ts';
import { git } from './git.ts';

/**
 * How `origin/<mainLine>` stands after the fast-forward publish attempt. A
 * pull request diffs its head against the base branch **as the forge holds
 * it**, so a workspace whose main line runs ahead of origin (locally-first
 * stewardship: dozens of unpushed journal commits) would show every one of
 * them as part of the upgrade. Publishing the main line first is what makes
 * the PR diff exactly the upgrade.
 */
export interface BasePublication {
  readonly ref: string;
  /** `published`: the forge advanced. `current`: it already held the tip. `unpublished`: it did not move, and why. */
  readonly outcome: 'published' | 'current' | 'unpublished';
  readonly detail: string;
}

export interface Publication {
  /**
   * `opened` / `existing`: there is a pull request, and `url` names it
   * (`existing` is the convergent re-run). `skipped`: there is no forge to ask
   * — no remote, no gh — and nothing outward was attempted. `failed`: the
   * forge was there and said no. `detail` always carries the why.
   */
  readonly outcome: 'opened' | 'existing' | 'skipped' | 'failed';
  readonly url?: string;
  readonly detail: string;
  /** Present exactly when a forge was found and the base publish was attempted. */
  readonly base?: BasePublication;
}

export interface PublishRequest {
  readonly branch: string;
  readonly mainLine: string;
  readonly title: string;
  readonly body: string;
}

/**
 * Push the workspace's main line (fast-forward only — `git push` without
 * `--force` can do nothing else), push the stewardship branch, and make sure
 * it has a pull request. Runs at the workspace ROOT: the root's repository is
 * the one holding both refs and the `origin` remote, and the stewardship
 * worktree shares its object store.
 *
 * Nothing here is gated by §18 in the sense the merge is: no work reaches a
 * main line, no pull request is merged, no branch is deleted. Publishing the
 * main line is the one act worth naming — it advances a remote main line, and
 * §18 lists "pushing to a main line" among the gated set. It is done here
 * because these commits are the JOURNAL, which intent already blesses as
 * landing directly on the workspace's own main line; the push publishes a
 * record that already exists rather than delivering work. The tension is real
 * and is filed as this entry's SF-001 rather than papered over — and the
 * mechanical guard is that the push is never forced, so it can only ever
 * fast-forward what the forge already holds.
 */
export async function publishStewardshipBranch(
  root: string,
  request: PublishRequest,
): Promise<Publication> {
  const remote = git(root, 'remote', 'get-url', 'origin');
  if (remote.exitCode !== 0 || remote.stdout.trim() === '') {
    return {
      outcome: 'skipped',
      detail: "the workspace's own repository has no origin remote, and needs none",
    };
  }
  const forge = forgeRemote(remote.stdout.trim());
  if (forge === null) {
    return {
      outcome: 'skipped',
      detail: `origin (${remote.stdout.trim()}) names no forge`,
    };
  }

  const base = publishMainLine(root, request.mainLine);
  const branchPush = git(root, 'push', 'origin', request.branch);
  if (branchPush.exitCode !== 0) {
    return {
      outcome: 'failed',
      base,
      detail: `pushing ${request.branch} to origin failed — ${firstLine(branchPush.stderr)}`,
    };
  }
  const pr = await ensurePullRequest(root, {
    base: request.mainLine,
    head: request.branch,
    title: request.title,
    body: request.body,
  });
  if (pr.outcome === 'unavailable') {
    return {
      outcome: 'skipped',
      base,
      detail: `${request.branch} is pushed, but ${pr.detail}`,
    };
  }
  return {
    outcome: pr.outcome,
    base,
    detail: pr.detail,
    ...(pr.url === undefined ? {} : { url: pr.url }),
  };
}

/**
 * Fast-forward the forge's copy of the main line. Never `--force`: git itself
 * refuses anything but a fast-forward, so the worst case is `unpublished` with
 * git's own reason — which is exactly the honest answer, because a diverged
 * remote main line is a condition only the human can resolve.
 */
function publishMainLine(root: string, mainLine: string): BasePublication {
  const push = git(root, 'push', 'origin', mainLine);
  const said = `${push.stdout}\n${push.stderr}`;
  if (push.exitCode !== 0) {
    return {
      ref: mainLine,
      outcome: 'unpublished',
      detail: `origin/${mainLine} could not be advanced — ${firstLine(push.stderr)}`,
    };
  }
  if (said.includes('Everything up-to-date')) {
    return { ref: mainLine, outcome: 'current', detail: `origin/${mainLine} already held the tip` };
  }
  return {
    ref: mainLine,
    outcome: 'published',
    detail: `origin/${mainLine} advanced, so the pull request diffs the upgrade alone`,
  };
}

function firstLine(text: string): string {
  const trimmed = text.trim();
  return (trimmed.split('\n')[0] ?? trimmed) || 'no output';
}
