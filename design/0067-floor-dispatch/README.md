# 0067 — Floor dispatch: handing a task to another floor

> `ward task dispatch` opens a task on a floor the sender names, with its brief and a record of who
> handed it over, in one commit; Ward then types a one-line notice into that floor's own session
> when it is running where Ward can reach it, and anyone can ask where a hand-off stands.
>
> **Status:** built — awaiting review · **Started:** 2026-11-16 · **Partly superseded:** the notice
> goes to the floor's attending alone (the coordinator on floor 0), not to each of its sessions, by
> [0089](../0089-floor-attending/README.md)

A workspace with several floors has several sessions responsible for them
([0051](../0051-floor-scope-sessions/README.md)), each hosted where it outlives a terminal
([0031](../0031-detached-session-hosting/README.md)). Work found on one floor regularly belongs on
another: a session on the Ward floor finds a defect in the dotfiles, a session above the floors
receives a request and knows which floor should have it. Today the only way to move that work is to
do it oneself on the other floor: `ward task open --project N`, `ward task brief`, and then tell a
human, because nothing in the record says the task was handed over, nobody on the receiving floor
learns of it, and the sender has no way to ask what became of it.

The intent has named this flow since the beginning — dispatch, the first of the three messaging
flows — and the messaging seam says how it must behave: recorded before it is delivered, addressed
to an identity that need only be open, inspectable by human and agent. None of the seam exists in
`src/`. This entry builds its first slice: the **direct** path, where the sender names the floor;
one verb that makes the hand-off a record; a derived answer to "where does it stand"; and the first
live delivery in Ward, a line typed into another session's window, with what was measured to make
that safe.

It is deliberately the smallest slice that is useful by itself. A hand-off that is recorded and
visible is already better than a message in a transcript, and the parts left out — wakes, reports,
routing by a status persona — each need this record to exist first.

## Serves intent

- [`intent/02-subsystems/02-messaging-coordination.md`](../../intent/02-subsystems/02-messaging-coordination.md)
  — _Deliver_, _Recorded-first_, _Observable and inspectable_: the hand-off is one commit before any
  key is typed; a floor with no running session is served from that record alone; and who sent what,
  to which floor, when, and whether it has been picked up is one read verb and one `--json` shape.
  The seam names a room, a task and a session as targets and this slice delivers to a floor
  ([IF-002](intent-feedback.md)); what "delivered" means there is [IF-003](intent-feedback.md).
- [`intent/01-concepts/00-domain-model.md`](../../intent/01-concepts/00-domain-model.md) —
  _Messaging, dispatch, and waking_ and _How dispatch routes_: this is the direct path, and the
  dispatcher can see where the work landed. The slice says dispatch flows downward; a hand-off
  between two floors is sideways ([IF-001](intent-feedback.md)). _Briefs_: the hand-off's document
  is the task's brief, the artifact type that already carries who it is for and who wrote it.
  _Status: recorded at the leaves, derived above_: where a hand-off stands is never stored.
- [`intent/01-concepts/00-domain-model.md`](../../intent/01-concepts/00-domain-model.md) —
  _Repositories_: a floor's claim is a routing default, so a hand-off to a named floor lands there
  whatever the task touches.
- [`intent/02-subsystems/01-session-multiplexer.md`](../../intent/02-subsystems/01-session-multiplexer.md)
  — the window is found by the evidence its launch placed in it, never by name, and the open
  question there says any live delivery riding on the multiplexer is the messaging seam's design,
  recorded-first: this is that delivery. What the seam does not say about typing into a run someone
  else may be using is [IF-004](intent-feedback.md).
- [`intent/02-subsystems/03-agent-harness.md`](../../intent/02-subsystems/03-agent-harness.md) — the
  one harness-specific fact the nudge needs, how to read a run's input line off its screen, lives in
  that harness's adapter and nowhere else.
- [`intent/00-foundation/01-principles.md`](../../intent/00-foundation/01-principles.md) — **§16**:
  the record is the hand-off and the typed line is a pointer to it. **§17**: one store write, one
  commit, and nothing derived is cached. **§18**: opening a task and writing a record are local and
  reversible; typing into another session's window is neither named nor excluded by the rule, and
  _Why typing is acceptable_ below argues it. **§20**: every way a nudge does not happen is reported
  with its reason, and none of them fails the verb.

## Scope

