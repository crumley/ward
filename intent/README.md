# Ward Intent

The **design intent** of Ward: what it is for, the concepts it models, and the constraints every
realization must honor — each with its _why_, at a level above any implementation.

Intent is **durable**. It is the one leg of the four (see [`../README.md`](../README.md)) that does
not move when a tool moves. It changes only when our understanding of the system changes.

## Intent vs. design — the one test

The boundary between this tree and [`../design/`](../design/) is a single question applied to every
sentence:

> **If we swapped the design — a different store, multiplexer, harness, model, language, or layout —
> would this sentence have to change?**
>
> - **No** → it is _intent_. It lives here. It names no tool.
> - **Yes** → it is _design_. It lives in `../design/`.

The axis is **invariance under design substitution**. The `intent/` tree should read clean of tool
and format names — if you find a tool name here, it has leaked from `design/`.

## Three groupings

| Group                        | Holds                                                                                                   | Has a `design/` counterpart?                                                                                             |
| ---------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| [`foundation/`](foundation/) | **Global** intent — vision and the cross-cutting principles every slice honors, plus shared vocabulary. | Only global architecture (`design/foundation.md`).                                                                       |
| [`concepts/`](concepts/)     | The **domain**: design-independent nouns and processes.                                                 | Only where a concept has its own realization (`sessions`, `delivery`, `reflection`); the rest realize through the store. |
| [`subsystems/`](subsystems/) | The **swappable machinery** (the eight seams): the constraints any design of each must satisfy.         | Always — one design file per subsystem.                                                                                  |

## The two governing rules

1. **Intent names no design.** The moment a statement depends on a chosen tool, structure, or
   format, it has crossed into `../design/`. Keep this tree greppable-clean of tool names.
2. **One home per idea.** Every concept has exactly one canonical slice; every other slice **links**
   to it rather than restating it. (Each file's _Canonical home for_ section declares what it owns.)
   A genuinely two-sided contract states each side once, on its own side, and links. This is what
   keeps each idea in one place instead of smeared across files.

## Reading order

1. [`foundation/vision.md`](foundation/vision.md) — why Ward exists.
2. [`foundation/principles.md`](foundation/principles.md) — the invariants every slice honors.
3. [`concepts/`](concepts/) — the domain model: `work-hierarchy`, `identity`, `roles`, `artifacts`,
   `sessions`, `delivery`, `reflection`.
4. [`subsystems/`](subsystems/) — the machinery, each as a contract pointing to its design.
5. [`walkthrough.md`](walkthrough.md) — one task threaded through the concepts.
6. [`foundation/open-questions.md`](foundation/open-questions.md) — cross-cutting unresolved
   tensions (each slice also carries its own _Open questions_ section).
