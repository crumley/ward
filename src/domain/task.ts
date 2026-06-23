// Task lifecycle (creation here; PR/merge/close in later iterations). A task records its own state
// (it is a status leaf; project/workspace derive from it) and opens a resident task-scope session
// (walkthrough §2). Local-only by default; a remote link is an attribute added later.

import { writeDoc, readDoc } from "../store/doc.ts";
import { taskDir, taskDocPath } from "../store/paths.ts";
import { slugify } from "../store/ids.ts";
import { nowIso, loadWorkspace } from "../store/workspace.ts";
import { defaultFor } from "./personas.ts";
import { themeFor } from "../seams/theming.ts";
import { findProject } from "./resolve.ts";
import { openSession } from "./session.ts";
import type { TaskDoc } from "../store/schemas.ts";

export async function openTask(
  root: string,
  floor: string,
  title: string,
  opts: { repos?: string[]; successCriteria?: string[] } = {},
): Promise<{ task: TaskDoc; session: string; handle: string }> {
  const ws = await loadWorkspace(root);
  const project = await findProject(root, floor);
  if (!project) throw new Error(`no project on floor ${floor} (open one first)`);
  const slug = slugify(title);
  const tDir = taskDir(project.pDir, slug);

  const resident = defaultFor("resident");
  // Task accent shares the project's instance identity space; key on the task's address.
  const theme = themeFor("task", `${floor}/${slug}`, [project.doc.theme.accent]);

  const doc: TaskDoc = {
    type: "task",
    schemaVersion: 1,
    identity: { slug, code: `${floor}/${slug}` },
    title,
    successCriteria: opts.successCriteria ?? [],
    repos: opts.repos ?? [],
    resident: resident.name,
    state: "active",
    theme: { accent: theme.accent, glyph: theme.glyph },
    createdAt: nowIso(),
  };
  await writeDoc(
    taskDocPath(tDir),
    doc,
    `# ${theme.glyph} Task — ${title}\n\nResident ${resident.name}. ` +
      (doc.successCriteria.length ? `Done means: ${doc.successCriteria.join("; ")}.` : "Local-only."),
  );

  const { session, handle } = await openSession(root, tDir, {
    scope: `task:${floor}/${slug}`,
    persona: resident.name,
    model: ws.modelDefaults[resident.modelTier] ?? resident.modelTier,
    cwd: root,
  });

  return { task: doc, session, handle };
}

export async function setTaskState(
  root: string,
  floor: string,
  slug: string,
  state: TaskDoc["state"],
): Promise<TaskDoc> {
  const project = await findProject(root, floor);
  if (!project) throw new Error(`no project on floor ${floor}`);
  const path = taskDocPath(taskDir(project.pDir, slug));
  const { doc, body } = await readDoc(path);
  if (doc.type !== "task") throw new Error("not a task record");
  if (doc.state === "closed" && state !== "closed") {
    throw new Error(`closed stays closed: task ${slug}`);
  }
  const next: TaskDoc = { ...doc, state };
  await writeDoc(path, next, body);
  return next;
}