- **In:**
  - **The verb.**
    `ward task dispatch SLUG --to FLOOR --brief FILE [--purpose TEXT] [--repo NAME]…
    [--json]`.
    `--to` and `--brief` are required; `--brief -` reads stdin. It opens the task on floor `FLOOR`
    exactly as `ward task open --project FLOOR` would, records the brief exactly as
    `ward task brief` would, and writes the hand-off record, under one store lock and in one journal
    commit, `Dispatch task SLUG (ADDRESS) to floor N from floor M`.
  - **The record.** `dispatch.md` beside the task's `task.md` and `brief.md`, type `dispatch`:
    `task` (the address when sent), `to` (the floor), `fromSession` (the sender's recorded session,
    present exactly when the caller's `WARD_AGENT` names one in this workspace), `fromFloor` (the
    floor that session is responsible for, or works a task on; absent for a workspace-scope session
    and for a human), `sentAt`. Never rewritten.
  - **Where it stands, derived.** `pending` until a session has been opened on the task; `picked-up`
    from then, naming the first such session and when it opened; `closed` once the task is closed,
    with the task's outcome. Read from the task record and its session records every time.
  - **Refusals, before anything is written:** an empty brief; a bad slug; an unregistered `--repo`;
    a floor that does not exist or is closed; and a sender handing work to the floor it is on, which
    names `ward task open` instead.
  - **The nudge.** After the commit, and outside the store lock, Ward types one line into the window
    of every open session of **project scope whose floor is the target**, when that session's latest
    launch was hosted, on this machine, its run is live, and its harness is one whose input line
    Ward can read. The line is
    `[ward] hand-off to floor N: task ADDRESS (SLUG) from floor M. Read it: ward task show ADDRESS`
    (the slug is left out past 40 characters; the sender is a session id, or absent, when there is
    no floor). It is typed, read back, and submitted only when the run's input line holds exactly
    it. The verb reports one outcome per such session — `typed`, `withheld`, `not-running`,
    `unreachable`, `unknown`, each with its reason — and an empty list when the floor has no open
    session. No outcome changes the verb's exit code.
  - **No agent is started.** A floor with no open session, or one whose run has ended, is left
    exactly as it is.
  - **The reads.**
    `ward task dispatches [--from FLOOR] [--to FLOOR] [--state STATE] [--mine]
    [--all] [--json]`
    lists hand-offs, oldest first, behind the settled-work window
    ([0036](../0036-floor-addressed-tasks/README.md)). `--mine` selects the hand-offs of the
    caller's own floor, or of the caller's session when it stands above the floors. `ward status`
    shows a hand-off twice: under the target floor, on the task's row
    (`handed over by floor 1 (session f1-1@mac) [pending]`), and under the sending floor
    (`handed off f2t1 fix-login floor 1 → floor 2 [pending]`), with hand-offs that have no sending
    floor in a block of their own. `ward task show` carries a `handed` line. `status --json` gains
    `dispatches`, `task show --json` gains `dispatch`; both additive.
  - **Told at the door.** `ward session open --floor N` and `ward session resume` of a floor's
    session print, on stderr, how many hand-offs wait on that floor, their addresses, and the read
    that lists them. Silent when none wait.
  - **The seam.** `SessionHost` gains `typeLine`; tmux implements it; `HarnessAdapter` gains an
    optional `inputLine`, which the Claude Code adapter implements.
  - **The workspace manifest** gains two bullets, on handing work over and on being handed it; the
    outgoing default joins the lineage ([0020](../0020-deterministic-upgrade/README.md)).
  - **The format level stays at 1** (_Decisions_).
- **Deferred:**
  - **Wakes, in both flavors, and any notice back to the sender.** Safe to defer because the sender
    is not left blind: `ward task dispatches --mine` answers at any time from the record, and
    nothing in this slice holds a process waiting. A wake needs a recorded condition and a re-arm on
    recovery, and both hang off the hand-off record this entry introduces.
  - **Report, the upward flow.** Safe to defer because the facts a report would carry in this slice
    are already at the leaves the sender reads: the task's state, its outcome, its pull requests.
  - **Routing through a status persona.** The sender must name the floor. Safe to defer because the
    direct path is complete without it, and a persona that resolves a target would end by calling
    this verb.
  - **Recording what became of the nudge.** The outcome is reported to the sender and stored
    nowhere. Safe to defer because nothing downstream reads it: a typed line is not a delivery, and
    the answer that matters, whether the work was picked up, is derived. Storing it would be a
    second commit per hand-off to keep a fact about a moment.
  - **Typing to a harness other than Claude Code, to a foreground run, or to another machine.** Each
    reads `unreachable` with its reason. Safe to defer because the record serves them as it serves a
    floor with no session, and because typing where the screen cannot be read is the one thing this
    entry will not do.
  - **Putting the waiting hand-offs in front of an agent as it starts.** A launched agent is not
    handed them as starting text; it learns from the manifest to ask, and from `ward status`. Safe
    to defer because a hand-off that is not noticed stays `pending` on three surfaces, and the
    alternative is a harness-specific starting prompt this entry has no second use for
    ([IF-005](intent-feedback.md)).
  - **Declining, redirecting, or withdrawing a hand-off.** Safe to defer because the task is an
    ordinary task: whoever should not do it closes it `abandoned`, and the hand-off then reads
    `closed · abandoned` to its sender.
  - **A doctor finding for a `dispatch.md` that will not read.** Such a file refuses `ward status`
    with the document layer's own message naming the file, as a broken `task.md` does. Safe to defer
    because Ward is the only writer and never rewrites it.
