# 0089 — The floor's attending: one general session per floor, always window 1

> Every floor has one general session, its **attending**, derived from the record and never stored.
> It stands first in the floor's host however things were opened or resumed, `wsa N` joins it
> without asking, and a hand-off's notice is typed to it. The coordinator is the ground floor's
> attending.
>
> **Status:** built — awaiting review · **Started:** 2026-11-22

A floor host holds the windows of the floor's sessions
([0031](../0031-detached-session-hosting/README.md)). Since
[0078](../0078-task-named-windows/README.md) a floor session can name a task, and its window then
reads as that task. Since [0079](../0079-wsa-floor-first-window/README.md) `wsa N` joins whichever
of the floor's sessions stands first. Since [0086](../0086-coordinator-stays-home/README.md) the
coordinator stays in the ground floor's host and windows stand in the order they were placed. What
none of them gives is a fixed point: the one session a floor is run from. A floor whose first-opened
session went on to name a task has no window that reads as the floor's own, `wsa N` lands on
whatever happens to stand first, and a hand-off's notice ([0067](../0067-floor-dispatch/README.md))
is typed into every floor session, task windows included.

This entry names that fixed point. A floor's **attending** is its one general session: a floor
session that has never named a task. It is always the first window of the floor's host, `wsa N`
always lands on it, and the floor's hand-offs go to it. Task-named sessions are other windows beside
it. There is no separate attending on the ground floor: the coordinator is the ground floor's
attending, the first window of the floor-0 host, and `wsa 0` lands where bare `wsa` does.

The word is intent's. [`scopes-and-personas`](../../intent/01-concepts/01-scopes-and-personas.md)
names the persona at project scope the **attending physician**, who owns the project's outcome; a
floor is a project, and this session is the one that answers for the floor. The **resident** is the
task-scope persona one level down, which is what a session working one task is. The attending's job
overlaps the **charge nurse**'s, which tracks status across the floor's work and dispatches it: an
attending can do that work itself, or hand it to a charge nurse it starts. Whether a floor runs a
charge nurse is a cost choice, not a requirement, and nothing in this design needs one.

**0079 is superseded.** `wsa N`'s "first window" reading and the floor feed's window-index order are
replaced here; the window index it put on `FoundGroup` stays. **0067 is superseded in part:** the
notice goes to the floor's attending, not to each of its sessions. **0078 is superseded in part:**
the attending never names a task.

## Serves intent

- [`session-multiplexer`](../../intent/02-subsystems/01-session-multiplexer.md): a floor's sessions
  are grouped in its host, and the session responsible for the floor is where the host begins, so a
  human landing in it lands on the floor's own conversation.
- [`human-shell`](../../intent/02-subsystems/07-human-shell.md): `wsa N` fills in the one noun a
  human means by "floor N" rather than asking; with nothing to join, it makes it.
- [`messaging-coordination`](../../intent/02-subsystems/02-messaging-coordination.md): a hand-off is
  delivered to the session responsible for the floor it was handed to, and to no other.
- [`scopes-and-personas`](../../intent/01-concepts/01-scopes-and-personas.md): a floor-scope session
  answers for the floor's outcome, which is the attending's scope; keeping one such session general
  keeps its context for the floor rather than for one task. (Naming a session after a persona sits
  uneasily with the rule that a persona's name and role stay internal:
  [IF-001](intent-feedback.md).)
- [`principles`](../../intent/00-foundation/01-principles.md): **§6**, which session is the
  attending and where its window stands are deterministic from the records; **§16**, it is derived
  and stored nowhere.

## Scope

