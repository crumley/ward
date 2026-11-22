# 0082 — Intent feedback

> Intent frictions found while building `Moving a task to another floor`.

This file is the entry's adjudication surface and is read on its own. An adjudication session loads
it without the entry's README, so each intent-feedback item carries enough context to be ruled on
directly.

The build: `ward task move ADDRESS --to FLOOR` re-places a task's record directory under another
floor. An open task moves alone, with its brief, hand-off record, sessions and worktrees, and takes
the next room in the target floor's sequence, so its address changes (`f1t1` becomes `f3t2`) and the
old one no longer names it. Closed tasks are re-homed in batches, records only, keeping their room
numbers where no task directory of that room and slug already stands on the target. The task's
state, outcome, PR set and history are unchanged; it is the same task.

## IF-001 — A task's floor can change

- **Slice:**
  [`intent/01-concepts/03-work-lifecycle.md`](../../intent/01-concepts/03-work-lifecycle.md) — _The
  task as the unit of trackable work_, and _Task states_.
- **Friction:** the slice describes a task's life as its states (`active ⇄ paused`,
  `active → closed`) and says nothing about where the task stands. Floors are reorganized: a task
  opened on the ground floor because no floor claimed its repository, or on a floor that later turns
  out to be the wrong one, belongs on another. Without a move, the only route was to close it as
  abandoned and open it again, which records a false outcome on a terminal record and splits one
  piece of work in two. The build lets a task's floor change, open or closed, without changing its
  state, outcome or history. Closed stays closed: a closed task's record moves, and nothing about
  its work changes.
- **Assumption made to keep moving:** the floor a task belongs to is an attribute that can change
  over its life, like its state. Moving is not a state transition and records no outcome. A closed
  task may be moved, records only.
- **Proposed revision:** at the end of _The task as the unit of trackable work_, add: "A task
  belongs to one floor at a time, and that floor **can change**: a task opened on the wrong floor,
  or left on one by a reorganization, is moved with its record, brief, sessions and worktrees, and
  stays the same task — its state, outcome and history move with it. A closed task can be moved too;
  closed stays closed. **Why:** closing and reopening to change floors would record an outcome the
  work did not have and split its history in two."
- **Status:** pending.

## IF-002 — An open task's address changes when it moves

- **Slice:** [`intent/01-concepts/00-domain-model.md`](../../intent/01-concepts/00-domain-model.md)
  — _Identity_: rooms carry the floor number plus a room code, room codes run as a per-floor
  sequence in opening order, and "a room may reuse its code precisely because it is a slot that
  empties and refills, not a record".
- **Friction:** the slice composes a task's address from its floor and its room, and says how rooms
  are allocated on a floor, but not what happens to an address when the task leaves the floor. A
  task moved while open takes a room on the new floor by that floor's sequence, so both halves of
  its address can change. The old address stops naming it, and its old room returns to the old
  floor's sequence: when the task was the floor's most recently opened, the next task opened there
  can be given that room at once. The slice's own reasoning covers that (a slot empties and refills,
  and time disambiguates), but it does not say that an open task's address is not permanent. A
  closed task, which occupies no slot, keeps its room number where it can.
- **Assumption made to keep moving:** an open task's address names where it is now. A move gives it
  a new one and leaves no alias; the old address in a brief, a hand-off or a trail is a quotation of
  where it stood at the time.
- **Proposed revision:** after the paragraph that ends "a session is a record, so its id is
  permanent", add: "A task's **address** is where it stands, not what it is: a task **moved** to
  another floor takes a room there, and its old address no longer names it — no alias, as for a
  renumbered floor. Its record, found by its slug, is what identifies it over time. A closed task
  occupies no slot, so a move keeps its room number where no other record of that room and slug
  stands."
- **Status:** pending.
