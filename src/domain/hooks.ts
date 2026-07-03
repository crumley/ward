// Lifecycle hooks (03-work-lifecycle) — customizable setup/teardown for a
// worktree, and the defining constraint: they must be IDEMPOTENT. Each hook can
// be validated as already-done-or-not and becomes a no-op if satisfied (§6), so a
// step that half-ran before an interruption converges to done on resume.
//
// v2 ships two default worktree hooks (dependency init, theme application) as
// marker files under the checkout, so "satisfied?" is a real, checkable question.

import { mkdir, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Accent } from '../seams/theming.ts';

const HOOKS_DIR = '.ward-setup';

export interface HookContext {
  checkoutDir: string;
  accent: Accent;
  glyph: string;
}

export interface WorktreeHook {
  name: string;
  apply(ctx: HookContext): Promise<void>;
  satisfied(ctx: HookContext): Promise<boolean>;
  remove(ctx: HookContext): Promise<void>;
}

export interface HookState {
  name: string;
  satisfied: boolean;
}

const depsHook: WorktreeHook = {
  name: 'deps',
  apply: (ctx) => writeMarker(ctx, 'deps', 'dependencies initialized'),
  satisfied: (ctx) => pathExists(markerPath(ctx, 'deps')),
  remove: (ctx) => rm(markerPath(ctx, 'deps'), { force: true }),
};

const themeHook: WorktreeHook = {
  name: 'theme',
  apply: (ctx) => writeMarker(ctx, 'theme', `${ctx.glyph} ${ctx.accent.name} ${ctx.accent.hex}`),
  satisfied: (ctx) => pathExists(markerPath(ctx, 'theme')),
  remove: (ctx) => rm(markerPath(ctx, 'theme'), { force: true }),
};

export const DEFAULT_WORKTREE_HOOKS: readonly WorktreeHook[] = [depsHook, themeHook];

/** Apply all setup hooks idempotently (check-before-apply); returns their states. */
export async function applySetupHooks(
  ctx: HookContext,
  hooks: readonly WorktreeHook[] = DEFAULT_WORKTREE_HOOKS,
): Promise<HookState[]> {
  const states: HookState[] = [];
  for (const hook of hooks) {
    if (!(await hook.satisfied(ctx))) {
      await hook.apply(ctx);
    }
    states.push({ name: hook.name, satisfied: true });
  }
  return states;
}

/**
 * Re-validate setup hooks on resume/recovery: a hook whose marker vanished is
 * re-applied; one already satisfied is a no-op. Returns the names re-applied.
 */
export async function revalidateSetupHooks(
  ctx: HookContext,
  hooks: readonly WorktreeHook[] = DEFAULT_WORKTREE_HOOKS,
): Promise<string[]> {
  const reapplied: string[] = [];
  for (const hook of hooks) {
    if (!(await hook.satisfied(ctx))) {
      await hook.apply(ctx);
      reapplied.push(hook.name);
    }
  }
  return reapplied;
}

/** Remove hook-generated state (teardown). Idempotent — removing what's gone is fine. */
export async function removeTeardownHooks(
  ctx: HookContext,
  hooks: readonly WorktreeHook[] = DEFAULT_WORKTREE_HOOKS,
): Promise<void> {
  for (const hook of hooks) {
    await hook.remove(ctx);
  }
}

function markerPath(ctx: HookContext, name: string): string {
  return join(ctx.checkoutDir, HOOKS_DIR, name);
}

async function writeMarker(ctx: HookContext, name: string, content: string): Promise<void> {
  await mkdir(join(ctx.checkoutDir, HOOKS_DIR), { recursive: true });
  await writeFile(markerPath(ctx, name), `${content}\n`, 'utf8');
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}
