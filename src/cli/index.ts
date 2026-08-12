#!/usr/bin/env bun
// ward — the Ward CLI. Thin plumbing over the modules below it
// (intent/02-subsystems/07-human-shell.md): optique parses the noun/verb
// tree, the workspace modules do the work, and this layer renders results.
// See design/0001-dev-foundation/ and design/0002-store-and-workspace/.
import { object, or } from '@optique/core/constructs';
import { message } from '@optique/core/message';
import { multiple, optional, withDefault } from '@optique/core/modifiers';
import { argument, command, constant, option } from '@optique/core/primitives';
import { choice, integer, string } from '@optique/core/valueparser';
import { run } from '@optique/run';
import picocolors from 'picocolors';
import pkg from '../../package.json' with { type: 'json' };
import { WardError } from '../errors.ts';
import { type PrForgeState, probeForge } from '../forge/gh.ts';
import type { TaskRecord, WorkState } from '../store/types.ts';
import { createWorkspace, type StepReport } from '../workspace/create.ts';
import { type Finding, runDoctor } from '../workspace/doctor.ts';
import { discoverWorkspace } from '../workspace/layout.ts';
import { openProject, readProjects } from '../workspace/projects.ts';
import {
  addRepository,
  listRepositories,
  type RefreshReport,
  refreshRepositories,
} from '../workspace/repos.ts';
import { readTasks } from '../workspace/scan.ts';
import { scopeFromCwd } from '../workspace/scope.ts';
import { closeSession, openSession } from '../workspace/sessions.ts';
import {
  deriveStatus,
  forgeStates,
  inReview,
  type NeedsYouEntry,
  openPrUrls,
  statusReport,
  type TaskStatus,
} from '../workspace/status.ts';
import { addTaskPr, closeTask, openTask, setTaskState } from '../workspace/tasks.ts';
import {
  createWorktree,
  listWorktrees,
  type RebaseReport,
  rebaseTaskWorktrees,
  type WorktreeStatus,
} from '../workspace/worktrees.ts';
import { callerIsAgent } from './caller.ts';
import {
  doctorJson,
  printJson,
  projectListJson,
  projectOpenJson,
  repoAddJson,
  repoListJson,
  repoRefreshJson,
  sessionMutationJson,
  statusJson,
  taskCloseJson,
  taskListJson,
  taskMutationJson,
  workspaceCreateJson,
  worktreeCreateJson,
  worktreeListJson,
  worktreeRebaseJson,
} from './json.ts';
import { allSchemasJson, verbSchemaJson } from './schema.ts';
import { recordInvocation } from './telemetry.ts';

// Local usage telemetry, armed before anything can exit: one row per
// invocation — read verbs included — appended at process exit so it carries
// the outcome, covers optique's own help/usage exits, and costs the command
// nothing while it runs (design/0013-telemetry-and-serialized-writes/).
recordInvocation(process.argv.slice(2));

// A declared agent gets deterministic output: no ANSI, whatever the terminal
// or CI environment would otherwise negotiate (the §8 asymmetry — color is a
// human-audience cue). Interactive affordances, when the shell grows them,
// must branch on the same predicate and never block an agent caller.
const pc = callerIsAgent() ? picocolors.createColors(false) : picocolors;

/**
 * `--json`: the machine-readable form of a verb — read verbs since 0005,
 * mutation reports since design/0015-mutation-json/.
 */
function jsonFlag() {
  return option('--json', {
    description: message`Emit the result as JSON on stdout (a stable, documented shape).`,
  });
}

const workspaceCreate = command(
  'create',
  object({
    action: constant('workspace-create'),
    path: argument(string({ metavar: 'PATH' })),
    json: jsonFlag(),
  }),
  {
    brief: message`Create a Ward workspace at PATH (re-running converges).`,
  },
);

const workspace = command('workspace', workspaceCreate, {
  brief: message`Operate on a workspace.`,
});

const repoAdd = command(
  'add',
  object({
    action: constant('repo-add'),
    source: argument(string({ metavar: 'SOURCE' })),
    name: optional(option('--name', string({ metavar: 'NAME' }))),
    json: jsonFlag(),
  }),
  { brief: message`Register a repository: clone a URL or adopt a local checkout.` },
);

