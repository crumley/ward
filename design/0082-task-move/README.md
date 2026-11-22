# 0082 — Moving a task to another floor

> `ward task move ADDRESS --to FLOOR` re-places a task's record directory under another floor. An
> open task moves alone, with everything it holds, and takes the next room there; closed tasks are
> re-homed in batches, records only, keeping their rooms where they can. One journal commit, then
> the disk half, which every other machine finishes at its next upgrade.
>
> **Status:** built — awaiting review · **Started:** 2026-11-22

A task's floor is fixed when it opens, and the floor is sometimes wrong: a task opened on the ground
floor because no floor claimed its repository, or one that a reorganization of floors leaves on the
floor it no longer belongs to. The only way to change it was to close the task as abandoned and open
it again elsewhere. That misstates the outcome on a terminal record, splits one piece of work across
two tasks, and leaves the first task's brief, sessions and worktrees behind. Closed tasks have no
way at all: a closed task left on the ground floor is never seen by the reflection of the floor it
belongs to ([0069](../0069-floor-reflection/README.md)), which reads only its own floor's tasks.

[0080](../0080-floor-rename/README.md) and [0081](../0081-floor-renumber/README.md) built the same
work for a whole floor: one commit for the record, the checkouts, outside links and views moved by
idempotent steps that convergence repeats, refusals while anything would move out from under work in
flight. This entry is that work for one task, reusing the disk half as it stands. What is new is
what a single task carries that a floor does not change: its room, which is allocated per floor, so
an open task moving changes its address; the hand-off that sent it to a floor it no longer stands
on; and the floor sessions of the floor it leaves, which may be working it.

## Serves intent

