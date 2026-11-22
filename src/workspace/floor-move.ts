// Moving a floor (design/0080-floor-rename/): re-placing a floor's record
// directory, `projects/<N>-<slug>/`, and everything derived from where it
// stands — its view under `floors/`, its open tasks' checkouts and links, the
// reflection cursor that names its tasks by directory, and the names its
// hosts wear. The number is the floor's identity; the slug is a name it
// carries, so a rename changes no address and the old slug resolves nothing
// afterwards.
//
// A move has two halves, kept apart on purpose:
//
// - the RECORD half is one journal commit under the store lock: the directory
//   moved with `git mv`, the project record's slug, the open tasks' worktree
//   paths, the reflections' task directories. Every clone of the workspace
//   receives it whole at its next pull.
// - the DISK half — the view, the checkouts, the links, the stale view, the
//   hosts — is what each machine's own state needs, so it is done here at once
//   and is also a set of idempotent convergence steps, which `ward workspace
//   upgrade` runs: a move cut short by a crash, and a second machine that
//   pulled the commit, both finish the same way.
//
// This module is also where a floor directory left behind by a concurrent
// write is folded back into the floor holding its number.
import {
  existsSync,
  lstatSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  renameSync,
  rmdirSync,
  unlinkSync,
} from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { hostedBy, hostOf, liveStateOf } from '../agent/host.ts';
import { type Refreshed, refreshHosted } from '../agent/naming.ts';
import { WardError } from '../errors.ts';
import { readMachine } from '../global/machine.ts';
import type { SessionHost } from '../host/host.ts';
import { readDocument, writeDocument } from '../store/document.ts';
import { withStoreLock } from '../store/lock.ts';
import {
  type ProjectRecord,
  projectRecordType,
  reflectionRecordType,
  sessionScopeOf,
  worktreeRecordType,
} from '../store/types.ts';
import { taskAddress, taskFloor } from './address.ts';
import type { StepResidue } from './converge.ts';
import { carriesView, establishFloorView, floorViewDir } from './floor-views.ts';
import { git, gitOrThrow, hasCommits, moveTracked } from './git.ts';
import { FLOORS_DIR } from './layout.ts';
import { type FoundProject, GROUND_FLOOR, readProjects, resolveProject } from './projects.ts';
import { findOpenReflection, readReflections } from './reflection.ts';
import {
  commitRecords,
  dirFloor,
  type FoundTask,
  projectDirs,
  readTasks,
  requireSlug,
} from './scan.ts';
import { type OpenSessionListing, readOpenSessions } from './sessions.ts';
import {
  establishOutsideLink,
  openWorktreeClaims,
  planRelocation,
  readTaskWorktreeEntries,
  relocateWorktree,
  standsOutside,
  workspaceRelative,
  worktreePlacement,
} from './worktrees.ts';

type Env = Record<string, string | undefined>;

/**
 * Where a floor is to stand. Only the slug moves today; the number is the
 * renumbering entry's to add (design/0080-floor-rename/, What a renumber adds),
 * through this same function.
 */
export interface FloorTarget {
  readonly slug: string;
}

export interface FloorMoveOptions {
  /** The host whose standing hosts and windows are asked and renamed (the tests' fake). */
  readonly host?: SessionHost;
  readonly env?: Env;
  /**
   * The session the caller declares itself to be (WARD_AGENT's value, as the
   * CLI reads it): a session of the floor being moved is refused.
   */
  readonly caller?: string;
}

/** What became of one open task's worktree. */
export interface MovedWorktree {
  readonly address: string;
  readonly branch: string;
  /** Where it stands now: workspace-relative, or absolute for an outside worktree. */
  readonly path: string;
  /**
   * - `moved` — the checkout went with `git worktree move`;
   * - `linked` — an outside worktree, whose link now stands at its placement;
   * - `recorded` — the record moved alone (no checkout of it on this machine);
   * - `placed` — already where it belongs;
   * - `left` — left where it is, with why (the convergence step finishes it).
   */
  readonly outcome: 'moved' | 'linked' | 'recorded' | 'placed' | 'left';
  readonly from?: string;
  readonly reason?: string;
}

