// Project (floor) lifecycle. Opening a project writes its record (no status field — derived) and
// opens a project-scope session for the attending, recorded with a harness handle (walkthrough §1).

import { writeDoc } from "../store/doc.ts";
import { projectDir, projectDocPath } from "../store/paths.ts";
import { nextFloor, slugify } from "../store/ids.ts";
import { nowIso } from "../store/workspace.ts";
import { loadWorkspace } from "../store/workspace.ts";
import { defaultFor } from "./personas.ts";
import { themeFor } from "../seams/theming.ts";
import { projectAccents } from "./resolve.ts";
import { openSession } from "./session.ts";
import type { ProjectDoc } from "../store/schemas.ts";

export async function openProject(
  root: string,
  title: string,
): Promise<{ project: ProjectDoc; floor: string; session: string; handle: string }> {
  const ws = await loadWorkspace(root);
  const floorNum = await nextFloor(root);
  const floor = String(floorNum);
  const slug = slugify(title);
  const theme = themeFor("project", floor, await projectAccents(root));
  const attending = defaultFor("attending");
  const chargeNurse = defaultFor("charge-nurse");

  const doc: ProjectDoc = {
    type: "project",
    schemaVersion: 1,
    identity: { slug, code: floor },
    title,
    personas: { attending: attending.name, chargeNurse: chargeNurse.name },
    theme: { accent: theme.accent, glyph: theme.glyph },
    createdAt: nowIso(),
  };
  const pDir = projectDir(root, floor, slug);
  await writeDoc(
    projectDocPath(pDir),
    doc,
    `# ${theme.glyph} Floor ${floor} — ${title}\n\nAccent: ${theme.accent}. ` +
      `Attending ${attending.name}; charge nurse ${chargeNurse.name}.`,
  );

  // The human opens a project-scope session; the attending owns the outcome. Working directory is
  // the workspace root for breadth (two axes: broad scope reads broadly).
  const { session, handle } = await openSession(root, pDir, {
    scope: `project:${floor}`,
    persona: attending.name,
    model: ws.modelDefaults[attending.modelTier] ?? attending.modelTier,
    cwd: root,
  });

  return { project: doc, floor, session, handle };
}
