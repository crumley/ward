// The Claude Code adapter (design/0029-launched-sessions/): the thin seam
// intent/02-subsystems/03-agent-harness.md names — START a run, expose its
// HANDLE, RESUME it, and LOCATE its history — and nothing else. Everything
// Ward-specific (which session record, which purpose, which environment
// declares the agent) stays OUTSIDE this file and arrives as arguments, which
// is what lets a second harness be added without touching the session model,
// the store, or the CLI (the seam's own "everything Ward-specific staying in
// Ward").
//
// The one Ward-shaped thing here is `WARD_CLAUDE_BIN`: the env override that
// selects the binary. It is the hermeticity seam tests use — the same pattern
// as `WARD_CONFIG_DIR` and `WARD_GH` — so no test ever spawns the real CLI,
// and it doubles as the escape hatch for a human whose `claude` is not on
// PATH under that name.
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

type Env = Record<string, string | undefined>;

/** The harness type recorded in every handle this adapter mints. */
export const CLAUDE_HARNESS = 'claude';

/** The executable, overridable for tests and for a differently-named install. */
export function claudeBin(env: Env = process.env): string {
  const override = env.WARD_CLAUDE_BIN;
  return override !== undefined && override !== '' ? override : 'claude';
}

/**
 * The harness handle: the harness type plus its native run id
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
 * What Ward hands the adapter to start a run. `model` and `effort` are
 * optional in the strict sense 0028 built: absent means the flag is omitted
 * ENTIRELY, never passed empty and never defaulted here — the harness's own
 * default then stands (design/0028-agent-configuration/, SF-002).
 */
export interface StartRequest {
  /** The session id Ward assigns BEFORE the process exists — the handle's native half. */
  readonly nativeId: string;
  readonly model?: string | undefined;
  readonly effort?: string | undefined;
  /** Extra arguments, appended verbatim and last (agent.args). */
  readonly args: readonly string[];
}

/**
 * The argv of a fresh run, without the binary. `--session-id <uuid>` is the
 * whole trick this entry rests on: Claude Code accepts the id of the
 * conversation it is about to create, so WARD assigns the handle and the
 * process is born under it — no prompt, no hook, no token spent asking the
 * agent what its id turned out to be, and nothing of Ward's in the run's
 * context (the directive's zero-cost ask: tracking may not pollute the
 * session with context that serves only the tracking).
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
 * a handle recorded at open stays valid across every resume, which is what
 * makes the recorded handle a durable locator rather than a one-shot token.
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

export interface RunRequest {
  readonly argv: readonly string[];
  /** Absolute working directory the run stands in. */
  readonly cwd: string;
  /** Extra environment for the child, merged over the caller's own. */
  readonly env: Readonly<Record<string, string>>;
}

export type RunResult =
  | { readonly outcome: 'exited'; readonly exitCode: number }
  /** The process never started — a missing binary, a permission error. */
  | { readonly outcome: 'failed'; readonly cause: string };

/**
 * Run the harness in the FOREGROUND, inheriting stdio, and wait for it. The
 * terminal is the human's conversation with the agent; Ward's job is to hand
 * it over intact and take it back when the run exits. Nothing here interprets
 * the exit code — an agent exiting is not a session ending (open ≠ running,
 * intent/01-concepts/02-sessions-and-lifecycle.md), and deciding what an exit
 * MEANS is Ward's business, not the adapter's.
 */
export async function runClaude(request: RunRequest, env: Env = process.env): Promise<RunResult> {
  const command = [claudeBin(env), ...request.argv];
  try {
    const child = Bun.spawn(command, {
      cwd: request.cwd,
      env: { ...env, ...request.env },
      stdio: ['inherit', 'inherit', 'inherit'],
    });
    return { outcome: 'exited', exitCode: await child.exited };
  } catch (error) {
    // A binary that is not there is the ordinary failure — reported with its
    // cause so the caller can record it (the seam's resume-failed event) and
    // name the fix, never a stack trace at the human.
    const reason = error instanceof Error ? error.message : String(error);
    return { outcome: 'failed', cause: `${command[0]}: ${reason}` };
  }
}

/**
 * Where Claude Code keeps a run's transcript:
 * `<config>/projects/<munged-cwd>/<session-id>.jsonl`, where the munged cwd is
 * the ABSOLUTE working directory with every non-alphanumeric character
 * replaced by `-`. The working directory is part of the address, which is why
 * Ward records the directory a session ran in and resolves from that — not
 * from wherever the caller happens to stand when they ask.
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

export interface LocateResult {
  /** The path the transcript would have — reported whether or not it is there. */
  readonly path: string;
  readonly outcome: 'found' | 'gone';
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

/** A flag and its value, or nothing at all — the "omitted means omitted" rule. */
function flag(name: string, value: string | undefined): string[] {
  return value === undefined ? [] : [name, value];
}
