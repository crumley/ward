# 0038 — Machine-bound sessions: ids that name their machine, and never repeat

> A session id becomes `<slug>-<n>@<machine>` with `n` never reused, so two machines sharing one
> workspace cannot mint the same id and a closed record is never written over. Resume, locate, and
> `ward status` are made honest about which machine holds a session's history — and when a
> foreground run exits at a terminal, Ward asks the human once whether the thread is done.
>
> **Status:** built — awaiting review · **Started:** 2026-09-04

A session id is allocated as the smallest number no **open** session holds, and the record is
written at `sessions/<id>.md`. Both halves of that are load-bearing in ways the allocation rule does
not survive. The first time a closed `workspace-1` is followed by a new open, the new record lands
on the old one's path and the closed session's handle and lifecycle trail are gone — spending
_closed stays closed_ on an id nobody needed recycled. The same rule read across machines is worse:
two clones of one workspace each allocate from their own view, both call the next session
`workspace-1`, and the git sync that joins them is an add/add conflict between two different
sessions' records.

Sessions are already machine-bound in fact and nowhere in the record. A harness transcript lives on
the machine that produced it, addressed by that machine's filesystem
([0029](../0029-launched-sessions/README.md)); nothing says which machine a session ran on, so
`ward session resume` on the other one appends `resumed`, spawns a harness, and gets an error from
it — a recorded attempt that never had a chance and a process spent learning what one `existsSync`
already knew. And a session whose run left no history at all — opened, exited at the first prompt —
stays open forever with nothing to resume, visible only to whoever thinks to run
`ward session
locate` on it.

This entry makes the machine a recorded fact and follows it through every surface that reads a
session: the id, the record, the allocation, resume's refusals, locate's answer, and a sessions
block in `ward status` — the presentation [0029](../0029-launched-sessions/README.md) deferred until
there was more than one homeless case to place. It closes the empty-session case at the only moment
the answer is cheap: the human is standing at the terminal Ward has just taken back from the agent,
and one question there costs less than a session list that fills with threads nobody will resume.

## Serves intent

- [`domain-model`](../../intent/01-concepts/00-domain-model.md) — _Identity_: a bare id stays a
  sufficient address for every session operation, which is what this entry protects by making the id
  unique over the workspace's history rather than only among its open sessions; the uniqueness rule
  itself is where the friction lands ([`spec-feedback.md`](spec-feedback.md), SF-001).
- [`sessions-and-lifecycle`](../../intent/01-concepts/02-sessions-and-lifecycle.md) — the
  **session-log minimum** gains a field the record can now answer with (the machine); the **three
  per-thread outcomes** get their third, _unresumable_, recorded with its cause and never
  auto-closed; **closed stays closed** is what never reusing a number defends, and **closing stays
  deliberate** is why the exit question is a question (SF-002, SF-003).
- [`agent-harness`](../../intent/02-subsystems/03-agent-harness.md) — _locate distinguishes found
  from gone_: the distinction is drawn per machine, and a handle found nowhere here is gone here
  whatever another machine holds (SF-004).
- [`human-shell`](../../intent/02-subsystems/07-human-shell.md) — _what needs me?_: an open session
  with no history to resume becomes a visible, derived item with the command that ends it; the
  interactive-resolution rules (**deliberate entry**, a **deterministic result for every
  non-interactive invocation**, **unreachable by an agent caller**) are what the exit question is
  built to satisfy (SF-005); _opinionated configuration, global and workspace-local_: the machine
  name takes the global axis only.
- [`principles`](../../intent/00-foundation/01-principles.md) — **§16**: which machine a session ran
  on is recorded, never inferred from whoever is reading. **§8**: the question is a human-audience
  affordance a declared agent never meets. **§17**: the allocation scan and its write happen under
  the one store lock, so the records can be the counter with nothing stored beside them. **§20**: a
  resume that cannot work says which machine can, and an unnameable machine still gets a name.

## Scope

