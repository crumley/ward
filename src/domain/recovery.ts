// Cold-start recovery (§10; sessions: Recovery). Orchestrates the per-seam mechanisms in order:
// enumerate sessions across all scopes → keep the OPEN, not-closed ones → re-attach each via its
// harness handle → re-arm pending wakes → re-validate worktree setup hooks (no-op if satisfied) →
// leave CLOSED sessions alone. Rebuilds live state from the record (§16): the record is authoritative.

import { join } from "node:path";
import { existsSync } from "node:fs";
import { readDoc, writeDoc, listDirs, listDocs } from "../store/doc.ts";
import { readEvents, foldSessions } from "../store/log.ts";
import {
  projectsDir,
  tasksDir,
  roomsDir,
  roomDir,
  worktreesMetaDir,
  logDir,
} from "../store/paths.ts";
import { runSetupHooks, worktreeSetupHooks } from "./hooks.ts";
import { pendingWakes } from "../seams/messaging.ts";
import * as harness from "../seams/harness.ts";

export type RecoveryReport = {
  reattached: { scope: string; session: string; handle: string }[];
  closedSkipped: number;
  unresolvable: { scope: string; session: string }[];
  wakesRearmed: { id: string; condition: string }[];
  hooksRevalidated: { worktree: string; applied: string[] }[];
};

async function allScopeLogDirs(root: string): Promise<{ scope: string; dir: string }[]> {
  const out: { scope: string; dir: string }[] = [];
  for (const p of await listDirs(projectsDir(root))) {
    const pDir = join(projectsDir(root), p);
    out.push({ scope: `project:${p}`, dir: logDir(pDir) });
    for (const t of await listDirs(tasksDir(pDir))) {
      const tDir = join(tasksDir(pDir), t);
      out.push({ scope: `task:${p}/${t}`, dir: logDir(tDir) });
      for (const r of await listDirs(roomsDir(tDir))) {
        out.push({ scope: `room:${r}`, dir: logDir(roomDir(tDir, r)) });
      }
    }
  }
  return out;
}

export async function recover(root: string): Promise<RecoveryReport> {
  const report: RecoveryReport = {
    reattached: [],
    closedSkipped: 0,
    unresolvable: [],
    wakesRearmed: [],
    hooksRevalidated: [],
  };

  // 1–3: enumerate sessions, keep open-not-closed, re-attach via harness handle.
  for (const { scope, dir } of await allScopeLogDirs(root)) {
    for (const s of (foldSessions(await readEvents(dir))).values()) {
      if (s.state === "closed") {
        report.closedSkipped++; // closed stays closed — never revived
        continue;
      }
      if (!s.handle) {
        report.unresolvable.push({ scope, session: s.session });
        continue;
      }
      try {
        await harness.resume(root, s.handle); // re-attach the live run from the recorded handle
        report.reattached.push({ scope, session: s.session, handle: s.handle });
      } catch {
        report.unresolvable.push({ scope, session: s.session });
      }
    }
  }

  // 4: re-arm pending (still-armed) wakes. The record already holds them; this re-registers them.
  for (const w of await pendingWakes(root)) {
    report.wakesRearmed.push({ id: w.id, condition: w.condition });
  }

  // 5: re-validate worktree setup hooks — converge to satisfied without repeating work.
  for (const p of await listDirs(projectsDir(root))) {
    const pDir = join(projectsDir(root), p);
    for (const t of await listDirs(tasksDir(pDir))) {
      const wdir = worktreesMetaDir(join(tasksDir(pDir), t));
      for (const f of await listDocs(wdir)) {
        const path = join(wdir, f);
        const { doc, body } = await readDoc(path);
        if (doc.type !== "worktree") continue;
        // A torn-down worktree (its dir gone) is not an in-flight thread — recovery restores what is
        // genuinely live, and nothing else. Skip records whose checkout no longer exists.
        if (!existsSync(doc.path)) continue;
        const { states, applied } = await runSetupHooks(worktreeSetupHooks, {
          worktreePath: doc.path,
          theme: doc.theme,
        });
        await writeDoc(path, { ...doc, hooks: states }, body);
        report.hooksRevalidated.push({ worktree: `${doc.repo}:${doc.branch}`, applied });
      }
    }
  }

  return report;
}
