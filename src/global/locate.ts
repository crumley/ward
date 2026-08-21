// Path resolution across workspaces (design/0024-global-config-registry/):
// answering "where is workspace X?" and "where is repository Y's canonical
// checkout?" from any directory on the machine — the backbone the shell layer
// stands on, since a shell function cannot cd anywhere Ward cannot name.
//
// Everything here reads the registry (a convenience) and then the workspaces
// themselves (the truth): a repository is claimed by the workspace whose
// RECORD registers it (§16 — recorded state over live state), and the answer
// is that record's checkout path.
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { WardError } from '../errors.ts';
import { discoverWorkspace } from '../workspace/layout.ts';
import { checkoutPath, listRepositoryNames } from '../workspace/repos.ts';
import {
  findListing,
  listWorkspaces,
  resolutionOrder,
  samePath,
  viewRegistry,
  type WorkspaceListing,
  workspaceAt,
} from './registry.ts';

/**
 * An empty answer from a registry that would not parse is not "nothing is
 * registered" — saying so would send a human to re-register what is already
 * there. The honest line names the file's state and points at the diagnosis.
 */
const UNREADABLE =
  'the workspace registry could not be read — ward doctor names the file and the reason; ' +
  'it holds conveniences only, so deleting it and re-registering loses nothing';

/** A workspace to search, and how it came to be searched. */
export interface WorkspaceRef {
  readonly name: string;
  readonly path: string;
  /** 'cwd' — the caller is standing in it; the rest come from the registry. */
  readonly source: 'cwd' | 'default' | 'mru' | 'named';
}

export interface RepoLocation {
  /** The name that ANSWERED — which is not the name asked for, after a fuzzy match. */
  readonly repo: string;
  readonly workspace: WorkspaceRef;
  /** Absolute path of the canonical checkout, `repos/<name>/`. */
  readonly path: string;
  /** How the asked-for name reached this one (design/0025-fish-shell-layer/). */
  readonly matched: MatchKind;
}

/** How a typed name found its repository: as itself, or as a unique shorthand for it. */
export type MatchKind = 'exact' | 'prefix' | 'substring';

/**
 * The resolution ladder for a repository name, tried in this order and no
 * other. Exact is case-sensitive and always first, so a name that IS a
 * repository can never be answered by a different one; the two fuzzy rungs
 * are case-insensitive, and each demands a UNIQUE match — `dot` reaches
 * `dotfiles` only while nothing else could have been meant.
 *
 * Prefix before substring is what makes the ladder useful rather than merely
 * lenient: with `dotfiles` and `my-dotfiles` registered, `dot` is a unique
 * prefix of one and a substring of both, and the prefix rung answers it.
 */
const MATCH_LADDER: readonly { readonly kind: MatchKind; readonly hit: Match }[] = [
  { kind: 'exact', hit: (typed, name) => name === typed },
  { kind: 'prefix', hit: (typed, name) => lower(name).startsWith(lower(typed)) },
  { kind: 'substring', hit: (typed, name) => lower(name).includes(lower(typed)) },
];

type Match = (typed: string, name: string) => boolean;

function lower(value: string): string {
  return value.toLowerCase();
}

/**
 * The absolute path of a named workspace — or, with no name, of the one a
 * bare `ward workspace path` means: the default, falling back to the most
 * recently used. Stale entries are refused by name and skipped in the
 * fallback: printing a path that no longer holds a workspace would send the
 * caller's shell somewhere Ward cannot work.
 */
export async function locateWorkspace(target?: string): Promise<WorkspaceListing> {
  const { listings, unreadable } = await viewRegistry();
  if (target === undefined) {
    const best = resolutionOrder(listings)[0];
    if (best !== undefined) return best;
    if (unreadable) throw new WardError(UNREADABLE);
    throw new WardError(
      listings.length === 0
        ? 'no workspaces are registered — register one: ward workspace register [PATH]'
        : 'every registered workspace is stale (no workspace at its path) — ' +
            'see: ward workspace list',
    );
  }
  const found = findListing(target, listings);
  if (found === undefined) {
    if (unreadable) throw new WardError(UNREADABLE);
    const known = listings.map((entry) => entry.name).join(', ');
    throw new WardError(
      `no registered workspace named '${target}'` +
        (known === '' ? ' — none are registered yet' : ` — registered: ${known}`),
    );
  }
  if (found.stale) {
    throw new WardError(
      `'${found.name}' is registered at ${found.path}, but no workspace is there — ` +
        `re-create it, or drop the entry: ward workspace unregister ${found.name}`,
    );
  }
  return found;
}

/**
 * Locate a repository's canonical checkout. With `--workspace`, exactly one
 * workspace is asked. Without it, the search runs in the order a human means:
 * the workspace they are standing in, then the default, then most recently
 * used — first one whose record registers the name wins. Ties cannot arise:
 * the order is total and deterministic (§6).
 *
 * `fuzzy` opens the two shorthand rungs of `MATCH_LADDER`, and is the §8
 * asymmetry applied to a name: a human typing `wrcd dot` means the one
 * repository that could be, while a declared agent — for whom being precise
 * is cheap — resolves names exactly, so that the same call cannot change
 * meaning because an unrelated repository was registered later. The refusal
 * still names what the shorthand WOULD have reached, so an agent corrects in
 * one step rather than guessing (design/0025-fish-shell-layer/).
 */
