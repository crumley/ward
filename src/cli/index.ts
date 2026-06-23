#!/usr/bin/env node
// Ward CLI — the human shell. Thin plumbing (human-shell seam): every command resolves a workspace,
// calls one domain function, and renders through `output`. Organized noun → verb.

import { Command } from "commander";
import { resolve } from "node:path";
import { detectCaller } from "./context.ts";
import { emit, fail } from "./output.ts";
import { findWorkspaceRoot } from "../store/paths.ts";
import { initWorkspace, addRepo } from "../domain/workspace.ts";
import { loadWorkspace } from "../store/workspace.ts";
import { workspaceStatus } from "../domain/status.ts";

const program = new Command();
program
  .name("ward")
  .description("Operate opinionated, structured human+agent workspaces.")
  .option("-C, --workspace <dir>", "operate on the workspace at <dir>")
  .option("--json", "emit machine-readable JSON (default for agent callers)");

function rootOrFail(cmd: Command, { mustExist = true } = {}): string {
  const opts = program.opts();
  const caller = detectCaller(opts);
  if (opts.workspace) {
    const r = resolve(opts.workspace as string);
    return r;
  }
  const found = findWorkspaceRoot();
  if (!found && mustExist) fail(caller, "not inside a Ward workspace (run `ward init`)");
  return found ?? process.cwd();
}

// ---- workspace ---------------------------------------------------------------------------------

program
  .command("init [dir]")
  .description("create a new Ward workspace")
  .action(async (dir: string | undefined) => {
    const caller = detectCaller(program.opts());
    const root = resolve((program.opts().workspace as string) ?? dir ?? ".");
    try {
      const ws = await initWorkspace(root);
      emit(
        caller,
        `Initialized Ward workspace at ${root}\n  version ${ws.wardVersion} · cast: ${ws.personaCast.join(", ")}`,
        { ok: true, root, workspace: ws },
      );
    } catch (e) {
      fail(caller, (e as Error).message);
    }
  });

program
  .command("status")
  .description("derive and show status across the workspace")
  .action(async () => {
    const caller = detectCaller(program.opts());
    const root = rootOrFail(program);
    try {
      const st = await workspaceStatus(root);
      const lines =
        st.projects.length === 0
          ? "  nothing in flight"
          : st.projects
              .map(
                (p) =>
                  `  floor ${p.floor} ${p.title} [${p.status}]` +
                  (p.tasks.length ? "\n" + p.tasks.map((t) => `    - ${t.title} [${t.state}]`).join("\n") : ""),
              )
              .join("\n");
      emit(caller, `workspace [${st.status}]\n${lines}`, { ok: true, ...st });
    } catch (e) {
      fail(caller, (e as Error).message);
    }
  });

// ---- repo --------------------------------------------------------------------------------------

const repo = program.command("repo").description("repositories the workspace knows");

repo
  .command("add <name> <url>")
  .description("register a repository and create its canonical main checkout")
  .option("--main <branch>", "main branch name (default: the repo's default)")
  .action(async (name: string, url: string, opts: { main?: string }) => {
    const caller = detectCaller(program.opts());
    const root = rootOrFail(program);
    try {
      const ws = await addRepo(root, { name, url, mainBranch: opts.main });
      emit(caller, `Registered repo ${name} (${ws.repos.find((r) => r.name === name)?.mainBranch})`, {
        ok: true,
        repos: ws.repos,
      });
    } catch (e) {
      fail(caller, (e as Error).message);
    }
  });

repo
  .command("list")
  .description("list registered repositories")
  .action(async () => {
    const caller = detectCaller(program.opts());
    const root = rootOrFail(program);
    const ws = await loadWorkspace(root);
    const human = ws.repos.length
      ? ws.repos.map((r) => `  ${r.name} → ${r.mainBranch} (${r.url})`).join("\n")
      : "  (none)";
    emit(caller, `repos:\n${human}`, { ok: true, repos: ws.repos });
  });

program.parseAsync(process.argv).catch((e) => {
  process.stderr.write(`error: ${(e as Error).message}\n`);
  process.exit(1);
});
