// Remote work-item / PR orchestration. The local↔remote crossing: linking a task to a remote item,
// driving PR status, and merging — with the PRIVACY GATE upstream (every outward body re-authored,
// not copied) and OUTWARD/IRREVERSIBLE actions GATED behind explicit authority (§18,
// never-merge-to-main). The "forge" is a stub in v1: PR state lives on `task.remote`, the sanitized
// PR body lands as an artifact. A real forge adapter swaps in at the `openPr`/`mergePr` boundary.

import { join } from "node:path";
import { readDoc, writeDoc } from "../store/doc.ts";
import { taskDocPath, artifactsDir } from "../store/paths.ts";
import { findTask } from "./resolve.ts";
import { loadWorkspace, nowIso } from "../store/workspace.ts";
import { translate } from "../seams/privacy.ts";
import type { TaskDoc, ArtifactDoc, RemoteStateT } from "../store/schemas.ts";

async function loadTask(
  root: string,
  floor: string,
  slug: string,
): Promise<{ tDir: string; path: string; doc: TaskDoc; body: string }> {
  const t = await findTask(root, floor, slug);
  if (!t) throw new Error(`no task ${slug} on floor ${floor}`);
  const path = taskDocPath(t.tDir);
  const { doc, body } = await readDoc(path);
  if (doc.type !== "task") throw new Error("not a task record");
  return { tDir: t.tDir, path, doc, body };
}

// Local bookkeeping: attach a remote link (an ATTRIBUTE, not the task's identity). Not gated — no
// content crosses outward here.
export async function attachRemote(
  root: string,
  floor: string,
  slug: string,
  link: { provider: string; id: string; url: string },
): Promise<TaskDoc> {
  const t = await loadTask(root, floor, slug);
  const next: TaskDoc = { ...t.doc, remote: { ...link, state: "open" } };
  await writeDoc(t.path, next, t.body);
  return next;
}

// Open a PR — a GATED, outward action. The body is re-authored through the privacy gate before it
// can cross; without explicit authority the gate refuses entirely.
export async function openPr(
  root: string,
  floor: string,
  slug: string,
  args: { title: string; body: string; authorized: boolean },
): Promise<{ task: TaskDoc; sanitized: string; stripped: string[] }> {
  if (!args.authorized) {
    throw new Error(
      "gated action: opening a PR is outward-facing — requires explicit human authority (--authorize) [§18]",
    );
  }
  const t = await loadTask(root, floor, slug);
  if (!t.doc.remote) {
    throw new Error(`task ${slug} has no remote link — run 'task attach-remote' first`);
  }
  const ws = await loadWorkspace(root);
  // THE single upstream privacy gate (§4). Composes a remote-audience body and strips local/persona.
  const { text, stripped } = translate(`# ${args.title}\n\n${args.body}`, {
    personaNames: ws.personaCast,
    workspaceRoot: root,
  });
  const artifact: ArtifactDoc = {
    type: "artifact",
    schemaVersion: 1,
    artifactType: "pr-body",
    name: `pr-${t.doc.remote.id}`,
    provenance: { cwd: root, why: `PR for ${slug}`, derivedFrom: [] },
    createdAt: nowIso(),
  };
  await writeDoc(join(artifactsDir(t.tDir), `pr-${t.doc.remote.id}.md`), artifact, text);

  const next: TaskDoc = {
    ...t.doc,
    state: "in-review",
    remote: { ...t.doc.remote, state: "open" },
  };
  await writeDoc(t.path, next, t.body);
  return { task: next, sanitized: text, stripped };
}

// Incoming forge status (review state / CI). Not gated — status flows IN freely; only outward posts
// are gated.
export async function reviewPr(
  root: string,
  floor: string,
  slug: string,
  state: RemoteStateT,
): Promise<TaskDoc> {
  const t = await loadTask(root, floor, slug);
  if (!t.doc.remote) throw new Error(`task ${slug} has no remote link`);
  const next: TaskDoc = { ...t.doc, remote: { ...t.doc.remote, state } };
  await writeDoc(t.path, next, t.body);
  return next;
}

// Merge — GATED and irreversible (§18, never-merge-to-main). Only an approved PR may merge.
export async function mergePr(
  root: string,
  floor: string,
  slug: string,
  args: { authorized: boolean },
): Promise<TaskDoc> {
  if (!args.authorized) {
    throw new Error(
      "gated action: merging to a main line requires explicit human authority (--authorize) [§18, never-merge-to-main]",
    );
  }
  const t = await loadTask(root, floor, slug);
  if (!t.doc.remote) throw new Error(`task ${slug} has no remote link`);
  if (t.doc.remote.state !== "approved") {
    throw new Error(`cannot merge: PR state is '${t.doc.remote.state}', needs 'approved'`);
  }
  const next: TaskDoc = { ...t.doc, remote: { ...t.doc.remote, state: "merged" } };
  await writeDoc(t.path, next, t.body);
  return next;
}
