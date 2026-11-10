// Convergence: the check-then-do establishment steps that bring a workspace's
// record to the shape this release of Ward expects
// (intent/01-concepts/06-workspace-lifecycle.md, How a workspace evolves).
// There is exactly one list, here, and two callers: `workspace create` runs it
// on the fresh root it just made, and `workspace upgrade` runs it on an
// existing one as the first of its two phases
// (design/0042-upgrade-owns-convergence/). Neither carries a copy of any step,
// so a workspace converges the same way however it got here.
//
// Every step is check-then-do and reports `established | satisfied`, which is
// what makes the whole run repeatable: a second pass finds everything in place
// and commits nothing (intent/00-foundation/01-principles.md §6). The writes
// are record and bookkeeping writes — a project record, ignore lines, scope
// directories, a symlink, the baseline backfill — so they land on the
// workspace's own main line directly, as one journal commit, the way every
// mutation verb's bookkeeping does (design/0019-stewardship-worktrees/).
import { existsSync, readdirSync, renameSync, rmdirSync } from 'node:fs';
import { appendFile, mkdir, readFile, symlink, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import pkg from '../../package.json' with { type: 'json' };
import { WardError } from '../errors.ts';
import { readDocument, writeDocument } from '../store/document.ts';
import { withStoreLock } from '../store/lock.ts';
import {
  baselinesType,
  catalogType,
  projectRecordType,
  seededArtifactTypes,
  taskRecordType,
  workspaceRecordType,
} from '../store/types.ts';
import { taskAddress, taskFloor } from './address.ts';
import { sha256OfFile } from './baselines.ts';
import { carriesManifest, establishFloorManifest } from './floor-manifest.ts';
import { establishFloorViews } from './floor-views.ts';
import { git, gitAvailable, gitOrThrow, hasCommits } from './git.ts';
import { mintWorkspaceId } from './identity.ts';
import {
  IGNORE_LINES,
  inspectClaudeGuidance,
  LEGACY_WORKTREES_DIR,
  LEGACY_WORKTREES_IGNORE,
  MARKER_DIR,
  SCOPE_DIRS,
} from './layout.ts';
import {
  type FoundProject,
  findStandingProject,
  GROUND_FLOOR,
  GROUND_FLOOR_DIR,
  readProjects,
  STANDING_PROJECT_SLUG,
} from './projects.ts';
import { listRepositoryNames } from './repos.ts';
import { commitRecords, readTasks } from './scan.ts';
import { readOpenSessions } from './sessions.ts';
import { warnJournalOffMainLine, workspaceMainLine } from './steward.ts';
import {
  AGENTS_MD,
  CATALOG_BODY,
  STANDING_PROJECT_BODY,
  WARD_INTERNAL_README,
  WORKSPACE_RECORD_BODY,
} from './templates.ts';
import {
  openWorktreeClaims,
  readTaskWorktreeEntries,
  registeredCheckouts,
  relocateWorktree,
  workspaceRelative,
} from './worktrees.ts';

export type StepOutcome = 'established' | 'satisfied';

/**
 * Something a step left in place on purpose, with why — and, where there is
 * one, the command that clears it (design/0057-context-from-root/). A step
 * with residue converges on a later run once the residue is cleared.
 */
export interface StepResidue {
  /** Workspace-relative path, or a task address, naming what was left. */
  readonly path: string;
  readonly reason: string;
  readonly command?: string;
}

export interface StepReport {
  readonly step: string;
  readonly outcome: StepOutcome;
  readonly detail: string;
  /** Present exactly when the step left something in place. */
  readonly residue?: readonly StepResidue[];
}

export interface ConvergeReport {
  readonly root: string;
  readonly steps: readonly StepReport[];
}

interface ConvergeContext {
  readonly root: string;
  /** Workspace-relative paths this run established — the converge commit's set. */
  readonly establishedPaths: string[];
  /**
   * Installed artifacts this run wrote from shipped content — the set the
   * baselines step fingerprints. Only what Ward itself wrote gets a baseline;
   * a pre-existing artifact's provenance is unknown and stays unrecorded.
   */
  readonly installedArtifacts: string[];
}

/**
 * Bring the workspace at `root` to this release's shape, and commit what
 * changed. The marker step leads because the store lives beneath it, and every
 * step after it is a store write: the whole run holds the store lock so a
 * convergence cannot race a concurrent verb's commit
 * (design/0013-telemetry-and-serialized-writes/). A fresh create is trivially
 * uncontended; the uniform path costs nothing.
 *
 * The run is a single journal commit or none at all. It never opens a task, a
 * worktree, or a branch — the stewardship vehicle an artifact upgrade rides
 * has to open ON the ground floor, and this is what establishes it.
 */
export async function convergeWorkspace(root: string): Promise<ConvergeReport> {
  if (!gitAvailable()) {
    throw new WardError('git is required to converge a workspace and was not found on PATH');
  }
  const ctx: ConvergeContext = { root, establishedPaths: [], installedArtifacts: [] };
  const steps: StepReport[] = [];
  await withStoreLock(root, 'workspace converge', async () => {
    steps.push(await establishMarker(ctx));
    steps.push(await establishWorkspaceRecord(ctx));
    steps.push(await establishWorkspaceId(ctx));
    steps.push(await establishCatalog(ctx));
    steps.push(await establishAgentsGuidance(ctx));
    steps.push(await establishClaudeGuidance(ctx));
    steps.push(await establishIgnorePolicy(ctx));
    steps.push(await establishScopeDirs(ctx));
    steps.push(await establishStandingProject(ctx));
    steps.push(await establishFloorManifests(ctx));
    steps.push(await establishFloorViewsStep(ctx));
    steps.push(await establishBaselines(ctx));
    steps.push(establishGitRepository(ctx));
    steps.push(await establishMainLine(ctx));
    steps.push(establishCommit(ctx));
    // The layout move (design/0057-context-from-root/) runs after the
    // convergence commit, because it journals on its own terms: one commit per
    // task whose worktree record moves, then one for the retirement. By then
    // `/floors/` is in the committed ignore list, so nothing moved under it
    // can surface as untracked.
    steps.push(await placeWorktrees(ctx));
    steps.push(await retireWorktreesDir(ctx));
  });
  return { root, steps };
}

// -- steps ----------------------------------------------------------------

async function establishMarker(ctx: ConvergeContext): Promise<StepReport> {
  const step = 'workspace marker';
  const readme = join(ctx.root, MARKER_DIR, 'README.md');
  await mkdir(join(ctx.root, MARKER_DIR, 'tmp'), { recursive: true });
  if (existsSync(readme)) return { step, outcome: 'satisfied', detail: `${MARKER_DIR}/` };
  await Bun.write(readme, WARD_INTERNAL_README);
  ctx.establishedPaths.push(`${MARKER_DIR}/README.md`);
  ctx.installedArtifacts.push(`${MARKER_DIR}/README.md`);
  return { step, outcome: 'established', detail: `${MARKER_DIR}/` };
}

async function establishWorkspaceRecord(ctx: ConvergeContext): Promise<StepReport> {
  const step = 'workspace record';
  const relPath = workspaceRecordType.relPath;
  if (existsSync(join(ctx.root, relPath))) {
    await readDocument(ctx.root, workspaceRecordType); // validates; throws legibly
    return { step, outcome: 'satisfied', detail: relPath };
  }
  await writeDocument(ctx.root, workspaceRecordType, {
    data: {
      type: 'workspace',
      name: basename(ctx.root),
      wardVersion: pkg.version,
      createdAt: new Date().toISOString(),
    },
    body: WORKSPACE_RECORD_BODY,
  });
  ctx.establishedPaths.push(relPath);
  return { step, outcome: 'established', detail: relPath };
}

/**
 * The workspace's immutable id (design/0054-workspace-id/): minted here, the
 * one place Ward mints it, and never rewritten. A fresh create mints it with
 * the record; a workspace made before the id existed is given one by the
 * first `ward workspace upgrade`, whose phase 1 is this list — the one time
 * an id is minted outside creation (intent/01-concepts/06-workspace-lifecycle.md,
 * What creation establishes). Check-then-do makes "exactly once" structural:
 * a record that carries an id is satisfied, so no later converge, upgrade,
 * move, or clone can mint a second. The write rides the run's one journal
 * commit under the store lock already held, like the main-line backfill.
 */
async function establishWorkspaceId(ctx: ConvergeContext): Promise<StepReport> {
  const step = 'workspace id';
  const existing = await readDocument(ctx.root, workspaceRecordType);
  if (existing.data.id !== undefined) {
    return { step, outcome: 'satisfied', detail: existing.data.id };
  }
  const id = mintWorkspaceId();
  await writeDocument(ctx.root, workspaceRecordType, {
    data: { ...existing.data, id },
    body: existing.body,
  });
  if (!ctx.establishedPaths.includes(workspaceRecordType.relPath)) {
    ctx.establishedPaths.push(workspaceRecordType.relPath);
  }
  return { step, outcome: 'established', detail: id };
}

async function establishCatalog(ctx: ConvergeContext): Promise<StepReport> {
  const step = 'artifact-type catalog';
  const relPath = catalogType.relPath;
  if (existsSync(join(ctx.root, relPath))) {
    await readDocument(ctx.root, catalogType);
    return { step, outcome: 'satisfied', detail: relPath };
  }
  await writeDocument(ctx.root, catalogType, {
    data: { type: 'catalog', artifactTypes: seededArtifactTypes },
    body: CATALOG_BODY,
  });
  ctx.establishedPaths.push(relPath);
  ctx.installedArtifacts.push(relPath);
  return { step, outcome: 'established', detail: relPath };
}

async function establishAgentsGuidance(ctx: ConvergeContext): Promise<StepReport> {
  const step = 'agent guidance';
  const file = join(ctx.root, 'AGENTS.md');
  if (existsSync(file)) return { step, outcome: 'satisfied', detail: 'AGENTS.md' };
  await Bun.write(file, AGENTS_MD);
  ctx.establishedPaths.push('AGENTS.md');
  ctx.installedArtifacts.push('AGENTS.md');
  return { step, outcome: 'established', detail: 'AGENTS.md' };
}

/**
 * Claude Code reads CLAUDE.md; the workspace's guidance lives in the
 * harness-neutral AGENTS.md (§5). A relative symlink gives that harness its
 * expected filename with one source of truth — nothing duplicated to drift
 * (§16). A pre-existing regular CLAUDE.md or a link aimed elsewhere is
 * evidence of the human's own arrangement and is never overwritten (the
 * reconcile-never-clobber posture, intent/01-concepts/06-workspace-lifecycle.md);
 * doctor names that state, convergence leaves it. The link gets no baseline entry:
 * sha256OfFile would follow it and fingerprint AGENTS.md's content under a
 * second name, double-reporting every AGENTS.md customization — the link's
 * real content is its target, and doctor reads that directly.
 */
async function establishClaudeGuidance(ctx: ConvergeContext): Promise<StepReport> {
  const step = 'claude guidance';
  const state = inspectClaudeGuidance(ctx.root);
  if (state !== 'absent') {
    const detail = state === 'linked' ? 'CLAUDE.md → AGENTS.md' : 'CLAUDE.md is yours — left as is';
    return { step, outcome: 'satisfied', detail };
  }
  await symlink('AGENTS.md', join(ctx.root, 'CLAUDE.md'));
  ctx.establishedPaths.push('CLAUDE.md');
  return { step, outcome: 'established', detail: 'CLAUDE.md → AGENTS.md' };
}

async function establishIgnorePolicy(ctx: ConvergeContext): Promise<StepReport> {
  const step = 'ignore policy';
  const file = join(ctx.root, '.gitignore');
  const existing = existsSync(file) ? await readFile(file, 'utf8') : '';
  const lines = new Set(existing.split('\n'));
  const missing = IGNORE_LINES.filter((line) => !lines.has(line));
  if (missing.length === 0) return { step, outcome: 'satisfied', detail: '.gitignore' };
  const lead =
    existing === ''
      ? '# Contained checkouts and scratch are the world the record describes, not the record.\n'
      : existing.endsWith('\n')
        ? ''
        : '\n';
  await appendFile(file, `${lead}${missing.join('\n')}\n`);
  ctx.establishedPaths.push('.gitignore');
  return { step, outcome: 'established', detail: '.gitignore' };
}

async function establishScopeDirs(ctx: ConvergeContext): Promise<StepReport> {
  const step = 'scope directories';
  const detail = SCOPE_DIRS.map((dir) => `${dir}/`).join(' ');
  const missing = SCOPE_DIRS.filter((dir) => !existsSync(join(ctx.root, dir)));
  for (const dir of missing) {
    await mkdir(join(ctx.root, dir), { recursive: true });
  }
  return { step, outcome: missing.length > 0 ? 'established' : 'satisfied', detail };
}

/**
 * Every workspace carries one standing project for work on the workspace
 * itself — upgrades, migrations, reflection adoption
 * (intent/01-concepts/06-workspace-lifecycle.md, The standing workspace
 * project). Its identity is FIXED, not allocated: **floor 0**, at
 * `projects/0-workspace/`, in every workspace (design/0041-ground-floor/).
 * A reserved number is what makes the ground floor referable — Ward's own
 * defaults, and any guidance written once and read in every workspace, can
 * name one address and be right everywhere, which an allocated number can
 * never be. Resolution is still by the record's `standing` marker, written
 * here and nowhere else.
 *
 * Three states, all convergent:
 * - no standing project: establish it at floor 0.
 * - one on floor 0: satisfied.
 * - one on floor `N ≥ 1` (every workspace created by ward 0018–0040): RELOCATE
 *   it to floor 0 when it holds no open task, recording `N` as its
 *   `previousFloor` so the number stays retired — floors are monotonic and
 *   never reused, and after the move no directory carries `N` any more.
 *   Relocation moves addresses, which is safe for closed tasks and only for
 *   them: a closed task's worktrees were torn down at its close, so no path on
 *   disk and no live branch is named by the old address. With an open task
 *   under it the step reports satisfied and names the floor; doctor carries
 *   the remedy.
 *
 * The record gets no baseline entry: it is a record the store validates by
 * schema, not an installed artifact whose customization a fingerprint must
 * detect. The store lock is already held by convergeWorkspace, so the write
 * happens inline, not through openProject.
 */
async function establishStandingProject(ctx: ConvergeContext): Promise<StepReport> {
  const step = 'standing project';
  const existing = await findStandingProject(ctx.root);
  if (existing !== undefined && existing.record.floor === GROUND_FLOOR) {
    return { step, outcome: 'satisfied', detail: `${existing.dir}/` };
  }
  if (existing !== undefined) return relocateStandingProject(ctx, existing);
  await writeDocument(ctx.root, projectRecordType(GROUND_FLOOR_DIR), {
    data: {
      type: 'project',
      floor: GROUND_FLOOR,
      slug: STANDING_PROJECT_SLUG,
      standing: true,
      state: 'active',
      openedAt: new Date().toISOString(),
    },
    body: STANDING_PROJECT_BODY,
  });
  ctx.establishedPaths.push(`${GROUND_FLOOR_DIR}/project.md`);
  return { step, outcome: 'established', detail: `${GROUND_FLOOR_DIR}/` };
}

/**
 * Carry a pre-0041 standing project down to the ground floor, or say why it
 * stays. The directory moves whole — its closed tasks travel with it — and
 * every record that named the old floor is rewritten, so nothing on disk is
 * left describing an address that no longer exists (§16). An open task blocks
 * the move because its address would change under work in flight: its
 * worktree paths, its branch names, and every brief and PR that quotes them
 * were written against the old floor.
 */
async function relocateStandingProject(
  ctx: ConvergeContext,
  existing: FoundProject,
): Promise<StepReport> {
  const step = 'standing project';
  const from = existing.record.floor;
  const own = (await readTasks(ctx.root)).filter((task) =>
    task.dir.startsWith(`${existing.dir}/tasks/`),
  );
  const open = own.filter((task) => task.record.state !== 'closed');
  if (open.length > 0) {
    return {
      step,
      outcome: 'satisfied',
      detail:
        `${existing.dir}/ — floor ${from}, not the ground floor; ` +
        `${open.map((task) => taskAddress(task)).join(', ')} still open (close, then converge)`,
    };
  }
  if (existsSync(join(ctx.root, GROUND_FLOOR_DIR))) {
    throw new WardError(
      `cannot move the standing project to ${GROUND_FLOOR_DIR}: that directory already exists — ` +
        'move or remove it, then re-run',
    );
  }
  moveTracked(ctx.root, existing.dir, GROUND_FLOOR_DIR);
  const record = await readDocument(ctx.root, projectRecordType(GROUND_FLOOR_DIR));
  // `previousFloor` is what keeps `from` retired once its directory is gone:
  // floor numbers are never reused, and after the move the record is the only
  // thing that can still say the number was spent.
  await writeDocument(ctx.root, projectRecordType(GROUND_FLOOR_DIR), {
    data: {
      ...record.data,
      floor: GROUND_FLOOR,
      previousFloor: from,
      // The directory the ground floor occupies is a constant, so the record's
      // slug is normalized with it: a record and a directory that named
      // different things would be the drift this move exists to end.
      slug: STANDING_PROJECT_SLUG,
    },
    body: STANDING_PROJECT_BODY,
  });
  // The tasks moved with the directory; their records still name the old
  // floor, and a record describing somewhere it is not is exactly the drift
  // this move exists to end.
  for (const task of own) {
    const dir = `${GROUND_FLOOR_DIR}/${task.dir.slice(`${existing.dir}/`.length)}`;
    const document = await readDocument(ctx.root, taskRecordType(dir));
    if (document.data.floor === undefined) continue;
    await writeDocument(ctx.root, taskRecordType(dir), {
      data: { ...document.data, floor: GROUND_FLOOR },
      body: document.body,
    });
  }
  // Only the destination is staged here: `git mv` already staged the removal
  // of the old path, and an untracked directory has nothing to stage — either
  // way, naming a path that matches no index entry would fail the add.
  ctx.establishedPaths.push(GROUND_FLOOR_DIR);
  return {
    step,
    outcome: 'established',
    detail: `${GROUND_FLOOR_DIR}/ — moved from floor ${from}, which stays retired`,
  };
}

/**
 * Move a record directory within the workspace, through git when git already
 * tracks it so the journal reads as a rename, and through the filesystem
 * otherwise (a workspace being created has no repository yet, and an uncommitted
 * directory has nothing for git to rename).
 */
function moveTracked(root: string, from: string, to: string): void {
  const tracked =
    existsSync(join(root, '.git')) &&
    hasCommits(root) &&
    git(root, 'ls-files', '--error-unmatch', '--', from).exitCode === 0;
  if (tracked) {
    gitOrThrow(root, 'mv', from, to);
    return;
  }
  renameSync(join(root, from), join(root, to));
}

/**
 * Backfill the floor manifests (design/0055-floor-manifests/): every floor
 * that is not closed — the ground floor included, which the step above has
 * just put in place — gets whichever of `AGENTS.md`, `CLAUDE.md`, and
 * `notes.md` it lacks. Runs after the standing project so a relocated ground
 * floor is manifested at its new address. Nothing here is fingerprinted: the
 * floor manifest's lineage is complete from its first default, so the
 * lineage alone tells untouched from customized and a baseline per floor
 * would add a write to every `project open` for nothing. A file that is
 * already there is never touched: bringing an untouched `AGENTS.md` forward
 * is the upgrade's artifact pass, not convergence.
 */
async function establishFloorManifests(ctx: ConvergeContext): Promise<StepReport> {
  const step = 'floor manifests';
  const floors = (await readProjects(ctx.root)).filter((project) =>
    carriesManifest(project.record),
  );
  const established: number[] = [];
  for (const project of floors) {
    const written = await establishFloorManifest(ctx.root, project);
    if (written.length === 0) continue;
    ctx.establishedPaths.push(...written);
    established.push(project.record.floor);
  }
  const count = `${floors.length} open floor${floors.length === 1 ? '' : 's'}`;
  if (established.length === 0) return { step, outcome: 'satisfied', detail: count };
  return {
    step,
    outcome: 'established',
    detail: `${count}; written on floor${established.length === 1 ? '' : 's'} ${established.join(', ')}`,
  };
}

/**
 * Every open floor's view, `floors/<N>-<slug>/` (design/0057-context-from-root/):
 * the three links onto the floor's record, written only where absent. The
 * tree is ignored, so nothing here joins the convergence commit. Runs after
 * the floor manifests so each view's links resolve the moment they exist.
 */
async function establishFloorViewsStep(ctx: ConvergeContext): Promise<StepReport> {
  const step = 'floor views';
  const { floors, written } = await establishFloorViews(ctx.root, await readProjects(ctx.root));
  const count = `${floors} open floor${floors === 1 ? '' : 's'} under floors/`;
  if (written.length === 0) return { step, outcome: 'satisfied', detail: count };
  return {
    step,
    outcome: 'established',
    detail: `${count}; ${written.length} link${written.length === 1 ? '' : 's'} written`,
  };
}

/**
 * The migration (design/0057-context-from-root/): every worktree of an open
 * floor task that is not at its placement is found through git, moved with
 * `git worktree move`, and its record's `path` rewritten — one journal commit
 * per task. A dirty worktree, one with an open session inside it, and one git
 * refuses to move are each left exactly where they are and listed as residue;
 * the step converges on a later run once they are cleared. Legacy bare tasks
 * are not asked: they have no floor, so their worktrees stay at
 * `worktrees/`. Closed tasks are not asked either: their worktrees were torn
 * down at close, and the paths their records keep are history.
 */
async function placeWorktrees(ctx: ConvergeContext): Promise<StepReport> {
  const step = 'worktree placement';
  const sessions = (await readOpenSessions(ctx.root)).map((listing) => listing.record);
  const claims = await openWorktreeClaims(ctx.root);
  const residue: StepResidue[] = [];
  let moved = 0;
  let placed = 0;
  for (const task of await readTasks(ctx.root)) {
    if (task.record.state === 'closed' || taskFloor(task) === undefined) continue;
    const rewritten: string[] = [];
    const branches: string[] = [];
    for (const entry of await readTaskWorktreeEntries(ctx.root, task.dir)) {
      const outcome = await relocateWorktree(ctx.root, task, entry, sessions, claims);
      switch (outcome.kind) {
        case 'placed':
          placed += 1;
          break;
        case 'moved':
        case 'recorded':
          moved += 1;
          branches.push(entry.record.branch);
          if (outcome.relPath !== undefined) rewritten.push(outcome.relPath);
          break;
        case 'refused':
          residue.push({
            path: outcome.at,
            reason: `${taskAddress(task)} — ${outcome.reason}`,
            ...(outcome.command === undefined ? {} : { command: outcome.command }),
          });
          break;
      }
    }
    if (rewritten.length > 0) {
      requireGitIdentity(ctx.root);
      const plural = branches.length === 1 ? '' : 's';
      commitRecords(
        ctx.root,
        `Move worktree${plural} ${branches.join(', ')} for task ${taskAddress(task)} to floors/`,
        ...rewritten,
      );
    }
  }
  const parts = [
    `${moved} moved`,
    `${placed} already placed`,
    ...(residue.length === 0 ? [] : [`${residue.length} left in place`]),
    // `mise trust` and `direnv allow` are keyed to a path, so the first
    // command in a moved worktree may ask for trust again — said here, where
    // the move is reported, rather than discovered there.
    ...(moved === 0 ? [] : ['a moved worktree may ask for mise trust or direnv allow again']),
  ];
  return {
    step,
    outcome: moved > 0 ? 'established' : 'satisfied',
    detail: parts.join(', '),
    ...(residue.length === 0 ? {} : { residue }),
  };
}

/**
 * Retiring `worktrees/` (design/0057-context-from-root/): `floors/` is the one
 * home for working checkouts, so the old directory goes once nothing holds
 * it. Three things must hold — no worktree record of an open task names a
 * path under it; no repository's `git worktree list` (every canonical
 * checkout's, and the workspace's own) names a checkout under it; and nothing
 * else is left in it — and then the empty directory is removed (`rmdir`,
 * never recursive) and `/worktrees/` leaves `.gitignore`, in one journal
 * commit. While any fails, what holds the directory is listed and nothing
 * changes. The step never deletes a checkout: a checkout left behind may hold
 * the only copy of some work, so it is named with the command that removes
 * it, for a human to run.
 */
async function retireWorktreesDir(ctx: ConvergeContext): Promise<StepReport> {
  const step = 'retire worktrees/';
  const dir = join(ctx.root, LEGACY_WORKTREES_DIR);
  const ignoreFile = join(ctx.root, '.gitignore');
  const ignore = existsSync(ignoreFile) ? await readFile(ignoreFile, 'utf8') : '';
  const ignoreHasLine = ignore.split('\n').includes(LEGACY_WORKTREES_IGNORE);
  if (!existsSync(dir) && !ignoreHasLine) {
    return { step, outcome: 'satisfied', detail: 'worktrees/ is retired' };
  }
  const residue: StepResidue[] = [];
  const named = new Set<string>();
  const under = (path: string) =>
    path === LEGACY_WORKTREES_DIR || path.startsWith(`${LEGACY_WORKTREES_DIR}/`);

  // 1. An open task's record still naming a path under it.
  for (const task of await readTasks(ctx.root)) {
    if (task.record.state === 'closed') continue;
    for (const entry of await readTaskWorktreeEntries(ctx.root, task.dir)) {
      if (!under(entry.record.path)) continue;
      named.add(entry.record.path);
      residue.push({
        path: entry.record.path,
        reason:
          taskFloor(task) === undefined
            ? `the worktree of open legacy task ${taskAddress(task)} — it goes when the task closes`
            : `the worktree of open task ${taskAddress(task)}, not yet moved to floors/ (see worktree placement)`,
      });
    }
  }
  // 2. A checkout git still has registered under it.
  const sources = [
    { dir: ctx.root, spell: 'git' },
    ...listRepositoryNames(ctx.root).map((name) => ({
      dir: join(ctx.root, 'repos', name),
      spell: `git -C repos/${name}`,
    })),
  ];
  for (const source of sources) {
    for (const checkout of registeredCheckouts(source.dir) ?? []) {
      const rel = workspaceRelative(ctx.root, checkout.path);
      if (rel === undefined || !under(rel) || named.has(rel)) continue;
      named.add(rel);
      residue.push(
        checkout.prunable
          ? {
              path: rel,
              reason: 'a stale registration — its directory is gone, but git still names it',
              command: `${source.spell} worktree prune`,
            }
          : {
              path: rel,
              reason:
                'a checkout no open task records — a close that did not tear it down, or one made by hand; ' +
                'it may hold the only copy of some work, so check it before removing it',
              command: `${source.spell} worktree remove ${rel}`,
            },
      );
    }
  }
  // 3. Anything else left in it.
  if (existsSync(dir)) {
    for (const name of readdirSync(dir).sort()) {
      const rel = `${LEGACY_WORKTREES_DIR}/${name}`;
      if (named.has(rel)) continue;
      residue.push({
        path: rel,
        reason: 'not a checkout Ward or git knows — yours to move or remove',
      });
    }
  }
  if (residue.length > 0) {
    return {
      step,
      outcome: 'satisfied',
      detail: `worktrees/ kept — ${residue.length} thing${residue.length === 1 ? '' : 's'} still in it`,
      residue,
    };
  }

  if (existsSync(dir)) rmdirSync(dir); // never recursive: it is empty, or this throws
  if (ignoreHasLine) {
    const kept = ignore
      .split('\n')
      .filter((line) => line !== LEGACY_WORKTREES_IGNORE)
      .join('\n');
    await writeFile(ignoreFile, kept);
    requireGitIdentity(ctx.root);
    commitRecords(ctx.root, 'Retire worktrees/', '.gitignore');
  }
  return {
    step,
    outcome: 'established',
    detail: 'worktrees/ removed, and its line dropped from .gitignore',
  };
}

/**
 * Fingerprint what this run installed, so a future upgrade can tell
 * customized from untouched (intent/01-concepts/06-workspace-lifecycle.md).
 * An artifact that already existed gets no entry — its provenance is unknown,
 * and an absent baseline is read conservatively as "customized" later.
 * Re-installing an artifact (it went missing and came back) replaces its entry.
 */
async function establishBaselines(ctx: ConvergeContext): Promise<StepReport> {
  const step = 'installed baselines';
  const relPath = baselinesType.relPath;
  const exists = existsSync(join(ctx.root, relPath));
  const existing = exists ? (await readDocument(ctx.root, baselinesType)).data.artifacts : [];
  if (exists && ctx.installedArtifacts.length === 0) {
    return { step, outcome: 'satisfied', detail: relPath };
  }
  const kept = existing.filter((artifact) => !ctx.installedArtifacts.includes(artifact.path));
  const added = [];
  for (const path of ctx.installedArtifacts) {
    added.push({
      path,
      sha256: await sha256OfFile(join(ctx.root, path)),
      wardVersion: pkg.version,
      installedAt: new Date().toISOString(),
    });
  }
  await writeDocument(ctx.root, baselinesType, {
    data: { type: 'baselines', artifacts: [...kept, ...added] },
    body:
      'What Ward installed here, fingerprinted at install time, so an upgrade can tell ' +
      'customized from untouched. Written by `ward`; editing it by hand breaks what ' +
      'divergence detection means.',
  });
  ctx.establishedPaths.push(relPath);
  return { step, outcome: 'established', detail: relPath };
}

function establishGitRepository(ctx: ConvergeContext): StepReport {
  const step = 'git repository';
  if (existsSync(join(ctx.root, '.git'))) return { step, outcome: 'satisfied', detail: '.git/' };
  gitOrThrow(ctx.root, 'init');
  return { step, outcome: 'established', detail: '.git/' };
}

/**
 * Record the name of the workspace's own main line in the workspace record —
 * read from the repository, never assumed, the same rule the repository set
 * follows (intent/01-concepts/06-workspace-lifecycle.md, the main line's name
 * is recorded — here too; design/0020-deterministic-upgrade/). Runs after the
 * git step because the name is the repository's to give (a fresh `git init`
 * already has a symbolic HEAD to read), and before the commit so the run's
 * one commit carries it. On converge, a record that already names its main
 * line is left alone even when the root stands elsewhere: that disagreement
 * is drift for doctor to name, not for creation to silently re-record.
 */
async function establishMainLine(ctx: ConvergeContext): Promise<StepReport> {
  const step = 'workspace main line';
  const existing = await readDocument(ctx.root, workspaceRecordType);
  if (existing.data.mainLine !== undefined) {
    return { step, outcome: 'satisfied', detail: existing.data.mainLine };
  }
  const branch = workspaceMainLine(ctx.root);
  await writeDocument(ctx.root, workspaceRecordType, {
    data: { ...existing.data, mainLine: branch },
    body: existing.body,
  });
  if (!ctx.establishedPaths.includes(workspaceRecordType.relPath)) {
    ctx.establishedPaths.push(workspaceRecordType.relPath);
  }
  return { step, outcome: 'established', detail: branch };
}

function establishCommit(ctx: ConvergeContext): StepReport {
  const step = 'workspace history';
  if (!hasCommits(ctx.root)) {
    requireGitIdentity(ctx.root);
    gitOrThrow(ctx.root, 'add', '-A');
    gitOrThrow(ctx.root, 'commit', '-m', `Initialize Ward workspace (ward ${pkg.version})`);
    return { step, outcome: 'established', detail: 'initial commit' };
  }
  if (ctx.establishedPaths.length > 0) {
    requireGitIdentity(ctx.root);
    // Stage only what this run established, so a human's own uncommitted
    // edits are never swept into a convergence commit.
    gitOrThrow(ctx.root, 'add', '--', ...ctx.establishedPaths);
    gitOrThrow(ctx.root, 'commit', '-m', `Converge Ward workspace (ward ${pkg.version})`);
    // The convergence commit is a journal write like any other: landing off
    // the recorded main line proceeds loudly, never silently (0020).
    warnJournalOffMainLine(ctx.root);
    return { step, outcome: 'established', detail: 'convergence commit' };
  }
  return { step, outcome: 'satisfied', detail: 'nothing to commit' };
}

function requireGitIdentity(root: string): void {
  if (git(root, 'var', 'GIT_AUTHOR_IDENT').exitCode !== 0) {
    throw new WardError(
      'git has no author identity here — set user.name and user.email (git config), then re-run',
    );
  }
}
