# 0048 — Output larger than a pipe's buffer arrives whole

> Every byte the CLI writes reaches a slow reader on the other end of a pipe. All stdout and stderr
> writes go through tracked stream writes, and every exit waits for them to finish first.
>
> **Status:** built — awaiting review · **Started:** 2026-10-03

The `--json` contract ([`0005`](../0005-agent-audience/README.md),
[`0015`](../0015-mutation-json/README.md)) promises one parseable document on stdout. That promise
broke at exactly 64 KiB whenever stdout was a pipe and the reader was slower than the writer.
`ward task list --all --json > file` wrote the whole 104 KB document. The same command piped into
`wc -c` read 65536 bytes, and piped into a JSON parser failed with an unterminated string. The cut
fell at the pipe's buffer size on both macOS and Linux, so any workspace with enough history
eventually crossed it, and the agent that reads the document is the caller hurt most.

The cause is in the runtime, not in any verb. Bun's native `console.log` writes a pipe with a single
write attempt and no retry. Once the descriptor is non-blocking, whatever does not fit in the pipe's
buffer is dropped. Constructing `process.stdout` makes the descriptor non-blocking, and the argument
parser constructs it on every run to read `isTTY` and `columns`. So every verb printed through a
writer that silently lost data. Waiting longer does not help, because the bytes are already gone. A
second, smaller hole sat beside it. The Node streams behind `process.stdout` and `process.stderr` do
queue the remainder and finish it before a natural exit. But `process.exit()`, which the CLI calls
on every refusal and every nonzero verdict, discards that queue.

## Serves intent

- [`principles`](../../intent/00-foundation/01-principles.md) — §8: the agent audience's output is
  deterministic and parseable regardless of size or of what reads it.
- [`principles`](../../intent/00-foundation/01-principles.md) — §20: a surface never hands its
  caller a wrong answer, and a truncated document is a wrong answer that looks like a broken tool.
- [`human-shell`](../../intent/02-subsystems/07-human-shell.md) — _a declared agent … receives a
  deterministic result or error_. The fix holds for a result of any length, and an error's exit code
  is unchanged.

## Scope

- **In:**
  - **One output module** (`src/cli/output.ts`). Its writers send each write through the stream and
    track when the write completes. `exitWhenFlushed(code)` waits until every write on both channels
    has completed, then exits with `code`.
  - **The console routed through it.** The CLI entry point rebinds `console.log`, `info`, `error`,
    and `warn` before anything can print. The rest of the CLI, and anything it calls, is pipe-safe
    without each call site having to remember.
  - **Every exit through the flushed door.** This covers each `process.exit` in the CLI (refusals,
    unhealthy doctor, failed refresh or rebase, a launched run's nonzero verdict, bare `ward`) and
    the argument parser's own exits for help, usage errors, and completion, through its `onExit`,
    `stdout`, and `stderr` hooks. It also covers the direct stream writes: the shell layer, shell
    diffs, the close prompt, and the refresh progress display.
- **Deferred:**
  - **A lint rule against `process.exit` and raw stream writes in `src/`.** Safe to defer because
    the console rebinding covers the common writer by construction. The remaining exit sites are
    few, all in the CLI layer, and a regression on any one shows up as a truncated document in the
    pipe test's shape.
  - **Child processes that inherit stdout.** A launched agent shares the descriptor and writes
    through its own runtime. Ward cannot flush on its behalf, and its output is the harness's
    concern.
- **Acceptance:**
  1. `bun test test/cli/pipe-output.test.ts` passes. A real verb (`ward schema`, past 64 KiB) and a
     console write followed by `exitWhenFlushed(3)` each go through a pipe whose reader sleeps
     before reading. Each arrives whole, parses as JSON, and exits with the writer's code. Both rows
     read 65536 bytes before this entry.
  2. From a workspace whose task list is past 64 KiB, `ward task list --all --json | wc -c` equals
     the size of the same command redirected to a file.
  3. `env -u WARD_AGENT mise run check` is clean.

## Design

- **Decisions:**
  - **Rebind the console rather than rewrite every call site.** _Alternative:_ replace each of the
    CLI's ~130 `console.log` calls with an explicit `writeOut`. _Attractive_ because every write
    would be visibly routed, with no global mutation. _Lost_ because the guarantee would then depend
    on every future call site, and on every module the CLI calls, choosing the right writer. A
    single plain `console.log` added later would bring the truncation back for that verb alone, and
    silently. Rebinding at the entry point makes the safe writer the default one. _Cost:_ a global
    rebinding the reader must know about, documented at its one installation site. Output is
    formatted with Node's `util.format`, not Bun's console formatter, which is identical for the
    strings the CLI prints.
  - **Track each write's completion rather than ask the stream how much is queued.** _Alternative:_
    wait on `writableLength` and the `drain` event, or write an empty chunk with a callback.
    _Attractive_ because both are the stream's own API. _Lost_ because under Bun, on a pipe,
    `writableLength` reads 0 while a write is still pending, and an empty write's callback fires
    before earlier writes complete. Neither is a signal the exit can trust. The callback of the last
    real write is, because writes complete in order. _Cost:_ a small module-level promise per
    channel.
  - **Wait, then exit, rather than set `process.exitCode` and fall through.** _Alternative:_ turn
    each `process.exit(n)` into `process.exitCode = n; return`. _Attractive_ because a natural exit
    already drains the streams. _Lost_ because several exits sit inside verbs as early returns, and
    the parser's `onExit` must not return into its own control flow. An awaited exit stops the
    caller exactly where `process.exit` did. _Cost:_ none beyond the `await` at each site.
    `exitWhenFlushed` records `exitCode` before it waits, so the code survives even if a natural
    exit wins the race.
- **Layout:** `src/cli/output.ts` owns the process's two output channels and its one way out. It
  sits in the CLI layer because only the entry point decides how the process ends. Library modules
  under `src/workspace/` and `src/store/` keep calling `console.error` and are covered by the
  rebinding.
- **Mechanisms:** each channel keeps the promise of its latest write. A write replaces the promise
  with one that resolves in that write's callback, on success or on error, so a reader that has gone
  away (EPIPE) never holds the exit. `flushed()` waits on both channels' promises. The fixture in
  the test reads `process.stdout.isTTY` before it writes, which reproduces the non-blocking
  descriptor the argument parser causes on every real run.
