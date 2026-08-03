#!/usr/bin/env bun
// ward — the Ward CLI. Thin plumbing over the modules below it
// (intent/02-subsystems/07-human-shell.md): optique parses the noun/verb
// tree, the workspace modules do the work, and this layer renders results.
// See design/0001-dev-foundation/ and design/0002-store-and-workspace/.
import { object, or } from '@optique/core/constructs';
import { message } from '@optique/core/message';
import { optional } from '@optique/core/modifiers';
import { argument, command, constant, option } from '@optique/core/primitives';
import { string } from '@optique/core/valueparser';
import { run } from '@optique/run';
import pc from 'picocolors';
import pkg from '../../package.json' with { type: 'json' };
import { WardError } from '../errors.ts';
import { createWorkspace, type StepReport } from '../workspace/create.ts';
import { type Finding, runDoctor } from '../workspace/doctor.ts';
import { discoverWorkspace } from '../workspace/layout.ts';
import {
  addRepository,
  listRepositories,
  type RefreshReport,
  refreshRepositories,
} from '../workspace/repos.ts';

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

const cli = or(workspace, repo, doctor, version);
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
