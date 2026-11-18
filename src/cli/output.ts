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
//
// The streams are the invocation's (design/0074-in-process-cli-tests/): a real
// run's are the process's own, an in-process run's capture.
import { format } from 'node:util';
import { type Channel, invocation } from './invocation.ts';

const pending: Record<Channel, Promise<void>> = {
  stdout: Promise.resolve(),
  stderr: Promise.resolve(),
};

/** Write text to a channel; its completion joins what `flushed` waits for. */
function emit(channel: Channel, text: string): void {
  if (text === '') return;
  pending[channel] = invocation().write(channel, text);
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
  const leaving = invocation();
  // Recorded first, so a natural exit that wins a race still carries it.
  leaving.setExitCode(code);
  await flushed();
  return leaving.exit(code);
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
 * the terminal's shape read live from the invocation's stdout.
 */
export const pipeSafeStdout = {
  write: writeOut,
  get isTTY(): boolean | undefined {
    return invocation().stdoutIsTTY;
  },
  get rows(): number | undefined {
    return invocation().stdoutRows;
  },
};
