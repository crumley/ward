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
import { openProject } from "../domain/project.ts";
import { openTask } from "../domain/task.ts";
import { createWorktree } from "../domain/worktree.ts";
import { openRoom, closeRoom, roomWorkingDir } from "../domain/room.ts";
import { findRoom } from "../domain/resolve.ts";
import { openSession, closeSession, resumeSession, sessionStates } from "../domain/session.ts";
import { defaultFor } from "../domain/personas.ts";
import {
  dispatch,
  report,
  armWake,
  listWakes,
  satisfyCondition,
  listMessages,
} from "../seams/messaging.ts";

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

// ---- project -----------------------------------------------------------------------------------

const project = program.command("project").description("projects (floors)");
project
  .command("open <title...>")
  .description("open a project (allocates the next floor number)")
  .action(async (titleParts: string[]) => {
    const caller = detectCaller(program.opts());
    const root = rootOrFail(program);
    try {
      const r = await openProject(root, titleParts.join(" "));
      emit(
        caller,
        `Opened ${r.project.theme.glyph} floor ${r.floor} — ${r.project.title} (${r.project.theme.accent})\n  session ${r.session} · handle ${r.handle}`,
        { ok: true, ...r },
      );
    } catch (e) {
      fail(caller, (e as Error).message);
    }
  });

// ---- task --------------------------------------------------------------------------------------

const task = program.command("task").description("tasks (units of deliverable work)");
task
  .command("open <title...>")
  .description("open a task under a floor")
  .requiredOption("--floor <n>", "floor (project) number")
  .option("--repo <name...>", "repositories the task touches")
  .option("--success <criterion...>", "success criteria")
  .action(async (titleParts: string[], opts: { floor: string; repo?: string[]; success?: string[] }) => {
    const caller = detectCaller(program.opts());
    const root = rootOrFail(program);
    try {
      const r = await openTask(root, opts.floor, titleParts.join(" "), {
        repos: opts.repo,
        successCriteria: opts.success,
      });
      emit(
        caller,
        `Opened ${r.task.theme.glyph} task ${r.task.identity.slug} [${r.task.state}] (resident ${r.task.resident})\n  session ${r.session}`,
        { ok: true, ...r },
      );
    } catch (e) {
      fail(caller, (e as Error).message);
    }
  });

// ---- worktree ----------------------------------------------------------------------------------

const worktree = program.command("worktree").description("git worktrees a task changes");
worktree
  .command("create")
  .description("create a real git worktree off the repo's main and run setup hooks")
  .requiredOption("--floor <n>", "floor number")
  .requiredOption("--task <slug>", "task slug")
  .requiredOption("--repo <name>", "repository")
  .option("--branch <branch>", "branch name (default: task slug)")
  .action(async (opts: { floor: string; task: string; repo: string; branch?: string }) => {
    const caller = detectCaller(program.opts());
    const root = rootOrFail(program);
    try {
      const r = await createWorktree(root, opts.floor, opts.task, opts.repo, opts.branch);
      emit(
        caller,
        `Created ${r.worktree.theme.glyph} worktree ${r.worktree.repo}:${r.worktree.branch} (${r.worktree.theme.accent})\n  hooks applied: ${r.applied.join(", ") || "(all already satisfied)"}\n  at ${r.worktree.path}`,
        { ok: true, ...r },
      );
    } catch (e) {
      fail(caller, (e as Error).message);
    }
  });

// ---- room --------------------------------------------------------------------------------------

const room = program.command("room").description("rooms (deep-work scopes on a worktree)");
room
  .command("open")
  .description("open a room on a worktree, with a brief")
  .requiredOption("--floor <n>", "floor number")
  .requiredOption("--task <slug>", "task slug")
  .requiredOption("--repo <name>", "worktree repository")
  .requiredOption("--branch <branch>", "worktree branch")
  .requiredOption("--brief <title>", "brief title")
  .option("--body <text>", "brief body", "")
  .action(
    async (opts: {
      floor: string;
      task: string;
      repo: string;
      branch: string;
      brief: string;
      body: string;
    }) => {
      const caller = detectCaller(program.opts());
      const root = rootOrFail(program);
      try {
        const resident = defaultFor("resident").name;
        const r = await openRoom(root, opts.floor, opts.task, {
          worktree: `${opts.repo}:${opts.branch}`,
          briefTitle: opts.brief,
          briefBody: opts.body || `Brief: ${opts.brief}`,
          residentPersona: resident,
        });
        emit(
          caller,
          `Opened ${r.room.theme.glyph} room ${r.code} (${r.room.theme.accent}) on ${r.room.worktree}\n  brief: ${r.brief}`,
          { ok: true, ...r },
        );
      } catch (e) {
        fail(caller, (e as Error).message);
      }
    },
  );
