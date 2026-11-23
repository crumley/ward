// Placement (design/0031-detached-session-hosting/): which floor's host a
// session's window belongs in — a pure function of records, recomputed on
// every launch and never stored. Every window lives in that one host alone:
// the coordinator, too, stays in the ground floor's host
// (design/0086-coordinator-stays-home/). Placement reads facts
// that do not change over a session's life (its scope, its task's floor, and
// for a workspace-scope helper its recorded parent —
// design/0090-floor-sessions-stay-home/), so a re-created window lands where
// the first one did, and
// a reboot reassembles every floor exactly as it stood without anything
// having remembered a window. Which session is a floor's attending, the first
// window of its host (design/0089-floor-attending/), is derived here too.
import { type SessionRecord, sessionScopeOf } from '../store/types.ts';
import type { OpenSessionListing } from '../workspace/sessions.ts';

const PROJECT_DIR = /^projects\/(\d+)-/;

/**
 * The floor a session's own scope names: workspace scope → 0, a floor's own
 * session → that floor, a task session → its task's floor (read from where
 * the task stands), a legacy bare task → 0.
 */
export function ownFloor(listing: OpenSessionListing): number {
  const { record } = listing;
  switch (sessionScopeOf(record)) {
    case 'workspace':
      return 0;
    case 'project':
      return record.floor ?? 0;
    case 'task': {
      const match = PROJECT_DIR.exec(listing.scopeDir);
      return match?.[1] === undefined ? 0 : Number.parseInt(match[1], 10);
    }
  }
}

/**
 * The floor whose host the session's window goes in
 * (design/0090-floor-sessions-stay-home/). A floor's own session, and a task
 * session, belong to the floor their scope names, whoever started them: their
 * own floor's host is where that floor is tended, and where its attending,
 * `wsa N` and a hand-off's line all look. Only a workspace-scope session has
 * no floor of its own to go to, so one started by another session lands
 * beside that parent — its parent's placement floor when that parent's record
 * exists here and is not floor 0 — and otherwise in the ground floor's host.
 * Bounded by the parent chain, with a guard against a chain that loops (only a
 * hand-edited record makes one): the walk stops at the first session it has
 * already seen.
 */
export function placementFloor(
  listing: OpenSessionListing,
  all: readonly OpenSessionListing[],
): number {
  const byId = new Map(all.map((entry) => [entry.record.id, entry]));
  const seen = new Set<string>();
  const walk = (entry: OpenSessionListing): number => {
    seen.add(entry.record.id);
    const own = ownFloor(entry);
    if (sessionScopeOf(entry.record) !== 'workspace') return own;
    const parentId = entry.record.parent;
    if (parentId === undefined || seen.has(parentId)) return own;
    const parent = byId.get(parentId);
    if (parent === undefined) return own;
    const inherited = walk(parent);
    return inherited === 0 ? own : inherited;
  };
  return walk(listing);
}

/**
 * Whether the session is the workspace's coordinator: a workspace-scope
 * session no other session started. Its window stands in the floor-0 host,
 * like its helpers', a ground-floor task session's, and floor 0's own
 * session's (design/0086-coordinator-stays-home/); being the coordinator only
 * decides what bare `wsa` offers, what the window is called, and that
 * `resume --all` brings it back first.
 */
export function isCoordinator(record: SessionRecord): boolean {
  return sessionScopeOf(record) === 'workspace' && record.parent === undefined;
}

// -- the floor's attending (design/0089-floor-attending/) ------------------------

/**
 * Whether a floor session is a GENERAL one: a floor's own session (floor
 * scope) whose trail has never named a task. A session opened with `--task`
 * or `--new-task` names one at its open, and one that has named a task since
 * is a task session for good, even after it set the task down or the task
 * closed: the attending's place is never gained by a task ending, so the attending only
 * changes when general sessions open and close.
 */
export function isGeneralFloorSession(record: SessionRecord): boolean {
  return (
    sessionScopeOf(record) === 'project' &&
    record.floor !== undefined &&
    !(record.events ?? []).some((event) => event.event === 'task-named')
  );
}

/**
 * The floor a session would be the attending of, were it the earliest of its
 * kind: the coordinator stands for floor 0, a general floor session for its
 * own floor above 0. Undefined for everything else — a task session, a
 * helper, a floor session working a task, and a general session of floor 0,
 * where the coordinator is the attending and there is no other.
 */
export function attendingFloorOf(record: SessionRecord): number | undefined {
  if (isCoordinator(record)) return 0;
  if (!isGeneralFloorSession(record) || record.floor === 0) return undefined;
  return record.floor;
}

/**
 * Two records' machines may be the same one: equal, or either unrecorded (a
 * record from before design/0038, which is never guessed to be another's).
 */
function sameMachine(a: string | undefined, b: string | undefined): boolean {
  return a === undefined || b === undefined || a === b;
}

/**
 * A floor's attending (design/0089-floor-attending/): the one general session
 * the floor is run from, the first window of its host. Derived, never
 * stored: the earliest-opened OPEN session that could be the floor's
 * ({@link attendingFloorOf}) on `machine` — the coordinator on floor 0. A host
 * is one machine's, so who is the attending is asked per machine: two machines sharing a
 * workspace each run the floor from their own. Ties in the opening instant
 * fall to the lower session number. A continuation (design/0084-session-move/)
 * is judged by its own opening, like any new record, and inherits nothing from
 * the session it continues. Undefined when the floor has none.
 */
export function attendingOf(
  all: readonly OpenSessionListing[],
  floor: number,
  machine: string | undefined,
): OpenSessionListing | undefined {
  const number = (id: string) => Number.parseInt(/-(\d+)(?:@|$)/.exec(id)?.[1] ?? '', 10);
  return all
    .filter(
      ({ record }) =>
        record.state === 'open' &&
        attendingFloorOf(record) === floor &&
        sameMachine(record.machine, machine),
    )
    .sort(
      (a, b) =>
        a.record.openedAt.localeCompare(b.record.openedAt) ||
        (number(a.record.id) || 0) - (number(b.record.id) || 0) ||
        a.record.id.localeCompare(b.record.id),
    )[0];
}

/** Whether the session is its floor's attending, on the machine it ran on. */
export function isAttending(record: SessionRecord, all: readonly OpenSessionListing[]): boolean {
  if (record.state !== 'open') return false;
  const floor = attendingFloorOf(record);
  if (floor === undefined) return false;
  return attendingOf(all, floor, record.machine)?.record.id === record.id;
}
