// The record-reading half of naming (design/0061-host-names-and-titles/):
// which floor a number names, what a session is, and — over everything a host
// holds for this workspace — what each host and window should be called NOW.
// The words themselves are src/agent/labels.ts's; the host (src/host/) is
// handed finished names and never learns where they came from.
//
// Names are derived per call and stored nowhere, exactly as placement is
// (design/0031-detached-session-hosting/): a host created under an older
// naming, a floor whose slug the record now spells differently, a second
// coordinator opened beside the first — each is brought up to date the next
// time anything is placed in, or attached through, the workspace's hosts.
import type { GroupIdentity, GroupNaming, RenameRequest, SessionHost } from '../host/host.ts';
import { readDocument } from '../store/document.ts';
import {
  type HostedKind,
  projectRecordType,
  sessionScopeOf,
  workspaceRecordType,
} from '../store/types.ts';
import { identityOf } from '../workspace/floor-identity.ts';
import { workspaceId } from '../workspace/identity.ts';
import { projectDirs } from '../workspace/scan.ts';
import {
  defaultWorkspaceSessionPurpose,
  type OpenSessionListing,
  parseSessionId,
  readAllSessions,
} from '../workspace/sessions.ts';
import { hostedBy, latestLaunch } from './host.ts';
import {
  distinguish,
  type FloorIdentity,
  foregroundTitle,
  hostName,
  hostTitle,
  type Subject,
  windowLabel,
} from './labels.ts';
import { placementFloor } from './placement.ts';

const PROJECT_DIR = /^projects\/(\d+)-([^/]*)/;
const TASK_DIR = /(?:^|\/)tasks\/t(\d+)-([^/]+)$/;

/** Everything names are built from, read once. */
export interface Naming {
  readonly workspace: string;
  /** What names a floor — its number alone when no project record stands on it. */
  floor(number: number): FloorIdentity;
  /** The name and title of a floor's host. */
  group(number: number): GroupNaming;
  /**
   * What a session's window is called — told apart from any other open hosted
   * session that would read the same in the same host.
   */
  label(listing: OpenSessionListing): string;
  /** The title of a terminal running the session in the foreground. */
  foreground(listing: OpenSessionListing): string;
}

/**
 * Every floor's identity. Its number and slug come from where its record
 * stands — the directory `projects/<N>-<slug>/` carries both, so a floor is
 * named even when its record will not read. Its emoji and color
 * (design/0060-floor-identity/) come from the record, where it holds them: a
 * record that will not read, or carries none, leaves the floor with its
 * number and slug alone — a name is never the reason a launch stops, and
 * neither is a color.
 */
export async function floorIdentities(root: string): Promise<Map<number, FloorIdentity>> {
  const floors = new Map<number, FloorIdentity>();
  for (const dir of projectDirs(root)) {
    const match = PROJECT_DIR.exec(dir);
    if (match?.[1] === undefined) continue;
    const number = Number.parseInt(match[1], 10);
    floors.set(number, { number, slug: match[2] ?? '', ...(await lookOf(root, dir)) });
  }
  return floors;
}

async function lookOf(root: string, dir: string): Promise<Pick<FloorIdentity, 'emoji' | 'color'>> {
  try {
    return identityOf((await readDocument(root, projectRecordType(dir))).data) ?? {};
  } catch {
    return {};
  }
}

/**
 * What a floor's host wears: its color and emoji, and the floor named in full
 * beside them — `f<N> <slug>`, the whole slug, since the status line has the
 * room a host's name does not. Undefined for a floor with no identity.
 */
export function groupIdentity(floor: FloorIdentity): GroupIdentity | undefined {
  if (floor.color === undefined || floor.emoji === undefined) return undefined;
  const label = floor.slug === '' ? `f${floor.number}` : `f${floor.number} ${floor.slug}`;
  return { color: floor.color, emoji: floor.emoji, label };
}

