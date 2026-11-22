// A floor's reflection (design/0069-floor-reflection/): the loop that turns a
// floor's finished work into durable changes to how the floor works
// (intent/01-concepts/04-reflection-and-evolution.md).
//
// Ward's part is the bookkeeping around a judgement it does not make. It
// calls no model and starts no agent. It says what there is to read (the
// packet), builds the vehicle the result travels in (a stewardship task on
// the ground floor with a worktree of the workspace's own repository), and
// writes the record of what was covered. An agent that is already running
// reads the packet, reads the histories it names, edits the floor's notes in
// the worktree, and hands Ward its summary. The human previews the branch and
// lands it with the gated merge, or does not.
//
// The cursor is the set of closed tasks named in the reflection records that
// have reached the main line. Nothing else stores it. A reflection record
// exists only on its stewardship branch until the merge, so a reflection the
// human declines never advanced anything.
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { WardError } from '../errors.ts';
import { readMachine } from '../global/machine.ts';
import { adapterForHandle } from '../harness/index.ts';
import { readDocument, writeDocument } from '../store/document.ts';
import { withStoreLock } from '../store/lock.ts';
import {
  type ReflectionHistory,
  type ReflectionRecord,
  reflectionRecordType,
  type SessionEvent,
  type SessionRecord,
  type TaskRecord,
  type WorktreeRecord,
} from '../store/types.ts';
import { taskAddress } from './address.ts';
import { briefPath } from './briefs.ts';
import { carriesManifest, floorManifestPaths } from './floor-manifest.ts';
import { gitOrThrow } from './git.ts';
import {
  type FoundProject,
  GROUND_FLOOR_DIR,
  requireGroundFloor,
  resolveProject,
} from './projects.ts';
import { commitRecords, type FoundTask, readTasks, resolvableAddress } from './scan.ts';
import { continuedBy, findSession, readSessions } from './sessions.ts';
import { refuseStewardshipCopy, resolveWorkspaceMainLine } from './steward.ts';
import { openTask } from './tasks.ts';
import { createWorkspaceWorktree, readTaskWorktrees, worktreeDir } from './worktrees.ts';

/**
 * How many closed tasks a floor holds, covered by no reflection, before Ward
 * mentions it at a task close and in `ward status`. Below it the mention
 * would arrive at nearly every close and stop being read; a handful of
 * finished tasks is also the least a floor-level reflection can say anything
 * general about.
 */
export const REFLECTION_HINT_THRESHOLD = 5;

/**
 * The most a reflection's summary may hold, in bytes. A summary is the
 * distilled result; the proposals themselves are the diff. The bound is what
 * keeps a transcript from being pasted into the committed record by accident:
 * session histories run to megabytes and no honest summary does.
 */
export const REFLECTION_SUMMARY_LIMIT = 32 * 1024;

// -- reading the floor's reflections ----------------------------------------

export interface FoundReflection {
  /** Workspace-relative path of the record. */
  readonly path: string;
  readonly record: ReflectionRecord;
}

/** A floor's reflection records in `root`'s tree, oldest first. */
export async function readReflections(
  root: string,
  projectDir: string,
): Promise<FoundReflection[]> {
  const dir = join(root, projectDir, 'reflections');
  if (!existsSync(dir)) return [];
  const numbers = readdirSync(dir)
    .filter((name) => /^[1-9]\d*\.md$/.test(name))
    .map((name) => Number(name.slice(0, -3)))
    .sort((a, b) => a - b);
  const found: FoundReflection[] = [];
  for (const number of numbers) {
    const type = reflectionRecordType(projectDir, number);
    found.push({ path: type.relPath, record: (await readDocument(root, type)).data });
  }
  return found;
}

/** Where a floor's reflections have reached, read from the records in one tree. */
interface Cursor {
  readonly last: FoundReflection | undefined;
  /** Record directories of the tasks a reflection has covered. */
  readonly covered: ReadonlySet<string>;
  /** Sessions a reflection read after they closed: never offered again. */
  readonly settled: ReadonlySet<string>;
}

