# Ward

Ward is a command-line tool and toolset that sets up and operates **opinionated, structured
workspaces** in which humans and agents work together on software. Full purpose:
[`intent/00-foundation/00-vision.md`](intent/00-foundation/00-vision.md).

This repository is where Ward is **designed and built**. It currently holds the **intent** (the
durable what & why) and the **design** (the implementation plans) — the Ward system
itself is built from these. It is *about building Ward; it is not itself a Ward workspace.*

## The four legs

The repo stands on four parallel trees. **`intent` governs the other three.**

| Leg | What it is | Rate of change |
| --- | ---------- | -------------- |
| [`intent/`](intent/) | The durable **what & why** — purpose, concepts, and the seam contracts. | Changes **only** when our understanding of Ward changes. Rare. |
| [`design/`](design/) | The **how** — implementation plans: structures, tools, and algorithms, organized for building. | As the build proceeds and better designs are learned. |
| [`src/`](src/) | The code that implements the design. | Moves with `design`. (Greenfield — no code yet.) |
| [`test/`](test/) | Tests holding the code to the design **and** the intent. | Moves with `design`. |

`design` + `src` + `test` are a triangle that moves together; `intent` sits above them. A change
that has to touch `intent` means we **learned something about Ward itself**, not that a tool moved.

Plus [`AGENTS.md`](AGENTS.md) — harness-neutral guidance for any agent (or human) working in this
repo. **Read it first.**

## How to use it

- **To understand Ward:** read [`AGENTS.md`](AGENTS.md), then follow the reading order in
  [`intent/README.md`](intent/README.md) — foundation → concepts → subsystems, then the
  [walkthrough](intent/03-walkthrough.md).
- **To build Ward:** read the intent, then [`design/README.md`](design/README.md) — settle the
  spine first, then work seam by seam, each plan tracing back to the intent it serves.
- **To change the design:** keep the *what/why* in `intent/` and the *how* in `design/`; keep one
  home per idea; preserve every *why*; reconcile the triangle when it diverges.

Ward eats its own dog food: this repo uses a harness-neutral `AGENTS.md`, the same convention Ward
standardizes on for workspace context
([`intent/01-concepts/05-context-loading.md`](intent/01-concepts/05-context-loading.md)).