/** What a session is, read from its record and from where the record stands. */
export function subjectOf(
  listing: OpenSessionListing,
  floor: (number: number) => FloorIdentity,
): Subject {
  const { record, scopeDir } = listing;
  switch (sessionScopeOf(record)) {
    case 'workspace': {
      if (record.parent === undefined) return { kind: 'coordinator' };
      // The purpose Ward wrote on the opener's behalf says nothing a name needs.
      const given = record.purpose !== defaultWorkspaceSessionPurpose(record.openedAt);
      return given ? { kind: 'helper', purpose: record.purpose } : { kind: 'helper' };
    }
    case 'project':
      return { kind: 'floor', floor: floor(record.floor ?? 0) };
    case 'task': {
      const task = TASK_DIR.exec(scopeDir);
      const project = PROJECT_DIR.exec(scopeDir);
      return {
        kind: 'task',
        ...(project?.[1] === undefined ? {} : { floor: floor(Number.parseInt(project[1], 10)) }),
        room: Number.parseInt(task?.[1] ?? '0', 10),
        slug: task?.[2] ?? record.task ?? '',
      };
    }
  }
}

export async function readNaming(
  root: string,
  all?: readonly OpenSessionListing[],
): Promise<Naming> {
  const workspace = (await readDocument(root, workspaceRecordType)).data.name;
  const floors = await floorIdentities(root);
  const sessions = all ?? (await readAllSessions(root));
  const floor = (number: number): FloorIdentity => floors.get(number) ?? { number, slug: '' };
  // Told apart among the sessions a host can be showing: open, and hosted.
  const hosted = sessions.filter(
    ({ record }) => record.state === 'open' && hostedBy(record) !== undefined,
  );
  const entries = hosted.map((listing) => {
    const host = placementFloor(listing, sessions);
    return {
      id: listing.record.id,
      host,
      label: windowLabel(subjectOf(listing, floor), host),
      ordinal: parseSessionId(listing.record.id)?.n,
    };
  });
  const told = distinguish(entries);
  const labels = new Map(entries.map((entry, index) => [entry.id, told[index] ?? entry.label]));
  return {
    workspace,
    floor,
    group: (number) => {
      const identity = groupIdentity(floor(number));
      return {
        name: hostName(workspace, floor(number)),
        title: hostTitle(workspace, floor(number)),
        ...(identity === undefined ? {} : { identity }),
      };
    },
    label: (listing) =>
      labels.get(listing.record.id) ??
      windowLabel(subjectOf(listing, floor), placementFloor(listing, sessions)),
    foreground: (listing) => foregroundTitle(subjectOf(listing, floor), workspace),
  };
}

/** What a refresh changed, in words — and what it could not. */
export interface Refreshed {
  /** "ward-main-f7 is now main-f7-ward-development" */
  readonly renamed: readonly string[];
  readonly failed: readonly string[];
  /**
   * The floors whose hosts were dressed in their identity
   * (design/0060-floor-identity/), each with the names dressed: the host,
   * then the attach views of it.
   */
  readonly themed: readonly { readonly floor: number; readonly names: readonly string[] }[];
}

/**
 * Bring every host and window this workspace has in `host` up to its current
 * name and title, in place. A host is taken by its stamps and a window by its
 * verified tags, so only what is this workspace's own is ever renamed; a
 * window that fails verification is a stranger and keeps the name it has.
 * Best-effort by contract: a name is never the reason a launch or an attach
 * does not happen, so this answers with what failed rather than throwing.
 */
