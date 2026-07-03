// Intent invariant: cold-start recovery (02-sessions-and-lifecycle, Recovery).
// After a reboot, `attach` restores exactly the threads in flight: it re-attaches
// open sessions (idempotent), leaves closed ones alone, re-arms wakes (firing a
// met one once), and re-validates setup hooks for LIVE worktrees ONLY — a
// torn-down worktree of closed work is skipped, never errored.

import assert from 'node:assert/strict';
import { mkdir, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { test } from 'node:test';
import { openProject } from '../../src/domain/project.ts';
import { attachWorkspace } from '../../src/domain/recovery.ts';
import { closeRoom, openRoom } from '../../src/domain/room.ts';
import { closeSession, openSession } from '../../src/domain/session.ts';
import { openTask } from '../../src/domain/task.ts';
import { createWorktree, teardownWorktree } from '../../src/domain/worktree.ts';
import type { Git } from '../../src/seams/git.ts';
import { armWake } from '../../src/seams/messaging.ts';
import { worktreeCheckout } from '../../src/store/paths.ts';
import type { PersonaRef } from '../../src/store/schemas.ts';
import { freshWorkspace, stepClock } from '../support/workspace.ts';

test('cold-start recovery — restore in-flight threads, live worktrees only', async (t) => {
  await t.test(
    're-attaches open sessions, revalidates live hooks, skips torn-down, fires wakes once',
    async () => {
      const clock = stepClock();
      const root = await freshWorkspace(t);
      const project = await openProject(root, { title: 'Meal Plan Exports', now: clock });
      await openTask(root, {
        floor: project.floor,
        title: 'CSV export',
        successCriteria: 'a CSV endpoint, merged',
        now: clock,
      });

      // A live worktree (checkout present) and a torn-down one (checkout gone).
      await createWorktree(root, { ...wtOpts('csv-export'), git: stubGit, now: clock });
      await createWorktree(root, { ...wtOpts('scratch'), git: stubGit, now: clock });
      await teardownWorktree(root, { ...wtOpts('scratch'), git: stubGit, now: clock });

      // Simulate a half-run setup on the live worktree: its deps marker vanished.
      const depsMarker = join(worktreeCheckout(root, REPO, 'csv-export'), '.ward-setup', 'deps');
      await rm(depsMarker, { force: true });
      assert.equal(await exists(depsMarker), false, 'precondition: the marker is gone');

      // A room mid-work (open session), a separate already-closed session, a wake.
      const { room, session } = await openRoom(root, {
        floor: project.floor,
        taskSlug: 'csv-export',
        worktree: { repo: REPO, branch: 'csv-export' },
        now: clock,
      });
      const stray = await openSession(root, {
        scope: { kind: 'workspace', ref: '' },
        persona: SUPERVISOR,
        workingDir: root,
        now: clock,
      });
      await closeSession(root, stray.id, { now: clock });
      const wake = await armWake(root, session.id, { kind: 'room-done', target: room.code });

      // ── reboot: attach the workspace ──
      const report = await attachWorkspace(root, { now: clock });

      assert.deepEqual(report.resumed, [session.id], 'the open room session is re-attached');
      assert.deepEqual(report.leftClosed, [stray.id], 'the closed session is left alone');
      assert.equal(
        await exists(depsMarker),
        true,
        'the live worktree hook is re-validated (re-applied)',
      );
      assert.deepEqual(report.revalidatedWorktrees, [`${REPO}/csv-export`]);
      assert.deepEqual(
        report.skippedWorktrees,
        [`${REPO}/scratch`],
        'the torn-down worktree is skipped, not errored',
      );
      assert.deepEqual(
        report.reArmedWakes,
        [wake.id],
        'the wake is re-armed while the room is still occupied',
      );
      assert.deepEqual(report.firedWakes, []);

      // The room finishes; the next attach fires the wake exactly once.
      await closeRoom(root, room.code, { now: clock });
      assert.deepEqual(
        (await attachWorkspace(root, { now: clock })).firedWakes,
        [wake.id],
        'room-done fires once free',
      );
      assert.deepEqual(
        (await attachWorkspace(root, { now: clock })).firedWakes,
        [],
        'a satisfied wake never fires twice',
      );
    },
  );
});

// ── setup ───────────────────────────────────────────────────────────────────
const REPO = 'meal-planner';
const SUPERVISOR: PersonaRef = { name: 'morgan', role: 'house-supervisor' };

function wtOpts(branch: string) {
  return { floor: 1, taskSlug: 'csv-export', repo: REPO, branch };
}

// A stub git that just creates/removes the checkout directory — enough to exercise
// hooks and the live-vs-torn-down distinction without a real repository.
const stubGit: Git = {
  init: async () => {},
  addWorktree: async (_repoDir, checkoutDir) => {
    await mkdir(checkoutDir, { recursive: true });
  },
  removeWorktree: async (_repoDir, checkoutDir) => {
    await rm(checkoutDir, { recursive: true, force: true });
  },
  currentBranch: async () => 'main',
};

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}
