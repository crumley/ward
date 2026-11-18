# 0069 — Intent feedback

> Intent frictions found while building a floor's reflection.

This file is the entry's adjudication surface and is read on its own — an adjudication session loads
it without the entry's README, so each intent-feedback item carries enough context to be ruled on
directly.

What was built, in one paragraph: `ward reflection packet FLOOR` lists the closed tasks on a floor
that no reflection has covered, with their sessions and where each session's harness history stands
on the machine asked. `ward reflection open FLOOR` opens a ground-floor task and a worktree of the
workspace's own repository. An agent that is already running reads what the packet names and edits
the floor's `notes.md` in that worktree. `ward reflection record FLOOR FILE` writes a reflection
record there (what was covered, what could not be read, the agent's summary) and commits it with the
notes on the stewardship branch. The human lands it with `ward workspace merge`, or does not. The
cursor is the set of tasks named in the reflection records that have reached the main line.

## IF-001 — the products of reflection do not include what a floor has learned

- **Status:** pending
- **Slice:**
  [`intent/01-concepts/04-reflection-and-evolution.md`](../../intent/01-concepts/04-reflection-and-evolution.md),
  _What reflection produces_.
- **Friction:** the slice lists skills, tooling, personas, standards and Ward itself. The one
  product this build proposes is none of them by name: a floor's notes, the durable knowledge about
  working on that floor that every session there loads. It is the smallest thing a reflection can
  improve and the only one the workspace has a home for today; skills and personas have none yet.
- **Assumption made:** the notes are standards in their plainest form, "a lesson learned once raises
  the bar for future sessions", and a reflection may propose changes to them.
- **Proposed revision:** name the workspace's and a floor's own guidance among the products, or say
  in the standards bullet that the guidance a session loads is where a standard is written down.

## IF-002 — nothing says what may enter the record from a session's history

- **Status:** pending
- **Slice:** [`intent/00-foundation/01-principles.md`](../../intent/00-foundation/01-principles.md)
  §4, and
  [`intent/01-concepts/04-reflection-and-evolution.md`](../../intent/01-concepts/04-reflection-and-evolution.md).
- **Friction:** §4 guards one boundary, local to remote. Reflection crosses a different one. A
  harness history is one machine's, holds everything said in a session, and is deleted by its
  harness after some weeks. The workspace record is committed, travels to every clone, and is pushed
  to the workspace's remote as backup. Distilling the first into the second is the point of
  reflection, and intent does not say what the distillate may contain.
- **Assumption made:** the reflection record holds identifiers and standings Ward wrote, plus the
  agent's summary. Ward writes no history path and copies no history text into it. The agent is told
  to quote no transcript, and a summary over 32 KiB is refused, since Ward cannot judge a summary's
  content and can bound its size. The notes are under the same rule with no mechanical check; the
  merge preview is where a human reads them.
- **Proposed revision:** state in the reflection slice that a reflection's output is distilled
  statement and never history text, and that the record keeps which histories were read rather than
  where they are; and say in §4 whether the workspace's own remote counts as inside the boundary.

## IF-003 — "where each reflection last reached" assumes the record has one timeline

- **Status:** pending
- **Slice:**
  [`intent/01-concepts/04-reflection-and-evolution.md`](../../intent/01-concepts/04-reflection-and-evolution.md),
  _Why it stays cheap_; the glossary's _Reflection cursor_.
- **Friction:** the slice describes a point the reflection reached and leaves the cursor's form to
  the build. A workspace shared between machines has no single point. A task closed on one machine
  can reach another after a reflection there recorded a later time, and a cursor that is a point
  would skip it for good.
- **Assumption made:** the cursor is a set. Each reflection record names the tasks it covered, and
  what is unreflected is every closed task no record names. The records carry timestamps as
  information only.
- **Proposed revision:** say that the workspace records _what_ each reflection covered, so the next
  run is offered the rest, and keep "where it reached" as the single-machine reading of the same
  thing.

## IF-004 — a reflection runs on one machine and most histories are on another

- **Status:** pending
- **Slice:**
  [`intent/01-concepts/04-reflection-and-evolution.md`](../../intent/01-concepts/04-reflection-and-evolution.md)
  and
  [`intent/01-concepts/02-sessions-and-lifecycle.md`](../../intent/01-concepts/02-sessions-and-lifecycle.md).
- **Friction:** a session's history is bound to the machine it ran on and to its harness's
  retention. The reflection slice says reflection reads the work since the last one and does not say
  what a reflection does about the part it cannot read from where it runs. On a floor worked from
  three machines that part is the majority.
- **Assumption made:** a reflection covers a task whether or not its histories were readable. The
  record says, per session, whether a history was found, gone, on another machine, or had no handle,
  so a later reader knows what the reflection rested on. Leaving such a task uncovered until some
  machine can read it would mean a floor's reflection never completes, while the histories it waits
  for expire.
- **Proposed revision:** state that a reflection proceeds on what is readable where it runs, must
  record what it could not read, and that unreadable history does not hold work back from being
  covered. This is the one assumption here that loses something if it is wrong: a history on another
  machine that nobody reflects on there is never read.

## IF-005 — the reflection record is a record, and it must not be journaled

- **Status:** pending
- **Slice:**
  [`intent/01-concepts/06-workspace-lifecycle.md`](../../intent/01-concepts/06-workspace-lifecycle.md),
  _The workspace's own main line: journal and stewardship_; and
  [`intent/02-subsystems/00-metadata-store.md`](../../intent/02-subsystems/00-metadata-store.md),
  which lists reflection proposals and cursors among Ward's records.
- **Friction:** the slice sorts writes to the main line into two kinds. Records are the journal:
  they land directly, because each writes down an act already taken. Stewardship is change to what
  the workspace is, and lands by merge. The reflection record and the cursor are records by the
  metadata store's list, and if they were journaled, a reflection the human declined would still
  have advanced the cursor. The upgrade already writes the version stamp and the baselines on a
  stewardship branch for the same reason, and the slice says so only for that case ("the installed
  baseline must move with the artifact it fingerprints").
- **Assumption made:** a record that states the outcome of a stewardship act is written on that
  act's branch, by a verb run at the enclosing workspace, and lands with the merge. The journal
  still never writes in a stewardship copy: the commit there is stewardship work.
- **Proposed revision:** generalize the sentence about baselines: a record whose truth depends on a
  stewardship change being adopted travels with that change and is never journaled ahead of it.

## IF-006 — the reflection's work is in the standing project, and its record is with the floor

- **Status:** pending
- **Slice:**
  [`intent/01-concepts/06-workspace-lifecycle.md`](../../intent/01-concepts/06-workspace-lifecycle.md),
  _The standing workspace project_ ("It concentrates the workspace's own history in one place").
- **Friction:** the slice has every reflection adopted answered by the standing project's record.
  The task that carries a reflection is there. The reflection record is kept beside the floor it
  describes, because its first reader is that floor's next reflection and the question it answers is
  about the floor.
- **Assumption made:** the standing project answers "what has been done to this workspace" through
  its tasks, each reflection record names the task that carried it, and the record itself may live
  with the floor.
- **Proposed revision:** say that the standing project holds the stewardship _work_, and that what a
  stewardship act writes down about a floor may be kept with that floor.
