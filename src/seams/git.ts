// Git seam: a thin wrapper over the installed `git` binary (execFile, no shell — args are an array,
// so there is no injection surface). Ward orchestrates git; it does not reimplement it (vision
// non-goal). See build/decisions/0006-git-integration-shell-out.md.

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";

const pexec = promisify(execFile);

export async function git(args: string[], cwd?: string): Promise<string> {
  const { stdout } = await pexec("git", args, { cwd, maxBuffer: 16 * 1024 * 1024 });
  return stdout.trim();
}

export async function gitInit(dir: string, branch = "main"): Promise<void> {
  await mkdir(dir, { recursive: true });
  await git(["init", "-b", branch], dir);
}

export async function gitConfigLocalIdentity(dir: string): Promise<void> {
  // Ensure commits succeed even on a machine with no global git identity (tests, CI).
  await git(["config", "user.email", "ward@local"], dir);
  await git(["config", "user.name", "Ward"], dir);
}

export async function gitAddAllCommit(dir: string, message: string): Promise<void> {
  await git(["add", "-A"], dir);
  await git(["commit", "-m", message, "--allow-empty"], dir);
}

export async function gitClone(url: string, dest: string): Promise<void> {
  await mkdir(join(dest, ".."), { recursive: true });
  await git(["clone", url, dest]);
}

export function isGitRepo(dir: string): boolean {
  return existsSync(join(dir, ".git"));
}

export async function gitDefaultBranch(dir: string): Promise<string> {
  try {
    const ref = await git(["symbolic-ref", "--short", "HEAD"], dir);
    return ref || "main";
  } catch {
    return "main";
  }
}

export async function gitWorktreeAdd(
  repoDir: string,
  worktreePath: string,
  branch: string,
  base: string,
): Promise<void> {
  await mkdir(join(worktreePath, ".."), { recursive: true });
  // -B creates or resets the branch off `base`; idempotent enough for our setup-hook discipline.
  await git(["worktree", "add", "-B", branch, worktreePath, base], repoDir);
}

export async function gitWorktreeRemove(repoDir: string, worktreePath: string): Promise<void> {
  await git(["worktree", "remove", "--force", worktreePath], repoDir);
}

export async function gitWorktreeList(repoDir: string): Promise<string[]> {
  const out = await git(["worktree", "list", "--porcelain"], repoDir);
  return out
    .split("\n")
    .filter((l) => l.startsWith("worktree "))
    .map((l) => l.slice("worktree ".length));
}

export async function gitRebase(worktreePath: string, onto: string): Promise<void> {
  await git(["rebase", onto], worktreePath);
}
