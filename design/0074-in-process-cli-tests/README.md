# 0074 — Tests call the CLI in-process; a smoke suite spawns it

> The CLI's entry becomes a function that answers one invocation, so a test can run `ward` inside
> its own process. Tests of the CLI's behaviour call it that way. A small suite still spawns the
> real binary, and a parity suite holds the two modes to the same bytes.
>
> **Status:** built — awaiting review · **Started:** 2026-11-18

The fast batch of the gate ran the `ward` binary 1,376 times per run, from 56 test files. Each run
started a Bun runtime and loaded the whole CLI, about 0.1 CPU-seconds before any verb began, so
starting `ward` cost several times more than most of the verbs these tests exercise. The cost could
not be avoided, because the CLI ran at its module's top level: parsing, dispatch and exit were side
effects of loading `src/cli/index.ts`. A test could only reach a verb's rendering, exit code or
refusal by starting a process. So the suite paid a process start per assertion, and it grew with
every verb.

This entry turns that top level into `main(invocation)`, and the bin entry becomes a two-line
wrapper around it. An in-process runner calls `main` with a captured invocation. Most CLI test files
now call `ward` that way. A named smoke suite still runs every verb group through the real binary,
and the tests whose subject is the process boundary still spawn. A parity suite runs one script both
ways and requires identical output. The suite stays a mix of fast unit-level tests and a smaller
tier that does the full thing for real; how the tiers divide the gate's time belongs to the tiering
entry, 0071.

## Serves intent

- [`principles`](../../intent/00-foundation/01-principles.md) — §6: one invocation gives one answer.
  The parity suite holds that answer the same whether the CLI runs in a fresh process or inside the
  test's process, so a test in either mode is evidence about the one CLI.
- [`principles`](../../intent/00-foundation/01-principles.md) — §8: both audiences' outputs are held
  byte for byte: the human's rendering with and without color, and the agent's documents. This
  includes the environment cues (NO_COLOR, FORCE_COLOR, CI, WARD_AGENT, a terminal) that decide
  between them.
- [`human-shell`](../../intent/02-subsystems/07-human-shell.md) — the CLI contract is what the CLI
  test files hold. Making each assertion cheap lets that coverage keep growing with the verb set
  without making the gate slower each time.

## Scope

- **In:**
  - **The entry as a callable.** `main(invocation)` in `src/cli/index.ts` answers one invocation.
    The bin entry, `if (import.meta.main) await main(processInvocation())`, sits at the foot of the
    file. Imported, the module does nothing.
  - **The invocation** (`src/cli/invocation.ts`). It carries arguments, whether stdin and stdout are
    terminals, stdout's height, stdin's text, the two output channels, the exit, and the exit-time
    hooks. It also holds the two color rules (picocolors' and the argument parser's), each read from
    the invocation.
  - **The in-process runner** (`src/cli/in-process.ts`).
    `runCli({argv, cwd, env, stdin?,
    stdoutIsTTY?})` returns `{exitCode, stdout, stderr}`. It
    installs the run's environment and working directory for the run's duration, and every run waits
    its turn on one queue.
  - **Every process global the CLI reads**, each threaded, installed, or left to a test that stays
    spawned (the table under _Mechanisms_).
  - **The test helper's in-process mode.** `callWard` and `callWardEnv` in `test/helpers.ts` build
    the same environment as `runWard` and `runWardEnv` and return the same shape. Those two still
    spawn, and gain a `stdin` option.
  - **Three suites.** `test/cli/parity.test.ts` holds both modes to the same bytes.
    `test/cli/in-process.test.ts` holds that concurrent runs stay apart.
    `test/cli/spawn-smoke.test.ts` runs every verb group through the real binary, with a piped stdin
    and a check that importing the entry does nothing.
  - **The migration.** 46 existing test files now call the CLI in-process; five of them keep single
    cases spawned on purpose. What still spawns, and why, is under _Mechanisms_.
