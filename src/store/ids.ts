// Identity allocation (domain-model, Identity). Pure functions — memorable codes
// sized to real cardinality, not entropy. Floors are `1,2,3…`; a room code is
// its floor number plus a per-floor room part (`1A1`); a session id is unique
// among OPEN sessions workspace-wide, so a bare id addresses it everywhere.
//
// Room codes and session ids are REUSED once freed/closed (a room is a reusable
// resource; open-session uniqueness is only among the currently open) — so
// allocation always picks the smallest currently-free code.

/** A meaningful, filesystem-safe slug from human text. */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Next floor number — a simple ascending sequence starting at 1. */
export function nextFloor(existingFloors: readonly number[]): number {
  return (existingFloors.length === 0 ? 0 : Math.max(...existingFloors)) + 1;
}

/**
 * Smallest free room code on a floor (`<floor>A<n>`), given the codes currently
 * occupied there. Reuses a code freed by a closed room (rooms are reusable slots).
 */
export function nextRoomCode(floor: number, occupiedCodes: readonly string[]): string {
  const used = new Set(occupiedCodes);
  let n = 1;
  while (used.has(`${floor}A${n}`)) n += 1;
  return `${floor}A${n}`;
}

/**
 * Allocate an id unique among the `taken` set: `base`, else `base-1`, `base-2`, …
 * Used for session ids (unique among OPEN sessions workspace-wide) so a bare id
 * is a sufficient address without a `(scope, id)` pair.
 */
export function allocateId(base: string, taken: ReadonlySet<string>): string {
  if (!taken.has(base)) {
    return base;
  }
  let n = 1;
  while (taken.has(`${base}-${n}`)) {
    n += 1;
  }
  return `${base}-${n}`;
}