room
  .command("close <code>")
  .description("close a room (closed stays closed)")
  .action(async (code: string) => {
    const caller = detectCaller(program.opts());
    const root = rootOrFail(program);
    try {
      const r = await closeRoom(root, code);
      emit(caller, r.idempotent ? `room ${code} already closed` : `Closed room ${code}`, {
        ok: true,
        code,
        ...r,
      });
    } catch (e) {
      fail(caller, (e as Error).message);
    }
  });

// ---- session -----------------------------------------------------------------------------------

const session = program.command("session").description("agent sessions at a scope");
session
  .command("open")
  .description("open a session in a room")
  .requiredOption("--room <code>", "room code (e.g. 1A1)")
  .option("--persona <name>", "persona (default: medical student)")
  .action(async (opts: { room: string; persona?: string }) => {
    const caller = detectCaller(program.opts());
    const root = rootOrFail(program);
    try {
      const persona = opts.persona ?? defaultFor("medical-student").name;
      const wd = await roomWorkingDir(root, opts.room);
      const ws = await loadWorkspace(root);
      const tier = defaultFor("medical-student").modelTier;
      const r = await openSession(root, wd.rDir, {
        scope: `room:${opts.room}`,
        persona,
        model: ws.modelDefaults[tier] ?? tier,
        cwd: wd.worktreePath,
      });
      emit(caller, `Opened session ${r.session} in room ${opts.room}\n  handle ${r.handle} · cwd ${wd.worktreePath}`, {
        ok: true,
        room: opts.room,
        ...r,
      });
    } catch (e) {
      fail(caller, (e as Error).message);
    }
  });
session
  .command("resume")
  .description("resume an open session (idempotent; closed stays closed)")
  .requiredOption("--room <code>", "room code")
  .requiredOption("--session <id>", "session id")
  .action(async (opts: { room: string; session: string }) => {
    const caller = detectCaller(program.opts());
    const root = rootOrFail(program);
    try {
      const loc = await findRoom(root, opts.room);
      if (!loc) throw new Error(`no room ${opts.room}`);
      const r = await resumeSession(root, loc.rDir, opts.session);
      emit(caller, `Resumed session ${opts.session} (handle ${r.handle})`, { ok: true, ...r });
    } catch (e) {
      fail(caller, (e as Error).message);
    }
  });
session
  .command("close")
  .description("close a session (closed stays closed)")
  .requiredOption("--room <code>", "room code")
  .requiredOption("--session <id>", "session id")
  .action(async (opts: { room: string; session: string }) => {
    const caller = detectCaller(program.opts());
    const root = rootOrFail(program);
    try {
      const loc = await findRoom(root, opts.room);
      if (!loc) throw new Error(`no room ${opts.room}`);
      const r = await closeSession(loc.rDir, opts.session);
      emit(caller, r.idempotent ? `session ${opts.session} already closed` : `Closed session ${opts.session}`, {
        ok: true,
        ...r,
      });
    } catch (e) {
      fail(caller, (e as Error).message);
    }
  });
session
  .command("list")
  .description("list sessions at a room and their derived states")
  .requiredOption("--room <code>", "room code")
  .action(async (opts: { room: string }) => {
    const caller = detectCaller(program.opts());
    const root = rootOrFail(program);
    try {
      const loc = await findRoom(root, opts.room);
      if (!loc) throw new Error(`no room ${opts.room}`);
      const states = [...(await sessionStates(loc.rDir)).values()];
      const human = states.length
        ? states.map((s) => `  ${s.session} [${s.state}] persona=${s.persona ?? "?"} handle=${s.handle ?? "?"}`).join("\n")
        : "  (none)";
      emit(caller, `sessions in ${opts.room}:\n${human}`, { ok: true, room: opts.room, sessions: states });
    } catch (e) {
      fail(caller, (e as Error).message);
    }
  });

