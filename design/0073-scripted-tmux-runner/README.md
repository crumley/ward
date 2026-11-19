# 0073 — A scripted tmux, kept honest by conformance

> The tmux host takes the runner it speaks through as an argument, so its own logic runs against a
> recorded tmux in milliseconds; each recording is re-proved against a real tmux, so none goes stale
> unnoticed.
>
> **Status:** built — awaiting review · **Started:** 2026-11-18

`tmuxHost()` in `src/host/tmux.ts` is where Ward turns tmux's answers into the seam's
([0031](../0031-detached-session-hosting/README.md)): what counts as no server, a window that is
gone, a host that is someone else's, a line that read back wrong. Until now it built the call to
tmux from the environment alone, so the only way to exercise any of it was a real tmux server — and
the only tests that did were the real-tmux suites, which drive the spawned CLI over a fresh
workspace and, in half their cases, a pseudo-terminal client. Those suites are the slowest file in
the gate and the source of every flake it has had: tmux faults and runner limits under attached
clients ([0031](../0031-detached-session-hosting/README.md) phase 3 and its follow-ups), never
Ward's logic. Meanwhile most of `tmuxHost()`'s branches — every error path, every answer tmux gives
only on a bad day — were reached by no test at all.

This entry makes the runner injectable, adds a scripted runner that plays back recordings of real
tmux, and pairs every recording with a live re-run that fails when the recording no longer matches.
With that in place the real-tmux suites keep only what needs a real tmux with real clients, and the
host's own logic is tested where it is cheap.

## Serves intent

- [`session-multiplexer`](../../intent/02-subsystems/01-session-multiplexer.md) — the constraints
  the tmux adapter honours (a found window belongs to the record, a host that cannot answer is never
  read as absence, teardown only ends what is the session's own) are now asserted over every answer
  the adapter can be given, not only the ones a healthy server happens to give.
- [`principles`](../../intent/00-foundation/01-principles.md) — §20, degrade honestly: a timeout, a
  program that cannot start, and an error with no words are each shown to read as could-not-
  determine, and the cases that prove it run on every save; §6, determinism: the tests of Ward's own
  host logic no longer depend on a server's timing.

## Scope

- **In:**
  - **The seam.** `tmuxHost(env, runner?)` takes a `TmuxRunner` — run one command line and read its
    answer, start the client that joins a view, pause between screen reads. Production passes none
    and gets `spawnRunner`, the real program on the configured server, exactly as before.
    `src/host/tmux.ts` stays the only file that speaks tmux; `SessionHost` is unchanged.
  - **Scenarios and transcripts.** Ten scenarios drive the host's own methods (no CLI, no workspace,
    no terminal) and assert what Ward makes of tmux's answers. Each has a committed transcript of
    what it sent a real tmux and what tmux answered.
  - **Two tiers over the same scenarios.** The fast tier plays each scenario back from its
    transcript; the live conformance tier runs it on a real tmux and requires the recording to equal
    the transcript.
  - **Fault cases** for the branches no real tmux takes on cue, built under one rule (Mechanisms).
  - **The live suites, re-sorted.** Fourteen live cases that proved Ward's logic leave the live
    files; each is listed below with what proves it now. Where that was missing, a Ward-level case
    against the fake host was added, through an optional `host` argument on `chooseHost`,
    `closeTask`, and `locateSession` (the pattern `guardResume` and `teardownSession` already
    follow).
- **Deferred:**
  - **A scripted runner for CLI-level tests.** A spawned or in-process `ward` could be pointed at a
    transcript by an environment variable. Safe to defer because the cases that need a tmux that
    misbehaves at the CLI level already have one — `WARD_TMUX_BIN` names any program, and a script
    there serves (`test/cli/host-unavailable.test.ts`) — and what a CLI case adds over the host's
    own scenarios is rendering, which a transcript keyed to one run's session ids and timestamps
    would pin far less honestly than the fake host does at the Ward level. Two live cases stay live
    only for their CLI wording (the table names them); they are the measure of whether an in-process
    CLI that accepts a host is worth adding later.
  - **Fixing what the recordings revealed.** Two behaviours are pinned as they stand and named under
    Design; changing them is behaviour, not test structure.
