// `ward doctor` — inspect the machine, the cwd, and the workspace; report what is
// healthy and guide the user to a good setup instead of failing cryptically
// (human-shell: a self-diagnosis command).

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { findWorkspaceRoot } from '../store/workspace.ts';

const run = promisify(execFile);

export interface Check {
  name: string;
  ok: boolean;
  detail: string;
}

export async function runDoctor(cwd: string): Promise<Check[]> {
  const nodeMajor = Number(process.versions.node.split('.')[0]);
  const root = await findWorkspaceRoot(cwd);
  return [
    { name: 'node', ok: nodeMajor >= 24, detail: `v${process.versions.node} (need ≥24)` },
    await toolCheck('git', ['--version'], true),
    {
      name: 'workspace',
      ok: root !== null,
      detail: root ?? 'none at or above cwd — run `ward init`',
    },
  ];
}

async function toolCheck(cmd: string, args: string[], required: boolean): Promise<Check> {
  try {
    const { stdout } = await run(cmd, args);
    return { name: cmd, ok: true, detail: stdout.trim().split('\n')[0] ?? 'present' };
  } catch {
    return {
      name: cmd,
      ok: !required,
      detail: required ? 'MISSING (required)' : 'not installed (optional)',
    };
  }
}