const repoRefresh = command(
  'refresh',
  object({
    action: constant('repo-refresh'),
    name: optional(argument(string({ metavar: 'NAME' }))),
    json: jsonFlag(),
  }),
  { brief: message`Fetch and fast-forward canonical checkouts to their main lines.` },
);

const repoList = command('list', object({ action: constant('repo-list'), json: jsonFlag() }), {
  brief: message`List the registered repositories.`,
});

const repo = command('repo', or(repoAdd, repoRefresh, repoList), {
  brief: message`Operate on the workspace's registered repositories.`,
});

const project = command(
  'project',
  or(
    command(
      'open',
      object({
        action: constant('project-open'),
        slug: argument(string({ metavar: 'SLUG' })),
        json: jsonFlag(),
      }),
      { brief: message`Open a project; it takes the next floor number.` },
    ),
    command('list', object({ action: constant('project-list'), json: jsonFlag() }), {
      brief: message`List projects with their derived status.`,
    }),
  ),
  { brief: message`Operate on projects (floors).` },
);

const task = command(
  'task',
  or(
    command(
      'open',
      object({
        action: constant('task-open'),
        slug: argument(string({ metavar: 'SLUG' })),
        project: optional(option('--project', integer({ metavar: 'FLOOR' }))),
        purpose: optional(option('--purpose', string({ metavar: 'TEXT' }))),
        json: jsonFlag(),
      }),
      { brief: message`Open a task, bare or under a project floor.` },
    ),
    command('list', object({ action: constant('task-list'), json: jsonFlag() }), {
      brief: message`List tasks, open and closed.`,
    }),
    command(
      'pause',
      object({
        action: constant('task-pause'),
        code: optional(argument(string({ metavar: 'CODE' }))),
        json: jsonFlag(),
      }),
      { brief: message`Set a task down, resumable. CODE is inferred inside a task's worktree.` },
    ),
    command(
      'resume',
      object({
        action: constant('task-resume'),
        code: optional(argument(string({ metavar: 'CODE' }))),
        json: jsonFlag(),
      }),
      { brief: message`Pick a paused task back up. CODE is inferred inside a task's worktree.` },
    ),
    command(
      'pr',
      // Two arities, the one-argument form first: optique commits to the first
      // alternative whose full parse succeeds, so `pr URL` binds URL and
      // `pr CODE URL` falls through to the explicit form.
      or(
        object({
          action: constant('task-pr'),
          url: argument(string({ metavar: 'URL' })),
          json: jsonFlag(),
        }),
        object({
          action: constant('task-pr'),
          code: argument(string({ metavar: 'CODE' })),
          url: argument(string({ metavar: 'URL' })),
          json: jsonFlag(),
        }),
      ),
      { brief: message`Link a pull request to a task. CODE is inferred inside a task's worktree.` },
    ),
    command(
      'close',
      object({
        action: constant('task-close'),
        code: argument(string({ metavar: 'CODE' })),
        outcome: withDefault(
          option('--outcome', choice(['delivered', 'abandoned'])),
          'delivered' as const,
        ),
        json: jsonFlag(),
      }),
      { brief: message`Close a task: PR set resolved, worktrees torn down, outcome recorded.` },
    ),
  ),
  { brief: message`Operate on tasks — the unit of trackable work.` },
);

const worktree = command(
  'worktree',
  or(
    command(
      'create',
      object({
        action: constant('worktree-create'),
        task: optional(argument(string({ metavar: 'TASK' }))),
        repo: option('--repo', string({ metavar: 'NAME' })),
        branch: optional(option('--branch', string({ metavar: 'NAME' }))),
        json: jsonFlag(),
      }),
      { brief: message`Create a deliverable worktree off the refreshed main line.` },
    ),
    command(
      'rebase',
      object({
        action: constant('worktree-rebase'),
        task: optional(argument(string({ metavar: 'TASK' }))),
        json: jsonFlag(),
      }),
      {
        brief: message`Rebase a task's worktrees onto the refreshed main line, never through a dirty tree.`,
      },
    ),
    command('list', object({ action: constant('worktree-list'), json: jsonFlag() }), {
      brief: message`List worktrees across all tasks.`,
    }),
  ),
  { brief: message`Operate on task worktrees.` },
);