async function readCursor(root: string, projectDir: string, except?: string): Promise<Cursor> {
  const reflections = (await readReflections(root, projectDir)).filter(
    (found) => found.path !== except,
  );
  return {
    last: reflections.at(-1),
    covered: new Set(reflections.flatMap((found) => found.record.tasks.map((task) => task.dir))),
    settled: new Set(
      reflections.flatMap((found) =>
        found.record.sessions
          .filter((session) => session.state === 'closed')
          .map((session) => session.id),
      ),
    ),
  };
}

/**
 * The floor's closed tasks no reflection in this tree has covered, oldest
 * close first. A reflection's own vehicle is left out: it is the act of
 * reflecting, and counting it would have every reflection leave one more task
 * to reflect on.
 */
function unreflected(
  project: FoundProject,
  tasks: readonly FoundTask[],
  cursor: Cursor,
): FoundTask[] {
  return tasks
    .filter(
      (task) =>
        task.dir.startsWith(`${project.dir}/tasks/`) &&
        task.record.state === 'closed' &&
        task.record.stewardship !== 'reflection' &&
        !cursor.covered.has(task.dir),
    )
    .sort((a, b) => (a.record.closedAt ?? '').localeCompare(b.record.closedAt ?? ''));
}

/**
 * How many closed tasks on a floor no landed reflection has covered — the
 * number `ward status` carries for each floor. `tasks` is the caller's own
 * read of the workspace, so a listing of every floor costs one directory read
 * per floor and no second pass over the task records.
 */
export async function unreflectedCount(
  root: string,
  project: FoundProject,
  tasks: readonly FoundTask[],
): Promise<number> {
  return unreflected(project, tasks, await readCursor(root, project.dir)).length;
}

// -- the vehicle ------------------------------------------------------------

/** An open reflection task for a floor, with its workspace worktree when it has one. */
export interface OpenReflection {
  readonly task: FoundTask;
  readonly worktree?: WorktreeRecord;
}

/**
 * The open reflection of `floor`, if there is one — found by the marker Ward
 * wrote on the task (`stewardship: reflection`, `reflects: N`), never by its
 * slug (design/0030-upgrade-self-service/, for the same reason).
 */
export async function findOpenReflection(
  root: string,
  floor: number,
  tasks?: readonly FoundTask[],
): Promise<OpenReflection | undefined> {
  for (const task of tasks ?? (await readTasks(root))) {
    if (task.record.state === 'closed') continue;
    if (task.record.stewardship !== 'reflection' || task.record.reflects !== floor) continue;
    const worktree = (await readTaskWorktrees(root, task.dir)).find(
      (record) => record.source === 'workspace',
    );
    return { task, ...(worktree === undefined ? {} : { worktree }) };
  }
  return undefined;
}

/**
 * The files a reflection may change on its branch, workspace-relative: the
 * reflected floor's notes, and the ground floor's, where knowledge about the
 * whole workspace belongs. A closed floor carries no notes, so its reflection
 * may change the ground floor's alone.
 */
function editablePaths(project: FoundProject): string[] {
  const ground = floorManifestPaths(GROUND_FLOOR_DIR).notes;
  const own = carriesManifest(project.record) ? [floorManifestPaths(project.dir).notes] : [];
  return [...new Set([...own, ground])];
}

/** One act left for someone after a verb ran, with its exact command. */
export interface ReflectionAct {
  readonly step: string;
  readonly detail: string;
  readonly command?: string;
}

export interface ReflectionOpenReport {
  readonly floor: number;
  readonly slug: string;
  /** `opened`: a new vehicle. `reused`: the floor's reflection was already open. */
  readonly outcome: 'opened' | 'reused';
  /** The stewardship task's address. */
  readonly task: string;
  readonly branch: string;
  /** Workspace-relative path of the stewardship worktree. */
  readonly path: string;
  /** Closed tasks the reflection will cover. */
  readonly tasks: number;
  /** The files the reflecting agent may change in the worktree, workspace-relative. */
  readonly editable: readonly string[];
  readonly remaining: readonly ReflectionAct[];
}

