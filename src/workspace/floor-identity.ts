// A floor's visual identity (design/0060-floor-identity/;
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
  isFloorColor,
  isSingleEmoji,
  PALETTE,
} from '../theme/palette.ts';
import { type FoundProject, readProjects, resolveProject } from './projects.ts';
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
 * Pick what is missing from an identity, clear of what is `taken`:
 *
 * - the color worn by the fewest floors, the palette's order breaking ties —
 *   so the first ten open floors are all distinct, and an eleventh shares
 *   with exactly one rather than piling onto the first color;
 * - the emoji that goes with that color, unless a floor already wears it —
 *   then the first palette emoji no floor wears, and the color's own when
 *   every one is taken.
 *
 * A half the caller already holds is kept as it is.
 */
export function assignIdentity(
  taken: readonly Partial<FloorLook>[],
  held: Partial<FloorLook> = {},
): FloorLook {
  const color = held.color ?? leastWorn(taken);
  if (held.emoji !== undefined) return { color, emoji: held.emoji };
  const emojis = new Set(taken.map((identity) => identity.emoji));
  const partner = PALETTE[color].emoji;
  const free = FLOOR_COLORS.map((name) => PALETTE[name].emoji).find((e) => !emojis.has(e));
  return { color, emoji: emojis.has(partner) ? (free ?? partner) : partner };
}

function leastWorn(taken: readonly Partial<FloorLook>[]): FloorColor {
  const count = (color: FloorColor) => taken.filter((t) => t.color === color).length;
  return FLOOR_COLORS.reduce((best, color) => (count(color) < count(best) ? color : best));
}

/** Refuse a color the palette does not hold, naming the ones it does. */
export function requireFloorColor(value: string): FloorColor {
  if (isFloorColor(value)) return value;
  throw new WardError(
    `'${value}' is not a floor color — choose one of: ${FLOOR_COLORS.join(', ')}`,
  );
}

export function requireEmoji(value: string): string {
  if (isSingleEmoji(value)) return value;
  throw new WardError(`'${value}' is not one emoji — a floor wears exactly one`);
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
 */
export async function setFloorIdentity(
  root: string,
  floor: number,
  change: IdentityChange = {},
): Promise<IdentityReport> {
  const asked: Partial<FloorLook> = {
    ...(change.color === undefined ? {} : { color: requireFloorColor(change.color) }),
    ...(change.emoji === undefined ? {} : { emoji: requireEmoji(change.emoji) }),
  };
  return withStoreLock(root, `project identity ${floor}`, async () => {
    const project = await resolveProject(root, floor);
    if (project.record.state === 'closed') {
      throw new WardError(
        `floor ${floor} is closed — it has no host to wear an identity; see: ward project list`,
      );
    }
    const projects = await readProjects(root);
    const identity = assignIdentity(worn(projects, floor), {
      ...halves(project.record),
      ...asked,
    });
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

/**
 * Give every open floor that lacks one its identity, in floor order — the
 * backfill `ward workspace upgrade` runs, and what gives a freshly created
 * ground floor its own. Each pick stays clear of what the other open floors
 * wear, the ones this run has just written included. Returns the floors
 * written; the caller holds the store lock and commits.
 */
export async function backfillIdentities(root: string): Promise<FoundProject[]> {
  const open = (await readProjects(root))
    .filter(({ record }) => record.state !== 'closed')
    .sort((a, b) => a.record.floor - b.record.floor);
  const written: FoundProject[] = [];
  for (const [index, project] of open.entries()) {
    if (identityOf(project.record) !== undefined) continue;
    const identity = assignIdentity(worn(open, project.record.floor), halves(project.record));
    const found = { dir: project.dir, record: await writeIdentity(root, project, identity) };
    open[index] = found;
    written.push(found);
  }
  return written;
}

/** The halves of an identity a record holds, which may be neither or one. */
function halves(record: ProjectRecord): Partial<FloorLook> {
  return {
    ...(record.color === undefined ? {} : { color: record.color }),
    ...(record.emoji === undefined ? {} : { emoji: record.emoji }),
  };
}
