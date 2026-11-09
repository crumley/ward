// The task address (design/0036-floor-addressed-tasks/): a task on a floor is
// addressed `f<floor>t<room>` — `f3t1` is room 1 on floor 3, and `f0t1` is
// room 1 on the ground floor (design/0041-ground-floor/) — while a LEGACY
// bare task (no floor, opened under `tasks/` before every task had a floor)
// is addressed `legacy-t<room>`, its pool named where a floor would be
// (design/0053-legacy-task-address/). The address is
// DERIVED, never stored: the record keeps carrying the room as its `code`,
// and the floor is already known from containment (the task's directory under
// `projects/<floor>-<slug>/tasks/`) and from the optional `floor` field, so
// every existing record composes an address unchanged
// (intent/01-concepts/00-domain-model.md, Identity — where global uniqueness
// is needed it is COMPOSED, exactly as a room's `4A12` composes its floor).
//
// This module is deliberately import-light — the error type and nothing else
// — so the scan layer, the task layer, and the CLI can all reach it without
// an import cycle: one home for the address, as the one-home rule requires.
import { WardError } from '../errors.ts';

/**
 * Rooms on a floor, and in the legacy bare pool: `t1`…`t99`.
 *
 * Two digits keeps a floor address at five characters (`f3t22`), which is
 * what makes it sayable and typable — the identity constraint that pays for
 * the whole scheme. Ninety-nine is also far above any container's real
 * lifetime task count (a floor's runs to a couple of dozen; the busiest bare
 * pool observed is about thirty), so rooms allocated in opening order
 * (`nextRoom`) come round again only after the whole floor has been used —
 * long enough that time disambiguates a reused room, which is the intent's
 * own ambiguity-breaker. A named constant rather than configuration: the size
 * of the address is a property of the identity scheme, and a workspace that
 * could set it to 5 would be a workspace whose addresses mean something
 * different from every other one's.
 */
export const ROOMS_PER_FLOOR = 99;

/** The shape an address is read off: containment plus the record's room. */
export interface AddressedTask {
  /** Workspace-relative task directory — `projects/3-slug/tasks/t1-slug` or `tasks/t1-slug`. */
  readonly dir: string;
  readonly record: { readonly code: string; readonly floor?: number | undefined };
}

/**
 * A parsed address: a room, and the container when the caller named one — a
 * floor, or the legacy pool. Neither named is the bare shorthand.
 */
export interface TaskAddress {
  readonly floor?: number;
  readonly legacy?: true;
  readonly room: number;
}

/**
 * The legacy pool's name in an address (design/0053-legacy-task-address/).
 * A word rather than a sigil because it must survive every place an address
 * travels — a worktree directory, a stewardship branch name (`:` is not legal
 * in a git ref), a shell argument, the telemetry scope — and because it can
 * be produced by no slip of a floor address: dropping a digit from `f3t2`
 * yields `ft2`, which parses as nothing, never as the legacy task.
 */
export const LEGACY_PREFIX = 'legacy-';

const ADDRESS = /^(?:(legacy-)|f(\d+))?t(\d+)$/;
const PROJECT_DIR = /^projects\/(\d+)-/;

/**
 * The floor a task sits on, or undefined for a legacy bare task. Containment
 * answers first — the directory is where the task actually IS, and a record
 * whose `floor` field disagreed with its location would be describing
 * somewhere else — with the record's optional field as the fallback for a
 * task read outside its tree.
 */
export function taskFloor(task: AddressedTask): number | undefined {
  const match = PROJECT_DIR.exec(task.dir);
  if (match?.[1] !== undefined) return Number.parseInt(match[1], 10);
  return task.record.floor;
}

/** The room number carried in the record's code (`t22` → 22); NaN never escapes. */
export function taskRoom(task: AddressedTask): number | undefined {
  const room = Number.parseInt(task.record.code.replace(/^t/, ''), 10);
  return Number.isNaN(room) ? undefined : room;
}

/**
 * The address Ward speaks: `f3t22` for a floor task, `legacy-t18` for a
 * legacy bare one — never the bare room, which is a shorthand that stops
 * resolving the moment a floor opens the same room.
 * Every human-facing identity line and every `address` field in `--json`
 * comes through here, so the two audiences can never be told different
 * addresses for the same task (§8).
 */
export function taskAddress(task: AddressedTask): string {
  const floor = taskFloor(task);
  return floor === undefined
    ? `${LEGACY_PREFIX}${task.record.code}`
    : `f${floor}${task.record.code}`;
}

