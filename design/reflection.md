# Design: Reflection Mechanism

> **Layer:** design — implementation plan. The _how_; may change. **Status:** draft.

The build behind reflection — the default goals, the map-reduce shape, and the cursor.

## Serves intent

- [`../intent/01-concepts/04-reflection-and-evolution.md`](../intent/01-concepts/04-reflection-and-evolution.md)
  — evolvable, goal-directed, map-reduce reflection with per-goal cursors, emitting proposals
  asynchronously.

## Plan (draft)

- **The default set of reflection goals** (cadence retrospective, project-close, task-close, …) and
  **how a new goal is added** — encoded as workspace-owned, evolvable routines
  ([`workflow-policy.md`](workflow-policy.md) pattern).
- **Chunk boundary heuristics** (by time, task, scope, volume) and the **distillation shape** — a
  small dense summary per chunk. _Bound:_ a long-deferred reflection degrades into _more chunks_,
  not failure.
- **The roll-up procedure** and how **cross-chunk themes** (insights only visible in aggregate) are
  preserved — the open question.
- **The cursor's concrete form** per (scope, goal); the cadence/boundary **triggers**; and how
  proposals are recorded and surfaced for adoption (never applied silently). Chunks read the
  underlying runs via their **harness handles** ([`agent-harness.md`](agent-harness.md)).
