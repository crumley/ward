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

/**
 * Pin the global configuration and state directories into a throwaway tree,
 * the same hermetic move as the git and gh pins (design/0024-global-config-registry/):
 * no test ever reads or writes the machine's real `$XDG_CONFIG_HOME` /
 * `$XDG_STATE_HOME` — or the developer's own workspace registry — unless it
 * points these at a directory of its own. Created once per test process and
 * removed at exit.
 *
 * `XDG_CONFIG_HOME` is pinned alongside them because doctor reads OTHER tools'
 * directories under it now — `fish/conf.d/ward.fish` and
 * `fish/completions/ward.fish` (design/0026-shell-staleness-doctor/) — and no
 * test may read the developer's real fish configuration. It changes nothing
 * about Ward's own directories: `WARD_CONFIG_DIR` overrides it.
 */
export const WARD_GLOBAL_ENV = ((): Readonly<Record<string, string>> => {
  const dir = mkdtempSync(join(tmpdir(), 'ward-test-global-'));
  process.on('exit', () => rmSync(dir, { recursive: true, force: true }));
  return {
    WARD_CONFIG_DIR: join(dir, 'config'),
    WARD_STATE_DIR: join(dir, 'state'),
    XDG_CONFIG_HOME: join(dir, 'xdg-config'),
  };
})();

export function applyGitTestEnv(): void {
  Object.assign(process.env, GIT_ENV, WARD_GLOBAL_ENV, { WARD_GH: NO_GH });
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
    env: { ...process.env, NO_COLOR: '1', WARD_GH: NO_GH, ...GIT_ENV, ...WARD_GLOBAL_ENV },
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
  const merged: Record<string, string | undefined> = {
    ...process.env,
    ...GIT_ENV,
    ...WARD_GLOBAL_ENV,
  };
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

export interface FakeClaudeBehavior {
  /** Append one JSON line per invocation here: argv, cwd, and the env Ward set. */
  readonly logFile?: string;
  /** What the stub exits with — the run's own verdict, which ward propagates. */
  readonly exitCode?: number;
}

/**
 * Write an executable stub for `WARD_CLAUDE_BIN` to point at
 * (design/0029-launched-sessions/): the same hermetic move as the fake `gh`,
 * for the same reason — no test may spawn the real Claude Code, and what the
 * suite actually needs to observe is the argv Ward built, the directory it
 * launched in, and the environment it declared. The stub records exactly that
 * and exits, so a "record then launch" assertion can read the session document
 * from inside the launched process's own run.
 */
export function writeFakeClaude(
  dir: string,
  name: string,
  behavior: FakeClaudeBehavior = {},
): string {
  const path = join(dir, name);
  const script = `#!/usr/bin/env bun
// Fake claude (test scaffolding) — see test/helpers.ts writeFakeClaude.
import { existsSync, appendFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
const behavior = ${JSON.stringify(behavior)};

/** The workspace root above wherever ward launched us. */
function findRoot(from) {
  let dir = resolve(from);
  while (true) {
    if (existsSync(join(dir, '.ward'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/** Whether OUR session's record is already on disk — record-then-launch, observed. */
function recordSeen(id) {
  const root = findRoot(process.cwd());
  if (root === null || !id) return false;
  const containers = ['', 'tasks/*', 'projects/*/tasks/*'];
  return containers.some((container) =>
    [...new Bun.Glob(join(container, 'sessions', id + '.md')).scanSync({ cwd: root })].length > 0,
  );
}

const id = process.env.WARD_AGENT ?? null;
if (behavior.logFile) {
  appendFileSync(behavior.logFile, JSON.stringify({
    argv: process.argv.slice(2),
    cwd: process.cwd(),
    wardAgent: id,
    recordSeen: recordSeen(id),
  }) + '\\n');
}
process.exit(behavior.exitCode ?? 0);
`;
  writeFileSync(path, script);
  chmodSync(path, 0o755);
  return path;
}

export interface FakeGhBehavior {
  /** Canned `pr view` answer per URL; 'error' exits 1. `mergeCommit` is the oid. */
  readonly responses: Record<
    string,
    { state: string; reviewDecision?: string; mergeCommit?: string; baseRefName?: string } | 'error'
  >;
  /** `gh auth status` verdict — 'ok' exits 0, 'error' exits 1 (unset: 1). */
  readonly auth?: 'ok' | 'error';
  /** Sleep before answering — the timeout tests hang the forge with this. */
  readonly delayMs?: number;
  /** Append each asked URL here, one per line — for call-count assertions. */
  readonly logFile?: string;
}

/**
 * Write an executable fake `gh` for WARD_GH to point at: answers
 * `gh pr view URL --json state,reviewDecision,mergeCommit,baseRefName` from
 * the canned table, in gh's own vocabulary (OPEN/MERGED/CLOSED,
 * APPROVED/CHANGES_REQUESTED/…, mergeCommit as `{oid}` or null and
 * baseRefName as a string exactly as gh emits them), and `gh auth status` by
 * exit code alone (design/0010-doctor-forge-auth/) — so the probes'
 * translation is what gets exercised, never the network.
 */
export function writeFakeGh(dir: string, name: string, behavior: FakeGhBehavior): string {
  const path = join(dir, name);
  const script = `#!/usr/bin/env bun
// Fake gh (test scaffolding) — see test/helpers.ts writeFakeGh.
import { appendFileSync } from 'node:fs';
const behavior = ${JSON.stringify(behavior)};
if (process.argv[2] === 'auth') {
  if (behavior.delayMs) await Bun.sleep(behavior.delayMs);
  process.exit(behavior.auth === 'ok' ? 0 : 1);
}
const url = process.argv[4] ?? '';
if (behavior.logFile) appendFileSync(behavior.logFile, url + '\\n');
if (behavior.delayMs) await Bun.sleep(behavior.delayMs);
const answer = behavior.responses[url];
if (answer === undefined || answer === 'error') {
  console.error('GraphQL: Could not resolve to a PullRequest');
  process.exit(1);
}
console.log(JSON.stringify({
  baseRefName: answer.baseRefName ?? '',
  mergeCommit: answer.mergeCommit ? { oid: answer.mergeCommit } : null,
  reviewDecision: answer.reviewDecision ?? '',
  state: answer.state,
}));
`;
  writeFileSync(path, script);
  chmodSync(path, 0o755);
  return path;
}
