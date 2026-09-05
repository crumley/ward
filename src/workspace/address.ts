// The task address (design/0036-floor-addressed-tasks/): a task on a floor is
// addressed `f<floor>t<room>` — `f3t1` is room 1 on floor 3 — and a bare task
// (no floor) keeps `t<room>`, which IS its full address. The address is
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
 * Rooms on a floor, and in the bare pool: `t1`…`t99`.
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

/** A parsed address: a room, and the floor when the caller named one. */
export interface TaskAddress {
  readonly floor?: number;
  readonly room: number;
}

const ADDRESS = /^(?:f(\d+))?t(\d+)$/;
const PROJECT_DIR = /^projects\/(\d+)-/;

/**
 * The floor a task sits on, or undefined for a bare task. Containment
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
 * The address Ward speaks: `f3t22` for a floor task, `t18` for a bare one.
 * Every human-facing identity line and every `address` field in `--json`
 * comes through here, so the two audiences can never be told different
 * addresses for the same task (§8).
 */
export function taskAddress(task: AddressedTask): string {
  const floor = taskFloor(task);
  return floor === undefined ? task.record.code : `f${floor}${task.record.code}`;
}

/**
 * Parse what a caller typed. Canonical spelling is lowercase and parsing is
 * case-insensitive, so `F3T1` and `f3t1` resolve to the same task: one form
 * plus case-folding, never a family of spellings (`3t1`, `3-1`) that would
 * make the surface unpredictable for both audiences. Returns null for
 * anything that is not an address at all, so callers can say what a bad
 * argument was rather than reporting a lookup miss.
 */
export function parseTaskAddress(input: string): TaskAddress | null {
  const match = ADDRESS.exec(input.trim().toLowerCase());
  if (match === null) return null;
  const room = Number.parseInt(match[2] ?? '', 10);
  if (room < 1 || room > ROOMS_PER_FLOOR) return null;
  const floor = match[1] === undefined ? undefined : Number.parseInt(match[1], 10);
  if (floor !== undefined && floor < 1) return null;
  return floor === undefined ? { room } : { floor, room };
}

/** The parse, or the refusal that names the two accepted forms. */
export function requireTaskAddress(input: string): TaskAddress {
  const parsed = parseTaskAddress(input);
  if (parsed === null) {
    throw new WardError(
      `'${input}' is not a task address — floor tasks are f<floor>t<room> (f3t1) and bare ` +
        `tasks are t<room> (t18), rooms 1–${ROOMS_PER_FLOOR} (see: ward task list)`,
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
