# 0083 — Reflection coverage across floors

> A closed task covered by one floor's reflection stays covered wherever it is moved. Each floor's
> reckoning of what is left to reflect on reads coverage from every floor's reflections, and a task
> moved off a floor has its directory rewritten in the reflections that cover it.
>
> **Status:** built — awaiting review · **Started:** 2026-11-22

[0069](../0069-floor-reflection/README.md) made a floor's reflection cursor the set of closed-task
directories named by that floor's reflection records on the main line. That is sound while a task
never leaves its floor. [0082](../0082-task-move/README.md) moves tasks, closed ones included: the
first use is re-homing closed tasks from the ground floor to the floor they belong to. A closed task
the old floor already reflected on would, on arrival, read as unreflected on the new floor (the new
floor's reflections never named it) and be offered to that floor's next reflection a second time.
And if the old floor's reflection kept naming the task by its old directory, it would cover nothing.

## Serves intent

- [`reflection-and-evolution`](../../intent/01-concepts/04-reflection-and-evolution.md), _Why it
  stays cheap_: reflection processes only what is new since it last ran, and the workspace records
  where each reflection reached. A task reflected on once is not read again because it moved; the
  slice does not yet say coverage belongs to the task rather than the floor
  ([IF-001](intent-feedback.md#if-001--a-tasks-reflection-coverage-travels-with-it)).
- [`principles`](../../intent/00-foundation/01-principles.md): **§16**, the cursor is still derived
  from the records alone, with no second copy of it.

## Scope

- **In:**
  - `readCursor` (`src/workspace/reflection.ts`) takes the covered set from every floor's
    reflections in the tree it reads (the workspace, or a stewardship copy). The floor's own
    reflections still give its last reflection and the sessions it settled. The vehicle's own record
    is still read past.
  - A task move rewrites `tasks[].dir` in every reflection, on any floor, that names the moved
    task's directory. A floor's rename or renumber (0080, 0081) now does the same across every
    floor's reflections, so a task moved earlier stays covered when its new floor is renamed.
  - The reflection's own `floor` is never changed by a task move: the record is that floor's
    reflection, and it reflected on the task where it stood.
  - A closed task cannot be moved while its floor's reflection is open (0082's refusal): the
    reflection's window is a copy of the record cut before the move, and recording it would name the
    task by its old directory.
- **Deferred:**
  - _Moving an open reflection's window._ Refused rather than followed. Safe because the refusal
    names the remedy (land or close the reflection first), and either way nothing is lost.
  - _A cheaper reckoning for `ward status`._ Each floor's count now reads every floor's reflection
    directory. Safe to defer because reflections are few (one per floor per reflection run) and the
    reads are directory listings of small records; a shared covered set can be passed in when a
    floor count shows in a profile.
- **Acceptance:** in `test/workspace/task-move.test.ts`: a floor with one closed task its reflection
  covers and one it does not; both moved to another floor. The reflection names the covered one by
  its new directory and keeps its own floor; the old floor has nothing left to reflect on; the new
  floor is offered the uncovered one only, in its count and in its packet. 0081's renumber case
  still passes with the reflection rewritten (`test/workspace/floor-renumber.test.ts`).

## Design

- **Decisions:** no ADR. Entry-local choices:
  - **Coverage is read across floors, and the directory is rewritten.** Either alone would do part:
    rewriting the old floor's reflection to the new directory, with coverage still read per floor,
    leaves the task unreflected on the new floor; reading across floors without the rewrite finds
    nothing at the new directory. Together, a covered task stays covered wherever it stands. The
    alternative was to copy the coverage into the new floor's reflections, which would write a
    record saying a reflection covered something it did not read.
  - **A reflection is not moved with a task.** It stays on the floor that wrote it, saying what that
    floor learned; only the directory it names a task by follows the task.
- **Layout:** `readCursor` in `src/workspace/reflection.ts`; the rewrites in
  `src/workspace/task-move.ts` (`rehome`) and `src/workspace/floor-move.ts` (`moveRecords`).
- **Mechanisms:** `readCursor(tree, projectDir, except)` lists every project directory in the tree
  and unions their reflections' `tasks[].dir`, leaving out the record at `except`.
