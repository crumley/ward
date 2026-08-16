// Workspace creation as a list of idempotent establishment steps, each
// check-then-do — which is what makes re-running create the update path
// rather than a second mechanism (intent/01-concepts/06-workspace-lifecycle.md).
import { existsSync, statSync } from 'node:fs';
import { appendFile, mkdir, readdir, readFile, symlink } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import pkg from '../../package.json' with { type: 'json' };
import { WardError } from '../errors.ts';
import { readDocument, writeDocument } from '../store/document.ts';
import { withStoreLock } from '../store/lock.ts';
import {
  baselinesType,
  catalogType,
  projectRecordType,
  seededArtifactTypes,
  workspaceRecordType,
} from '../store/types.ts';
import { sha256OfFile } from './baselines.ts';
import { git, gitAvailable, gitOrThrow, hasCommits } from './git.ts';
import { IGNORE_LINES, inspectClaudeGuidance, MARKER_DIR, SCOPE_DIRS } from './layout.ts';
import { findStandingProject, nextFloor, STANDING_PROJECT_SLUG } from './projects.ts';
import { warnJournalOffMainLine, workspaceMainLine } from './steward.ts';
import {
  AGENTS_MD,
  CATALOG_BODY,
  WARD_INTERNAL_README,
  WORKSPACE_RECORD_BODY,
} from './templates.ts';

export type StepOutcome = 'established' | 'satisfied';

export interface StepReport {
  readonly step: string;
  readonly outcome: StepOutcome;
  readonly detail: string;
}

export interface CreateReport {
  readonly root: string;
  readonly steps: readonly StepReport[];
}

interface CreateContext {
  readonly root: string;
  /** Workspace-relative paths this run established — the converge commit's set. */
  readonly establishedPaths: string[];
  /**
   * Installed artifacts this run wrote from shipped content — the set the
   * baselines step fingerprints. Only what Ward itself wrote gets a baseline;
   * a pre-existing artifact's provenance is unknown and stays unrecorded.
   */
  readonly installedArtifacts: string[];
}

export async function createWorkspace(path: string): Promise<CreateReport> {
  if (!gitAvailable()) {
    throw new WardError('git is required to create a workspace and was not found on PATH');
  }
  const root = resolve(path);
  const ctx: CreateContext = { root, establishedPaths: [], installedArtifacts: [] };
  const steps: StepReport[] = [];
  steps.push(await establishRoot(ctx));
  steps.push(await establishMarker(ctx));
  // The store exists once the marker does, and from there a convergence run
  // is one more store writer: the remaining steps — including the converge
  // commit — run under the store lock so create cannot race a concurrent
  // verb's commit (design/0013-telemetry-and-serialized-writes/). A fresh
  // create is trivially uncontended; the uniform path costs nothing.
  await withStoreLock(root, 'workspace create', async () => {
    steps.push(await establishWorkspaceRecord(ctx));
    steps.push(await establishCatalog(ctx));
    steps.push(await establishAgentsGuidance(ctx));
    steps.push(await establishClaudeGuidance(ctx));
    steps.push(await establishIgnorePolicy(ctx));
    steps.push(await establishScopeDirs(ctx));
    steps.push(await establishStandingProject(ctx));
    steps.push(await establishBaselines(ctx));
    steps.push(establishGitRepository(ctx));
    steps.push(await establishMainLine(ctx));
    steps.push(establishCommit(ctx));
  });
  return { root, steps };
}

// -- steps ----------------------------------------------------------------

async function establishRoot(ctx: CreateContext): Promise<StepReport> {
  const step = 'root directory';
  if (existsSync(ctx.root)) {
    if (!statSync(ctx.root).isDirectory()) {
      throw new WardError(`${ctx.root} exists and is not a directory`);
    }
    const populated = (await readdir(ctx.root)).length > 0;
    const isWorkspace = existsSync(join(ctx.root, MARKER_DIR));
    if (populated && !isWorkspace) {
      throw new WardError(
        `${ctx.root} is not empty and is not a Ward workspace — ` +
          'choose a new or empty location, or point at an existing workspace to converge it',
      );
    }
    return { step, outcome: 'satisfied', detail: ctx.root };
  }
  await mkdir(ctx.root, { recursive: true });
  return { step, outcome: 'established', detail: ctx.root };
}

