// Workspace lifecycle: create a real, git-tracked workspace with a version stamp, default persona
// cast, and model-tier defaults (vision; §14 version stamp; §15 versionable). Register repositories
// with a canonical main checkout.

import { join } from "node:path";
import { writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { writeDoc } from "../store/doc.ts";
import {
  wardDir,
  workspaceDocPath,
  personasDir,
  repoCheckoutDir,
} from "../store/paths.ts";
import { loadWorkspace, saveWorkspace, nowIso } from "../store/workspace.ts";
import { castToPersonaDocs, DEFAULT_CAST } from "./personas.ts";
import type { WorkspaceDoc } from "../store/schemas.ts";
import {
  gitInit,
  gitConfigLocalIdentity,
  gitAddAllCommit,
  gitClone,
  gitDefaultBranch,
} from "../seams/git.ts";

export const WARD_VERSION = "0.1.0";

// Model tiers are durable intent (fast vs deep); the concrete ids are workspace config that tracks
// the best available models over time (model-selection seam) — placeholders here, meant to be edited.
const DEFAULT_MODEL_DEFAULTS: Record<string, string> = {
  fast: "fast-default",
  deep: "deep-default",
};

const GITIGNORE = `# Ward workspace — durable metadata is tracked; regenerable checkouts are not (§15).
/repos/
/worktrees/
*.local.md
`;

export async function initWorkspace(root: string): Promise<WorkspaceDoc> {
  if (existsSync(wardDir(root))) {
    throw new Error(`already a Ward workspace: ${wardDir(root)}`);
  }
  await mkdir(wardDir(root), { recursive: true });

  const ws: WorkspaceDoc = {
    type: "workspace",
    schemaVersion: 1,
    wardVersion: WARD_VERSION,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    repos: [],
    modelDefaults: DEFAULT_MODEL_DEFAULTS,
    personaCast: DEFAULT_CAST.map((m) => m.name),
  };
  await writeDoc(
    workspaceDocPath(root),
    ws,
    "# Workspace\n\nLocal, personal Ward workspace. The house supervisor can answer " +
      "\"what's in flight?\" by deriving status across projects.",
  );

  // The default cast as living persona artifacts.
  for (const p of castToPersonaDocs()) {
    await writeDoc(
      join(personasDir(root), `${p.name}.md`),
      p,
      `# ${p.name} — ${p.role}\n\n${p.disposition}`,
    );
  }

  await writeFile(join(root, ".gitignore"), GITIGNORE, "utf8");

  // The workspace is itself a git repository (§15).
  await gitInit(root);
  await gitConfigLocalIdentity(root);
  await gitAddAllCommit(root, "ward: initialize workspace");

  return ws;
}

export async function addRepo(
  root: string,
  opts: { name: string; url: string; mainBranch?: string },
): Promise<WorkspaceDoc> {
  const ws = await loadWorkspace(root);
  if (ws.repos.some((r) => r.name === opts.name)) {
    throw new Error(`repo already registered: ${opts.name}`);
  }
  const dest = repoCheckoutDir(root, opts.name);
  // Canonical main checkout. `url` may be a remote URL or a local path (used in tests/dev).
  await gitClone(opts.url, dest);
  const mainBranch = opts.mainBranch ?? (await gitDefaultBranch(dest));

  ws.repos.push({ name: opts.name, url: opts.url, mainBranch, path: dest });
  ws.updatedAt = nowIso();
  await saveWorkspace(root, ws);
  return ws;
}