const session = command(
  'session',
  or(
    command(
      'open',
      object({
        action: constant('session-open'),
        task: optional(argument(string({ metavar: 'TASK' }))),
        purpose: option('--purpose', string({ metavar: 'TEXT' })),
        handle: optional(option('--handle', string({ metavar: 'TEXT' }))),
        dir: optional(option('--dir', string({ metavar: 'PATH' }))),
        json: jsonFlag(),
      }),
      { brief: message`Record a session on a task (you run the agent yourself).` },
    ),
    command(
      'close',
      object({
        action: constant('session-close'),
        id: argument(string({ metavar: 'ID' })),
        json: jsonFlag(),
      }),
      { brief: message`Close a session record; closed stays closed.` },
    ),
  ),
  { brief: message`Record agent sessions.` },
);

const status = command('status', object({ action: constant('status'), json: jsonFlag() }), {
  brief: message`Where everything stands — derived from the leaves, never stored.`,
});

const doctor = command('doctor', object({ action: constant('doctor'), json: jsonFlag() }), {
  brief: message`Check machine preconditions and, inside a workspace, its integrity.`,
});

// The self-describing contract (design/0008-json-shape-home/): the verb is
// named by its own CLI words (`ward schema task list`), so discovering a
// shape and invoking its verb agree by construction. Needs no workspace —
// the contract is the build's, not the record's.
const schema = command(
  'schema',
  object({
    action: constant('schema'),
    verb: multiple(argument(string({ metavar: 'VERB' }))),
  }),
  {
    brief: message`Emit the JSON Schema of a --json read verb's output (all verbs when none given).`,
  },
);

const version = object({
  version: option('-v', '--version', {
    description: message`Print the ward version.`,
  }),
});

// Bare `ward` (no arguments) keeps its 0001 behavior — version plus a help
// pointer — handled before optique, whose or-of-commands rejects empty input.
if (process.argv.length === 2) {
  printVersion(false);
  process.exit(0);
}

const cli = or(workspace, repo, project, task, worktree, session, status, doctor, schema, version);
const result = run(cli, { programName: 'ward', help: 'option' });

