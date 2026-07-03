// Reflection is incremental via a per-(scope, goal) cursor (04-reflection). Not
// one of the five load-bearing invariants, but the cursor is what keeps a
// long-deferred reflection tractable, so it earns a test.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { openProject } from '../../src/domain/project.ts';
import { reflectOnScope } from '../../src/domain/reflection.ts';
import { openTask } from '../../src/domain/task.ts';
import type { ScopeRef } from '../../src/store/schemas.ts';
import { freshWorkspace, stepClock } from '../support/workspace.ts';

test('reflection — incremental via a cursor', async (t) => {
  await t.test('advances the cursor; a re-run over nothing-new adds no proposals', async () => {
    const clock = stepClock();
    const root = await freshWorkspace(t);
    const project = await openProject(root, { title: 'Meal Plan Exports', now: clock });
    await openTask(root, {
      floor: project.floor,
      title: 'CSV export',
      successCriteria: 'x',
      now: clock,
    });
    const scope: ScopeRef = { kind: 'task', ref: '1/csv-export' };

    const first = await reflectOnScope(root, { scope, now: clock });
    assert.ok(first.proposals.length >= 1, 'fresh activity yields proposals');

    const second = await reflectOnScope(root, { scope, now: clock });
    assert.equal(second.cursor, first.cursor, 'the cursor does not move when nothing is new');
    assert.equal(
      second.proposals.length,
      first.proposals.length,
      'no duplicate proposals over stale events',
    );
  });

  await t.test('a scope with no recorded events proposes nothing', async () => {
    const clock = stepClock();
    const root = await freshWorkspace(t);
    const result = await reflectOnScope(root, {
      scope: { kind: 'workspace', ref: '' },
      now: clock,
    });
    assert.deepEqual(result.proposals, []);
    assert.equal(result.cursor, 0);
  });
});
