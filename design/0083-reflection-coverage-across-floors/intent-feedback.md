# 0083 — Intent feedback

> Intent frictions found while building `Reflection coverage across floors`.

This file is the entry's adjudication surface and is read on its own. An adjudication session loads
it without the entry's README, so each intent-feedback item carries enough context to be ruled on
directly.

The build: a floor's reflection records which closed tasks it covered, by each task's record
directory, and a floor's "closed since the last reflection" is every closed task on it that no
reflection covers. Tasks can now move between floors, closed ones included. Coverage is read from
every floor's reflections, and a moved task's directory is rewritten in the reflections that name
it, so a task one floor reflected on is not offered to another floor's reflection after it moves.

## IF-001 — A task's reflection coverage travels with it

- **Slice:**
  [`intent/01-concepts/04-reflection-and-evolution.md`](../../intent/01-concepts/04-reflection-and-evolution.md)
  — _Why it stays cheap_: "Reflection processes only what is new since it last ran for a given goal;
  the workspace records where each reflection last reached, so the next run knows its interval."
- **Friction:** the slice ties the cursor to a reflection's goal, and a floor's reflection reads
  that floor's work. It assumes the work stays on the floor it was done on. A task moved to another
  floor after its first floor reflected on it is not "new since" for the second floor, yet a
  per-floor cursor would offer it there again; a task moved before any reflection is new to the
  floor it now stands on. The slice does not say which floor's reflection a moved task's work
  belongs to.
- **Assumption made to keep moving:** a task's work is reflected on once. Coverage belongs to the
  task: a task some floor's reflection covered stays covered wherever it moves, and one no
  reflection covered is reflected on by the floor it stands on when the reflection runs.
- **Proposed revision:** append to _Why it stays cheap_: "What a reflection has covered is a fact
  about the **work**, not the place: a task that moves to another scope after a reflection covered
  it is not read again there, and one that moves before is read by the scope it stands in when that
  scope's reflection runs. **Why:** reading the same work twice spends the attention reflection is
  meant to save, and leaving moved work unread loses what it could teach."
- **Status:** pending.