- **In:**
  - **The derivation** (`src/agent/placement.ts`). A floor session is _general_ while its trail has
    no `task-named` event. Floor N's attending (N above 0) is its earliest-opened open general
    session on the machine asked about; floor 0's is the earliest-opened open coordinator. Ties fall
    to the lower session number. A record from before machines were recorded counts on every
    machine.
  - **The refusal.** `ward session task ATTENDING ADDRESS` is refused, naming
    `ward session open --task ADDRESS` and `--new-task` as the way to give the task its own window.
    `--clear` on an attending writes nothing, as it does for any session naming nothing. Naming
    stays allowed on any other floor session.
  - **Window 1.** Placement asks for the attending's window first (`PlaceRequest.first`). The name
    refresh, run before every hosted placement and at every attach, moves an attending standing
    behind another window to the front (`SessionHost.lead`), by window id, leaving the others in
    their order. `resume --all` orders each floor's attending before its other sessions.
  - **`wsa N`.** The floor feed (`ward shell candidates coordinators --floor N`) answers the floor's
    attending on this machine alone, or nothing; `wsa N` joins it, or with none opens one detached
    and joins it, even when task sessions are open. It never picks. `wsa 0` reads floor 0's feed
    (the coordinator) and, with none, opens a workspace-scope session.
  - **Hand-offs.** `nudgeFloor` types to the target floor's attending on this machine; floor 0's is
    the coordinator.
  - **Reads.** `attending: true` on a session in `ward status --json`, `session show --json`, and
    each row of `session resume --all --json` (`attending`, always present there); `status` and
    `session show` say it in words. `ward doctor` notes (info) a floor whose host holds sessions but
    no attending.
  - **Reflection on the ground floor.** Floor 0's reflection packet reads workspace-scope sessions
    beside the floor-0 ones (see Mechanisms).
  - **The manifest.** The root `AGENTS.md` template says what an attending is, that it is window 1,
    what `wsa N` does, and where a hand-off's line goes; the outgoing default joins the lineage.
- **Deferred:**
  - _Further general sessions with the first one special._ A second `--floor N` session with no task
    opens beside the attending, is not the attending, and is named by today's rule (two general
    windows take their numbers, `alpha 2`, `alpha 3`). Safe to defer because nothing here assumes a
    floor has one general session: the attending is "the earliest", so a floor holding several
    already has its first one special, and a later entry can give the others a role without undoing
    this one.
  - _Moving an attending's window into its own floor's host._ A floor session another floor's
    session started is placed beside its parent ([0031](../0031-detached-session-hosting/README.md)
    placement); such an attending leads nothing there, and floor N's host then has none. Safe to
    defer because a floor session started from another floor is rare, the doctor note names the
    case, and placement stays a function of facts that never change over a session's life.
  - _Labelling the attending apart from a second general session._ Both read as the floor's slug,
    told apart by number. Safe to defer because the attending is always the first of them, and the
    label rule is 0061's to change.
- **Acceptance:**
  1. The derivation table: one, several, a tie, opened with a task, named then cleared, only task
     sessions, closed, another floor, floor 0 with a floor-0 session and a helper, per machine, a
     legacy record (`test/agent/attending.test.ts`); a moved session judged as new, onto a floor
     with an attending, onto one without, and with a task
     (`test/agent/attending-placement.test.ts`).
  2. The refusal, the attending read in `session show` and `status` (JSON and words), and a second
     general session becoming the attending when the first closes; every 0078 naming case runs on a
     second session (`test/cli/session-task.test.ts`).
  3. Placement order against a fake host: the attending opened first, opened late, the coordinator
     on floor 0; the refresh moving a late attending forward once and leaving a floor of task
     windows alone; `resume --all` ordering the attending first
     (`test/agent/attending-placement.test.ts`).
  4. On a real tmux: the `the-attending-leads` conformance scenario (placed first into a standing
     host and a new one, moved forward by id with the pane kept, an absent window, a server with
     `base-index 1` and `renumber-windows on`), recorded on 3.8 and played back from its transcript;
     and the live case run on a server with no configuration and on one configured that way, through
     the CLI: a task window first, the attending in front of it, a left-behind attending moved back
     by the next open, and `resume --all --go` after the server dies bringing it back first
     (`test/host/tmux-live.test.ts`).
  5. `wsa N` with an attending, with none (opened then joined), several lines never picked, and
     `wsa
     0` opening at workspace scope (`test/cli/shell.test.ts`); the floor feed with an
     attending beside task sessions, with only task sessions, with none, floor 0, and another
     machine's attending (`test/cli/shell-floor-attending.test.ts`).
  6. The hand-off notice's target: the attending alone, the next one once it closes, the coordinator
     on floor 0, none for a floor of task sessions or another machine's attending
     (`test/agent/nudge.test.ts`).
  7. Doctor's note (`test/agent/host-findings.test.ts`); floor 0's packet reading the coordinator's
     sessions (`test/cli/reflection.test.ts`).
  8. `mise run check` passes.