// ---- messaging: dispatch / report / wake -------------------------------------------------------

program
  .command("dispatch")
  .description("dispatch work/context down to a target (recorded-first)")
  .requiredOption("--to <target>", "target identity (e.g. room 1A1)")
  .requiredOption("--body <text>", "what is dispatched")
  .option("--ref <name>", "an artifact/brief referenced")
  .option("--from <who>", "sender (default: resident)")
  .action(async (opts: { to: string; body: string; ref?: string; from?: string }) => {
    const caller = detectCaller(program.opts());
    const root = rootOrFail(program);
    try {
      const from = opts.from ?? defaultFor("resident").name;
      const m = await dispatch(root, { from, to: opts.to, ref: opts.ref, body: opts.body });
      emit(caller, `Dispatched ${from} → ${opts.to}${opts.ref ? ` (ref ${opts.ref})` : ""} [${m.id}]`, {
        ok: true,
        message: m,
      });
    } catch (e) {
      fail(caller, (e as Error).message);
    }
  });

program
  .command("report <target> <status>")
  .description("report status upward; satisfies any wake on <target>:<status>")
  .option("--to <who>", "container scope receiving the report (default: resident)")
  .option("--body <text>", "report detail", "")
  .action(async (target: string, status: string, opts: { to?: string; body?: string }) => {
    const caller = detectCaller(program.opts());
    const root = rootOrFail(program);
    try {
      const to = opts.to ?? defaultFor("resident").name;
      const m = await report(root, {
        from: target,
        to,
        body: opts.body || `${target} reports ${status}`,
      });
      // A report of "<status>" satisfies a wake armed on "<target>:<status>" (walkthrough §6).
      const condition = `${target}:${status}`;
      const w = await satisfyCondition(root, condition);
      const note = w.fired.length
        ? `woke ${w.fired.length} (${w.fired.join(", ")})`
        : w.alreadySatisfied.length
          ? `already satisfied (fires once)`
          : `no wake armed on ${condition}`;
      emit(caller, `Reported ${target} ${status} → ${to}; ${note}`, {
        ok: true,
        message: m,
        condition,
        ...w,
      });
    } catch (e) {
      fail(caller, (e as Error).message);
    }
  });

const wake = program.command("wake").description("wake/nudge conditions");
wake
  .command("arm")
  .description("arm a wake: notify the armer when a condition is met")
  .requiredOption("--on <condition>", "condition, e.g. 1A1:done")
  .option("--armer <who>", "who to wake (default: resident)")
  .action(async (opts: { on: string; armer?: string }) => {
    const caller = detectCaller(program.opts());
    const root = rootOrFail(program);
    try {
      const armer = opts.armer ?? defaultFor("resident").name;
      const r = await armWake(root, { condition: opts.on, armer });
      emit(caller, `Armed wake [${r.id}] for ${armer} on \`${opts.on}\``, { ok: true, ...r });
    } catch (e) {
      fail(caller, (e as Error).message);
    }
  });
wake
  .command("list")
  .description("list wakes and their derived state (armed/satisfied)")
  .action(async () => {
    const caller = detectCaller(program.opts());
    const root = rootOrFail(program);
    const wakes = await listWakes(root);
    const human = wakes.length
      ? wakes.map((w) => `  [${w.state}] ${w.condition} → ${w.armer} (${w.id})`).join("\n")
      : "  (none)";
    emit(caller, `wakes:\n${human}`, { ok: true, wakes });
  });

program
  .command("messages")
  .description("inspect the recorded message flow (dispatch/report)")
  .option("--to <target>", "filter by recipient")
  .option("--from <who>", "filter by sender")
  .action(async (opts: { to?: string; from?: string }) => {
    const caller = detectCaller(program.opts());
    const root = rootOrFail(program);
    const msgs = await listMessages(root, opts);
    const human = msgs.length
      ? msgs.map((m) => `  ${m.kind} ${m.from} → ${m.to}${m.ref ? ` (ref ${m.ref})` : ""}: ${m.body}`).join("\n")
      : "  (none)";
    emit(caller, `messages:\n${human}`, { ok: true, messages: msgs });
  });

program.parseAsync(process.argv).catch((e) => {
  process.stderr.write(`error: ${(e as Error).message}\n`);
  process.exit(1);
});
