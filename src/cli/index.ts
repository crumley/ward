#!/usr/bin/env bun
// ward — the Ward CLI. Thin plumbing over the modules below it
// (intent/02-subsystems/07-human-shell.md): optique parses the noun/verb
// tree, the workspace modules do the work, and this layer renders results.
// See design/0001-dev-foundation/ and design/0002-store-and-workspace/.
import { object, or } from '@optique/core/constructs';
import { message } from '@optique/core/message';
import { optional, withDefault } from '@optique/core/modifiers';
import { argument, command, constant, option } from '@optique/core/primitives';
import { choice, integer, string } from '@optique/core/valueparser';
import { run } from '@optique/run';
import pc from 'picocolors';
import pkg from '../../package.json' with { type: 'json' };
import { WardError } from '../errors.ts';
import type { WorkState } from '../store/types.ts';
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
import { closeSession, openSession } from '../workspace/sessions.ts';
import { deriveStatus, statusReport, type TaskStatus } from '../workspace/status.ts';
import { addTaskPr, closeTask, openTask, setTaskState } from '../workspace/tasks.ts';
import { createWorktree, listWorktrees } from '../workspace/worktrees.ts';

const workspaceCreate = command(
  'create',
  object({
    action: constant('workspace-create'),
    path: argument(string({ metavar: 'PATH' })),
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
  }),
  { brief: message`Register a repository: clone a URL or adopt a local checkout.` },
);

const repoRefresh = command(
  'refresh',
  object({
    action: constant('repo-refresh'),
    name: optional(argument(string({ metavar: 'NAME' }))),
  }),
  { brief: message`Fetch and fast-forward canonical checkouts to their main lines.` },
);

const repoList = command('list', object({ action: constant('repo-list') }), {
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
      object({ action: constant('project-open'), slug: argument(string({ metavar: 'SLUG' })) }),
      { brief: message`Open a project; it takes the next floor number.` },
    ),
    command('list', object({ action: constant('project-list') }), {
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
      }),
      { brief: message`Open a task, bare or under a project floor.` },
    ),
    command('list', object({ action: constant('task-list') }), {
      brief: message`List tasks, open and closed.`,
    }),
    command(
      'pause',
      object({ action: constant('task-pause'), code: argument(string({ metavar: 'CODE' })) }),
      { brief: message`Set a task down, resumable.` },
    ),
    command(
      'resume',
      object({ action: constant('task-resume'), code: argument(string({ metavar: 'CODE' })) }),
      { brief: message`Pick a paused task back up.` },
    ),
    command(
      'pr',
      object({
        action: constant('task-pr'),
        code: argument(string({ metavar: 'CODE' })),
        url: argument(string({ metavar: 'URL' })),
      }),
      { brief: message`Link a pull request to a task.` },
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
        task: argument(string({ metavar: 'TASK' })),
        repo: option('--repo', string({ metavar: 'NAME' })),
        branch: optional(option('--branch', string({ metavar: 'NAME' }))),
      }),
      { brief: message`Create a deliverable worktree off the refreshed main line.` },
    ),
    command('list', object({ action: constant('worktree-list') }), {
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
        task: argument(string({ metavar: 'TASK' })),
        purpose: option('--purpose', string({ metavar: 'TEXT' })),
        handle: optional(option('--handle', string({ metavar: 'TEXT' }))),
        dir: optional(option('--dir', string({ metavar: 'PATH' }))),
      }),
      { brief: message`Record a session on a task (you run the agent yourself).` },
    ),
    command(
      'close',
      object({ action: constant('session-close'), id: argument(string({ metavar: 'ID' })) }),
      { brief: message`Close a session record; closed stays closed.` },
    ),
  ),
  { brief: message`Record agent sessions.` },
);

const status = command('status', object({ action: constant('status') }), {
  brief: message`Where everything stands — derived from the leaves, never stored.`,
});

const doctor = command('doctor', object({ action: constant('doctor') }), {
  brief: message`Check machine preconditions and, inside a workspace, its integrity.`,
});

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

const cli = or(workspace, repo, project, task, worktree, session, status, doctor, version);
const result = run(cli, { programName: 'ward', help: 'option' });

