// Derived status: a containing scope's status is a QUERY over its children, never a stored field
// (domain-model; §17). Project status derives from its tasks' states; workspace status from its
// projects. This is the read side the house supervisor / charge nurse run on a fast model.

import { join } from "node:path";
import { readDoc, listDirs } from "../store/doc.ts";
import {
  projectsDir,
  projectDocPath,
  tasksDir,
  taskDocPath,
} from "../store/paths.ts";

export type ProjectStatus = {
  floor: string;
  slug: string;
  title: string;
  status: string; // DERIVED
  tasks: { slug: string; title: string; state: string }[];
};

export type WorkspaceStatus = {
  status: string; // DERIVED
  projects: ProjectStatus[];
};

// Derive a parent's status from its children's leaf states. Pure function — the heart of "derive,
// don't store." Precedence: any attention-needing child surfaces; else active beats closed.
export function deriveStatus(childStates: string[]): string {
  if (childStates.length === 0) return "empty";
  if (childStates.some((s) => s === "blocked")) return "blocked";
  if (childStates.some((s) => s === "active" || s === "in-review" || s === "open")) return "active";
  if (childStates.every((s) => s === "closed")) return "closed";
  if (childStates.some((s) => s === "paused")) return "paused";
  return "active";
}

export async function projectStatus(
  root: string,
  floorSlugDir: string,
): Promise<ProjectStatus> {
  const pDir = join(projectsDir(root), floorSlugDir);
  const { doc } = await readDoc(projectDocPath(pDir));
  if (doc.type !== "project") throw new Error("expected project record");
  const taskSlugs = await listDirs(tasksDir(pDir));
  const tasks: { slug: string; title: string; state: string }[] = [];
  for (const slug of taskSlugs) {
    const { doc: t } = await readDoc(taskDocPath(join(tasksDir(pDir), slug)));
    if (t.type !== "task") continue;
    tasks.push({ slug, title: t.title, state: t.state });
  }
  return {
    floor: doc.identity.code,
    slug: doc.identity.slug,
    title: doc.title,
    status: deriveStatus(tasks.map((t) => t.state)),
    tasks,
  };
}

export async function workspaceStatus(root: string): Promise<WorkspaceStatus> {
  const floors = await listDirs(projectsDir(root));
  const projects: ProjectStatus[] = [];
  for (const f of floors) projects.push(await projectStatus(root, f));
  return {
    status: deriveStatus(projects.map((p) => p.status)),
    projects,
  };
}
