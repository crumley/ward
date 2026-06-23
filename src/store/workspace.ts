// Load/save the workspace record (the version stamp + repo registry + model defaults).

import { workspaceDocPath } from "./paths.ts";
import { readDoc, writeDoc } from "./doc.ts";
import type { WorkspaceDoc } from "./schemas.ts";

export async function loadWorkspace(root: string): Promise<WorkspaceDoc> {
  const { doc } = await readDoc(workspaceDocPath(root));
  if (doc.type !== "workspace") throw new Error(`not a workspace record: ${workspaceDocPath(root)}`);
  return doc;
}

export async function saveWorkspace(root: string, ws: WorkspaceDoc): Promise<void> {
  await writeDoc(workspaceDocPath(root), ws);
}

export function nowIso(): string {
  return new Date().toISOString();
}
