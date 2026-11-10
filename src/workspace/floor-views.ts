// Floor views (design/0057-context-from-root/): for every floor that is not
// closed, `floors/<N>-<slug>/` is that floor's working place — named after its
// record directory `projects/<N>-<slug>/`, holding three relative links onto
// the record and the floor's task worktrees, and nothing else. The whole tree
// is ignored by the workspace's git: everything in it is derived, so it can
// never hold a second copy of a fact the record already carries (§16).
//
// The view is what makes the path carry the context
// (intent/01-concepts/05-context-loading.md): a task's worktree stands under
// its floor's view, so the walk down from the root to it passes the floor's
// manifest. The links are:
//
// - `AGENTS.md` → `../../projects/<N>-<slug>/AGENTS.md`, the floor manifest;
// - `CLAUDE.md` → `AGENTS.md`, the 0017 adapter at the view's level;
// - `notes.md` → `../../projects/<N>-<slug>/notes.md`, for a harness or an
//   agent that reads the manifest's import line as a plain path beside it.
//
// This module is the one home for the view: its path from a project
// directory, the links, establishing them, and the inspection doctor reads.
import { existsSync, lstatSync, readlinkSync, realpathSync } from 'node:fs';
import { mkdir, symlink } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { carriesManifest, floorManifestPaths } from './floor-manifest.ts';
import { FLOORS_DIR } from './layout.ts';
import type { FoundProject } from './projects.ts';

/** One link of a floor's view: where it stands, and what it says. */
export interface ViewLink {
  /** Workspace-relative path of the link itself. */
  readonly path: string;
  /** The link's text, relative to its own directory. */
  readonly target: string;
  /** Workspace-relative path the link must resolve to — the record's own file. */
  readonly resolvesTo: string;
}

/** The view's directory for a project directory: `projects/7-x` → `floors/7-x`. */
export function floorViewDir(projectDir: string): string {
  return `${FLOORS_DIR}/${basename(projectDir)}`;
}

/** The three links of a floor's view, in the order they are established. */
export function floorViewLinks(projectDir: string): readonly ViewLink[] {
  const dir = floorViewDir(projectDir);
  const manifest = floorManifestPaths(projectDir);
  const up = `../../${projectDir}`;
  return [
    { path: `${dir}/AGENTS.md`, target: `${up}/AGENTS.md`, resolvesTo: manifest.agents },
    { path: `${dir}/CLAUDE.md`, target: 'AGENTS.md', resolvesTo: manifest.agents },
    { path: `${dir}/notes.md`, target: `${up}/notes.md`, resolvesTo: manifest.notes },
  ];
}

/** Whether a floor has a view: the same rule as its manifest — closed floors are skipped. */
export function carriesView(project: FoundProject): boolean {
  return carriesManifest(project.record);
}

/**
 * How one link stands:
 * - `linked` — a symlink whose target resolves to the record's file;
 * - `absent` — nothing at the path;
 * - `dangling` — a symlink with this module's text whose target does not
 *   exist (the record's file is missing);
 * - `elsewhere` — a symlink aimed somewhere else, the human's arrangement;
 * - `file` — a regular file or directory, the human's arrangement.
 */
export type LinkState = 'linked' | 'absent' | 'dangling' | 'elsewhere' | 'file';

export function inspectViewLink(root: string, link: ViewLink): LinkState {
  const at = join(root, link.path);
  let stat: ReturnType<typeof lstatSync>;
  try {
    stat = lstatSync(at); // lstat: a dangling link still exists as an arrangement
  } catch {
    return 'absent';
  }
  if (!stat.isSymbolicLink()) return 'file';
  const pointed = resolve(dirname(at), readlinkSync(at));
  const wanted = join(root, link.resolvesTo);
  if (!existsSync(pointed)) {
    return readlinkSync(at) === link.target ? 'dangling' : 'elsewhere';
  }
  if (!existsSync(wanted)) return 'elsewhere';
  return realpathSync(pointed) === realpathSync(wanted) ? 'linked' : 'elsewhere';
}

/** What establishing one floor's view did. */
export interface ViewEstablishment {
  /** Workspace-relative paths written this time. */
  readonly written: readonly string[];
  /** Links that are there but not Ward's: reported, never replaced. */
  readonly kept: readonly string[];
}

/**
 * Check-then-do, per link (the 0017 posture): a link is written only where
 * the path is absent (`lstat`). A link that points elsewhere, or a regular
 * file, is the human's arrangement and is reported, never replaced. Nothing
 * here touches the record or git: the tree is ignored.
 */
export async function establishFloorView(
  root: string,
  project: FoundProject,
): Promise<ViewEstablishment> {
  await mkdir(join(root, floorViewDir(project.dir)), { recursive: true });
  const written: string[] = [];
  const kept: string[] = [];
  for (const link of floorViewLinks(project.dir)) {
    const state = inspectViewLink(root, link);
    if (state === 'absent') {
      await symlink(link.target, join(root, link.path));
      written.push(link.path);
    } else if (state === 'elsewhere' || state === 'file') {
      kept.push(link.path);
    }
  }
  return { written, kept };
}

/** Establish every open floor's view; the step converge, restore and project open share. */
export async function establishFloorViews(
  root: string,
  projects: readonly FoundProject[],
): Promise<{ readonly floors: number; readonly written: readonly string[] }> {
  const open = projects.filter(carriesView);
  const written: string[] = [];
  for (const project of open) written.push(...(await establishFloorView(root, project)).written);
  return { floors: open.length, written };
}

/**
 * The gaps in one floor's view, for doctor: empty when the view is whole.
 * Each gap is a short phrase naming the link and its state.
 */
export function floorViewGaps(root: string, project: FoundProject): string[] {
  const dir = floorViewDir(project.dir);
  if (!existsSync(join(root, dir))) return [`no view at ${dir}/`];
  const gaps: string[] = [];
  for (const link of floorViewLinks(project.dir)) {
    const name = basename(link.path);
    switch (inspectViewLink(root, link)) {
      case 'linked':
        break;
      case 'absent':
        gaps.push(`no ${name} link`);
        break;
      case 'dangling':
        gaps.push(`${name} does not resolve (${link.resolvesTo} is missing)`);
        break;
      case 'elsewhere':
        gaps.push(`${name} links away from ${link.resolvesTo} (kept)`);
        break;
      case 'file':
        gaps.push(`${name} is not a link (kept)`);
        break;
    }
  }
  return gaps;
}
