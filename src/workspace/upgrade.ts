// The deterministic workspace upgrade (design/0020-deterministic-upgrade/):
// a tool act, not an agent act. For each installed artifact it decides
// mechanically from the lineage — untouched (current or merely old) is
// brought to the current default, missing is installed, customized is left
// byte-untouched and NAMED as reconciliation residue for a human or agent to
// merge. It also backfills the baselines the classification proves, records
// the workspace's own main-line name, and refreshes the version stamp.
//
// The upgrade is stewardship, so it composes with 0019's rails instead of
// growing its own: it writes into a task's workspace worktree — the candidate
// copy — and commits there, on the stewardship branch. Preview is
// `ward workspace merge BRANCH --preview`, landing is the human's gated
// `ward workspace merge`, verification is the task's delivered close: the
// record-first invariants all hold because they are 0019's, reused.
//
// Who builds that vehicle is the split design/0030-upgrade-self-service/ adds.
// `upgradeWorkspace(root, TASK)` is unchanged: the caller named the task, and
// this module writes into it and stops — the composable primitive, and a
// declared agent's only path. `selfServiceUpgrade(root)` is the bare **human**
// path: it derives and opens the stewardship task itself, creates the
// worktree, runs the same upgrade, publishes the branch for review, and ends
// by naming what remains — review, merge, close — because those three are the
// human's, and Ward's part is to make them one glance away rather than four
// commands of ceremony the verb could have derived.
import { existsSync } from 'node:fs';
import { symlink } from 'node:fs/promises';
import { join } from 'node:path';
import pkg from '../../package.json' with { type: 'json' };
import { WardError } from '../errors.ts';
import { readDocument, writeDocument } from '../store/document.ts';
import { withStoreLock } from '../store/lock.ts';
import {
  type Baselines,
  baselinesType,
  type WorktreeRecord,
  workspaceRecordType,
} from '../store/types.ts';
import { git, gitOrThrow } from './git.ts';
import { inspectClaudeGuidance } from './layout.ts';
import { classifyArtifact, INSTALLED_ARTIFACT_LINEAGE, sha256OfText } from './lineage.ts';
import { findStandingProject } from './projects.ts';
import { type Publication, publishStewardshipBranch } from './publish.ts';
import { commitRecords, type FoundTask, readTasks, resolveOpenTask } from './scan.ts';
import { refuseStewardshipCopy, resolveWorkspaceMainLine } from './steward.ts';
import { addTaskPr, openTask } from './tasks.ts';
import { createWorkspaceWorktree, readTaskWorktrees } from './worktrees.ts';

export type UpgradeAction = 'upgraded' | 'installed' | 'current' | 'kept';

export interface UpgradeArtifact {
  readonly path: string;
  readonly action: UpgradeAction;
  readonly detail: string;
}

/**
 * Where the stewardship task, worktree, and branch this upgrade rode came
 * from. `given`: the caller named the task (`ward workspace upgrade TASK`).
 * `derived`: the verb built them itself, the self-service path. `none`: the
 * workspace was already current, so no vehicle was manufactured at all — an
 * empty stewardship task would read as work where there is none.
 */
export type VehicleOrigin = 'given' | 'derived' | 'none';

/** One derived step, echoed as it happens the way cwd derivation is echoed (0006). */
export interface VehicleStep {
  readonly step: 'task' | 'worktree';
  readonly outcome: 'derived' | 'reused';
  readonly detail: string;
}

/** One act the verb deliberately did NOT take, named with the exact way to take it. */
export interface RemainingAct {
  readonly step: string;
  readonly detail: string;
  /** The exact command, where the act has one. */
  readonly command?: string;
}

