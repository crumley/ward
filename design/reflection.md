# Design: Reflection & Evolution

> **Serves intent:** [reflection concept](../intent/01-concepts/04-reflection-and-evolution.md);
> [work-lifecycle §9](../intent/01-concepts/03-work-lifecycle.md) (close → reflect);
> [sessions](../intent/01-concepts/02-sessions-and-lifecycle.md) (reflect over a session's arc via
> its harness handle).

## Realization (`src/domain/reflection.ts`)

`reflectOnTaskClose(root, floor, slug)` implements the **scope-boundary** reflection as a **map-
reduce** with a **cursor**, exactly the shape the concept mandates:

1. **Chunk** — gather every session at the task scope and in its rooms (folding each scope's
   append-only log).
2. **Distill** — reduce each session chunk to a one-line core learning. v1 distills
   deterministically (persona + lifecycle-event count); a real harness would distill richer content
   by reading the session's native history via its handle (`seams/harness.history`). The map-reduce
   **shape** is the durable part; the distiller is swappable.
3. **Roll up** — synthesize proposals (a `skill` to capture the work, a `standard` to sharpen the
   brief), written to a `reflection` document. Proposals, never silent edits — reflection is
   asynchronous and advisory.

The **cursor** (`reflection.cursor`) records how many sessions have been processed for this
`(scope, goal)`; a re-run processes only sessions beyond it, so a long-deferred reflection degrades
into _more chunks_ rather than failing, and re-running is cheap and incremental.

Triggered by `closeTask` (after rooms close + worktrees tear down, before the task is marked closed,
so the closing arc is in scope).

## What is deferred (v1 scope)

- **Cadence reflection** (the interval-based family member) and the **evolvable taxonomy** of
  reflection goals — v1 ships exactly one goal, `task-close`. The cursor/goal keying already
  generalizes to more goals.
- **Cross-chunk learnings** that only emerge in aggregate (the concept's open question) — v1's
  roll-up is a single pass over the per-chunk distillations.
- **Acting on proposals** (creating the skill, editing the standard) is left to a human/agent;
  reflection only proposes.

## Open / deferred

- The real distiller (LLM over native history) and the chunk heuristics for very large intervals.
- How proposals feed back into the workspace's evolvable artifacts (personas, skills, standards) and
  the reconciliation on Ward upgrade
  ([reflection open questions](../intent/01-concepts/04-reflection-and-evolution.md)).
