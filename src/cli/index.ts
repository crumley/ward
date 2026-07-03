#!/usr/bin/env node
// The human shell (07-human-shell, ADR 0005). Thin plumbing: it parses, resolves
// the workspace + scope from the cwd, calls into domain/, and renders for the
// requested audience. All real logic lives in the core — this file is a map of
// nouns → verbs, nothing more.

import { Command } from 'commander';
import { writeArtifact } from '../domain/artifact.ts';
import { openProject } from '../domain/project.ts';
import { attachWorkspace } from '../domain/recovery.ts';
import { reflectOnScope } from '../domain/reflection.ts';
import {
  advancePrState,
  completeTask,
  linkTaskToRemote,
  listPrs,
  openPrCount,
  trackPr,
} from '../domain/remote.ts';
import { closeRoom, isRoomOccupied, listAllRooms, openRoom } from '../domain/room.ts';
import { closeSession, listSessions, resumeSession } from '../domain/session.ts';
import { projectStatus, workspaceStatus } from '../domain/status.ts';
import { listTasks, loadTask, openTask, pauseTask, unpauseTask } from '../domain/task.ts';
import { initWorkspace } from '../domain/workspace.ts';
import { createWorktree, listWorktrees } from '../domain/worktree.ts';
import { armWake, dispatch, listMessages, listWakes, report } from '../seams/messaging.ts';
import type { RemotePrStateValue } from '../store/schemas.ts';
import { listProjects, requireWorkspaceRoot } from '../store/workspace.ts';
import { WARD_VERSION } from '../version.ts';
import { parseScope, readTextArg } from './context.ts';
import { runDoctor } from './doctor.ts';
import { emit, fail, table } from './output.ts';

const program = new Command();
program
  .name('ward')
  .description('Operate opinionated, structured human+agent workspaces.')
  .version(WARD_VERSION)
  .option('--json', 'machine-readable output for an agent audience')
  .showHelpAfterError();

const cwd = (): string => process.cwd();
const wantJson = (): boolean => program.opts().json === true;
const out = (human: string, data: unknown): void => emit({ json: wantJson() }, human, data);
const root = (): Promise<string> => requireWorkspaceRoot(cwd());

async function guard(fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (err) {
    fail(err instanceof Error ? err.message : String(err));
  }
}

function parseTaskRef(ref: string): { floor: number; slug: string } {
  const [floor, ...rest] = ref.split('/');
  return { floor: Number(floor), slug: rest.join('/') };
}

// ── workspace-level verbs ─────────────────────────────────────────────────────

program
  .command('init')
  .description('Initialize a Ward workspace in the current directory')
  .option('--repo <spec...>', 'a repository as `name` or `name=remote`')
  .action((opts: { repo?: string[] }) =>
    guard(async () => {
      const repos = (opts.repo ?? []).map((spec) => {
        const eq = spec.indexOf('=');
        return eq === -1 ? { name: spec } : { name: spec.slice(0, eq), remote: spec.slice(eq + 1) };
      });
      const ws = await initWorkspace(cwd(), { repos });
      out(`Initialized Ward workspace (ward ${ws.wardVersion}, schema ${ws.schemaVersion}).`, ws);
    }),
  );

program
  .command('doctor')
  .description('Diagnose the machine, the cwd, and the workspace')
  .action(() =>
    guard(async () => {
      const checks = await runDoctor(cwd());
      out(checks.map((c) => `${c.ok ? '✓' : '✗'} ${c.name}: ${c.detail}`).join('\n'), checks);
      if (checks.some((c) => !c.ok)) {
        process.exitCode = 1;
      }
    }),
  );

program
  .command('status')
  .description('Where does everything stand? (status is derived, never stored)')
  .action(() =>
    guard(async () => {
      const r = await root();
      const projects = await listProjects(r);
      const rows: [string, string][] = [];
      const detail: { floor: number; slug: string; status: string }[] = [];
      for (const p of projects) {
        const status = await projectStatus(r, p.floor);
        rows.push([`floor ${p.floor} · ${p.slug}`, status]);
        detail.push({ floor: p.floor, slug: p.slug, status });
      }
      const ws = await workspaceStatus(r);
      out(`workspace: ${ws}\n${table(rows)}`, { workspace: ws, projects: detail });
    }),
  );

