// The next-step ladder (design/0043-task-next-surface/): one imperative line
// per task, derived from the record, local git freshness, and live forge
// state — first match wins, one row per rung. Forge state is injected, never
// read: the ladder is a pure function of what it is handed, which is exactly
// what makes it assertable one rung at a time.
import { expect, test } from 'bun:test';
import type { PrForgeState } from '../../src/forge/gh.ts';
import type { TaskRecord, WorktreeRecord } from '../../src/store/types.ts';
import {
  type NextInput,
  type NextReason,
  nextStep,
  prAttention,
} from '../../src/workspace/next.ts';
import type { WorktreeStatus } from '../../src/workspace/worktrees.ts';

const ADDRESS = 'f3t1';

// -- the ladder, one row per rung, in precedence order ---------------------

const rungs: ReadonlyArray<{
  readonly rung: string;
  readonly input: Partial<NextInput>;
  readonly reason: NextReason;
  readonly text: string;
}> = [
  {
    rung: 'closed — nothing to do, and the record says when and how it ended',
    input: {
      record: task({ state: 'closed', closedAt: '2026-08-30T10:00:00Z', outcome: 'delivered' }),
    },
    reason: 'closed',
    text: 'Nothing — closed 2026-08-30 (delivered).',
  },
  {
    rung: 'paused — the resume is the only move, whatever else is true',
    input: {
      record: task({ state: 'paused', prs: ['https://x/pull/1'] }),
      worktrees: [fresh('worktrees/f3t1-a')],
      forge: [pr('https://x/pull/1', { state: 'open', reviewDecision: 'changes-requested' })],
    },
    reason: 'resume',
    text: 'ward task resume f3t1',
  },
  {
    rung: 'no worktree, one recorded repository — the repo is named, not guessed',
    input: { record: task({ repositories: ['ward'] }) },
    reason: 'create-worktree',
    text: 'ward worktree create f3t1 --repo ward',
  },
  {
    rung: 'no worktree, several recorded repositories — the flag stays a placeholder',
    input: { record: task({ repositories: ['ward', 'other'] }) },
    reason: 'create-worktree',
    text: 'ward worktree create f3t1 --repo NAME',
  },
  {
    rung: 'a worktree missing on disk — restore before anything else touches it',
    input: {
      record: task({}),
      worktrees: [
        {
          record: worktree('worktrees/f3t1-a'),
          freshness: 'unreadable',
          detail: 'unreadable (missing on disk)',
        },
      ],
    },
    reason: 'restore-worktree',
    text: 'worktrees/f3t1-a is missing on disk — re-materialize it: ward workspace restore',
  },
  {
    rung: 'a dirty worktree outranks a behind one — a dirty tree cannot be rebased',
    input: {
      record: task({}),
      worktrees: [
        { record: worktree('worktrees/f3t1-b'), freshness: 'behind', behindBy: 3 },
        { record: worktree('worktrees/f3t1-a'), freshness: 'dirty' },
      ],
    },
    reason: 'commit-or-stash',
    text: 'commit or stash in worktrees/f3t1-a',
  },
  {
    rung: 'a behind worktree — the rebase remedy, spelled with the full address',
    input: {
      record: task({}),
      worktrees: [{ record: worktree('worktrees/f3t1-a'), freshness: 'behind', behindBy: 2 }],
    },
    reason: 'rebase',
    text: 'ward worktree rebase f3t1',
  },
  {
    rung: 'a drifted worktree rebases too — the record names a branch that is not checked out',
    input: {
      record: task({}),
      worktrees: [
        { record: worktree('worktrees/f3t1-a'), freshness: 'drifted', checkedOut: 'scratch' },
      ],
    },
    reason: 'rebase',
    text: 'ward worktree rebase f3t1',
  },
  {
    rung: 'no PR yet — the branch and path come along, so nothing has to be looked up',
    input: { record: task({}), worktrees: [fresh('worktrees/f3t1-a')] },
    reason: 'open-pr',
    text: 'open a pull request from worktrees/f3t1-a (branch feature), then ward task pr f3t1 URL',
  },
  {
    rung: 'changes requested outranks a red build — the human’s word outranks the machine’s',
    input: {
      record: task({ prs: ['https://x/pull/1', 'https://x/pull/2'] }),
      worktrees: [fresh('worktrees/f3t1-a')],
      forge: [
        pr('https://x/pull/1', { state: 'open', checks: 'failing' }),
        pr('https://x/pull/2', { state: 'open', reviewDecision: 'changes-requested' }),
      ],
    },
    reason: 'address-review',
    text: 'address the review on https://x/pull/2',
  },
  {
    rung: 'checks failing — fix the build before anyone is asked to read it',
    input: {
      record: task({ prs: ['https://x/pull/1'] }),
      worktrees: [fresh('worktrees/f3t1-a')],
      forge: [
        pr('https://x/pull/1', { state: 'open', reviewDecision: 'approved', checks: 'failing' }),
      ],
    },
    reason: 'fix-checks',
    text: 'fix checks on https://x/pull/1',
  },
  {
    rung: 'review pending — Ward cannot tell who the reviewer is, so it offers both acts',
    input: {
      record: task({ prs: ['https://x/pull/1'] }),
      worktrees: [fresh('worktrees/f3t1-a')],
      forge: [pr('https://x/pull/1', { state: 'open', checks: 'passing' })],
    },
    reason: 'await-review',
    text: 'review or wait: https://x/pull/1',
  },
  {
    rung: 'approved but still building — pending checks keep it out of the merge rung',
    input: {
      record: task({ prs: ['https://x/pull/1'] }),
      worktrees: [fresh('worktrees/f3t1-a')],
      forge: [
        pr('https://x/pull/1', { state: 'open', reviewDecision: 'approved', checks: 'pending' }),
      ],
    },
    reason: 'await-review',
    text: 'review or wait: https://x/pull/1',
  },
  {
    rung: 'approved and green — the merge is the human’s act, and the only one left',
    input: {
      record: task({ prs: ['https://x/pull/1'] }),
      worktrees: [fresh('worktrees/f3t1-a')],
      forge: [
        pr('https://x/pull/1', { state: 'open', reviewDecision: 'approved', checks: 'passing' }),
      ],
    },
    reason: 'merge',
    text: 'merge https://x/pull/1 — approved, checks green',
  },
  {
    rung: 'every PR merged — the gated close',
    input: {
      record: task({ prs: ['https://x/pull/1'] }),
      worktrees: [fresh('worktrees/f3t1-a')],
      forge: [pr('https://x/pull/1', { state: 'merged' })],
    },
    reason: 'close',
    text: 'ward task close f3t1',
  },
  {
    rung: 'every PR closed unmerged — the same gated close, outcome said out loud',
    input: {
      record: task({ prs: ['https://x/pull/1'] }),
      worktrees: [fresh('worktrees/f3t1-a')],
      forge: [pr('https://x/pull/1', { state: 'closed' })],
    },
    reason: 'close',
    text: 'ward task close f3t1 --outcome abandoned',
  },
  {
    rung: 'a resolved set with one merged PR closes delivered, not abandoned',
    input: {
      record: task({ prs: ['https://x/pull/1', 'https://x/pull/2'] }),
      worktrees: [fresh('worktrees/f3t1-a')],
      forge: [
        pr('https://x/pull/1', { state: 'merged' }),
        pr('https://x/pull/2', { state: 'closed' }),
      ],
    },
    reason: 'close',
    text: 'ward task close f3t1',
  },
  {
    rung: 'the forge did not answer — name the PR, never a verdict',
    input: {
      record: task({ prs: ['https://x/pull/1'] }),
      worktrees: [fresh('worktrees/f3t1-a')],
    },
    reason: 'forge-unknown',
    text: 'state unknown — check https://x/pull/1',
  },
  {
    rung: 'one unreadable PR among readable ones — the unreadable one is what is named',
    input: {
      record: task({ prs: ['https://x/pull/1', 'https://x/pull/2'] }),
      worktrees: [fresh('worktrees/f3t1-a')],
      forge: [
        pr('https://x/pull/1', { state: 'merged' }),
        pr('https://x/pull/2', { state: 'unknown' }),
      ],
    },
    reason: 'forge-unknown',
    text: 'state unknown — check https://x/pull/2',
  },
];

