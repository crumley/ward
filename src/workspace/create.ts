// Workspace creation as a list of idempotent establishment steps, each
// check-then-do — which is what makes re-running create the update path
// rather than a second mechanism (intent/01-concepts/06-workspace-lifecycle.md).
import { existsSync, statSync } from 'node:fs';
import { appendFile, mkdir, readdir, readFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import pkg from '../../package.json' with { type: 'json' };
import { WardError } from '../errors.ts';
import { readDocument, writeDocument } from '../store/document.ts';
import { catalogType, seededArtifactTypes, workspaceRecordType } from '../store/types.ts';
import { git, gitAvailable, gitOrThrow, hasCommits } from './git.ts';
import { IGNORE_LINES, MARKER_DIR, SCOPE_DIRS } from './layout.ts';
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
}

export async function createWorkspace(path: string): Promise<CreateReport> {
  if (!gitAvailable()) {
    throw new WardError('git is required to create a workspace and was not found on PATH');
  }
  const root = resolve(path);
  const ctx: CreateContext = { root, establishedPaths: [] };
  const steps: StepReport[] = [];
  steps.push(await establishRoot(ctx));
  steps.push(await establishMarker(ctx));
  steps.push(await establishWorkspaceRecord(ctx));
  steps.push(await establishCatalog(ctx));
  steps.push(await establishAgentsGuidance(ctx));
  steps.push(await establishIgnorePolicy(ctx));
  steps.push(await establishScopeDirs(ctx));
  steps.push(establishGitRepository(ctx));
  steps.push(establishCommit(ctx));
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
  return { step, outcome: 'established', detail: relPath };
}

async function establishAgentsGuidance(ctx: CreateContext): Promise<StepReport> {
  const step = 'agent guidance';
  const file = join(ctx.root, 'AGENTS.md');
  if (existsSync(file)) return { step, outcome: 'satisfied', detail: 'AGENTS.md' };
  await Bun.write(file, AGENTS_MD);
  ctx.establishedPaths.push('AGENTS.md');
  return { step, outcome: 'established', detail: 'AGENTS.md' };
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

function establishGitRepository(ctx: CreateContext): StepReport {
  const step = 'git repository';
  if (existsSync(join(ctx.root, '.git'))) return { step, outcome: 'satisfied', detail: '.git/' };
  gitOrThrow(ctx.root, 'init');
  return { step, outcome: 'established', detail: '.git/' };
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
