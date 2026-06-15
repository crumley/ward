# Ward

Ward is a command-line tool and toolset that sets up and operates **opinionated, structured
workspaces** in which humans and agents work together on software. (Full vision:
`intent/what/00-vision.md`.)

This repository is where Ward is **designed and built**. It holds the **design intent** (what
Ward is and why, and the durable *how* choices and why) and the **prescription for building
it**. The Ward system itself is built from these.

## What's here

| Path | What it is |
|---|---|
| `intent/` | The design intent: *what* Ward is and *why* (`intent/what/`), and the durable *how* and *why* (`intent/how/`). Start at `intent/README.md`. |
| `intent/walkthrough.md` | One task threaded end-to-end through the whole model — the fastest way to grasp it. |
| `intent/blanks-register.md` | Every deferred decision, tagged by when it must be settled — the bridge to implementation. |
| `plan/` | How the implementation is structured and carried out. Start at `plan/README.md`. |
| `AGENTS.md` | Harness-neutral guidance for any agent (or human) working in this repo. |

## How to use it

Read `AGENTS.md` first, then follow the reading order in `intent/README.md`. To build Ward,
continue into `intent/blanks-register.md` and `plan/README.md`.

Ward eats its own dog food: this repo uses a harness-neutral `AGENTS.md`, the same convention
Ward standardizes for workspace context (`intent/how/context-loading.md`).
