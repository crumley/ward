// A floor's visual identity (design/0060-floor-identity/,
// design/0064-floor-identity-palette/;
// intent/02-subsystems/05-visual-theming.md): the color and emoji its record
// carries, how Ward picks them, and the one verb that changes them.
//
// The identity is RECORDED, not computed from the floor number: a recorded
// pick can avoid what the other open floors already wear, which no function
// of the number alone can do with a palette small enough to tell apart at a
// glance, and it stays put when floors open and close around it. Assignment
// is deterministic all the same — the same floors in the same order are
// given the same identities — so a backfill and a fresh open agree.
import { WardError } from '../errors.ts';
import { readDocument, writeDocument } from '../store/document.ts';
import { withStoreLock } from '../store/lock.ts';
import { type ProjectRecord, projectRecordType } from '../store/types.ts';
import {
  FLOOR_COLORS,
  type FloorColor,
  GROUND_IDENTITY,
  isFloorColor,
  isPlainEmoji,
  isSingleEmoji,
  PALETTE,
  POOL_COLORS,
  POOL_EMOJI,
} from '../theme/palette.ts';
import { type FoundProject, GROUND_FLOOR, readProjects, resolveProject } from './projects.ts';
import { commitRecords } from './scan.ts';

export interface FloorLook {
  readonly color: FloorColor;
  readonly emoji: string;
}

/** The identity a record carries — undefined until it carries both halves. */
export function identityOf(record: ProjectRecord): FloorLook | undefined {
  if (record.color === undefined || record.emoji === undefined) return undefined;
  return { color: record.color, emoji: record.emoji };
}

/**
 * Whose identities a new pick must stay clear of: every floor that is not
 * closed. A closed floor has no host and drops off the listings, so its color
 * is free again — collisions matter only among what a human sees together.
 */
export function worn(projects: readonly FoundProject[], except?: number): Partial<FloorLook>[] {
  return projects
    .filter(({ record }) => record.state !== 'closed' && record.floor !== except)
    .map(({ record }) => halves(record));
}

/**
 * Pick what is missing from an ordinary floor's identity, clear of what is
 * `taken`:
 *
 * - the pool color worn by the fewest floors, the palette's order breaking
 *   ties — so the first ten floors are all distinct, and an eleventh shares
 *   with exactly one rather than piling onto the first color;
 * - an emoji NO floor wears: the first free one of that color's own row, so
 *   two floors of one color differ by a glyph chosen to differ, then the
 *   first free one of the whole pool.
 *
 * Only when every pool emoji is worn (forty floors) does one repeat, and then
 * it is the least-worn one that no floor of the same color wears: a floor is
 * never handed both the color and the emoji of another while a pair is left.
 *
 * A half the caller already holds is kept as it is. The ground floor is not
 * assigned here: it wears {@link GROUND_IDENTITY}.
 */
export function assignIdentity(
  taken: readonly Partial<FloorLook>[],
  held: Partial<FloorLook> = {},
): FloorLook {
  const color = held.color ?? leastWorn(taken);
  return { color, emoji: held.emoji ?? pickEmoji(color, taken) };
}

function leastWorn(taken: readonly Partial<FloorLook>[]): FloorColor {
  const count = (color: FloorColor) => taken.filter((t) => t.color === color).length;
  return POOL_COLORS.reduce((best, color) => (count(color) < count(best) ? color : best));
}

function pickEmoji(color: FloorColor, taken: readonly Partial<FloorLook>[]): string {
  // A color's own row first, then the pool. The ground floor's row is its
  // one emoji, which is nobody else's to take.
  const own = color === GROUND_IDENTITY.color ? [] : PALETTE[color].emojis;
  const candidates = [...new Set([...own, ...POOL_EMOJI])];
  const count = (emoji: string) => taken.filter((t) => t.emoji === emoji).length;
  const free = candidates.find((emoji) => count(emoji) === 0);
  if (free !== undefined) return free;
  const beside = new Set(taken.filter((t) => t.color === color).map((t) => t.emoji));
  const apart = candidates.filter((emoji) => !beside.has(emoji));
  return (apart.length > 0 ? apart : candidates).reduce((best, emoji) =>
    count(emoji) < count(best) ? emoji : best,
  );
}

