// The agent-harness adapter seam (intent/02-subsystems/03-agent-harness.md):
// the small fixed surface every harness Ward can run exposes — START a run,
// name its HANDLE, RESUME it, and LOCATE its history — with everything
// Ward-specific staying outside. There is one adapter per harness
// (src/harness/claude.ts, src/harness/pi.ts); the registry
// (src/harness/index.ts) routes by NAME for a launch (which adapter the
// configured `agent.harness` selects) and by HANDLE PREFIX for a resume, a
// locate, or a status probe (a `claude:` session is claude's to resolve
// whatever the configuration now says, so a workspace can mix harnesses and a
// handle is never handed to an adapter that cannot read it).
//
// The machinery a launch needs REGARDLESS of harness lives here, because it is
// the same question for every adapter: how the invoking command resolves
// (design/0035-agent-command/), whether that program can be found, and how a
// process is spawned in the foreground and waited on. Only the two things that
// genuinely differ per harness — the argv it takes and where it keeps a run's
// history — are the adapter's own.

type Env = Record<string, string | undefined>;

export type { Env };

/**
 * What Ward hands an adapter to start a run. `model` and `effort` are optional
 * in the strict sense 0028 built: absent means the flag is omitted ENTIRELY,
 * never passed empty and never defaulted — the harness's own default then
 * stands (design/0028-agent-configuration/, SF-002). Each adapter spells
 * `effort` in its own CLI's word (`--effort` for claude, `--thinking` for pi):
 * the vocabulary belongs to the harness, and Ward passes the value through.
 */
export interface StartRequest {
  /** The session id Ward assigns BEFORE the process exists — the handle's native half. */
  readonly nativeId: string;
  readonly model?: string | undefined;
  readonly effort?: string | undefined;
  /** Extra arguments, appended verbatim and last (agent.args). */
  readonly args: readonly string[];
}

export interface LocateResult {
  /** The path the history would have — reported whether or not it is there. */
  readonly path: string;
  readonly outcome: 'found' | 'gone';
}

/** Where the command the adapter will run came from — reported by doctor. */
export type CommandSource = 'override' | 'configured' | 'default';

export interface HarnessCommand {
  /** The program and its leading words — everything BEFORE Ward's own flags. */
  readonly command: readonly string[];
  readonly source: CommandSource;
}

export interface RunRequest {
  /** The argv AFTER the command: Ward's flags, then the human's `agent.args`. */
  readonly argv: readonly string[];
  /** The configured `agent.command`, when a layer set one (see `harnessCommand`). */
  readonly command?: readonly string[] | undefined;
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
 * A harness Ward can run, behind the thin surface the seam names. Everything
 * here is adapter-specific; the generic helpers below take an adapter and do
 * the rest. `name` is BOTH the value written in `agent.harness` AND the handle
 * prefix — one string, so a configured harness and a recorded handle can never
 * spell the same harness two ways.
 */
export interface HarnessAdapter {
  /** The harness's name: the `agent.harness` value and the handle prefix. */
  readonly name: string;
  /** What runs when nobody configured a command: the CLI under its own name. */
  readonly defaultCommand: readonly string[];
  /** The env var that overrides the command for one invocation (the test seam). */
  readonly binEnvVar: string;
  /**
   * The clause the `gone` message appends about who owns retention — the
   * harness's own policy, which differs between harnesses (claude discards old
   * transcripts, pi keeps them until a human deletes one).
   */
  readonly retentionNote: string;
  /** The handle recorded for a run: the name, then its native id. */
  handle(nativeId: string): string;
  /** The native id inside one of THIS adapter's handles — null for any other. */
  nativeId(handle: string): string | null;
  /** The argv of a fresh run, without the command that starts the CLI. */
  startArgv(request: StartRequest): string[];
  /** The argv of a resumed run — no model or effort (see each adapter). */
  resumeArgv(nativeId: string, args: readonly string[]): string[];
  /** Resolve a native id to its history on THIS machine — found, or gone. */
  locate(nativeId: string, cwd: string, env?: Env): LocateResult;
}

/**
 * The command that starts a harness here: the adapter's `binEnvVar` when set
 * (one program, the whole command — a test's stub, or an emergency), else the
 * configured `agent.command`, else the adapter's default. The env override
 * sits ABOVE the configuration because it is the narrowest layer there is —
 * one invocation — and narrower wins on every axis this configuration has; it
 * is also what keeps every hermetic test pointing at its stub whatever a
 * scratch config says (design/0035-agent-command/).
 */
export function harnessCommand(
  adapter: HarnessAdapter,
  configured: readonly string[] | undefined,
  env: Env = process.env,
): HarnessCommand {
  const override = env[adapter.binEnvVar];
  if (override !== undefined && override !== '') return { command: [override], source: 'override' };
  if (configured !== undefined && configured.length > 0) {
    return { command: configured, source: 'configured' };
  }
  return { command: adapter.defaultCommand, source: 'default' };
}

/**
 * Whether a command's program can be found: an absolute or relative path
 * checked as such (relative to `cwd`, where the launch would stand), a bare
 * name searched on PATH. Returns the resolved location, or null — the same
 * question doctor asks of `gh`, asked before a launch dies on it. Harness-
 * agnostic: the program is a program whichever adapter named it.
 */
export function locateProgram(program: string, cwd: string, env: Env = process.env): string | null {
  return Bun.which(program, { cwd, ...(env.PATH === undefined ? {} : { PATH: env.PATH }) });
}

/**
 * Run a harness in the FOREGROUND, inheriting stdio, and wait for it. The
 * terminal is the human's conversation with the agent; Ward's job is to hand
 * it over intact and take it back when the run exits. Nothing here interprets
 * the exit code — an agent exiting is not a session ending (open ≠ running,
 * intent/01-concepts/02-sessions-and-lifecycle.md), and deciding what an exit
 * MEANS is Ward's business, not the adapter's.
 */
export async function runHarness(
  adapter: HarnessAdapter,
  request: RunRequest,
  env: Env = process.env,
): Promise<RunResult> {
  // The command's own words come first, Ward's flags after them, the human's
  // args last: `npx claude --session-id … --dangerously-skip-permissions`.
  const command = [...harnessCommand(adapter, request.command, env).command, ...request.argv];
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

/** A flag and its value, or nothing at all — the "omitted means omitted" rule. */
export function flag(name: string, value: string | undefined): string[] {
  return value === undefined ? [] : [name, value];
}