- **Acceptance:**
  1. `env -u WARD_AGENT mise run check` is green on macOS and Ubuntu.
  2. `ward task dispatch fix-login --to 2 --brief FILE` adds exactly one commit holding `task.md`,
     `brief.md` and `dispatch.md` under `projects/2-…/tasks/t1-fix-login/`
     (`test/workspace/dispatch.test.ts`).
  3. Each refusal in Scope leaves `HEAD` and the working tree unchanged (same file, and
     `test/cli/dispatch.test.ts`).
  4. A hand-off reads `pending`, then `picked-up` after `ward session open ADDRESS`, then `closed`
     with the outcome after `ward task close`, and its `dispatch.md` is byte-identical throughout.
  5. On a real tmux, with stand-in runs that draw an input line: a hand-off from floor 1 to floor 2
     reaches floor 2's session as exactly one submitted line, and the coordinator and floor 1's
     session receive nothing; a run showing a question receives no key at all; a line already
     holding words is put back and its owner's Enter sends only those words
     (`test/host/tmux-nudge-live.test.ts`).
  6. Every screen in `test/agent/input-line.test.ts` where Enter would answer a question reads as no
     input line.
  7. `ward schema task dispatch` and `ward schema task dispatches` emit the shapes the verbs'
     documents validate against.
  8. By hand, against the real harness on a private tmux server: the table under _What was
     measured_.

## Design

### Decisions

- **`ward task dispatch`, not a `dispatch` noun of its own.** A top-level `ward dispatch send|list`
  was attractive because the messaging seam will grow reports and wakes and a noun would hold them
  together. It lost because what this verb does is open a task: its arguments are `task open`'s plus
  a recipient, its report addresses a task, and an agent looking for how to give work to a floor
  looks under the thing it would otherwise have opened. The cost is that the read sits beside it as
  `ward task dispatches`, a plural the CLI has nowhere else.
- **The brief is required.** A hand-off with only a slug and a purpose is possible and one flag
  shorter. It lost because the brief is what the receiving floor reads, and a hand-off without one
  delivers a name. The cost is one file to write, or a pipe.
- **One commit, by splitting the open and the brief from their commits.** Calling `openTask` and
  then `recordBrief` reuses both verbatim and makes three commits. It lost because between them the
  floor holds a task with no brief and no sender, visible to anyone reading status in that instant,
  and a crash there leaves it so. `openTask` and `recordBrief` are now each a lock and a commit
  around a function that writes without committing (`writeOpenedTask`, `writeBrief`), and the
  hand-off calls those two under its own lock. The semantics are shared by construction: room
  allocation, the brief's front matter and its body rules are the same code.
- **A document beside the task, not fields on the task record and not a log of its own.** Fields on
  `task.md` were the smallest change and lost for a reason
  [0066](../0066-workspace-format-guard/README.md) already paid for: a Ward that does not know a
  field drops it when it rewrites the record, and every `ward task pr` on an older machine would
  erase who handed the task over. A `dispatches/` directory at the root, one document per hand-off,
  was attractive because "what has crossed" would be one directory listing; it lost because a
  hand-off is about exactly one task, a second home would need its own identity and could disagree
  with the task about which task it means, and containment already answers the question. The cost is
  that listing hand-offs scans the task directories, which is the scan `ward status` already makes.