/** Refuse a color the palette does not hold, naming the ones it does. */
export function requireFloorColor(value: string): FloorColor {
  if (isFloorColor(value)) return value;
  throw new WardError(
    `'${value}' is not a floor color — choose one of: ${FLOOR_COLORS.join(', ')}`,
  );
}

/**
 * Refuse what is not one emoji, and an emoji a status line cannot measure
 * (design/0064-floor-identity-palette/). Any emoji that is a single code
 * point drawn as an emoji by itself is accepted — the choice is the
 * opener's, not a list's.
 */
export function requireEmoji(value: string): string {
  if (!isSingleEmoji(value)) {
    throw new WardError(`'${value}' is not one emoji — a floor wears exactly one`);
  }
  if (isPlainEmoji(value)) return value;
  throw new WardError(
    `${value} is not an emoji every terminal draws two cells wide — it needs a variation ` +
      'selector, or is a joined sequence or a skin tone — and a status line is measured in ' +
      'cells; choose a single code point that is drawn as an emoji by itself, like 🏈 or 🚀',
  );
}

/** What a caller named for a floor, checked: a palette color, a plain emoji. */
export function requireAsked(change: IdentityChange): Partial<FloorLook> {
  return {
    ...(change.color === undefined ? {} : { color: requireFloorColor(change.color) }),
    ...(change.emoji === undefined ? {} : { emoji: requireEmoji(change.emoji) }),
  };
}

/**
 * The identity a floor being opened takes (design/0064-floor-identity-palette/):
 * what the opener named — an emoji that fits what the floor is about is
 * theirs to choose — and Ward's pick for whatever they did not. An opened
 * floor is never the ground floor, so the ground floor's color and emoji are
 * refused, and so is an emoji another open floor wears: the caller can name
 * another, and an emoji is what tells two floors apart.
 */
export function identityAtOpen(
  projects: readonly FoundProject[],
  asked: Partial<FloorLook>,
): FloorLook {
  requireOrdinary(asked);
  requireUnworn(projects, undefined, asked.emoji);
  return assignIdentity(worn(projects), asked);
}

export interface IdentityChange {
  readonly color?: string;
  readonly emoji?: string;
}

export interface IdentityReport {
  readonly project: ProjectRecord;
  readonly identity: FloorLook;
  /** `changed` — the record was rewritten; `satisfied` — it already said this. */
  readonly outcome: 'changed' | 'satisfied';
  /** The other open floors wearing the same color — allowed, and never silent. */
  readonly sharedColorWith: readonly number[];
}

/**
 * `ward project identity FLOOR [--color NAME] [--emoji EMOJI]`: give a floor
 * the color or emoji named, and make its identity whole. A half not named is
 * kept; a half the record lacks (a floor from before identities, not yet
 * upgraded) is assigned as an open would assign it. A color another open
 * floor already wears is the human's to choose — it is recorded, and the
 * report names who it is shared with. A closed floor is refused: it has no
 * host to wear an identity and is on no listing that would show one.
 *
 * Three things are refused (design/0064-floor-identity-palette/), each
 * because the emoji is the cue that must tell floors apart where the color
 * cannot: any identity for the ground floor but its own, the ground floor's
 * color or emoji on another floor, and an emoji another open floor wears —
 * any single emoji is accepted, so there is always another to choose.
 */
export async function setFloorIdentity(
  root: string,
  floor: number,
  change: IdentityChange = {},
): Promise<IdentityReport> {
  const asked = requireAsked(change);
  requireOwnIdentity(floor, asked);
  return withStoreLock(root, `project identity ${floor}`, async () => {
    const project = await resolveProject(root, floor);
    if (project.record.state === 'closed') {
      throw new WardError(
        `floor ${floor} is closed — it has no host to wear an identity; see: ward project list`,
      );
    }
    const projects = await readProjects(root);
    requireUnworn(projects, floor, asked.emoji);
    const identity =
      floor === GROUND_FLOOR
        ? { ...GROUND_IDENTITY }
        : assignIdentity(worn(projects, floor), { ...halves(project.record), ...asked });
    const sharedColorWith = projects
      .filter(
        ({ record }) =>
          record.state !== 'closed' && record.floor !== floor && record.color === identity.color,
      )
      .map(({ record }) => record.floor);
    if (project.record.color === identity.color && project.record.emoji === identity.emoji) {
      return { project: project.record, identity, outcome: 'satisfied', sharedColorWith };
    }
    const record = await writeIdentity(root, project, identity);
    commitRecords(
      root,
      `Identify floor ${floor} as ${identity.emoji} ${identity.color}`,
      project.dir,
    );
    return { project: record, identity, outcome: 'changed', sharedColorWith };
  });
}

