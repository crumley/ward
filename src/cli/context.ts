// CLI context: who is calling, which workspace, which scope — resolved from the
// environment and the working directory so the human never restates what the
// directory already implies (human-shell). Also the file-argument reader.

import { readFile } from 'node:fs/promises';
import { listWorktrees } from '../domain/worktree.ts';
import { worktreeCheckout } from '../store/paths.ts';
import { type PersonaRef, ROLES, type Role, type ScopeRef } from '../store/schemas.ts';
import { findWorkspaceRoot, requireWorkspaceRoot } from '../store/workspace.ts';

export interface Caller {
  kind: 'human' | 'agent';
  persona?: PersonaRef;
  scope?: ScopeRef;
  workingDir: string;
}

/**
 * The human is the default caller and declares nothing; an agent identifies
 * itself through the ambient signal Ward sets when it starts an agent
 * (WARD_AGENT + context vars). When present, context is taken from it.
 */
export function detectCaller(env: NodeJS.ProcessEnv, cwd: string): Caller {
  const isAgent = env.WARD_AGENT === '1' || env.WARD_PERSONA !== undefined;
  if (!isAgent) {
    return { kind: 'human', workingDir: cwd };
  }
  const caller: Caller = { kind: 'agent', workingDir: env.WARD_WORKDIR ?? cwd };
  const role = parseRole(env.WARD_ROLE);
  if (env.WARD_PERSONA !== undefined && role !== undefined) {
    caller.persona = { name: env.WARD_PERSONA, role };
  }
  const scope = env.WARD_SCOPE === undefined ? undefined : parseScope(env.WARD_SCOPE);
  if (scope !== undefined) {
    caller.scope = scope;
  }
  return caller;
}

export { findWorkspaceRoot, requireWorkspaceRoot };

/** Parse a scope string `kind[:ref]` (e.g. `task:1/csv-export`, `room:1A1`, `workspace`). */
export function parseScope(text: string): ScopeRef {
  const [kind, ...rest] = text.split(':');
  const ref = rest.join(':');
  switch (kind) {
    case 'workspace':
      return { kind: 'workspace', ref: '' };
    case 'project':
    case 'task':
    case 'room':
      return { kind, ref };
    default:
      throw new Error(`unknown scope kind '${kind}' (want workspace|project|task|room)`);
  }
}

/**
 * Derive the scope from the cwd when it sits inside a known worktree checkout —
 * so a command run from a worktree needn't be told which task it belongs to.
 * Returns null when the cwd implies nothing (e.g. the workspace root).
 */
export async function deriveScopeFromCwd(root: string, cwd: string): Promise<ScopeRef | null> {
  for (const worktree of await listWorktrees(root)) {
    const checkout = worktreeCheckout(root, worktree.repo, worktree.branch);
    if (cwd === checkout || cwd.startsWith(`${checkout}/`)) {
      return { kind: 'task', ref: `${worktree.floor}/${worktree.taskSlug}` };
    }
  }
  return null;
}

/** Read a long-text argument as an inline value, a file (`@path`), or stdin (`-`). */
export async function readTextArg(value: string): Promise<string> {
  if (value === '-') {
    return readStdin();
  }
  if (value.startsWith('@')) {
    return readFile(value.slice(1), 'utf8');
  }
  return value;
}

function parseRole(value: string | undefined): Role | undefined {
  return value !== undefined && (ROLES as readonly string[]).includes(value)
    ? (value as Role)
    : undefined;
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString('utf8');
}
