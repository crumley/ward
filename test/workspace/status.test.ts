// The derivation rules (intent/01-concepts/00-domain-model.md, Status;
// intent/01-concepts/03-work-lifecycle.md, Task states): precedence
// active ▸ paused ▸ closed with an empty container active; in-review as an
// overlay — the linked-PRs approximation without forge state, intent's exact
// ≥1-open-PR rule with it; and the derived needs-you items — nothing stored
// anywhere (design/0009-live-forge-state/).
import { expect, test } from 'bun:test';
import type { PrForgeState } from '../../src/forge/gh.ts';
import type { TaskRecord, WorkState } from '../../src/store/types.ts';
import {
  deriveNeedsYou,
  deriveStatus,
  inReview,
  type NeedsYouEntry,
  type TaskStatus,
} from '../../src/workspace/status.ts';

const derivations: ReadonlyArray<{ children: WorkState[]; expected: WorkState; why: string }> = [
  { children: [], expected: 'active', why: 'empty container is active, not idle' },
  { children: ['active'], expected: 'active', why: 'single active child' },
  { children: ['closed', 'active'], expected: 'active', why: 'any active child wins' },
  { children: ['paused', 'active', 'closed'], expected: 'active', why: 'active outranks all' },
  { children: ['paused'], expected: 'paused', why: 'single paused child' },
  { children: ['closed', 'paused'], expected: 'paused', why: 'paused outranks closed' },
  { children: ['closed'], expected: 'closed', why: 'all closed closes the container' },
  { children: ['closed', 'closed'], expected: 'closed', why: 'unanimity required for closed' },
];

for (const { children, expected, why } of derivations) {
  test(`[${children.join(', ')}] derives ${expected} — ${why}`, () => {
    expect(deriveStatus(children)).toBe(expected);
  });
}

test('in-review without forge state: linked PRs on a non-closed task; never on a closed one', () => {
  expect(inReview(task({ prs: ['https://x/pr/1'], state: 'active' }))).toBe(true);
  expect(inReview(task({ prs: ['https://x/pr/1'], state: 'paused' }))).toBe(true);
  expect(inReview(task({ prs: ['https://x/pr/1'], state: 'closed' }))).toBe(false);
  expect(inReview(task({ prs: [], state: 'active' }))).toBe(false);
});

// With live forge state, in-review is intent's exact rule: ≥1 open PR. It
// clears only when every linked PR is known resolved — an unreadable PR
// degrades toward the approximation, never toward false certainty.
const liveOverlays: ReadonlyArray<{ forge: PrForgeState[]; expected: boolean; why: string }> = [
  { forge: [pr('open')], expected: true, why: 'an open PR is in review' },
  { forge: [pr('merged')], expected: false, why: 'fully merged is no longer in review' },
  { forge: [pr('merged'), pr('open')], expected: true, why: 'one open PR keeps the overlay' },
  { forge: [pr('closed')], expected: false, why: 'closed unmerged is not in review' },
  { forge: [pr('unknown')], expected: true, why: 'unreadable falls back to linked-PRs' },
  { forge: [pr('merged'), pr('unknown')], expected: true, why: 'unknown never clears the overlay' },
];

for (const { forge, expected, why } of liveOverlays) {
  test(`live in-review [${forge.map((s) => s.state).join(', ')}] → ${expected} — ${why}`, () => {
    expect(inReview(task({ prs: forge.map((s) => s.url), state: 'active' }), forge)).toBe(expected);
  });
}

// The needs-you seed: the two unambiguous, purely derivable conditions.
const needs: ReadonlyArray<{
  name: string;
  statuses: TaskStatus[];
  expected: NeedsYouEntry[];
}> = [
  {
    name: 'a fully merged PR set awaits the gated close',
    statuses: [status('t1', [pr('merged'), pr('merged')])],
    expected: [{ task: 't1', reason: 'awaiting-close' }],
  },
  {
    name: 'changes requested on an open PR awaits the human',
    statuses: [status('t1', [pr('merged'), pr('open', 'changes-requested', 'https://x/pr/2')])],
    expected: [{ task: 't1', reason: 'changes-requested', pr: 'https://x/pr/2' }],
  },
  {
    name: 'an approved open PR needs nobody yet',
    statuses: [status('t1', [pr('open', 'approved')])],
    expected: [],
  },
  {
    name: 'an unreadable PR blocks the awaiting-close claim — all-merged must be known',
    statuses: [status('t1', [pr('merged'), pr('unknown')])],
    expected: [],
  },
  {
    name: 'no forge state derives nothing — never guessed from the record alone',
    statuses: [status('t1', undefined)],
    expected: [],
  },
  {
    name: 'a closed-unmerged set claims nothing — abandoning is a judgment, not a derivation',
    statuses: [status('t1', [pr('closed')])],
    expected: [],
  },
  {
    name: 'every changes-requested PR is named, across tasks, in report order',
    statuses: [
      status('t1', [pr('open', 'changes-requested', 'https://x/pr/1')]),
      status('t2', [pr('merged')]),
    ],
    expected: [
      { task: 't1', reason: 'changes-requested', pr: 'https://x/pr/1' },
      { task: 't2', reason: 'awaiting-close' },
    ],
  },
];

for (const { name, statuses, expected } of needs) {
  test(`needs you: ${name}`, () => {
    expect(deriveNeedsYou(statuses)).toEqual(expected);
  });
}

// -- setup ----------------------------------------------------------------

function task(partial: Pick<TaskRecord, 'prs' | 'state'>): TaskRecord {
  return {
    type: 'task',
    code: 't1',
    slug: 'x',
    openedAt: '2026-08-02T00:00:00.000Z',
    ...partial,
  };
}

function pr(
  state: PrForgeState['state'],
  reviewDecision?: PrForgeState['reviewDecision'],
  url?: string,
): PrForgeState {
  return {
    url: url ?? `https://x/pr/${state}-${reviewDecision ?? 'any'}`,
    state,
    ...(reviewDecision === undefined ? {} : { reviewDecision }),
  };
}

function status(code: string, forge: PrForgeState[] | undefined): TaskStatus {
  const record = task({ prs: (forge ?? []).map((s) => s.url), state: 'active' });
  return {
    task: { ...record, code },
    inReview: inReview(record, forge),
    ...(forge === undefined ? {} : { forge }),
    openSessions: [],
  };
}
