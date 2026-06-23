# Building Ward — the build journal

This directory is where Ward is **made to run**, and where we record **what building taught us about
the spec**. It is meta to the four legs (`intent/`, `design/`, `src/`, `test/`): those legs hold
Ward; `build/` holds the _act of building_ Ward and the learnings that come out of it.

It exists because the first build is an experiment with two goals — produce a working Ward, and
discover where the intent is ambiguous, under-specified, over-specified, contradictory, hard to
implement, or not serving its stated purpose. The records here are a first-class deliverable, not a
side effect.

## What lives here

- [`v1-scope.md`](v1-scope.md) — the explicit MVP boundary: what is in the first working version,
  what is deferred and why, and the acceptance scenario (the
  [walkthrough](../intent/03-walkthrough.md), run for real). This is the contract the build works to
  and the loop's exit test.
- [`LOG.md`](LOG.md) — the append-only build journal. One entry per iteration/milestone: what was
  attempted, what was done, what **works now** (with the command that proves it), and what's next.
  This is the cold-start memory that lets the build resume across sessions.
- [`decisions/`](decisions/) — Architecture Decision Records, one per critical choice. The
  toolchain, each framework, and each significant library get their own ADR with rationale. Start
  from [`decisions/0000-template.md`](decisions/0000-template.md).
- [`spec-feedback.md`](spec-feedback.md) — the running log of spec frictions found while building,
  each tagged to the intent slice and section, with the assumption made to keep moving and a
  concrete proposed revision.

## Discipline

`intent/` governs; the build does **not** silently rewrite it to match the code. When building
reveals an intent problem, it is recorded in [`spec-feedback.md`](spec-feedback.md) and the build
proceeds on a stated assumption. The build freely authors `design/`, `src/`, and `test/`.