- **Where it stands is derived, and picked up means a session was opened on the task.** An
  acknowledge verb was the obvious alternative: explicit, and it could carry a reply. It lost
  because it is a second fact that can disagree with the first: a floor that acknowledges and never
  starts reads as picked up, and one that starts without acknowledging reads as pending. Opening a
  session on a task is what every agent here does before it works, recorded by the verb it already
  runs, so the answer costs nobody an act. The first session ever opened on the task is the pick-up,
  open or closed, so a hand-off does not fall back to pending when that session ends. The costs: a
  human who does the work without recording a session never picks it up in the record, and reads
  `pending` until the task closes; and a sender who opens a session on the task itself marks its own
  hand-off picked up.
- **The sender's floor is stored, though its session implies it.** Deriving it at read time from the
  session record is possible and is one field fewer. It lost because the floor, not the session, is
  who asks "where do my hand-offs stand": sessions on a floor come and go, and `--mine` from the
  floor's next session must find what its last one sent. Recorded once, at send, from the session's
  own record; never from a name.
- **A sender cannot hand work to its own floor.** Allowing it is harmless to the record. It is
  refused because the nudge would be typed into the sender's own window while it is mid-turn running
  the verb, and because the act already has a name, `ward task open`.
- **Every open session of the target floor is nudged, and nobody else.** Choosing one, the newest
  say, avoids two agents taking the same task. It lost because each open floor session is recorded
  as responsible for the floor and Ward has no fact by which to prefer one; the pick-up is visible
  to the second the moment the first opens a session. The coordinator is never a target, though its
  window is linked into the floor's host: the target is chosen from session records by scope and
  floor, and the host is only asked where that session's own window is.
- **Typed, read back, then submitted — not sent.** `tmux send-keys TEXT Enter` is one call and is
  what every script that drives a terminal agent does. Measurement ruled it out (_What was
  measured_): at a permission question Enter answers Yes, and at the trust question it answers "No,
  exit". Pasting through a tmux buffer has the same Enter. A channel native to the harness would
  avoid the screen altogether and is the better end state, but it differs per harness and none is
  set up in the sessions Ward launches today; it is the technique to try next beside this one
  (design rule 4). The cost of the choice made is a reader of one harness's screen layout, which a
  harness release can break. It breaks closed: an unrecognized screen is not typed into.
- **The reader belongs to the harness adapter; the host is handed it.** tmux could have matched
  Claude Code's rules itself in fewer lines. It lost because `src/host/tmux.ts` is the one file that
  speaks tmux and must not learn a harness, and a second host would need the same reader. The host
  knows only that it must see the line it typed, alone, before it submits.
- **The line is a pointer.** Typing the brief's first lines, or an instruction ("start on this"),
  would save the receiver a read. It lost on trust: the receiving agent cannot tell a line Ward
  typed from one typed by anything else with access to the window, so the line must be safe to obey
  as written, and the only instruction that is safe from an unauthenticated source is "read the
  record". The record says who sent it and what they asked.
- **The format level does not move.** A new record type is the case 0066's pin stops for, and the
  question it asks is whether a Ward one level back, meeting the record, would do the wrong thing.
  Tried, with the build before this entry in a workspace holding hand-offs: `status` and `task show`
  read the tasks correctly, `task pr` rewrote a task record and `task close` closed one with
  `dispatch.md` left in place both times, and `doctor` raised nothing. What it cannot do is show the
  hand-off. Raising the level would lock every such Ward out of the whole workspace to prevent an
  omission that costs it one line of status, so the pin was rewritten at level 1. The cost: on a
  machine with an older Ward, a floor sees a new task with a brief and not who handed it over.
- **Told at the door on stderr, and taught in the manifest.** A field in the session document was
  the structured alternative. It lost because the document is the session's record and a hand-off
  count is not part of it, and because that document is emitted from several places in the launch
  path, each of which would have to carry it. stderr reaches a human and an agent alike and leaves
  stdout one document.
- **One list in `status --json`, not one per floor.** Nesting `incoming` and `outgoing` under each
  floor mirrors the human rendering. It lost because each hand-off would then appear twice in one
  document and a hand-off with no sending floor would need a third place.

### Why typing is acceptable

Typing into another session's window is new ground: until now Ward started runs and ended windows,
and only a human at an attached terminal put keys into one. Four properties make it acceptable, and
the build holds each mechanically rather than by convention.

1. **It is not the delivery.** The hand-off is committed before a key is typed. Removing the nudge
   changes when a floor notices, never whether the work reached it.
2. **It cannot answer a question.** The submitting key is sent only after the screen has been read
   and shows the run's input line holding exactly the line Ward typed. A run at a permission
   question, a trust question, a picker, or still starting shows no such line and receives nothing.