export interface FloorMoveReport {
  readonly floor: number;
  readonly from: { readonly slug: string; readonly dir: string };
  readonly to: { readonly slug: string; readonly dir: string };
  /** `satisfied`: the floor already stood there; only the disk half was asked. */
  readonly outcome: 'moved' | 'satisfied';
  /** Record files the journal commit rewrote, besides the directory's move. */
  readonly records: readonly string[];
  readonly worktrees: readonly MovedWorktree[];
  readonly view: {
    readonly dir: string;
    /** Views retired because they matched no open floor (the old one, here). */
    readonly retired: readonly string[];
    readonly residue: readonly StepResidue[];
  };
  /** What the host refresh renamed; undefined when no host is usable here. */
  readonly hosts?: Pick<Refreshed, 'renamed' | 'failed'>;
}

/** Give a floor a new slug: `ward project rename FLOOR SLUG`. */
export async function renameFloor(
  root: string,
  floor: number,
  slugInput: string,
  options: FloorMoveOptions = {},
): Promise<FloorMoveReport> {
  return moveFloor(root, floor, { slug: requireSlug(slugInput) }, options);
}

/**
 * Re-place floor `floor` at `target`: refuse while anything would be moved out
 * from under work in flight, then the record half (one commit), then the disk
 * half, then the hosts' names. A floor already at `target` commits nothing and
 * still runs the disk half, so asking again finishes a move cut short.
 */
export async function moveFloor(
  root: string,
  floor: number,
  target: FloorTarget,
  options: FloorMoveOptions = {},
): Promise<FloorMoveReport> {
  const env = options.env ?? process.env;
  const host = options.host ?? hostOf('tmux', env);
  const report = await withStoreLock(root, `project rename ${floor}`, async () => {
    const project = await resolveProject(root, floor);
    if (floor === GROUND_FLOOR) {
      throw new WardError(
        `floor ${GROUND_FLOOR} is the ground floor, which stands at projects/0-workspace/ in ` +
          'every workspace — its name is not changed',
      );
    }
    const fromDir = project.dir;
    const toDir = `projects/${floor}-${target.slug}`;
    const from = { slug: project.record.slug, dir: fromDir };
    const to = { slug: target.slug, dir: toDir };
    if (fromDir === toDir) {
      const settled = await settleFloor(root, floor);
      return { floor, from, to, outcome: 'satisfied' as const, records: [], ...settled };
    }
    const refusals = await moveRefusals(root, project, toDir, host, env, options.caller);
    if (refusals.length > 0) {
      throw new WardError(
        `cannot rename floor ${floor} (${project.record.slug}) to ${target.slug}:\n` +
          refusals.map((reason) => `  - ${reason}`).join('\n'),
      );
    }
    const records = await moveRecords(root, project, toDir, target);
    commitRecords(
      root,
      `Rename floor ${floor} from ${project.record.slug} to ${target.slug}`,
      toDir,
    );
    const settled = await settleFloor(root, floor);
    return { floor, from, to, outcome: 'moved' as const, records, ...settled };
  });
  // The live half, after the lock: hosts are found by their stamps and named
  // from the records on every call, so asking them to catch up is all a
  // rename needs of them — no stamp changes. A running harness keeps the name
  // it was started with until it is next resumed.
  const refreshed = await refreshHosted(root, host, 'tmux');
  return refreshed === undefined
    ? report
    : { ...report, hosts: { renamed: refreshed.renamed, failed: refreshed.failed } };
}

// -- refusals ------------------------------------------------------------------

/**
 * Everything that makes the move unsafe now, each as one clause with what
 * clears it — all of them at once, so one attempt says everything to clear.
 */