## Design

- **Decisions:** no ADR. Entry-local choices:
  - **The session is called the floor's attending.** A word of Ward's own for the slot ("home
    session", "the floor's lead") was the alternative: it would keep persona words for personas
    alone. It lost because intent already says who answers for a project's outcome, and calling the
    floor's standing session anything else would give one idea two names. "Resident", the persona
    word nearest in feel, names the task-scope persona and would tell a reader the opposite of what
    the session is. The cost: a persona's role word now also names a session in Ward's own output,
    which the persona leak rule has to allow for (IF-001). The coordinator keeps its own name; the
    rule is stated as "the coordinator is the ground floor's attending".
  - **Derived, never stored.** An `attending: true` field on the floor's record (or on a session)
    was the obvious alternative: one read, and a human could choose which session it is. It lost
    because it is a second source of truth beside the sessions it describes: an attending that
    closes leaves the field naming a closed session until something rewrites it, and two machines
    would each write their own. Derived, the answer follows the sessions as they open and close. The
    cost: which session is the attending cannot be chosen, only arranged by closing and opening.
  - **Once a task session, always a task session.** A floor session that names a task and later sets
    it down (or whose task closes) could have become general again. It stays a task session, because
    otherwise a task closing would change which session is the floor's attending, and with it which
    window must stand first, under a run that did nothing. The attending changes only when general
    sessions open and close. The cost: a floor session from before this entry that ever named a task
    can never be the attending; a fresh `--floor N` session takes the role.
  - **Per machine.** The brief's reading, "the floor's earliest-opened open general session", leaves
    a floor shared by two machines with one attending, whose window can only stand on one of them. A
    host is one machine's, so the other machine's floor host would have no window 1 and `wsa N`
    there would open a session that could never become the attending. So the derivation is asked per
    machine, the same filter the coordinator feed already applies. The cost: a floor has one
    attending per machine, and `status` read on one machine marks another machine's attending too,
    each in its own machine's terms.
  - **A moved session is a new record, and nothing passes on.** `ward session move`
    ([0084](../0084-session-move/README.md)) closes a session and opens its continuation on another
    floor, with a new `openedAt` and `continues` naming the old id. The continuation is judged like
    any session opened at that moment: on a floor with an earlier general session it is not the
    attending; on a floor with none it is; moved with a task it is a task session. A predecessor
    that was its floor's attending passes nothing on, neither to its continuation nor elsewhere: its
    floor's next general session, if any, is the attending from then. The alternative, carrying the
    predecessor's opening instant through `continues`, would let a conversation arriving from
    another floor displace the session a floor has been run from, and move that floor's window 1
    under it. The cost: moving a floor's attending to another floor and back makes it the latest
    general session there, not the first.
  - **The attending is refused a task, not demoted.** Letting `session task` on the attending
    succeed and making the next general session the attending was the alternative: no refusal to
    explain. It lost because it would move the attending's role, and its window's place, out from
    under the run that was being used as the floor's, and leave the floor with no general session at
    all when there was one. The refusal names the verb that gives the task its own window.
  - **How an attending takes up a hand-off.** 0078 let naming a task pick a hand-off up; the
    attending never names one. It picks a hand-off up the way 0067 first defined it: by opening a
    session on the task (`ward session open --task ADDRESS`, `--new-task`, or a task session).
    Nothing else counts. Counting the attending's own reading of the notice, or a subagent it starts
    without a record, would mark a hand-off picked up on evidence the record does not hold. The
    cost: an attending that works a handed-over task itself, without opening any session on it,
    leaves the hand-off reading pending; whether anything more should count is left open for review.
  - **Moved by tmux, never re-created.** The attending's window is put first with `new-window -b` on
    `{start}` when it is placed, and moved with `move-window -b` by window id when it stands behind
    another; the run, its pane, and every client looking at it stay. Re-creating the window first
    would restart a live run. The move's source is qualified by the host (`=host:@id`): measured on
    3.8, a bare `@id` of a window in a host with an attach view resolves through the view and tmux
    refuses with "sessions are grouped". The move is sent only for a window that is not already
    first: measured, a window moved before itself shifts the windows after it and leaves a gap.
  - **`first` read from the inventory, not asked again.** Whether the attending already leads is
    read from the pane listing the refresh already makes (the lowest `#{window_index}` per host, any
    window, a human's shell included), so a refresh that moves nothing costs no extra tmux call and
    no transcript that did not move a window changed.
  - **`wsa 0` is the coordinator's.** 0086 left `wsa 0` meaning floor 0's own floor session. Floor 0
    has no attending of its own here, so `wsa 0` reads floor 0's feed (the coordinator) and opens a
    workspace-scope session when none is open, which is where bare `wsa` lands. With several
    coordinators it joins the first rather than picking, as every `wsa N` does.
- **Layout:** the record side is `src/agent/placement.ts` (`isGeneralFloorSession`,
  `attendingFloorOf`, `attendingOf`, `isAttending`, `leadsHost`), pure over session listings, beside
  `isCoordinator`. The host seam (`src/host/host.ts`) gains `PlaceRequest.first`,
  `InventoryGroup.first`, and `lead(window, group)`; tmux implements them in `src/host/tmux.ts`
  (`createWindowArgv`'s `-b`, `leadArgv`, `firstWindows`). The refresh (`src/agent/naming.ts`)
  decides which windows to move; placement (`src/agent/host.ts`) decides `first`. The refusal is in
  `nameSessionTask` under the store lock.
- **Mechanisms:**
  - _Placement._ `placeLaunch` passes `first` when the launched session is its floor's attending and
    its placement floor is its own. A host minted by its attending is born with the placeholder
    first and the attending placed before it; clearing the placeholder leaves the attending alone.
  - _Refresh._ For each verified window of an open hosted session that leads its host, when the
    host's first window is another, `lead` is called before the renames; what moved is reported as
    `led` (`f7-1@mbp now leads main-f7-ward-development`), what failed joins `failed`. A refresh
    runs before every hosted placement and at every attach, so an older Ward's host, or an attending
    opened before 0089 behind its task windows, is put right the next time anything is placed in or
    attached through the workspace's hosts.
  - _Resume._ `planResumeAll` marks each row `attending`; within a floor the attending goes first,
    so the bulk resume mints each floor's host with it.
  - _Reflection on the ground floor._ Floor 0's packet read only `projects/0-workspace/sessions/`,
    the ground floor's own floor sessions, and its tasks' sessions. The coordinator, floor 0's
    attending, and the helpers it starts are recorded at workspace scope (`sessions/`), so a
    ground-floor reflection never saw the work its attending did. The packet now reads both when the
    floor is 0 (four lines in `readWindow`); the cursor's `settled` set and the record's session
    list treat them as any floor session. A coordinator's history can be long; the packet already
    gives each session's size, and the reflection reads a chunk at a time.
  - _Doctor._ For each open hosted session whose placement floor has no attending on its machine,
    one info finding per floor names the sessions and the `wsa N` that opens one.
  - _`wsa`._ The fish body changes: a floor number sets the floor feed; any floor but 0 also scopes
    the open to `--floor N`. Adopted copies read `changed` in `ward doctor` until re-adopted
    (`ward shell adopt fish wsa`).