async function establishMarker(ctx: CreateContext): Promise<StepReport> {
  const step = 'workspace marker';
  const readme = join(ctx.root, MARKER_DIR, 'README.md');
  await mkdir(join(ctx.root, MARKER_DIR, 'tmp'), { recursive: true });
  if (existsSync(readme)) return { step, outcome: 'satisfied', detail: `${MARKER_DIR}/` };
  await Bun.write(readme, WARD_INTERNAL_README);
  ctx.establishedPaths.push(`${MARKER_DIR}/README.md`);
  ctx.installedArtifacts.push(`${MARKER_DIR}/README.md`);
  return { step, outcome: 'established', detail: `${MARKER_DIR}/` };
}

async function establishWorkspaceRecord(ctx: CreateContext): Promise<StepReport> {
  const step = 'workspace record';
  const relPath = workspaceRecordType.relPath;
  if (existsSync(join(ctx.root, relPath))) {
    await readDocument(ctx.root, workspaceRecordType); // validates; throws legibly
    return { step, outcome: 'satisfied', detail: relPath };
  }
  await writeDocument(ctx.root, workspaceRecordType, {
    data: {
      type: 'workspace',
      name: basename(ctx.root),
      wardVersion: pkg.version,
      createdAt: new Date().toISOString(),
    },
    body: WORKSPACE_RECORD_BODY,
  });
  ctx.establishedPaths.push(relPath);
  return { step, outcome: 'established', detail: relPath };
}

async function establishCatalog(ctx: CreateContext): Promise<StepReport> {
  const step = 'artifact-type catalog';
  const relPath = catalogType.relPath;
  if (existsSync(join(ctx.root, relPath))) {
    await readDocument(ctx.root, catalogType);
    return { step, outcome: 'satisfied', detail: relPath };
  }
  await writeDocument(ctx.root, catalogType, {
    data: { type: 'catalog', artifactTypes: seededArtifactTypes },
    body: CATALOG_BODY,
  });
  ctx.establishedPaths.push(relPath);
  ctx.installedArtifacts.push(relPath);
  return { step, outcome: 'established', detail: relPath };
}

async function establishAgentsGuidance(ctx: CreateContext): Promise<StepReport> {
  const step = 'agent guidance';
  const file = join(ctx.root, 'AGENTS.md');
  if (existsSync(file)) return { step, outcome: 'satisfied', detail: 'AGENTS.md' };
  await Bun.write(file, AGENTS_MD);
  ctx.establishedPaths.push('AGENTS.md');
  ctx.installedArtifacts.push('AGENTS.md');
  return { step, outcome: 'established', detail: 'AGENTS.md' };
}

/**
 * Claude Code reads CLAUDE.md; the workspace's guidance lives in the
 * harness-neutral AGENTS.md (§5). A relative symlink gives that harness its
 * expected filename with one source of truth — nothing duplicated to drift
 * (§16). A pre-existing regular CLAUDE.md or a link aimed elsewhere is
 * evidence of the human's own arrangement and is never overwritten (the
 * reconcile-never-clobber posture, intent/01-concepts/06-workspace-lifecycle.md);
 * doctor names that state, create leaves it. The link gets no baseline entry:
 * sha256OfFile would follow it and fingerprint AGENTS.md's content under a
 * second name, double-reporting every AGENTS.md customization — the link's
 * real content is its target, and doctor reads that directly.
 */
async function establishClaudeGuidance(ctx: CreateContext): Promise<StepReport> {
  const step = 'claude guidance';
  const state = inspectClaudeGuidance(ctx.root);
  if (state !== 'absent') {
    const detail = state === 'linked' ? 'CLAUDE.md → AGENTS.md' : 'CLAUDE.md is yours — left as is';
    return { step, outcome: 'satisfied', detail };
  }
  await symlink('AGENTS.md', join(ctx.root, 'CLAUDE.md'));
  ctx.establishedPaths.push('CLAUDE.md');
  return { step, outcome: 'established', detail: 'CLAUDE.md → AGENTS.md' };
}

