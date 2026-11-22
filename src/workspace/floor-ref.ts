// Floor references (design/0088-floor-by-slug/): wherever a verb takes a
// floor, the caller may name it by its number or by its exact slug. A number
// is stable only until a reorganization renumbers floors; a slug is what a
// skill or script means when it names "the brain3 floor", so both are taken,
// in one parser, and every verb still receives a number.
//
// The rule is deliberately small: a value that is all digits IS a number,
// whatever floor wears a numeric-looking slug, so every caller that passed a
// number before reads exactly as it did; anything else is a slug matched
// exactly (slugs are lowercase, so the match ignores case, as address spelling
// does) against every floor the record holds, open or closed. A renamed
// floor's old slug names nothing: there are no aliases, and a refusal that
// says so is better than a reference that silently follows a stale name.
import { WardError } from '../errors.ts';
import { type FoundProject, readProjects } from './projects.ts';

/** A floor named by its slug, awaiting resolution against the record. */
export class FloorSlug {
  readonly slug: string;
  constructor(slug: string) {
    this.slug = slug;
  }
}

/** What a floor argument parses to: a number as given, or a slug to resolve. */
export type FloorArg = number | FloorSlug;

const DIGITS = /^\d+$/;
const SLUG_SHAPE = /^[a-z0-9][a-z0-9-]*$/i;

/**
 * Parse a floor argument, or say why it is not one. Digits are a number;
 * anything slug-shaped is a slug, lowercased; anything else is neither.
 */
export function parseFloorArg(input: string): FloorArg | { readonly error: string } {
  if (DIGITS.test(input)) return Number.parseInt(input, 10);
  if (SLUG_SHAPE.test(input)) return new FloorSlug(input.toLowerCase());
  return { error: `'${input}' is neither a floor number nor a floor slug` };
}

/** The floor a reference names: a number passes through; a slug is looked up. */
export async function resolveFloorArg(root: string, arg: FloorArg): Promise<number> {
  if (typeof arg === 'number') return arg;
  return floorBySlug(await readProjects(root), arg.slug);
}

/**
 * The one floor wearing `slug`, from `projects`. Refuses a slug no floor
 * wears, offering the near ones, and a slug two floors share (an open floor
 * and a closed one, or two machines' collision), naming each by its number —
 * the number is then the way to say which.
 */
export function floorBySlug(projects: readonly FoundProject[], slug: string): number {
  const wanted = slug.toLowerCase();
  const matches = projects.filter((project) => project.record.slug === wanted);
  const [only, ...others] = matches;
  if (only !== undefined && others.length === 0) return only.record.floor;
  if (only !== undefined) {
    const each = matches
      .map((project) => `floor ${project.record.floor} (${project.record.state})`)
      .join(', ');
    throw new WardError(
      `floor slug '${slug}' is worn by ${matches.length} floors — ${each}; name the floor by its number`,
    );
  }
  const near = nearSlugs(projects, wanted);
  const offer =
    near.length === 0
      ? ''
      : ` — did you mean ${near.map((p) => `${p.record.slug} (floor ${p.record.floor})`).join(', ')}?`;
  throw new WardError(`no floor wears the slug '${slug}'${offer} (see: ward project list)`);
}

/**
 * Floors whose slug is close to `wanted`: one contains the other, or they are
 * a couple of edits apart. Open floors first, as they are what is usually
 * meant; at most three, so the refusal stays one line.
 */
function nearSlugs(projects: readonly FoundProject[], wanted: string): FoundProject[] {
  return projects
    .filter((project) => {
      const slug = project.record.slug;
      return slug.includes(wanted) || wanted.includes(slug) || editDistance(slug, wanted) <= 2;
    })
    .sort((a, b) => Number(a.record.state === 'closed') - Number(b.record.state === 'closed'))
    .slice(0, 3);
}

function editDistance(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current.push(
        Math.min((previous[j] ?? 0) + 1, (current[j - 1] ?? 0) + 1, (previous[j - 1] ?? 0) + cost),
      );
    }
    previous = current;
  }
  return previous[b.length] ?? 0;
}

/** Every field of a parse result with its floor references resolved to numbers. */
export type FloorsResolved<T> = { [K in keyof T]: Exclude<T[K], FloorSlug> };

/**
 * Resolve every floor reference among a parse result's own fields, reading
 * the record only when one is a slug — so a command line that names floors by
 * number costs nothing it did not cost before. `root` is asked for lazily,
 * because finding the workspace may itself refuse (no workspace, or one that
 * needs a newer Ward), and that refusal belongs to the verb, not to a number.
 */
export async function resolveFloorArgs<T extends object>(
  result: T,
  root: () => Promise<string>,
): Promise<FloorsResolved<T>> {
  const slugged = Object.entries(result).filter(([, value]) => value instanceof FloorSlug);
  if (slugged.length === 0) return result as FloorsResolved<T>;
  const projects = await readProjects(await root());
  const resolved: Record<string, unknown> = { ...(result as Record<string, unknown>) };
  for (const [key, value] of slugged)
    resolved[key] = floorBySlug(projects, (value as FloorSlug).slug);
  return resolved as FloorsResolved<T>;
}
