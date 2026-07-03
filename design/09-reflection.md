# Design — Reflection

> **Serves intent:**
> [reflection-and-evolution](../intent/01-concepts/04-reflection-and-evolution.md). **Supersedes:**
> nothing.

## Decisions

- **Scope-boundary reflection as a map-reduce**
  ([`src/domain/reflection.ts`](../src/domain/reflection.ts)): `reflectOnScope(scope, goal)` reads
  the scope's recorded events, **chunks** them, **distills** each chunk (v2: a deterministic
  count-by-kind), and **rolls up** into proposals — so it scales past a single context window and a
  long-deferred reflection degrades into _more chunks_.
- **A per-(scope, goal) cursor makes it incremental.** The reflection document records how far it
  reached; a re-run processes only events past the cursor (no fresh events → no new proposals).
  Output is proposals, never silent edits.
- **Deterministic + data-driven** so it is hermetically testable; the real per-chunk distillation
  (an LLM summary) is the swappable part, the map-reduce + cursor is the invariant.

## What `src/` realizes it

`domain/reflection` (`reflectOnScope`, `scopeKey`, chunk/distill/roll-up) · CLI `reflect --scope`.

## Invariants under test

`test/intent/reflection` (cursor advances; a re-run over nothing-new adds no proposals); acceptance
§9 (closing the task proposes improvements, cursor advanced).

## Deferred

The reflection-type taxonomy (which goals ship); cadence/boundary triggers; cross-chunk learnings
that emerge only in aggregate; the real distillation step.