async function moveRefusals(
  root: string,
  project: FoundProject,
  toDir: string,
  host: SessionHost,
  env: Env,
  caller: string | undefined,
): Promise<string[]> {
  const floor = project.record.floor;
  const fromDir = project.dir;
  const fromView = floorViewDir(fromDir);
  const toView = floorViewDir(toDir);
  const refusals: string[] = [];
  if (existsSync(join(root, toDir))) refusals.push(`${toDir}/ already exists`);
  if (existsSync(join(root, toView))) {
    refusals.push(`${toView}/ already exists — move it aside, then rename again`);
  }

  // A reflection's worktree is a copy of the record cut before the move: merged
  // after it, it would bring the old directory back.
  const reflection = await findOpenReflection(root, floor);
  if (reflection !== undefined) {
    refusals.push(
      `reflection ${taskAddress(reflection.task)} of this floor is open — its worktree holds the ` +
        'record as it stood before, under the old name; land or close it first',
    );
  }

  const open = await readOpenSessions(root);
  const ofFloor = open.filter((listing) => sessionOfFloor(listing, floor, fromDir));
  const coordinate =
    'a floor is renamed from the coordinator or a terminal, never from a session of its own';
  if (caller !== undefined && ofFloor.some((listing) => listing.record.id === caller)) {
    refusals.push(`this is session ${caller}, one of the floor's own — ${coordinate}`);
  }
  if (host.check().usable) {
    for (const listing of ofFloor) {
      if (hostedBy(listing.record) === undefined) continue;
      const live = await liveStateOf(root, listing, env, host);
      if (live?.state === 'live') {
        refusals.push(
          `session ${listing.record.id} is running in ${live.group ?? 'its host'} — let it exit, ` +
            `or close it (ward session close ${listing.record.id}); ${coordinate}`,
        );
      } else if (live?.state === 'unknown') {
        refusals.push(
          `could not tell whether session ${listing.record.id} is running ` +
            `(${live.reason ?? 'the host did not say'})`,
        );
      }
    }
  }

  // A session working inside the view, or inside the record directory, would
  // be resumed into a directory that is gone.
  for (const listing of open) {
    const at = workspaceRelative(root, resolve(root, listing.record.workingDirectory));
    if (at === undefined || !(within(at, fromView) || within(at, fromDir))) continue;
    if (refusals.some((reason) => reason.includes(listing.record.id))) continue;
    refusals.push(
      `open session ${listing.record.id} works in ${at} — close it or let it finish ` +
        `(ward session close ${listing.record.id})`,
    );
  }

  // Each open task's checkout, asked exactly as the placement step will ask it
  // once the record has moved: the task as it will stand, under the new
  // directory.
  const sessions = open.map((listing) => listing.record);
  const claims = await openWorktreeClaims(root);
  for (const task of floorTasks(await readTasks(root), fromDir)) {
    const moved: FoundTask = { dir: toDir + task.dir.slice(fromDir.length), record: task.record };
    for (const entry of await readTaskWorktreeEntries(root, task.dir)) {
      if (standsOutside(entry.record)) continue;
      const plan = planRelocation(root, moved, entry.record, sessions, claims);
      if (plan.kind !== 'refused' || !existsSync(join(root, plan.at))) continue;
      if (refusals.some((reason) => reason.includes(plan.at))) continue;
      refusals.push(
        `${taskAddress(task)}'s worktree ${plan.at}: ${plan.reason}` +
          (plan.command === undefined ? '' : ` (${plan.command})`),
      );
    }
  }
  return refusals;
}

/** Whether an open session is the floor's own, or a session of one of its tasks. */
function sessionOfFloor(listing: OpenSessionListing, floor: number, fromDir: string): boolean {
  if (sessionScopeOf(listing.record) === 'project') return listing.record.floor === floor;
  return listing.scopeDir.startsWith(`${fromDir}/tasks/`);
}

