// The deterministic workspace upgrade (design/0020-deterministic-upgrade/):
// a tool act, not an agent act. For each installed artifact it decides
// mechanically from the lineage — untouched (current or merely old) is
// brought to the current default, missing is installed, customized is left
// byte-untouched and NAMED as reconciliation residue for a human or agent to
// merge. It also backfills the baselines the classification proves, records
// the workspace's own main-line name, and refreshes the version stamp.
//
// The upgrade is stewardship, so it composes with 0019's rails instead of
// growing its own: it writes into an existing task's workspace worktree — the
// candidate copy — and commits there, on the stewardship branch. Preview is
// `ward workspace merge BRANCH --preview`, landing is the human's gated
// `ward workspace merge`, verification is the task's delivered close: the
// record-first invariants all hold because they are 0019's, reused.
import { existsSync } from 'node:fs';
import { symlink } from 'node:fs/promises';
import { join } from 'node:path';
import pkg from '../../package.json' with { type: 'json' };
import { WardError } from '../errors.ts';
import { readDocument, writeDocument } from '../store/document.ts';
import { withStoreLock } from '../store/lock.ts';
import { type Baselines, baselinesType, workspaceRecordType } from '../store/types.ts';
import { git, gitOrThrow } from './git.ts';
import { inspectClaudeGuidance } from './layout.ts';
import { classifyArtifact, INSTALLED_ARTIFACT_LINEAGE, sha256OfText } from './lineage.ts';
import { commitRecords, resolveOpenTask } from './scan.ts';
import { refuseStewardshipCopy, resolveWorkspaceMainLine } from './steward.ts';
import { readTaskWorktrees } from './worktrees.ts';

export type UpgradeAction = 'upgraded' | 'installed' | 'current' | 'kept';

export interface UpgradeArtifact {
  readonly path: string;
  readonly action: UpgradeAction;
  readonly detail: string;
}

export interface UpgradeReport {
  readonly task: string;
  readonly branch: string;
  /** Workspace-relative path of the stewardship worktree written into. */
  readonly path: string;
  readonly outcome: 'upgraded' | 'current';
  readonly mainLine: {
    readonly name: string;
    readonly action: 'recorded' | 'already-recorded';
  };
  readonly stamp: {
    readonly wardVersion: string;
    readonly action: 'advanced' | 'current';
  };
  readonly baselines: 'updated' | 'current';
  readonly artifacts: readonly UpgradeArtifact[];
  /**
   * The reconciliation residue: paths whose content is the human's own —
   * matched no default Ward ever shipped — left byte-untouched and handed to
   * a human or agent to merge. Naming it is the whole of the tool's part.
   */
  readonly residue: readonly string[];
  /** The upgrade commit on the stewardship branch (short) — when one landed. */
  readonly commit?: string;
}

/**
 * Upgrade the workspace deterministically, via TASK's stewardship worktree.
 * Every write below lands in the candidate copy and rides one commit on the
 * stewardship branch — artifacts, backfilled baselines, the recorded main
 * line, and the stamp arrive together or not at all (the baseline moves with
 * the artifact it fingerprints, intent/01-concepts/06-workspace-lifecycle.md).
 * Convergent: a second run finds everything current and commits nothing.
 */
