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
import { floats } from '../agent/placement.ts';
import { searchOrder } from '../global/locate.ts';
import { readMachine } from '../global/machine.ts';
import { listWorkspaces, resolutionOrder } from '../global/registry.ts';
import { discoverWorkspace } from '../workspace/layout.ts';
import { listRepositoryNames } from '../workspace/repos.ts';
import { readOpenSessions } from '../workspace/sessions.ts';

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
export async function candidates(kind: CandidateKind, from: string): Promise<readonly Candidate[]> {
  try {
    switch (kind) {
      case 'repos':
        return await repoCandidates(from);
      case 'workspaces':
        return await workspaceCandidates();
      case 'coordinators':
        return await coordinatorCandidates(from);
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
 * `wsa` attaches to when it is given no id
 * (design/0059-session-shorthands/), cued by their purpose.
 *
 * The workspace is the one a human-run session verb would act on: the one
 * underfoot, else the registry's best answer — `requireWorkspace`'s ladder
 * for a human caller, so what is offered here is what `ward session attach`
 * will then find. A coordinator is the one session that floats
 * (`floats`, design/0031-detached-session-hosting/): workspace scope, started
 * by no other session. Its helpers are not offered — joining the workspace is
 * joining the session responsible for it, not the last thing it delegated.
 *
 * This machine only, plus records that predate the machine field: a session
 * whose history is on another computer is one `attach` cannot re-create here,
 * and offering it would make `wsa` after a reboot pick something it then
 * refuses (§17). Oldest first, the order they were opened in.
 */
export async function coordinatorCandidates(from: string): Promise<readonly Candidate[]> {
  const root =
    discoverWorkspace(resolve(from)) ?? resolutionOrder(await listWorkspaces())[0]?.path ?? null;
  if (root === null) return [];
  const here = (await readMachine()).name;
  return (await readOpenSessions(root))
    .map((listing) => listing.record)
    .filter((record) => floats(record))
    .filter((record) => record.machine === undefined || record.machine === here)
    .sort((a, b) => a.openedAt.localeCompare(b.openedAt))
    .map((record) => ({ name: record.id, cue: record.purpose.replace(/[\t\r\n]+/g, ' ') }));
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
