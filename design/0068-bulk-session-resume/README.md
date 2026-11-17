# 0068 — Bulk session resume

> `ward session resume --all` prints, floor by floor, which open hosted sessions would come back on
> this machine and starts nothing; `--go` then resumes them one after another, coordinator first,
> each through the single resume's own path.
>
> **Status:** built — awaiting review · **Started:** 2026-11-16

A reboot ends the tmux server, and with it every floor host and every window. The records survive,
all still `open`, and [0031](../0031-detached-session-hosting/README.md) made each of them
recoverable one at a time: `ward session attach ID` re-creates a window from its record, and
`ward doctor` lists every gone session with that command. With a coordinator and three or four
floors in flight that is a dozen commands typed from a list, in an order the human has to work out,
before the workspace looks the way it did.

0031 foresaw the mass form — "most naturally floor by floor, coordinator first" — and declined to
build it, on the ground that restarting everything spends tokens on threads nobody is ready to look
at. This entry builds it without giving that ground up: the command's default is a **plan** that
only reads, and starting anything takes a second, explicit word. It is the first slice of the
intent's Recovery, and only its third step: enumerate, filter to open, re-attach. Wakes, setup
validation, rounds and the recorded episode are not here.

## Serves intent

- [`intent/01-concepts/02-sessions-and-lifecycle.md`](../../intent/01-concepts/02-sessions-and-lifecycle.md)
  — _Recovery: bringing a workspace back to life_, steps 1 to 3 and 6: sessions are enumerated
  across every scope, filtered to open, and re-attached through their harness handles, and a closed
  session is never touched. The three per-thread outcomes are told apart, and the unresumable one is
  surfaced and never closed — though it is decided by looking, not by a failed attempt
  ([IF-003](intent-feedback.md)), and reported by the command, not on a recorded episode
  ([IF-002](intent-feedback.md)).
- [`intent/01-concepts/02-sessions-and-lifecycle.md`](../../intent/01-concepts/02-sessions-and-lifecycle.md)
  — _Open ≠ running_: the plan filters on `open` and never on a stored "was running", because there
  is none; a session whose run had ended and that was never closed is in the plan like any other.
- [`intent/02-subsystems/01-session-multiplexer.md`](../../intent/02-subsystems/01-session-multiplexer.md)
  — the live host is a cache over the record: every host and window is rebuilt from records alone,
  and placement being derived is what puts each window back on the floor it stood on.
- [`intent/02-subsystems/07-human-shell.md`](../../intent/02-subsystems/07-human-shell.md) — _Verbs
  read true to the operation_: the bulk form is the per-thread verb, `resume`, said of all of them.
  The slice names `attach` for it; why that word was not available is [IF-001](intent-feedback.md).
- [`intent/00-foundation/01-principles.md`](../../intent/00-foundation/01-principles.md) — **§16**:
  what comes back is decided from what is recorded. **§6**: enacting is check-then-do, and a second
  run starts nothing. **§12**: spend is the human's to commit, so the default shows the cost and
  stops.

## Scope

