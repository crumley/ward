// The candidate feeds the emitted shell layer calls back into
// (design/0025-fish-shell-layer/): the sets a human picks a noun from when
// they did not type one. Same shape as a completion candidate — a name and
// the cue that makes it recognizable — because they answer the same question
// from the same records, one at the shell's completion surface and one inside
// a picker.
//
// These are read by MACHINERY, not by a caller: `ward shell candidates KIND`
// fires on every TAB and on every picker entry, exactly like a completion
// callback, and inherits that path's contracts — it never throws, it never
// writes telemetry, and it never churns the registry's recency
// (intent/02-subsystems/07-human-shell.md, and 0022's IF-002).
import { resolve } from 'node:path';
import { classify, hostedBy, hostOf } from '../agent/host.ts';
import { isCoordinator } from '../agent/placement.ts';
import { searchOrder } from '../global/locate.ts';
import { readMachine } from '../global/machine.ts';
import { listWorkspaces, resolutionOrder } from '../global/registry.ts';
import type { SessionHost } from '../host/host.ts';
import { formatReadable } from '../store/format.ts';
import { type HostedKind, type SessionRecord, sessionScopeOf } from '../store/types.ts';
import { workspaceId } from '../workspace/identity.ts';
import { discoverWorkspace } from '../workspace/layout.ts';
import { listRepositoryNames } from '../workspace/repos.ts';
import { parseSessionId, readOpenSessions } from '../workspace/sessions.ts';

/** One thing a human might mean, plus what makes it recognizable as that thing. */
export interface Candidate {
  readonly name: string;
  /** Shown beside the name — the workspace that would answer, or its path. */
  readonly cue: string;
}

/** The candidate sets the shell layer knows how to ask for. */
export const CANDIDATE_KINDS = ['repos', 'workspaces', 'coordinators'] as const;
export type CandidateKind = (typeof CANDIDATE_KINDS)[number];

/**
 * The feed, under the never-throw contract 0022 wrote for completion
 * callbacks and for the same reason: this runs inside the human's shell,
 * on a TAB or as a picker opens, where an exception is the most expensive
 * thing a program can emit. A failure degrades to no candidates — §20's
 * named lesser answer, which the emitted script then names out loud
 * ("nothing to pick from") — and `ward doctor` is where a broken registry is
 * explained, not here.
 */
export async function candidates(
  kind: CandidateKind,
  from: string,
  floor?: number,
  host?: (kind: HostedKind) => SessionHost,
): Promise<readonly Candidate[]> {
  try {
    switch (kind) {
      case 'repos':
        return await repoCandidates(from);
      case 'workspaces':
        return await workspaceCandidates();
      case 'coordinators':
        return await coordinatorCandidates(from, floor, host);
    }
  } catch {
    return [];
  }
}

/**
 * Every repository name `ward repo path` could resolve from here — the union
 * across the workspaces it would search (current → default → most recently
 * used), deduplicated in that order, cued by the workspace that would answer.
 *
 * The union, not the current workspace's listing: `wrcd` exists to cross
 * workspaces, and offering only what is underfoot would hide exactly the
 * lookups it is for. The search order, not every registered workspace: a name
 * the search never reaches is a candidate the verb would then refuse.
 */
export async function repoCandidates(from: string): Promise<readonly Candidate[]> {
  const found = new Map<string, string>();
  for (const workspace of await searchOrder(from)) {
    // A workspace that needs a newer Ward offers nothing
    // (design/0066-workspace-format-guard/): `repo path` would refuse it.
    if (!formatReadable(workspace.path)) continue;
    for (const name of listRepositoryNames(workspace.path)) {
      if (!found.has(name)) found.set(name, workspace.name);
    }
  }
  return [...found].map(([name, cue]) => ({ name, cue }));
}

/**
 * The registered workspaces a caller could cd into, most recently used first
 * — `ward workspace list`'s own order, which is the order a human thinks in
 * when switching back to what they were doing.
 *
 * Stale entries are dropped, which is where this differs from the completion
 * suggester for `workspace unregister|default` (`src/cli/suggest.ts`): that
 * verb acts ON the entry and a stale one is its best candidate, while this
 * one ends in a `cd` and a path that holds no workspace is somewhere Ward
 * cannot work (§17 — an offer that cannot be honored is worse than none).
 */
export async function workspaceCandidates(): Promise<readonly Candidate[]> {
  return (await listWorkspaces())
    .filter((entry) => !entry.stale)
    .map((entry) => ({ name: entry.name, cue: entry.path }));
}

