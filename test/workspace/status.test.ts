// The derivation rule (intent/01-concepts/00-domain-model.md, Status):
// precedence active ▸ paused ▸ closed, an empty container is active, and
// in-review is an overlay computed from the PR set, never an input.
import { expect, test } from 'bun:test';
import type { TaskRecord, WorkState } from '../../src/store/types.ts';
import { deriveStatus, inReview } from '../../src/workspace/status.ts';

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

test('in-review: linked PRs on a non-closed task; never on a closed one', () => {
  expect(inReview(task({ prs: ['https://x/pr/1'], state: 'active' }))).toBe(true);
  expect(inReview(task({ prs: ['https://x/pr/1'], state: 'paused' }))).toBe(true);
  expect(inReview(task({ prs: ['https://x/pr/1'], state: 'closed' }))).toBe(false);
  expect(inReview(task({ prs: [], state: 'active' }))).toBe(false);
});

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
