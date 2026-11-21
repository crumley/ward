# 0078 — Intent feedback

> Intent frictions found while building task-named windows: a floor's session naming the task it
> works, and the harness run wearing the same name.

This file is the entry's adjudication surface and is read on its own — an adjudication session loads
it without the entry's README, so each intent-feedback item carries enough context to be ruled on
directly.

What was built, in one paragraph: a floor's own session (project scope) can record the task it is
working — `ward session open --task ADDRESS`, or `ward session task ID ADDRESS` / `--clear` on an
open one — as `task-named` / `task-cleared` events appended to its trail; it stays a floor session.
While the named task is open on the session's floor, the session's window is labelled for the task
(`f7t54 task-named-windows`), reports show it as `workingOn`, and naming a handed-over task picks
the hand-off up. A task's window label is now its full address in every host. Every launch and every
resume also passes the harness run a name derived the same way (`--name`, plus a setting for Claude
Code that keeps its own description in the terminal title), so the harness's resume picker says what
Ward's window list says.

## IF-001 — labels follow the work a session is doing, not only the scope it belongs to

- **Slice:**
  [`intent/02-subsystems/01-session-multiplexer.md`](../../intent/02-subsystems/01-session-multiplexer.md),
  _Constraints any design must honor_ ("Group sessions by the work they belong to (by the scope or
  the lineage that owns them — derived from the record, never from co-location) and label them as a
  human recognizes the work").
- **Friction:** one sentence holds grouping and labelling to the same thing, "the work they belong
  to", and defines it as the scope or lineage that owns the session. A floor's session belongs to
  its floor and is grouped there, but the work a human looks for at a glance is the task it is
  working now. Read strictly, the label must be the floor's, which is the label that made every
  window on a floor read alike.
- **Assumption made to keep moving:** grouping stays by scope and lineage; the label names the
  narrowest work the record says the session is doing — the task a floor session names, while that
  task is open — and falls back to the scope.
- **Proposed revision:** split the constraint: "**Group** sessions by the scope or lineage that owns
  them … and **label** each by the work it is doing as the record states it — the narrowest unit the
  record names, falling back to its scope — with its floor/room code wherever the code tells two
  apart or is what a command takes."
- **Status:** pending

## IF-002 — start and resume do not say a run can be named

- **Slice:**
  [`intent/02-subsystems/03-agent-harness.md`](../../intent/02-subsystems/03-agent-harness.md),
  _Constraints any design must honor_ ("**Start** an agent at a scope, with a persona and a model,
  in a working directory") and the adapter's fixed surface (start / handle / resume / locate).
- **Friction:** harnesses show a run by a name of their own (a resume picker, a prompt box, a
  terminal title), and both harnesses Ward has accept one at start and at resume. The seam lists
  what a start is given and leaves the name out, so passing one is outside the contract; without it,
  the harness's own list of runs and Ward's list of sessions name the same runs differently.
- **Assumption made to keep moving:** a start and a resume may pass a display name, derived by Ward
  from the record and passed through the adapter where the harness takes one; it is presentation,
  never the handle, and an adapter whose harness takes none ignores it.
- **Proposed revision:** add to _Start_: "…and, where the harness shows runs by name, a name Ward
  derives from the record, given again at every resume so the harness's surfaces agree with Ward's.
  A name is presentation: the handle stays the binding."
- **Status:** pending

## IF-003 — a session at a broad scope working a narrower piece of it has no word

- **Slice:**
  [`intent/01-concepts/02-sessions-and-lifecycle.md`](../../intent/01-concepts/02-sessions-and-lifecycle.md),
  opening definition ("one bounded episode of an agent working at a scope") and _Recording per
  scope_ (the session log's minimum, and a session "opened to receive work" whose purpose is its
  kind).
- **Friction:** a floor's session is opened to receive its floor's work, and then does one task of
  it after another itself. The slice has the session at one scope and the work at another (its
  dispatched threads), and no way to say "this floor's session is now working task 54" without
  either opening a task session — a second episode the human did not start — or leaving the record
  silent about what the session is doing.
- **Assumption made to keep moving:** a session keeps its one scope; what it is working within that
  scope is a recorded fact on its log, appended and never overwritten, and only a floor's session
  records one (a task session already is its task's). Taking up a handed-over task this way counts
  as picking the hand-off up.
- **Proposed revision:** add to _Recording per scope_: "A session opened at a broad scope may record
  the narrower unit of that scope it is working on — appended to its log as it changes, never
  changing its scope or its responsibility — so the record can say what a receiving session is doing
  now as well as what it is for."
- **Status:** pending
