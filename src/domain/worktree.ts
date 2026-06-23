// Worktree lifecycle: a real `git worktree` off the repo's refreshed main, with idempotent setup
// hooks (deps + theme) that validate-on-resume and no-op if satisfied (walkthrough §3). The worktree
// record carries the hook states and the theme. Work never reaches main except via PR
// (never-merge-to-main) — this branch is the only path.

import { writeDoc, readDoc } from "../store/doc.ts";
import { worktreeDocPath, repoCheckoutDir, worktreePath } from "../store/paths.ts";
import { nowIso, loadWorkspace } from "../store/workspace.ts";
import { themeFor } from "../seams/theming.ts";
import { findTask, worktreeAccentsInTask } from "./resolve.ts";
import { worktreeSetupHooks, runSetupHooks, runTeardownHooks } from "./hooks.ts";
import { gitWorktreeAdd, gitWorktreeRemove } from "../seams/git.ts";
import type { WorktreeDoc } from "../store/schemas.ts";

export async function createWorktree(
  root: string,
  floor: string,
  taskSlug: string,
  repo: string,
  branch?: string,
): Promise<{ worktree: WorktreeDoc; applied: string[] }> {
  const ws = await loadWorkspace(root);
  const repoRef = ws.repos.find((r) => r.name === repo);
  if (!repoRef) throw new Error(`unknown repo: ${repo} (ward repo add it first)`);
  const t = await findTask(root, floor, taskSlug);
  if (!t) throw new Error(`no task ${taskSlug} on floor ${floor}`);

  const br = branch ?? taskSlug;
  const wtPath = worktreePath(root, repo, br);
  const docPath = worktreeDocPath(t.tDir, repo, br);

  const theme = themeFor("worktree", `${repo}:${br}`, await worktreeAccentsInTask(t.tDir));
  const themeVal = { accent: theme.accent, glyph: theme.glyph };

  // Create the real git worktree off the repo's main line (idempotent: -B resets the branch).
  await gitWorktreeAdd(repoCheckoutDir(root, repo), wtPath, br, repoRef.mainBranch);

  const { states, applied } = await runSetupHooks(worktreeSetupHooks, {
    worktreePath: wtPath,
    theme: themeVal,
  });

  const doc: WorktreeDoc = {
    type: "worktree",
    schemaVersion: 1,
    repo,
    branch: br,
    task: taskSlug,
    path: wtPath,
    hooks: states,
    theme: themeVal,
    createdAt: nowIso(),
  };
  await writeDoc(docPath, doc, `# ${theme.glyph} Worktree ${repo}:${br}\n\nAt ${wtPath}.`);
  return { worktree: doc, applied };
}

// Re-validate setup hooks (recovery / resume). Converges to satisfied without repeating work.
export async function revalidateWorktree(
  root: string,
  floor: string,
  taskSlug: string,
  repo: string,
  branch: string,
): Promise<{ applied: string[] }> {
  const t = await findTask(root, floor, taskSlug);
  if (!t) throw new Error(`no task ${taskSlug} on floor ${floor}`);
  const docPath = worktreeDocPath(t.tDir, repo, branch);
  const { doc, body } = await readDoc(docPath);
  if (doc.type !== "worktree") throw new Error("not a worktree record");
  const { states, applied } = await runSetupHooks(worktreeSetupHooks, {
    worktreePath: doc.path,
    theme: doc.theme,
  });
  await writeDoc(docPath, { ...doc, hooks: states }, body);
  return { applied };
}

export async function teardownWorktree(
  root: string,
  floor: string,
  taskSlug: string,
  repo: string,
  branch: string,
): Promise<void> {
  const t = await findTask(root, floor, taskSlug);
  if (!t) throw new Error(`no task ${taskSlug} on floor ${floor}`);
  const docPath = worktreeDocPath(t.tDir, repo, branch);
  const { doc } = await readDoc(docPath);
  if (doc.type !== "worktree") throw new Error("not a worktree record");
  await runTeardownHooks(worktreeSetupHooks, { worktreePath: doc.path, theme: doc.theme });
  try {
    await gitWorktreeRemove(repoCheckoutDir(root, repo), doc.path);
  } catch {
    // worktree may already be gone; teardown is best-effort + idempotent
  }
}