async function establishIgnorePolicy(ctx: CreateContext): Promise<StepReport> {
  const step = 'ignore policy';
  const file = join(ctx.root, '.gitignore');
  const existing = existsSync(file) ? await readFile(file, 'utf8') : '';
  const lines = new Set(existing.split('\n'));
  const missing = IGNORE_LINES.filter((line) => !lines.has(line));
  if (missing.length === 0) return { step, outcome: 'satisfied', detail: '.gitignore' };
  const lead =
    existing === ''
      ? '# Contained checkouts and scratch are the world the record describes, not the record.\n'
      : existing.endsWith('\n')
        ? ''
        : '\n';
  await appendFile(file, `${lead}${missing.join('\n')}\n`);
  ctx.establishedPaths.push('.gitignore');
  return { step, outcome: 'established', detail: '.gitignore' };
}

async function establishScopeDirs(ctx: CreateContext): Promise<StepReport> {
  const step = 'scope directories';
  const detail = SCOPE_DIRS.map((dir) => `${dir}/`).join(' ');
  const missing = SCOPE_DIRS.filter((dir) => !existsSync(join(ctx.root, dir)));
  for (const dir of missing) {
    await mkdir(join(ctx.root, dir), { recursive: true });
  }
  return { step, outcome: missing.length > 0 ? 'established' : 'satisfied', detail };
}

/**
 * Every workspace carries one standing project for work on the workspace
 * itself — upgrades, migrations, reflection adoption
 * (intent/01-concepts/06-workspace-lifecycle.md, The standing workspace
 * project). Its identity is allocated like any project's: the next floor
 * number — floor 1 in a fresh workspace, next-available on the converge run
 * that carries it to a pre-0018 workspace (the 0017 migration-target
 * pattern). Resolution is by the record's `standing` marker, written here and
 * nowhere else. The record gets no baseline entry: it is a record the store
 * validates by schema, not an installed artifact whose customization a
 * fingerprint must detect. The store lock is already held by createWorkspace,
 * so the allocation scan and write happen inline, not through openProject.
 */
async function establishStandingProject(ctx: CreateContext): Promise<StepReport> {
  const step = 'standing project';
  const existing = await findStandingProject(ctx.root);
  if (existing !== undefined) {
    return { step, outcome: 'satisfied', detail: `${existing.dir}/` };
  }
  const floor = nextFloor(ctx.root);
  const dir = `projects/${floor}-${STANDING_PROJECT_SLUG}`;
  await writeDocument(ctx.root, projectRecordType(dir), {
    data: {
      type: 'project',
      floor,
      slug: STANDING_PROJECT_SLUG,
      standing: true,
      state: 'active',
      openedAt: new Date().toISOString(),
    },
    body:
      `Floor ${floor}: the standing workspace project — the home for work on the workspace ` +
      'itself (upgrades and their reconciliation, migrations, reflection adoption). ' +
      'Established at creation, and the one project that never closes: its arc is the ' +
      "workspace's own, which has no terminal state.",
  });
  ctx.establishedPaths.push(`${dir}/project.md`);
  return { step, outcome: 'established', detail: `${dir}/` };
}

/**
 * Fingerprint what this run installed, so a future upgrade can tell
 * customized from untouched (intent/01-concepts/06-workspace-lifecycle.md).
 * An artifact that already existed gets no entry — its provenance is unknown,
 * and an absent baseline is read conservatively as "customized" later.
 * Re-installing an artifact (it went missing and came back) replaces its entry.
 */
