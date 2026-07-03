// Workspace setup (`ward init`). Creates the durable record with a version stamp
// (§14), injects the default persona cast, and writes the ignore policy so the
// large regenerable git checkouts stay untracked while `.ward/` is versioned
// (§15/§16). Idempotent: re-running on an existing workspace returns it unchanged.

import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { writeDocument } from '../store/doc.ts';
import { workspaceDoc } from '../store/paths.ts';
import type { Workspace } from '../store/schemas.ts';
import { loadWorkspace } from '../store/workspace.ts';
import { SCHEMA_VERSION, WARD_VERSION } from '../version.ts';
import { DEFAULT_CAST, writePersona } from './personas.ts';

export interface RepoInput {
  name: string;
  remote?: string;
  mainBranch?: string;
}

export interface InitOptions {
  repos?: readonly RepoInput[];
  models?: { fast: string; deep: string };
}

// Concrete model ids are CONFIG that tracks the best available models; never
// baked into the concepts (04-model-selection).
const DEFAULT_MODELS = { fast: 'claude-haiku-4-5', deep: 'claude-opus-4-8' };

export async function initWorkspace(root: string, opts: InitOptions = {}): Promise<Workspace> {
  const existing = await tryLoadWorkspace(root);
  if (existing !== null) {
    return existing;
  }
  const workspace: Workspace = {
    type: 'workspace',
    wardVersion: WARD_VERSION,
    schemaVersion: SCHEMA_VERSION,
    repos: (opts.repos ?? []).map((r) => ({
      name: r.name,
      mainBranch: r.mainBranch ?? 'main',
      ...(r.remote === undefined ? {} : { remote: r.remote }),
    })),
    models: opts.models ?? DEFAULT_MODELS,
  };
  await writeDocument(workspaceDoc(root), workspace);
  for (const persona of DEFAULT_CAST) {
    await writePersona(root, persona);
  }
  await writeWorkspaceGitignore(root);
  return workspace;
}

async function tryLoadWorkspace(root: string): Promise<Workspace | null> {
  try {
    return await loadWorkspace(root);
  } catch {
    return null;
  }
}

/** The workspace tracks `.ward/` but ignores the regenerable checkouts under repos/ and worktrees/. */
async function writeWorkspaceGitignore(root: string): Promise<void> {
  const body = [
    '# Regenerable git checkouts — restored from origin + recorded branches.',
    'repos/',
    'worktrees/',
    '',
    '.DS_Store',
    '',
  ].join('\n');
  await writeFile(join(root, '.gitignore'), body, 'utf8');
}