export async function upgradeWorkspace(root: string, taskCode: string): Promise<UpgradeReport> {
  refuseStewardshipCopy(root); // the upgrade is the enclosing workspace's act
  const task = await resolveOpenTask(root, taskCode);
  const worktree = (await readTaskWorktrees(root, task.dir)).find(
    (record) => record.source === 'workspace',
  );
  if (worktree === undefined) {
    throw new WardError(
      `task ${task.record.code} has no worktree of the workspace's own repository — the ` +
        'upgrade is stewardship and writes into one, so the human can preview and merge it ' +
        `(design 0019). Create it first: ward worktree create ${task.record.code} --workspace`,
    );
  }
  const copy = join(root, worktree.path);
  if (!existsSync(copy)) {
    throw new WardError(
      `${worktree.path} is recorded but missing on disk — re-establish it: ` +
        `ward worktree create ${task.record.code} --workspace`,
    );
  }
  // The upgrade commits in the copy; anything uncommitted there would be
  // swept into a commit claiming to be Ward's mechanical act (§17).
  if (git(copy, 'status', '--porcelain').stdout.trim() !== '') {
    throw new WardError(
      `${worktree.path} has uncommitted changes — the upgrade commits on the stewardship ` +
        'branch, and a dirty tree would tangle your changes into it; commit or remove them first',
    );
  }
  // Serialized like every mutation (0013). The writes land in the worktree,
  // not the root store, but two concurrent upgrades of one task would race
  // the same branch — the lock makes the second a clean convergence instead.
  return withStoreLock(root, `workspace upgrade ${taskCode}`, () =>
    upgradeInCopy(root, task.record.code, worktree.branch, worktree.path, copy),
  );
}

async function upgradeInCopy(
  root: string,
  taskCode: string,
  branch: string,
  worktreePath: string,
  copy: string,
): Promise<UpgradeReport> {
  const changed: string[] = [];
  const artifacts: UpgradeArtifact[] = [];
  const residue: string[] = [];

  // Baselines as the copy carries them — the fingerprints recorded at install
  // time, empty or absent on a workspace older than its own baselines.
  const hasBaselines = existsSync(join(copy, baselinesType.relPath));
  const existing: Baselines['artifacts'] = hasBaselines
    ? (await readDocument(copy, baselinesType)).data.artifacts
    : [];
  const baselineByPath = new Map(existing.map((entry) => [entry.path, entry]));

  // 1. Each installed artifact: replace, install, keep-and-name, or nothing.
  for (const lineage of INSTALLED_ARTIFACT_LINEAGE) {
    const verdict = await classifyArtifact(copy, lineage, baselineByPath.get(lineage.path)?.sha256);
    switch (verdict.standing) {
      case 'current':
        artifacts.push({
          path: lineage.path,
          action: 'current',
          detail: 'already the current default',
        });
        break;
      case 'stale':
        await Bun.write(join(copy, lineage.path), lineage.current());
        changed.push(lineage.path);
        artifacts.push({
          path: lineage.path,
          action: 'upgraded',
          detail: `untouched since ${verdict.era ?? 'install'} — brought to the current default`,
        });
        break;
      case 'missing':
        await Bun.write(join(copy, lineage.path), lineage.current());
        changed.push(lineage.path);
        artifacts.push({
          path: lineage.path,
          action: 'installed',
          detail: 'was missing — installed the current default',
        });
        break;
      case 'customized':
        artifacts.push({
          path: lineage.path,
          action: 'kept',
          detail:
            'customized — left byte-untouched; reconciling it with the current default is yours',
        });
        residue.push(lineage.path);
        break;
    }
  }

  // 2. The CLAUDE.md bridge (0017): a link is installable mechanically; a
  // regular file or a link aimed elsewhere is the human's own arrangement —
  // kept, and named as residue, because after an upgrade moves AGENTS.md a
  // divergent guidance surface is exactly the content only they can merge.
  artifacts.push(await upgradeClaudeGuidance(copy, changed, residue));

  // 3. The workspace record: the main-line name recorded from the enclosing
  // repository (never assumed — the root checkout is the authority when the
  // record has nothing yet), and the version stamp brought to this CLI.
  const record = await readDocument(copy, workspaceRecordType);
  const mainLineName = record.data.mainLine ?? resolveWorkspaceMainLine(root);
  const mainLineAction = record.data.mainLine === undefined ? 'recorded' : 'already-recorded';
  const stampAction = record.data.wardVersion === pkg.version ? 'current' : 'advanced';
  if (mainLineAction === 'recorded' || stampAction === 'advanced') {
    await writeDocument(copy, workspaceRecordType, {
      data: { ...record.data, wardVersion: pkg.version, mainLine: mainLineName },
      body: record.body,
    });
    changed.push(workspaceRecordType.relPath);
  }

  // 4. Backfill the baselines the classification proved: every artifact now
  // standing at the current default gets its fingerprint. A customized
  // artifact gets none — an absent baseline reads as customized, which is the
  // honest standing it has (0005). Entries whose fingerprint already matches
  // are kept byte-identical, so a second run converges without a write.
  const wanted: Baselines['artifacts'] = [];
  for (const lineage of INSTALLED_ARTIFACT_LINEAGE) {
    const row = artifacts.find((artifact) => artifact.path === lineage.path);
    if (row === undefined || row.action === 'kept') {
      const kept = baselineByPath.get(lineage.path);
      if (kept !== undefined) wanted.push(kept);
      continue;
    }
    const sha256 = sha256OfText(lineage.current());
    const kept = baselineByPath.get(lineage.path);
    wanted.push(
      kept !== undefined && kept.sha256 === sha256
        ? kept
        : {
            path: lineage.path,
            sha256,
            wardVersion: pkg.version,
            installedAt: new Date().toISOString(),
          },
    );
  }
  // Entries for paths outside the lineage (none today) survive untouched.
  for (const entry of existing) {
    if (!INSTALLED_ARTIFACT_LINEAGE.some((lineage) => lineage.path === entry.path)) {
      wanted.push(entry);
    }
  }
  const baselinesAction =
    hasBaselines && sameBaselines(existing, wanted) ? ('current' as const) : ('updated' as const);
  if (baselinesAction === 'updated') {
    await writeDocument(copy, baselinesType, {
      data: { type: 'baselines', artifacts: wanted },
      body:
        'What Ward installed here, fingerprinted at install time, so an upgrade can tell ' +
        'customized from untouched. Written by `ward`; editing it by hand breaks what ' +
        'divergence detection means.',
    });
    changed.push(baselinesType.relPath);
  }

  // 5. One commit carries the whole act — or nothing needed doing.
  let commit: string | undefined;
  if (changed.length > 0) {
    commitRecords(copy, 'Upgrade workspace to current defaults', ...changed);
    commit = gitOrThrow(copy, 'rev-parse', '--short', 'HEAD').stdout.trim();
  }
  return {
    task: taskCode,
    branch,
    path: worktreePath,
    outcome: changed.length > 0 ? 'upgraded' : 'current',
    mainLine: { name: mainLineName, action: mainLineAction },
    stamp: { wardVersion: pkg.version, action: stampAction },
    baselines: baselinesAction,
    artifacts,
    residue,
    ...(commit === undefined ? {} : { commit }),
  };
}

