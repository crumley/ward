// The workspace's immutable id (design/0054-workspace-id/;
// intent/01-concepts/00-domain-model.md, Identity). Two operations and one
// read, and nothing else in Ward mints, spells, or interprets an id:
//
// - `mintWorkspaceId()` — a fresh id. Called only by convergence's
//   `workspace id` step, which writes it once into `workspace.md` and never
//   again, so create and upgrade mint through one code path.
// - `workspaceId(root)` — the id as the record carries it, for anything that
//   keys outside state to the workspace (a floor host's `@ward_workspace`
//   stamp, design/0031-detached-session-hosting/). It never mints: a read verb
//   that minted would be a write without the store lock or a journal commit,
//   and two machines reading one unminted workspace would mint two ids.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { WardError } from '../errors.ts';
import { readDocument } from '../store/document.ts';
import { workspaceRecordType } from '../store/types.ts';

/**
 * A fresh workspace id: a random (version 4) UUID, lowercase — 122 random
 * bits, so it is unique with no help from context on any machine, spelled in
 * `[0-9a-f-]`, inside the tmux-safe alphabet the record validates.
 */
export function mintWorkspaceId(): string {
  return crypto.randomUUID();
}

/**
 * The immutable id of the workspace at `root`. Refuses, naming the verb that
 * mints it, when the record carries none (a workspace made before 0054 that
 * has not been upgraded) — a guessed or path-derived stand-in would be the
 * mutable key the id exists to replace.
 */
export async function workspaceId(root: string): Promise<string> {
  if (!existsSync(join(root, workspaceRecordType.relPath))) {
    throw new WardError(`${root} has no ${workspaceRecordType.relPath} — not a Ward workspace`);
  }
  const { id } = (await readDocument(root, workspaceRecordType)).data;
  if (id === undefined) {
    throw new WardError(
      'this workspace has no id yet — it was made by an older ward; mint it with: ' +
        'ward workspace upgrade',
    );
  }
  return id;
}

/**
 * The id as the record carries it, or undefined — when none is minted yet, or
 * the record is missing or will not parse. For read surfaces that report the
 * id beside other things (`ward status`): a broken workspace record is
 * doctor's finding to name, not a reason for a glance to fail.
 */
export async function recordedWorkspaceId(root: string): Promise<string | undefined> {
  try {
    return (await readDocument(root, workspaceRecordType)).data.id;
  } catch {
    return undefined;
  }
}
