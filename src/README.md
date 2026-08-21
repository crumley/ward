# Ward Source

The **code** leg. Implements the realization described in [`../design/`](../design/), under the
constraints set by [`../intent/`](../intent/).

> **Status:** the bootstrap arc is built. [`cli/`](cli/) holds the CLI entrypoint and noun/verb tree
> ([`design/0001-dev-foundation/`](../design/0001-dev-foundation/README.md) onward);
> [`store/`](store/) is the typed-document store
> ([`design/0002-store-and-workspace/`](../design/0002-store-and-workspace/README.md));
> [`workspace/`](workspace/) is workspace creation, discovery, doctor, the repository set
> ([`design/0003-repository-set/`](../design/0003-repository-set/README.md)), and the work spine —
> projects, tasks, worktrees, session records, derived status
> ([`design/0004-work-spine/`](../design/0004-work-spine/README.md)); [`global/`](global/) is the
> per-user axis — configuration and the machine-level workspace registry that lets `ward` answer
> from any directory
> ([`design/0023-global-config-registry/`](../design/0023-global-config-registry/README.md)).

Lay out source here to **mirror the design's organization**, following [`design/`](../design/). The
concrete module layout is itself a **design** decision; record it in the design entry that populates
this tree.

`src` moves with `design` and `test`; all three reconcile back to `intent` when they diverge.