async function upgradeClaudeGuidance(
  copy: string,
  changed: string[],
  residue: string[],
): Promise<UpgradeArtifact> {
  const path = 'CLAUDE.md';
  switch (inspectClaudeGuidance(copy)) {
    case 'linked':
      return { path, action: 'current', detail: 'CLAUDE.md → AGENTS.md' };
    case 'absent':
      await symlink('AGENTS.md', join(copy, path));
      changed.push(path);
      return { path, action: 'installed', detail: 'CLAUDE.md → AGENTS.md (the 0017 bridge)' };
    case 'file':
      residue.push(path);
      return {
        path,
        action: 'kept',
        detail: 'a regular file of your own — left as is; it no longer tracks AGENTS.md',
      };
    case 'elsewhere':
      residue.push(path);
      return {
        path,
        action: 'kept',
        detail: 'a symlink aimed away from AGENTS.md — left as is',
      };
  }
}

function sameBaselines(a: Baselines['artifacts'], b: Baselines['artifacts']): boolean {
  if (a.length !== b.length) return false;
  return a.every((entry, index) => {
    const other = b[index];
    return (
      other !== undefined &&
      other.path === entry.path &&
      other.sha256 === entry.sha256 &&
      other.wardVersion === entry.wardVersion &&
      other.installedAt === entry.installedAt
    );
  });
}
