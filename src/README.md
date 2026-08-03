# Ward Source

The **code** leg. Implements the realization described in [`../design/`](../design/), under the
constraints set by [`../intent/`](../intent/).

> **Status:** first Ward behavior. [`cli/`](cli/) holds the CLI entrypoint and noun/verb tree
> ([`design/0001-dev-foundation/`](../design/0001-dev-foundation/README.md),
> [`design/0002-store-and-workspace/`](../design/0002-store-and-workspace/README.md));
> [`store/`](store/) is the typed-document store; [`workspace/`](workspace/) is workspace creation,
> discovery, and doctor.

Lay out source here to **mirror the design's organization**, following [`design/`](../design/). The
concrete module layout is itself a **design** decision; record it in the design entry that populates
this tree.

`src` moves with `design` and `test`; all three reconcile back to `intent` when they diverge.