try {
  if ('action' in result) {
    switch (result.action) {
      case 'workspace-create':
        await cmdWorkspaceCreate(result.path, result.json);
        break;
      case 'repo-add':
        await cmdRepoAdd(result.source, result.name, result.json);
        break;
      case 'repo-refresh':
        await cmdRepoRefresh(result.name, result.json);
        break;
      case 'repo-list':
        await cmdRepoList(result.json);
        break;
      case 'project-open': {
        const record = await openProject(requireWorkspace(), result.slug);
        if (result.json) {
          printJson(projectOpenJson(record));
          break;
        }
        console.log(
          `${pc.green('opened')} floor ${pc.bold(String(record.floor))} — ${record.slug}`,
        );
        break;
      }
      case 'project-list':
        await cmdProjectList(result.json);
        break;
      case 'task-open': {
        const opened = await openTask(requireWorkspace(), result.slug, {
          ...(result.project === undefined ? {} : { floor: result.project }),
          ...(result.purpose === undefined ? {} : { purpose: result.purpose }),
        });
        if (result.json) {
          printJson(taskMutationJson(opened.record));
          break;
        }
        console.log(
          `${pc.green('opened')} task ${pc.bold(opened.record.code)} — ${opened.record.slug}` +
            (opened.record.floor === undefined ? '' : pc.dim(` (floor ${opened.record.floor})`)),
        );
        break;
      }
      case 'task-list':
        await cmdTaskList(result.json);
        break;
      case 'task-pause': {
        const target = await resolveTaskTarget(result.code, 'ward task pause CODE', result.json);
        const paused = await setTaskState(target.root, target.code, 'paused');
        if (result.json) {
          printJson(taskMutationJson(paused.record));
          break;
        }
        console.log(
          `${pc.yellow('paused')} ${pc.bold(paused.record.code)} — ${paused.record.slug}`,
        );
        break;
      }
      case 'task-resume': {
        const target = await resolveTaskTarget(result.code, 'ward task resume CODE', result.json);
        const resumed = await setTaskState(target.root, target.code, 'active');
        if (result.json) {
          printJson(taskMutationJson(resumed.record));
          break;
        }
        console.log(
          `${pc.green('resumed')} ${pc.bold(resumed.record.code)} — ${resumed.record.slug}`,
        );
        break;
      }
      case 'task-pr': {
        const code = 'code' in result ? result.code : undefined;
        const target = await resolveTaskTarget(code, 'ward task pr CODE URL', result.json);
        const linked = await addTaskPr(target.root, target.code, result.url);
        if (result.json) {
          printJson(taskMutationJson(linked.record));
          break;
        }
        console.log(
          `${pc.green('linked')} ${result.url} ${pc.dim(`(${linked.record.prs.length} in the set)`)}`,
        );
        break;
      }
      case 'task-close':
        await cmdTaskClose(result.code, result.outcome, result.json);
        break;
      case 'worktree-create': {
        const target = await resolveTaskTarget(
          result.task,
          'ward worktree create TASK --repo NAME',
          result.json,
        );
        const created = await createWorktree(target.root, target.code, result.repo, result.branch);
        if (result.json) {
          printJson(worktreeCreateJson(created.task.record.code, created.record));
          break;
        }
        console.log(
          `${pc.green('created')} ${created.record.path} ` +
            pc.dim(`(${created.record.repo}, branch ${created.record.branch}, deliverable)`),
        );
        break;
      }
      case 'worktree-rebase': {
        const target = await resolveTaskTarget(
          result.task,
          'ward worktree rebase TASK',
          result.json,
        );
        await cmdWorktreeRebase(target.root, target.code, result.json);
        break;
      }
      case 'worktree-list':
        await cmdWorktreeList(result.json);
        break;
      case 'session-open': {
        const target = await resolveTaskTarget(
          result.task,
          'ward session open TASK --purpose TEXT',
          result.json,
        );
        // An inferred task pins the working directory too: the caller stands
        // in the very worktree the record should name (unless --dir overrides).
        const dir = result.dir ?? target.worktreePath;
        const opened = await openSession(target.root, target.code, result.purpose, {
          ...(result.handle === undefined ? {} : { handle: result.handle }),
          ...(dir === undefined ? {} : { workingDirectory: dir }),
        });
        if (result.json) {
          printJson(sessionMutationJson(opened));
          break;
        }
        console.log(
          `${pc.green('opened')} session ${pc.bold(opened.id)} ` +
            pc.dim(`(in ${opened.workingDirectory})`),
        );
        break;
      }
      case 'session-close': {
        const closed = await closeSession(requireWorkspace(), result.id);
        if (result.json) {
          printJson(sessionMutationJson(closed));
          break;
        }
        console.log(`${pc.dim('closed')} session ${pc.bold(closed.id)}`);
        break;
      }
      case 'status':
        await cmdStatus(result.json);
        break;
      case 'doctor':
        await cmdDoctor(result.json);
        break;
      case 'schema':
        cmdSchema(result.verb);
        break;
    }
  } else {
    printVersion(result.version);
  }
} catch (error) {
  if (error instanceof WardError) {
    console.error(`${pc.red('error:')} ${error.message}`);
    process.exit(1);
  }
  throw error;
}

// -- rendering ------------------------------------------------------------

function printVersion(explicit: boolean): void {
  const versionLine = `${pc.bold('ward')} ${pc.cyan(pkg.version)}`;
  if (explicit) {
    console.log(versionLine);
  } else {
    // Bare `ward`: version plus a one-line pointer at help.
    console.log(`${versionLine} — ${pkg.description}`);
    console.log(pc.dim('run `ward --help` for usage'));
  }
}

async function cmdWorkspaceCreate(path: string, json: boolean): Promise<void> {
  const report = await createWorkspace(path);
  if (json) {
    printJson(workspaceCreateJson(report));
    return;
  }
  console.log(`Workspace at ${pc.bold(report.root)}\n`);
  for (const step of report.steps) {
    console.log(`  ${renderOutcome(step)}  ${step.step} ${pc.dim(`(${step.detail})`)}`);
  }
  const established = report.steps.filter((step) => step.outcome === 'established').length;
  const satisfied = report.steps.length - established;
  console.log(`\nWorkspace ready — ${established} established, ${satisfied} already satisfied.`);
}

function renderOutcome(step: StepReport): string {
  return step.outcome === 'established' ? pc.green('established') : pc.dim('  satisfied');
}