try {
  if ('action' in result) {
    switch (result.action) {
      case 'workspace-create':
        await cmdWorkspaceCreate(result.path);
        break;
      case 'repo-add':
        await cmdRepoAdd(result.source, result.name);
        break;
      case 'repo-refresh':
        await cmdRepoRefresh(result.name);
        break;
      case 'repo-list':
        await cmdRepoList();
        break;
      case 'project-open': {
        const record = await openProject(requireWorkspace(), result.slug);
        console.log(
          `${pc.green('opened')} floor ${pc.bold(String(record.floor))} — ${record.slug}`,
        );
        break;
      }
      case 'project-list':
        await cmdProjectList();
        break;
      case 'task-open': {
        const opened = await openTask(requireWorkspace(), result.slug, {
          ...(result.project === undefined ? {} : { floor: result.project }),
          ...(result.purpose === undefined ? {} : { purpose: result.purpose }),
        });
        console.log(
          `${pc.green('opened')} task ${pc.bold(opened.record.code)} — ${opened.record.slug}` +
            (opened.record.floor === undefined ? '' : pc.dim(` (floor ${opened.record.floor})`)),
        );
        break;
      }
      case 'task-list':
        await cmdTaskList();
        break;
      case 'task-pause': {
        const paused = await setTaskState(requireWorkspace(), result.code, 'paused');
        console.log(
          `${pc.yellow('paused')} ${pc.bold(paused.record.code)} — ${paused.record.slug}`,
        );
        break;
      }
      case 'task-resume': {
        const resumed = await setTaskState(requireWorkspace(), result.code, 'active');
        console.log(
          `${pc.green('resumed')} ${pc.bold(resumed.record.code)} — ${resumed.record.slug}`,
        );
        break;
      }
      case 'task-pr': {
        const linked = await addTaskPr(requireWorkspace(), result.code, result.url);
        console.log(
          `${pc.green('linked')} ${result.url} ${pc.dim(`(${linked.record.prs.length} in the set)`)}`,
        );
        break;
      }
      case 'task-close':
        await cmdTaskClose(result.code, result.outcome);
        break;
      case 'worktree-create': {
        const created = await createWorktree(
          requireWorkspace(),
          result.task,
          result.repo,
          result.branch,
        );
        console.log(
          `${pc.green('created')} ${created.record.path} ` +
            pc.dim(`(${created.record.repo}, branch ${created.record.branch}, deliverable)`),
        );
        break;
      }
      case 'worktree-list':
        await cmdWorktreeList();
        break;
      case 'session-open': {
        const opened = await openSession(requireWorkspace(), result.task, result.purpose, {
          ...(result.handle === undefined ? {} : { handle: result.handle }),
          ...(result.dir === undefined ? {} : { workingDirectory: result.dir }),
        });
        console.log(
          `${pc.green('opened')} session ${pc.bold(opened.id)} ` +
            pc.dim(`(in ${opened.workingDirectory})`),
        );
        break;
      }
      case 'session-close': {
        const closed = await closeSession(requireWorkspace(), result.id);
        console.log(`${pc.dim('closed')} session ${pc.bold(closed.id)}`);
        break;
      }
      case 'status':
        await cmdStatus();
        break;
      case 'doctor':
        await cmdDoctor();
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

async function cmdWorkspaceCreate(path: string): Promise<void> {
  const report = await createWorkspace(path);
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

async function cmdRepoAdd(source: string, name: string | undefined): Promise<void> {
  const root = requireWorkspace();
  const report = await addRepository(root, source, name);
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

async function cmdRepoRefresh(name: string | undefined): Promise<void> {
  const root = requireWorkspace();
  const reports = await refreshRepositories(root, name);
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

async function cmdRepoList(): Promise<void> {
  const root = requireWorkspace();
  const records = await listRepositories(root);
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

async function cmdProjectList(): Promise<void> {
  const root = requireWorkspace();
  const projects = await readProjects(root);
  if (projects.length === 0) {
    console.log(pc.dim('no projects — open one with: ward project open SLUG'));
    return;
  }
  const tasks = await readTasks(root);
  for (const project of projects) {
    const own = tasks.filter((task) => task.dir.startsWith(`${project.dir}/`));
    const derived =
      project.record.state === 'active'
        ? deriveStatus(own.map((task) => task.record.state))
        : project.record.state;
    console.log(
      `  floor ${pc.bold(String(project.record.floor))} — ${project.record.slug} ` +
        `[${renderState(derived)}] ${pc.dim(`(${own.length} tasks)`)}`,
    );
  }
}

async function cmdTaskList(): Promise<void> {
  const root = requireWorkspace();
  const tasks = await readTasks(root);
  if (tasks.length === 0) {
    console.log(pc.dim('no tasks — open one with: ward task open SLUG'));
    return;
  }
  for (const { record } of tasks) {
    const outcome = record.outcome === undefined ? '' : pc.dim(` · ${record.outcome}`);
    const review =
      record.prs.length > 0 && record.state !== 'closed' ? pc.cyan(' · in-review') : '';
    const floor = record.floor === undefined ? '' : pc.dim(` (floor ${record.floor})`);
    console.log(
      `  ${pc.bold(record.code)} ${record.slug}${floor} [${renderState(record.state)}${review}${outcome}]`,
    );
  }
}

async function cmdTaskClose(code: string, outcome: 'delivered' | 'abandoned'): Promise<void> {
  const report = await closeTask(requireWorkspace(), code, outcome);
  console.log(`Closing task ${pc.bold(code)} — ${report.task.record.slug}\n`);
  for (const step of report.steps) {
    console.log(`  ${pc.green('✓')} ${step.step} ${pc.dim(`(${step.detail})`)}`);
  }
  const verb = outcome === 'delivered' ? pc.green('delivered') : pc.yellow('abandoned');
  console.log(`\nTask ${pc.bold(code)} closed — ${verb}.`);
}

async function cmdWorktreeList(): Promise<void> {
  const listings = await listWorktrees(requireWorkspace());
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

async function cmdStatus(): Promise<void> {
  const report = await statusReport(requireWorkspace());
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
}

function renderTaskStatus(status: TaskStatus): string {
  const review = status.inReview ? pc.cyan(' · in-review') : '';
  const outcome = status.task.outcome === undefined ? '' : pc.dim(` · ${status.task.outcome}`);
  const sessions =
    status.openSessions.length === 0
      ? ''
      : pc.dim(` — sessions: ${status.openSessions.join(', ')}`);
  return (
    `  ${pc.bold(status.task.code)} ${status.task.slug} ` +
    `[${renderState(status.task.state)}${review}${outcome}]${sessions}`
  );
}

async function cmdDoctor(): Promise<void> {
  const report = await runDoctor(process.cwd());
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

function renderFinding(finding: Finding): string {
  const symbol = {
    ok: pc.green('✓'),
    info: pc.cyan('i'),
    warn: pc.yellow('!'),
    error: pc.red('✗'),
  }[finding.severity];
  return `  ${symbol} ${finding.check} ${pc.dim('—')} ${finding.message}`;
}