program
  .command('attach')
  .description('Cold-start the workspace: re-attach every in-flight thread')
  .action(() =>
    guard(async () => {
      const report_ = await attachWorkspace(await root());
      out(
        `attached ${report_.resumed.length} session(s); ` +
          `wakes fired ${report_.firedWakes.length}, re-armed ${report_.reArmedWakes.length}; ` +
          `worktrees revalidated ${report_.revalidatedWorktrees.length}, skipped ${report_.skippedWorktrees.length}`,
        report_,
      );
    }),
  );

program
  .command('reflect')
  .description('Reflect over a scope arc, producing proposals (map-reduce + cursor)')
  .requiredOption('--scope <scope>', 'scope, e.g. task:1/csv-export')
  .option('--goal <goal>', 'reflection goal', 'scope-boundary')
  .action((opts: { scope: string; goal: string }) =>
    guard(async () => {
      const reflection = await reflectOnScope(await root(), {
        scope: parseScope(opts.scope),
        goal: opts.goal,
      });
      out(
        `reflected ${reflection.scope}/${reflection.goal}: ${reflection.proposals.length} proposal(s), cursor ${reflection.cursor}`,
        reflection,
      );
    }),
  );

// ── project ───────────────────────────────────────────────────────────────────

const project = program.command('project').description('Projects (floors)');
project
  .command('open <title>')
  .option('--slug <slug>')
  .option('--mission <text>')
  .action((title: string, opts: { slug?: string; mission?: string }) =>
    guard(async () => {
      const p = await openProject(await root(), {
        title,
        ...(opts.slug === undefined ? {} : { slug: opts.slug }),
        ...(opts.mission === undefined ? {} : { mission: opts.mission }),
      });
      out(
        `opened floor ${p.floor} (${p.slug}); attending ${p.attending}, charge nurse ${p.chargeNurse}`,
        p,
      );
    }),
  );
project.command('list').action(() =>
  guard(async () => {
    const projects = await listProjects(await root());
    out(table(projects.map((p) => [`floor ${p.floor}`, `${p.slug} — ${p.title}`])), projects);
  }),
);

// ── task ──────────────────────────────────────────────────────────────────────

const task = program.command('task').description('Tasks (units of trackable work)');
task
  .command('open <title>')
  .requiredOption('--floor <n>', 'the project floor', Number)
  .requiredOption('--success <text>', 'the success criteria')
  .option('--slug <slug>')
  .option('--resident <name>')
  .action(
    (title: string, opts: { floor: number; success: string; slug?: string; resident?: string }) =>
      guard(async () => {
        const t = await openTask(await root(), {
          floor: opts.floor,
          title,
          successCriteria: opts.success,
          ...(opts.slug === undefined ? {} : { slug: opts.slug }),
          ...(opts.resident === undefined ? {} : { resident: opts.resident }),
        });
        out(`opened task ${t.floor}/${t.slug} (${t.state}); resident ${t.resident}`, t);
      }),
  );
task
  .command('list')
  .requiredOption('--floor <n>', 'the project floor', Number)
  .action((opts: { floor: number }) =>
    guard(async () => {
      const r = await root();
      const tasks = await listTasks(r, opts.floor);
      const rows: [string, string][] = [];
      for (const t of tasks) {
        const prs = await openPrCount(r, t.floor, t.slug);
        const label = prs > 0 && t.state !== 'closed' ? `${t.state} (in-review)` : t.state;
        rows.push([`${t.floor}/${t.slug}`, label]);
      }
      out(table(rows), tasks);
    }),
  );
for (const [verb, fn] of [
  ['pause', pauseTask],
  ['resume', unpauseTask],
] as const) {
  task
    .command(`${verb} <ref>`)
    .description(`${verb} a task (ref: floor/slug)`)
    .action((ref: string) =>
      guard(async () => {
        const { floor, slug } = parseTaskRef(ref);
        const t = await fn(await root(), floor, slug);
        out(`task ${floor}/${slug} → ${t.state}`, t);
      }),
    );
}
task
  .command('close <ref>')
  .description('close a task — only when all its PRs are merged')
  .action((ref: string) =>
    guard(async () => {
      const { floor, slug } = parseTaskRef(ref);
      const t = await completeTask(await root(), floor, slug);
      out(`task ${floor}/${slug} → ${t.state}`, t);
    }),
  );

// ── worktree ──────────────────────────────────────────────────────────────────

