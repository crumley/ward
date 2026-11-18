# 0071 — CI as three tiers, against a pinned tmux

> The gate runs as three parallel jobs per platform — static, fast tests, live tmux — each one mise
> task, against one tmux built from source on both runners; a nightly runs the live tier against
> each runner's own tmux. The test-tier doctrine the suite is built to is written down.
>
> **Status:** built — awaiting review · **Started:** 2026-11-18

The gate was one job per platform running `mise run check`: lint and typecheck beside a test task
that ran a parallel pool of every file but one, then the real-tmux file
([0031](../0031-detached-session-hosting/README.md)) alone. Its wall time was the sum of everything
in it, and tests were 95% of that — on the last green main before this entry, 194 s of a 204 s
Ubuntu job and 364 s of a 400 s macOS job. A failure in it read as "check failed" whichever part
failed. Every job that failed in the 61 runs before this entry whose logs were kept (8 of them)
failed in the live tmux file, and the causes that were diagnosed lay outside Ward — a tmux server
segfault, a runner's pseudo-terminal limit — while the tmux under test was whatever the runner image
held that week: Ubuntu's went from 3.4 to 3.6 between 15 and 16 November, macOS took Homebrew's 3.8.
A gate that can turn red because an image moved proves something other than the change in front of
it. And the suite had grown without a stated rule for what a test should cost: one run spawned the
CLI 1,376 times and git about 18,000 times, most of them to build fresh workspaces.

