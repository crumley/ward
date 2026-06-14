# Ward

Ward is a command-line tool and toolset that sets up and operates **opinionated, structured
workspaces** in which humans and agents work together on software. (Full vision:
`intent/what/00-vision.md`.)

This repository is where Ward is **designed and built**. It currently holds the **design intent**
— the durable, shared understanding of what Ward is and why — and the **prescription for how the
implementation is carried out**. The Ward system itself is built from these.

## What's here

| Path | What it is |
|---|---|
| `intent/` | The design intent: *what* Ward is and *why* (`intent/what/`), and the durable *how* choices and *why* (`intent/how/`). Start at `intent/README.md`. |
| `intent/walkthrough.md` | One task threaded end-to-end through the whole model — the fastest way to grasp it. |
| `intent/blanks-register.md` | Every decision intent deferred, tagged by when it must be settled — the bridge to implementation. |
| `plan/` | How the implementation is structured and carried out. Start at `plan/README.md`. |
| `AGENTS.md` | Harness-neutral guidance for any agent (or human) working in this repo. |

## How to use it

- **To understand Ward:** read `intent/` — `what/` first (00–08 + glossary), then `how/`, then
  `walkthrough.md`.
- **To build Ward:** read the intent, then `intent/blanks-register.md`, then `plan/README.md`, and
  follow the prescribed process.
- **To change the design:** follow the intent⇄tests⇄code discipline in `intent/README.md`; keep
  *what* and *how* separate; reflect changes in the glossary and open questions.

Ward eats its own dog food: this repo uses a harness-neutral `AGENTS.md`, the same convention Ward
standardizes on for workspace context (`intent/how/context-loading.md`).
