// Shared test scaffolding: hermetic git environment and temp workspaces.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Pin git to an identity from the environment alone, blind to the machine's
// config files, so tests behave identically on any machine and in CI.
export const GIT_ENV = {
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_SYSTEM: '/dev/null',
  GIT_AUTHOR_NAME: 'Ward Test',
  GIT_AUTHOR_EMAIL: 'ward-test@example.com',
  GIT_COMMITTER_NAME: 'Ward Test',
  GIT_COMMITTER_EMAIL: 'ward-test@example.com',
} as const;

export function applyGitTestEnv(): void {
  Object.assign(process.env, GIT_ENV);
}

export function makeTempDir(): string {
  return mkdtempSync(join(tmpdir(), 'ward-test-'));
}

export function removeDir(dir: string): void {
  rmSync(dir, { recursive: true, force: true });
}

export const cliPath = new URL('../src/cli/index.ts', import.meta.url).pathname;

export interface CliResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

/**
 * Spawn the CLI as a subprocess. NO_COLOR pins the output to plain text:
 * picocolors would otherwise enable ANSI wherever CI=true is set, making the
 * same assertion pass locally and fail in CI (design/0001-dev-foundation/).
 */
export function runWard(argv: string[], cwd: string): CliResult {
  const result = Bun.spawnSync(['bun', cliPath, ...argv], {
    cwd,
    env: { ...process.env, NO_COLOR: '1', ...GIT_ENV },
  });
  return {
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  };
}

/**
 * Like runWard, but the caller controls the color/caller environment: the
 * inherited NO_COLOR / FORCE_COLOR / CI / WARD_AGENT are cleared first, so
 * only the row's own env decides what the CLI sees — the agent-caller tests
 * need color to be genuinely negotiable (design/0005-agent-audience/).
 */
export function runWardEnv(argv: string[], cwd: string, env: Record<string, string>): CliResult {
  const merged: Record<string, string | undefined> = { ...process.env, ...GIT_ENV };
  delete merged.NO_COLOR;
  delete merged.FORCE_COLOR;
  delete merged.CI;
  delete merged.WARD_AGENT;
  Object.assign(merged, env);
  const result = Bun.spawnSync(['bun', cliPath, ...argv], { cwd, env: merged });
  return {
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  };
}