/**
 * Build the vehicle for a floor's reflection: a task on the ground floor
 * marked as that floor's reflection, and a worktree of the workspace's own
 * repository cut from the main line as it stands. Convergent: with the
 * floor's reflection already open, it re-establishes the worktree if it is
 * missing and reports the same vehicle.
 *
 * The worktree is a copy of the record at the moment it was cut, and that
 * copy is the reflection's window: what was closed in it is what the
 * reflection covers, however long the reading takes and whatever closes
 * meanwhile.
 */
export async function openReflection(root: string, floor: number): Promise<ReflectionOpenReport> {
  refuseStewardshipCopy(root);
  const project = await resolveProject(root, floor);
  const existing = await findOpenReflection(root, floor);
  if (existing === undefined) {
    const waiting = unreflected(
      project,
      await readTasks(root),
      await readCursor(root, project.dir),
    );
    if (waiting.length === 0) {
      // No vehicle for no work: an empty stewardship task would read as a
      // proposal awaiting the human where there is none (0030's rule).
      throw new WardError(
        `floor ${floor} has no closed task a reflection has not covered — nothing to reflect ` +
          `on yet (see: ward reflection packet ${floor})`,
      );
    }
  }
  const task =
    existing?.task ??
    (await openTask(root, `reflect-floor-${floor}`, {
      floor: await requireGroundFloor(root),
      purpose: `Reflect on floor ${floor} (${project.record.slug}) since its last reflection`,
      stewardship: 'reflection',
      reflects: floor,
    }));
  const address = await resolvableAddress(root, task);
  const { record: worktree } = await createWorkspaceWorktree(
    root,
    address,
    existing?.worktree?.branch,
  );
  const copy = worktreeDir(root, worktree);
  const covered = unreflected(project, await readTasks(copy), await readCursor(copy, project.dir));
  return {
    floor,
    slug: project.record.slug,
    outcome: existing === undefined ? 'opened' : 'reused',
    task: address,
    branch: worktree.branch,
    path: worktree.path,
    tasks: covered.length,
    editable: editablePaths(project),
    remaining: [
      {
        step: 'read',
        detail: 'what the reflection covers, and where each session history stands',
        command: `ward reflection packet ${floor}`,
      },
      {
        step: 'propose',
        detail: `edit ${editablePaths(project).join(' and ')} in ${worktree.path}`,
      },
      {
        step: 'record',
        detail: 'hand Ward the summary; it writes the record and commits the branch',
        command: `ward reflection record ${floor} FILE`,
      },
    ],
  };
}

// -- the packet -------------------------------------------------------------

/** Where a session's harness history stands on this machine. */
export interface PacketHistory {
  readonly standing: ReflectionHistory;
  /** The history file — present exactly when `found`. A local path: never recorded. */
  readonly path?: string;
  /** Its size in bytes — present exactly when `found`. */
  readonly bytes?: number;
}

export interface PacketSession {
  readonly id: string;
  readonly purpose: string;
  readonly state: 'open' | 'closed';
  readonly machine?: string;
  readonly openedAt: string;
  readonly closedAt?: string;
  readonly events: readonly SessionEvent[];
  /**
   * The pair a move made (design/0084-session-move/): the session this one
   * continues, and the one that continues it. Both share one harness history,
   * so a reader takes from it only the stretch between this record's open and
   * its close.
   */
  readonly continues?: string;
  readonly continuedBy?: string;
  readonly history: PacketHistory;
}

export interface PacketTask {
  /** The task's record directory, workspace-relative: what names a closed task for good. */
  readonly dir: string;
  readonly slug: string;
  readonly purpose?: string;
  readonly outcome?: 'delivered' | 'abandoned';
  readonly openedAt: string;
  readonly closedAt?: string;
  readonly prs: readonly string[];
  /** Workspace-relative path of the task's brief — present when it has one. */
  readonly brief?: string;
  readonly sessions: readonly PacketSession[];
}