3. **It does not take over a line someone is writing.** Text typed into a line that already held
   words is taken back, character for character, and the line is read again to confirm it holds what
   it held.
4. **What it says carries no authority.** The line names a task and a read verb. An agent that obeys
   it has run `ward task show`.

What it does cost the receiving session is one message it did not ask for, mid-turn or idle. That is
the point of a notice, and it is why only a session recorded as responsible for the floor is sent
one.

A residue remains and is stated rather than engineered away: between the read that confirms the line
and the Enter that follows it, a few milliseconds pass, and a question that appears in that gap
would be answered. The gap is two tmux calls wide.

### Layout

`src/workspace/dispatch.ts` owns the hand-off as a record: the write, the sender, the derivation of
where one stands, and the filter. It sits with the work spine because a hand-off is a fact about a
task, and it imports nothing from the agent or host layers. The windowed listing lives in
`src/workspace/status.ts` beside the settled-work window it applies.

`src/agent/nudge.ts` is the Ward-shaped half of the live delivery, in the place
[0031](../0031-detached-session-hosting/README.md) gave such things: it reads records to decide who
is typed to and composes the line, and asks the host to type. `src/host/host.ts` states the
capability in host terms (`typeLine`), `src/host/tmux.ts` is still the only file that speaks tmux,
and `src/harness/claude.ts` is the only file that knows what Claude Code's screen looks like.

The CLI calls the record first and the nudge second, and catches everything the nudge can throw.

### Mechanisms

- **`typeLine`, in order.** Refuse a line that is not one to two hundred characters of printable
  ASCII. Read the window's `@ward_session` and `@ward_pane`; a tag that is not the session's
  withholds. Read the pane: it must be in that window, alive, and not in a mode (a pane in copy mode
  reads keys as scrolling commands). Capture the screen and ask the reader for the input line; none
  withholds, and nothing has been typed. Type the line with `send-keys -l --`. Poll the screen for
  up to two seconds until the input line, compared without whitespace so a wrapped line matches,
  equals the line typed. If it does, send Enter, then poll until the line is no longer there. If it
  instead ends with the line typed, someone's words were there first: send that many backspaces and
  confirm the line reads as it did. Anything else is `unknown`, with what may have been left behind.
- **The screen is captured as UTF-8** (`tmux -u`) whatever locale Ward runs in: the marks an input
  line is known by are not ASCII.
- **`claudeInputLine`.** The rows between the last two full-width rules on the screen, when the
  first opens with `❯`, any further rows are indented continuations with no gap, at most six
  non-empty rows follow the lower rule, and none of those carries `❯`. An empty line returns
  whatever placeholder or suggestion Claude Code shows in it, which is why emptiness is established
  by typing and reading back, never by reading alone.
- **Sender resolution.** `WARD_AGENT` names a session or it does not; `findSession` decides. A
  floor's own session gives its `floor`; a task session gives the floor its task directory stands
  under; a workspace-scope session gives none.

### What was measured

Against Claude Code 2.1.325 in tmux 3.7c on macOS, on a private server, in throwaway runs started
for the purpose.

| The run was                      | Keys sent                    | What happened                                                                                   |
| -------------------------------- | ---------------------------- | ----------------------------------------------------------------------------------------------- |
| idle at its input line           | the line, then Enter         | shown on the input line, then submitted as a message and answered                               |
| mid-turn, streaming a long reply | the line, then Enter         | shown on the input line while the reply streamed; Enter queued it; answered when the turn ended |
| at a permission question         | a line with digits, no Enter | nothing changed, including the option the digits name                                           |
| at a permission question         | Enter alone                  | answered Yes; the file was written                                                              |
| at the trust question            | none                         | the option Enter would take is "No, exit"                                                       |
| holding a half-typed line        | the line                     | appended at the cursor; that many backspaces left the half-typed line exactly                   |

Then the built verb, six hand-offs to a floor whose session was the real harness: withheld at the
trust question, with the run left alive; typed at an idle line, after which the agent's first act
was `ward task show` on the task named; withheld over a half-typed line, which read back as it had
been; typed mid-turn and queued; withheld at a permission question, with the permission not granted;
typed again once the question was dismissed.

Verified against stand-in runs on a real tmux only: that the coordinator and another floor's session
receive no key; the copy-mode refusal; a run that has exited; and repeatability on Ubuntu. Not
verified: any other Claude Code version, the real harness on Linux, and pi, which has no reader and
is never typed to.
