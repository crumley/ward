// The Claude Code adapter (design/0029-launched-sessions/, design/0035-agent-command/):
// one implementation of the harness seam (src/harness/adapter.ts) — START a
// run, expose its HANDLE, RESUME it, and LOCATE its history — and nothing
// else. Everything Ward-specific (which session record, which purpose, which
// environment declares the agent) stays OUTSIDE this file and arrives as
// arguments, which is what lets a second harness (src/harness/pi.ts) be added
// without touching the session model, the store, or the CLI.
//
// How the CLI is INVOKED on this machine is configuration, not a constant:
// `agent.command` names the program and any leading words — `['npx', 'claude']`
// where `claude` cannot be run directly — and the adapter only supplies the
// default (`claude`) for a machine that says nothing. Above both sits
// `WARD_CLAUDE_BIN`, the env override that selects the program for one
// invocation: the hermeticity seam tests use — the same pattern as
// `WARD_CONFIG_DIR` and `WARD_GH` — so no test ever spawns the real CLI.
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  type CommandSource,
  type Env,
  flag,
  type HarnessAdapter,
  type HarnessCommand,
  harnessCommand,
  type LocateResult,
  type StartRequest,
} from './adapter.ts';

/** The harness name recorded in every handle this adapter mints, and its prefix. */
export const CLAUDE_HARNESS = 'claude';

/** What runs when nobody said otherwise: the CLI under its own name, on PATH. */
export const DEFAULT_CLAUDE_COMMAND: readonly string[] = ['claude'];

/** The env override that names the program for one invocation (the test seam). */
export const CLAUDE_BIN_ENV = 'WARD_CLAUDE_BIN';

/** Retained names for callers that predate the seam's shared types. */
export type ClaudeCommandSource = CommandSource;
export type ClaudeCommand = HarnessCommand;
export type { LocateResult } from './adapter.ts';

/**
 * The command that starts the CLI here — the shared resolution
 * (`harnessCommand`) applied to this adapter: `WARD_CLAUDE_BIN`, else the
 * configured `agent.command`, else `['claude']`.
 */
export function claudeCommand(
  configured: readonly string[] | undefined,
  env: Env = process.env,
): ClaudeCommand {
  return harnessCommand(claudeAdapter, configured, env);
}

/** Whether a command's program can be found — the shared, harness-agnostic lookup. */
export { locateProgram } from './adapter.ts';

/**
 * The harness handle: the harness name plus its native run id
 * (intent/01-concepts/02-sessions-and-lifecycle.md — a recorded ATTRIBUTE, not
 * a second identity). The prefix is what makes a handle self-describing: a
 * record carrying `claude:<uuid>` says which adapter can resolve it, so a
 * second harness can never be handed a run it cannot read.
 */
export function claudeHandle(nativeId: string): string {
  return `${CLAUDE_HARNESS}:${nativeId}`;
}

/** The native run id inside a `claude:` handle — null for anything else. */
export function claudeNativeId(handle: string): string | null {
  const prefix = `${CLAUDE_HARNESS}:`;
  if (!handle.startsWith(prefix)) return null;
  const id = handle.slice(prefix.length);
  return id === '' ? null : id;
}

/**
 * The argv of a fresh run, without the command that starts the CLI (that is
 * the adapter's, prepended at spawn). `--session-id <uuid>` is the whole trick
 * this rests on: Claude Code accepts the id of the conversation it is about to
 * create, so Ward assigns the handle and the process is born under it — no
 * prompt, no hook, no token spent asking the agent what its id turned out to
 * be, and nothing of Ward's in the run's context.
 *
 * Order is deliberate: Ward's own flags first, then the human's `agent.args`
 * LAST, so a human can always override what Ward passed — the last word on a
 * command line usually wins, and the tail is theirs.
 */
export function startArgv(request: StartRequest): string[] {
  return [
    '--session-id',
    request.nativeId,
    ...flag('--model', request.model),
    ...flag('--effort', request.effort),
    ...request.args,
  ];
}

/**
 * The argv of a resumed run. `claude --resume <id>` continues the SAME
 * conversation under the SAME id — only `--fork-session` mints a new one — so
 * a handle recorded at open stays valid across every resume.
 *
 * No `--model` and no `--effort`: a resumed run restores the model it was
 * saved with, and passing today's configuration would silently re-model an old
 * conversation mid-thread. `args` DOES ride along, because those are
 * per-invocation flags (`--dangerously-skip-permissions` is the motivating
 * case) that a resumed process needs exactly as much as a fresh one.
 */
export function resumeArgv(nativeId: string, args: readonly string[]): string[] {
  return ['--resume', nativeId, ...args];
}

/**
 * Where Claude Code keeps a run's transcript:
 * `<config>/projects/<munged-cwd>/<session-id>.jsonl`, where the munged cwd is
 * the ABSOLUTE working directory with every non-alphanumeric character
 * replaced by `-`. The working directory is part of the address, which is why
 * Ward records the directory a session ran in and resolves from that.
 *
 * `CLAUDE_CONFIG_DIR` is honored: a human who moved their Claude home moved
 * their transcripts with it, and reading the default anyway would report every
 * run as gone.
 */
export function transcriptPath(nativeId: string, cwd: string, env: Env = process.env): string {
  const configDir = env.CLAUDE_CONFIG_DIR ?? join(homedir(), '.claude');
  return join(configDir, 'projects', mungeCwd(cwd), `${nativeId}.jsonl`);
}

/** The cwd as Claude Code spells it in a transcript directory name. */
export function mungeCwd(cwd: string): string {
  return resolve(cwd).replace(/[^a-zA-Z0-9]/g, '-');
}

/**
 * Resolve a handle to its history, reporting FOUND and GONE as distinct
 * outcomes — the seam's explicit constraint. Gone is not an error: harness
 * retention is the harness's (Claude Code discards transcripts after
 * `cleanupPeriodDays`, 30 by default), so a handle that no longer resolves is
 * an ordinary, recordable fact. The path comes back either way, because "we
 * looked HERE and it is not there" is what makes a gone answer actionable.
 */
export function locateClaudeRun(
  nativeId: string,
  cwd: string,
  env: Env = process.env,
): LocateResult {
  const path = transcriptPath(nativeId, cwd, env);
  return { path, outcome: existsSync(path) ? 'found' : 'gone' };
}

/** Claude Code as a harness adapter — the seam's surface, over the functions above. */
export const claudeAdapter: HarnessAdapter = {
  name: CLAUDE_HARNESS,
  defaultCommand: DEFAULT_CLAUDE_COMMAND,
  binEnvVar: CLAUDE_BIN_ENV,
  retentionNote:
    'the harness owns retention (claude discards transcripts after cleanupPeriodDays, 30 by ' +
    "default) — the session's own record is what survives",
  handle: claudeHandle,
  nativeId: claudeNativeId,
  startArgv,
  resumeArgv,
  locate: locateClaudeRun,
};
