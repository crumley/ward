// Task lifecycle (creation here; PR/merge/close in later iterations). A task records its own state
// (it is a status leaf; project/workspace derive from it) and opens a resident task-scope session
// (walkthrough §2). Local-only by default; a remote link is an attribute added later.

import { writeDoc, readDoc, listDirs, listDocs } from "../store/doc.ts";
import { taskDir, taskDocPath, roomsDir, worktreesMetaDir } from "../store/paths.ts";
import { join } from "node:path";
import { slugify } from "../store/ids.ts";
import { nowIso, loadWorkspace } from "../store/workspace.ts";
import { defaultFor } from "./personas.ts";
import { themeFor } from "../seams/theming.ts";
import { findProject } from "./resolve.ts";
import { openSession } from "./session.ts";
import { closeRoom } from "./room.ts";
import { teardownWorktree } from "./worktree.ts";
import { reflectOnTaskClose } from "./reflection.ts";
import type { TaskDoc, ReflectionDoc } from "../store/schemas.ts";

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

// Close a task (§9): a task is complete only when all its PRs are merged. Then close its rooms, tear
// down its worktrees (idempotent teardown hooks), mark it closed (closed stays closed), and trigger
// scope-boundary reflection over the task's arc.
export async function closeTask(
  root: string,
  floor: string,
  slug: string,
): Promise<{ task: TaskDoc; roomsClosed: string[]; worktreesToreDown: string[]; reflection: ReflectionDoc }> {
  const project = await findProject(root, floor);
  if (!project) throw new Error(`no project on floor ${floor}`);
  const tDir = taskDir(project.pDir, slug);
  const { doc } = await readDoc(taskDocPath(tDir));
  if (doc.type !== "task") throw new Error("not a task record");
  if (doc.remote && doc.remote.state !== "merged") {
    throw new Error(
      `cannot close task ${slug}: its PR is '${doc.remote.state}', not merged (all PRs must merge first)`,
    );
  }

  // Close rooms (closed stays closed) and tear down worktrees (idempotent).
  const roomsClosed: string[] = [];
  for (const code of await listDirs(roomsDir(tDir))) {
    await closeRoom(root, code);
    roomsClosed.push(code);
  }
  const worktreesToreDown: string[] = [];
  for (const f of await listDocs(worktreesMetaDir(tDir))) {
    const { doc: wt } = await readDoc(join(worktreesMetaDir(tDir), f));
    if (wt.type !== "worktree") continue;
    await teardownWorktree(root, floor, slug, wt.repo, wt.branch);
    worktreesToreDown.push(`${wt.repo}:${wt.branch}`);
  }

  // Reflect BEFORE marking closed, so the closing session's arc is in scope; then close.
  const reflection = await reflectOnTaskClose(root, floor, slug);
  const task = await setTaskState(root, floor, slug, "closed");

  return { task, roomsClosed, worktreesToreDown, reflection };
}
