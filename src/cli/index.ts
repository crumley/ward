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
import { readConfig } from '../global/config.ts';
import { locateRepo, locateWorkspace } from '../global/locate.ts';
import {
  listWorkspaces,
  type RegistryReport,
  registerWorkspace,
  resolutionOrder,
  setDefaultWorkspace,
  touchWorkspace,
  unregisterWorkspace,
  viewRegistry,
} from '../global/registry.ts';
import { CANDIDATE_KINDS, candidates, renderCandidates } from '../shell/candidates.ts';
import { emitShellLayer } from '../shell/layer.ts';
import type { TaskRecord, WorkState } from '../store/types.ts';
import { createWorkspace, type StepReport } from '../workspace/create.ts';
import { type Finding, runDoctor } from '../workspace/doctor.ts';
import { discoverWorkspace } from '../workspace/layout.ts';
import { openProject, readProjects } from '../workspace/projects.ts';
import { addRepository, listRepositories, refreshRepositories } from '../workspace/repos.ts';
import { restoreConverged, restoreWorkspace } from '../workspace/restore.ts';
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
import { mergeWorkspaceBranch, refuseStewardshipCopy } from '../workspace/steward.ts';
import { addTaskPr, closeTask, openTask, setTaskState } from '../workspace/tasks.ts';
import { upgradeWorkspace } from '../workspace/upgrade.ts';
import {
  createWorkspaceWorktree,
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
  repoPathJson,
  repoRefreshJson,
  sessionMutationJson,
  statusJson,
  taskCloseJson,
  taskListJson,
  taskMutationJson,
  workspaceCreateJson,
  workspaceListJson,
  workspaceMergeJson,
  workspacePathJson,
  workspaceRegistryJson,
  workspaceRestoreJson,
  workspaceUpgradeJson,
  worktreeCreateJson,
  worktreeListJson,
  worktreeRebaseJson,
} from './json.ts';
import { refreshDisplay } from './progress.ts';
import { allSchemasJson, verbSchemaJson } from './schema.ts';
import {
  anyRepoName,
  repoName,
  schemaVerb,
  sessionId,
  taskCode,
  workspaceBranch,
  workspaceIdentity,
} from './suggest.ts';
import { isMachineryInvocation, recordInvocation } from './telemetry.ts';

// Local usage telemetry, armed before anything can exit: one row per
// invocation — read verbs included — appended at process exit so it carries
// the outcome, covers optique's own help/usage exits, and costs the command
// nothing while it runs (design/0013-telemetry-and-serialized-writes/).
recordInvocation(process.argv.slice(2));

// The registry's recency, kept current before anything can exit
// (design/0024-global-config-registry/): an invocation from inside a
// registered workspace is what makes it the most recently used one, which is
// what `ward` falls back to from elsewhere. Awaited so nothing dangles, and
// it is a single small read in the steady state — the write happens only when
// the order actually changes. The interaction layer's own machinery — a
// completion callback, a shell-layer candidate feed — is not usage
// (design/0022-shell-completion/ SF-002, design/0025-fish-shell-layer/), so
// it never churns the MRU.
await touchInvokedWorkspace(process.argv.slice(2));

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

// The gated, Ward-managed merge (design/0019-stewardship-worktrees/): the
// human's act that lands a stewardship branch on the workspace's own main
// line. The noun is the workspace because the main line being merged into is
// the workspace's own — the verb reads true at the level the act operates on.
const workspaceMerge = command(
  'merge',
  object({
    action: constant('workspace-merge'),
    branch: argument(workspaceBranch()),
    preview: option('--preview', {
      description: message`Show what would merge (commit count and diff stat) without merging.`,
    }),
    json: jsonFlag(),
  }),
  {
    brief: message`Land a stewardship branch on the workspace's own main line (the gated merge).`,
  },
);

// Restore (design/0021-restore-from-clone/): the record re-materializing the
// world after a fresh clone — canonical checkouts re-cloned, worktrees
// re-created from surviving branches, lost work named. The converse of every
// other verb: it changes disk to match the record and writes no record.
const workspaceRestore = command(
  'restore',
  object({
    action: constant('workspace-restore'),
    json: jsonFlag(),
  }),
  {
    brief: message`Re-materialize repos/ and worktrees/ from the record (a fresh clone's verb).`,
  },
);