/** Resolve the enclosing workspace or fail legibly — for verbs that need one. */
function requireWorkspace(): string {
  const root = discoverWorkspace(process.cwd());
  if (root === null) {
    throw new WardError(
      'no Ward workspace encloses this directory — create one with: ward workspace create PATH',
    );
  }
  return root;
}

interface TaskTarget {
  readonly root: string;
  readonly code: string;
  /** The claiming worktree's path, only when the task was inferred from the cwd. */
  readonly worktreePath?: string;
}

/**
 * Resolve the task a verb addresses: an explicit code always wins; without
 * one, a human standing inside a claimed worktree gets the task the location
 * already implies (intent/02-subsystems/07-human-shell.md), echoed so the
 * derivation is visible. A declared agent is refused the inference and a
 * caller standing nowhere claimed gets a deterministic error naming the fix —
 * never a prompt (design/0006-scope-from-cwd/).
 */
async function resolveTaskTarget(
  explicit: string | undefined,
  usage: string,
  json = false,
): Promise<TaskTarget> {
  const root = requireWorkspace();
  if (explicit !== undefined) return { root, code: explicit };
  if (callerIsAgent()) {
    throw new WardError(
      `no task given — a declared agent passes scope explicitly: ${usage} ` +
        '(see: ward task list --json)',
    );
  }
  const scope = await scopeFromCwd(root, process.cwd());
  if (scope === null) {
    throw new WardError(
      `no task given and no task worktree encloses this directory — name one: ${usage} ` +
        '(see: ward task list)',
    );
  }
  // Under --json the derivation echo moves to stderr: stdout carries one JSON
  // document, alone (0005), and the echo is a human affordance, not data.
  const echo = json ? console.error : console.log;
  echo(pc.dim(`task ${scope.task.record.code} — from the working directory`));
  return { root, code: scope.task.record.code, worktreePath: scope.worktree.path };
}

async function cmdRepoAdd(source: string, name: string | undefined, json: boolean): Promise<void> {
  const root = requireWorkspace();
  const report = await addRepository(root, source, name);
  if (json) {
    printJson(repoAddJson(report));
    return;
  }
  const verb = {
    registered: pc.green('registered'),
    converged: pc.green('converged'),
    satisfied: pc.dim('already registered'),
  }[report.outcome];
  console.log(`${verb} ${pc.bold(report.record.name)}`);
  console.log(`  remote    ${report.record.remote}`);
  console.log(`  main line ${report.record.mainLine}`);
  console.log(`  checkout  ${pc.dim(`repos/${report.record.name}/`)}`);
}

async function cmdRepoRefresh(name: string | undefined, json: boolean): Promise<void> {
  const root = requireWorkspace();
  const reports = await refreshRepositories(root, name);
  if (json) {
    // The document is emitted whatever the rows say; a failed row keeps the
    // human path's exit-1 verdict — the caller reads the outcome from the
    // document and the verdict from $?, and the two never disagree (0005's
    // doctor posture).
    printJson(repoRefreshJson(reports));
    if (reports.some((report) => report.outcome === 'failed')) process.exit(1);
    return;
  }
  if (reports.length === 0) {
    console.log(pc.dim('no repositories registered — add one with: ward repo add SOURCE'));
    return;
  }
  for (const report of reports) {
    console.log(`  ${renderRefresh(report)}  ${report.name} ${pc.dim(`(${report.detail})`)}`);
  }
  if (reports.some((report) => report.outcome === 'failed')) process.exit(1);
}

function renderRefresh(report: RefreshReport): string {
  return {
    refreshed: pc.green('refreshed'),
    current: pc.dim('  current'),
    dirty: pc.yellow('    dirty'),
    failed: pc.red('   failed'),
  }[report.outcome];
}

async function cmdRepoList(json: boolean): Promise<void> {
  const root = requireWorkspace();
  const records = await listRepositories(root);
  if (json) {
    printJson(repoListJson(records));
    return;
  }
  if (records.length === 0) {
    console.log(pc.dim('no repositories registered — add one with: ward repo add SOURCE'));
    return;
  }
  for (const record of records) {
    console.log(
      `  ${pc.bold(record.name)} ${pc.dim('—')} ${record.remote} ${pc.dim(`(${record.mainLine})`)}`,
    );
  }
}

