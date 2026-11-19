// The CLI run in-process (design/0074-in-process-cli-tests/): one call answers
// one `ward` invocation inside the calling process and hands back what a
// spawned `ward` would have — its exit code, stdout and stderr — without the
// cost of starting a runtime and loading the CLI for every invocation.
//
// The invocation's own channels (arguments, terminal, input, output, exit)
// are threaded into `main` as an Invocation. The environment and the working
// directory are not threaded: the CLI and every module below it read them
// from the process, and every child Ward spawns inherits the working
// directory, so for the run they are INSTALLED on the process — `process.env`
// replaced key by key, `process.chdir` — along with the rebound console, and
// all three are put back when the run ends, however it ends.
//
// What makes installing them safe is that no two runs ever overlap: every run
// in a process waits its turn on one queue, so a run sees only its own
// environment and directory, and the caller's are back before the next turn
// or the caller's own next line. Bun's test runner keeps the rest apart:
// `--parallel` gives each worker its own process (its own environment and
// working directory), and a worker runs one test file at a time.
// test/cli/in-process.test.ts proves both halves with runs started together.
import { main } from './index.ts';
import type { Channel, Invocation } from './invocation.ts';

export interface CliRequest {
  /** The arguments after `ward`. */
  readonly argv: readonly string[];
  /** The directory the run stands in. */
  readonly cwd: string;
  /** The run's whole environment — exactly what a spawned `ward` would be given. */
  readonly env: Readonly<Record<string, string | undefined>>;
  /** stdin's text, read whole by `-` arguments; empty when unset. */
  readonly stdin?: string;
  /**
   * Answer as if stdout were a terminal: color, indented JSON, live progress
   * frames. stdin is never a terminal in-process — nothing could answer a
   * question asked on it — so no prompt is ever shown.
   */
  readonly stdoutIsTTY?: boolean;
}

export interface CliResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

/** Answer one invocation in this process, after every run already waiting. */
export function runCli(request: CliRequest): Promise<CliResult> {
  const turn = queue.then(() => runAlone(request));
  queue = turn.then(
    () => undefined,
    () => undefined,
  );
  return turn;
}

/** The tail of the line every run waits in. */
let queue: Promise<void> = Promise.resolve();

/**
 * The exit an in-process run takes: thrown where a real run would call
 * `process.exit`, so the run's own stack unwinds and nothing after the exit
 * runs, exactly as nothing does after a real one.
 */
class CliExit extends Error {
  readonly code: number;
  constructor(code: number) {
    super(`ward exited ${code}`);
    this.code = code;
  }
}

async function runAlone(request: CliRequest): Promise<CliResult> {
  const out: Record<Channel, string[]> = { stdout: [], stderr: [] };
  const hooks: { hook: (code: number) => void; ready: Promise<unknown> | undefined }[] = [];
  let recorded: number | undefined;
  const invoked: Invocation = {
    argv: request.argv,
    stdinIsTTY: false,
    stdoutIsTTY: request.stdoutIsTTY === true,
    stdoutRows: undefined,
    readStdin: async () => request.stdin ?? '',
    write(channel, text) {
      out[channel].push(text);
      return Promise.resolve();
    },
    setExitCode(code) {
      recorded = code;
    },
    exit(code) {
      throw new CliExit(code);
    },
    atExit(hook, ready) {
      hooks.push({ hook, ready });
    },
  };

  const restore = install(request);
  let exitCode: number;
  try {
    try {
      await main(invoked);
      exitCode = recorded ?? 0;
    } catch (error) {
      if (error instanceof CliExit) {
        exitCode = error.code;
      } else {
        // A crash, not an exit: a real run dies with the error on stderr and
        // exit 1. The text is the error's own, not the runtime's crash report.
        exitCode = 1;
        out.stderr.push(`${error instanceof Error ? (error.stack ?? error.message) : error}\n`);
      }
    }
    // The process's `exit` event, still inside the run's environment and
    // directory: what a hook reads is what it would have read at a real exit.
    for (const { hook, ready } of hooks) {
      await ready;
      hook(exitCode);
    }
  } finally {
    restore();
  }
  return { exitCode, stdout: out.stdout.join(''), stderr: out.stderr.join('') };
}

/**
 * Install the run's environment and working directory on the process, and
 * capture the console the run is about to rebind. Returns the undo, which puts
 * all three back exactly as they were.
 */
function install(request: CliRequest): () => void {
  const env = { ...process.env };
  const cwd = process.cwd();
  const { log, info, error, warn } = console;
  replaceEnv(request.env);
  try {
    process.chdir(request.cwd);
  } catch (failure) {
    replaceEnv(env);
    throw failure;
  }
  return () => {
    Object.assign(console, { log, info, error, warn });
    process.chdir(cwd);
    replaceEnv(env);
  };
}

/** Make `process.env` hold exactly `next`: every other key removed. */
function replaceEnv(next: Readonly<Record<string, string | undefined>>): void {
  for (const key of Object.keys(process.env)) {
    if (!(key in next) || next[key] === undefined) delete process.env[key];
  }
  for (const [key, value] of Object.entries(next)) {
    if (value !== undefined) process.env[key] = value;
  }
}