export interface ReflectionPacket {
  readonly floor: number;
  readonly slug: string;
  /** The machine asked: every history standing below is its answer. */
  readonly machine: string;
  /** The floor's last reflection in the tree read — absent before its first. */
  readonly since?: { readonly number: number; readonly through: string; readonly path: string };
  /** The floor's open reflection, when one is. Its worktree's copy is then the window. */
  readonly vehicle?: { readonly task: string; readonly branch?: string; readonly path?: string };
  /** The floor's notes and manifest, workspace-relative — present while the floor carries them. */
  readonly notes?: string;
  readonly manifest?: string;
  /** The files a reflection of this floor may change on its branch. */
  readonly editable: readonly string[];
  /** Closed tasks no reflection has covered, oldest close first. */
  readonly tasks: readonly PacketTask[];
  /** The floor's own sessions not yet read to their close. */
  readonly floorSessions: readonly PacketSession[];
  /** Tasks still open on the floor: context, not covered. */
  readonly open: readonly {
    readonly address: string;
    readonly slug: string;
    readonly state: 'active' | 'paused';
    readonly openedAt: string;
  }[];
  /** Sessions in the window whose history is not readable here, by id. */
  readonly unread: readonly string[];
}

/**
 * What there is to reflect on for one floor. Read-only and model-free.
 *
 * With the floor's reflection open, the window is read from its worktree's
 * copy of the record, so the packet names exactly what `reflection record`
 * will write down. With none open it is read from the workspace itself and
 * says what a reflection opened now would cover. Session records are read
 * from the workspace either way: a closed task's sessions are closed in both,
 * and the trail of a floor session still running is only current there.
 */
export async function reflectionPacket(root: string, floor: number): Promise<ReflectionPacket> {
  const project = await resolveProject(root, floor);
  const vehicle = await findOpenReflection(root, floor);
  const copy =
    vehicle?.worktree !== undefined && existsSync(worktreeDir(root, vehicle.worktree))
      ? worktreeDir(root, vehicle.worktree)
      : undefined;
  // The vehicle's own record, once written, is read past: the packet goes on
  // naming what this reflection covers until the merge makes it history.
  const own =
    copy === undefined || vehicle === undefined
      ? undefined
      : await ownRecord(copy, project.dir, vehicle.task.dir);
  const window = await readWindow(root, copy ?? root, project, own?.path);
  const manifest = floorManifestPaths(project.dir);
  const carries = carriesManifest(project.record);
  return {
    floor,
    slug: project.record.slug,
    machine: window.machine,
    ...(window.cursor.last === undefined
      ? {}
      : {
          since: {
            number: window.cursor.last.record.number,
            through: window.cursor.last.record.through,
            path: window.cursor.last.path,
          },
        }),
    ...(vehicle === undefined
      ? {}
      : {
          vehicle: {
            task: await resolvableAddress(root, vehicle.task),
            ...(vehicle.worktree === undefined
              ? {}
              : { branch: vehicle.worktree.branch, path: vehicle.worktree.path }),
          },
        }),
    ...(carries ? { notes: manifest.notes, manifest: manifest.agents } : {}),
    editable: editablePaths(project),
    tasks: window.tasks,
    floorSessions: window.floorSessions,
    open: (await readTasks(root))
      .filter(
        (task) => task.dir.startsWith(`${project.dir}/tasks/`) && task.record.state !== 'closed',
      )
      .map((task) => ({
        address: taskAddress(task),
        slug: task.record.slug,
        state: task.record.state as 'active' | 'paused',
        openedAt: task.record.openedAt,
      })),
    unread: [...window.tasks.flatMap((task) => task.sessions), ...window.floorSessions]
      .filter((session) => session.history.standing !== 'found')
      .map((session) => session.id),
  };
}

interface Window {
  readonly machine: string;
  readonly cursor: Cursor;
  readonly tasks: readonly PacketTask[];
  readonly floorSessions: readonly PacketSession[];
}

/**
 * The reflection window: `tree` (the workspace root, or a stewardship copy)
 * says which tasks are closed and what earlier reflections covered; `root`
 * supplies the session records and is where histories are located. `except`
 * names one reflection record to read as if it were not there: the vehicle's
 * own, so a second recording describes the same interval as the first.
 */