- **In:**
  - **A machine has a name** (`src/global/machine.ts`, `src/global/config.ts`): the global config
    gains `machine`, and one helper resolves the name and its source — `WARD_MACHINE` for one
    invocation, else the configured key, else the hostname's first label — normalizing every layer's
    answer to the slug alphabet. `ward doctor` reports the name, its source, and the suffix ids
    allocated here will carry, in the human rendering and in `--json` (`machineName`).
  - **Ids carry the machine and never reuse a number** (`src/workspace/sessions.ts`): a new id is
    `<slug>-<n>@<machine>`, where `n` is one more than the highest ever recorded for that slug on
    this machine — scanning every session record at every scope, open and closed. The machine is
    written on the record too (`machine:`, optional), at both the launched and the `--handle`
    record-only path.
  - **Pre-0038 ids keep working, unmigrated**: an id with no `@` resolves, closes, locates, and
    resumes as before, its machine reads as unrecorded and is never guessed, and it counts toward
    this machine's numbering so the sequence climbs past it instead of restarting beside it.
  - **Honest resume and locate** (`src/agent/run.ts`, `src/cli/index.ts`): resume locates before it
    launches. Found here resumes, whatever machine the record names. Gone with another machine on
    the record is refused before anything is written or spawned, naming the machine that can resume
    it; gone with this machine or none appends `resume-failed` with its cause and refuses. Both
    refusals name the fresh start. `session locate` names the machine the run stood on, in prose and
    in `--json`.
  - **The workspace's own sessions in `ward status`** (`src/workspace/status.ts`): a `sessions`
    block after the tasks — one row per **open** workspace-scope session with its purpose, its
    machine, and whether its history is on this machine — plus the report's own `machine`. Task
    sessions stay on their task lines. `--json` carries the same rows; `ward schema status` says so.
  - **The exit question** (`src/cli/session-exit.ts`, `src/cli/index.ts`): where a human is
    demonstrably present, the still-open line is replaced by one line of what Ward knows and one
    question, defaulting to yes only when the run left no history. `--on-exit ask|keep|close`
    answers it in advance. The decision is a pure function of four facts; the run's exit code still
    propagates afterward.
  - **The manifest and the docs**: the workspace `AGENTS.md` Sessions section states the id shape,
    the exit question, and what `status` now lists, with the outgoing default's fingerprint appended
    to the lineage ([0020](../0020-deterministic-upgrade/README.md)); `README.md` documents
    `machine`.
  - **Tests**: the name ladder and the exit rule as tables; ids, allocation across machines and
    across a pre-0038 record, both resume refusals, locate, the status block, and `--on-exit` end to
    end through the stub harness.
- **Deferred:**
  - **Syncing transcripts between machines.** Safe to defer because the record already answers the
    question that matters — which machine can resume this — and does so without moving a byte of
    harness history; a transcript that _has_ been carried across by other means is honored on
    arrival, since resume trusts what it finds over what the record assumed. Copying histories would
    mean owning a retention policy that belongs to the harness.
  - **Hiding closed sessions after a window.** Safe to defer because nothing accumulates in the one
    surface that could suffer: the status block lists open sessions only, and the closed records it
    leaves out are exactly the ones never reusing a number now preserves. A window is a preference
    to add when a real listing verb exists to apply it to.
  - **A workspace-level `session list` verb.** Safe to defer because `ward status` now carries the
    rows a human needs and `--json` carries them for an agent; a verb would be a second reader of
    the same records, and the case for one is a query status cannot express (closed sessions, other
    scopes, a time range) — none of which has appeared yet.
  - **Unresumable sessions in the derived _needs you_ list.** Safe to defer because the sessions
    block names each one with the command that ends it, in the same output, two lines further up:
    the item is visible where the human is already looking, and promoting it is a presentation
    change that needs no record to move.
  - **Recording usage at close.** Safe to defer because the harness contract makes usage optional
    and nothing may depend on its presence; the records stay complete without it.
  - **Changing the slug half of a task session's id.** Safe to defer because the slug is not what
    collides — two machines produced the same `<slug>-<n>`, and the machine half settles it at every
    scope; a slug scheme is a readability question with no correctness pressure behind it.
  - **Continuing a gone session as a fresh run under a new handle** (the harness's
    `--fork-session`). Safe to defer because the intent already says this is a **different act
    deserving a different word** — calling it resume would falsify what resume promises — so it is a
    new verb, not a flag on this one, and refusing honestly today loses nothing but the keystroke of
    opening a session.
- **Acceptance:**
  1. `mise run check` exits 0 (lint, format, `tsc --noEmit`, tests, links, actionlint).
  2. `bun test test/global/machine.test.ts` — the ladder and the normalizer: hostname first label,
     lowercasing, punctuation, a configured name, the override, and a machine that can be named by
     none of them.
  3. `bun test test/agent/machine-sessions.test.ts` — the id, the record's `machine`, and the
     `--json` field agree; two machines allocate side by side without colliding; a pre-0038 id
     resolves, closes, locates, and is counted past.
  4. Same suite — a resume of a session recorded on another machine is refused with that machine
     named, no `resumed` event, and no spawn; a resume whose history is gone here appends
     `resume-failed` with its cause, leaves the session open, and spawns nothing; a transcript that
     is here resumes whatever the record says.
  5. Same suite — `ward status` lists the open workspace sessions with history-here, on-another-
     machine, and unrecorded-machine notes; `--json` carries the rows and the machine; a closed
     session leaves the block.
  6. Same suite — `--on-exit close` closes with the ordinary `closed` event and no question;
     `--on-exit keep` and the default from a caller whose stdin is a pipe both print the still-open
     line and ask nothing; a close on a resume still propagates the run's exit code;
     `--on-exit
     close --json` leaves exactly one document on stdout.
  7. `bun test test/cli/session-exit.test.ts` — the decision table: the default follows the history,
     and an agent, a `--json` invocation, or a caller without a terminal is never asked.
  8. `bun test test/agent/doctor.test.ts test/cli/json.test.ts` — doctor names the machine and its
     source in both renderings, outside a workspace as well as in one.
  9. `bun test test/agent/launch.test.ts test/workspace/lineage.test.ts` — the 0029 and 0034
     behaviors are unchanged under the new id shape, and the outgoing manifest default is a known
     default so an untouched workspace upgrades.

