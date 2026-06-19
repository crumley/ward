# Ward

Ward is a command-line tool and toolset that sets up and operates **opinionated, structured
workspaces** in which humans and agents work together on software. (Full purpose:
[`intent/foundation/vision.md`](intent/foundation/vision.md).)

This repository is where Ward is **designed and built** — it is not itself a Ward workspace.

## The four legs

The repo stands on four parallel trees. **`intent` governs the other three.**

| Leg                  | What it is                                                                                                                                                                                               | Rate of change                                                       |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| [`intent/`](intent/) | The durable purpose, concepts, and constraints — design-independent.                                                                                                                                     | Changes **only** when our understanding of the system changes. Rare. |
| [`design/`](design/) | **One** realization of the intent: the tools, structures, formats, and algorithms chosen to satisfy it. Includes [`design/blanks-register.md`](design/blanks-register.md), the bridge to implementation. | Changes as we learn better designs.                                  |
| [`src/`](src/)       | The code that implements the design.                                                                                                                                                                     | Moves with `design`.                                                 |
| [`test/`](test/)     | The tests that hold the code to the design and the intent.                                                                                                                                               | Moves with `design`.                                                 |

`design` + `src` + `test` are a triangle that moves together; `intent` sits above them. A change
that has to touch `intent` means we **learned something about the system itself**, not that a tool
moved.

Plus [`AGENTS.md`](AGENTS.md) — harness-neutral guidance for any agent (or human) working in this
repo. **Read it first.**

## How to use it

Read [`AGENTS.md`](AGENTS.md), then the reading order in [`intent/README.md`](intent/README.md). To
build Ward, continue into [`design/blanks-register.md`](design/blanks-register.md) (settle the 🔴
spine first) and [`design/`](design/).

Ward eats its own dog food: this repo uses a harness-neutral `AGENTS.md`, the same convention Ward
standardizes for workspace context.
