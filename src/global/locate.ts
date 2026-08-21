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
  readonly repo: string;
  readonly workspace: WorkspaceRef;
  /** Absolute path of the canonical checkout, `repos/<name>/`. */
  readonly path: string;
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
 */
export async function locateRepo(
  name: string,
  from: string,
  workspaceTarget?: string,
): Promise<RepoLocation> {
  const order = await searchOrder(from, workspaceTarget);
  // A record that claims the name but has no checkout on disk does not end the
  // search — a later workspace may hold a real one, and answering with a path
  // that is not there would be the wrong kind of honesty. It is remembered,
  // so that if nothing else answers, the report is the drift and its remedy
  // rather than a bare "not found" (§20).
  let claimed: { workspace: WorkspaceRef; path: string } | undefined;
  for (const workspace of order) {
    if (!listRepositoryNames(workspace.path).includes(name)) continue;
    const path = checkoutPath(workspace.path, name);
    if (!existsSync(path)) {
      claimed ??= { workspace, path };
      continue;
    }
    return { repo: name, workspace, path };
  }
  if (claimed !== undefined) {
    throw new WardError(
      `'${name}' is registered in workspace '${claimed.workspace.name}' but its canonical ` +
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
    `no repository named '${name}' is registered in ${describeSearch(order)} — ` +
      'see: ward repo list (or register it: ward repo add SOURCE)',
  );
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