- [`domain-model`](../../intent/01-concepts/00-domain-model.md), Identity: a room is a slot on a
  floor and the floor number composes into its address. A task moved to another floor takes a slot
  there, so its address changes; the slice does not yet say a task's address can change while it is
  open ([IF-002](intent-feedback.md#if-002--an-open-tasks-address-changes-when-it-moves)).
- [`work-lifecycle`](../../intent/01-concepts/03-work-lifecycle.md): a task moved keeps its state,
  its outcome, its PR set and its history, and is still one task; the slice does not yet say the
  floor a task belongs to can change
  ([IF-001](intent-feedback.md#if-001--a-tasks-floor-can-change)).
- [`workspace-lifecycle`](../../intent/01-concepts/06-workspace-lifecycle.md): the move is one
  journal commit, and each machine's disk converges to it through the steps `ward workspace upgrade`
  already runs.
- [`principles`](../../intent/00-foundation/01-principles.md): **§16**, no live key is left saying
  the task stands where it does not (its record, its sessions' room code, its worktree paths, the
  reflections that cover it); **§6**, the disk half is check-then-do, and asking again changes
  nothing; **§20**, every refusal says what clears it, all of them at once.

## Scope

- **In:**
  - The verb `ward task move ADDRESS... --to FLOOR [--slug TEXT --from FLOOR] [--json]`, its report
    and its `ward schema` shape. `--to` and `--from` take a number or a slug
    ([0088](../0088-floor-by-slug/README.md)).
  - **An open task**, alone: its record directory moves (`git mv`, so the journal reads a rename),
    with its brief, hand-off record, sessions and worktree records inside it. It takes the next room
    in the target floor's sequence (`allocateRoom`, shared with `task open`). The task record's
    `code`, `floor` and opening line, its sessions' `task`, and each workspace worktree record's
    `path` are rewritten. Its checkouts move to their new placements and an outside worktree's link
    moves to its new placement.
  - **Closed tasks**, any number in one commit, records only: each keeps its room unless a
    `t<room>-<slug>` directory already stands on the target, and then takes the next room there.
    Their worktree records keep the paths they had (history; nothing stands there).
  - **Naming a closed task.** An address resolves as a read verb's does: an open task in the room
    first, then a closed one. A closed task answers to its room address while that names it alone,
    and always to its slug-qualified address (`f0t33-old-work`, design
    [0058](../0058-room-collisions/README.md)). `--slug TEXT --from FLOOR` adds every closed task on
    that floor whose slug contains `TEXT`; Ward's stewardship tasks are never chosen by it.
  - **Reflections** of every floor that cover a moved task are rewritten to its directory now, and
    each floor's coverage is read from every floor's reflections
    ([0083](../0083-reflection-coverage-across-floors/README.md)).
  - **Hand-offs.** The record's `to` keeps saying where the task was sent.
    `ward task dispatches
    --to FLOOR` reads the floor the task stands on now; the JSON carries
    that floor as `floor`, and the listing says `now on floor N`, when it differs from `to`. Pick-up
    survives the move (see _Decisions_).
  - **Floor sessions working the task** (design [0078](../0078-task-named-windows/README.md)): one
    whose run is not live is set down with a `task-cleared` event in the move's commit, and the
    report names it with the command that carries it along (`ward session move`). One whose run is
    live refuses the move.
  - The refusals, all reported together, nothing written (see _Decisions_ for each gate).
  - The disk half: `placeTaskWorktrees` (the loop 0080's `settleFloor` ran, now shared), and a sweep
    of links onto outside worktrees left in a view their task no longer stands in. The sweep joins
    convergence's `outside worktree links` step, and doctor names what it would remove
    (`outside worktree links`, info).
  - A renumber now rewrites `to` on every hand-off sent to the floor, not only those of tasks still
    on it, so the floor a moved task was sent to stays findable by its number.
  - A bullet in the root `AGENTS.md` template, naming the two-step recipe for moving a task together
    with the floor session working it; `ward session move`'s refusal of a task session names
    `ward task move`.
- **Deferred:**
  - _Moving a task together with its floor session in one verb._ The move sets the session down and
    names `ward session move ID --floor N --task ADDRESS`, which carries the conversation as a
    continuation ([0084](../0084-session-move/README.md)). Safe to defer because the two verbs
    compose with nothing in between that could go wrong, and a session cannot move itself in any
    case, so a combined verb would still be run from outside the session.
  - _Mixed batches._ An open task moves on its own; asked together with others, the call is refused.
    Safe because the open move has gates and a disk half the closed re-homing has not, and a refusal
    that names the open one leaves the closed ones to be asked again.
  - _Legacy bare tasks._ Refused: `tasks/` is read and never written
    ([0041](../0041-ground-floor/README.md)). Safe because a legacy task is still readable where it
    stands, and nothing new is ever opened there.
  - _Ward's stewardship tasks._ Refused: an upgrade or reflection vehicle stands on the ground floor
    by rule, and its branch name carries its address.
  - _The room a moved open task leaves._ It returns to its floor's sequence. When the task was the
    floor's most recently opened, the cursor falls back to the one before it, and the next task
    opened there can be given the room straight away, so the old address names a new task. The
    intent allows it (a room is a slot that empties and refills, and time disambiguates), and the
    old address is quoted only in the brief, the hand-off and the trail, which say when. Keeping the
    cursor ahead would need the floor to remember a room it handed out to a task no longer on it,
    which is a new record field, and an older Ward rewriting the record would drop it; the workspace
    format would have to move for it. Safe to defer because nothing resolves those quotations as
    live keys, and a floor that wants it can be given a recorded cursor later without changing this
    verb.
  - _Hosted runs on another machine._ As for a floor's move (0080, _Deferred_): the live checks read
    this machine's host.
- **Acceptance:** each check is a case in `test/workspace/task-move.test.ts` unless noted.
  1. An open task handed over and pending, with a committed checkout and an outside worktree, moves
     to a floor whose room 1 is held: one commit, read by git as a rename, nothing left uncommitted.
     It is `f3t2`, `f1t1` names nothing, the record's code, floor and opening line are rewritten,
     the brief's `for` and the hand-off's `task` and `to` are as written, the hand-off is pending
     under `--to 3` and absent under `--to 1`, the checkout stands at its new placement with the
     same tip, the outside link stands at the new placement and is gone from the old. Asked again at
     `f3t2`, nothing is written.
  2. A hand-off picked up by the floor session working the task, which also has a session of its
     own: the move sets the floor session down (`task-cleared`) and names the command that carries
     it along; the task session's room code is rewritten and its id kept; the hand-off reads picked
     up by the same session at the same time, and still does after the floor it was sent to is
     renumbered.
  3. Each refusal writes nothing: a dirty checkout, an open session working inside it, the caller
     being the task's own session, a live floor session working it, a closed floor as the target, a
     legacy task, a stewardship task, an open task asked with a closed one, a closed task whose
     floor's reflection is open, `--slug` without `--from`, an address no task holds.
  4. Closed tasks named by a slug-qualified address and chosen by `--slug --from` move in one
     commit; two keep their rooms, one whose `t<room>-<slug>` already stands on the target takes the
     next room, and its closed session's room code follows. Asked again, nothing is written.
  5. A machine whose checkout and link still stand as before converges on upgrade with nothing
     committed; doctor names both before and neither after. Asking the move again at its new address
     finishes it the same way.
  6. `ward task move f1t1 --to gamma --json` matches its schema; the human lines for a closed and an
     open move; a refusal leaves stdout empty and exits non-zero.
  7. The reflection cursor on both floors: 0083's acceptance.
  8. The verb is in `test/cli/format-guard.test.ts`, the `AGENTS.md` lineage is re-pinned, and
     `mise run check` passes.

## Design

- **Decisions:** no ADR. Entry-local choices:
  - **A directory move, not a new task.** The alternative is the existing route — close one task,
    open another — with a link between the two. It lost because the task is one piece of work, and
    every reader (status, the reflection packet, `task show`) would have to follow the link to see
    it whole. The record directory is the task's containment, and containment is what says its floor
    (design [0036](../0036-floor-addressed-tasks/README.md)), so moving the directory changes the
    floor and nothing else.
  - **An open task takes the next room; a closed one keeps its own.** An open task arriving on a
    floor is in flight there, and a room in flight is allocated by the floor's sequence like any
    other, so the floor's open rooms stay its own sequence's. A closed task's room is only a name
    for history: keeping it keeps the `t33` half of every quotation of `f0t33`, and a closed task
    never occupies a slot. The directory, not the room, is what two tasks cannot share, so a room is
    kept whenever no `t<room>-<slug>` already stands there; a room shared with another task is the
    collision 0058 already speaks through the slug-qualified address.
  - **Gates for an open task, and why each:** a dirty checkout (evidence of unrecorded work, as for
    every move of a checkout); an open session recorded as working inside the record directory or a
    checkout (it would be resumed into a directory that is gone); a live hosted run of one of the
    task's sessions; a live floor session working the task; the caller being one of the task's
    sessions or a floor session working it ("a task is moved from outside it"); the target floor
    closed (`taskContainer`'s refusal); no free room on the target. The checkout gate asks
    `planRelocation` of the task as it will stand, exactly as 0080's does, so it refuses exactly
    what placement would.
  - **A floor session working the task: refused while live, set down otherwise.** The default was a
    gate. A floor session whose run is live has an agent working the task, and very likely a shell
    standing in the checkout about to move; it is refused, naming the clear and the follow-up. One
    whose run is not going is set down in the move's commit: left naming the task, it would read as
    working nothing anyway (`workingTaskOf` asks the session's own floor), but its trail would not
    say when it stopped. The report names it, with `ward session move` to carry it along.
  - **The hand-off's `to` stays; the filter reads the task's floor.** `to` is what the sender wrote;
    the floor that has the work to do is the one the task stands on, and that is what `--to FLOOR`
    asks. Rewriting `to` would erase where the work was sent. A renumber still rewrites `to` as a
    number (0081): the number changed, not the floor.
  - **Pick-up across a room and a floor change.** A pick-up is the first session opened on the task
    (those move with it) or the first floor session to name it (0078), matched by room and slug
    within one floor's sessions (0081). After a move the task's room and floor are new, and a floor
    session that named it on the floor it was sent to used the old room. So pick-up reads two sets:
    the task's own sessions with its current floor's, against its address now; and the sessions of
    the floor the hand-off went to (`to`), against the address it was sent with (the hand-off's
    `task`, qualified by the slug). The earlier wins. The alternative, recording the pick-up when
    the task moves, stores a derived state 0067 deliberately never stores. Its cost: a task moved
    twice, and picked up only by a floor session on the middle floor, reads as pending.
  - **Quotations stay.** The brief's `for`, the hand-off's `task`, earlier `task-named` events and
    closed sessions' working directories say what was said at the time, and nothing resolves them as
    live keys. The task session's `task` is rewritten: it is the room code a session record is read
    against.
  - **A stray outside link is swept by convergence, not by the move alone.** The link the moving
    machine left is removed at once; another machine's is removed by the `outside worktree links`
    step, which now also removes a link in an open floor's view onto an outside worktree an open
    task records, standing where no open task places it. Only such links are touched: anything else
    in a view is not provably Ward's.
  - **No workspace format raise.** No record gains a field or a value. An older Ward reads every
    rewritten record correctly. It filters `--to` by the record's `to`, reads a hand-off picked up
    on the floor it was sent to as pending, and reckons reflection coverage per floor, so a moved
    task its old floor reflected on reads as unreflected on its new floor; each settles when this
    Ward runs. It does not sweep a stray outside link, which doctor names.
- **Layout:** the verb is `src/workspace/task-move.ts`: selection, the refusals, the record half
  (`rehome`), and the disk half (`settleTask`), which reuses `placeTaskWorktrees` and
  `strayOutsideLinks` from `src/workspace/floor-move.ts`. The room is `allocateRoom` in
  `src/workspace/tasks.ts`, now the one allocator `task open`, `task dispatch` and the move share.
  The hand-off reading is `dispatchOf` in `src/workspace/dispatch.ts`.
- **Mechanisms:**
  - _Selection:_ each address resolved open-first, the `--slug` filter's closed tasks added,
    duplicates folded; refused before anything else when the kinds mix or one is legacy or
    stewardship.
  - _An open task:_ room allocated, refusals gathered, then `rehome` (directory, task record,
    session codes, worktree paths, reflections), the floor sessions' `task-cleared`, one
    `commitRecords`, then `settleTask` (the target's view, the sweep, `placeTaskWorktrees`), then
    the host names refreshed after the lock, as a floor's move does.
  - _Closed tasks:_ each floor's open reflection asked once; then `rehome` per task in the order
    asked, so a later task sees an earlier one's directory, and one commit.
  - _Report:_ `--json` is
    `{ floor, slug, outcome, tasks[], records, cleared, worktrees, unlinked,
    hosts?, next }`;
    each task carries `from` and `to` (address and directory) and whether its room was kept.

## Overlapping work

Floor attending (0089, task f7t63, PR #174) touches the root `AGENTS.md` template and the lineage
pin, as this entry does; whichever lands second re-pins.
