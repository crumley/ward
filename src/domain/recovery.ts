// Recovery: bringing a workspace back to life after a cold start
// (02-sessions-and-lifecycle). An orchestration of the per-seam mechanisms, in
// order — the CLI verb that drives it reads as `attach` (the workspace-wide cold
// start), not `recover` (human-shell: verbs read true).
//
//   1-2. enumerate sessions, keep the OPEN (not closed) ones — the live threads
//   3.   re-attach each via its harness handle (resume; idempotent)
//   4.   re-arm pending wakes; one satisfied while the machine was down fires once
//   5.   re-validate setup hooks for LIVE worktrees ONLY (a torn-down worktree of
//        closed work is skipped — re-applying into a missing checkout is an error)
//   6.   leave closed sessions alone

import { stat } from 'node:fs/promises';
import type { Harness } from '../seams/harness.ts';
import { listWakes, satisfyWake } from '../seams/messaging.ts';
import type { Clock } from '../store/log.ts';
import { worktreeCheckout } from '../store/paths.ts';
import type { Wake } from '../store/schemas.ts';
import { isRoomOccupied } from './room.ts';
import { listSessions, resumeSession } from './session.ts';
import { loadTask } from './task.ts';
import { listWorktrees, revalidateWorktree } from './worktree.ts';

export interface RecoveryReport {
  resumed: string[];
  leftClosed: string[];
  reArmedWakes: string[];
  firedWakes: string[];
  revalidatedWorktrees: string[];
  skippedWorktrees: string[];
}

export interface AttachOptions {
  harness?: Harness;
  now?: Clock;
}

export async function attachWorkspace(
  root: string,
  opts: AttachOptions = {},
): Promise<RecoveryReport> {
  const report: RecoveryReport = {
    resumed: [],
    leftClosed: [],
    reArmedWakes: [],
    firedWakes: [],
    revalidatedWorktrees: [],
    skippedWorktrees: [],
  };

  for (const session of await listSessions(root)) {
    if (session.state === 'closed') {
      report.leftClosed.push(session.id);
      continue;
    }
    await resumeSession(root, session.id, opts); // idempotent re-attach
    report.resumed.push(session.id);
  }

  for (const wake of await listWakes(root)) {
    if (wake.state === 'satisfied') {
      continue;
    }
    if (await conditionMet(root, wake.condition)) {
      await satisfyWake(root, wake.id);
      report.firedWakes.push(wake.id);
    } else {
      report.reArmedWakes.push(wake.id);
    }
  }

  for (const worktree of await listWorktrees(root)) {
    const checkout = worktreeCheckout(root, worktree.repo, worktree.branch);
    const label = `${worktree.repo}/${worktree.branch}`;
    if (worktree.tornDown || !(await pathExists(checkout))) {
      report.skippedWorktrees.push(label); // closed work — re-applying into a gone checkout would error
      continue;
    }
    await revalidateWorktree(root, worktree);
    report.revalidatedWorktrees.push(label);
  }

  return report;
}

async function conditionMet(root: string, condition: Wake['condition']): Promise<boolean> {
  switch (condition.kind) {
    case 'room-done':
      return !(await isRoomOccupied(root, condition.target)); // done once the room is free
    case 'task-closed': {
      const [floor, slug] = condition.target.split('/');
      try {
        return (await loadTask(root, Number(floor), String(slug))).state === 'closed';
      } catch {
        return false;
      }
    }
    case 'pr-merged':
      return false; // driven by the remote seam (later iteration)
  }
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}