async function readWindow(
  root: string,
  tree: string,
  project: FoundProject,
  except?: string,
): Promise<Window> {
  const machine = (await readMachine()).name;
  const cursor = await readCursor(tree, project.dir, except);
  const tasks: PacketTask[] = [];
  for (const task of unreflected(project, await readTasks(tree), cursor)) {
    const brief = briefPath(task.dir);
    tasks.push({
      ...packetTaskFacts(task.dir, task.record),
      ...(existsSync(join(root, brief)) ? { brief } : {}),
      sessions: (await readSessions(root, task.dir)).map((session) =>
        packetSession(root, session, machine),
      ),
    });
  }
  // On the ground floor the coordinator is the floor's attending
  // (design/0089-floor-attending/), and its sessions — with the helpers it
  // started — are recorded at workspace scope, not under floor 0: read both,
  // or a ground-floor reflection would never see the work its attending did.
  const ground = project.record.floor === 0 ? await readSessions(root, '') : [];
  const floorSessions = [...(await readSessions(root, project.dir)), ...ground]
    .filter((session) => !cursor.settled.has(session.id))
    .map((session) => packetSession(root, session, machine));
  return { machine, cursor, tasks, floorSessions };
}

function packetTaskFacts(dir: string, record: TaskRecord): Omit<PacketTask, 'sessions' | 'brief'> {
  return {
    dir,
    slug: record.slug,
    ...(record.purpose === undefined ? {} : { purpose: record.purpose }),
    ...(record.outcome === undefined ? {} : { outcome: record.outcome }),
    openedAt: record.openedAt,
    ...(record.closedAt === undefined ? {} : { closedAt: record.closedAt }),
    prs: record.prs,
  };
}

function packetSession(root: string, record: SessionRecord, machine: string): PacketSession {
  const successor = continuedBy(record);
  return {
    id: record.id,
    purpose: record.purpose,
    state: record.state,
    ...(record.machine === undefined ? {} : { machine: record.machine }),
    openedAt: record.openedAt,
    ...(record.closedAt === undefined ? {} : { closedAt: record.closedAt }),
    events: record.events ?? [],
    ...(record.continues === undefined ? {} : { continues: record.continues }),
    ...(successor === undefined ? {} : { continuedBy: successor }),
    history: historyOf(root, record, machine),
  };
}

/**
 * Where a session's history stands here. `elsewhere` is answered from the
 * record alone — the session ran on another machine, so this one's filesystem
 * has nothing to say about it. `unlocatable` is a session with no handle, or
 * one no harness Ward has can resolve.
 */
function historyOf(root: string, record: SessionRecord, machine: string): PacketHistory {
  if (record.machine !== undefined && record.machine !== machine) return { standing: 'elsewhere' };
  const adapter = adapterForHandle(record.handle);
  const nativeId = adapter?.nativeId(record.handle ?? '') ?? null;
  if (adapter === null || nativeId === null) return { standing: 'unlocatable' };
  const located = adapter.locate(nativeId, resolve(root, record.workingDirectory));
  if (located.outcome !== 'found') return { standing: 'gone' };
  let bytes = 0;
  try {
    bytes = statSync(located.path).size;
  } catch {
    return { standing: 'gone' };
  }
  return { standing: 'found', path: located.path, bytes };
}

// -- recording --------------------------------------------------------------

export interface ReflectionRecordReport {
  readonly floor: number;
  readonly slug: string;
  /** This floor's Nth reflection. */
  readonly number: number;
  /** `recorded` the first time; `replaced` when this vehicle had already recorded one. */
  readonly outcome: 'recorded' | 'replaced';
  /** The stewardship task's address. */
  readonly task: string;
  readonly branch: string;
  /** The record's path, relative to the workspace (and to the worktree). */
  readonly path: string;
  /** The commit on the stewardship branch (short). */
  readonly commit: string;
  /** Closed tasks covered. */
  readonly tasks: number;
  /** Sessions in the window. */
  readonly sessions: number;
  /** Sessions whose history was not readable on this machine, by id. */
  readonly unread: readonly string[];
  /** The proposal files the commit carries beside the record. */
  readonly changed: readonly string[];
  readonly remaining: readonly ReflectionAct[];
}

