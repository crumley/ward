# Design — Messaging & coordination

> **Serves intent:**
> [messaging-coordination seam](../intent/02-subsystems/02-messaging-coordination.md),
> [scopes-and-personas](../intent/01-concepts/01-scopes-and-personas.md) (routing). **Supersedes:**
> nothing.

## Decisions

- **Recorded-first** (§16): every dispatch/report is a `message` document and every wake is a `wake`
  document ([`src/seams/messaging.ts`](../src/seams/messaging.ts)); a not-running target is served
  entirely from the record. The flow is inspectable (`ward messages`, `ward wake list`).
- **Dispatch/report are identity-addressed**; `routedVia` records when a sender that did not know
  its target routed through a status persona (charge nurse / house supervisor).
- **Wakes are idempotent and re-armed on recovery.** `checkWakes` evaluates every armed condition
  and fires met ones exactly once (a satisfied wake never re-fires). Conditions: `room-done` (met
  when the room is **free** — see SF-003), `task-closed`, `pr-merged` (deferred to the remote seam).

## What `src/` realizes it

`seams/messaging` (dispatch/report/arm/satisfy/list) · `domain/recovery.checkWakes` (condition
evaluation) · CLI `dispatch` / `report` / `messages` / `wake arm|list|check`.

## Invariants under test

`test/intent/recovery` (wake re-armed then fired once); acceptance §4/§6/§9.

## Open / spec-feedback

**SF-003** — whether a `room-done` wake fires on a milestone _report_ or on scope _completion_. v2
chose completion; the evaluate→iterate loop rides on recorded report/dispatch messages.
