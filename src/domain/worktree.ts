// Worktree lifecycle (domain-model, work-lifecycle). A worktree is a branch of
// one repo, checked out to be changed independently of main. Creating one fires
// idempotent setup hooks (deps + theme) and records a deterministic accent + type
// glyph so its windows are recognizable (theming). Teardown removes generated
// state and marks the record torn-down (retained for history), so recovery can
// tell a live worktree from a closed one.

import { readdir } from 'node:fs/promises';
import { type Git, systemGit } from '../seams/git.ts';
import { type Accent, accentByName, assignAccent, glyphFor } from '../seams/theming.ts';
import { readAs, writeDocument } from '../store/doc.ts';
import { appendEvent, type Clock, systemClock } from '../store/log.ts';
import {
  logDir,
  repoCheckout,
  taskDir,
  worktreeCheckout,
  worktreeDoc,
  worktreesDir,
} from '../store/paths.ts';
import { type Worktree, worktreeSchema } from '../store/schemas.ts';
import { listProjects, resolveProjectDir } from '../store/workspace.ts';
import {
  applySetupHooks,
  type HookContext,
  removeTeardownHooks,
  revalidateSetupHooks,
} from './hooks.ts';
import { listTasks } from './task.ts';

export interface CreateWorktreeOptions {
  floor: number;
  taskSlug: string;
  repo: string;
  branch: string;
  git?: Git;
  now?: Clock;
}

export async function createWorktree(root: string, opts: CreateWorktreeOptions): Promise<Worktree> {
  const now = opts.now ?? systemClock;
  const git = opts.git ?? systemGit;
  const checkout = worktreeCheckout(root, opts.repo, opts.branch);
  await git.addWorktree(repoCheckout(root, opts.repo), checkout, opts.branch);

  const accent = assignAccent(`${opts.repo}/${opts.branch}`, await visibleAccentNames(root));
  const glyph = glyphFor('worktree');
  const setupHooks = await applySetupHooks({ checkoutDir: checkout, accent, glyph });

  const worktree: Worktree = {
    type: 'worktree',
    repo: opts.repo,
    branch: opts.branch,
    floor: opts.floor,
    taskSlug: opts.taskSlug,
    accent: accent.name,
    glyph,
    setupHooks,
    tornDown: false,
  };
  const taskDirPath = taskDir(await resolveProjectDir(root, opts.floor), opts.taskSlug);
  await writeDocument(worktreeDoc(taskDirPath, opts.repo, opts.branch), worktree);
  await appendEvent(
    logDir(taskDirPath),
    {
      kind: 'worktree-created',
      data: { repo: opts.repo, branch: opts.branch, accent: accent.name },
    },
    now,
  );
  return worktree;
}

export interface TeardownWorktreeOptions {
  floor: number;
  taskSlug: string;
  repo: string;
  branch: string;
  git?: Git;
  now?: Clock;
}

export async function teardownWorktree(
  root: string,
  opts: TeardownWorktreeOptions,
): Promise<Worktree> {
  const now = opts.now ?? systemClock;
  const git = opts.git ?? systemGit;
  const taskDirPath = taskDir(await resolveProjectDir(root, opts.floor), opts.taskSlug);
  const worktree = (await readAs(worktreeDoc(taskDirPath, opts.repo, opts.branch), worktreeSchema))
    .doc;
  const checkout = worktreeCheckout(root, opts.repo, opts.branch);
  await removeTeardownHooks(hookContext(checkout, worktree));
  await git.removeWorktree(repoCheckout(root, opts.repo), checkout);
  const tornDown: Worktree = { ...worktree, tornDown: true };
  await writeDocument(worktreeDoc(taskDirPath, opts.repo, opts.branch), tornDown);
  await appendEvent(
    logDir(taskDirPath),
    { kind: 'worktree-torndown', data: { repo: opts.repo, branch: opts.branch } },
    now,
  );
  return tornDown;
}

/** Every worktree across the workspace (walks projects → tasks → worktrees). */
export async function listWorktrees(root: string): Promise<Worktree[]> {
  const worktrees: Worktree[] = [];
  for (const project of await listProjects(root)) {
    for (const task of await listTasks(root, project.floor)) {
      const dir = taskDir(await resolveProjectDir(root, project.floor), task.slug);
      const files = await readdir(worktreesDir(dir)).catch(() => [] as string[]);
      for (const file of files.filter((n) => n.endsWith('.md'))) {
        worktrees.push((await readAs(`${worktreesDir(dir)}/${file}`, worktreeSchema)).doc);
      }
    }
  }
  return worktrees;
}

/** Build a hook context from a stored worktree (reconstructing the accent by name). */
export function hookContext(checkoutDir: string, worktree: Worktree): HookContext {
  const accent: Accent = accentByName(worktree.accent) ?? { name: worktree.accent, hex: '' };
  return { checkoutDir, accent, glyph: worktree.glyph };
}

/** Re-validate a live worktree's setup hooks (recovery uses this for live worktrees only). */
export async function revalidateWorktree(root: string, worktree: Worktree): Promise<string[]> {
  const checkout = worktreeCheckout(root, worktree.repo, worktree.branch);
  return revalidateSetupHooks(hookContext(checkout, worktree));
}

async function visibleAccentNames(root: string): Promise<string[]> {
  return (await listWorktrees(root)).filter((w) => !w.tornDown).map((w) => w.accent);
}