- **In:**
  - **The verb.** `ward session resume --all [--floor N] [--go] [--json]`. Without `--go` it is a
    read: it prints the plan and exits 0. With `--go` it enacts the plan.
  - **Who is in the plan.** Every `open` session whose latest launch was placed in the detached
    host, on any floor. A session whose latest run was in the foreground, or that recorded itself
    (Ward did not start it), is not listed: it is counted in one line that points at `ward status`.
  - **The steps.** Each planned session carries exactly one:

    | step        | what the plan found                                                          | enacted |
    | ----------- | ---------------------------------------------------------------------------- | ------- |
    | `resume`    | no live window here, and the harness history is on this machine              | started |
    | `live`      | its own window is running                                                    | left    |
    | `gone`      | no live window, no history here, and this is the machine it ran on           | left    |
    | `elsewhere` | no live window, no history here, and the record names another machine        | left    |
    | `unknown`   | the host did not answer, or the handle is one no harness in this build reads | left    |

  - **Order.** The coordinator (a workspace-scope session no session started), then floors
    ascending; within a floor, the floor's own session, then the others in the order they were
    opened.
  - **`--floor N`** keeps the sessions whose window belongs in floor N's host. The coordinator's
    belongs in floor 0's.
  - **Enacting.** Each `resume` row is resumed detached through `resumeSession`, serially, with no
    added pause. Each attempt ends as `resumed`, `exited` (placed, and already ended when read back)
    or `failed` (not placed; the cause is the single verb's refusal). A failure never stops the rows
    after it.
  - **No event from looking.** The plan writes nothing — no event, no commit — and enacting writes
    only what each attempted resume writes: `resumed`, and `resume-failed` when that attempt fails.
    A `gone` session is never attempted, so it gains no event however often the command runs.
  - **Exit code.** The plan exits 0. An enacted run exits 1 when an attempt `failed` or `exited`, or
    a session was `unknown`; otherwise 0. The report is printed either way.
  - **`--json`** emits one document, `sessionResumeAllShape`, for the plan and the enacted run alike
    (`enacted` says which). `ward schema session resume` is now the union of the single resume's
    record and this document, told apart by `sessions`.
  - **Refusals**, each before anything is read: an ID beside `--all`; `--foreground` or `--on-exit`
    beside `--all`; `--go` or `--floor` without `--all`; neither an ID nor `--all`. `--detach`
    beside `--all` is accepted. A host that is not usable refuses the plan and the run alike.
  - **Doctor.** When more than one hosted session is not running, one more `host windows` info
    finding names `ward session resume --all`.
  - **The workspace's `AGENTS.md`** gains one bullet under _Detached sessions_; the outgoing default
    is in the lineage.
  - **Tests**: `test/agent/resume-all.test.ts` (the step table, the order, that planning writes
    nothing, enacting against an injected resume, the refusals, the schema) and two real-tmux cases
    in `test/host/tmux-live.test.ts`.
- **Deferred:**
  - **The recovery-episode record.** Safe to defer because nothing is lost in the gap: every attempt
    is on its session as `resumed` or `resume-failed` with a cause, which is what a later episode
    record would be assembled from, and the command's own report carries the per-thread outcome for
    whoever ran it. What is not kept is that the attempts were one act
    ([IF-002](intent-feedback.md)).
  - **Re-arming wakes, validating setup, recovery rounds and their personas.** Safe to defer because
    none of them exists yet to be brought back: there is no wake record and no status persona, so a
    recovery that skipped them skips nothing that was recorded.
  - **Telling a session that was running at the reboot from one that had already ended.** Safe to
    defer because the plan shows every candidate before anything starts, and closing a session is
    the recorded way to keep it out. Storing "running" is what the lifecycle slice forbids; a
    recorded _ended_ event written by the host is the shape this would take, and nothing here
    forecloses it.
  - **Foreground sessions.** Safe to defer because Ward cannot see into a terminal it does not own:
    after a real reboot such a run is certainly gone, but the same command run without a reboot
    would start a second process on a conversation still open in someone's terminal. They are
    counted, and `ward session resume ID --detach` remains the way to host one.
  - **Naming the bulk command in `ward status`.** Safe to defer because status does not read the
    host today — it costs one file check per session — and doctor, which does, now names the
    command.
  - **Concurrency, and a configurable pause.** Safe to defer because the measured cost of serial
    launches is under half a second each (_Pacing_).
- **Acceptance:**
  1. `env -u WARD_AGENT mise run check` is green.
  2. On a private tmux server, with a coordinator and four sessions across two floors, one of them
     without history: after `kill-server`, `ward session resume --all --json` twice lists four
     `resume` and one `gone` in order, and `HEAD`, the run log and every session's events are
     unchanged.
  3. `--go` then exits 0 with four `resumed`; three floor hosts exist, the coordinator's window is
     in each, each floor's windows are in order; each resumed session has exactly one new `resumed`
     event and the `gone` one has none.
  4. A second `--go` exits 0, reports four `live`, starts no run and adds no commit.
  5. With a stranger session wearing floor 1's host name, `--go` exits 1, floor 1's session is
     `failed` with `resume-failed` recorded, and floor 2's is `resumed`; with the stranger gone the
     next run resumes floor 1 alone.
  6. Each refusal in the table of `test/agent/resume-all.test.ts` exits 1 with empty stdout and no
     commit.

## Design

### Decisions

- **`--go`, not `--yes`, `--apply` or a second verb.** `--yes` is the conventional spelling and was
  the first candidate. It lost because it answers a question, and Ward asks none here: there is no
  prompt for it to pre-empt, a declared agent is never prompted at all, and a flag that reads as
  consent to something unseen invites being typed from habit. `--apply` borrows plan/apply from
  infrastructure tools and reads as applying a saved plan, which this is not — the plan is
  recomputed on every run. A separate verb (`ward session recover`) would put the read and the act
  under different names, and the intent rejects that word for this act. `--go` says what happens —
  the sessions go — and has no other meaning in the CLI. The cost: it is a spelling nobody arrives
  knowing, so the plan prints the full command as its last line.
- **Plan by default is how this squares with 0031.** 0031's stance was "no mass restart burns tokens
  on threads nobody is ready to look at". The alternative here was the obvious one: `--all` resumes,
  and `--dry-run` previews. It lost because the costly act would then be the default of a command
  typed in the first minute after a reboot, when the human knows least about what is open. With the
  plan as the default, a mass restart only ever follows a list the human has just read. What this
  supersedes in 0031 is one sentence of its reboot scenario — that each thread comes back through
  `attach` alone; nothing else moves. Nothing here starts on its own, so 0031's rule that anything
  auto-recreating needs an anti-flap guard has nothing to bind: one invocation attempts a session at
  most once, there is no retry, and a run that dies at once is reported `exited` and shows in the
  next plan as "its last run exited N" before anyone can start it again. The cost of plan-first is
  two commands where one would do.
- **A session that had already ended comes back too.** The alternative is to resume only what was
  running when the host went away. It is what a human means by "bring it back", and it cannot be
  built on the record as it is: running is never stored, and after a reboot the host that knew is
  gone. Guessing — from the age of the last event, say — would close the door on a thread by
  heuristic. So every open hosted session is a candidate, the plan says so in a line of its own, and
  `ward session close` is how a human keeps one out. The cost is that a workspace with stale open
  sessions has a longer plan to read, and to prune, the first time.
- **Decide `gone` by looking, and attempt nothing.** The single resume discovers a missing history
  by trying: it records `resume-failed` and refuses. Calling it for every session would be less
  code, and every recovery would then append one more failure to each thread that can never come
  back. The plan asks `locate` first and never attempts a `gone` row, so the trail on such a session
  stays what it was. The cost: a `gone` session carries no event saying recovery looked at it
  ([IF-003](intent-feedback.md)).
- **Five steps, and the unhosted are a count.** `gone` and `elsewhere` could be one step — neither
  can be resumed here. They are kept apart because the remedies differ: one needs its human to close
  it or start afresh, the other needs a different machine and is nobody's problem on this one.
  `unknown` could have been folded into `resume` and left to the gate to refuse; it is its own step
  so that "could not determine" is never rendered as either answer. Listing unhosted sessions row by
  row was weighed and lost on volume: every agent working a task records its own session, so a busy
  workspace has dozens, none of which this command will ever act on. They are one line and a count.
- **`--floor` narrows by where the window goes, and the coordinator is floor 0's.** The alternative
  is to bring the coordinator back with any floor, since it is linked into every floor host. It lost
  because narrowing should start exactly what was asked for: a human bringing back one floor to work
  on it has not asked for the coordinator's run. The cost: `--floor 3` leaves floor 3's host without
  its coordinator link until the coordinator is resumed, which links it in.
- **Exit 1 for what this run could not do; `gone` is not that.** The alternative is to exit 1
  whenever any open hosted session is not running at the end. It lost because a session whose
  history the harness discarded would then fail every recovery until someone closed it, and a
  verdict that is always "failed" stops being read. `failed`, `exited` and `unknown` are things this
  run tried or should have tried, and a rerun may change them; `gone` and `elsewhere` are standing
  facts, printed for the human and left out of the verdict. The report is emitted before the exit,
  as `worktree rebase` established: the verb ran, and only the code carries the verdict. The cost: a
  script that checks only the exit code does not learn of a `gone` session.
- **Refuse when the host is unusable, the plan included.** A plan could still be printed without
  tmux. Every row would read `resume` for a run that could not be placed, so the plan would promise
  what the run must then refuse.
- **One document under one schema key.** `ward schema` keys are the words typed after `ward`, and a
  key with a flag in it cannot be asked for (`ward schema session resume --all` would parse `--all`
  as the schema verb's own). So `session resume` is a union of the two documents. The cost is that a
  reader of the schema must tell them apart by a field.
- **Doctor names the command only when several are down.** One gone session already has its line
  with `attach`. A second line for it would be noise on every workspace with one idle session.

### Layout

`src/agent/resume-all.ts` owns the plan and its enactment, and nothing else knows the step
vocabulary. It reads through what already exists — `classify` for what the host holds, the harness
adapter's `locate` for the history, `placementFloor` and `floats` for where a window goes — and
enacts through `resumeSession`, unchanged. It is a separate module from `run.ts` because `run.ts` is
about one run; this is a loop over records that decides which runs to ask for. The CLI owns the two
renderings and the refusals between the flags, since those are about what was typed.

### Mechanisms

- **The plan.** One read of every session record, one `find` per hosted session, one file check per
  session not running. It takes no lock.
- **Enacting.** For each `resume` row, in order:
  `resumeSession(root, id, …, { hostFlag: 'detach' })` inside a `try`. That call re-reads the host
  and the history under the store lock, so a session a human attached between the plan and its turn
  is refused there, and the refusal becomes the row's `failed`. The first resume on an empty server
  starts it; the coordinator going first means every floor host minted after it links the
  coordinator's window in as it is created.
- **Idempotence** is the plan's, not a guard's: a session brought back reads `live` next time, and a
  `live` row is never attempted.
- **Pacing.** No pause is added between launches. A hosted resume already takes its own journal
  commit and a 300 ms beat before it reads its window back; three resumes in a row took 1.4 s end to
  end on the development machine, about 0.4 s each. What a pause would protect against is harnesses
  starving each other as they start. Measured with the real harness binary on a private server (12
  cores): alone it drew its first screen in 0.15 s; eight started in the same instant, 0.28–0.31 s;
  twelve, 0.30–0.48 s. With the machine under other load (load average 16), twelve at once took
  0.98–1.25 s and twenty-four 1.40–2.03 s. So even with no spacing at all, a dozen starts cost each
  other a fraction of a second, and the serial loop spaces them further than that. The measurement
  is of the binary reaching its first screen with an empty configuration directory, not of a real
  conversation being loaded — that would have meant resuming real threads. `LAUNCH_GAP_MS` is the
  one constant to raise if a larger workspace shows otherwise.
- **The record shape does not change**, so the format level
  ([0066](../0066-workspace-format-guard/README.md)) does not move.