function renderState(state: WorkState): string {
  return { active: pc.green('active'), paused: pc.yellow('paused'), closed: pc.dim('closed') }[
    state
  ];
}

async function cmdProjectList(json: boolean): Promise<void> {
  const root = requireWorkspace();
  const projects = await readProjects(root);
  const tasks = await readTasks(root);
  const entries = projects.map((project) => {
    const own = tasks.filter((task) => task.dir.startsWith(`${project.dir}/`));
    const derived =
      project.record.state === 'active'
        ? deriveStatus(own.map((task) => task.record.state))
        : project.record.state;
    return { record: project.record, derived, taskCount: own.length };
  });
  if (json) {
    printJson(projectListJson(entries));
    return;
  }
  if (entries.length === 0) {
    console.log(pc.dim('no projects — open one with: ward project open SLUG'));
    return;
  }
  for (const entry of entries) {
    console.log(
      `  floor ${pc.bold(String(entry.record.floor))} — ${entry.record.slug} ` +
        `[${renderState(entry.derived)}] ${pc.dim(`(${entry.taskCount} tasks)`)}`,
    );
  }
}

async function cmdTaskList(json: boolean): Promise<void> {
  const root = requireWorkspace();
  const tasks = await readTasks(root);
  const probe = await probeForge(openPrUrls(tasks.map((task) => task.record)));
  const entries = tasks.map(({ record }) => {
    const forge = forgeStates(record, probe);
    return {
      record,
      inReview: inReview(record, forge),
      ...(forge === undefined ? {} : { forge }),
    };
  });
  if (json) {
    printJson(taskListJson(entries));
    return;
  }
  if (entries.length === 0) {
    console.log(pc.dim('no tasks — open one with: ward task open SLUG'));
    return;
  }
  for (const entry of entries) {
    const { record } = entry;
    const outcome = record.outcome === undefined ? '' : pc.dim(` · ${record.outcome}`);
    const review = entry.inReview ? pc.cyan(' · in-review') : '';
    const floor = record.floor === undefined ? '' : pc.dim(` (floor ${record.floor})`);
    const prs = entry.forge === undefined ? '' : pc.dim(` — prs: ${forgeSummary(entry.forge)}`);
    console.log(
      `  ${pc.bold(record.code)} ${record.slug}${floor} [${renderState(record.state)}${review}${outcome}]${prs}`,
    );
  }
  renderForgeUnavailable(
    !probe.live,
    tasks.map((task) => task.record),
  );
}

async function cmdTaskClose(
  code: string,
  outcome: 'delivered' | 'abandoned',
  json: boolean,
): Promise<void> {
  const report = await closeTask(requireWorkspace(), code, outcome);
  if (json) {
    printJson(taskCloseJson(report));
    return;
  }
  console.log(`Closing task ${pc.bold(code)} — ${report.task.record.slug}\n`);
  for (const step of report.steps) {
    console.log(`  ${pc.green('✓')} ${step.step} ${pc.dim(`(${step.detail})`)}`);
  }
  const verb = outcome === 'delivered' ? pc.green('delivered') : pc.yellow('abandoned');
  console.log(`\nTask ${pc.bold(code)} closed — ${verb}.`);
}

async function cmdWorktreeRebase(root: string, code: string, json: boolean): Promise<void> {
  const { task, reports } = await rebaseTaskWorktrees(root, code);
  // A dirty refusal is the fail-safe honored, not a failure — the same exit
  // posture as repo refresh; conflict and failed broke the verb's promise.
  const broken = reports.some((r) => r.outcome === 'conflict' || r.outcome === 'failed');
  if (json) {
    // The per-worktree outcomes are the document, conflicts included — the
    // verb completed and reported; only the exit code carries the verdict.
    printJson(worktreeRebaseJson(task.record.code, reports));
    if (broken) process.exit(1);
    return;
  }
  if (reports.length === 0) {
    console.log(
      pc.dim(
        `no worktrees on task ${task.record.code} — create one with: ward worktree create TASK --repo NAME`,
      ),
    );
    return;
  }
  for (const report of reports) {
    console.log(`  ${renderRebase(report)}  ${report.record.path} ${pc.dim(`(${report.detail})`)}`);
  }
  if (broken) process.exit(1);
}

