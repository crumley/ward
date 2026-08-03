#!/usr/bin/env bun
// ward — the Ward CLI. Thin plumbing over the modules below it
// (intent/02-subsystems/07-human-shell.md): optique parses the noun/verb
// tree, the workspace modules do the work, and this layer renders results.
// See design/0001-dev-foundation/ and design/0002-store-and-workspace/.
import { object, or } from '@optique/core/constructs';
import { message } from '@optique/core/message';
import { argument, command, constant, option } from '@optique/core/primitives';
import { string } from '@optique/core/valueparser';
import { run } from '@optique/run';
import pc from 'picocolors';
import pkg from '../../package.json' with { type: 'json' };
import { WardError } from '../errors.ts';
import { createWorkspace, type StepReport } from '../workspace/create.ts';
import { type Finding, runDoctor } from '../workspace/doctor.ts';

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

const cli = or(workspace, doctor, version);
const result = run(cli, { programName: 'ward', help: 'option' });

try {
  if ('action' in result) {
    switch (result.action) {
      case 'workspace-create':
        await cmdWorkspaceCreate(result.path);
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