async function establishBaselines(ctx: CreateContext): Promise<StepReport> {
  const step = 'installed baselines';
  const relPath = baselinesType.relPath;
  const exists = existsSync(join(ctx.root, relPath));
  const existing = exists ? (await readDocument(ctx.root, baselinesType)).data.artifacts : [];
  if (exists && ctx.installedArtifacts.length === 0) {
    return { step, outcome: 'satisfied', detail: relPath };
  }
  const kept = existing.filter((artifact) => !ctx.installedArtifacts.includes(artifact.path));
  const added = [];
  for (const path of ctx.installedArtifacts) {
    added.push({
      path,
      sha256: await sha256OfFile(join(ctx.root, path)),
      wardVersion: pkg.version,
      installedAt: new Date().toISOString(),
    });
  }
  await writeDocument(ctx.root, baselinesType, {
    data: { type: 'baselines', artifacts: [...kept, ...added] },
    body:
      'What Ward installed here, fingerprinted at install time, so an upgrade can tell ' +
      'customized from untouched. Written by `ward`; editing it by hand breaks what ' +
      'divergence detection means.',
  });
  ctx.establishedPaths.push(relPath);
  return { step, outcome: 'established', detail: relPath };
}

function establishGitRepository(ctx: CreateContext): StepReport {
  const step = 'git repository';
  if (existsSync(join(ctx.root, '.git'))) return { step, outcome: 'satisfied', detail: '.git/' };
  gitOrThrow(ctx.root, 'init');
  return { step, outcome: 'established', detail: '.git/' };
}

/**
 * Record the name of the workspace's own main line in the workspace record —
 * read from the repository, never assumed, the same rule the repository set
 * follows (intent/01-concepts/06-workspace-lifecycle.md, the main line's name
 * is recorded — here too; design/0020-deterministic-upgrade/). Runs after the
 * git step because the name is the repository's to give (a fresh `git init`
 * already has a symbolic HEAD to read), and before the commit so the run's
 * one commit carries it. On converge, a record that already names its main
 * line is left alone even when the root stands elsewhere: that disagreement
 * is drift for doctor to name, not for creation to silently re-record.
 */
async function establishMainLine(ctx: CreateContext): Promise<StepReport> {
  const step = 'workspace main line';
  const existing = await readDocument(ctx.root, workspaceRecordType);
  if (existing.data.mainLine !== undefined) {
    return { step, outcome: 'satisfied', detail: existing.data.mainLine };
  }
  const branch = workspaceMainLine(ctx.root);
  await writeDocument(ctx.root, workspaceRecordType, {
    data: { ...existing.data, mainLine: branch },
    body: existing.body,
  });
  if (!ctx.establishedPaths.includes(workspaceRecordType.relPath)) {
    ctx.establishedPaths.push(workspaceRecordType.relPath);
  }
  return { step, outcome: 'established', detail: branch };
}

function establishCommit(ctx: CreateContext): StepReport {
  const step = 'workspace history';
  if (!hasCommits(ctx.root)) {
    requireGitIdentity(ctx.root);
    gitOrThrow(ctx.root, 'add', '-A');
    gitOrThrow(ctx.root, 'commit', '-m', `Initialize Ward workspace (ward ${pkg.version})`);
    return { step, outcome: 'established', detail: 'initial commit' };
  }
  if (ctx.establishedPaths.length > 0) {
    requireGitIdentity(ctx.root);
    // Stage only what this run established, so a human's own uncommitted
    // edits are never swept into a convergence commit.
    gitOrThrow(ctx.root, 'add', '--', ...ctx.establishedPaths);
    gitOrThrow(ctx.root, 'commit', '-m', `Converge Ward workspace (ward ${pkg.version})`);
    // The convergence commit is a journal write like any other: landing off
    // the recorded main line proceeds loudly, never silently (0020).
    warnJournalOffMainLine(ctx.root);
    return { step, outcome: 'established', detail: 'convergence commit' };
  }
  return { step, outcome: 'satisfied', detail: 'nothing to commit' };
}

function requireGitIdentity(root: string): void {
  if (git(root, 'var', 'GIT_AUTHOR_IDENT').exitCode !== 0) {
    throw new WardError(
      'git has no author identity here — set user.name and user.email (git config), then re-run',
    );
  }
}