// The deterministic upgrade (design/0020-deterministic-upgrade/): a tool act
// that writes into TASK's stewardship worktree — untouched installed
// artifacts to current defaults, missing ones installed, customized ones left
// byte-untouched and named as reconciliation residue — then previewed and
// landed through the 0019 rails (workspace merge, the gated act).
const workspaceUpgrade = command(
  'upgrade',
  object({
    action: constant('workspace-upgrade'),
    task: optional(argument(taskCode('TASK'))),
    json: jsonFlag(),
  }),
  {
    brief: message`Upgrade installed artifacts deterministically, into TASK's workspace worktree.`,
  },
);

// The machine-level registry (design/0024-global-config-registry/): which
// workspaces exist on this machine, which is the default, which was used
// last. Convenience only — the boundary in
// intent/01-concepts/06-workspace-lifecycle.md — so every one of these verbs
// touches global state and nothing else.
const workspaceRegister = command(
  'register',
  object({
    action: constant('workspace-register'),
    path: optional(argument(string({ metavar: 'PATH' }))),
    json: jsonFlag(),
  }),
  {
    brief: message`Register a workspace on this machine (default: the one containing this directory).`,
  },
);

const workspaceUnregister = command(
  'unregister',
  object({
    action: constant('workspace-unregister'),
    target: argument(workspaceIdentity()),
    json: jsonFlag(),
  }),
  { brief: message`Drop a workspace from the registry — the registry only, nothing on disk.` },
);

const workspaceList = command(
  'list',
  object({ action: constant('workspace-list'), json: jsonFlag() }),
  { brief: message`List the registered workspaces, most recently used first.` },
);

const workspaceDefault = command(
  'default',
  object({
    action: constant('workspace-default'),
    target: argument(workspaceIdentity()),
    json: jsonFlag(),
  }),
  { brief: message`Set the default workspace — what ward answers from outside any workspace.` },
);

const workspacePath = command(
  'path',
  object({
    action: constant('workspace-path'),
    name: optional(argument(workspaceIdentity())),
    json: jsonFlag(),
  }),
  { brief: message`Print a registered workspace's absolute path (the default when unnamed).` },
);

const workspace = command(
  'workspace',
  or(
    workspaceCreate,
    workspaceMerge,
    workspaceRestore,
    workspaceUpgrade,
    workspaceRegister,
    workspaceUnregister,
    workspaceList,
    workspaceDefault,
    workspacePath,
  ),
  { brief: message`Operate on a workspace.` },
);

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
    name: optional(argument(repoName())),
    // Opt-in at the flag; a human's `repo.refresh.stash: true` preference
    // supplies the default where the flag is absent (cmdRepoRefresh) — nothing
    // below the CLI layer reads configuration (design/0023-refresh-concurrency-ux/).
    stash: option('--stash', {
      description: message`Stash a dirty checkout, refresh it, then restore the stash (a conflicted pop is reported, never resolved).`,
    }),
    json: jsonFlag(),
  }),
  { brief: message`Fetch and fast-forward canonical checkouts to their main lines.` },
);

const repoList = command('list', object({ action: constant('repo-list'), json: jsonFlag() }), {
  brief: message`List the registered repositories.`,
});

// Works from any directory (design/0024-global-config-registry/): without
// --workspace the search runs current → default → most recently used, and the
// first workspace whose record registers the name answers.
const repoPath = command(
  'path',
  object({
    action: constant('repo-path'),
    name: argument(anyRepoName()),
    workspace: optional(
      option('--workspace', workspaceIdentity(), {
        description: message`Ask exactly this workspace (a registered name, or any workspace's path).`,
      }),
    ),
    json: jsonFlag(),
  }),
  { brief: message`Print the absolute path of a repository's canonical checkout.` },
);

const repo = command('repo', or(repoAdd, repoRefresh, repoList, repoPath), {
  brief: message`Operate on the workspace's registered repositories.`,
});

// The interactive shell layer (design/0025-fish-shell-layer/): `init` emits
// the shorthands a human installs, `candidates` is the feed that emitted
// script calls back into. Both live under one noun for the reason
// `ward completion <shell>` holds both its halves — the script and the thing
// the script asks — so the layer and its plumbing can never drift apart.
const shellInit = command(
  'init',
  object({ action: constant('shell-init'), shell: argument(string({ metavar: 'SHELL' })) }),
  {
    brief: message`Emit the shell layer of shorthands (wrr, wrcd, wwcd) — redirect it into your shell config.`,
  },
);

