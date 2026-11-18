// The CLI's view of the process it answers (design/0074-in-process-cli-tests/):
// its arguments, its terminal, its input, its two output channels, the way it
// leaves, and what runs as it leaves. `main` in index.ts is handed one; the
// real entry builds it from the process (`processInvocation`), and the
// in-process runner (in-process.ts) builds one that captures instead.
//
// The environment and the working directory are deliberately NOT here. Every
// module below the CLI reads them from the process — `process.env` as a
// default parameter in some forty places, `process.cwd()` and relative paths
// in the filesystem calls, and every child process Ward spawns inherits the
// working directory — so the in-process runner installs them on the process
// for the run instead (in-process.ts says why that is safe).

/** One output channel. */
export type Channel = 'stdout' | 'stderr';

export interface Invocation {
  /** The arguments after the program name — `process.argv.slice(2)` for a real run. */
  readonly argv: readonly string[];
  /** Whether stdin is a terminal Ward could ask a question on. */
  readonly stdinIsTTY: boolean;
  /** Whether stdout is a terminal: color, JSON indentation, progress frames. */
  readonly stdoutIsTTY: boolean;
  /** The terminal's height in rows, when stdout is one and says. */
  readonly stdoutRows: number | undefined;
  /** All of stdin, as text (`ward task brief ADDRESS -`). */
  readStdin(): Promise<string>;
  /** Write text to a channel; resolves when it has left the process. */
  write(channel: Channel, text: string): Promise<void>;
  /** Record the code the run will leave with, before waiting to leave. */
  setExitCode(code: number): void;
  /** Leave with `code`, everything written already flushed. Never returns. */
  exit(code: number): never;
  /**
   * Run `hook` as the run ends, with its exit code — a process's `exit`
   * event. `ready` is work the hook would like settled first: a real exit
   * cannot wait for it, an in-process run does.
   */
  atExit(hook: (code: number) => void, ready?: Promise<unknown>): void;
}

let current: Invocation | undefined;

/** The invocation being answered; a process's own when none was entered. */
export function invocation(): Invocation {
  current ??= processInvocation();
  return current;
}

/**
 * Answer `next` until the returned function is called, which puts back the
 * invocation that was current before. Only `main` enters one.
 */
export function enterInvocation(next: Invocation): () => void {
  const before = current;
  current = next;
  return () => {
    current = before;
  };
}

/** The real process, as an invocation: what the bin entry hands `main`. */
export function processInvocation(): Invocation {
  return {
    argv: process.argv.slice(2),
    get stdinIsTTY() {
      return process.stdin.isTTY === true;
    },
    get stdoutIsTTY() {
      return process.stdout.isTTY === true;
    },
    get stdoutRows() {
      return process.stdout.rows;
    },
    readStdin: () => Bun.stdin.text(),
    write(channel, text) {
      const stream = channel === 'stdout' ? process.stdout : process.stderr;
      return new Promise<void>((resolve) => {
        // Resolve on error too: a reader that went away (EPIPE) has nothing
        // left to wait for, and the exit must not hang on it.
        stream.write(text, () => resolve());
      });
    },
    setExitCode(code) {
      process.exitCode = code;
    },
    exit(code) {
      process.exit(code);
    },
    atExit(hook) {
      process.on('exit', hook);
    },
  };
}

type Env = Record<string, string | undefined>;

/**
 * Whether this invocation's output may carry color: picocolors' own rule,
 * which it applies once, to the process, when it is first loaded — NO_COLOR or
 * `--no-color` refuse it; FORCE_COLOR, `--color`, Windows, a terminal that is
 * not dumb, or CI grant it. Read here from the invocation instead, so a second
 * caller in the same module is judged on its own terms; for a real run the
 * answer is the one picocolors would have given.
 */
export function colorSupported(invoked: Invocation, env: Env = process.env): boolean {
  const refused = Boolean(env.NO_COLOR) || invoked.argv.includes('--no-color');
  if (refused) return false;
  return (
    Boolean(env.FORCE_COLOR) ||
    invoked.argv.includes('--color') ||
    process.platform === 'win32' ||
    (invoked.stdoutIsTTY && env.TERM !== 'dumb') ||
    Boolean(env.CI)
  );
}

/**
 * Whether the argument parser colors its help and errors: @optique/run's own
 * rule (FORCE_COLOR grants, NO_COLOR or NODE_DISABLE_COLORS refuse, else
 * stdout being a terminal), read from the invocation for the same reason.
 */
export function parserColors(invoked: Invocation, env: Env = process.env): boolean {
  const force = env.FORCE_COLOR;
  if (force !== undefined && force !== '') return true;
  const noColor = env.NO_COLOR;
  if (noColor !== undefined && noColor !== '') return false;
  if (env.NODE_DISABLE_COLORS !== undefined) return false;
  return invoked.stdoutIsTTY;
}
