// The next step (design/0043-task-next-surface/): one derived, imperative
// sentence saying what moves a task forward now. It is the guide-to-merge
// promise made literal — "at any moment Ward answers what is left to complete
// this task" (intent/01-concepts/03-work-lifecycle.md, Completion) — and it
// is derived at read time from the record, local git, and live forge state,
// never stored (§17): every input it reads already goes stale on its own.
//
// This module is the ONE home of the derivation and of the remedy vocabulary
// the surfaces speak, so `status` and `task show` cannot recommend different
// commands for the same condition: the attention surface's per-PR
// classification (`prAttention`) and the remedy strings below are called by
// both.
import type { PrForgeState } from '../forge/gh.ts';
import type { TaskRecord } from '../store/types.ts';
import { MISSING_ON_DISK, type WorktreeStatus } from './worktrees.ts';

/**
 * Why the next step is what it is — the rung of the ladder that matched. The
 * agent audience routes on this; the human reads `text`, which says the same
 * thing in words (§8). Ordered as the ladder tries them.
 */
export type NextReason =
  | 'closed'
  | 'resume'
  | 'create-worktree'
  | 'restore-worktree'
  | 'commit-or-stash'
  | 'rebase'
  | 'open-pr'
  | 'address-review'
  | 'fix-checks'
  | 'merge'
  | 'await-review'
  | 'close'
  | 'forge-unknown';

export interface NextStep {
  readonly reason: NextReason;
  /** The imperative line, identical for both audiences — a command, or an act. */
  readonly text: string;
  /** The pull request the step is about, when the rung names one. */
  readonly pr?: string;
  /** The worktree the step is about, when the rung names one. */
  readonly path?: string;
}

export interface NextInput {
  readonly record: TaskRecord;
  /** The task's full address — every remedy is spelled with it (0036). */
  readonly address: string;
  /** Per-worktree freshness; absent when the task is closed or git could not be asked. */
  readonly worktrees?: readonly WorktreeStatus[];
  /** Live forge state per linked PR, in PR-set order; absent when the forge did not answer. */
  readonly forge?: readonly PrForgeState[];
}

/** What one open PR is waiting on — the classification both surfaces derive from. */
export type PrAttention = 'changes-requested' | 'checks-failing' | 'review-pending' | 'ready';

/**
 * One open PR's attention state, worst first: a requested change outranks a
 * red build (the human's word outranks the machine's), a red build outranks
 * an unfinished review (there is nothing to review until it builds), and a PR
 * that is approved with nothing red is `ready` — waiting on the merge, which
 * is the human's act (§18). Only OPEN PRs are classified; a merged or closed
 * PR waits on nobody.
 */
export function prAttention(pr: PrForgeState): PrAttention | undefined {
  if (pr.state !== 'open') return undefined;
  if (pr.reviewDecision === 'changes-requested') return 'changes-requested';
  if (pr.checks === 'failing') return 'checks-failing';
  if (pr.reviewDecision !== 'approved' || pr.checks === 'pending') return 'review-pending';
  return 'ready';
}

/** The rebase remedy, spelled once — printed by status's freshness lines and by the ladder. */
export function rebaseCommand(address: string): string {
  return `ward worktree rebase ${address}`;
}

/** The gated close, spelled once — printed by the attention surface and by the ladder. */
export function closeCommand(address: string): string {
  return `ward task close ${address}`;
}

/**
 * The single most useful thing to do now, first match wins.
 *
 * The ladder is ordered by what BLOCKS what, not by how urgent a condition
 * feels: a task with no worktree cannot have a commit, a dirty tree cannot be
 * rebased, an unrebased branch should not be reviewed, and no review state
 * matters before a pull request exists. Reading top-down, each rung is the
 * cheapest act that unblocks the rung below it, which is what makes one line
 * enough — clear it and the next answer is the next rung.
 *
 * The forge rungs sit at the bottom in worst-first order (a requested change,
 * then a red build, then a pending review, then a merge waiting to happen,
 * then the fully merged set awaiting the gated close), and the honest
 * fall-through is last: with PRs linked and no live forge state, Ward says
 * the state is unknown and names the PR rather than inventing a verdict
 * (§20).
 */