/**
 * The ground floor wears its own identity and nothing else, and nothing else
 * wears any of it — checked before the store is read, so a refusal names the
 * rule rather than a floor that happens to stand in the way.
 */
function requireOwnIdentity(floor: number, asked: Partial<FloorLook>): void {
  const wears = `${GROUND_IDENTITY.emoji} ${GROUND_IDENTITY.color}`;
  if (floor === GROUND_FLOOR) {
    const other =
      (asked.color !== undefined && asked.color !== GROUND_IDENTITY.color) ||
      (asked.emoji !== undefined && asked.emoji !== GROUND_IDENTITY.emoji);
    if (!other) return;
    throw new WardError(
      `floor ${GROUND_FLOOR} is the ground floor — it wears ${wears} in every workspace, ` +
        'so it is the same floor wherever it is met; its identity is not changed',
    );
  }
  requireOrdinary(asked);
}

/** Neither half of the ground floor's identity is another floor's to wear. */
function requireOrdinary(asked: Partial<FloorLook>): void {
  if (asked.color !== GROUND_IDENTITY.color && asked.emoji !== GROUND_IDENTITY.emoji) return;
  const half = asked.color === GROUND_IDENTITY.color ? asked.color : asked.emoji;
  throw new WardError(
    `${half} is the ground floor's — floor ${GROUND_FLOOR} wears ` +
      `${GROUND_IDENTITY.emoji} ${GROUND_IDENTITY.color} in every workspace, and no other ` +
      'floor wears either',
  );
}

/** Refuse an emoji another open floor wears, naming the floor that wears it. */
function requireUnworn(
  projects: readonly FoundProject[],
  floor: number | undefined,
  emoji: string | undefined,
): void {
  if (emoji === undefined) return;
  const wearer = projects.find(
    ({ record }) => record.state !== 'closed' && record.floor !== floor && record.emoji === emoji,
  );
  if (wearer === undefined) return;
  throw new WardError(
    `${emoji} is worn by floor ${wearer.record.floor} — ${wearer.record.slug}; an emoji is ` +
      'what tells two floors apart, so choose one no open floor wears',
  );
}

/**
 * Write an identity onto a floor's record, body untouched. The caller holds
 * the store lock and commits.
 */
async function writeIdentity(
  root: string,
  project: FoundProject,
  identity: FloorLook,
): Promise<ProjectRecord> {
  const type = projectRecordType(project.dir);
  const existing = await readDocument(root, type);
  const record: ProjectRecord = { ...existing.data, ...identity };
  await writeDocument(root, type, { data: record, body: existing.body });
  return record;
}

/** One identity convergence wrote, and why. */
export interface IdentityConvergence {
  readonly project: FoundProject;
  /**
   * `assigned` — the floor lacked a half; `reserved` — the ground floor moved
   * to its own identity; `distinct` — its emoji was a lower floor's.
   */
  readonly reason: 'assigned' | 'reserved' | 'distinct';
  /** What the record held before, which may be neither half. */
  readonly was: Partial<FloorLook>;
  /** The lower floor whose emoji it repeated — present exactly when `distinct`. */
  readonly repeated?: number;
}

/**
 * Bring every open floor's identity to what Ward now holds true, in floor
 * order — the step `ward workspace upgrade` runs, and what gives a freshly
 * created ground floor its own (design/0060-floor-identity/,
 * design/0064-floor-identity-palette/):
 *
 * - the ground floor wears {@link GROUND_IDENTITY}, whatever it wore;
 * - a floor lacking a half is given it;
 * - a floor whose emoji a LOWER open floor wears is given another, its color
 *   kept — the lower floor keeps what it has, having had it first.
 *
 * Each pick stays clear of what every other open floor wears, the ones this
 * run has just written included and the higher floors not yet reached, so an
 * identity that is already distinct is never touched and never becomes a
 * duplicate by this run's doing. Returns what was written; the caller holds
 * the store lock and commits.
 */
