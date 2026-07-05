# Ward Source

The **code** leg. Implements the realization described in [`../design/`](../design/), under the
constraints set by [`../intent/`](../intent/).

> **Status:** foundation only. [`cli/`](cli/) holds the minimal CLI entrypoint from
> [`design/0001-dev-foundation/`](../design/0001-dev-foundation/README.md); no Ward behavior exists
> yet.

Lay out source here to **mirror the design's organization**, following [`design/`](../design/). The
concrete module layout is itself a **design** decision; record it in the design entry that populates
this tree.

`src` moves with `design` and `test`; all three reconcile back to `intent` when they diverge.
