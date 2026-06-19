# Ward Design

**One** realization of the intent. Where [`../intent/`](../intent/) says _what must be true and
why_, this tree says _how we are building it_ — the tools, structures, formats, and algorithms
chosen to satisfy the constraints. It is free to change: a design may be replaced wholesale without
touching `intent`, as long as the replacement honors the same constraints.

`design` moves together with [`../src/`](../src/) and [`../test/`](../test/) — the three legs of the
implementation triangle, all governed by `intent`.

## The rule that keeps this tree honest

Everything here **names something concrete** — a filesystem layout, a markdown schema, a
multiplexer, a model id, a command tree. If a statement would survive swapping that concrete thing,
it is a _constraint_, not a design, and it belongs up in `../intent/`. Each design file opens with a
**Governed by** pointer to the intent slice whose constraints it must satisfy.

## How this tree mirrors intent

| Design area                      | Realizes                                        | Notes                                                                                                                                  |
| -------------------------------- | ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| [`foundation.md`](foundation.md) | `intent/foundation/`                            | Global architecture: language and schema approach, the four-leg repo layout, cross-cutting conventions.                                |
| [`concepts/`](concepts/)         | the few concepts with their **own** realization | Only `sessions` (context loading, recovery), `delivery` (hooks, policy encoding, refresh/rebase), and `reflection` (chunking, cursor). |
| [`subsystems/`](subsystems/)     | each of the eight seams                         | One file per subsystem — this is where most realization lives.                                                                         |

**Most domain concepts have no design file of their own.** The hierarchy, identity, and artifacts
are _recorded_, and their realization is the store — so they are designed once, in
[`subsystems/metadata-store.md`](subsystems/metadata-store.md), not scattered.

## Where the blanks are

[`blanks-register.md`](blanks-register.md) aggregates every decision the intent deliberately left
open — the spine an implementation plan must consume before code is written.

> **Note on the walkthrough.** The intent walkthrough
> ([`../intent/walkthrough.md`](../intent/walkthrough.md)) threads one task through the concepts. We
> are intentionally **not** duplicating it here unless a concrete, record-and-tool-naming version
> earns its keep during implementation.
