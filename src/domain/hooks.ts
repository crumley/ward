// Lifecycle hooks: customizable, IDEMPOTENT setup/teardown for transitions (work-lifecycle). Each
// hook validates "already-done-or-not" and no-ops if satisfied, so a half-run setup converges on
// resume without repeating work (§6). v1 ships two worktree setup hooks: dependency init (a marker)
// and theme application (writing the worktree's accent/glyph). See design/lifecycle-hooks.md.

import { join } from "node:path";
import { writeFile, rm } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import type { ThemeVal } from "../store/schemas.ts";

export type HookCtx = { worktreePath: string; theme: ThemeVal };
export type Hook = {
  name: string;
  satisfied(ctx: HookCtx): boolean;
  apply(ctx: HookCtx): Promise<void>;
  teardown(ctx: HookCtx): Promise<void>;
};

const depsMarker = (ctx: HookCtx) => join(ctx.worktreePath, ".ward-setup-deps");
const themeMarker = (ctx: HookCtx) => join(ctx.worktreePath, ".ward-theme.json");

// Stand-in for "run a dev tool to initialize dependencies": a marker proving setup ran once.
const depsHook: Hook = {
  name: "deps",
  satisfied: (ctx) => existsSync(depsMarker(ctx)),
  apply: async (ctx) => {
    await writeFile(depsMarker(ctx), "dependencies initialized by ward\n", "utf8");
  },
  teardown: async (ctx) => {
    await rm(depsMarker(ctx), { force: true });
  },
};

// Apply the worktree's visual theme (accent + glyph) to its directory, so any surface keyed to this
// worktree can read it. Validated by value, so a re-theme converges.
const themeHook: Hook = {
  name: "theme",
  satisfied: (ctx) => {
    const p = themeMarker(ctx);
    if (!existsSync(p)) return false;
    try {
      const t = JSON.parse(readFileSync(p, "utf8")) as ThemeVal;
      return t.accent === ctx.theme.accent && t.glyph === ctx.theme.glyph;
    } catch {
      return false;
    }
  },
  apply: async (ctx) => {
    await writeFile(themeMarker(ctx), JSON.stringify(ctx.theme) + "\n", "utf8");
  },
  teardown: async (ctx) => {
    await rm(themeMarker(ctx), { force: true });
  },
};

export const worktreeSetupHooks: Hook[] = [depsHook, themeHook];

// Run hooks idempotently: each that is not already satisfied is applied; the result records every
// hook as "satisfied". Re-running over a satisfied worktree applies nothing (the no-op on resume).
export async function runSetupHooks(
  hooks: Hook[],
  ctx: HookCtx,
): Promise<{ states: Record<string, "satisfied">; applied: string[] }> {
  const states: Record<string, "satisfied"> = {};
  const applied: string[] = [];
  for (const h of hooks) {
    if (!h.satisfied(ctx)) {
      await h.apply(ctx);
      applied.push(h.name);
    }
    states[h.name] = "satisfied";
  }
  return { states, applied };
}

export async function runTeardownHooks(hooks: Hook[], ctx: HookCtx): Promise<void> {
  for (const h of hooks) await h.teardown(ctx);
}
