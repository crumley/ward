# Design: Inter-Scope Messaging & Coordination

> **Serves intent:** [messaging seam](../intent/02-subsystems/02-messaging-coordination.md);
> [domain-model](../intent/01-concepts/00-domain-model.md) (dispatch/report/wake flows);
> [sessions](../intent/01-concepts/02-sessions-and-lifecycle.md) (wait/wake as session ops);
> [§16](../intent/00-foundation/01-principles.md) (recorded-first).

## Realization (`src/seams/messaging.ts`)

All three flows are **recorded in the store first**; live multiplexer delivery is a deferred
optimization for the running case (v1 has no live multiplexer, so everything is served from the
record — which is exactly what a not-running target requires).

- **dispatch(from, to, ref?, body)** / **report(from, to, body)** — write a `message` document
  (`kind: dispatch | report`) under `.ward/messages/`, addressed to a target **identity**. A target
  reads its inbox via `listMessages({to})`. The whole flow is **inspectable** at any time
  (`ward messages [--to|--from]`) — "what has crossed, from where to where" — which the seam
  requires for human+agent observability.
- **armWake(condition, armer)** — write a `wake` document (`.ward/wakes/<id>.md`) plus an **append-
  only wake log** (`.ward/wakes/<id>.log/`) whose first event is `arm`. The wake's **state is
  derived** by folding its log (`armed | satisfied`), never stored as a mutable field.
- **satisfyCondition(condition)** — append a `satisfy` event to every **armed** wake matching the
  condition. **Idempotent / fires once**: an already-satisfied wake is skipped (its folded state is
  terminal), so a duplicate report never double-acts. Returns `{fired, alreadySatisfied}` so the
  once-only semantics are visible.
- **pendingWakes()** — the still-armed wakes, i.e. the set **recovery re-arms** after a cold start.
  A condition met while the machine was down still fires exactly once when reported, via the same
  idempotency.

## How a report satisfies a wake (walkthrough §4 → §6)

A resident arms `1A1:done` and detaches. When the room is done, `ward report 1A1 done` records the
report **and** calls `satisfyCondition("1A1:done")` — the convention is `report <target> <status>`
satisfies a wake on `<target>:<status>`. The detached resident is "woken" (in v1, observably: the
wake flips to `satisfied`; a live nudge rides the multiplexer later).

## Routing (constraint, partially realized)

Direct identity-addressing (sender knows the target) is realized: `dispatch --to 1A1`. **Routing
through the originating scope's status persona** when the sender does _not_ know the target (charge
nurse / house supervisor resolves intent → session) is recorded conceptually but not yet
implemented; v1 senders always know their target (a resident dispatching into its own room). The
resolution **mechanism** is the seam's open question.

## Open / deferred

- **Multiplexer-vs-store split** for live delivery; v1 is store-only (the not-running path).
- **Status-persona routing mechanism** (how a sender says "route this for me" and the persona
  resolves it) — the seam's open routing-path mechanics.
- **Re-arm on recovery** is wired here (`pendingWakes`) and consumed by the recovery orchestration
  (later iteration).
