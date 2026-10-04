// The CLI's one way out to stdout and stderr (design/0048-pipe-safe-output/).
//
// Bun's native console writes a pipe with a non-blocking, fire-and-forget
// write: once the descriptor is non-blocking — and constructing
// `process.stdout`, which the argument parser does to read `isTTY` and
// `columns`, makes it so — everything past the pipe's buffer (64 KiB on
// macOS and Linux) is dropped the moment the reader is slower than the
// writer, process exit or no. The Node streams behind `process.stdout` and
// `process.stderr` queue the remainder and finish it before a natural exit,
// but `process.exit()` cuts that queue too.
//
// So every write goes through the streams, each write's completion is
// tracked, and the CLI leaves only through `exitWhenFlushed`, which waits for
// the last write on both streams before exiting. The stream's own
// `writableLength` cannot stand in for the tracking: under Bun it reads 0
// while a pipe write is still pending.
import { format } from 'node:util';

type Channel = 'stdout' | 'stderr';

const pending: Record<Channel, Promise<void>> = {
  stdout: Promise.resolve(),
  stderr: Promise.resolve(),
};

/** Write text to a channel; its completion joins what `flushed` waits for. */
function emit(channel: Channel, text: string): void {
  if (text === '') return;
  const stream = channel === 'stdout' ? process.stdout : process.stderr;
  pending[channel] = new Promise<void>((resolve) => {
    // Resolve on error too: a reader that went away (EPIPE) has nothing
    // left to wait for, and the exit must not hang on it.
    stream.write(text, () => resolve());
  });
}

export function writeOut(text: string): void {
  emit('stdout', text);
}

export function writeErr(text: string): void {
  emit('stderr', text);
}

/** Every write so far, on both channels, handed to the operating system. */
export function flushed(): Promise<void> {
  return Promise.all([pending.stdout, pending.stderr]).then(() => undefined);
}

/**
 * Exit with `code` once everything written has left the process. Returns a
 * promise that never settles, so a caller that awaits it stops there, as it
 * would at `process.exit()`.
 */
export async function exitWhenFlushed(code: number): Promise<never> {
  // Recorded first, so a natural exit that wins a race still carries it.
  process.exitCode = code;
  await flushed();
  process.exit(code);
}

/**
 * Route the global console through the tracked writers. Installed once, at
 * the entry point, so every `console.log` in the CLI — and in anything it
 * calls — is pipe-safe by construction rather than by each call site
 * remembering to be.
 */
export function installPipeSafeConsole(): void {
  console.log = (...args: unknown[]) => writeOut(`${format(...args)}\n`);
  console.info = console.log;
  console.error = (...args: unknown[]) => writeErr(`${format(...args)}\n`);
  console.warn = console.error;
}

/**
 * Stdout as a progress display's stream: writes tracked like every other,
 * the terminal's shape read live from the real stream.
 */
export const pipeSafeStdout = {
  write: writeOut,
  get isTTY(): boolean | undefined {
    return process.stdout.isTTY;
  },
  get rows(): number | undefined {
    return process.stdout.rows;
  },
};