- **Deferred:**
  - **Threading the environment and working directory through every module.** Safe to defer because
    installing them for the run gives the CLI exactly what a fresh process would see, and the queue
    makes that safe (decision 1). Threading them would touch about forty default parameters and
    every relative path. It earns its place only if in-process runs must overlap, and nothing needs
    that: a spawned run blocked the test's thread outright.
  - **A terminal on stdin in-process.** No in-process run has a terminal to ask on, so stdin is
    never a TTY there and no question is ever put. The close prompt after a foreground run and
    `session attach`/`observe` need a terminal on both sides. Their tests spawn, or drive a real pty
    in the live tmux suite. Nothing is lost, because those paths were never reachable through
    `runWard`'s pipes either.
  - **The launch family's files** (`test/agent/launch`, `floor-sessions`, `machine-sessions`,
    `pi-launch`, `doctor`). They stay spawned whole. A foreground launch hands the harness Ward's
    own stdio and environment as a child of the `ward` process, and that inheritance is what those
    files assert. Their read-only follow-up calls could move in-process. That is a later tranche,
    and it costs about 107 spawns a run in the meantime.
  - **Removing the duplicates.** `test/cli/version.test.ts` and the smoke suite's version rows
    overlap. Safe to keep, since both are cheap. Folding one into the other is cleanup, not
    coverage.
- **Acceptance:**
  1. `bun test test/cli/parity.test.ts` passes: the 48-step script answers identically, spawned and
     in-process, with only recorded instants masked.
  2. `bun test test/cli/in-process.test.ts` passes. With the queue removed from `runCli`
     (`const turn = runAlone(request)`), four of its six cases fail.
  3. `bun test test/cli/spawn-smoke.test.ts` passes.
  4. The fast batch's CLI process starts drop from 1,462 to 236, with no test removed and every test
     passing (measured as under _Mechanisms_).
  5. `env -u WARD_AGENT mise run check` is clean.

## Design

