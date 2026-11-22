# 0084 — Intent feedback

> Intent frictions found while building the session move: one conversation carried from one session
> record to another at a different scope.

This file is the entry's adjudication surface and is read on its own — an adjudication session loads
it without the entry's README, so each intent-feedback item carries enough context to be ruled on
directly.

What was built, in one paragraph: `ward session move ID --floor N [--task ADDRESS]` (or
`--workspace`) closes an open workspace- or floor-scope session's record with a `continued` event
naming a new session, and opens that new session at the target scope with the same harness handle
and `continues` naming the old one, both in one commit. When the old run was live in its detached
host, its window is ended and the new session is resumed in the target floor's host. Separately,
`ward session open --handle` now refuses a handle another open workspace or floor session holds, and
`ward doctor` reports any such pair, because `resume --all` would start two runs of one
conversation.

## IF-001 — a continuation is its own act, and needs its own word

- **Slice:**
  [`intent/01-concepts/02-sessions-and-lifecycle.md`](../../intent/01-concepts/02-sessions-and-lifecycle.md),
  _The lifecycle operations_ (open / close / resume / wake) and _Guarantees_ ("Closed stays
  closed").
- **Friction:** the slice has four operations, and a move is none of them. It closes one record and
  opens another, but the second is not a fresh open — its run is the first one's, resumed — and
  calling it "open" would hide that it carries a history, while calling it "resume" would revive a
  closed session, which the guarantee forbids. The slice already insists that continuing a gone
  thread under a new handle "deserves a different word"; carrying a live thread under the same
  handle to a new scope is the converse case and has no word either.
- **Assumption made to keep moving:** a **continuation** closes a session and opens its successor at
  another scope in one recorded step; the successor carries the same handle, each record names the
  other, and the closed one stays closed — it is never resumed, and recovery restores only the
  successor.
- **Proposed revision:** add to _The lifecycle operations_: "**Continue.** Carry an open thread to
  another scope: its session is closed — its episode at that scope ended — and a successor session
  is opened at the new scope over the same harness handle, each naming the other. The successor
  resumes the same run; the closed predecessor is never resumed. **Why its own operation:** the
  thread neither ends nor starts afresh, and each scope's log must say truthfully what happened
  there." And to _Guarantees_, under closed stays closed: "A continued session is closed like any
  other; its thread goes on only through its successor."
- **Status:** pending

## IF-002 — one harness handle may stand on several records, and at most one may be resumed

- **Slice:** [`intent/01-concepts/00-domain-model.md`](../../intent/01-concepts/00-domain-model.md),
  _Identity_ ("A session also stores a harness handle … a recorded attribute, not a second
  identity").
- **Friction:** the slice makes the handle an attribute and says nothing about how many records may
  carry the same one. Building found three cases that need an answer: a continuation leaves the
  handle on a closed predecessor and an open successor; an agent records each task episode it works
  from inside one run, so several task sessions carry their run's handle beside its own floor or
  workspace session; and two open workspace or floor sessions holding one handle are resumed by
  recovery as two runs of one conversation, which the resume-is-idempotent guarantee forbids.
- **Assumption made to keep moving:** any number of records may carry one handle, but at most one
  OPEN record of a scope that recovery resumes (workspace or floor) may — Ward refuses to record a
  second and reports any it finds. Task sessions are outside the rule because they are never
  restored in bulk.
- **Proposed revision:** add after the handle sentence: "Because the handle locates a run rather
  than naming a session, several records may carry the same one — a thread continued at another
  scope, the episodes one run recorded at narrower scopes — but **at most one open session that
  recovery would resume** may hold a given handle at a time: two would be resumed as two runs of one
  conversation."
- **Status:** pending