export function nextStep(input: NextInput): NextStep {
  const { record, address } = input;
  if (record.state === 'closed') {
    const when = record.closedAt === undefined ? 'earlier' : record.closedAt.slice(0, 10);
    const outcome = record.outcome ?? 'outcome unrecorded';
    return { reason: 'closed', text: `Nothing — closed ${when} (${outcome}).` };
  }
  if (record.state === 'paused') {
    return { reason: 'resume', text: `ward task resume ${address}` };
  }

  const worktrees = input.worktrees ?? [];
  if (worktrees.length === 0) {
    // The record's own repository answers when it names exactly one — the
    // same rule `worktree create` itself applies (0037); with none or several
    // recorded, the flag stays a placeholder rather than a guess.
    const only = record.repositories?.length === 1 ? record.repositories[0] : undefined;
    const repo = only === undefined ? '--repo NAME' : `--repo ${only}`;
    return { reason: 'create-worktree', text: `ward worktree create ${address} ${repo}` };
  }
  const missing = worktrees.find((worktree) => worktree.detail === MISSING_ON_DISK);
  if (missing !== undefined) {
    return {
      reason: 'restore-worktree',
      text: `${missing.record.path} is missing on disk — re-materialize it: ward workspace restore`,
      path: missing.record.path,
    };
  }
  const dirty = worktrees.find((worktree) => worktree.freshness === 'dirty');
  if (dirty !== undefined) {
    return {
      reason: 'commit-or-stash',
      text: `commit or stash in ${dirty.record.path}`,
      path: dirty.record.path,
    };
  }
  const behind = worktrees.find(
    (worktree) => worktree.freshness === 'behind' || worktree.freshness === 'drifted',
  );
  if (behind !== undefined) {
    return { reason: 'rebase', text: rebaseCommand(address), path: behind.record.path };
  }

  if (record.prs.length === 0) {
    // The branch and path come from the worktree the work is in — the one
    // thing the human would otherwise have to go look up to open the PR.
    const worktree = worktrees[0];
    const where =
      worktree === undefined
        ? ''
        : ` from ${worktree.record.path} (branch ${worktree.record.branch})`;
    return {
      reason: 'open-pr',
      text: `open a pull request${where}, then ward task pr ${address} URL`,
      ...(worktree === undefined ? {} : { path: worktree.record.path }),
    };
  }

  const forge = input.forge;
  if (forge !== undefined) {
    for (const wanted of ATTENTION_ORDER) {
      const pr = forge.find((state) => prAttention(state) === wanted);
      if (pr !== undefined) return { ...ATTENTION_STEP[wanted](pr.url), pr: pr.url };
    }
    // The close gate's own condition, read forward: the PR set is RESOLVED
    // when every PR is merged or deliberately closed unmerged
    // (intent/01-concepts/03-work-lifecycle.md, Completion). A set with
    // nothing merged in it is the abandoned close, which is the same gated,
    // human act with the outcome said out loud.
    if (forge.length > 0 && forge.every((pr) => pr.state === 'merged' || pr.state === 'closed')) {
      const abandoned = forge.every((pr) => pr.state === 'closed');
      const command = abandoned
        ? `${closeCommand(address)} --outcome abandoned`
        : closeCommand(address);
      return { reason: 'close', text: command };
    }
  }

  const unreadable = forge?.find((pr) => pr.state === 'unknown')?.url ?? record.prs[0];
  return {
    reason: 'forge-unknown',
    text: `state unknown — check ${unreadable}`,
    ...(unreadable === undefined ? {} : { pr: unreadable }),
  };
}

const ATTENTION_ORDER: readonly PrAttention[] = [
  'changes-requested',
  'checks-failing',
  'review-pending',
  'ready',
];

const ATTENTION_STEP: Readonly<
  Record<PrAttention, (url: string) => { reason: NextReason; text: string }>
> = {
  'changes-requested': (url) => ({
    reason: 'address-review',
    text: `address the review on ${url}`,
  }),
  'checks-failing': (url) => ({ reason: 'fix-checks', text: `fix checks on ${url}` }),
  // Ward cannot tell whether the human IS the reviewer — the forge knows who
  // was requested, and asking would cost a second call to answer a question
  // whose two answers lead to the same page. So the line offers both acts and
  // lets the reader pick the one that is theirs, rather than telling half of
  // its readers to wait for themselves.
  'review-pending': (url) => ({ reason: 'await-review', text: `review or wait: ${url}` }),
  ready: (url) => ({ reason: 'merge', text: `merge ${url} — approved, checks green` }),
};
