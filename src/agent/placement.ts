// Placement (design/0031-detached-session-hosting/): which floor's host a
// session's window belongs in, and whether it floats — both pure functions of
// records, recomputed on every launch and never stored. Placement reads facts
// that do not change over a session's life (its scope, its task's floor, its
// recorded parent), so a re-created window lands where the first one did, and
// a reboot reassembles every floor exactly as it stood without anything
// having remembered a window.
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
 * The floor whose host the session's window goes in: its recorded parent's
 * placement floor when that parent's record exists here and is not floor 0 —
 * so a session a floor-3 coordinator starts lands beside it — and otherwise
 * its own. A floor-0 parent never pulls a child onto floor 0: work started for
 * floor 5 belongs where floor 5 is tended. Bounded by the parent chain, with a
 * guard against a chain that loops (only a hand-edited record makes one): the
 * walk stops at the first session it has already seen.
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
 * Whether the session's window floats — is linked into every floor host. Only
 * the coordinator does: a workspace-scope session no other session started.
 * Its helpers, a ground-floor task session, and floor 0's own session sit in
 * the floor-0 host alone.
 */
export function floats(record: SessionRecord): boolean {
  return sessionScopeOf(record) === 'workspace' && record.parent === undefined;
}
