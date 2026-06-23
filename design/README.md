# Ward Design

**Implementation plans** — the _how_. Where [`../intent/`](../intent/) says _what must be true and
why_, this tree says _how we build it_: the structures, formats, tools, algorithms, and sequencing
chosen to realize the intent.

`design` moves together with [`../src/`](../src/) and [`../test/`](../test/) — the three legs of the
implementation triangle, all governed by `intent`.

> **Status: these are drafts.** No code exists yet. Each plan currently captures the working
> assumptions and the decisions still to settle, carried over from the intent's deferred choices.
> They harden as the build proceeds.

## This tree does NOT mirror intent

Intent is organized for **understanding** (concepts, seams). Design is organized for **building**.
Here that means **spine first, then one plan per seam/mechanism** — the order the implementation
naturally proceeds, which is different from the order the domain is explained.

## The rule that keeps it honest

Every plan opens with a **Serves intent** pointer to the slice(s) it realizes. If a statement would
hold no matter how we build it, it is a constraint, not a plan, and it belongs up in
[`../intent/`](../intent/) (most likely the seam contract). When a plan settles a decision the
intent left open, it records the choice and its _why_ here, and the intent slice's _Left to
implementation_ note points down to it.
