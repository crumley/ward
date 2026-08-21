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

/**
 * The same call, awaited rather than blocked on — the variant that lets
 * independent repositories be worked on at once (design/0023-refresh-concurrency-ux/).
 * `git()` stays the default: shelling out is fast, and a synchronous call is
 * the simpler thing to read wherever the work is inherently serial. This one
 * exists only where several git processes should overlap, and it follows the
 * forge probe's spawn shape (`src/forge/gh.ts`): pipe both streams, drain them
 * before awaiting exit — a pipe left unread deadlocks on output larger than
 * its buffer — and pass `env` explicitly for the same reason `git()` does.
 */
export async function gitAsync(cwd: string, ...args: string[]): Promise<GitResult> {
  const proc = Bun.spawn(['git', ...args], {
    cwd,
    env: { ...process.env },
    stdout: 'pipe',
    stderr: 'pipe',
    stdin: 'ignore',
  });
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  await proc.exited;
  return { exitCode: proc.exitCode ?? 1, stdout, stderr };
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
