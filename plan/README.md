# Plan — building Ward, and what building teaches

This directory is where Ward is **made to run**, and where we record **what building taught us about
the spec**. It is **meta to the four legs** ([`../intent/`](../intent/), [`../design/`](../design/),
[`../src/`](../src/), [`../test/`](../test/)): those legs hold Ward; `plan/` holds the _act of
building_ Ward and the learnings that come out of it.

Each build is an **exercise** with two deliverables: a working Ward, **and** feedback on the intent
— where it proved ambiguous, under- or over-specified, contradictory, hard to implement, or not
serving its purpose. The feedback is a first-class output, not a side effect: it is how the intent
gets **tighter with each build**.

## Layout

- **`<exercise>/`** — one directory per build exercise (`v1/`, `v2/`, …), each holding:
  - **`scope.md`** — the explicit boundary of this exercise: what is in, what is deferred and why,
    and the acceptance scenario. The contract the build works to and the loop's exit test.
  - **`log.md`** — the append-only build journal. One entry per iteration: goal, what was done, what
    **works now** (with the exact command that proves it), decisions, spec feedback, next. This is
    the cold-start memory that lets a build resume across sessions.
  - **`spec-feedback.md`** — the running log of intent frictions found while building, each tagged
    to the intent slice + section, with a **stable identifier** (`SF-001`, `SF-002`, …) so a human
    can reference it precisely, the assumption made to keep moving, and a concrete proposed
    revision.
- **`decisions/`** — Architecture Decision Records: one per critical **stack / tooling** choice
  (language, runtime, test runner, key libraries). Start from
  [`decisions/0000-template.md`](decisions/0000-template.md).

**Why per-exercise directories:** the point is doing this **again, tighter each time**. Keeping each
exercise's scope, journal, and feedback intact means `v2/`'s spec-feedback sits beside `v1/`'s, and
the diff in `intent/` between exercises is the visible result of the experiment — Ward's intent,
hardened by the act of building Ward.

## The discipline

`intent/` governs; **the build does not silently rewrite it** to match the code. When building
reveals an intent problem, it is recorded in the exercise's `spec-feedback.md` and the build
proceeds on a stated assumption — the spec change is left for human review and a later intent pass
(the one exception: appending to a slice's own _Open questions_, or noting that the build _resolved_
one, is allowed and should also be logged). The build freely authors `design/`, `src/`, and `test/`.

Stack ADRs are the durable home for **why this toolchain**; per-area design (how each subsystem is
built) lives in [`../design/`](../design/), the chronological design record.