function renderRebase(report: RebaseReport): string {
  return {
    rebased: pc.green(' rebased'),
    current: pc.dim(' current'),
    dirty: pc.yellow('   dirty'),
    conflict: pc.red('conflict'),
    failed: pc.red('  failed'),
  }[report.outcome];
}

async function cmdWorktreeList(json: boolean): Promise<void> {
  const listings = await listWorktrees(requireWorkspace());
  if (json) {
    printJson(worktreeListJson(listings));
    return;
  }
  if (listings.length === 0) {
    console.log(pc.dim('no worktrees — create one with: ward worktree create TASK --repo NAME'));
    return;
  }
  for (const { taskCode, record, present } of listings) {
    const where = present ? pc.dim(record.path) : pc.yellow(`${record.path} (missing)`);
    console.log(
      `  ${pc.bold(taskCode)} ${record.repo}:${record.branch} ` +
        `${pc.dim(`(${record.disposition})`)} ${where}`,
    );
  }
}

async function cmdStatus(json: boolean): Promise<void> {
  const report = await statusReport(requireWorkspace());
  if (json) {
    printJson(statusJson(report));
    return;
  }
  console.log(`Workspace: ${renderState(report.workspace)}\n`);
  if (report.projects.length === 0 && report.bareTasks.length === 0) {
    console.log(pc.dim('nothing in flight — an empty workspace is active, not idle'));
    return;
  }
  for (const project of report.projects) {
    console.log(
      `${pc.bold(`floor ${project.project.floor}`)} — ${project.project.slug} ` +
        `[${renderState(project.derived)}]`,
    );
    for (const task of project.tasks) {
      console.log(renderTaskStatus(task));
    }
  }
  if (report.bareTasks.length > 0) {
    console.log(pc.bold('bare tasks'));
    for (const task of report.bareTasks) {
      console.log(renderTaskStatus(task));
    }
  }
  const allTasks = [
    ...report.projects.flatMap((project) => project.tasks),
    ...report.bareTasks,
  ].map((status) => status.task);
  renderForgeUnavailable(report.needsYou === undefined, allTasks);
  if (report.needsYou !== undefined && report.needsYou.length > 0) {
    console.log(`\n${pc.bold('needs you')}`);
    for (const entry of report.needsYou) {
      console.log(`  ${pc.yellow('!')} ${renderNeedsYou(entry)}`);
    }
  }
}

function renderTaskStatus(status: TaskStatus): string {
  const review = status.inReview ? pc.cyan(' · in-review') : '';
  const outcome = status.task.outcome === undefined ? '' : pc.dim(` · ${status.task.outcome}`);
  const prs = status.forge === undefined ? '' : pc.dim(` — prs: ${forgeSummary(status.forge)}`);
  const sessions =
    status.openSessions.length === 0
      ? ''
      : pc.dim(` — sessions: ${status.openSessions.join(', ')}`);
  const lines = [
    `  ${pc.bold(status.task.code)} ${status.task.slug} ` +
      `[${renderState(status.task.state)}${review}${outcome}]${prs}${sessions}`,
  ];
  for (const worktree of status.worktrees ?? []) {
    lines.push(renderWorktreeFreshness(status.task.code, worktree));
  }
  return lines.join('\n');
}

/**
 * One sub-line per worktree under its task (design/0016-worktree-freshness/):
 * which worktrees are behind, which are clean — readable at a glance, from
 * local git alone, as fresh as the last `repo refresh`. The task line stays
 * the compact rollup; the sub-line carries the path (which worktree), the
 * verdict, and — where behind — the remedy. Rebasing is the caller's act:
 * status is a read verb and names the command, never runs it.
 */
function renderWorktreeFreshness(code: string, status: WorktreeStatus): string {
  const head = `    ${pc.dim(status.record.path)} — `;
  if (status.freshness === undefined) return `${head}${pc.dim('freshness unavailable (git)')}`;
  const detail = status.detail ?? status.freshness;
  if (status.freshness === 'current') return head + pc.dim(detail);
  if (status.freshness === 'behind') {
    return head + pc.yellow(detail) + pc.dim(` — rebase with: ward worktree rebase ${code}`);
  }
  if (status.freshness === 'unreadable') return head + pc.red(detail);
  return head + pc.yellow(detail); // dirty | drifted — occupancy and drift, in warning color
}