/**
 * Record a floor's reflection on its stewardship branch: write the reflection
 * record into the worktree, and commit it there together with the changes
 * the reflecting agent made to the floor's notes. One commit carries the
 * proposal and the cursor advance, so the merge lands both or neither.
 *
 * Run at the workspace root, like `ward workspace upgrade TASK`: it is the
 * enclosing workspace's act, writing into the candidate copy. The commit is
 * stewardship work on a branch, not a journal entry, which is why writing it
 * in a stewardship copy is the rule working rather than an exception to it
 * (intent/01-concepts/06-workspace-lifecycle.md, journal and stewardship).
 *
 * A change outside the files a reflection may touch is refused before
 * anything is written, naming each path.
 */
export async function recordReflection(
  root: string,
  floor: number,
  summaryInput: string,
  declared: string | undefined,
  now: Date = new Date(),
): Promise<ReflectionRecordReport> {
  refuseStewardshipCopy(root);
  const summary = summaryInput.trim();
  if (summary === '') throw new WardError('a reflection needs a summary — the file is empty');
  const size = Buffer.byteLength(summary, 'utf8');
  if (size > REFLECTION_SUMMARY_LIMIT) {
    throw new WardError(
      `the summary is ${size} bytes and a reflection's summary holds at most ` +
        `${REFLECTION_SUMMARY_LIMIT} — it is the distilled result, committed to the record; ` +
        'quote no transcript in it, and put durable facts in the notes instead',
    );
  }
  if (summary.startsWith('---\n')) {
    throw new WardError(
      'the file opens with front matter — pass the summary text alone; Ward writes the front matter',
    );
  }
  const session = declared === undefined ? undefined : await recordedSession(root, declared);
  const project = await resolveProject(root, floor);

  return withStoreLock(root, `reflection record ${floor}`, async () => {
    const vehicle = await findOpenReflection(root, floor);
    if (vehicle === undefined) {
      throw new WardError(
        `floor ${floor} has no open reflection — open one first: ward reflection open ${floor}`,
      );
    }
    const address = await resolvableAddress(root, vehicle.task);
    const worktree = vehicle.worktree;
    if (worktree === undefined || !existsSync(worktreeDir(root, worktree))) {
      throw new WardError(
        `the reflection task ${address} has no worktree on disk — re-establish it: ` +
          `ward reflection open ${floor}`,
      );
    }
    const copy = worktreeDir(root, worktree);
    const own = await ownRecord(copy, project.dir, vehicle.task.dir);
    const last = (await readCursor(copy, project.dir)).last;
    const number = own?.record.number ?? (last?.record.number ?? 0) + 1;
    const type = reflectionRecordType(project.dir, number);

    // What the branch holds beyond the main line, committed or not — checked
    // against the short list before a byte is written.
    const mainLine = resolveWorkspaceMainLine(root);
    const base = gitOrThrow(copy, 'merge-base', mainLine, 'HEAD').stdout.trim();
    const touched = changedSince(copy, base);
    const editable = editablePaths(project);
    const foreign = touched.filter((path) => path !== type.relPath && !editable.includes(path));
    if (foreign.length > 0) {
      throw new WardError(
        `the reflection branch changes ${foreign.join(', ')} — a reflection may change only ` +
          `${editable.join(' and ')}; nothing was recorded. Take the other changes off the ` +
          `branch (in ${worktree.path}), or carry them in a task of their own`,
      );
    }

    // The window, read past the vehicle's own earlier record: re-recording
    // covers what the first recording did, not what it left.
    const window = await readWindow(root, copy, project, own?.path);
    const sessions = [...window.tasks.flatMap((task) => task.sessions), ...window.floorSessions];
    const previous = window.cursor.last;
    const record: ReflectionRecord = {
      type: 'reflection',
      floor,
      number,
      task: vehicle.task.dir,
      ...(session === undefined ? {} : { session }),
      machine: window.machine,
      ...(previous === undefined ? {} : { from: previous.record.through }),
      through: now.toISOString(),
      tasks: window.tasks.map((task) => ({
        dir: task.dir,
        ...(task.outcome === undefined ? {} : { outcome: task.outcome }),
        ...(task.closedAt === undefined ? {} : { closedAt: task.closedAt }),
      })),
      sessions: sessions.map((found) => ({
        id: found.id,
        state: found.state,
        history: found.history.standing,
      })),
    };
    await writeDocument(copy, type, { data: record, body: summary });
    const changed = touched.filter((path) => editable.includes(path));
    const dirty = changedSince(copy, 'HEAD').filter((path) => editable.includes(path));
    commitRecords(copy, `Reflect on floor ${floor} (reflection ${number})`, type.relPath, ...dirty);
    return {
      floor,
      slug: project.record.slug,
      number,
      outcome: own === undefined ? ('recorded' as const) : ('replaced' as const),
      task: address,
      branch: worktree.branch,
      path: type.relPath,
      commit: gitOrThrow(copy, 'rev-parse', '--short', 'HEAD').stdout.trim(),
      tasks: record.tasks.length,
      sessions: record.sessions.length,
      unread: record.sessions.filter((s) => s.history !== 'found').map((s) => s.id),
      changed,
      remaining: [
        {
          step: 'review',
          detail: 'read the proposal before landing it',
          command: `ward workspace merge ${worktree.branch} --preview`,
        },
        {
          step: 'merge',
          detail: "land it on the workspace's own main line — the gated act, and the human's",
          command: `ward workspace merge ${worktree.branch}`,
        },
        {
          step: 'close',
          detail: 'close the task once it has landed; the close verifies the branch reached main',
          command: `ward task close ${address}`,
        },
        {
          step: 'decline',
          detail: 'or leave it unmerged: the floor stays unreflected and nothing else changes',
          command: `ward task close ${address} --outcome abandoned`,
        },
      ],
    };
  });
}

