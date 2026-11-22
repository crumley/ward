// Moving a task to another floor (design/0082-task-move/): `ward task move
// ADDRESS... --to FLOOR`. A task's floor is where its record directory
// stands, `projects/<N>-<slug>/tasks/t<room>-<slug>/`, so a move is that
// directory re-placed under another floor, and everything derived from where
// it stood brought along.
//
// - An OPEN task moves alone, with everything it holds: its record, brief,
//   hand-off record, sessions and worktree records go with the directory, and
//   its checkouts follow on disk. It takes the next room in the target floor's
//   sequence, as a task opened there would, so its address changes and the old
//   one names nothing — as after a renumber (design/0081-floor-renumber/).
// - A CLOSED task is re-homed, records only (its worktrees were torn down at
//   close). It keeps its room unless a directory of that room and slug already
//   stands on the target, so the room half of every address quoted for it
//   survives. Closed tasks move in batches: several in one call, by address or
//   by a slug filter, in one commit.
//
// As with a floor's move (design/0080-floor-rename/), the RECORD half is one
// journal commit under the store lock, and the DISK half — checkouts, outside
// links — is done at once here and is also what `ward workspace upgrade`'s
// convergence steps do, on this machine after a crash and on every other
// machine after a pull.
import { existsSync, unlinkSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { hostedBy, hostOf, liveStateOf } from '../agent/host.ts';
import { refreshHosted } from '../agent/naming.ts';
import { WardError } from '../errors.ts';
import type { SessionHost } from '../host/host.ts';
import { readDocument, writeDocument } from '../store/document.ts';
import { withStoreLock } from '../store/lock.ts';
import {
  reflectionRecordType,
  type SessionRecord,
  sessionScopeOf,
  type TaskRecord,
  taskRecordType,
  worktreeRecordType,
} from '../store/types.ts';
import {
  addressMatches,
  distinctAddress,
  qualifiedAddress,
  requireTaskAddress,
  spellAddress,
  taskAddress,
  taskFloor,
  taskRoom,
} from './address.ts';
import { type MovedWorktree, placeTaskWorktrees, strayOutsideLinks } from './floor-move.ts';
import { carriesView, establishFloorView, floorViewDir } from './floor-views.ts';
import { moveTracked } from './git.ts';
import { resolveProject, taskContainer } from './projects.ts';
import { findOpenReflection, readReflections } from './reflection.ts';
import { ambiguous, commitRecords, type FoundTask, projectDirs, readTasks } from './scan.ts';
import {
  type OpenSessionListing,
  readOpenSessions,
  readSessions,
  withEvent,
  workingTaskOf,
  writeSession,
} from './sessions.ts';
import { allocateRoom } from './tasks.ts';
import {
  openWorktreeClaims,
  planRelocation,
  readTaskWorktreeEntries,
  standsOutside,
  workspaceRelative,
  worktreePlacement,
} from './worktrees.ts';

type Env = Record<string, string | undefined>;

export interface TaskMoveOptions {
  /** The host asked whether a session's run is live, and renamed after (the tests' fake). */
  readonly host?: SessionHost;
  readonly env?: Env;
  /** The session the caller declares itself to be (WARD_AGENT's value). */
  readonly caller?: string;
  /** With `from`: every closed task on that floor whose slug contains this text. */
  readonly slug?: string;
  /** The floor a `slug` filter reads. */
  readonly from?: number;
}

/** One task moved, or found already where it was asked to go. */
export interface MovedTask {
  readonly slug: string;
  readonly state: TaskRecord['state'];
  /** The address it answered to before the move, and the one it answers to now. */
  readonly from: { readonly address: string; readonly dir: string };
  readonly to: { readonly address: string; readonly dir: string };
  /** `kept`: the room number came along; `new`: the target's sequence gave another. */
  readonly room: 'kept' | 'new';
  /** `satisfied`: it already stood on the target floor. */
  readonly outcome: 'moved' | 'satisfied';
}

export interface TaskMoveReport {
  /** The floor moved to. */
  readonly floor: number;
  readonly slug: string;
  /** `moved` when the journal commit was made; `satisfied` when every task already stood there. */
  readonly outcome: 'moved' | 'satisfied';
  readonly tasks: readonly MovedTask[];
  /** Record files the journal commit wrote, besides each directory's move. */
  readonly records: readonly string[];
  /** Floor sessions that were working the task, set down with a `task-cleared` event. */
  readonly cleared: readonly { readonly session: string; readonly task: string }[];
  /** What became of an open task's worktrees on this machine. */
  readonly worktrees: readonly MovedWorktree[];
  /** Links onto outside worktrees removed from the view the task left. */
  readonly unlinked: readonly string[];
  /** What the host refresh renamed; undefined when no host was asked. */
  readonly hosts?: { readonly renamed: readonly string[]; readonly failed: readonly string[] };
  /** Commands for what is left to the caller, each a whole line. */
  readonly next: readonly string[];
}

/**
 * Move tasks to floor `to`: one open task, or any number of closed ones —
 * named by address, or chosen by `slug` on floor `from`. Every refusal is
 * reported together before anything is written; then one journal commit; then,
 * for an open task, the disk half and the host names.
 */
export async function moveTasks(
  root: string,
  inputs: readonly string[],
  to: number,
  options: TaskMoveOptions = {},
): Promise<TaskMoveReport> {
  const env = options.env ?? process.env;
  const host = options.host ?? hostOf('tmux', env);
  if ((options.slug === undefined) !== (options.from === undefined)) {
    throw new WardError(
      '--slug and --from go together: --slug TEXT --from FLOOR selects the closed tasks on that ' +
        'floor whose slug contains TEXT',
    );
  }
  if (inputs.length === 0 && options.slug === undefined) {
    throw new WardError(
      'name the task to move (ward task move ADDRESS --to FLOOR), or choose closed ones by slug ' +
        '(ward task move --slug TEXT --from FLOOR --to FLOOR)',
    );
  }
  const asked = [...inputs, ...(options.slug === undefined ? [] : [`--slug ${options.slug}`])];
  let openMoved = false;
  const report = await withStoreLock(root, `task move ${asked.join(' ')}`, async () => {
    const target = await resolveProject(root, to);
    const container = await taskContainer(root, to); // refuses a closed floor
    const everyone = await readTasks(root);
    const selected = selectTasks(everyone, inputs, options);
    const refusals = selected.flatMap((task) => kindRefusals(task));
    const open = selected.filter((task) => task.record.state !== 'closed');
    if (open.length > 0 && selected.length > 1) {
      refusals.push(
        `${open.map((task) => distinctAddress(task, everyone)).join(', ')} ${open.length === 1 ? 'is' : 'are'} ` +
          'open — an open task moves on its own (ward task move ADDRESS --to FLOOR), and closed ' +
          'ones move together',
      );
    }
    if (refusals.length === 0 && open.length === 1 && open[0] !== undefined) {
      openMoved = taskFloor(open[0]) !== to;
      return moveOpenTask(
        root,
        open[0],
        to,
        target.record.slug,
        container,
        everyone,
        host,
        env,
        options.caller,
      );
    }
    if (refusals.length === 0) {
      return moveClosedTasks(root, selected, to, target.record.slug, container, everyone);
    }
    throw new WardError(
      `cannot move ${asked.join(', ')} to floor ${to}:\n` +
        refusals.map((reason) => `  - ${reason}`).join('\n'),
    );
  });
  if (!openMoved) return report;
  // The live half, after the lock, as a floor's move does it: a floor session
  // that was working the task reads as its floor's again, and its window is
  // renamed to say so.
  const refreshed = await refreshHosted(root, host, 'tmux');
  return refreshed === undefined
    ? report
    : { ...report, hosts: { renamed: refreshed.renamed, failed: refreshed.failed } };
}

// -- choosing what moves ------------------------------------------------------------

/**
 * The tasks a call names: each address resolved as a read resolves it — an
 * open task in the room first, then a closed one, the slug-qualified spelling
 * (`f0t33-old-work`) naming one for good — and the slug filter's closed tasks
 * on its floor. Ward's own stewardship tasks are left out of a filter: they
 * belong on the ground floor, and naming one is refused below.
 */
function selectTasks(
  everyone: readonly FoundTask[],
  inputs: readonly string[],
  options: TaskMoveOptions,
): FoundTask[] {
  const chosen = new Map<string, FoundTask>();
  for (const input of inputs) {
    const task = resolveMovable(everyone, input);
    chosen.set(task.dir, task);
  }
  if (options.slug !== undefined && options.from !== undefined) {
    const text = options.slug.toLowerCase();
    const matched = everyone.filter(
      (task) =>
        task.record.state === 'closed' &&
        task.record.stewardship === undefined &&
        taskFloor(task) === options.from &&
        task.dir.startsWith('projects/') &&
        task.record.slug.includes(text),
    );
    if (matched.length === 0 && inputs.length === 0) {
      throw new WardError(
        `no closed task on floor ${options.from} has a slug containing '${options.slug}' — ` +
          `see: ward task list --floor ${options.from} --state closed`,
      );
    }
    for (const task of matched) chosen.set(task.dir, task);
  }
  return [...chosen.values()];
}

function resolveMovable(everyone: readonly FoundTask[], input: string): FoundTask {
  const wanted = requireTaskAddress(input);
  const matches = everyone.filter((task) => addressMatches(task, wanted));
  for (const pool of [
    matches.filter((task) => task.record.state !== 'closed'),
    matches.filter((task) => task.record.state === 'closed'),
  ]) {
    if (pool.length > 1) throw ambiguous(input, pool, everyone);
    if (pool[0] !== undefined) return pool[0];
  }
  throw new WardError(
    `no task at ${spellAddress(wanted)} — see: ward task list` +
      (wanted.floor === undefined ? '' : ` --floor ${wanted.floor}`),
  );
}

/** What no task of its kind may do, whatever the target. */
function kindRefusals(task: FoundTask): string[] {
  const address = taskAddress(task);
  if (taskFloor(task) === undefined || !task.dir.startsWith('projects/')) {
    return [`${address} is a legacy bare task — tasks/ is read, never written`];
  }
  if (task.record.stewardship !== undefined) {
    return [
      `${address} is Ward's own ${task.record.stewardship} task — stewardship stands on the ` +
        'ground floor',
    ];
  }
  return [];
}

// -- an open task -----------------------------------------------------------------------

async function moveOpenTask(
  root: string,
  task: FoundTask,
  to: number,
  slug: string,
  container: string,
  everyone: readonly FoundTask[],
  host: SessionHost,
  env: Env,
  caller: string | undefined,
): Promise<TaskMoveReport> {
  const before = distinctAddress(task, everyone);
  if (taskFloor(task) === to) {
    // Already there: nothing to commit, and the disk half asked again —
    // which is how a move cut short after its commit is finished.
    const settled = await settleTask(root, task);
    const here = { address: before, dir: task.dir };
    return {
      floor: to,
      slug,
      outcome: 'satisfied',
      tasks: [
        {
          slug: task.record.slug,
          state: task.record.state,
          from: here,
          to: here,
          room: 'kept',
          outcome: 'satisfied',
        },
      ],
      records: [],
      cleared: [],
      ...settled,
      next: [],
    };
  }
  const room = await allocateRoom(root, container, task.record.slug);
  if (room === 0) {
    throw new WardError(
      `cannot move ${before} (${task.record.slug}) to floor ${to}: it has no free room — every ` +
        'room is held by an open task',
    );
  }
  const arriving: FoundTask = {
    dir: `${container}/t${room}-${task.record.slug}`,
    record: { ...task.record, code: `t${room}`, floor: to },
  };
  const { refusals, clearing } = await openRefusals(
    root,
    task,
    everyone,
    arriving,
    host,
    env,
    caller,
  );
  if (refusals.length > 0) {
    throw new WardError(
      `cannot move ${before} (${task.record.slug}) to floor ${to}:\n` +
        refusals.map((reason) => `  - ${reason}`).join('\n'),
    );
  }

  const moved = await rehome(root, task, container, room, to, true);
  const cleared: { session: string; task: string }[] = [];
  const written = [...moved.written];
  for (const listing of clearing) {
    const record = withEvent(listing.record, {
      event: 'task-cleared',
      at: new Date().toISOString(),
    });
    await writeSession(root, listing.scopeDir, record);
    written.push(`${listing.scopeDir}/sessions/${record.id}.md`);
    cleared.push({ session: record.id, task: qualifiedAddress(task) });
  }
  const after = await readTasks(root);
  const now = distinctAddress(moved.task, after);
  commitRecords(
    root,
    `Move task ${taskAddress(task)} (${task.record.slug}) to floor ${to} as ${taskAddress(moved.task)}`,
    moved.task.dir,
    ...written.filter((path) => !within(path, moved.task.dir)),
  );
  const settled = await settleTask(root, moved.task);
  return {
    floor: to,
    slug,
    outcome: 'moved',
    tasks: [
      {
        slug: task.record.slug,
        state: task.record.state,
        from: { address: before, dir: task.dir },
        to: { address: now, dir: moved.task.dir },
        room: room === taskRoom(task) ? 'kept' : 'new',
        outcome: 'moved',
      },
    ],
    records: written,
    cleared,
    ...settled,
    next: cleared.map(
      ({ session }) =>
        `ward session move ${session} --floor ${to} --task ${taskAddress(moved.task)}  # to carry ${session} along with the task`,
    ),
  };
}

/**
 * Everything that makes moving an open task unsafe now, each with what clears
 * it, and the floor sessions working it that are to be set down — all at once,
 * nothing written.
 */
async function openRefusals(
  root: string,
  task: FoundTask,
  everyone: readonly FoundTask[],
  moved: FoundTask,
  host: SessionHost,
  env: Env,
  caller: string | undefined,
): Promise<{ refusals: string[]; clearing: OpenSessionListing[] }> {
  const address = taskAddress(task);
  const refusals: string[] = [];
  const clearing: OpenSessionListing[] = [];
  const open = await readOpenSessions(root);
  const own = open.filter((listing) => listing.scopeDir === task.dir);
  const working = open.filter(
    (listing) =>
      sessionScopeOf(listing.record) === 'project' &&
      workingTaskOf(listing.record, everyone)?.dir === task.dir,
  );
  const outside =
    'a task is moved from outside it — from the coordinator, its floor, or a terminal';
  const ownIds = new Set((await readSessions(root, task.dir)).map((record) => record.id));
  if (caller !== undefined && (ownIds.has(caller) || working.some((l) => l.record.id === caller))) {
    refusals.push(`this is session ${caller}, which works ${address} — ${outside}`);
  }
  const usable = host.check().usable;
  const live = async (listing: OpenSessionListing): Promise<string | undefined> => {
    if (hostedBy(listing.record) === undefined) return undefined;
    if (!usable) return 'unknown';
    return (await liveStateOf(root, listing, env, host))?.state;
  };
  for (const listing of own) {
    const state = await live(listing);
    if (state === 'live') {
      refusals.push(
        `its session ${listing.record.id} is running — let it exit, or close it ` +
          `(ward session close ${listing.record.id})`,
      );
    } else if (state === 'unknown') {
      refusals.push(`could not tell whether its session ${listing.record.id} is running`);
    }
  }
  // A floor session working the task while its run is live has an agent in
  // the work, very likely standing in the checkout that would move; one whose
  // run is not going is simply set down, and told on the report.
  for (const listing of working) {
    const state = await live(listing);
    const id = listing.record.id;
    if (state === 'live') {
      refusals.push(
        `floor session ${id} is working ${address} and running — set it down first ` +
          `(ward session task ${id} --clear) or let it exit; afterwards it can follow the task: ` +
          `ward session move ${id} --floor N --task ADDRESS`,
      );
    } else if (state === 'unknown') {
      refusals.push(`could not tell whether floor session ${id}, working ${address}, is running`);
    } else {
      clearing.push(listing);
    }
  }

  // An open session recorded as working inside what moves would be resumed
  // into a directory that is gone: the record directory, or a checkout.
  const entries = await readTaskWorktreeEntries(root, task.dir);
  const places = [
    task.dir,
    ...entries
      .filter((entry) => !standsOutside(entry.record))
      .flatMap((entry) => [entry.record.path, worktreePlacement(task, entry.record.branch)]),
  ];
  for (const listing of open) {
    const at = workspaceRelative(root, resolve(root, listing.record.workingDirectory));
    if (at === undefined || !places.some((place) => within(at, place))) continue;
    if (refusals.some((reason) => reason.includes(listing.record.id))) continue;
    refusals.push(
      `open session ${listing.record.id} works in ${at} — close it or let it finish ` +
        `(ward session close ${listing.record.id})`,
    );
  }

  // Each checkout asked exactly as the placement step will ask it once the
  // record has moved: the task as it will stand, under its new directory.
  const sessions = open.map((listing) => listing.record);
  const claims = await openWorktreeClaims(root);
  for (const entry of entries) {
    if (standsOutside(entry.record)) continue;
    const plan = planRelocation(root, moved, entry.record, sessions, claims);
    if (plan.kind !== 'refused' || !existsSync(join(root, plan.at))) continue;
    if (refusals.some((reason) => reason.includes(plan.at))) continue;
    refusals.push(
      `its worktree ${plan.at}: ${plan.reason}` +
        (plan.command === undefined ? '' : ` (${plan.command})`),
    );
  }
  return { refusals, clearing };
}

/**
 * This machine's disk brought to where the record says an open task stands:
 * the target floor's view, the task's checkouts at their placements, the link
 * onto an outside worktree at its placement and gone from the view it left.
 * The same as the convergence steps do, so an upgrade finishes it anywhere.
 */
async function settleTask(
  root: string,
  task: FoundTask,
): Promise<Pick<TaskMoveReport, 'worktrees' | 'unlinked'>> {
  const floor = taskFloor(task);
  if (floor !== undefined) {
    const project = await resolveProject(root, floor);
    if (carriesView(project)) await establishFloorView(root, project);
  }
  const unlinked: string[] = [];
  for (const stray of await strayOutsideLinks(root)) {
    unlinkSync(join(root, stray));
    unlinked.push(stray);
  }
  const { worktrees, rewritten } = await placeTaskWorktrees(root, [task]);
  if (rewritten.length > 0) {
    const project = floor === undefined ? undefined : await resolveProject(root, floor);
    commitRecords(
      root,
      `Move worktrees of task ${taskAddress(task)} to ${project === undefined ? 'floors/' : `${floorViewDir(project.dir)}/`}`,
      ...rewritten,
    );
  }
  return { worktrees, unlinked };
}

// -- closed tasks -------------------------------------------------------------------------

async function moveClosedTasks(
  root: string,
  selected: readonly FoundTask[],
  to: number,
  slug: string,
  container: string,
  everyone: readonly FoundTask[],
): Promise<TaskMoveReport> {
  const refusals: string[] = [];
  const reflecting = new Map<number, string>();
  for (const task of selected) {
    const floor = taskFloor(task);
    if (floor === undefined || floor === to) continue;
    if (!reflecting.has(floor)) {
      const open = await findOpenReflection(root, floor, everyone);
      reflecting.set(floor, open === undefined ? '' : taskAddress(open.task));
    }
    const vehicle = reflecting.get(floor);
    if (vehicle !== undefined && vehicle !== '') {
      refusals.push(
        `${distinctAddress(task, everyone)}: floor ${floor}'s reflection ${vehicle} is open, and its ` +
          'window may cover the task where it stands — land or close the reflection first',
      );
    }
  }
  if (refusals.length > 0) {
    throw new WardError(
      `cannot move ${selected.map((task) => distinctAddress(task, everyone)).join(', ')} to floor ${to}:\n` +
        refusals.map((reason) => `  - ${reason}`).join('\n'),
    );
  }

  const tasks: MovedTask[] = [];
  const written: string[] = [];
  const dirs: string[] = [];
  const movedOnes: FoundTask[] = [];
  for (const task of selected) {
    const before = { address: distinctAddress(task, everyone), dir: task.dir };
    if (taskFloor(task) === to) {
      tasks.push({
        slug: task.record.slug,
        state: task.record.state,
        from: before,
        to: before,
        room: 'kept',
        outcome: 'satisfied',
      });
      continue;
    }
    // Its own room when the target has no directory of that room and slug —
    // the directory, not the room, is what two tasks cannot share.
    const own = taskRoom(task);
    const room =
      own !== undefined && !existsSync(join(root, `${container}/t${own}-${task.record.slug}`))
        ? own
        : await allocateRoom(root, container, task.record.slug);
    if (room === 0) {
      throw new WardError(`floor ${to} has no room for ${before.address} — every room is held`);
    }
    const moved = await rehome(root, task, container, room, to, false);
    written.push(...moved.written);
    dirs.push(moved.task.dir);
    movedOnes.push(moved.task);
    tasks.push({
      slug: task.record.slug,
      state: task.record.state,
      from: before,
      to: { address: '', dir: moved.task.dir },
      room: room === own ? 'kept' : 'new',
      outcome: 'moved',
    });
  }
  if (dirs.length === 0) {
    return {
      floor: to,
      slug,
      outcome: 'satisfied',
      tasks,
      records: [],
      cleared: [],
      worktrees: [],
      unlinked: [],
      next: [],
    };
  }
  const slugs = movedOnes.map((task) => task.record.slug);
  commitRecords(
    root,
    `Move ${slugs.length === 1 ? 'closed task' : `${slugs.length} closed tasks`} ${slugs.join(', ')} to floor ${to}`,
    ...dirs,
    ...written.filter((path) => !dirs.some((dir) => within(path, dir))),
  );
  const after = await readTasks(root);
  return {
    floor: to,
    slug,
    outcome: 'moved',
    tasks: tasks.map((entry) => {
      if (entry.outcome === 'satisfied') return entry;
      const found = after.find((task) => task.dir === entry.to.dir);
      return {
        ...entry,
        to: { ...entry.to, address: found === undefined ? '' : distinctAddress(found, after) },
      };
    }),
    records: written,
    cleared: [],
    worktrees: [],
    unlinked: [],
    next: [],
  };
}

// -- the record half ------------------------------------------------------------------------

/**
 * Move one task's directory to `t<room>-<slug>` under `container` and rewrite
 * every record that spells where it stood — no commit, which is the caller's.
 *
 * - The task record: its room code and floor, and its opening line where it
 *   still says the address Ward wrote.
 * - Its sessions' `task`, the room code, when the room changes. Their ids are
 *   slug-based and stay.
 * - An open task's worktree records: each workspace path to its placement on
 *   the new floor, whose leaf carries the new address. A closed task's keep
 *   the paths they had: history, and nothing stands there.
 * - Every floor's reflections that cover the task, by its directory now
 *   (design/0083-reflection-coverage-across-floors/).
 *
 * Quotations — the brief's `for`, the hand-off's `task` and `to`, the trail's
 * `task-named` events, closed sessions' working directories — say what was
 * said at the time, and stay.
 */
async function rehome(
  root: string,
  task: FoundTask,
  container: string,
  room: number,
  floor: number,
  open: boolean,
): Promise<{ readonly task: FoundTask; readonly written: string[] }> {
  const code = `t${room}`;
  const toDir = `${container}/${code}-${task.record.slug}`;
  await mkdir(join(root, container), { recursive: true });
  moveTracked(root, task.dir, toDir);
  const written: string[] = [];

  const record: TaskRecord = { ...task.record, code, floor };
  const moved: FoundTask = { dir: toDir, record };
  const type = taskRecordType(toDir);
  const current = await readDocument(root, type);
  const body = current.body
    .replace(`addressed \`${taskAddress(task)}\``, `addressed \`${taskAddress(moved)}\``)
    .replace(
      `room \`${task.record.code}\` on floor ${task.record.floor ?? taskFloor(task)}.`,
      `room \`${code}\` on floor ${floor}.`,
    );
  await writeDocument(root, type, { data: record, body });
  written.push(type.relPath);

  if (code !== task.record.code) {
    for (const session of await readSessions(root, toDir)) {
      const next: SessionRecord = { ...session, task: code };
      await writeSession(root, toDir, next);
      written.push(`${toDir}/sessions/${session.id}.md`);
    }
  }

  if (open) {
    for (const entry of await readTaskWorktreeEntries(root, toDir)) {
      if (standsOutside(entry.record)) continue;
      const path = worktreePlacement(moved, entry.record.branch);
      if (path === entry.record.path) continue;
      const worktree = worktreeRecordType(toDir, entry.fileName);
      await writeDocument(root, worktree, { data: { ...entry.record, path }, body: entry.body });
      written.push(worktree.relPath);
    }
  }

  for (const dir of projectDirs(root)) {
    for (const found of await readReflections(root, dir)) {
      if (!found.record.tasks.some((covered) => covered.dir === task.dir)) continue;
      const reflection = reflectionRecordType(dir, found.record.number);
      const doc = await readDocument(root, reflection);
      await writeDocument(root, reflection, {
        data: {
          ...doc.data,
          tasks: doc.data.tasks.map((covered) =>
            covered.dir === task.dir ? { ...covered, dir: toDir } : covered,
          ),
        },
        body: doc.body,
      });
      written.push(reflection.relPath);
    }
  }
  return { task: moved, written: [...new Set(written)] };
}

function within(inner: string, outer: string): boolean {
  return inner === outer || inner.startsWith(`${outer}/`);
}