const shellCandidates = command(
  'candidates',
  object({
    action: constant('shell-candidates'),
    kind: argument(choice([...CANDIDATE_KINDS], { metavar: 'KIND' })),
  }),
  {
    brief: message`Machinery: one NAME<TAB>CUE line per candidate, for the emitted shell layer to pick from.`,
  },
);

const shell = command('shell', or(shellInit, shellCandidates), {
  brief: message`The interactive shell layer — mnemonic shorthands that work from any directory.`,
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
        code: optional(argument(taskCode('CODE'))),
        json: jsonFlag(),
      }),
      { brief: message`Set a task down, resumable. CODE is inferred inside a task's worktree.` },
    ),
    command(
      'resume',
      object({
        action: constant('task-resume'),
        code: optional(argument(taskCode('CODE'))),
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
          code: argument(taskCode('CODE')),
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
        code: argument(taskCode('CODE')),
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
        task: optional(argument(taskCode('TASK'))),
        repo: optional(option('--repo', repoName())),
        // The workspace's own repository is registered nowhere and has no name
        // in the repository set, so it is addressed plainly rather than by a
        // faked registration (design/0019-stewardship-worktrees/).
        workspace: option('--workspace', {
          description: message`Anchor in the workspace's own repository (the stewardship case).`,
        }),
        branch: optional(option('--branch', string({ metavar: 'NAME' }))),
        json: jsonFlag(),
      }),
      {
        brief: message`Create a deliverable worktree off the refreshed main line (--repo NAME or --workspace).`,
      },
    ),
    command(
      'rebase',
      object({
        action: constant('worktree-rebase'),
        task: optional(argument(taskCode('TASK'))),
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
        task: optional(argument(taskCode('TASK'))),
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
        id: argument(sessionId()),
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
    verb: multiple(argument(schemaVerb())),
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
// Completion never reaches here: both the script generation and the per-TAB
// callback carry `completion <shell> …` (design/0022-shell-completion/).
if (process.argv.length === 2) {
  printVersion(false);
  process.exit(0);
}

const cli = or(
  workspace,
  repo,
  project,
  task,
  worktree,
  session,
  status,
  doctor,
  schema,
  shell,
  version,
);
// `completion: 'command'` adds `ward completion <shell>` — the script
// generator AND the per-TAB callback the generated script calls back into, so
// suggestions are derived from this very tree and can never drift from it
// (design/0022-shell-completion/). Awaited because the dynamic suggesters in
// suggest.ts read the record asynchronously, which makes the whole parser
// async-mode; nothing else about parsing changes.
const result = await run(cli, {
  programName: 'ward',
  help: 'option',
  completion: 'command',
});

try {
  if ('action' in result) {
    switch (result.action) {
      case 'workspace-create':
        await cmdWorkspaceCreate(result.path, result.json);
        break;
      case 'workspace-merge':
        await cmdWorkspaceMerge(result.branch, result.preview, result.json);
        break;
      case 'workspace-restore':
        await cmdWorkspaceRestore(result.json);
        break;
      case 'workspace-upgrade': {
        const target = await resolveTaskTarget(
          result.task,
          'ward workspace upgrade TASK',
          result.json,
        );
        await cmdWorkspaceUpgrade(target.root, target.code, result.json);
        break;
      }
      case 'workspace-register': {
        const report = await registerWorkspace(result.path ?? process.cwd());
        renderRegistry(report, result.json);
        break;
      }
      case 'workspace-unregister': {
        renderRegistry(await unregisterWorkspace(result.target), result.json);
        break;
      }
      case 'workspace-default': {
        renderRegistry(await setDefaultWorkspace(result.target), result.json);
        break;
      }
      case 'workspace-list':
        await cmdWorkspaceList(result.json);
        break;
      case 'workspace-path': {
        // Nothing but the path on stdout: this verb exists to be substituted
        // into a shell command (`cd (ward workspace path)`), so any extra
        // line would land in the caller's argument.
        const listing = await locateWorkspace(result.name);
        if (result.json) printJson(workspacePathJson(listing));
        else console.log(listing.path);
        break;
      }
      case 'repo-path':
        await cmdRepoPath(result.name, result.workspace, result.json);
        break;
      case 'shell-init':
        // stdout carries the script and nothing else — it is redirected into
        // a file the shell will source (§18: Ward emits, the human installs).
        // The emitted bytes are `emitShellLayer`'s, because doctor compares an
        // installed file against them (design/0026-shell-staleness-doctor/).
        process.stdout.write(emitShellLayer(result.shell));
        break;
      case 'shell-candidates': {
        // Machinery, and shaped like it: one NAME<TAB>CUE line per candidate,
        // no color, no header, and NOTHING on an empty set — a picker with no
        // candidates is an empty picker, never an error in the human's shell
        // mid-keystroke (§20).
        const found = await candidates(result.kind, process.cwd());
        if (found.length > 0) console.log(renderCandidates(found));
        break;
      }
      case 'repo-add':
        await cmdRepoAdd(result.source, result.name, result.json);
        break;
      case 'repo-refresh':
        await cmdRepoRefresh(result.name, result.json, result.stash);
        break;
      case 'repo-list':
        await cmdRepoList(result.json);
        break;
      case 'project-open': {
        const record = await openProject(await requireMutableWorkspace(), result.slug);
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
        const opened = await openTask(await requireMutableWorkspace(), result.slug, {
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
          'ward worktree create TASK --repo NAME | --workspace',
          result.json,
        );
        if (result.workspace === (result.repo !== undefined)) {
          throw new WardError(
            'name the worktree source: --repo NAME for a registered repository, or ' +
              "--workspace for the workspace's own (exactly one of the two)",
          );
        }
        const created =
          result.repo === undefined
            ? await createWorkspaceWorktree(target.root, target.code, result.branch)
            : await createWorktree(target.root, target.code, result.repo, result.branch);
        if (result.json) {
          printJson(worktreeCreateJson(created.task.record.code, created.record));
          break;
        }
        console.log(
          `${pc.green('created')} ${created.record.path} ` +
            pc.dim(
              `(${created.record.repo ?? "the workspace's own repository"}, ` +
                `branch ${created.record.branch}, deliverable)`,
            ),
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
        const closed = await closeSession(await requireMutableWorkspace(), result.id);
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

/**
 * The gated merge (design/0019-stewardship-worktrees/): a mutation at the
 * workspace root, so the stewardship-copy guard applies; a refusal (dirty
 * root, conflict, unknown branch) throws before any document is printed —
 * stderr + exit 1 with stdout empty, the 0015 posture.
 */
async function cmdWorkspaceMerge(branch: string, preview: boolean, json: boolean): Promise<void> {
  const report = await mergeWorkspaceBranch(await requireMutableWorkspace(), branch, preview);
  if (json) {
    printJson(workspaceMergeJson(report));
    return;
  }
  const plural = report.commits === 1 ? 'commit' : 'commits';
  if (report.outcome === 'merged') {
    console.log(
      `${pc.green('merged')} '${pc.bold(report.branch)}' into ${report.mainLine} — ` +
        `${report.commits} ${plural}, merge commit ${report.mergeCommit ?? '?'}`,
    );
    return;
  }
  if (report.outcome === 'already-merged') {
    console.log(
      pc.dim(`'${report.branch}' is already merged into ${report.mainLine} — nothing to do`),
    );
    return;
  }
  console.log(
    `would merge '${pc.bold(report.branch)}' into ${report.mainLine} — ${report.commits} ${plural}`,
  );
  if (report.diffStat !== undefined && report.diffStat !== '') console.log(pc.dim(report.diffStat));
  console.log(pc.dim(`merge with: ward workspace merge ${report.branch}`));
}

/**
 * Restore (design/0021-restore-from-clone/): per-item rows in three groups —
 * repositories, worktrees, sessions — mirroring the report. A `lost` or
 * `failed` row keeps the exit-1 posture with the rows still rendered (the
 * repo-refresh convention): the verb completed and reported; the verdict
 * lives in $?. Loud rows stay undimmed — a lost branch must not whisper.
 */
async function cmdWorkspaceRestore(json: boolean): Promise<void> {
  const report = await restoreWorkspace(await requireMutableWorkspace());
  const converged = restoreConverged(report);
  if (json) {
    printJson(workspaceRestoreJson(report));
    if (!converged) process.exit(1);
    return;
  }
  console.log(`Restoring workspace at ${pc.bold(report.root)}\n`);
  console.log(pc.bold('  repositories'));
  if (report.repositories.length === 0) {
    console.log(pc.dim('    none registered'));
  }
  for (const item of report.repositories) {
    console.log(`    ${renderRestore(item.outcome)}  ${item.name} ${pc.dim(`(${item.detail})`)}`);
  }
  console.log(pc.bold('  worktrees'));
  if (report.worktrees.length === 0) {
    console.log(pc.dim('    none recorded on open tasks'));
  }
  for (const item of report.worktrees) {
    const source = item.record.repo ?? 'workspace';
    const identity = `${item.record.path} ${pc.dim(`(${source}:${item.record.branch})`)}`;
    const loud = item.outcome === 'lost' || item.outcome === 'failed';
    const detail = loud ? ` — ${item.detail}` : ` ${pc.dim(`(${item.detail})`)}`;
    console.log(`    ${renderRestore(item.outcome)}  ${identity}${detail}`);
  }
  console.log(pc.bold('  sessions'));
  console.log(
    report.sessions.open === 0
      ? pc.dim(`    ${report.sessions.detail}`)
      : `    ${report.sessions.detail}`,
  );
  const count = (outcome: string) =>
    [...report.repositories, ...report.worktrees].filter((item) => item.outcome === outcome).length;
  if (converged) {
    console.log(
      `\nWorkspace restored — ${count('restored')} restored, ${count('satisfied')} already satisfied.`,
    );
    return;
  }
  console.log(
    `\n${pc.red('Restore incomplete')} — ${count('restored')} restored, ` +
      `${count('satisfied')} satisfied, ${count('lost')} lost, ${count('failed')} failed; ` +
      'the rows above carry the remedies.',
  );
  process.exit(1);
}

function renderRestore(outcome: 'restored' | 'satisfied' | 'lost' | 'failed'): string {
  return {
    restored: pc.green(' restored'),
    satisfied: pc.dim('satisfied'),
    lost: pc.red('     lost'),
    failed: pc.red('   failed'),
  }[outcome];
}

/**
 * The deterministic upgrade's rendering: one row per installed artifact with
 * the mechanical action taken, then the record lines, then — set apart — the
 * reconciliation residue and the next verbs (preview, merge): the tool's part
 * ends at naming what only a human or agent can merge (0020).
 */
async function cmdWorkspaceUpgrade(root: string, code: string, json: boolean): Promise<void> {
  const report = await upgradeWorkspace(root, code);
  if (json) {
    printJson(workspaceUpgradeJson(report));
    return;
  }
  console.log(
    `Upgrading workspace via task ${pc.bold(report.task)} ` +
      pc.dim(`(branch ${report.branch}, in ${report.path})`) +
      '\n',
  );
  for (const artifact of report.artifacts) {
    console.log(
      `  ${renderUpgradeAction(artifact.action)}  ${artifact.path} ${pc.dim(`(${artifact.detail})`)}`,
    );
  }
  console.log(
    `  ${renderUpgradeAction(report.mainLine.action === 'recorded' ? 'upgraded' : 'current')}  ` +
      `main line ${pc.dim(`('${report.mainLine.name}' ${report.mainLine.action})`)}`,
  );
  console.log(
    `  ${renderUpgradeAction(report.baselines === 'updated' ? 'upgraded' : 'current')}  ` +
      `baselines ${pc.dim(`(${report.baselines})`)}`,
  );
  if (report.residue.length > 0) {
    console.log(`\n${pc.bold('reconciliation residue')} — yours (or an agent's) to merge:`);
    for (const path of report.residue) {
      console.log(`  ${pc.yellow('!')} ${path} ${pc.dim('— left byte-untouched')}`);
    }
  }
  if (report.outcome === 'current') {
    console.log(`\n${pc.dim('nothing to upgrade — everything already current')}`);
    return;
  }
  console.log(
    `\ncommitted ${pc.bold(report.commit ?? '?')} on ${report.branch} — preview and land it:` +
      `\n  ward workspace merge ${report.branch} --preview` +
      `\n  ward workspace merge ${report.branch}`,
  );
}

function renderUpgradeAction(action: 'upgraded' | 'installed' | 'current' | 'kept'): string {
  return {
    upgraded: pc.green(' upgraded'),
    installed: pc.green('installed'),
    current: pc.dim('  current'),
    kept: pc.yellow('     kept'),
  }[action];
}

/** Note this invocation's workspace as the most recently used, if registered. */
async function touchInvokedWorkspace(argv: readonly string[]): Promise<void> {
  if (isMachineryInvocation(argv)) return;
  const root = discoverWorkspace(process.cwd());
  if (root !== null) await touchWorkspace(root);
}

/**
 * The three registry mutations, rendered alike: what happened, the entry it
 * happened to, and whether it is the default — with `unchanged` making a
 * repeated act legible as the no-op it was (§6).
 */
function renderRegistry(report: RegistryReport, json: boolean): void {
  if (json) {
    printJson(workspaceRegistryJson(report));
    return;
  }
  const verb = {
    registered: pc.green('registered'),
    satisfied: pc.dim('unchanged'),
    unregistered: pc.dim('unregistered'),
    'default-set': pc.green('default set'),
  }[report.outcome];
  const mark = report.entry.isDefault ? pc.dim(' (default)') : '';
  console.log(`${verb} ${pc.bold(report.entry.name)} ${pc.dim(report.entry.path)}${mark}`);
}

/**
 * The registered workspaces, most recently used first, the default marked
 * with a star. A stale entry — its path no longer holds a workspace — is
 * shown and named rather than hidden: the registry is a convenience, and the
 * honest report is what lets the human drop it (§20).
 */
async function cmdWorkspaceList(json: boolean): Promise<void> {
  const { listings, unreadable } = await viewRegistry();
  if (json) {
    printJson(workspaceListJson(listings));
    return;
  }
  if (listings.length === 0) {
    console.log(
      pc.dim(
        unreadable
          ? 'the registry could not be read — ward doctor names the file and the reason'
          : 'no workspaces registered — register one with: ward workspace register [PATH]',
      ),
    );
    return;
  }
  for (const entry of listings) {
    const mark = entry.isDefault ? pc.green('*') : ' ';
    const stale = entry.stale ? pc.yellow(' (stale — no workspace at that path)') : '';
    console.log(`  ${mark} ${pc.bold(entry.name)} ${pc.dim(entry.path)}${stale}`);
  }
}

/**
 * The canonical checkout's path, alone on stdout so it can be substituted
 * into a shell command. When the answer came from another workspace — the
 * registry resolved it, not the caller's location — that derivation is echoed
 * on stderr, the 0006 precedent: an implicit input is never silent, and
 * stderr keeps stdout to the one thing the caller asked for. A name that
 * resolved as a shorthand rather than as itself is the same kind of implicit
 * input, and is echoed the same way (design/0025-fish-shell-layer/).
 */
async function cmdRepoPath(
  name: string,
  workspaceTarget: string | undefined,
  json: boolean,
): Promise<void> {
  // A human gets the shorthand rungs; a declared agent resolves exactly (§8).
  const location = await locateRepo(name, process.cwd(), workspaceTarget, !callerIsAgent());
  if (location.matched !== 'exact') {
    console.error(
      pc.dim(`repository ${location.repo} — '${name}' matched it by ${location.matched}`),
    );
  }
  if (location.workspace.source !== 'cwd') {
    console.error(
      pc.dim(
        `workspace ${location.workspace.name} — ${location.workspace.path} (${
          location.workspace.source === 'named' ? 'named' : 'from the registry'
        })`,
      ),
    );
  }
  if (json) printJson(repoPathJson(location));
  else console.log(location.path);
}

/**
 * Resolve the workspace a verb operates on. The walk up from the working
 * directory always wins (design/0002-store-and-workspace/): standing inside a
 * workspace means that workspace, always, for both audiences.
 *
 * Standing nowhere, a HUMAN gets the registry's answer — the default
 * workspace, else the most recently used — echoed on stderr so the implicit
 * input is visible, exactly as an inferred task code is (0006). A declared
 * agent is refused it, for 0006's reason: an agent's cwd is incidental state
 * its harness manages, and resolving a mutation against a machine-level
 * preference would turn that incidental state into a target. The two `path`
 * verbs are the deliberate exception — they are registry queries by
 * construction, so both audiences may ask them from anywhere.
 */
async function requireWorkspace(): Promise<string> {
  const root = discoverWorkspace(process.cwd());
  if (root !== null) return root;
  if (callerIsAgent()) {
    throw new WardError(
      'no Ward workspace encloses this directory — a declared agent stands in one explicitly: ' +
        'run from inside it (ward workspace list names the registered ones), or create one: ' +
        'ward workspace create PATH',
    );
  }
  const fallback = resolutionOrder(await listWorkspaces())[0];
  if (fallback === undefined) {
    throw new WardError(
      'no Ward workspace encloses this directory — create one with: ward workspace create PATH ' +
        '(or register an existing one: ward workspace register PATH)',
    );
  }
  console.error(pc.dim(`workspace ${fallback.name} — ${fallback.path} (from the registry)`));
  return fallback.path;
}

/**
 * The stewardship-copy guard (design/0019-stewardship-worktrees/): a
 * stewardship worktree materializes the record, so discovery finds what looks
 * like a root there. Reads proceed against the candidate copy — that preview
 * is the copy's purpose — but every mutating verb resolves its workspace
 * through this instead: a record written in a copy would merge back into the
 * main line as false history, so the refusal names the enclosing workspace.
 */
async function requireMutableWorkspace(): Promise<string> {
  const root = await requireWorkspace();
  refuseStewardshipCopy(root);
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
  // Every caller of this resolver is a mutation, so the stewardship-copy
  // guard rides the workspace resolution (design/0019-stewardship-worktrees/).
  const root = await requireMutableWorkspace();
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
  const root = await requireMutableWorkspace();
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

/**
 * Refresh (design/0023-refresh-concurrency-ux/): the repositories run
 * concurrently and the rows are rendered as they settle, so the display is
 * the verb's own progress rather than a report printed after the fact. Under
 * `--json` there is no display at all — exactly one document on stdout,
 * unchanged in shape and in exit posture. `conflicted` joins `dirty` on the
 * informational side of that posture: the checkout was skipped, which is the
 * fail-safe working, not the verb failing. Only `failed` exits 1.
 */
async function cmdRepoRefresh(
  name: string | undefined,
  json: boolean,
  stash: boolean,
): Promise<void> {
  const root = await requireMutableWorkspace();
  // The `repo.refresh.stash` preference answers for a human who left the flag
  // off; a declared agent is read from the flag alone, so its invocation means
  // the same thing on every machine — the registry-fallback asymmetry (0024),
  // applied to a preference instead of a place.
  const stashing = stash || (!callerIsAgent() && (await readConfig()).repo.refresh.stash);
  const display = json ? null : refreshDisplay(pc);
  const reports = await refreshRepositories(root, name, {
    stash: stashing,
    ...(display === null ? {} : { observe: display.observe }),
  });
  if (json) {
    // The document is emitted whatever the rows say; a failed row keeps the
    // human path's exit-1 verdict — the caller reads the outcome from the
    // document and the verdict from $?, and the two never disagree (0005's
    // doctor posture).
    printJson(repoRefreshJson(reports));
    if (reports.some((report) => report.outcome === 'failed')) process.exit(1);
    return;
  }
  display?.settle();
  if (reports.length === 0) {
    console.log(pc.dim('no repositories registered — add one with: ward repo add SOURCE'));
    return;
  }
  if (reports.some((report) => report.outcome === 'failed')) process.exit(1);
}

async function cmdRepoList(json: boolean): Promise<void> {
  const root = await requireWorkspace();
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
  const root = await requireWorkspace();
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
  const root = await requireWorkspace();
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
  const report = await closeTask(await requireMutableWorkspace(), code, outcome);
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
  const listings = await listWorktrees(await requireWorkspace());
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
    // A workspace-anchored worktree names its source plainly — the workspace
    // repo has no name in the repository set (0019).
    const source = record.repo ?? 'workspace';
    console.log(
      `  ${pc.bold(taskCode)} ${source}:${record.branch} ` +
        `${pc.dim(`(${record.disposition})`)} ${where}`,
    );
  }
}

async function cmdStatus(json: boolean): Promise<void> {
  const report = await statusReport(await requireWorkspace());
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
