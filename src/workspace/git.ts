// Git operations shell out to the system git (ADR 0005): the workspace's own
// version control is plumbing, not domain logic.
import { WardError } from '../errors.ts';

export interface GitResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

export function git(cwd: string, ...args: string[]): GitResult {
  // env is passed explicitly: without it, Bun.spawnSync uses the process's
  // original environment and silently ignores runtime process.env changes —
  // the tests' hermetic git identity depends on those being honored.
  const result = Bun.spawnSync(['git', ...args], { cwd, env: { ...process.env } });
  return {
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  };
}

/** Run git and fail legibly if it fails — for operations that must succeed. */
export function gitOrThrow(cwd: string, ...args: string[]): GitResult {
  const result = git(cwd, ...args);
  if (result.exitCode !== 0) {
    throw new WardError(`git ${args.join(' ')} failed: ${result.stderr.trim()}`);
  }
  return result;
}

export function gitAvailable(): boolean {
  return Bun.which('git') !== null;
}

/** Whether git can determine an author identity (config or environment). */
export function gitIdentityConfigured(cwd: string): boolean {
  return git(cwd, 'var', 'GIT_AUTHOR_IDENT').exitCode === 0;
}

export function hasCommits(cwd: string): boolean {
  return git(cwd, 'rev-parse', '--verify', 'HEAD').exitCode === 0;
}