for (const { rung, input, reason, text } of rungs) {
  test(`next: ${rung}`, () => {
    const step = nextStep({ address: ADDRESS, record: task({}), ...input });
    expect(step.reason).toBe(reason);
    expect(step.text).toBe(text);
  });
}

// -- the properties the ladder must hold ----------------------------------

test('a closed task with no outcome still answers, without inventing one', () => {
  const step = nextStep({ address: ADDRESS, record: task({ state: 'closed' }) });
  expect(step.text).toBe('Nothing — closed earlier (outcome unrecorded).');
});

test('the noun the step is about rides beside the text — never parsed out of it', () => {
  const dirty = nextStep({
    address: ADDRESS,
    record: task({}),
    worktrees: [{ record: worktree('worktrees/f3t1-a'), freshness: 'dirty' }],
  });
  expect(dirty.path).toBe('worktrees/f3t1-a');
  const review = nextStep({
    address: ADDRESS,
    record: task({ prs: ['https://x/pull/9'] }),
    worktrees: [fresh('worktrees/f3t1-a')],
    forge: [pr('https://x/pull/9', { state: 'open', reviewDecision: 'changes-requested' })],
  });
  expect(review.pr).toBe('https://x/pull/9');
});

// The per-PR classification both surfaces share: status's needs-you reads it
// for `changes-requested`, the ladder reads all four.
const attentions: ReadonlyArray<{ state: PrForgeState; expected: string | undefined }> = [
  { state: pr('u', { state: 'merged' }), expected: undefined },
  { state: pr('u', { state: 'closed', reviewDecision: 'changes-requested' }), expected: undefined },
  {
    state: pr('u', { state: 'open', reviewDecision: 'changes-requested' }),
    expected: 'changes-requested',
  },
  { state: pr('u', { state: 'open', checks: 'failing' }), expected: 'checks-failing' },
  { state: pr('u', { state: 'open' }), expected: 'review-pending' },
  { state: pr('u', { state: 'open', reviewDecision: 'approved' }), expected: 'ready' },
  {
    state: pr('u', { state: 'open', reviewDecision: 'approved', checks: 'none' }),
    expected: 'ready',
  },
];

for (const { state, expected } of attentions) {
  test(`prAttention ${state.state}/${state.reviewDecision ?? '-'}/${state.checks ?? '-'} → ${expected}`, () => {
    expect(prAttention(state)).toBe(expected as never);
  });
}

// -- fixtures --------------------------------------------------------------

function task(over: Partial<TaskRecord>): TaskRecord {
  return {
    type: 'task',
    code: 't1',
    slug: 'a-task',
    state: 'active',
    prs: [],
    openedAt: '2026-08-01T09:00:00Z',
    ...over,
  } as TaskRecord;
}

function worktree(path: string): WorktreeRecord {
  return {
    repo: 'ward',
    branch: 'feature',
    path,
    disposition: 'deliverable',
    createdAt: '2026-08-01T09:00:00Z',
  } as WorktreeRecord;
}

function fresh(path: string): WorktreeStatus {
  return { record: worktree(path), freshness: 'current', detail: 'current (atop origin/main)' };
}

function pr(url: string, over: Partial<PrForgeState>): PrForgeState {
  return { url, state: 'open', ...over };
}
