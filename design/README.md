# Ward Design

The **chronological design record** — the _how_, and the history of how it got that way. Where
[`../intent/`](../intent/) is the **living tip** (what must be true and why), this tree is the
**lineage**: the implementation plans and design decisions that realize the intent, recorded **in
the order they were made** and **superseded, not overwritten**, when a better design replaces an
earlier one.

`design` moves together with [`../src/`](../src/) and [`../test/`](../test/) — the implementation
triangle, all governed by `intent`.

## Why a record, not a mirror

Intent is organized for **understanding** (concepts, seams) and always represents the current tip.
Design is organized for **building over time**: a plan per area (the metadata store, theming, the
CLI…), each accreting **dated entries** as the build proceeds. When a seam is re-done a month later
— one technique backed out for another — the new decision is **appended and marked as superseding**
the old; the old entry stays, so the _why we changed_ is never lost. This is why design reads
differently from intent: intent is a fresh statement of the tip; design is a ledger of decisions
with their history.

> **Relationship to `plan/`.** [`../plan/`](../plan/) records the **act of building** (per-exercise
> scope, journal, spec-feedback) and the **stack ADRs** ([`plan/decisions/`](../plan/decisions/)).
> `design/` records the **per-area implementation design** that results. An ADR is a one-time
> stack/tooling choice; a design entry is the evolving plan for an area of the system.

## The rule that keeps it honest

Every plan opens with a **Serves intent** pointer to the slice(s) it realizes. If a statement would
hold no matter how we build it, it is a constraint, not a plan, and it belongs up in
[`../intent/`](../intent/) (most likely the seam contract). When a plan settles a decision the
intent left open, it records the choice and its _why_ here, and the intent slice's _Left to
implementation_ note points down to it. When a later plan **supersedes** an earlier one, it says so
explicitly and links back — the record keeps both.

> **Status: this leg is authored as a build proceeds.** Until a build runs, it holds only this
> README. Intent points at the **`design/` leg** (not at specific files); the per-area plans that
> realize each seam are authored here, with their dated history, as the build reaches them.