/** One line per PR set, counted by live state, e.g. `1 open (changes requested) · 1 merged`. */
function forgeSummary(states: readonly PrForgeState[]): string {
  const parts: string[] = [];
  const of = (state: PrForgeState['state']) => states.filter((pr) => pr.state === state);
  const open = of('open');
  if (open.length > 0) {
    const blocked = open.filter((pr) => pr.reviewDecision === 'changes-requested').length;
    const note =
      blocked === 0 ? '' : ` (${blocked === open.length ? '' : `${blocked} `}changes requested)`;
    parts.push(`${open.length} open${note}`);
  }
  if (of('merged').length > 0) parts.push(`${of('merged').length} merged`);
  if (of('closed').length > 0) parts.push(`${of('closed').length} closed unmerged`);
  if (of('unknown').length > 0) parts.push(`${of('unknown').length} unreadable`);
  return parts.join(' · ');
}

/**
 * The degraded-mode marker: when the forge did not answer and live state
 * would have been shown, say so once — everything above renders exactly as
 * it does without a forge (design/0009-live-forge-state/).
 */
function renderForgeUnavailable(unavailable: boolean, tasks: readonly TaskRecord[]): void {
  const wanted = tasks.some((task) => task.state !== 'closed' && task.prs.length > 0);
  if (!unavailable || !wanted) return;
  console.log(
    pc.dim('\nforge state unavailable (gh) — in-review means linked PRs, not live review state'),
  );
}

function renderNeedsYou(entry: NeedsYouEntry): string {
  switch (entry.reason) {
    case 'awaiting-close':
      return `task ${pc.bold(entry.task)} — PR set fully merged; close it: ward task close ${entry.task}`;
    case 'changes-requested':
      return `task ${pc.bold(entry.task)} — changes requested on ${entry.pr ?? 'a linked PR'}`;
    case 'stale-base': {
      // The incident's cause, caught while it is still cheap to fix
      // (design/0014-stale-base-warning/): name the PR, its base, the main
      // line, the stake, and the remedy — retargeting is the human's move
      // (§18); ward names it, never runs it.
      const pr = entry.pr ?? 'a linked PR';
      const main = entry.mainLine ?? 'the main line';
      return (
        `task ${pc.bold(entry.task)} — PR ${pr} is based on '${entry.base ?? 'another branch'}', ` +
        `not the main line '${main}' — merging as-is delivers into a branch that may never land ` +
        `(the close gate would refuse it); retarget first: gh pr edit ${pr} --base ${main}`
      );
    }
  }
}

async function cmdDoctor(json: boolean): Promise<void> {
  const report = await runDoctor(process.cwd());
  if (json) {
    printJson(doctorJson(report));
    if (!report.healthy) process.exit(1);
    return;
  }
  console.log(pc.bold('Machine'));
  for (const finding of report.machine) {
    console.log(renderFinding(finding));
  }
  if (report.workspaceRoot === null) {
    console.log(`\n${pc.dim('No workspace found from this directory — machine checks only.')}`);
  } else {
    console.log(`\n${pc.bold('Workspace')} ${pc.dim(report.workspaceRoot)}`);
    for (const finding of report.workspace) {
      console.log(renderFinding(finding));
    }
  }
  console.log(
    report.healthy
      ? `\n${pc.green('healthy')} — nothing needs attention`
      : `\n${pc.red('unhealthy')} — problems above need attention`,
  );
  if (!report.healthy) process.exit(1);
}

/**
 * `ward schema [VERB...]`: the one verb whose only rendering is JSON — the
 * schema document is itself the artifact both audiences read (§8), and a
 * prose paraphrase of it could drift from the thing it paraphrases.
 */
function cmdSchema(words: readonly string[]): void {
  printJson(words.length === 0 ? allSchemasJson() : verbSchemaJson(words.join(' ')));
}

function renderFinding(finding: Finding): string {
  const symbol = {
    ok: pc.green('✓'),
    info: pc.cyan('i'),
    warn: pc.yellow('!'),
    error: pc.red('✗'),
  }[finding.severity];
  return `  ${symbol} ${finding.check} ${pc.dim('—')} ${finding.message}`;
}