export async function convergeIdentities(root: string): Promise<IdentityConvergence[]> {
  const open = (await readProjects(root))
    .filter(({ record }) => record.state !== 'closed')
    .sort((a, b) => a.record.floor - b.record.floor);
  const written: IdentityConvergence[] = [];
  for (const [index, project] of open.entries()) {
    const { record } = project;
    const was = halves(record);
    const first = open.slice(0, index).find((lower) => lower.record.emoji === was.emoji);
    const repeated = was.emoji === undefined ? undefined : first?.record.floor;
    const reason =
      record.floor === GROUND_FLOOR
        ? 'reserved'
        : identityOf(record) === undefined
          ? 'assigned'
          : 'distinct';
    const identity =
      record.floor === GROUND_FLOOR
        ? { ...GROUND_IDENTITY }
        : assignIdentity(
            worn(open, record.floor),
            repeated === undefined
              ? was
              : { ...(was.color === undefined ? {} : { color: was.color }) },
          );
    if (was.color === identity.color && was.emoji === identity.emoji) continue;
    const found = { dir: project.dir, record: await writeIdentity(root, project, identity) };
    open[index] = found;
    written.push({
      project: found,
      // A ground floor with nothing recorded is simply being given its own.
      reason: reason === 'reserved' && identityOf(record) === undefined ? 'assigned' : reason,
      was,
      ...(reason === 'distinct' && repeated !== undefined ? { repeated } : {}),
    });
  }
  return written;
}

/** What `ward doctor` finds among the open floors' identities, never changed by the finding. */
export type IdentityClash =
  /** Two or more open floors wear one emoji — lowest floor first, the one that keeps it. */
  | { readonly kind: 'shared'; readonly emoji: string; readonly floors: readonly FoundProject[] }
  /** A floor other than the ground floor wears a half of the ground floor's identity. */
  | {
      readonly kind: 'reserved';
      readonly floor: FoundProject;
      readonly halves: readonly ('emoji' | 'color')[];
    };

/**
 * The identities among the open floors that the verbs would have refused: an
 * emoji two open floors both wear, and the ground floor's emoji or color on
 * any other floor. The verbs refuse both, so the records reach this state
 * only from outside one machine's view — two machines that each opened a
 * floor before their records synced each picked clear of what they could see
 * — or from a record written before the rule. Read-only: convergence
 * ({@link convergeIdentities}) and `ward project identity` are what change
 * it. A floor wearing the ground floor's emoji is reported once, as
 * `reserved`, never also as `shared` with the ground floor.
 */
export function identityClashes(projects: readonly FoundProject[]): IdentityClash[] {
  const open = projects
    .filter(({ record }) => record.state !== 'closed')
    .sort((a, b) => a.record.floor - b.record.floor);
  const clashes: IdentityClash[] = [];
  const wearers = new Map<string, FoundProject[]>();
  for (const project of open) {
    const { floor, emoji, color } = project.record;
    if (floor !== GROUND_FLOOR) {
      const halves = [
        ...(emoji === GROUND_IDENTITY.emoji ? (['emoji'] as const) : []),
        ...(color === GROUND_IDENTITY.color ? (['color'] as const) : []),
      ];
      if (halves.length > 0) clashes.push({ kind: 'reserved', floor: project, halves });
    }
    if (emoji === undefined || emoji === GROUND_IDENTITY.emoji) continue;
    wearers.set(emoji, [...(wearers.get(emoji) ?? []), project]);
  }
  for (const [emoji, floors] of wearers) {
    if (floors.length > 1) clashes.push({ kind: 'shared', emoji, floors });
  }
  return clashes;
}

/** The halves of an identity a record holds, which may be neither or one. */
function halves(record: ProjectRecord): Partial<FloorLook> {
  return {
    ...(record.color === undefined ? {} : { color: record.color }),
    ...(record.emoji === undefined ? {} : { emoji: record.emoji }),
  };
}