export async function refreshNames(
  root: string,
  host: SessionHost,
  workspace: string,
  kind: HostedKind,
  given?: Naming,
): Promise<Refreshed> {
  try {
    const all = await readAllSessions(root);
    const naming = given ?? (await readNaming(root, all));
    const inventory = host.inventory();
    if (inventory.outcome !== 'answered') return { renamed: [], failed: [], themed: [] };
    const groups = inventory.groups
      .filter((group) => group.viewOf === undefined && group.stamp?.workspace === workspace)
      .map((group) => ({
        name: group.name,
        floor: group.stamp?.floor ?? 0,
        naming: naming.group(group.stamp?.floor ?? 0),
      }));
    const ours = new Set(
      inventory.groups.filter((g) => g.stamp?.workspace === workspace).map((g) => g.name),
    );
    const open = new Map(
      all
        .filter(({ record }) => record.state === 'open' && hostedBy(record) === kind)
        .map((listing) => [listing.record.id, listing]),
    );
    const windows: RenameRequest['windows'][number][] = [];
    for (const window of inventory.windows) {
      // The ownership rule, whole: this session's tag, this launch's epoch,
      // standing in a host stamped for this workspace.
      const listing = open.get(window.tags.session);
      if (listing === undefined || latestLaunch(listing.record)?.at !== window.tags.epoch) continue;
      if (!window.groups.some((name) => ours.has(name))) continue;
      windows.push({ window: window.window, label: naming.label(listing) });
    }
    if (groups.length === 0 && windows.length === 0) {
      return { renamed: [], failed: [], themed: [] };
    }
    const result = host.rename({
      groups: groups.map(({ name, naming }) => ({ name, naming })),
      windows,
    });
    // A dressed group answers by the name it wears NOW: the one it was asked
    // by, or the one that rename gave it.
    const now = new Map(result.groups.map(({ from, to }) => [to, from]));
    return {
      renamed: result.groups.map(({ from, to }) => `${from} is now ${to}`),
      failed: result.failed,
      themed: result.themed.flatMap((dressed) => {
        const asked = now.get(dressed.group) ?? dressed.group;
        const floor = groups.find((group) => group.name === asked)?.floor;
        return floor === undefined ? [] : [{ floor, names: [dressed.group, ...dressed.views] }];
      }),
    };
  } catch (error) {
    return {
      renamed: [],
      failed: [error instanceof Error ? error.message : String(error)],
      themed: [],
    };
  }
}

/** What dressing one floor's host in its identity came to. */
export type Dressed =
  /** The names dressed: the floor's host, then each attach view of it. */
  | { readonly outcome: 'themed'; readonly groups: readonly string[] }
  /** No host stands for the floor here — nothing to dress, and never an error. */
  | { readonly outcome: 'absent' }
  | { readonly outcome: 'unknown'; readonly reason: string };

/**
 * Bring this workspace's standing hosts up to what the records say now, and
 * answer for one floor's (design/0060-floor-identity/): what `ward project
 * identity` runs after it writes. The whole workspace is refreshed, not the
 * one host, because a floor's emoji is also in every title and in the window
 * labels other floors' hosts show for its sessions. Nothing is re-created.
 */
export async function dressFloor(
  root: string,
  floor: number,
  host: SessionHost,
  kind: HostedKind,
): Promise<Dressed> {
  if (!host.check().usable) return { outcome: 'absent' };
  let workspace: string;
  try {
    workspace = await workspaceId(root);
  } catch {
    // A workspace with no id has never placed a host.
    return { outcome: 'absent' };
  }
  const inventory = host.inventory();
  if (inventory.outcome !== 'answered') return { outcome: 'unknown', reason: inventory.reason };
  const refreshed = await refreshNames(root, host, workspace, kind);
  const dressed = refreshed.themed.filter((entry) => entry.floor === floor);
  if (dressed.length > 0) {
    return { outcome: 'themed', groups: dressed.flatMap((entry) => entry.names) };
  }
  const stands = inventory.groups.some(
    (group) =>
      group.viewOf === undefined &&
      group.stamp?.workspace === workspace &&
      group.stamp.floor === floor,
  );
  if (!stands) return { outcome: 'absent' };
  return { outcome: 'unknown', reason: refreshed.failed.join('; ') || 'the host was not dressed' };
}
