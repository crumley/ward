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

Re-run the command after upgrading Ward — and you no longer have to remember when: `ward doctor`
compares the installed fish script against what the running `ward` would emit and says so when they
differ, with the exact line to re-run. The design and its mechanics are in
[`design/0022-shell-completion/`](design/0022-shell-completion/README.md), the staleness check in
[`design/0026-shell-staleness-doctor/`](design/0026-shell-staleness-doctor/README.md).

## Working from anywhere

Inside a workspace, `ward` finds it by walking up from the working directory. Register a workspace
and it can answer from **outside** one too:

```fish
cd ~/w/main; ward workspace register   # the first one registered becomes the default
ward workspace list                    # most recently used first, the default starred
ward workspace default other           # point the default somewhere else
```

With that in place, `ward status` from anywhere reports the default workspace (and says so on
stderr, so the implicit input is never silent), and two verbs print paths a shell can use directly:

```fish
cd (ward workspace path)               # the default workspace
cd (ward repo path ward)               # a repository's canonical checkout, found across workspaces
```

The registry is a **convenience**, kept in `$XDG_STATE_HOME/ward/workspaces.md`: everything in it is
derivable by standing in a workspace, so deleting it loses shortcuts and nothing else. Preferences
live beside it in `$XDG_CONFIG_HOME/ward/config.md` — a dotted key is its path through the document:

```yaml
---
type: ward-config
repo:
  refresh:
    stash: true
---
```

That key is validated and reported today; the `ward repo refresh --stash` flag that consumes it
lands with its own entry. `ward doctor` names the state of both files — including a config that will
not parse, or an entry whose workspace is gone. The design is in
[`design/0024-global-config-registry/`](design/0024-global-config-registry/README.md).

The same file carries your defaults for every agent Ward starts — the `agent:` block, overridden
**per key** by an identical block in a workspace's `workspace.md`
([`design/0028-agent-configuration/`](design/0028-agent-configuration/README.md)):

```yaml
---
type: ward-config
agent:
  model: fable                          # passed through verbatim; unset means the harness's default
  effort: high
  args: [--dangerously-skip-permissions] # the tail of every launch and resume
  command: [npx, claude]                # how the harness is invoked on THIS machine
---
```

`agent.command` is the program and any leading words — `[claude]` where the CLI is on PATH, which is
also what an unset key means; `[npx, claude]` on a machine where it has to be reached through a
launcher. A launch runs `<command…> --session-id ID [--model M] [--effort E] <args…>`, and
`ward doctor` reports every key with the layer that set it and checks that the command can be found
([`design/0035-agent-command/`](design/0035-agent-command/README.md)).

## The shell layer

Beside the completions, Ward emits a layer of **shorthands** for the moves you make all day. Install
it once — Ward prints, you redirect, the same contract completion has:

```fish
ward shell init fish > ~/.config/fish/conf.d/ward.fish
```

Four functions, each usable from any directory:

| Shorthand            | What it does                                                                       |
| -------------------- | ---------------------------------------------------------------------------------- |
| `wrr`                | `ward repo refresh`, arguments and all — from anywhere, via the default workspace. |
| `wrcd NAME`          | `cd` to a repository's canonical checkout, searching across workspaces.            |
| `wwcd [NAME]`        | `cd` to a workspace root.                                                          |
| `wws [NAME] [ARGS…]` | `cd` to a workspace root and open a session there — the agent starts, and when it  |
|                      | exits you are standing in the workspace. `ARGS` go to `ward session open` as is.   |

`wrcd` takes a shorthand for the name: exact wins, then a unique prefix, then a unique substring, so
`wrcd dot` reaches `dotfiles` while nothing else could be meant — and Ward says on stderr which
repository it landed on. Give either function no name (or one that resolves to nothing) and it opens
a picker over the candidates, prefilled with what you typed. The picker is [fzf]; without it, the
functions print the candidates and ask you to name one — no hang, no prompt — and `wwcd` or `wws`
with no name simply takes the default workspace. `ward doctor` tells you which of those two worlds
you are in. `wws` needs no `--purpose`: a workspace-scope session may leave it out, and the record
then says `Coordinating work · opened <time>` (`wws main --purpose "…"` when you have one to give).

Re-run the command after upgrading Ward — the shorthand set is expected to churn as usage shows what
is worth one, and `ward doctor` tells you when your installed copy has fallen behind (byte-compared
against what this `ward` emits, with the re-run to fix it — a file you wrote yourself is left alone
and reported as yours). Only fish today; other shells are unbuilt, not unsupported, and
`ward shell init bash` says so and names what does exist. The design is in
[`design/0025-fish-shell-layer/`](design/0025-fish-shell-layer/README.md), the staleness check in
[`design/0026-shell-staleness-doctor/`](design/0026-shell-staleness-doctor/README.md).

### Or adopt them as files you own

The layer above is one file Ward keeps fresh. The other style is to **adopt** the shorthands you
actually want, as files that become yours:

```fish
ward shell adopt fish              # what's on offer, and where each stands
ward shell adopt fish wrcd wwcd    # take these two
ward shell adopt fish --all        # take all of them
```

Each adopted shorthand lands as `~/.config/fish/functions/<name>.fish` plus its completion in
`completions/`, holding the **real definition** — not a stub that calls back into Ward. Track them
in your dotfiles, edit them, keep them: nothing in Ward rewrites an adopted file unless you name it
again. A file at one of those paths that Ward did not write is yours and is never touched without
`--force`.

Because what you adopted is a snapshot, Ward can tell you when its own definition has moved on — per
alias, with the choice left to you:

```fish
ward doctor                        # ! fish shorthand wrr — wrr has changed …
ward shell diff fish wrr           # see exactly what changed
ward shell adopt fish wrr          # take this ward's version, or ignore it and keep yours
```

`--dir PATH` writes into any fish config root instead of the live one — how a dotfiles repo adopts
them into a stow package; the files name no path, so they work wherever they are symlinked from.

**Which style:** take `shell init` if you want the current set with no upkeep and do not mind that
the file is Ward's. Take `shell adopt` if you keep your shell configuration in git, want only some
of the shorthands, or want to edit one — the trade is that adopted files go stale until you choose
to refresh them, which is exactly the control you are asking for. Do not run both: fish sources
`conf.d/` at startup, so an installed layer wins over anything adopted beside it — `ward doctor`
says so if you do. The design is in
[`design/0027-shell-adoption/`](design/0027-shell-adoption/README.md).

[fzf]: https://github.com/junegunn/fzf

## License

[MIT](LICENSE).
