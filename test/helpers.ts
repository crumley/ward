// Shared test scaffolding: hermetic git + forge environment, temp workspaces,
// and the fake `gh` the forge-probe tests point WARD_GH at.
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
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

// Pin the forge probe to an impossible executable, the same hermetic move as
// the git config pins: no test reaches the machine's real gh unless it
// explicitly points WARD_GH at a fake (design/0009-live-forge-state/).
export const NO_GH = '/dev/null/gh';

export function applyGitTestEnv(): void {
  Object.assign(process.env, GIT_ENV, { WARD_GH: NO_GH });
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
    env: { ...process.env, NO_COLOR: '1', WARD_GH: NO_GH, ...GIT_ENV },
  });
  return {
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  };
}

/**
 * Like runWard, but the caller controls the color/caller/forge environment:
 * the inherited NO_COLOR / FORCE_COLOR / CI / WARD_AGENT / WARD_GH are
 * cleared first, so only the row's own env decides what the CLI sees — the
 * agent-caller tests need color to be genuinely negotiable
 * (design/0005-agent-audience/) and the forge tests need gh to be genuinely
 * absent or faked (design/0009-live-forge-state/).
 */
export function runWardEnv(argv: string[], cwd: string, env: Record<string, string>): CliResult {
  const merged: Record<string, string | undefined> = { ...process.env, ...GIT_ENV };
  delete merged.NO_COLOR;
  delete merged.FORCE_COLOR;
  delete merged.CI;
  delete merged.WARD_AGENT;
  delete merged.WARD_GH;
  delete merged.WARD_GH_TIMEOUT_MS;
  Object.assign(merged, env);
  const result = Bun.spawnSync(['bun', cliPath, ...argv], { cwd, env: merged });
  return {
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  };
}

export interface FakeGhBehavior {
  /** Canned `pr view --json state,reviewDecision` answer per URL; 'error' exits 1. */
  readonly responses: Record<string, { state: string; reviewDecision?: string } | 'error'>;
  /** Sleep before answering — the timeout tests hang the forge with this. */
  readonly delayMs?: number;
  /** Append each asked URL here, one per line — for call-count assertions. */
  readonly logFile?: string;
}

/**
 * Write an executable fake `gh` for WARD_GH to point at: answers
 * `gh pr view URL --json state,reviewDecision` from the canned table, in
 * gh's own vocabulary (OPEN/MERGED/CLOSED, APPROVED/CHANGES_REQUESTED/…),
 * so the probe's translation is what gets exercised — never the network.
 */
export function writeFakeGh(dir: string, name: string, behavior: FakeGhBehavior): string {
  const path = join(dir, name);
  const script = `#!/usr/bin/env bun
// Fake gh (test scaffolding) — see test/helpers.ts writeFakeGh.
import { appendFileSync } from 'node:fs';
const behavior = ${JSON.stringify(behavior)};
const url = process.argv[4] ?? '';
if (behavior.logFile) appendFileSync(behavior.logFile, url + '\\n');
if (behavior.delayMs) await Bun.sleep(behavior.delayMs);
const answer = behavior.responses[url];
if (answer === undefined || answer === 'error') {
  console.error('GraphQL: Could not resolve to a PullRequest');
  process.exit(1);
}
console.log(JSON.stringify({ reviewDecision: answer.reviewDecision ?? '', state: answer.state }));
`;
  writeFileSync(path, script);
  chmodSync(path, 0o755);
  return path;
}
