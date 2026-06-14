# Implementation Plans

This directory is where **intent becomes a built system**. It holds the implementation plans that
turn `../intent/` into tests and code, structured with the same discipline the intent uses: every
plan is durable, traceable to the intent it serves, and explicit about what "done" means.

The plans themselves are written **after** the intent for an area is stable. This README is the
**prescription** — how plans are structured, in what order they are tackled, and how an agent
drives one to completion. An agent starting implementation should read this, then follow it.

## Where a plan sits

```
intent (what + why → how + why)   →   plan (sequenced work)   →   tests + code (the system)
```

A plan is **below** intent — it may name exact libraries, paths, fields, and flags, which intent
may not — and **above** the code: it sequences and justifies, but is not the code. It is the one
artifact allowed to make the tool-specific choices the `how/` docs deliberately left open.

## How plans are organized

- **Spine first, then subsystems.** The order is set by `../intent/blanks-register.md`: resolve the
  🔴 *settle-early* decisions (store + schemas, identity, task state machine + status roll-up,
  privacy gate, caller-identity, workspace layout/version) before subsystem work, because
  everything reads or writes them. Then one plan per subsystem (🟡), each able to proceed largely
  independently.
- **One plan per area.** Name spine plans `00-…`, `01-…` in dependency order; name subsystem plans
  for their seam (`metadata-store.md`, `harness.md`, `messaging.md`, …) to mirror
  `../intent/how/`.
- **An index** — a table in this README, kept current — lists each plan, its status, and the intent
  it implements.

## What every plan contains

A plan document has these sections, in order:

1. **Goal & scope.** What this plan delivers and what "done" looks like, traced to the intent's
   success criteria — and what is explicitly out of scope.
2. **Intent served.** The `what/` and `how/` docs and the seam contract this plan must honor — the
   guardrails it implements within.
3. **Blanks resolved.** The entries from `../intent/blanks-register.md` this plan settles, each with
   the decision made and its *why* (this is where tool-specific choices are recorded).
4. **Approach.** The design within the guardrails — the libraries, schemas, paths, and structure
   chosen.
5. **Work breakdown.** Ordered, reviewable steps. Each step names the **tests** that pin its
   behavior and the **code** it produces — tests are first-class, not an afterthought.
6. **Verification.** How we confirm the result meets the seam contract and the intent's invariants
   (the relevant guarantees: idempotency, no-lost-updates, privacy translation, recovery, …).
7. **Intent reconciliation.** Any change implementation forced back into intent (the triangle):
   what was edited in `intent/`, or what open question was resolved or opened.
8. **Open items.** What this plan leaves for later, fed back into `08-open-questions.md` or the
   blanks register.

## How an agent drives a plan

1. **Read the intent for the area** (`what/` + the relevant `how/` doc + the seam contract), then
   the matching entries in the blanks register.
2. **Settle the blanks** this plan owns, recording each decision and its *why* in the plan — and,
   for anything that changes a guardrail, fold it back into the intent doc, not just the plan.
3. **Build in steps**, each landing tests + code together. Keep the working tree on a branch and
   reach the main line only by PR (`../intent/what/05-work-lifecycle.md`) — the same workflow Ward
   itself prescribes.
4. **Verify against the contract**, not just the happy path: exercise the guarantees, and run the
   `../intent/walkthrough.md` scenario for the area (on paper or as a test).
5. **Reconcile the triangle.** If code and intent diverged, bring intent back into agreement in a
   following step and record it. Update the plan index and the blanks register.

## Definition of done (per plan)

- The seam contract and the intent invariants it touches are met and **tested**.
- Every blank the plan claimed is resolved, with its *why* recorded.
- Intent, tests, and code agree; any divergence found has been reconciled.
- The plan index, the blanks register, and `08-open-questions.md` reflect reality.

## Index

*(No plans yet — the intent is being finalized. The first plan to write is the 🔴 spine, in the
order given by `../intent/blanks-register.md`.)*

| Plan | Implements | Status |
|------|-----------|--------|
| _none yet_ | — | — |