/**
 * Whether a task answers to a parsed address: the room, and the container
 * the caller named — a floor, or the legacy pool (a task with no floor). The
 * bare shorthand names no container, so every task in the room answers and
 * the caller decides what several answers mean. Both resolvers (open-only
 * and read) match through here, so the two can never disagree on what an
 * address names.
 */
export function addressMatches(task: AddressedTask, wanted: TaskAddress): boolean {
  if (taskRoom(task) !== wanted.room) return false;
  if (wanted.legacy === true) return taskFloor(task) === undefined;
  return wanted.floor === undefined || taskFloor(task) === wanted.floor;
}

/** The address a parsed one canonically spells — `f3t1`, `legacy-t2`, or the bare `t1`. */
export function spellAddress(wanted: TaskAddress): string {
  if (wanted.legacy === true) return `${LEGACY_PREFIX}t${wanted.room}`;
  return wanted.floor === undefined ? `t${wanted.room}` : `f${wanted.floor}t${wanted.room}`;
}

/**
 * Parse what a caller typed. Canonical spelling is lowercase and parsing is
 * case-insensitive, so `F3T1` and `f3t1` resolve to the same task: one form
 * plus case-folding, never a family of spellings (`3t1`, `3-1`) that would
 * make the surface unpredictable for both audiences. The legacy pool's
 * `legacy-` takes the floor's place, so `legacy-t2` is the one spelling of a
 * legacy task's full address. Returns null for
 * anything that is not an address at all, so callers can say what a bad
 * argument was rather than reporting a lookup miss.
 */
export function parseTaskAddress(input: string): TaskAddress | null {
  const match = ADDRESS.exec(input.trim().toLowerCase());
  if (match === null) return null;
  const room = Number.parseInt(match[3] ?? '', 10);
  if (room < 1 || room > ROOMS_PER_FLOOR) return null;
  if (match[1] !== undefined) return { legacy: true, room };
  const floor = match[2] === undefined ? undefined : Number.parseInt(match[2], 10);
  // Floor 0 is the ground floor (design/0041-ground-floor/), so `f0t7` is an
  // address like any other; a negative floor cannot be spelled at all.
  if (floor !== undefined && floor < 0) return null;
  return floor === undefined ? { room } : { floor, room };
}

/** The parse, or the refusal that names the accepted forms. */
export function requireTaskAddress(input: string): TaskAddress {
  const parsed = parseTaskAddress(input);
  if (parsed === null) {
    throw new WardError(
      `'${input}' is not a task address — floor tasks are f<floor>t<room> (f3t1), legacy ` +
        `bare tasks are legacy-t<room> (legacy-t18), and a bare t<room> is a shorthand for ` +
        `either while unique; rooms 1–${ROOMS_PER_FLOOR} (see: ward task list)`,
    );
  }
  return parsed;
}

/**
 * The next room in a container's own sequence — one sequence per floor, and
 * one for the bare pool.
 *
 * Rooms are numbered in the order tasks OPEN in the container: the next room
 * is the one after the most recently opened task's, wrapping from the ceiling
 * back to 1, skipping any room a still-open task holds. Nothing is stored
 * (§17): the cursor is read from the records themselves, which is what keeps
 * it correct after a hand-edit, a restore, or a rebase of the journal.
 *
 * **Why opening order rather than the smallest free room.** Smallest-free
 * hands a freshly closed room straight to the next task — the failure this
 * replaces: a code that changed hands seconds after a close is a code the
 * record cannot be trusted on, in briefs, in a human's memory, and in an
 * agent's re-read of a stale listing. Going round the floor spends the whole
 * address space before repeating, so a room comes back only after the time
 * the intent already relies on to disambiguate reuse.
 *
 * `occupied` are the rooms held by the container's non-closed tasks;
 * `blocked` reports rooms that must be skipped for another reason (today: a
 * directory of the same room and slug already on disk).
 */
export function nextRoom(
  container: { readonly mostRecentRoom?: number; readonly occupied: readonly number[] },
  blocked: (room: number) => boolean = () => false,
): number {
  const taken = new Set(container.occupied);
  const start = container.mostRecentRoom ?? 0;
  for (let step = 1; step <= ROOMS_PER_FLOOR; step += 1) {
    const room = ((start + step - 1) % ROOMS_PER_FLOOR) + 1;
    if (taken.has(room) || blocked(room)) continue;
    return room;
  }
  return 0; // every room held — the caller refuses; 0 is never a valid room
}