const worktree = program.command('worktree').description('Worktrees (a repo branch checked out)');
worktree
  .command('create')
  .requiredOption('--floor <n>', 'the project floor', Number)
  .requiredOption('--task <slug>')
  .requiredOption('--repo <name>')
  .requiredOption('--branch <name>')
  .action((opts: { floor: number; task: string; repo: string; branch: string }) =>
    guard(async () => {
      const w = await createWorktree(await root(), {
        floor: opts.floor,
        taskSlug: opts.task,
        repo: opts.repo,
        branch: opts.branch,
      });
      out(`created worktree ${w.repo}/${w.branch} — ${w.glyph} ${w.accent}`, w);
    }),
  );
worktree.command('list').action(() =>
  guard(async () => {
    const ws = await listWorktrees(await root());
    out(
      table(
        ws.map((w) => [
          `${w.repo}/${w.branch}`,
          `${w.glyph} ${w.accent}${w.tornDown ? ' (torn down)' : ''}`,
        ]),
      ),
      ws,
    );
  }),
);

// ── room ──────────────────────────────────────────────────────────────────────

const room = program.command('room').description('Rooms (deep work on a worktree)');
room
  .command('open')
  .requiredOption('--floor <n>', 'the project floor', Number)
  .requiredOption('--task <slug>')
  .requiredOption('--repo <name>')
  .requiredOption('--branch <name>')
  .option('--brief <text>', 'brief body — inline, @file, or - for stdin')
  .action((opts: { floor: number; task: string; repo: string; branch: string; brief?: string }) =>
    guard(async () => {
      const r = await root();
      const { room: rm, session } = await openRoom(r, {
        floor: opts.floor,
        taskSlug: opts.task,
        worktree: { repo: opts.repo, branch: opts.branch },
      });
      let briefName: string | undefined;
      if (opts.brief !== undefined) {
        const body = await readTextArg(opts.brief);
        const t = await loadTask(r, opts.floor, opts.task);
        briefName = `brief-${rm.code}`;
        await writeArtifact(r, {
          scope: { kind: 'room', ref: rm.code },
          name: briefName,
          artifactType: 'brief',
          provenance: {
            persona: { name: t.resident, role: 'resident' },
            workingDir: cwd(),
            session: session.id,
            why: `orient room ${rm.code}`,
            derivedFrom: [],
          },
          forScope: { kind: 'room', ref: rm.code },
          summary: `brief for ${rm.code}`,
          body,
        });
        await dispatch(r, { from: t.resident, to: rm.code, body, brief: briefName });
      }
      out(
        `opened room ${rm.code} (${rm.glyph} ${rm.accent}); minted session ${session.id}` +
          (briefName ? `; dispatched ${briefName}` : ''),
        { room: rm, session, brief: briefName ?? null },
      );
    }),
  );
room
  .command('close <code>')
  .description('close a room (frees it once its last session closes)')
  .action((code: string) =>
    guard(async () => {
      await closeRoom(await root(), code);
      out(`room ${code} → free`, { code, occupied: false });
    }),
  );
room.command('list').action(() =>
  guard(async () => {
    const r = await root();
    const rooms = await listAllRooms(r);
    const rows: [string, string][] = [];
    for (const rm of rooms) {
      rows.push([rm.code, (await isRoomOccupied(r, rm.code)) ? 'occupied' : 'free']);
    }
    out(table(rows), rooms);
  }),
);

// ── session ───────────────────────────────────────────────────────────────────

const session = program.command('session').description('Sessions (episodes of agent work)');
session.command('list').action(() =>
  guard(async () => {
    const sessions = await listSessions(await root());
    out(
      table(
        sessions.map((s) => [
          s.id,
          `${s.state} · ${s.scope.kind}:${s.scope.ref} · ${s.persona.role}`,
        ]),
      ),
      sessions,
    );
  }),
);
session.command('resume <id>').action((id: string) =>
  guard(async () => {
    const s = await resumeSession(await root(), id);
    out(`resumed ${s.id} (${s.harness.harness}:${s.harness.runId})`, s);
  }),
);
session.command('close <id>').action((id: string) =>
  guard(async () => {
    const s = await closeSession(await root(), id);
    out(`closed ${s.id}`, s);
  }),
);

// ── messaging ─────────────────────────────────────────────────────────────────

program
  .command('dispatch')
  .description('Dispatch work/context down to a target')
  .requiredOption('--from <id>')
  .requiredOption('--to <id>')
  .requiredOption('--body <text>', 'inline, @file, or -')
  .action((opts: { from: string; to: string; body: string }) =>
    guard(async () => {
      const m = await dispatch(await root(), {
        from: opts.from,
        to: opts.to,
        body: await readTextArg(opts.body),
      });
      out(`dispatched ${m.id}: ${m.from} → ${m.to}`, m);
    }),
  );