export async function locateRepo(
  name: string,
  from: string,
  workspaceTarget?: string,
  fuzzy = false,
): Promise<RepoLocation> {
  const order = await searchOrder(from, workspaceTarget);
  // A record that claims the name but has no checkout on disk does not end the
  // search — a later workspace may hold a real one, and answering with a path
  // that is not there would be the wrong kind of honesty. It is remembered,
  // so that if nothing else answers, the report is the drift and its remedy
  // rather than a bare "not found" (§20).
  let claimed: { workspace: WorkspaceRef; path: string; repo: string } | undefined;
  // Rung by rung across the WHOLE search order, never workspace by workspace
  // across the whole ladder: an exact name in the default workspace must beat
  // a shorthand in the one underfoot, or a repository would become
  // unreachable by its own name the day a longer one appeared beside it.
  for (const rung of fuzzy ? MATCH_LADDER : MATCH_LADDER.slice(0, 1)) {
    for (const workspace of order) {
      const matches = listRepositoryNames(workspace.path).filter((known) => rung.hit(name, known));
      const [only] = matches;
      if (only === undefined) continue;
      if (matches.length > 1) {
        throw new WardError(
          `'${name}' matches ${matches.length} repositories in workspace ` +
            `'${workspace.name}': ${matches.join(', ')} — name one exactly`,
        );
      }
      const path = checkoutPath(workspace.path, only);
      if (!existsSync(path)) {
        claimed ??= { workspace, path, repo: only };
        continue;
      }
      return { repo: only, workspace, path, matched: rung.kind };
    }
  }
  if (claimed !== undefined) {
    throw new WardError(
      `'${claimed.repo}' is registered in workspace '${claimed.workspace.name}' but its canonical ` +
        `checkout is missing at ${claimed.path} — re-materialize it: ward workspace restore`,
    );
  }
  if (order.length === 0) {
    throw new WardError(
      `cannot look up repository '${name}': this directory is inside no workspace and none are ` +
        'registered — register one: ward workspace register PATH',
    );
  }
  throw new WardError(
    `no repository named '${name}' is registered in ${describeSearch(order)}${
      fuzzy ? '' : nearMiss(name, order)
    } — see: ward repo list (or register it: ward repo add SOURCE)`,
  );
}

/**
 * What the shorthand rungs would have reached, named in the refusal a caller
 * who does not get them receives. Declining to resolve a shorthand and
 * declining to SAY what it was are different acts: the first keeps an agent's
 * calls deterministic, the second would just make it guess (§20).
 */
function nearMiss(name: string, order: readonly WorkspaceRef[]): string {
  for (const rung of MATCH_LADDER.slice(1)) {
    for (const workspace of order) {
      const matches = listRepositoryNames(workspace.path).filter((known) => rung.hit(name, known));
      const [only] = matches;
      if (only !== undefined && matches.length === 1) {
        return ` (a declared agent resolves names exactly — did you mean '${only}'?)`;
      }
    }
  }
  return '';
}

/** The workspaces a cross-workspace lookup asks, in the order it asks them. */
export async function searchOrder(from: string, workspaceTarget?: string): Promise<WorkspaceRef[]> {
  if (workspaceTarget !== undefined) return [await namedWorkspace(workspaceTarget)];
  const here = discoverWorkspace(resolve(from));
  const listings = resolutionOrder(await listWorkspaces());
  const refs: WorkspaceRef[] = [];
  if (here !== null) {
    const known = listings.find((entry) => samePath(entry.path, here));
    refs.push({ name: known?.name ?? nameOfPath(here), path: here, source: 'cwd' });
  }
  for (const entry of listings) {
    if (refs.some((ref) => samePath(ref.path, entry.path))) continue;
    refs.push({ name: entry.name, path: entry.path, source: entry.isDefault ? 'default' : 'mru' });
  }
  return refs;
}

/**
 * `--workspace` takes a registered name, or the path of any workspace —
 * including one that was never registered, since naming a location explicitly
 * is not a thing the registry needs to have blessed.
 */
async function namedWorkspace(target: string): Promise<WorkspaceRef> {
  const listing = findListing(target, await listWorkspaces());
  if (listing !== undefined && !listing.stale) {
    return { name: listing.name, path: listing.path, source: 'named' };
  }
  // `workspaceAt`, not a bare walk-up: an unknown NAME is not a path, and
  // walking up from a path that does not exist would quietly answer with
  // whatever workspace encloses the caller — an explicit selector resolved by
  // the caller's location is worse than a refusal.
  const root = workspaceAt(target);
  if (root !== null) return { name: nameOfPath(root), path: root, source: 'named' };
  throw new WardError(
    `no registered workspace named '${target}', and no workspace at that path — ` +
      'see: ward workspace list',
  );
}

/** Name every workspace that was asked — an honest miss says where it looked. */
function describeSearch(order: readonly WorkspaceRef[]): string {
  return order.map((ref) => `'${ref.name}' (${ref.path})`).join(', ');
}

function nameOfPath(path: string): string {
  return path.split('/').filter(Boolean).pop() ?? path;
}
