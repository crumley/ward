# Design — Sessions, lifecycle & recovery

> **Serves intent:** [sessions-and-lifecycle](../intent/01-concepts/02-sessions-and-lifecycle.md),
> [domain-model](../intent/01-concepts/00-domain-model.md) (identity). **Supersedes:** nothing.

## Decisions

- **Stored session state is `open | closed`; "running" is a live overlay** (SF-002, §16). `resume`
  re-attaches via the recorded handle and does **not** mutate the durable record, so resuming twice
  is a no-op on state; `close` is the only transition off `open` and is terminal (closed stays
  closed).
- **Session ids are unique among OPEN sessions workspace-wide**
  ([`ids.allocateId`](../src/store/ids.ts)), so a bare id addresses every operation. A freed id is
  reusable; before reuse the prior **closed** record is moved aside
  ([`session.archivePriorClosedRecord`](../src/domain/session.ts)) so history is retained, never
  clobbered (§15).
- **Records live flat in `.ward/sessions/<id>.md`**; containment is a field (`scope`) and mirrored
  by the owning scope's `log/` — addressing and containment are different lookups (identity need not
  mirror containment).
- **Recovery = `attach`** ([`src/domain/recovery.ts`](../src/domain/recovery.ts)): enumerate → keep
  open → resume via handle (idempotent) → `checkWakes` fires met conditions once → re-validate setup
  hooks for **live** worktrees only (torn-down/absent checkouts skipped) → leave closed alone. The
  verb reads true: per-thread `resume`, workspace-wide `attach` (never `recover`).

## What `src/` realizes it

`domain/session` (open/close/resume, id reuse) · `domain/recovery` (attach + checkWakes) ·
`seams/harness` (the handle).

## Invariants under test

`test/intent/lifecycle` (resume idempotent, closed stays closed, id reuse retains history);
`test/intent/recovery` (live worktrees only, wakes fire once); acceptance §10.

## Deferred

"Enough metadata" validated against more reboot scenarios; a real multiplexer as the live host (v2's
running-ness is derived, not hosted).