- **Acceptance:**
  1. `mise run check` → exit 0, on macOS and Linux.
  2. `bun test test/host/tmux-conformance-live.test.ts` on a real tmux: ten scenarios pass and every
     recording equals its committed transcript.
  3. `bun test test/host/tmux-scripted.test.ts`: every scenario passes from its transcript, every
     transcript has a scenario, and the fault cases pass — with no tmux on the machine.
  4. A host that sends a call its transcript does not hold fails naming the step and the
     re-recording command; one that stops short fails naming what it left (both in the fast tier).
  5. In-process line coverage of `tmuxHost()`: 365 of its 366 executable lines (13% before).

## Design

- **Decisions:**

  - **The seam is the runner, below every decision.** A fake `SessionHost` already exists
    (`test/agent/fake-host.ts`) and serves the Ward side; it says nothing about `tmuxHost()`, which
    is the code under test here. Injecting at the level of whole operations ("list the panes") was
    attractive for readable scripts, and lost because each such operation is a decision about argv
    and parsing that would then go untested. The runner takes an argv after the program and its
    server and returns the exit status, both streams, and whether it timed out — so the timeout
    message, the no-server patterns, and the catch around a program that cannot start all stay in
    `tmuxHost()` and are exercised. The client spawn and the pause between reads ride on the same
    object because they are the other two things `tmuxHost()` does that are not pure. The cost: a
    third argument is threaded nowhere in production — `hostFor` passes the environment as before.
  - **Transcripts are recorded, never written by hand, and re-proved live.** Hand-written replies
    were the cheap alternative, and they are exactly how a test suite comes to pin a tmux that
    exists nowhere. A recording can go stale in two ways, and each fails somewhere: Ward sends a
    different argv (the fast tier fails at that step, and the live tier's fresh recording differs);
    tmux answers differently (the live tier fails at that step, showing both answers). The remedy is
    one command (`WARD_RECORD_TMUX=1`, after `WARD_PIN_SHAPES=1` in
    [0066](../0066-workspace-format-guard/README.md)) and the review is the transcript diff. The
    cost: a change to an argv builder means re-recording on a machine with tmux, and the transcripts
    are some 130 KB of JSON in the tree.
  - **Normalized so a recording reads the same anywhere.** The scratch directory and the socket by
    placeholder; tmux's own ids renumbered in the order tmux first answers with them (an id a
    scenario makes up, such as `@999`, is kept); every session creation time as `1`; the `-V` line
    by placeholder, with the tmux it was taken on kept beside the steps for a reader; a screen read
    answered the same as the read before it folded into one. The server starts with no configuration
    file from four fixed variables (`PATH`, `HOME` in the scratch directory, `SHELL`, `LANG`) and
    the scratch directory as its working directory, so nothing of the machine's reaches a recording.
    Creation times are the one loss: tmux counts them in whole seconds, so two hosts a moment apart
    read equal or a second apart by chance, and ranking them made the recordings flap. The one thing
    Ward reads from them — which of two hosts for a floor is older — is shown by a fault case
    instead.
  - **Fault cases may invent answers, never calls.** The branches a healthy tmux never takes on cue
    (a timeout, a program that cannot start, an error with no words, a screen that stops showing an
    input line mid-type, a name taken five times running) need scripted answers. Each fault case
    scripts its calls with the table-pinned argv builders, and the harness refuses any call whose
    form — each command, its flags, its formats — no committed transcript holds: every call a fault
    case scripts has been sent to a real tmux by some scenario, and only its answer is made up.

- **Layout:** the runner is a type and one function in `src/host/tmux.ts`, beside the host it
  serves. The test side is `test/host/scripted-tmux.ts` (playback, recording, normalizing),
  `test/host/tmux-scenarios.ts` (the scenarios, shared by both tiers), the transcripts in
  `test/host/transcripts/`, and the two tiers as their own files: `tmux-scripted.test.ts` (fast, no
  tmux) and `tmux-conformance-live.test.ts` (a private server per scenario, no terminal, ~6s). Which
  batch of the gate a file runs in is the test tiers' own rule; the conformance file is named like
  the other live files and needs no terminal.

