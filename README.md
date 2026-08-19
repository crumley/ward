# Ward

Ward is a command-line tool and toolset that sets up and operates **opinionated, structured
workspaces** in which humans and agents work together on software. Full purpose:
[`intent/00-foundation/00-vision.md`](intent/00-foundation/00-vision.md).

This repository is where Ward is **designed and built**. It holds the **intent** (the durable what &
why) and the **design** record (how it is built, and the journal of building it). It is _about
building Ward; it is not itself a Ward workspace._

## The four legs

The repo stands on four parallel trees. **`intent` governs the other three.**

| Leg                  | What it is                                                                                                                                                   | Rate of change                                                 |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------- |
| [`intent/`](intent/) | The durable **what & why** — purpose, concepts, and the seam contracts.                                                                                      | Changes **only** when our understanding of Ward changes. Rare. |
| [`design/`](design/) | The **how**, a **chronological record** — numbered design entries (scope, design, build log, spec-feedback) and the stack ADRs; superseded, not overwritten. | Appends as a build proceeds; old entries are kept.             |
| [`src/`](src/)       | The code that implements the design.                                                                                                                         | Moves with `design`.                                           |
| [`test/`](test/)     | Tests holding the code to the design **and** the intent.                                                                                                     | Moves with `design`.                                           |

`design` + `src` + `test` are a triangle that moves together; `intent` sits above them. A change
that has to touch `intent` means we **learned something about Ward itself**, not that a tool moved.

Plus [`AGENTS.md`](AGENTS.md) — harness-neutral guidance for any agent (or human) working in this
repo. **Read it first.**

## How to use it

- **To understand Ward:** read [`AGENTS.md`](AGENTS.md), then follow the reading order in
  [`intent/README.md`](intent/README.md) — foundation → concepts → subsystems, then the two
  walkthroughs: [getting started](intent/03-walkthrough-getting-started.md) and
  [delivering work](intent/04-walkthrough-delivering-work.md).
- **To build Ward:** read the intent, then [`design/README.md`](design/README.md) — open a design
  entry, set its scope, journal the build in its log, and trace every entry back to the intent it
  serves.
- **To change the design:** keep the _what/why_ in `intent/` and the _how_ in `design/`; keep one
  home per idea; preserve every _why_; reconcile the triangle when it diverges.

Ward eats its own dog food: this repo uses a harness-neutral `AGENTS.md`, the same convention Ward
standardizes on for workspace context
([`intent/01-concepts/05-context-loading.md`](intent/01-concepts/05-context-loading.md)).

## Shell completion

`ward` completes its own noun/verb tree **and** the identities in your workspace — open task codes
(with their slugs), registered repository names, open session ids, stewardship branches, schema verb
phrases. Suggestions are read live from the workspace you are standing in, so what the shell offers
is what the verb will accept; outside a workspace only the command tree completes.

Install the script for your shell (fish first — it is the one this is tuned for):

```fish
ward completion fish > ~/.config/fish/completions/ward.fish
```

```bash
# bash — needs bash-completion loaded
ward completion bash > ~/.local/share/bash-completion/completions/ward
```

```zsh
# zsh — any directory on your $fpath works
ward completion zsh > "${fpath[1]}/_ward"
```

```powershell
# PowerShell — append to your profile so it loads every session
ward completion pwsh >> $PROFILE
```

```nu
# Nushell
ward completion nu | save ward-completion.nu; source ./ward-completion.nu
```

Re-run the command after upgrading Ward. The design and its mechanics are in
[`design/0022-shell-completion/`](design/0022-shell-completion/README.md).

## License

[MIT](LICENSE).