## Design

- **Decisions:** no new ADRs — the store stack ([ADR 0005](../decisions/0005-store-stack.md))
  governs the records this entry re-numbers, and nothing about how they are written moves.
  Entry-local, each with the alternative it beat:
  - **`@` separates the machine from the number.** _Alternative:_ another hyphen (`workspace-7-gcp`)
    — attractive because the id alphabet then has no new character and every existing parser keeps
    working. _Why it lost:_ a slug may contain hyphens, so `floor-addressed-tasks-1-mbp` cannot be
    split back into its parts by any rule a human can state, and an id you cannot take apart is one
    that has to be carried around whole forever. `@` reads aloud as what it means ("workspace
    session seven, on gcp"), needs no quoting in fish or bash, and is legal in a filename on every
    platform Ward runs on. _Cost:_ one more character class in ids, and a
    `sessions/workspace-7@gcp.md` that looks unusual the first time.
  - **A number is never reused; the counter is the records.** _Alternative:_ keep smallest-free
    among open sessions and merely add the machine — attractive because ids stay short forever and
    the change is one string concatenation. _Why it lost:_ smallest-free is what overwrites a closed
    session's document, and the machine half does not fix that; the two failures had one cause.
    Scanning open **and** closed records makes a bare id address one session over all of history,
    which is what lets the numbers keep climbing safely. _Alternative to the scan:_ a stored
    high-water mark — attractive as one small read. _Why it lost:_ a counter beside the records is a
    second source of truth that a clone, a restore, or a hand-edit can put out of step with them,
    and the scan already happens under the write lock that serializes allocation (§17). _Cost:_
    allocation reads every session record at every scope; the same read `session close` completion
    has always made, on a set sized to a workspace.
  - **Unmachined ids count toward every machine's numbering.** _Alternative:_ count only ids bearing
    this machine's name — attractive as the literal reading of "the highest recorded for this
    machine". _Why it lost:_ a workspace with `workspace-1` … `workspace-6` on it would allocate
    `workspace-1@gcp` next, and two ids that differ only by a suffix, sitting a line apart in
    `status`, are exactly the ambiguity the machine was added to remove. _Cost:_ a machine that has
    never opened a session here starts at whatever number the old records reached — a gap in that
    machine's own sequence, which is honest history, not a defect.
  - **The machine name is global-only, with an environment override above it.** _Alternative:_ the
    same two-axis treatment every `agent.*` key gets — attractive for uniformity. _Why it lost:_ the
    ruling recorded in [0035](../0035-agent-command/spec-feedback.md) (SF-002) is that a
    machine-shaped fact belongs in the machine's own configuration and out of the record that
    travels; a workspace-level `machine` would be false on every other machine that clones it, and
    it would falsify the very ids it named. The `WARD_MACHINE` override is the ladder
    [0035](../0035-agent-command/README.md) built for `agent.command`, for its two reasons: it is
    the hermetic seam tests pin (no assertion may depend on the developer's hostname) and the escape
    hatch for one invocation. _Cost:_ a third source to report; doctor names which one answered.
  - **A configured name is normalized, not refused.** _Alternative:_ validate the key and fail the
    document — attractive because it teaches the alphabet at the point of the mistake. _Why it
    lost:_ a preference file may never be the reason a workspace command dies (§20), and the whole
    config document degrades together, so one stray capital would silently drop the agent block with
    it. _Cost:_ `machine: My Box` becomes `my-box` without saying so at write time — doctor prints
    the resolved name, which is where the human looks for what Ward will actually do.
  - **Resume locates before it launches, and refuses.** _Alternative:_ launch anyway and let the
    harness report — attractive because the harness's own error is the most accurate one available,
    and Ward would never wrongly refuse a history it failed to find. _Why it lost:_ the failure is
    predictable from the record plus one filesystem check, and paying a process and a terminal to
    rediscover it also writes a `resumed` event for an attempt that never had a chance — the trail
    then reads as a session being worked on. _Cost:_ a transcript Ward cannot address (a harness
    that moved its store without moving `CLAUDE_CONFIG_DIR`) is refused where the harness might have
    found it; the refusal names the exact path it looked at, so the misconfiguration is one line
    away from visible.
  - **Gone-here and gone-elsewhere record differently.** Gone on another machine appends nothing: no
    attempt was made here, and an event saying otherwise would falsify the log. Gone here appends
    `resume-failed` — the intent's _unresumable_ outcome, recorded with its cause, the session left
    open. _Alternative:_ one uniform event for both — attractive for a simpler rule. _Why it lost:_
    the events exist to make failure legible, and "this machine tried and could not" and "this is
    not this machine's thread" are different facts a later reflection must be able to tell apart.
    _Cost:_ two refusal texts to keep true.
  - **Ward asks; it never closes on its own judgment.** _Alternative:_ close an open session
    automatically when its run exits leaving no history — attractive because it is the answer nearly
    every time, and it costs the human nothing at all. _Why it lost:_ _closed stays closed_ is
    strong enough that only a human or the agent doing the work may invoke it, and a heuristic that
    closed threads for looking empty would spend that guarantee on a guess — a run can leave no
    transcript and still have changed the world. A question with the right default costs one
    keystroke and keeps the act the human's. _Cost:_ one interaction at the end of every foreground
    run for a human who has not set `--on-exit`.
  - **The default follows the evidence, and only a present human is asked.** `gone` defaults to yes
    (there is nothing to resume); everything else defaults to no (keeping a session costs a line,
    closing one the human wanted costs a thread). Asking requires both streams to be terminals, no
    `--json`, and no declared agent. _Alternative:_ always default to no — attractive as the
    uniformly safe answer. _Why it lost:_ the empty session is the case worth solving, and a
    question whose default is wrong in the common case teaches the human to read it instead of
    answering it. _Cost:_ two defaults to explain; the line above the question explains them by
    saying what Ward found.
  - **`--on-exit` has three values, not a boolean.** _Alternative:_ one `--close-on-exit` flag —
    attractive as the smaller surface. _Why it lost:_ three states genuinely exist (ask, keep,
    close), and a boolean would have to encode "ask" as its absence, which makes the default
    unnameable — a script could not say "keep asking me" and a human could not turn asking back on
    for one invocation. _Cost:_ a value to type where a flag would do; `ask` is the default, so it
    is typed only to override a future preference.
  - **The sessions block lives in `status`, not in a new verb.** _Alternative:_ `ward session list`
    — attractive because sessions are their own noun and the verb would take filters. _Why it lost:_
    the surface a human already reads for "where does everything stand" is the one where a homeless
    open session must appear; a second listing would be a second place to look, and the first thing
    it would need is the rows this block already renders. _Cost:_ `status` grows a block and one
    filesystem check per open workspace session — local, cheap, and skipped entirely when there are
    none.
- **Layout:** one new module on each side of the change. `src/global/machine.ts` holds the name and
  its ladder, beside the configuration it reads and away from anything that knows what a session is
  — the machine is a fact about the computer, and the session model consumes it.
  `src/cli/session-
  exit.ts` holds the exit rule and the asking, in the CLI layer because both are
  about who is at the terminal; the decision is a pure function so the asymmetry is testable without
  a TTY. Everything else is additive inside existing boundaries: allocation stays inside
  `sessions.ts` under the store lock, the resume refusals stay in `agent/run.ts` where the record
  and the harness meet, and the status rows are computed in `workspace/status.ts` and rendered in
  the CLI, the same split every other status row already has. **Relationship to the session
  entries:** this extends [0029](../0029-launched-sessions/README.md) (the id shape, the resume it
  built, and the sessions presentation it deferred) and [0004](../0004-work-spine/README.md) (the
  allocation rule); neither is superseded as a whole — the one affordance replaced is
  smallest-free-among-open allocation, here.
- **Mechanisms:** _Allocation:_ inside the store lock, every session record at every scope is read
  and its id parsed into slug, number, and optional machine; the candidates are this slug's, on this
  machine or unmachined; the new id is their highest number plus one, suffixed with the machine.
  _Resume:_ resolve the open session → read its handle → locate its transcript → found launches,
  gone branches on the record's machine into a bare refusal or a `resume-failed` and a refusal.
  _Status:_ the open workspace-scope records are mapped to rows, each carrying the outcome of one
  local transcript lookup; the renderer turns the row plus the report's machine into the note that
  says what to do. _The exit moment:_ locate the run just ended → `exitDecision` → keep prints the
  old line, close calls `closeSession`, ask prints what Ward knows and reads one line, with EOF and
  the empty answer resolving to the default the line just explained.