program
  .command('report')
  .description('Report status up to a container')
  .requiredOption('--from <id>')
  .requiredOption('--to <id>')
  .requiredOption('--body <text>', 'inline, @file, or -')
  .action((opts: { from: string; to: string; body: string }) =>
    guard(async () => {
      const m = await report(await root(), {
        from: opts.from,
        to: opts.to,
        body: await readTextArg(opts.body),
      });
      out(`reported ${m.id}: ${m.from} → ${m.to}`, m);
    }),
  );
program.command('messages').action(() =>
  guard(async () => {
    const msgs = await listMessages(await root());
    out(table(msgs.map((m) => [m.id, `${m.kind} ${m.from}→${m.to}`])), msgs);
  }),
);

const wake = program.command('wake').description('Wake conditions (detach-and-be-notified)');
wake
  .command('arm')
  .requiredOption('--waiter <id>', 'the session to notify')
  .requiredOption('--kind <kind>', 'room-done | pr-merged | task-closed')
  .requiredOption('--target <id>')
  .action(
    (opts: { waiter: string; kind: 'room-done' | 'pr-merged' | 'task-closed'; target: string }) =>
      guard(async () => {
        const w = await armWake(await root(), opts.waiter, {
          kind: opts.kind,
          target: opts.target,
        });
        out(`armed ${w.id}: notify ${w.waiter} when ${w.condition.kind}(${w.condition.target})`, w);
      }),
  );
wake.command('list').action(() =>
  guard(async () => {
    const wakes = await listWakes(await root());
    out(
      table(wakes.map((w) => [w.id, `${w.state} · ${w.condition.kind}(${w.condition.target})`])),
      wakes,
    );
  }),
);

// ── pr + remote ───────────────────────────────────────────────────────────────

const pr = program.command('pr').description('Pull requests (a task’s completion state)');
pr.command('track')
  .requiredOption('--floor <n>', '', Number)
  .requiredOption('--task <slug>')
  .requiredOption('--repo <name>')
  .option('--number <n>', '', Number)
  .option('--state <state>', 'open|changes-requested|approved|merged')
  .option('--provider <name>', '', 'stub')
  .action(
    (opts: {
      floor: number;
      task: string;
      repo: string;
      number?: number;
      state?: RemotePrStateValue;
      provider: string;
    }) =>
      guard(async () => {
        const tracked = await trackPr(await root(), {
          floor: opts.floor,
          taskSlug: opts.task,
          repo: opts.repo,
          provider: opts.provider,
          ...(opts.number === undefined ? {} : { number: opts.number }),
          ...(opts.state === undefined ? {} : { state: opts.state }),
        });
        out(`tracking PR ${tracked.id} (${tracked.state})`, tracked);
      }),
  );
pr.command('advance')
  .requiredOption('--floor <n>', '', Number)
  .requiredOption('--task <slug>')
  .requiredOption('--id <id>')
  .requiredOption('--state <state>', 'open|changes-requested|approved|merged')
  .action((opts: { floor: number; task: string; id: string; state: RemotePrStateValue }) =>
    guard(async () => {
      const advanced = await advancePrState(
        await root(),
        opts.floor,
        opts.task,
        opts.id,
        opts.state,
      );
      out(`PR ${advanced.id} → ${advanced.state}`, advanced);
    }),
  );
pr.command('list')
  .requiredOption('--floor <n>', '', Number)
  .requiredOption('--task <slug>')
  .action((opts: { floor: number; task: string }) =>
    guard(async () => {
      const prs = await listPrs(await root(), opts.floor, opts.task);
      out(table(prs.map((p) => [p.id, p.state])), prs);
    }),
  );

const remote = program.command('remote').description('Remote linkage');
remote
  .command('link')
  .requiredOption('--floor <n>', '', Number)
  .requiredOption('--task <slug>')
  .requiredOption('--provider <name>')
  .requiredOption('--id <id>')
  .option('--url <url>')
  .action((opts: { floor: number; task: string; provider: string; id: string; url?: string }) =>
    guard(async () => {
      const t = await linkTaskToRemote(await root(), opts.floor, opts.task, {
        provider: opts.provider,
        id: opts.id,
        ...(opts.url === undefined ? {} : { url: opts.url }),
      });
      out(`linked ${t.floor}/${t.slug} → ${opts.provider}:${opts.id}`, t);
    }),
  );

program
  .parseAsync(process.argv)
  .catch((err) => fail(err instanceof Error ? err.message : String(err)));