/** The floor's tasks that are not closed, by their record directories. */
function floorTasks(tasks: readonly FoundTask[], projectDir: string): FoundTask[] {
  return tasks.filter(
    (task) => task.dir.startsWith(`${projectDir}/tasks/`) && task.record.state !== 'closed',
  );
}

function within(inner: string, outer: string): boolean {
  return inner === outer || inner.startsWith(`${outer}/`);
}

// -- the record half -------------------------------------------------------------

/**
 * Move the directory and rewrite every record that spells where it stood.
 * Task records need nothing: a task's address composes from the directory it
 * stands in, and its floor number has not changed. Closed tasks' worktree
 * records keep the paths they had — they are history, and nothing stands
 * there to move. No commit: the caller's, so the move is one journal entry.
 */
async function moveRecords(
  root: string,
  project: FoundProject,
  toDir: string,
  target: FloorTarget,
): Promise<string[]> {
  const fromDir = project.dir;
  const fromView = floorViewDir(fromDir);
  const toView = floorViewDir(toDir);
  moveTracked(root, fromDir, toDir);
  const written: string[] = [];

  const type = projectRecordType(toDir);
  const document = await readDocument(root, type);
  const old = document.data.slug;
  await writeDocument(root, type, {
    data: { ...document.data, slug: target.slug },
    // The body's opening line spells the slug; a line the human rewrote is
    // left as they wrote it.
    body: document.body.replaceAll(`the \`${old}\` project`, `the \`${target.slug}\` project`),
  });
  written.push(type.relPath);

  for (const task of floorTasks(await readTasks(root), toDir)) {
    for (const entry of await readTaskWorktreeEntries(root, task.dir)) {
      if (standsOutside(entry.record) || !within(entry.record.path, fromView)) continue;
      const path = toView + entry.record.path.slice(fromView.length);
      const worktree = worktreeRecordType(task.dir, entry.fileName);
      await writeDocument(root, worktree, { data: { ...entry.record, path }, body: entry.body });
      written.push(worktree.relPath);
    }
  }

  // The reflection cursor is the set of task directories the floor's
  // reflections name: left spelling the old directory, every covered task
  // would read as unreflected again.
  for (const found of await readReflections(root, toDir)) {
    const tasks = found.record.tasks.map((task) =>
      within(task.dir, fromDir) ? { ...task, dir: toDir + task.dir.slice(fromDir.length) } : task,
    );
    if (tasks.every((task, index) => task.dir === found.record.tasks[index]?.dir)) continue;
    const reflection = reflectionRecordType(toDir, found.record.number);
    const current = await readDocument(root, reflection);
    await writeDocument(root, reflection, {
      data: { ...current.data, tasks },
      body: current.body,
    });
    written.push(reflection.relPath);
  }
  return written;
}

// -- the disk half -----------------------------------------------------------------

/**
 * Bring this machine's disk to where the record says the floor stands: its
 * view, its open tasks' checkouts and outside links, and the retirement of any
 * view no open floor has. Each piece is also a convergence step, so what this
 * does at once a later upgrade would do the same way.
 */