/** The reflection this vehicle already recorded in its copy, if it has. */
async function ownRecord(
  copy: string,
  projectDir: string,
  taskDir: string,
): Promise<FoundReflection | undefined> {
  return (await readReflections(copy, projectDir)).find((found) => found.record.task === taskDir);
}

/**
 * Every path that differs from `base` in the worktree at `dir`: committed
 * since, staged, unstaged, or untracked. A rename counts as both its paths.
 */
function changedSince(dir: string, base: string): string[] {
  const committed = gitOrThrow(dir, 'diff', '--name-only', '--no-renames', '-z', base, 'HEAD');
  const working = gitOrThrow(dir, 'status', '--porcelain', '--no-renames', '-z', '-uall');
  const paths = new Set<string>(committed.stdout.split('\0').filter((path) => path !== ''));
  for (const entry of working.stdout.split('\0')) {
    if (entry.length > 3) paths.add(entry.slice(3));
  }
  return [...paths].sort();
}

async function recordedSession(root: string, id: string): Promise<string | undefined> {
  try {
    return (await findSession(root, id)).record.id;
  } catch (error) {
    if (error instanceof WardError) return undefined; // declared, but no session: no provenance
    throw error;
  }
}

// -- the hint ---------------------------------------------------------------

export interface ReflectionHint {
  readonly floor: number;
  /** Closed tasks on the floor no landed reflection has covered. */
  readonly unreflected: number;
  readonly command: string;
}

/**
 * The one line `ward task close` adds when the closed task's floor has
 * finished work waiting on a reflection: present from the threshold up, and
 * absent while the floor's reflection is already open — the human has been
 * told, and the branch is the reminder. Never a prompt and never a gate.
 */
export async function reflectionHint(
  root: string,
  floor: number,
): Promise<ReflectionHint | undefined> {
  const project = await resolveProject(root, floor);
  const tasks = await readTasks(root);
  const count = await unreflectedCount(root, project, tasks);
  if (count < REFLECTION_HINT_THRESHOLD) return undefined;
  if ((await findOpenReflection(root, floor, tasks)) !== undefined) return undefined;
  return { floor, unreflected: count, command: `ward reflection packet ${floor}` };
}