/**
 * The open coordinators a human could join from this machine — the sessions
 * `wsa` attaches to when it is given no id, or a floor number
 * (design/0059-session-shorthands/), cued by their purpose.
 *
 * With no floor, the workspace's coordinator. With one, that floor's own
 * sessions — floor scope, responsible for the floor's outcome — whoever
 * started them: a floor session is most often opened by the workspace's
 * coordinator, so a parent does not make it a helper the way it does at
 * workspace scope.
 *
 * The workspace is the one a human-run session verb would act on: the one
 * underfoot, else the registry's best answer — `requireWorkspace`'s ladder
 * for a human caller, so what is offered here is what `ward session attach`
 * will then find. A coordinator (`isCoordinator`) is a workspace-scope
 * session started by no other session; its window stands in the ground
 * floor's host (design/0086-coordinator-stays-home/), and attach reaches it
 * from anywhere — from inside another floor's host too, by switching the
 * terminal there. Its helpers are not offered — joining the workspace is
 * joining the session responsible for it, not the last thing it delegated.
 *
 * This machine only, plus records that predate the machine field: a session
 * whose history is on another computer is one `attach` cannot re-create here,
 * and offering it would make `wsa` after a reboot pick something it then
 * refuses (§17).
 *
 * The coordinators come oldest first, the order they were opened in, and
 * `wsa` asks the human to pick between several. A floor's sessions come in
 * the order `wsa N` takes them, because it takes the first and never asks
 * (design/0079-wsa-floor-first-window/): every one of them stands in the same
 * floor host, so a pick would only choose which window is in front. First the
 * ones whose window stands in the floor's host, live or kept dead, left to
 * right as the host shows them; then the rest, lowest session number first —
 * the deterministic answer after a reboot, when no window stands and `attach`
 * re-creates whichever is named. A host that cannot be asked leaves every
 * session in the second group: the feed still answers.
 */
export async function coordinatorCandidates(
  from: string,
  floor?: number,
  host: (kind: HostedKind) => SessionHost = (kind) => hostOf(kind),
): Promise<readonly Candidate[]> {
  const root =
    discoverWorkspace(resolve(from)) ?? resolutionOrder(await listWorkspaces())[0]?.path ?? null;
  if (root === null || !formatReadable(root)) return [];
  const here = (await readMachine()).name;
  const found = (await readOpenSessions(root))
    .map((listing) => listing.record)
    .filter((record) =>
      floor === undefined
        ? isCoordinator(record)
        : sessionScopeOf(record) === 'project' && record.floor === floor,
    )
    .filter((record) => record.machine === undefined || record.machine === here)
    .sort((a, b) => a.openedAt.localeCompare(b.openedAt));
  const ordered = floor === undefined ? found : await inHostOrder(root, floor, found, host);
  return ordered.map((record) => ({
    name: record.id,
    cue: record.purpose.replace(/[\t\r\n]+/g, ' '),
  }));
}

/**
 * A floor's sessions in the order their windows stand in the floor's host,
 * then the ones with no window there by session number — see
 * {@link coordinatorCandidates}. Only a session whose latest launch was hosted
 * is looked for, so a floor of foreground sessions never asks the host at all.
 */
async function inHostOrder(
  root: string,
  floor: number,
  records: readonly SessionRecord[],
  host: (kind: HostedKind) => SessionHost,
): Promise<readonly SessionRecord[]> {
  let workspace: string | undefined;
  try {
    workspace = await workspaceId(root);
  } catch {
    workspace = undefined;
  }
  const standing = (record: SessionRecord): number | undefined => {
    const kind = hostedBy(record);
    if (kind === undefined || workspace === undefined) return undefined;
    try {
      const { own } = classify(record, host(kind).find(record.id), workspace, floor, kind);
      return own?.groups.find(
        (group) => group.stamp?.workspace === workspace && group.stamp.floor === floor,
      )?.index;
    } catch {
      return undefined;
    }
  };
  const number = (record: SessionRecord): number =>
    parseSessionId(record.id)?.n ?? Number.MAX_SAFE_INTEGER;
  return records
    .map((record) => ({ record, index: standing(record), n: number(record) }))
    .sort((a, b) => {
      if (a.index !== undefined && b.index !== undefined) return a.index - b.index;
      if (a.index !== undefined) return -1;
      if (b.index !== undefined) return 1;
      return a.n - b.n;
    })
    .map(({ record }) => record);
}

/**
 * One candidate per line, `NAME<TAB>CUE`. The tab is not a formatting choice:
 * it is what fish's `complete -a` reads as value-and-description, and what a
 * picker splits a display column on — the same encoding optique's completion
 * protocol already uses. Names and cues never contain tabs (a repository name
 * is a directory name; a workspace cue is a path), so no escaping is owed.
 */
export function renderCandidates(found: readonly Candidate[]): string {
  return found.map((candidate) => `${candidate.name}\t${candidate.cue}`).join('\n');
}