This entry splits the gate along the lines its failures already fall on, pins the tmux the live tier
proves, moves the drift that pinning hides to a nightly that blocks nothing, and writes the doctrine
— what a unit, a CLI and a live test are for, and what each may cost — into
[`CONTRIBUTING.md`](../../CONTRIBUTING.md#tests-three-kinds-three-tiers), where the suite's other
build rules live. Three entries building in parallel with it reshape the suite to that text: 0072
(how a test obtains a workspace), 0073 (a scripted runner under the tmux adapter, so Ward-logic
cases leave the live tier), 0074 (running the CLI in-process).

## Serves intent

- [`session-multiplexer`](../../intent/02-subsystems/01-session-multiplexer.md) — the live tier is
  where the tmux realization of the seam is proven against a real tmux; pinning it makes that proof
  about Ward, and the nightly keeps it honest about the tmux users run.
- [`principles`](../../intent/00-foundation/01-principles.md) — §6, the gate gives the same answer
  for the same code on any day, because nothing it runs against moves unless a commit moves it; §20,
  a red gate names its tier, a live failure leaves its evidence, and drift from the pin is reported
  as drift rather than as a broken PR.

## Scope

- **In:**
  - **Three tiers, three tasks, three jobs.** `mise run static` (lint, typecheck, links, actions),
    `mise run test:fast` (every test file but the live ones, in parallel isolated workers) and
    `mise run test:live` (the live files, serially), each a CI job on Ubuntu and macOS, all six in
    parallel. `mise run check` is `static` plus `test`, and `test` is the two test tiers in turn:
    still the one local gate, still everything CI runs.
  - **The live tier is a file-name rule.** A file ending in `-live.test.ts` is live; the fast tier
    ignores that glob and the live tier selects it. `test/host/tmux-nudge-live.test.ts`
    ([0067](../0067-floor-dispatch/README.md)), which already carried the name but ran in the
    parallel pool, moves to the live tier with no rename.
  - **One pinned tmux.** tmux 3.8, the current release, built from its release tarball with libevent
    2.1.13 and utf8proc 2.12.0 linked in statically, by the same recipe on both platforms
    (`mise run tmux:pinned`); CI caches the result. The live tier's preload checks the tmux on PATH
    against the pin before any case runs: in CI a mismatch fails the tier; locally it warns.
  - **Evidence on a live failure.** Every pseudo-terminal client's output and a JUnit report, plus
    the kernel log (Linux) or tmux crash reports (macOS), uploaded as an artifact when the live job
    fails.
  - **A nightly** against each runner's native tmux, non-gating, which keeps one issue open while it
    is red.
  - **The doctrine** in [`CONTRIBUTING.md`](../../CONTRIBUTING.md#tests-three-kinds-three-tiers),
    and the map of the tiers in [`test/README.md`](../../test/README.md).
- **Deferred:**
  - **A tmux server log in the evidence.** tmux logs only when the server starts with `-v` (or is
    sent `SIGUSR2`), and Ward starts the servers; a verbose server writes on every event, which
    changes the timing of the very races the live flakes were, and turning it on from outside means
    a wrapper standing between Ward and tmux. Safe to defer because the pty output carries tmux's
    own bracketed exit line, which names the failing path (the 0067-era segfault was diagnosed from
    it), and the kernel log or crash report carries a server crash.
  - **Shrinking the fast tier.** Its cost is CLI spawns and fresh workspaces, which 0072 and 0074
    take on; this entry only states the rule they build to. Nothing is lost waiting: the fast job is
    the longest job now, and those entries shorten it.
  - **Moving Ward-logic cases out of the live tier.** About a third of the live cases use no pty
    client and test Ward's own decisions; they move with 0073's scripted runner, under the
    doctrine's rule that a moved case says what now proves the part it no longer does.
- **Acceptance:**
  1. `mise run check` → exit 0 locally, and runs lint, typecheck, links, actions, the fast tier and
     the live tier.
  2. On the PR, the workflow shows `static`, `fast tests` and `live tmux` for each of
     `ubuntu-latest` and `macos-latest`, started together, all green, and the two `check (…)` legs
     green after them.
  3. The live job's log reads `live tier: tmux 3.8 at …/.cache/ward/tmux/3.8/bin/tmux` for both test
     files on both platforms, and `Ran 46 tests across 2 files`; the fast job's reads 98 files.
  4. `CI=true mise run test:live` with a tmux other than 3.8 first on PATH and no pinned build fails
     before any case, naming the tmux it found and the two ways forward; without `CI=true` it warns
     and runs.
  5. `WARD_LIVE_EVIDENCE=DIR mise run test:live` leaves one log per pty client and `junit.xml` in
     DIR.
  6. `nightly native tmux`, dispatched by hand, runs the live tier on both platforms against the
     runner's tmux, and its report job passes.

## Design

- **Decisions:**

  - **Split by tier, not by shard.** Sharding the one test task across N identical jobs is
    attractive because Bun balances shards by recorded timings and the speed-up scales with N. It
    loses because it splits the work along no line that means anything: a red shard says nothing
    about what kind of thing broke, the live files need to run alone and would need a shard of their
    own anyway, and the timings file is one more thing to keep fresh. Tiers split along the line the
    failures fall on — every recorded flake was live-tier — and each tier is a task a human can run
    alone. The cost: wall time is bounded by the longest tier rather than divided by N, and today
    that is the fast tier, so the gain is the live tier's time and the static work, not more.
  - **A file-name rule, not a directory.** A `test/live/` directory states the tier as plainly and
    lets the tasks name a path instead of a glob. It loses because the two live files sit beside the
    unit tests of the same adapter (`test/host/`), which is where a reader of the tmux adapter looks
    for them, and moving them would collide with 0073, which is rewriting those files now. The
    `-live` suffix was already the convention both files followed; making it the rule cost no
    rename. The cost: the rule is a glob in two places in one file (`mise.toml`), next to each
    other, rather than a directory nobody can miss.
  - **Build tmux from source, everywhere.** Installing from each platform's package manager is
    attractive for costing nothing to write. It loses because the packages are different versions on
    the two runners and move under the gate, which is the drift being removed; a third-party static
    binary would pin a version but trust a build nobody here can reproduce. A source build from the
    release tarball, checked by sha256, is the same program on both platforms and can be rebuilt
    anywhere with `cc` and `make`. Two build options are chosen to keep it the same program:
    utf8proc on (tmux recommends it wherever the C library's character widths are poor, and with it
    both builds read widths from one table), and jemalloc off (tmux 3.8 asks for jemalloc on macOS
    only). The cost: a cache miss takes 34 s on Ubuntu and 75 s on macOS, paid once per change to
    `mise.toml` per branch, and the pin is one more hand bump nothing automates.
  - **The cache key is `mise.toml`'s hash.** A key of just the version strings would rebuild less
    often; it loses because a change to the recipe would then be served a stale build. `mise.toml`
    changes rarely, and a rebuild is under a minute and a half.
  - **The pin is checked in a preload, not in each suite.** A check at the top of each live file is
    attractive for being visible where the suite is read. It loses because a new live file would
    have to remember it, and the tier's own entry point is where "which tmux is this tier proving"
    is answered once. The same preload keeps the evidence, by wrapping `Bun.spawn` for spawns that
    ask for a terminal, so no suite has to log for itself. The cost: a plain
    `bun test test/host/tmux-live.test.ts` checks nothing, which the test map says.
  - **Strict in CI, a warning locally.** Failing locally too would make every contributor build tmux
    before running the gate; warning in CI would let a runner without the pin pass a suite that
    proved nothing. `WARD_TMUX_PIN=native` is the explicit opt-out, and the nightly is its user.
  - **The required-check names are kept by a gate job.** The repository requires
    `check (ubuntu-latest)` and `check (macos-latest)`, the old job's names. A matrix job of that
    name `needs` the three tiers and passes only when all six legs passed. `needs` waits on a whole
    matrix, so each leg reflects both platforms, not its own; the tier jobs are where a failure is
    read. Requiring the six tier jobs directly and dropping the gate is the cleaner end state; it is
    a repository-settings change, not a workflow one.
  - **A red nightly opens an issue.** GitHub's own notice for a failed scheduled run goes only to
    whoever last edited the cron line — an accident of history, not a recipient anyone chose. An
    issue, opened on the first red night, commented on each later one and closed by the next green
    one, is a standing record the repository's watchers are told of, and it says how to reproduce.

- **Layout:** the tiers are mise tasks in `mise.toml`, and the workflows only run tasks, so the
  commands a reader of a red job reruns are the commands the job ran. The pin and its recipe live in
  `mise.toml` too (`[vars]` and `tmux:pinned`), beside the tool pins they extend. The live tier's
  preload is `test/live-tier.ts`, owned by the tier rather than by any suite.

- **Mechanisms:**
  - _Selecting the tiers._ `test:fast` is
    `bun test --parallel --path-ignore-patterns='**/*-live.test.ts'`; `test:live` is
    `bun test --isolate --preload ./test/live-tier.ts -- -live.test.ts` (a name filter, so it
    matches the same files). `--isolate` gives each live file a fresh global, as the parallel pool
    gives each fast file; the preload runs again for each.
  - _Finding the pin._ `tmux:pinned` installs to `~/.cache/ward/tmux/<version>/` (or under
    `WARD_TMUX_CACHE`), and is a no-op when the binary there reports the pinned version. `test:live`
    prepends that `bin/` to PATH when it exists, unless `WARD_TMUX_PIN=native`, so Ward and the
    suites' own tmux calls both resolve the pinned binary with no further wiring. The task sets
    `WARD_TMUX_PIN` from `[vars]` unless the caller set it.
  - _Measured._ Wall time per job, from the job's start to its end, on GitHub-hosted runners.
    Before: the last two green runs of main before this entry (44321921646, 44317029349). After:
    this entry's first run, a cache miss that built tmux (44410052208), and its second, with the
    cache warm (44411021325).

    | Job                        | Ubuntu before | Ubuntu after (warm, miss) | macOS before | macOS after (warm, miss) |
    | -------------------------- | ------------- | ------------------------- | ------------ | ------------------------ |
    | one `check` job            | 204 s, 168 s  | —                         | 400 s, 418 s | —                        |
    | static                     | —             | 14 s, 13 s                | —            | 17 s, 26 s               |
    | fast tests                 | —             | 140 s, 144 s              | —            | 180 s, 256 s             |
    | live tmux                  | —             | 83 s, 116 s               | —            | 94 s, 213 s              |
    | the whole run, push to end | 405 s         | 215 s, 264 s              | (same run)   | (same run)               |

    The tmux build on a miss took 34 s on Ubuntu and 75 s on macOS. The fast tier's tests alone ran
    130 s and 237 s on the miss run — the old pool's time less one file — and the live tier's 69 s
    and 112 s, the old live batch plus the nudge file. The longest job is now the macOS fast tier,
    which is where 0072 and 0074 cut.