- **Decisions:**
  - **Install the environment and working directory; thread the rest.** _Alternative:_ thread a
    context through every module. Every `env = process.env` default would become a required
    parameter, every `process.cwd()` a field, and every relative path resolved against it.
    _Attractive_ because nothing global would move, so two runs could overlap. _Lost_ because the
    CLI's surface is wider than its own code. About forty functions default their environment to
    `process.env`. Relative paths (`ward task brief ID FILE`) reach the filesystem as relative
    paths. Every child Ward spawns (git, gh, tmux, a harness, a repository's own command) inherits
    the working directory unless told otherwise. A threaded context has to be complete to be
    correct, and every later feature has to keep it complete. An installed one is complete by
    construction, because it is the same environment and directory a fresh process would have. The
    channels a process does not share between modules (arguments, terminal, stdin, stdout, stderr,
    exit, exit hooks) are threaded, through the invocation. _Cost:_ runs in one process cannot
    overlap, and decision 2 pays for that.
  - **One queue, not AsyncLocalStorage.** _Alternative:_ hold the invocation in an AsyncLocalStorage
    and give the process's globals per-context proxies. _Attractive_ because it would allow
    concurrency within a file. _Lost_ because the environment and working directory are process
    state that no proxy reaches. `Bun.spawn` without `env` uses the environment the process started
    with, `os.homedir()` reads the starting `$HOME`, and `chdir` is process-wide (all measured on
    Bun 1.4.4). So two overlapping runs would leak into each other's children whatever the
    JavaScript side did. The queue makes overlap impossible instead of unlikely. Bun's runner covers
    the rest: `--parallel` gives each worker its own process, and a worker runs one file at a time.
    _Cost:_ in-process runs in one file are serial. That costs nothing, because the spawned runs
    they replace used `spawnSync`, which blocked the whole thread.
  - **An exit throws.** _Alternative:_ have each exit site return a code up the stack. _Attractive_
    because nothing is thrown. _Lost_ because the CLI's exits are early returns deep inside verbs
    and inside the argument parser's own control flow
    ([`0048`](../0048-pipe-safe-output/README.md)), and changing each one is the non-mechanical diff
    this entry avoids. `exitWhenFlushed` already ends in the invocation's `exit`. A real run's
    `exit` is `process.exit`. An in-process run's throws a private `CliExit`, which unwinds the
    run's stack the way `process.exit` ends it. _Cost:_ a `finally` block in the CLI runs on an
    in-process exit and does not run on a real one. Every exit site in the CLI sits outside any lock
    or other `finally` that would notice, and no `catch` in the CLI catches more than `WardError`
    around an exit.
  - **The bin file stays the bin file.** _Alternative:_ move the CLI to a new module and leave
    `index.ts` a three-line shim. _Attractive_ because the entry would read as nothing but a
    wrapper. _Lost_ because `package.json`'s `bin`, every machine's `bun link`, and every in-flight
    branch's edits all point at `index.ts`. Moving 4,200 lines would turn each of those branches'
    rebases into a rename conflict. _Cost:_ the wrapper is the file's last line, not a file of its
    own.
  - **New names for the in-process helper.** _Alternative:_ make `runWard` itself async and
    in-process, and rename the spawning one. _Attractive_ because the default name would carry the
    default mode. _Lost_ because every file that still spawns would then change too, and the other
    tasks rewriting test setup edit those same files. `callWard` (a function call) and `runWard` (a
    run of the program) can both be searched for: `grep -l runWard test` lists what still spawns.
  - **The parity script masks the clock and nothing else.** Two plays of one script differ in
    recorded instants (`openedAt`), whatever the mode. Every ISO-8601 instant reads `<instant>` in
    both before they are compared. Everything else must match to the byte: exit codes, help pages
    with and without color, usage errors, completion, documents of 50 KB, and refusals.

- **Layout:** `src/cli/invocation.ts` owns the CLI's view of its process: the channels it threads,
  plus the color rules, because both read the invocation's terminal. `src/cli/output.ts` keeps the
  one way out ([`0048`](../0048-pipe-safe-output/README.md)) and writes through the invocation.
  `src/cli/in-process.ts` is the runner, in `src/` so it is typechecked with the CLI and available
  to anything that wants to embed `ward`. Only `test/helpers.ts` and the test files import it.

- **Mechanisms:**
  - _Every process global the CLI used, and how it is now handled:_

    | Global                                                  | Where                                                            | Now                                                                                                                                                                               |
    | ------------------------------------------------------- | ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
    | `process.argv`                                          | entry, optique, telemetry, completion words (`suggest.ts`)       | threaded: `invocation.argv`, and optique is passed `args`                                                                                                                         |
    | `process.stdout`/`stderr` writes                        | `output.ts` (all console writes, optique's hooks)                | threaded: `invocation.write`                                                                                                                                                      |
    | `console.log/info/error/warn`                           | rebound by `installPipeSafeConsole` at each run                  | installed; the runner restores the caller's four after the run                                                                                                                    |
    | `process.stdout.isTTY`, `.rows`                         | JSON spacing, progress display, picocolors, optique colors       | threaded: `invocation.stdoutIsTTY`, `stdoutRows`                                                                                                                                  |
    | `process.stdin.isTTY`                                   | close prompt, attach/observe                                     | threaded: `invocation.stdinIsTTY` (always false in-process)                                                                                                                       |
    | `Bun.stdin`                                             | `task brief -`, `task dispatch --brief -`, `reflection record -` | threaded: `invocation.readStdin()`                                                                                                                                                |
    | `process.exit`, `process.exitCode`                      | `exitWhenFlushed`                                                | threaded: `invocation.exit`, `setExitCode`                                                                                                                                        |
    | `process.on('exit')`                                    | telemetry's row                                                  | threaded: `invocation.atExit(hook, ready)`; in-process waits for the scope it resolves                                                                                            |
    | picocolors' load-time color decision                    | `pc` in `index.ts`                                               | decided per run by `colorSupported` (picocolors' own rule, read from the invocation)                                                                                              |
    | optique's color and width detection                     | `run()`                                                          | color passed per run by `parserColors`; width is still optique's, read from `$COLUMNS` (in the installed env) or stdout's columns, which neither a pipe nor an in-process run has |
    | `process.env`                                           | ~40 default parameters, every spawn's `env`                      | installed for the run, restored after                                                                                                                                             |
    | `process.cwd()`, relative paths, children's working dir | resolvers, `Bun.file`, telemetry, every spawn without `cwd`      | installed with `process.chdir`, restored after                                                                                                                                    |
    | `os.homedir()`                                          | config/state dirs, Claude and pi history                         | `homeDir(env)` in `global/paths.ts`: `$HOME` from the env Ward is handed, `os.homedir()` only when unset (the same answer for a real run)                                         |
    | `Bun.which` without `PATH`                              | gh, git, fzf presence                                            | passed the runtime `PATH`, as `worktrees.ts` already did                                                                                                                          |
    | `process.on(SIGHUP/SIGTERM)`                            | tmux attach (`host/tmux.ts`)                                     | left alone: reached only through a terminal, which in-process never has; its tests spawn                                                                                          |
    | `process.once('exit')`, cursor codes                    | progress display                                                 | left alone: only when stdout is a terminal of known height                                                                                                                        |
    | terminal title (`agent/title.ts`)                       | foreground launch                                                | left alone: writes `process.stdout` only when it is a terminal, and launch tests spawn                                                                                            |
    | `process.pid`, `hostname()`                             | store lock holder, temp names                                    | unchanged: the same process holds the lock for every in-process run, and the queue means it is never contended from inside                                                        |
    | module state                                            | `format.ts` verdict cache, `document.ts` write counter           | unchanged: the cache is keyed by the marker's inode, size and mtime; the counter only names temp files                                                                            |
  - _How isolation is guaranteed._ `runCli` chains each run onto one promise. A run installs its
    environment (every key removed, then the run's set), changes directory, runs `main`, runs the
    exit hooks inside the same environment, and puts back the caller's environment, directory and
    console in a `finally`. `in-process.test.ts` fires 16 runs at once across four workspaces, each
    with a different declared caller. Each must report its own floors, and each workspace's
    telemetry rows must carry only its own caller and directory. The other cases cover the palette
    chosen per run in one module, an exit, refusal, crash or missing directory that stays its own,
    the caller's globals put back exactly, and stdin and terminal taken from the request. Run with
    the queue removed, four of its six cases fail.
  - _What stays spawned, and why._ `spawn-smoke.test.ts` and `parity.test.ts` spawn by design.
    `version.test.ts` spawns from the repository root. `json-spacing.test.ts` proves compact output
    through a real pipe. `workspace/concurrency.test.ts` races real processes for the store lock.
    `host/tmux-live` and `tmux-nudge-live` drive tmux and ptys. The launch family is listed under
    _Deferred_. Single cases stay spawned in five migrated files: telemetry's two rows written by a
    real process's `exit` event (a natural exit and a `process.exit`), `session-parent`'s launched
    child, `briefs`' stdin piped into a real process, and the fish-run shorthands in `shell` and
    `shell-adopt`, which run `ward` from a shell.
  - _Measured._ The fast batch exactly as the gate runs it (`bun test --parallel --timeout=30000`,
    the live tmux file left out), on a 12-core macOS machine, run three times alternating with an
    unchanged checkout of the main line, under `/usr/bin/time -p`. Process starts were counted by a
    temporary line in the entry appending to a log (never committed). It counts every start of the
    CLI, including those through `process.execPath` and shell wrappers that a PATH shim on `bun`
    misses: 1,462 before, where such a shim counts 1,376. Medians of three:

    | Fast batch         | Before | After | Change |
    | ------------------ | -----: | ----: | -----: |
    | CLI process starts |  1,462 |   236 |   −84% |
    | in-process calls   |      0 | 1,379 |      — |
    | user CPU (s)       |  290.9 | 150.2 |   −48% |
    | system CPU (s)     |  296.1 | 240.5 |   −19% |
    | total CPU (s)      |  587.0 | 390.7 |   −33% |
    | wall (s)           |   93.5 |  53.9 |   −42% |
    | tests              |  1,491 | 1,517 |    +26 |

    The machine was shared with other test runs (load averages 22–77), so wall time is the noisy
    figure: before ranged 69–130 s, after 51–79 s. CPU varied by under 4% across runs. The system
    CPU that remains is mostly git, which workspace setup spawns, and is the template entry's to
    cut. Of the 236 starts that remain, about 70 are this entry's own smoke and parity suites, 107
    are the launch family, and the rest are the single cases and files listed above.
  - _Rebasing feature work over the refactor._ The dispatch switch and its `try` moved into
    `answer()`, one indent deeper. Nothing else in `index.ts` moved. A branch that adds a `case`, or
    edits one, conflicts only on indentation. `git rebase -Xignore-space-change origin/main` applies
    such a branch cleanly, and `mise run fmt` re-indents the new lines. In a new verb, read
    `invocation().readStdin()` for `-`, `invocation().stdinIsTTY` and `stdoutIsTTY` for a terminal,
    and leave through `exitWhenFlushed`. Never call `Bun.stdin`, `process.stdout.isTTY` or
    `process.exit` directly: in-process, the first two would read the test process's own stdin and
    terminal, and the third would end the test process. A top-level statement added to `index.ts`
    now runs on import as well, so put new per-invocation setup in `answer()`.
