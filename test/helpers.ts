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
