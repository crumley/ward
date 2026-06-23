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

## Build order — the spine first

A small set of **settle-early** decisions are foundational: every subsystem reads or writes them, so
an ambiguous answer propagates. Resolve these before or at the very start of the build (they are
pinned in [`00-foundation.md`](00-foundation.md) and the drafts noted):

- **Document-type catalog + schemas** — every subsystem reads/writes typed documents
  ([`metadata-store.md`](metadata-store.md)).
- **Identity scheme specifics** — task codes, floor-letter uniqueness, reuse-after-close; paths and
  references depend on it ([`00-foundation.md`](00-foundation.md)).
- **Task state machine + status roll-up** — the CLI and status personas read them
  ([`metadata-store.md`](metadata-store.md)).
- **Privacy-translation gate** — the highest-stakes correctness boundary; a single upstream place
  ([`remote-provider.md`](remote-provider.md)).
- **Caller-identity signal** — every agent-issued command and all provenance depend on it
  ([`cli-and-telemetry.md`](cli-and-telemetry.md)).
- **Workspace layout + version stamp** — fixes the shape everything is written into
  ([`00-foundation.md`](00-foundation.md)).

Everything else is local to one subsystem and settled when that subsystem is built.

## Foundation first

[`00-foundation.md`](00-foundation.md) is the recommended first step — the global architecture
(language, repo/module layout, on-disk workspace shape, the spine decisions) that later plans build
on.

## Index

Each plan links to itself below; the slice it serves is the live **Serves intent** link _inside_
that plan.

| Plan                                                       | Serves (intent)                        | Status |
| ---------------------------------------------------------- | -------------------------------------- | ------ |
| [`00-foundation.md`](00-foundation.md)                     | foundation + store & human-shell seams | draft  |
| [`metadata-store.md`](metadata-store.md)                   | metadata-store seam                    | draft  |
| [`context-loading.md`](context-loading.md)                 | context-loading concept                | draft  |
| [`session-multiplexer.md`](session-multiplexer.md)         | session-multiplexer seam               | draft  |
| [`messaging-dispatch-wake.md`](messaging-dispatch-wake.md) | messaging-coordination seam            | draft  |
| [`agent-harness.md`](agent-harness.md)                     | agent-harness seam                     | draft  |
| [`model-selection.md`](model-selection.md)                 | model-selection seam                   | draft  |
| [`theming.md`](theming.md)                                 | visual-theming seam                    | draft  |
| [`remote-provider.md`](remote-provider.md)                 | remote-provider seam                   | draft  |
| [`lifecycle-hooks.md`](lifecycle-hooks.md)                 | work-lifecycle concept (hooks)         | draft  |
| [`workflow-policy.md`](workflow-policy.md)                 | work-lifecycle concept (policy)        | draft  |
| [`reflection.md`](reflection.md)                           | reflection-and-evolution concept       | draft  |
| [`cli-and-telemetry.md`](cli-and-telemetry.md)             | human-shell seam                       | draft  |
