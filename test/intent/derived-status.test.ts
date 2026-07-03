// Intent invariant: status is DERIVED, never stored (domain-model, §17).
// Design-independent: it asserts the derivation RULE and that querying the record
// yields the right roll-up — not how projects/tasks are persisted.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { openProject } from '../../src/domain/project.ts';
import {
  type ContainerStatus,
  isInReview,
  projectStatus,
  rollup,
  workspaceStatus,
} from '../../src/domain/status.ts';
import { closeTask, openTask, pauseTask, unpauseTask } from '../../src/domain/task.ts';
import { freshWorkspace, stepClock } from '../support/workspace.ts';

test('derived status — the roll-up rule (precedence active ▸ paused ▸ closed)', async (t) => {
  const cases: { name: string; children: ContainerStatus[]; expected: ContainerStatus }[] = [
    { name: 'empty container is active', children: [], expected: 'active' },
    { name: 'single active', children: ['active'], expected: 'active' },
    { name: 'single paused', children: ['paused'], expected: 'paused' },
    { name: 'all closed', children: ['closed', 'closed'], expected: 'closed' },
    {
      name: 'active wins over paused + closed',
      children: ['closed', 'paused', 'active'],
      expected: 'active',
    },
    { name: 'paused wins over closed', children: ['closed', 'paused'], expected: 'paused' },
    { name: 'all paused', children: ['paused', 'paused'], expected: 'paused' },
  ];
  for (const c of cases) {
    await t.test(c.name, () => assert.equal(rollup(c.children), c.expected));
  }
});

test('derived status — in-review overlay (derived from the open-PR set, never a roll-up state)', async (t) => {
  const cases: { state: 'active' | 'paused' | 'closed'; prs: number; expected: boolean }[] = [
    { state: 'active', prs: 0, expected: false },
    { state: 'active', prs: 2, expected: true },
    { state: 'paused', prs: 1, expected: true },
    { state: 'closed', prs: 3, expected: false }, // closed is never in-review
  ];
  for (const c of cases) {
    await t.test(`${c.state} + ${c.prs} open PR(s) -> ${c.expected}`, () =>
      assert.equal(isInReview(c.state, c.prs), c.expected),
    );
  }
});

test('derived status — resolved fresh from the record as children change', async (t) => {
  const clock = stepClock();
  const root = await freshWorkspace(t);
  const project = await openProject(root, { title: 'Meal Plan Exports', now: clock });

  assert.equal(
    await projectStatus(root, project.floor),
    'active',
    'a freshly-opened floor is active',
  );

  await openTask(root, {
    floor: project.floor,
    title: 'CSV export',
    successCriteria: 'a CSV endpoint, merged',
    now: clock,
  });
  await openTask(root, {
    floor: project.floor,
    title: 'PDF export',
    successCriteria: 'a PDF endpoint, merged',
    now: clock,
  });
  assert.equal(
    await projectStatus(root, project.floor),
    'active',
    'any active task keeps the floor active',
  );
  assert.equal(await workspaceStatus(root), 'active');

  await pauseTask(root, project.floor, 'csv-export', { now: clock });
  assert.equal(
    await projectStatus(root, project.floor),
    'active',
    'one paused + one active is still active',
  );

  await pauseTask(root, project.floor, 'pdf-export', { now: clock });
  assert.equal(await projectStatus(root, project.floor), 'paused', 'all paused -> paused');

  for (const slug of ['csv-export', 'pdf-export']) {
    await unpauseTask(root, project.floor, slug, { now: clock }); // paused -> active (closed routes via active)
    await closeTask(root, project.floor, slug, { now: clock });
  }
  assert.equal(await projectStatus(root, project.floor), 'closed', 'all closed -> closed');
  assert.equal(await workspaceStatus(root), 'closed', 'the workspace derives from its floors');
});