- **Mechanisms:**

  - _Playback._ Each host call must equal the next step's argv; a step the scenario itself made (a
    human's act, a read it asserts on) is a step of its own kind, so the scenario's view of tmux is
    replayed too. A screen read the host repeats while it waits is answered again, the twin of the
    normalizer's fold. Waits (`stage.waitFor`) and unrecorded reads run only on a real tmux. A
    client the host starts exits a moment after it is asked for, so a signal can arrive while the
    host waits on it.
  - _Recording._ A client the host starts is never given the test's own terminal: tmux refuses it
    (`open terminal failed: not a terminal`), and that refusal — and Ward ending the view after it —
    is what the transcript records of entering a view. A race is made deterministic on a real tmux
    by holding the host's next matching call until a condition holds (`stage.holdBefore`).
  - _What the recordings showed._ Two answers of tmux 3.7c that the code did not expect:
    - `display-message -t @N` for a window tmux no longer holds exits 0 with an empty line (its
      target may fail), so `close` of a window already gone reads `refused` ("carries no session
      tag") rather than `absent`, and `typeLine` reads `withheld` rather than `absent`. The
      `can't find window` test on that read is reachable only on a tmux that refuses. Close is
      called on a window `find` just returned, so this shows only in that race.
    - An attach view asked for a window that is not there leaves its tmux session behind:
      `new-session` succeeds before `select-window` fails, and unlike an observe view's failure the
      attach path does not end it. Doctor reports it as a leftover view.
    - A new window takes the first free index, so the window placed after a host's placeholder is
      cleared stands left of the first run's. Nothing depends on window order but what a human reads
      in the status line.
  - _The live cases, sorted._ Read one by one, the 46 live cases split as below. A case stays when
    what it proves needs a real tmux with real clients: a pseudo-terminal client, a host ending
    under the humans in it, two processes racing over one server, a server that dies, or what a
    server inherits from the client that starts it. A case moves when what it proves is Ward's logic
    over tmux's answers; the second column says what proves each part now.

    | Case (live suite)                                        | Now                                                                                                                                                                                |
    | -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
    | a detached open: the record first, stamps, tags          | **stays** — the end-to-end smoke: record on disk before the real run starts                                                                                                        |
    | WARD_AGENT on the agent pane only                        | **stays** — tmux's environment inheritance                                                                                                                                         |
    | the coordinator floats; close never ends a host          | **stays** — tmux ending an emptied host by its own rule                                                                                                                            |
    | an exited run is legible; resume clears it               | moved — scenario `how-runs-end` (kept with its status); `guardResume` cases in `test/agent/host.test.ts`; clearing on a real tmux stays in "resume over a dead window"             |
    | a task's close sweeps its hosted session                 | moved — new Ward case in `test/agent/host.test.ts` (`closeTask` with a host); scenario `close-a-window`                                                                            |
    | two detached opens racing make one host                  | **stays** — two processes over one server                                                                                                                                          |
    | a moved workspace finds its host; a stranger is refused  | moved — scenario `found-by-stamp` (renamed host found by stamp, same-named stranger refused untouched, another workspace's host ignored)                                           |
    | --detach with no usable tmux; a configured tmux degrades | moved — `test/cli/host-unavailable.test.ts` (no tmux needed) and new `chooseHost` cases in `test/agent/host.test.ts`                                                               |
    | attach joins through a view of its own                   | **stays** — pty client                                                                                                                                                             |
    | attach re-creates a run that ended                       | **stays** — pty client                                                                                                                                                             |
    | attach puts back the coordinator's link                  | **stays** — pty client                                                                                                                                                             |
    | observe: one window, read-only, never resizing           | **stays** — pty clients and tmux's sizing                                                                                                                                          |
    | resume over a dead window keeps the humans in it         | **stays** — pty clients in the host                                                                                                                                                |
    | two resumes racing make one window                       | **stays** — two processes over one server                                                                                                                                          |
    | a host killed by hand only unlinks the coordinator       | **stays** — tmux's unlink on kill-session (also scenario `floating-windows`)                                                                                                       |
    | attach from inside tmux switches the client              | **stays** — pty client inside a pane                                                                                                                                               |
    | a host ends under its participants and observer          | **stays** — pty clients moved by tmux                                                                                                                                              |
    | an observer returns: closed, gone, restarted             | **stays** — pty clients                                                                                                                                                            |
    | a clean exit closes its window                           | **stays** — pty observer refusal                                                                                                                                                   |
    | a failed or killed run keeps its window                  | **stays** — signals, named per platform                                                                                                                                            |
    | a clean exit at once (the link race)                     | **stays** — for the open's wording, a CLI rendering nothing else reaches; the host's half is the fault case "a run already over when it is linked"                                 |
    | the coordinator's clean exit leaves every host           | **stays** — pty client                                                                                                                                                             |
    | a clean exit of a host's last window                     | **stays** — pty clients                                                                                                                                                            |
    | a clean exit under a switched client                     | **stays** — pty client inside a pane                                                                                                                                               |
    | a window an older Ward made is told the rule             | moved — scenario `how-runs-end` (rule set on a running window, a dead one left, then each run's end read); "a refresh says which windows still run" in `test/agent/naming.test.ts` |
    | names and titles through a view                          | **stays** — titles read off a pty                                                                                                                                                  |
    | an older naming renamed in place                         | **stays** — pty client                                                                                                                                                             |
    | views renamed and titled with their host                 | **stays** — pty clients kept on their views (host half also in scenario `rename-in-place`)                                                                                         |
    | a view ends once its client has left                     | **stays** — the SIGSTOPped client and the server fault                                                                                                                             |
    | a terminal that closes on a view                         | **stays** — a hung-up pty                                                                                                                                                          |
    | attach and observe refuse with no terminal               | moved — the attach row and a new observe case in `test/agent/attach.test.ts`                                                                                                       |
    | locate --json carries the host block                     | moved — new Ward case in `test/agent/host.test.ts` (`locateSession` with a host, through `sessionLocateJson`)                                                                      |
    | doctor names strays, duplicates, leftovers, gone         | moved — the rows of `test/agent/host-findings.test.ts`; scenarios `views` and `how-runs-end` for the inventory; the remedies in `test/host/tmux.test.ts`                           |
    | a floor host wears its floor                             | moved — scenarios `place-a-host` and `floating-windows` (session options set, the server's untouched)                                                                              |
    | a re-dressed host and view                               | **stays** — what a pty is drawn                                                                                                                                                    |
    | a host from before identities picks one up               | **stays** — pty client (second half)                                                                                                                                               |
    | an observe view wears the floor                          | **stays** — pty client                                                                                                                                                             |
    | a tmux that errors is could-not-determine in doctor      | moved — `test/cli/host-unavailable.test.ts` as it was (it never used a server), and fault cases on `inventory`                                                                     |
    | a server with no session is an empty answer              | moved — scenario `a-server-with-no-session`; gone and resume rows at the Ward level                                                                                                |
    | a Claude-run ward's server does not leak its identity    | **stays** — what a server inherits from the client that starts it                                                                                                                  |
    | resume --all after the server dies                       | **stays** — a server that dies                                                                                                                                                     |
    | resume --all: a floor that cannot be placed              | **stays** — for its CLI wording ("Not everything came back"), which nothing else reaches; the refusal itself is scenario `found-by-stamp`                                          |
    | nudge: typed to the target only                          | **stays** — the end-to-end smoke of a hand-off                                                                                                                                     |
    | nudge: a question is never typed into                    | moved — scenario `typing-a-line`; `test/agent/nudge.test.ts` for how a withheld answer is reported                                                                                 |
    | nudge: words on the line are put back                    | moved — scenario `typing-a-line` (real echo and erase); `test/agent/nudge.test.ts`                                                                                                 |
    | nudge: scrolling, ended, no session                      | moved — scenario `typing-a-line` (copy mode, an ended run); `test/agent/nudge.test.ts` (not-running, an empty floor)                                                               |

    Thirty-two stay (31 in `tmux-live.test.ts`, 1 in `tmux-nudge-live.test.ts`); fourteen move. The
    conformance tier adds ten live scenarios with no terminal.

  - _Measured._ On GitHub's runners, one job per platform, the live files of the main line and then
    of this entry run back to back on the same machine (`bun test --timeout=30000`, JUnit times):

    | Runner (tmux)       | Before: live cases, time                  | After: live cases, time                                           |
    | ------------------- | ----------------------------------------- | ----------------------------------------------------------------- |
    | ubuntu-latest (3.6) | 46 — 42 in 58.7s, 4 nudge in 7.3s; 66.0s  | 32 — 31 in 47.6s, 1 nudge in 1.6s; +10 conformance in 3.0s; 52.3s |
    | macos-latest (3.8)  | 46 — 42 in 84.4s, 4 nudge in 10.4s; 94.8s | 32 — 31 in 66.2s, 1 nudge in 2.2s; +10 conformance in 5.1s; 73.5s |

    The pty-client cases, where every flake has been, all stay: the saving is the cases that never
    needed a real tmux, about a fifth of the live tier's time. The fast tier runs its 69 cases in
    under 0.1s with no tmux installed. The transcripts were recorded on tmux 3.7c and matched a real
    3.6 and 3.8 unchanged, six runs out of six on each runner; locally, eight of eight.
