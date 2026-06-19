# Ward Source

The **code** leg. Implements the realization described in [`../design/`](../design/), under the
constraints set by [`../intent/`](../intent/).

> **Status:** placeholder. Empty pending the first implementation pass. Lay out source here to
> mirror the design — most plausibly by subsystem (`metadata-store`, `multiplexer`, `messaging`,
> `harness`, `model-selection`, `theming`, `remote-provider`, `shell-cli`) plus the cross-cutting
> concept mechanisms (`sessions`/context-loading, `delivery`/hooks, `reflection`). The concrete
> module layout is itself a **design** decision — record it in
> [`../design/00-foundation.md`](../design/00-foundation.md) before populating this tree.

`src` moves with `design` and `test`; all three reconcile back to `intent` when they diverge.