export interface UpgradeReport {
  readonly vehicle: VehicleOrigin;
  /** Present exactly when `vehicle` is not `none`. */
  readonly task?: string;
  /** Present exactly when `vehicle` is not `none`. */
  readonly branch?: string;
  /** Workspace-relative path of the stewardship worktree written into — with the task. */
  readonly path?: string;
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
  /** The vehicle Ward derived, step by step — present exactly on the self-service path. */
  readonly derived?: readonly VehicleStep[];
  /** The forge review surface — present exactly on the self-service path. */
  readonly pullRequest?: Publication;
  /** What remains, and who it belongs to: the human. Empty when nothing does. */
  readonly remaining: readonly RemainingAct[];
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
  const worktree = requireWorkspaceWorktree(root, task, await readTaskWorktrees(root, task.dir));
  const copy = join(root, worktree.path);
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

function requireWorkspaceWorktree(
  root: string,
  task: FoundTask,
  worktrees: readonly WorktreeRecord[],
): WorktreeRecord {
  const worktree = worktrees.find((record) => record.source === 'workspace');
  if (worktree === undefined) {
    throw new WardError(
      `task ${task.record.code} has no worktree of the workspace's own repository — the ` +
        'upgrade is stewardship and writes into one, so the human can preview and merge it ' +
        `(design 0019). Create it first: ward worktree create ${task.record.code} --workspace`,
    );
  }
  if (!existsSync(join(root, worktree.path))) {
    throw new WardError(
      `${worktree.path} is recorded but missing on disk — re-establish it: ` +
        `ward worktree create ${task.record.code} --workspace`,
    );
  }
  return worktree;
}

async function upgradeInCopy(
  root: string,
  taskCode: string,
  branch: string,
  worktreePath: string,
  copy: string,
): Promise<UpgradeReport> {
  const assessment = await assessUpgrade(root, copy, true);

  // One commit carries the whole act — or nothing needed doing.
  let commit: string | undefined;
  if (assessment.changed.length > 0) {
    commitRecords(copy, 'Upgrade workspace to current defaults', ...assessment.changed);
    commit = gitOrThrow(copy, 'rev-parse', '--short', 'HEAD').stdout.trim();
  }
  const outcome = assessment.changed.length > 0 ? ('upgraded' as const) : ('current' as const);
  return {
    vehicle: 'given',
    task: taskCode,
    branch,
    path: worktreePath,
    outcome,
    ...assessment.report,
    ...(commit === undefined ? {} : { commit }),
    // The composable primitive still says what remains — the acts are the
    // same three the self-service path names, minus the forge half it never
    // took: the caller named their own vehicle, so Ward does not push on
    // their behalf or open a pull request they did not ask for.
    remaining:
      outcome === 'current' ? [] : localReviewActs(branch, taskCode, 'the diff on the branch'),
  };
}

// -- the assessment: what an upgrade would do, and (optionally) doing it -----

interface Assessment {
  readonly changed: readonly string[];
  readonly report: Pick<
    UpgradeReport,
    'mainLine' | 'stamp' | 'baselines' | 'artifacts' | 'residue'
  >;
}

/**
 * Decide every artifact, the record fields, and the baselines for the tree at
 * `dir`, writing them when `apply`. The read-only mode is what lets the
 * self-service path answer "would this upgrade change anything?" **against the
 * workspace root** before manufacturing a task and a worktree to find out —
 * one mechanism, asked twice, rather than a second predicate that could drift
 * from what the upgrade actually does (§6, and one home per idea).
 */
async function assessUpgrade(root: string, dir: string, apply: boolean): Promise<Assessment> {
  const changed: string[] = [];
  const artifacts: UpgradeArtifact[] = [];
  const residue: string[] = [];

  // Baselines as the tree carries them — the fingerprints recorded at install
  // time, empty or absent on a workspace older than its own baselines.
  const hasBaselines = existsSync(join(dir, baselinesType.relPath));
  const existing: Baselines['artifacts'] = hasBaselines
    ? (await readDocument(dir, baselinesType)).data.artifacts
    : [];
  const baselineByPath = new Map(existing.map((entry) => [entry.path, entry]));

  // 1. Each installed artifact: replace, install, keep-and-name, or nothing.
  for (const lineage of INSTALLED_ARTIFACT_LINEAGE) {
    const verdict = await classifyArtifact(dir, lineage, baselineByPath.get(lineage.path)?.sha256);
    switch (verdict.standing) {
      case 'current':
        artifacts.push({
          path: lineage.path,
          action: 'current',
          detail: 'already the current default',
        });
        break;
      case 'stale':
        if (apply) await Bun.write(join(dir, lineage.path), lineage.current());
        changed.push(lineage.path);
        artifacts.push({
          path: lineage.path,
          action: 'upgraded',
          detail: `untouched since ${verdict.era ?? 'install'} — brought to the current default`,
        });
        break;
      case 'missing':
        if (apply) await Bun.write(join(dir, lineage.path), lineage.current());
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
  artifacts.push(await upgradeClaudeGuidance(dir, apply, changed, residue));

  // 3. The workspace record: the main-line name recorded from the enclosing
  // repository (never assumed — the root checkout is the authority when the
  // record has nothing yet), and the version stamp brought to this CLI.
  const record = await readDocument(dir, workspaceRecordType);
  const mainLineName = record.data.mainLine ?? resolveWorkspaceMainLine(root);
  const mainLineAction = record.data.mainLine === undefined ? 'recorded' : 'already-recorded';
  const stampAction = record.data.wardVersion === pkg.version ? 'current' : 'advanced';
  if (mainLineAction === 'recorded' || stampAction === 'advanced') {
    if (apply) {
      await writeDocument(dir, workspaceRecordType, {
        data: { ...record.data, wardVersion: pkg.version, mainLine: mainLineName },
        body: record.body,
      });
    }
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
    if (apply) {
      await writeDocument(dir, baselinesType, {
        data: { type: 'baselines', artifacts: wanted },
        body:
          'What Ward installed here, fingerprinted at install time, so an upgrade can tell ' +
          'customized from untouched. Written by `ward`; editing it by hand breaks what ' +
          'divergence detection means.',
      });
    }
    changed.push(baselinesType.relPath);
  }

  return {
    changed,
    report: {
      mainLine: { name: mainLineName, action: mainLineAction },
      stamp: { wardVersion: pkg.version, action: stampAction },
      baselines: baselinesAction,
      artifacts,
      residue,
    },
  };
}

async function upgradeClaudeGuidance(
  dir: string,
  apply: boolean,
  changed: string[],
  residue: string[],
): Promise<UpgradeArtifact> {
  const path = 'CLAUDE.md';
  switch (inspectClaudeGuidance(dir)) {
    case 'linked':
      return { path, action: 'current', detail: 'CLAUDE.md → AGENTS.md' };
    case 'absent':
      if (apply) await symlink('AGENTS.md', join(dir, path));
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

// -- the self-service path (design/0030-upgrade-self-service/) --------------

/** The slug and purpose Ward derives — no free variable, so re-runs read alike. */
const DERIVED_SLUG = 'workspace-upgrade';

/** An open task Ward derived to carry an upgrade, with the branch it rides. */
export interface OpenUpgradeTask {
  readonly task: FoundTask;
  readonly worktree?: WorktreeRecord;
}

/**
 * The one open workspace-upgrade task, if there is one. Detection is
 * **structural** — the task record's own `stewardship: 'upgrade'` marker, a
 * fact Ward wrote when it derived the vehicle — never a match against the
 * slug: a slug is free text (a human may rename or reuse one), so a string
 * match would both miss a renamed upgrade task and seize on unrelated work
 * that happens to say "upgrade". §16: the record is the truth.
 *
 * Consequence, named rather than hidden: a task the HUMAN opened and passed to
 * `ward workspace upgrade TASK` carries no marker and does not block a later
 * self-service run. That is the honest reading — Ward did not build that
 * vehicle and does not know what else it carries — and the human who named it
 * has already chosen their own arrangement (§14).
 */
export async function findOpenUpgradeTask(root: string): Promise<OpenUpgradeTask | undefined> {
  for (const task of await readTasks(root)) {
    if (task.record.state === 'closed' || task.record.stewardship !== 'upgrade') continue;
    const worktree = (await readTaskWorktrees(root, task.dir)).find(
      (record) => record.source === 'workspace',
    );
    return { task, ...(worktree === undefined ? {} : { worktree }) };
  }
  return undefined;
}

export interface SelfServiceOptions {
  /**
   * Called as each derived step lands. The CLI echoes these the way 0006
   * echoes a task derived from the working directory: an implicit input the
   * verb supplied for the human is never silent.
   */
  readonly echo?: (step: VehicleStep) => void;
}

/**
 * `ward workspace upgrade`, run bare by a human standing outside any task
 * worktree: build the vehicle, run the upgrade, publish the branch for review,
 * and name what remains.
 *
 * The whole shape answers one measured incident — adopting a manifest refresh
 * cost four ceremony commands in which the human typed no information the verb
 * could not derive. This is a HUMAN affordance and only that: a declared agent
 * is refused it at the CLI boundary and passes a task explicitly, for 0006's
 * and 0024's reason — an agent's cwd and a machine's preferences are incidental
 * state its harness manages, and a mutation must never resolve its target from
 * them (§8).
 */
export async function selfServiceUpgrade(
  root: string,
  options: SelfServiceOptions = {},
): Promise<UpgradeReport> {
  refuseStewardshipCopy(root);
  const mainLine = resolveWorkspaceMainLine(root);
  const existing = await findOpenUpgradeTask(root);
  refuseSecondUpgrade(root, mainLine, existing);

  // Would an upgrade change anything? Asked of the ROOT, read-only, before any
  // vehicle exists: an empty stewardship task, worktree, branch, and pull
  // request would read as work where there is none.
  const probe = await assessUpgrade(root, root, false);
  if (probe.changed.length === 0) {
    return {
      vehicle: 'none',
      outcome: 'current',
      ...probe.report,
      remaining: existing === undefined ? [] : [abandonEmptyUpgradeTask(existing.task)],
    };
  }

  const derived: VehicleStep[] = [];
  const echo = (step: VehicleStep): void => {
    derived.push(step);
    options.echo?.(step);
  };
  const task = existing?.task ?? (await deriveUpgradeTask(root));
  echo({
    step: 'task',
    outcome: existing === undefined ? 'derived' : 'reused',
    detail:
      existing === undefined
        ? `${task.record.code} — opened for this upgrade (${task.record.slug})`
        : `${task.record.code} — the upgrade task already open here (${task.record.slug})`,
  });
  const { record: worktree } = await createWorkspaceWorktree(
    root,
    task.record.code,
    existing?.worktree?.branch ?? freshStewardshipBranch(root, task.record.code),
  );
  echo({
    step: 'worktree',
    outcome: existing?.worktree === undefined ? 'derived' : 'reused',
    detail:
      `${worktree.path} — the workspace's own repository, branch ${worktree.branch} ` +
      `(off ${mainLine})`,
  });

  const report = await upgradeWorkspace(root, task.record.code);
  const branch = report.branch ?? worktree.branch;
  const publication = await publishStewardshipBranch(root, {
    branch,
    mainLine: report.mainLine.name,
    title: `Upgrade the workspace to ward ${pkg.version}'s defaults`,
    body: pullRequestBody(report, branch, task.record.code),
  });
  // The same linkage `ward task pr` writes — the task's PR set is where a
  // close reads review state from, and the URL is the only thing stored (0009).
  if (publication.url !== undefined) await addTaskPr(root, task.record.code, publication.url);

  return {
    ...report,
    vehicle: 'derived',
    derived,
    pullRequest: publication,
    remaining: remainingActs(report, branch, task.record.code, publication),
  };
}

/**
 * One open upgrade task per workspace, per the owner's directive: two would
 * make "the change awaiting you" ambiguous, and the second would branch off a
 * main line the first has not landed on. The refusal names the task and the
 * **two ways out** — land it, or discard it.
 *
 * A task that holds nothing to land is not a second upgrade, it is this one
 * interrupted, so it CONVERGES instead (§6): re-running after a crash between
 * `task open` and the commit must finish the job, not demand ceremony that
 * would produce an identical task.
 */
function refuseSecondUpgrade(
  root: string,
  mainLine: string,
  existing: OpenUpgradeTask | undefined,
): void {
  if (existing?.worktree === undefined) return;
  const branch = existing.worktree.branch;
  const count = git(root, 'rev-list', '--count', `${mainLine}..${branch}`);
  const ahead = Number.parseInt(count.stdout.trim(), 10);
  if (count.exitCode !== 0 || Number.isNaN(ahead) || ahead === 0) return;
  const code = existing.task.record.code;
  throw new WardError(
    `an upgrade of this workspace is already in flight — task ${code} holds ${ahead} ` +
      `commit${ahead === 1 ? '' : 's'} on '${branch}' that ${mainLine} has not taken. Ward ` +
      'keeps one open upgrade task per workspace so the change awaiting you is never ' +
      `ambiguous. Land it (ward workspace merge ${branch}, then ward task close ${code}), or ` +
      `discard it (ward task close ${code} --outcome abandoned) — then run this again.`,
  );
}

/**
 * The stewardship task Ward opens for itself. Its home is the standing
 * workspace project where the workspace has one (0018: "the home for work on
 * the workspace itself — upgrades, migrations, reflections"); on a workspace
 * created before that project existed it opens as a bare task, which is the
 * honest elision rather than a faked floor.
 */
async function deriveUpgradeTask(root: string): Promise<FoundTask> {
  const standing = await findStandingProject(root);
  return openTask(root, DERIVED_SLUG, {
    ...(standing === undefined ? {} : { floor: standing.record.floor }),
    purpose: `Bring the workspace's installed artifacts to the defaults ward ${pkg.version} ships`,
    stewardship: 'upgrade',
  });
}

/**
 * The branch a freshly derived upgrade rides. `steward/workspace-upgrade`
 * normally — but a branch of that name can already exist without belonging to
 * this task: an upgrade closed `--outcome abandoned` tears down its worktree
 * and leaves its branch behind (0019 defers pruning deliberately — a merged
 * branch is history, and an abandoned one is the human's to delete). Checking
 * that leftover out would silently adopt work the human explicitly discarded,
 * and would report "current" over an upgrade the workspace never took. So a
 * taken name gets the task's own code appended: deterministic, legible in
 * `git branch`, and never anyone else's history.
 */
function freshStewardshipBranch(root: string, code: string): string {
  const base = `steward/${DERIVED_SLUG}`;
  const exists = git(root, 'rev-parse', '--verify', '--quiet', `refs/heads/${base}`);
  return exists.exitCode === 0 ? `${base}-${code}` : base;
}

function abandonEmptyUpgradeTask(task: FoundTask): RemainingAct {
  return {
    step: 'close',
    detail:
      `task ${task.record.code} was opened for an upgrade and holds nothing to land — ` +
      'the workspace is already current, so there is no work in it',
    command: `ward task close ${task.record.code} --outcome abandoned`,
  };
}

/** Review on the branch itself: the universal surface, no forge required. */
function localReviewActs(branch: string, code: string, what: string): RemainingAct[] {
  return [
    {
      step: 'review',
      detail: `read ${what} before landing it`,
      command: `ward workspace merge ${branch} --preview`,
    },
    ...landAndClose(branch, code),
  ];
}

function landAndClose(branch: string, code: string): RemainingAct[] {
  return [
    {
      step: 'merge',
      detail: "land it on the workspace's own main line — the gated act, and yours (§18)",
      command: `ward workspace merge ${branch}`,
    },
    {
      step: 'close',
      detail: 'close the task once it has landed; the close verifies the branch reached main',
      command: `ward task close ${code}`,
    },
  ];
}

/**
 * What remains after the self-service run, in the order the human does it.
 * With a forge there are four acts, not three: the pull request is a review
 * surface and the landing is still local, so publishing the main line
 * afterwards is what tells the forge this pull request landed. Naming that act
 * is the alternative to Ward taking it — and Ward taking it would be merging
 * on the human's behalf, which this verb never does.
 */
function remainingActs(
  report: UpgradeReport,
  branch: string,
  code: string,
  publication: Publication,
): RemainingAct[] {
  if (publication.url === undefined) {
    return localReviewActs(
      branch,
      code,
      publication.outcome === 'failed'
        ? 'the diff on the branch (the forge half failed — see above)'
        : 'the diff on the branch',
    );
  }
  const mainLine = report.mainLine.name;
  return [
    {
      step: 'review',
      detail: `the pull request is the review surface: ${publication.url}`,
    },
    {
      step: 'merge',
      detail:
        "land it on the workspace's own main line — the gated act, and yours (§18). Not the " +
        "forge's merge button: the workspace root IS its main-line checkout, and a merge made " +
        'on the forge would create a commit the root does not have',
      command: `ward workspace merge ${branch}`,
    },
    {
      step: 'publish',
      detail: `push the landed main line so the forge marks ${publication.url} merged`,
      command: `git push origin ${mainLine}`,
    },
    {
      step: 'close',
      detail: 'close the task once it has landed; the close verifies the branch reached main',
      command: `ward task close ${code}`,
    },
  ];
}

/**
 * The pull request's body. It carries the mechanical report — which artifacts
 * moved, which were left alone — and, load-bearing, **how this lands**: a
 * reviewer who presses the forge's merge button would create a merge commit
 * the workspace root does not have and diverge the very record under review.
 */
function pullRequestBody(report: UpgradeReport, branch: string, code: string): string {
  const rows = report.artifacts.map(
    (artifact) => `- \`${artifact.path}\` — **${artifact.action}**: ${artifact.detail}`,
  );
  const residue =
    report.residue.length === 0
      ? "_None_ — every installed artifact here was Ward's own."
      : report.residue.map((path) => `- \`${path}\``).join('\n');
  return [
    `\`ward workspace upgrade\` brought this workspace's installed artifacts to the defaults`,
    `ward ${pkg.version} ships. It is a deterministic tool act: only bytes Ward provably wrote`,
    'were replaced.',
    '',
    '## What moved',
    '',
    ...rows,
    `- main line — **${report.mainLine.action}** (\`${report.mainLine.name}\`)`,
    `- baselines — **${report.baselines}**`,
    '',
    '## Reconciliation residue — yours to merge',
    '',
    residue,
    '',
    '## How this lands',
    '',
    '**This pull request is the review surface, not the landing act.** The workspace root is',
    'its own main-line checkout, so this branch is merged locally, at the root:',
    '',
    '```',
    `ward workspace merge ${branch}`,
    `git push origin ${report.mainLine.name}`,
    `ward task close ${code}`,
    '```',
    '',
    "Pressing the forge's merge button instead would create a merge commit the workspace root",
    'does not have. Pushing the landed main line is what marks this pull request merged.',
    '',
    `Opened by \`ward workspace upgrade\` (ward ${pkg.version}), task \`${code}\`.`,
  ].join('\n');
}