async function settleFloor(
  root: string,
  floor: number,
): Promise<Pick<FloorMoveReport, 'worktrees' | 'view'>> {
  const project = await resolveProject(root, floor);
  if (carriesView(project)) await establishFloorView(root, project);
  const sessions = (await readOpenSessions(root)).map((listing) => listing.record);
  const claims = await openWorktreeClaims(root);
  const machine = (await readMachine()).name;
  const worktrees: MovedWorktree[] = [];
  const rewritten: string[] = [];
  for (const task of floorTasks(await readTasks(root), project.dir)) {
    for (const entry of await readTaskWorktreeEntries(root, task.dir)) {
      const base = { address: taskAddress(task), branch: entry.record.branch };
      if (standsOutside(entry.record)) {
        const placement = worktreePlacement(task, entry.record.branch);
        const here = entry.record.machine === undefined || entry.record.machine === machine;
        if (here && existsSync(entry.record.path)) {
          establishOutsideLink(root, placement, entry.record.path);
        }
        worktrees.push({ ...base, path: entry.record.path, outcome: here ? 'linked' : 'placed' });
        continue;
      }
      const outcome = await relocateWorktree(root, task, entry, sessions, claims);
      switch (outcome.kind) {
        case 'placed':
          worktrees.push({ ...base, path: outcome.path, outcome: 'placed' });
          break;
        case 'moved':
          if (outcome.relPath !== undefined) rewritten.push(outcome.relPath);
          worktrees.push({ ...base, path: outcome.path, outcome: 'moved', from: outcome.from });
          break;
        case 'recorded':
          if (outcome.relPath !== '') rewritten.push(outcome.relPath);
          worktrees.push({ ...base, path: outcome.path, outcome: 'recorded' });
          break;
        case 'refused':
          worktrees.push({ ...base, path: outcome.at, outcome: 'left', reason: outcome.reason });
          break;
      }
    }
  }
  // A worktree record the move did not already rewrite — one standing away
  // from its placement before the rename — journals as the placement step
  // journals it.
  if (rewritten.length > 0) {
    commitRecords(
      root,
      `Move worktrees of floor ${floor} to ${floorViewDir(project.dir)}/`,
      ...rewritten,
    );
  }
  const { retired, residue } = await retireStaleViews(root);
  return { worktrees, view: { dir: floorViewDir(project.dir), retired, residue } };
}

/**
 * Every open floor task's outside worktree, linked from its placement where
 * the placement is free — the convergence step that re-links a moved floor's
 * outside worktrees on every machine that has them. A worktree made on another
 * machine is not this machine's to link.
 */
export async function linkOutsideWorktrees(
  root: string,
): Promise<{ readonly linked: readonly string[] }> {
  const machine = (await readMachine()).name;
  const linked: string[] = [];
  for (const task of await readTasks(root)) {
    if (task.record.state === 'closed' || taskFloor(task) === undefined) continue;
    for (const entry of await readTaskWorktreeEntries(root, task.dir)) {
      const record = entry.record;
      if (!standsOutside(record)) continue;
      if (record.machine !== undefined && record.machine !== machine) continue;
      if (!existsSync(record.path)) continue;
      const placement = worktreePlacement(task, record.branch);
      if (!existsSync(join(root, dirname(placement)))) continue; // no view yet: the views step's
      if (lstatOrUndefined(join(root, placement)) !== undefined) continue;
      establishOutsideLink(root, placement, record.path);
      linked.push(placement);
    }
  }
  return { linked };
}

// -- stale views -------------------------------------------------------------------

/** A directory under `floors/` that no open floor's view is, and what it holds. */
export interface StaleView {
  /** Workspace-relative, `floors/<name>`. */
  readonly dir: string;
  /** Entries that are Ward's own links: the view's three, and links onto outside worktrees. */
  readonly ward: readonly string[];
  /** Everything else, workspace-relative: a checkout, a file, a link Ward did not make. */
  readonly others: readonly string[];
}

/**
 * The views that match no open floor — left by a rename, by a floor that
 * closed, or by a rename another machine made. Read-only: doctor reads it, and
 * the retirement acts on it.
 */
