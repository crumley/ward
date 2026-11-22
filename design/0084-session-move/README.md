# 0084 — Moving a session to another floor

> `ward session move ID --floor N [--task ADDRESS]` (or `--workspace`) carries a session's
> conversation to another scope as a **continuation**: the old record closes naming its successor, a
> new record continues the same harness handle, both in one journal commit — and a hosted run that
> was live is ended in its old floor's host and resumed in the new one.
>
> **Status:** built — awaiting review · **Started:** 2026-11-22

A conversation often turns out to belong to another floor than the one it was opened on: a floor's
session that drifts into a neighbour's work, a coordinator that settles into one floor's topic.
Until this entry the move took three verbs — record the same handle again under the new floor
(`ward session open --floor N --handle claude:ID`), close the old session, resume the new one
detached — and it worked, keeping the conversation. It left two things unsaid. Nothing on either
record linked the two: the old one read as finished, the new one as a conversation that began from
nothing, and a reflection reading either floor's log could not tell that the two were one run. And
nothing said a handle may not be recorded twice: between the first and second verbs, and forever
when the second was forgotten, two open records held one conversation, which
[0068](../0068-bulk-session-resume/README.md)'s `resume --all` would bring back as two runs of it.

This entry makes the move one verb and one commit, records the link on both sides, and states the
rule the three-verb dance could break: one conversation is one open workspace- or floor-scope
session. The live workspace this was built for showed no such pair at workspace or floor scope, and
two handles each shared by a floor or workspace session and task sessions recorded from inside the
same run (see _Decisions_, the rule's reach).

## Serves intent

- [`sessions-and-lifecycle`](../../intent/01-concepts/02-sessions-and-lifecycle.md) — each scope's
  session log stays append-only and true: the episode on the old scope ended (closed stays closed),
  one on the new scope began, and the trail of each names the other; resume never revives the closed
  predecessor. (A continuation has no word in the slice yet: [IF-001](intent-feedback.md).)
- [`domain-model`](../../intent/01-concepts/00-domain-model.md) — ids stay permanent and every
  record keeps its one identity; the handle, a recorded attribute, may stand on two records of one
  conversation, at most one of them open. (The slice does not say so: [IF-002](intent-feedback.md).)
- [`session-multiplexer`](../../intent/02-subsystems/01-session-multiplexer.md) — teardown only by a
  deliberate act: the move is one, and it ends the old session's own verified window and nothing
  else, as `session close` does.
- [`principles`](../../intent/00-foundation/01-principles.md) — §16, the record is the truth: the
  pair is written before any window moves, and a move that cannot tell whether the run is live
  refuses rather than guess; §17, both records are written under one store lock in one commit.

## Scope

- **In:**
  - **The record.** `continueSession` (`src/workspace/sessions.ts`) under one store lock: the open
    record gets a `continued` event naming the successor (`session`), then `closed`, with
    `closedAt`; the successor is opened at the new scope — the same handle, working directory, model
    and effort, `continues` naming the old id, the old purpose unless `--purpose` is given, and
    `task-named` beside `opened` when `--task` names an open task of the new floor
    ([0078](../0078-task-named-windows/README.md)'s rule). Both files, one commit:
    `Move session f1-1@m to floor 2 as f2-1@m`. Workspace format level 4.
  - **The run.** `moveSession` (`src/agent/move.ts`), outside the commit and in order: read whether
    the old run is live in its host (refuse when the host cannot answer), commit the pair, end the
    old window, and — only when the old run was live and its window was ended — resume the successor
    detached in its floor's host. Every other case starts nothing and says what to run.
  - **Scope of the verb.** Floor to floor, workspace to a floor, and a floor to the workspace
    (`--workspace`). A task-scope session is refused: "a task-scope session is moved by moving its
    task, not by this verb". A session already at the target scope, a closed floor, another floor's
    task, a session with no handle, and a session another machine ran are refused, each writing
    nothing.
  - **One open record per handle.** `session open --handle` at workspace or floor scope refuses a
    handle an open workspace or floor session holds, naming the holder, `ward session move` and
    `ward session close`; `ward doctor` warns of every existing pair (`shared handles`).
  - **Reads.** `session show` on either side names the link (`moved to … / moved from …`, and the
    `continued … as …` event); `--json` carries `continues` and the event's `session`. A closed
    predecessor's refusals (`resume`, `move`, `attach`) name the successor. The reflection packet
    marks each side of a pair (`continues` / `continuedBy`) and tells a reader which stretch of the
    shared history is that record's. `resume --all` plans only open sessions, so the closed
    predecessor is never resumed.
  - **The contract.** `ward schema session move` (`sessionMoveShape`: `from`, `to`, `hosted`,
    `next`), the format-guard list, the record shapes re-pinned at level 4, and the root AGENTS.md
    template (its outgoing default joins the lineage).
- **Deferred:**
  - **Re-recording a session under a new machine name.** The same primitive serves it —
    `continueSession` closes one record and opens its continuation, and nothing in it assumes the
    scope changes except the verb's own same-scope refusal — but the machine-renaming verb, which
    would open the successor at the same scope under the new name, is not built. Safe to defer
    because this verb refuses a session another machine ran rather than guess, so it never writes a
    record a later machine verb would have to undo.
  - **Moving the caller's own session.** Refused (see _Decisions_). Safe to defer because the human
    who asks an agent to move its own conversation can run the move from any shell, and the refusal
    gives the exact command.
  - **Moving a task session.** Its scope is its task's, and a task moves between floors by a floor
    renumber or a hand-off, not by a session verb. Safe to defer because the refusal names the
    route.
  - **A `continues` walk in placement or labels.** A continuation is placed and named for its own
    scope alone; nothing follows `continues` except the reads that show it. Safe to defer because
    the move's purpose is that the conversation now belongs where its new record says.
- **Acceptance:**
  1. `mise run check` → exit 0.
  2. Record half, at the CLI: the pair in one commit with both files, each side's fields and trail,
     the link on `show` from either side, purpose carried, a stated default restated, `--purpose`,
     `--task`, workspace to floor and back, every refusal writing nothing, a closed predecessor
     pointing at its successor, another machine's session, self-moves by declared session and by
     ambient handle, a format-3 workspace refusing with the remedy
     (`test/cli/session-move.test.ts`).
  3. The rule: `open --handle` refuses a held handle at both scopes, a task session may share it, a
     closed holder frees it; `doctor` names an existing pair and both remedies
     (`test/cli/session-move.test.ts`).
  4. Run half, against a fake host: the old window ended before the continuation is resumed; no
     resume when the old window is gone, dead, or will not close; an unanswering host refuses with
     nothing written; a failed resume reported with the pair standing; a foreground run never
     started over; a self-move refused before the host is asked; `resume --all` plans the
     continuation only (`test/agent/move.test.ts`).
  5. Against a real tmux on a private server: a live floor-1 session moved to floor 2 with `--task`
     — its window and host end, the continuation's window stands in floor 2's host named for the
     task, its run started with `--resume` and the same id, its trail `opened`, `task-named`,
     `resumed`; after the server is killed, the plan holds the continuation alone
     (`test/host/tmux-live.test.ts`).
  6. Format: a moved session needs level 4 on either side (`test/store/format.test.ts`).

## Design

- **Decisions:** rests on [ADR 0006](../decisions/0006-tmux-detached-host.md) and 0031's
  verified-window teardown, on [0038](../0038-machine-bound-sessions/README.md)'s permanent ids, and
  on [0066](../0066-workspace-format-guard/README.md)'s levels.

  - **A continuation, not a re-homed record.** Moving the record file to the new floor and rewriting
    its `floor` is one record and no new id, and attractive for it. It loses twice. The id names its
    scope (`f7-1@m` is floor 7's) and is permanent, so a re-homed `f7-1` on floor 22 either keeps a
    false name or is renamed, breaking every reference to it. And each floor's session log is
    append-only: re-homing erases the episode from the floor it happened on, which is the log a
    reflection of that floor reads. Closing one record and opening another keeps both true. The
    cost: one conversation is two records, so every read that should see one conversation follows
    the link — which is why both sides carry it.
  - **The link is on both records, each written once.** `continues` on the successor is written at
    its open, as `parent` is; the predecessor names its successor on its `continued` event, written
    as it closes. Neither record is rewritten after the commit. A link on one side only would make
    the other side's reader search every record for it.
  - **The successor records no parent.** Carrying the old record's `parent`, or recording the caller
    as one, was the obvious default. It loses because a parent is "the run that opened this
    session", and no run opened this one — it carries one on; and because placement pulls a
    session's window to its parent's floor ([0031](../0031-detached-session-hosting/README.md)), so
    a carried floor-7 parent would put a session moved to floor 22 back in floor 7's host. Who
    started the conversation is read through `continues`. The cost: a workspace session moved back
    from a floor reads as a coordinator (no parent) even if its first record had one.
  - **The purpose is carried, except one Ward stated.** The old purpose is the default, as the
    starting brief said. A purpose Ward wrote on the human's behalf
    (`Coordinating floor 7 · opened
    …`) would be false on floor 22, so it is not carried: the
    successor states its own scope's default. `--purpose` replaces either.
  - **One open record per handle, among workspace and floor sessions.** The rule exists because
    `resume --all` would start two runs of one conversation. Before choosing how strict to be, the
    live workspace was read: two handles were each held by more than one open record, and every time
    the second holder was a **task** session recorded from inside the same run (a subagent recording
    its task episode reads the run's handle from the environment). One of those pairs spanned two
    machines' ids. No two workspace or floor sessions shared a handle. Task sessions are never
    hosted, so `resume --all` never brings them back, and an agent recording one task episode after
    another from one run is the documented practice. So the rule binds the sessions a bulk resume
    restores: `open --handle` refuses at workspace and floor scope only, and doctor counts only
    those. Refusing task sessions too would break that practice for no protection.
  - **The move never starts a run that was not running.** The starting default was to resume the
    successor whenever the old session was hosted. A hosted session whose window is gone or dead was
    not running; resuming its successor would start a run the move was not asked for, and spend
    tokens on it. So the successor is resumed only when the old run was live and its window was
    ended. Every other case names `ward session resume NEW` and why.
  - **The old window ends before the new run starts.** Resuming first, then ending the old window,
    would leave no gap with nothing running — and two processes appending to one conversation's
    history for that moment. Ending first means two runs of one conversation never coexist. A window
    that will not close leaves the successor unstarted, with the reason.
  - **A host that cannot answer refuses the move.** Whether the old run is live decides whether a
    run is started; an `unknown` answer would make that a guess. Read before the commit, so the
    refusal writes nothing.
  - **A session cannot move itself; the move is refused, not made the last act.** The alternative
    was to resume the successor first and end the old window as the very last act, killing the
    command with it. It loses because it is the order rejected above: the successor's run would read
    the conversation while the old run, blocked on this very command, still holds it, and the old
    run's shutdown can append to the history the new run has just read. Nothing measured shows that
    is safe for any harness, and it cannot be tested without a real one. The refusal is safe by
    construction and costs one thing: the move is run from another terminal, which the refusal
    names. The caller is matched by its declared session and by the handle of the run it stands in,
    because an agent's subagents declare other sessions while standing in the same run.
  - **A session another machine ran is moved there.** The successor's id names this machine and its
    window would be placed here, where the run's history is not. Refused, with the machine to run it
    on. Re-recording under a new machine name is a different act (_Deferred_).
  - **Moving a moved session raises workspace format 4.** An older Ward reads session events through
    a closed set of kinds: a `continued` event fails the whole record, and every listing that reads
    sessions with it. A pre-0066 Ward's schema also strips the unknown `continues` from any session
    it rewrites, silently cutting the link. Both are the case 0066's level exists for.

- **Layout:** the record half stays in `src/workspace/sessions.ts` beside open and close — the
  shared `openedRecord` builder, `continueSession`, the rule (`requireUnheldHandle`,
  `sharedHandles`), and `continuedBy`. The run half is a module of its own, `src/agent/move.ts`,
  built only from what close and resume already are (`liveStateOf`, `teardownSession`,
  `resumeSession`), so the move has no hosting logic of its own to drift. The CLI renders; doctor
  and the reflection packet read.

- **Mechanisms:**
  - _The commit._ `continueSession` refuses, allocates the successor's id on this machine, builds
    both records at one instant, asks `requireFormatFor` of the closed one before writing either,
    writes both, and commits both paths in one commit.
  - _The run._ `moveSession` reads `liveStateOf` before the commit, `teardownSession` after it, and
    calls `resumeSession(…, { hostFlag: 'detach' })` — the single resume, so the gate, the
    record-then-launch order, the harness name (`--task` names the run) and the `resumed` event are
    that verb's. The resume is injectable for tests, as `enactResumeAll`'s is.
  - _The report._ `--json` is `{ from, to, hosted?, next? }`: `from` with the close's `teardown`,
    `to` with `live` and `workingOn` when they apply.

## Overlapping work

Two entries in flight touch the same surfaces: the floor resident (0089, task f7t63) and the floor
renumber (0081, task f7t64), which rewrites `floor` on session records. All three append to
`FORMAT_LEVELS` and the root AGENTS.md lineage; whichever lands second renumbers its level and
re-pins. A renumbered floor's sessions keep `continues` and the `continued` event untouched — both
name sessions by id, never by floor.
