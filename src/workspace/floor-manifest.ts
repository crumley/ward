// Floor manifests (design/0055-floor-manifests/): every floor that is not
// closed carries, beside its `project.md`, the manifest for its level
// (intent/01-concepts/05-context-loading.md) — composed from two parts in a
// fixed order, Ward's first and the floor's after
// (intent/01-concepts/06-workspace-lifecycle.md, Compose first):
//
// - `AGENTS.md` — Ward's part. One default, byte-identical on every floor, so
//   one lineage fingerprints every instance and `ward workspace upgrade`
//   brings an untouched one forward; a hand-edited one is kept and named.
// - `CLAUDE.md` — a relative link onto it, the 0017 adapter at floor level.
// - `notes.md` — the floor's part. Seeded once, then written only by appending
//   through `ward project note`; never lineage-tracked, never reconciled.
//
// This module is the one home for where those files are and how they are
// established, so every caller — project open, converge, upgrade, doctor, and
// the views design 0057 links onto these files — asks the same accessor rather
// than spelling the paths. A session reaches the manifest by reading downward
// from the workspace root (design/0057-context-from-root/), never through a
// variable.
import { existsSync } from 'node:fs';
import { symlink } from 'node:fs/promises';
import { join } from 'node:path';
import type { ProjectRecord } from '../store/types.ts';
import { inspectClaudeGuidance } from './layout.ts';
import type { ArtifactLineage, DefaultVersion } from './lineage.ts';
import type { FoundProject } from './projects.ts';
import { FLOOR_AGENTS_MD } from './templates.ts';

/** The three files of a floor's manifest, workspace-relative. */
export interface FloorManifestPaths {
  /** The floor's directory, `projects/<floor>-<slug>`. */
  readonly dir: string;
  /** Ward's part: `<dir>/AGENTS.md`. */
  readonly agents: string;
  /** The harness adapter: `<dir>/CLAUDE.md`, a link onto `agents`. */
  readonly claude: string;
  /** The floor's part: `<dir>/notes.md`. */
  readonly notes: string;
}

/** Where a floor's manifest lives, given its project directory. */
export function floorManifestPaths(projectDir: string): FloorManifestPaths {
  return {
    dir: projectDir,
    agents: `${projectDir}/AGENTS.md`,
    claude: `${projectDir}/CLAUDE.md`,
    notes: `${projectDir}/notes.md`,
  };
}

/**
 * Whether a floor carries a manifest. A closed floor takes no tasks and no
 * sessions, so nothing would ever load one there; it is skipped everywhere —
 * converge, upgrade, doctor — and whatever it already carries is left alone.
 */
export function carriesManifest(record: ProjectRecord): boolean {
  return record.state !== 'closed';
}

// -- the lineage ------------------------------------------------------------

/**
 * Every superseded floor `AGENTS.md` default, oldest first — the floor
 * manifest's counterpart of the root lineage's history
 * (design/0020-deterministic-upgrade/). Maintained by hand, guarded by test:
 * when `FLOOR_AGENTS_MD` changes, the outgoing default's hash MUST be
 * appended here, or every floor still carrying it would read as customized.
 */
export const FLOOR_AGENTS_MD_HISTORY: readonly DefaultVersion[] = [
  // design 0055 — the first floor manifest; it did not yet name a task's
  // brief.
  {
    sha256: '79cbe2e51bfc211f3bb465eb3885c02e5b83c5645fb8bef15d5aa8119c4dacbc',
    era: 'design 0055 (floor manifests)',
  },
  // Current since design 0056: a task's brief is `brief.md` beside its
  // `task.md`, which `ward task show` reports.
];

/**
 * The floor manifest's lineage, enumerated against a tree's floors: one
 * default with many instances, expanded to one entry per floor that carries a
 * manifest, each at its exact path. The root lineage keeps its exact-path
 * entries; the upgrade reads both lists the same way.
 */
export function floorManifestLineages(projects: readonly FoundProject[]): ArtifactLineage[] {
  return projects
    .filter((project) => carriesManifest(project.record))
    .map((project) => ({
      path: floorManifestPaths(project.dir).agents,
      current: () => FLOOR_AGENTS_MD,
      history: FLOOR_AGENTS_MD_HISTORY,
    }));
}

// -- establishing -----------------------------------------------------------

/** The notes a floor starts with: a header, the rule, and the first dated bullet. */
export function seedNotes(slug: string, date: string): string {
  return (
    `# Notes — ${slug}\n\n` +
    'What this floor has learned about how to work here: durable knowledge, one dated fact per\n' +
    'bullet, appended with `ward project note FLOOR TEXT`. Written by the floor; Ward never\n' +
    'rewrites it.\n\n' +
    `- ${date} — The floor's notes began.\n`
  );
}

/**
 * Check-then-do, per file: write what is missing, leave what is there. A
 * `CLAUDE.md` that is a regular file or a link aimed elsewhere is the floor's
 * own arrangement and is never replaced, exactly as at the root (0017).
 * Returns the workspace-relative paths written; the caller holds the store
 * lock and commits them.
 */
export async function establishFloorManifest(
  root: string,
  project: FoundProject,
  now: Date = new Date(),
): Promise<string[]> {
  const paths = floorManifestPaths(project.dir);
  const written: string[] = [];
  if (!existsSync(join(root, paths.agents))) {
    await Bun.write(join(root, paths.agents), FLOOR_AGENTS_MD);
    written.push(paths.agents);
  }
  if (inspectClaudeGuidance(join(root, paths.dir)) === 'absent') {
    await symlink('AGENTS.md', join(root, paths.claude));
    written.push(paths.claude);
  }
  if (!existsSync(join(root, paths.notes))) {
    await Bun.write(join(root, paths.notes), seedNotes(project.record.slug, isoDate(now)));
    written.push(paths.notes);
  }
  return written;
}

/** The UTC calendar date a seeded note or an appended bullet carries. */
export function isoDate(now: Date): string {
  return now.toISOString().slice(0, 10);
}