export async function staleViews(root: string): Promise<StaleView[]> {
  const base = join(root, FLOORS_DIR);
  if (!existsSync(base)) return [];
  const views = new Set(
    (await readProjects(root)).filter(carriesView).map((project) => basename(project.dir)),
  );
  const outside = new Set(
    (await openWorktreeClaims(root))
      .filter(({ record }) => standsOutside(record))
      .map(({ record }) => resolve(record.path)),
  );
  const stale: StaleView[] = [];
  for (const name of readdirSync(base).sort()) {
    if (views.has(name)) continue;
    const dir = `${FLOORS_DIR}/${name}`;
    if (!lstatOrUndefined(join(root, dir))?.isDirectory()) continue;
    const ward: string[] = [];
    const others: string[] = [];
    for (const entry of readdirSync(join(root, dir)).sort()) {
      const at = join(root, dir, entry);
      const own = wardLink(name, entry, at, outside);
      (own ? ward : others).push(`${dir}/${entry}`);
    }
    stale.push({ dir, ward, others });
  }
  return stale;
}

/**
 * Whether `entry` in the view `floors/<name>/` is a link Ward made: one of the
 * view's three, by the exact text Ward writes (it may dangle — the record it
 * pointed at has moved), or a link onto an outside worktree an open task
 * records. Anything else is not Ward's to remove.
 */
function wardLink(name: string, entry: string, at: string, outside: ReadonlySet<string>): boolean {
  if (!lstatOrUndefined(at)?.isSymbolicLink()) return false;
  const text = readlinkSync(at);
  if (entry === 'AGENTS.md' && text === `../../projects/${name}/AGENTS.md`) return true;
  if (entry === 'CLAUDE.md' && text === 'AGENTS.md') return true;
  if (entry === 'notes.md' && text === `../../projects/${name}/notes.md`) return true;
  return outside.has(resolve(dirname(at), text));
}

/**
 * Retire each view that matches no open floor and holds only Ward's own
 * links: the links removed one by one, then the empty directory (`rmdir`,
 * never recursive — the 0057 retirement's posture). A view holding anything
 * else is kept whole and named as residue: a checkout left there may hold the
 * only copy of some work.
 */
export async function retireStaleViews(
  root: string,
): Promise<{ readonly retired: readonly string[]; readonly residue: readonly StepResidue[] }> {
  const retired: string[] = [];
  const residue: StepResidue[] = [];
  for (const view of await staleViews(root)) {
    if (view.others.length > 0) {
      for (const path of view.others) {
        residue.push({
          path,
          reason: `${view.dir}/ matches no open floor, and this is not one of Ward's links — move or remove it`,
        });
      }
      continue;
    }
    for (const path of view.ward) unlinkSync(join(root, path));
    rmdirSync(join(root, view.dir));
    retired.push(view.dir);
  }
  return { retired, residue };
}

// -- orphaned floor directories --------------------------------------------------

/** A `projects/<N>-*` directory with no project record, and the floor it would fold into. */
export interface OrphanDir {
  readonly dir: string;
  readonly floor?: number;
  /** The one directory whose record stands on the same number, when there is exactly one. */
  readonly into?: string;
}

/**
 * Project directories with no `project.md` — what a write made on another
 * machine under a floor's old name leaves after it meets the rename (a task
 * opened there before the two synced). Its contents belong to the floor that
 * holds its number, which is the floor's identity.
 */
export async function orphanFloorDirs(root: string): Promise<OrphanDir[]> {
  const holders = new Map<number, string[]>();
  const orphans: string[] = [];
  for (const dir of projectDirs(root)) {
    if (!existsSync(join(root, projectRecordType(dir).relPath))) {
      orphans.push(dir);
      continue;
    }
    let record: ProjectRecord;
    try {
      record = (await readDocument(root, projectRecordType(dir))).data;
    } catch {
      continue;
    }
    holders.set(record.floor, [...(holders.get(record.floor) ?? []), dir]);
  }
  return orphans.map((dir) => {
    const floor = dirFloor(dir);
    const into = floor === undefined ? undefined : holders.get(floor);
    return {
      dir,
      ...(floor === undefined ? {} : { floor }),
      ...(into?.length === 1 && into[0] !== undefined ? { into: into[0] } : {}),
    };
  });
}

/** What folding the orphaned directories did. */
export interface Folded {
  readonly folded: readonly { readonly from: string; readonly into: string }[];
  /** Paths for the journal commit to stage. */
  readonly paths: readonly string[];
  readonly residue: readonly StepResidue[];
}

/**
 * Fold each orphaned directory into the floor holding its number, file by
 * file: a file the floor lacks moves in (through git when git tracks it); one
 * the floor holds identically is dropped; one that differs is left where it is
 * and named, for a human to merge. The orphan directory goes once it is empty.
 * An orphan with no single floor on its number is left whole and named.
 * No commit: the convergence run's.
 */
export async function foldOrphanFloorDirs(root: string): Promise<Folded> {
  const folded: { from: string; into: string }[] = [];
  const paths: string[] = [];
  const residue: StepResidue[] = [];
  const tracked = existsSync(join(root, '.git')) && hasCommits(root);
  for (const orphan of await orphanFloorDirs(root)) {
    if (orphan.into === undefined) {
      residue.push({
        path: orphan.dir,
        reason:
          orphan.floor === undefined
            ? 'holds no project.md, and its name leads with no floor number'
            : `holds no project.md, and no single floor stands on ${orphan.floor} to fold it into`,
      });
      continue;
    }
    const into = orphan.into;
    let kept = 0;
    let changed = false;
    for (const rel of filesUnder(join(root, orphan.dir))) {
      const source = `${orphan.dir}/${rel}`;
      const dest = `${into}/${rel}`;
      const there = lstatOrUndefined(join(root, dest));
      const isTracked =
        tracked && git(root, 'ls-files', '--error-unmatch', '--', source).exitCode === 0;
      if (there === undefined) {
        await mkdir(dirname(join(root, dest)), { recursive: true });
        if (isTracked) gitOrThrow(root, 'mv', source, dest);
        else renameSync(join(root, source), join(root, dest));
        changed = true;
      } else if (sameEntry(join(root, source), join(root, dest))) {
        if (isTracked) gitOrThrow(root, 'rm', '-q', '--', source);
        else unlinkSync(join(root, source));
        changed = true;
      } else {
        kept += 1;
        residue.push({
          path: source,
          reason: `differs from ${dest}, which floor ${orphan.floor} already holds — merge the two by hand`,
        });
      }
    }
    removeEmptyDirs(join(root, orphan.dir));
    if (changed) paths.push(into);
    if (kept === 0) folded.push({ from: orphan.dir, into });
  }
  return { folded, paths: [...new Set(paths)], residue };
}

/** Every file and link under `dir`, relative to it, depth first in name order. */
function filesUnder(dir: string, prefix = ''): string[] {
  const out: string[] = [];
  for (const name of readdirSync(join(dir, prefix)).sort()) {
    const rel = prefix === '' ? name : `${prefix}/${name}`;
    const stat = lstatSync(join(dir, rel));
    if (stat.isDirectory()) out.push(...filesUnder(dir, rel));
    else out.push(rel);
  }
  return out;
}

function sameEntry(a: string, b: string): boolean {
  const sa = lstatSync(a);
  const sb = lstatSync(b);
  if (sa.isSymbolicLink() || sb.isSymbolicLink()) {
    return sa.isSymbolicLink() && sb.isSymbolicLink() && readlinkSync(a) === readlinkSync(b);
  }
  if (!sa.isFile() || !sb.isFile()) return false;
  return readFileSync(a).equals(readFileSync(b));
}

/** Remove `dir` and every directory under it that is empty, bottom up; never a file. */
function removeEmptyDirs(dir: string): void {
  if (!lstatOrUndefined(dir)?.isDirectory()) return;
  for (const name of readdirSync(dir)) removeEmptyDirs(join(dir, name));
  if (readdirSync(dir).length === 0) rmdirSync(dir);
}

function lstatOrUndefined(path: string): ReturnType<typeof lstatSync> | undefined {
  try {
    return lstatSync(path);
  } catch {
    return undefined;
  }
}
