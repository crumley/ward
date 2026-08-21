# 0025 — The fish shell layer: three shorthands that work from anywhere

> `ward shell init fish` emits a self-contained fish script the human installs beside their
> completions, holding the v1 shorthand set — `wrr` (refresh from anywhere), `wrcd NAME` (cd to a
> repository's checkout), `wwcd [NAME]` (cd to a workspace root). Missing or unresolvable nouns are
> picked at the **shell** layer with fzf, behind a two-function seam, degrading to a printed listing
> when no picker is installed. `ward repo path` grows a shorthand ladder — exact, then unique
> prefix, then unique substring — so the fuzzy rule is deterministic and testable in Ward rather
> than guessed at in fish. `ward shell candidates KIND` is the feed both the picker and the new
> completions read, and it is machinery: no telemetry row, no MRU churn.
>
> **Status:** accepted · **Started:** 2026-08-21

[0022](../0022-shell-completion/README.md) built the cheap half of the interactive-resolution
constraint and [0024](../0024-global-config-registry/README.md) built the thing that lets Ward
answer from a cold shell in `$HOME`. This entry is what those two were for: the "mnemonic
shorthands" the human-shell contract has always named, thin enough that all the logic stays in Ward
and every function ends in a `ward` invocation or a `cd`.

It also settles a question 0022 left open in a way that costs nothing: a human who omits a noun can
be shown a picker **without** Ward growing an in-process one. The deliberate entry intent requires
is encoded in the fish function itself — `wrcd` with no argument _is_ the deliberate act — and the
picking happens in the shell, out of process, where it cannot block anyone.

## Serves intent

- [`human-shell`](../../intent/02-subsystems/07-human-shell.md) — _The interactive layer adds
  mnemonic shorthands for common operations — thin plumbing, evolvable as telemetry reveals real
  usage_: built, three of them, and the telemetry that will evolve them is already recording. Also
  _All real logic lives in the Ward tool_ — the fish script holds no knowledge of Ward's nouns,
  verbs, or records; it asks and it plumbs. Also _Supply nouns by recognition, never by recall_,
  through both its mechanisms at once: `complete` for the two new names, and a picker for the noun
  that was never typed. Also _Workspace- and scope-aware from any working directory_ — every
  shorthand works from `$HOME`, standing on 0024's registry. Also _Record command usage as local
  telemetry_, in its "machinery invocations the interaction layer makes of itself are not usage"
  clause, which now covers a second kind of machinery.
- [`principles`](../../intent/00-foundation/01-principles.md) — **§18**: Ward emits, the human
  redirects; nothing is written into anyone's shell configuration. **§20**: no fzf is a named lesser
  answer (the candidates, printed, with the remedy), never a hang, and `ward doctor` names the same
  condition so the degradation loop closes. **§8**: the shorthand ladder is a human affordance and a
  declared agent resolves names exactly — but is told what the shorthand would have reached, so the
  refusal costs it one step, not a guess. **§17**: an inexact match and a crossed workspace are
  implicit inputs, echoed on stderr, never silent.
- [`workspace-lifecycle`](../../intent/01-concepts/06-workspace-lifecycle.md) — the shell layer is
  pure convenience over the registry, so it inherits the global-state boundary without adding to it:
  it stores nothing at all.

## Scope

- **In:**
  - **`ward shell init <shell>`** (`src/shell/layer.ts`, `src/shell/fish.ts`) — emits the layer on
    stdout for redirection into `~/.config/fish/conf.d/ward.fish`. An unbuilt shell exits 1 naming
    what exists.
  - **The v1 shorthand set**, all functions (not `abbr` — two of them run logic):
    - `wrr` → `ward repo refresh $argv`, verbatim forwarding.
    - `wrcd [NAME]` → `cd (ward repo path NAME)`; no name, or one Ward cannot resolve, opens the
      picker with the typed word prefilled.
    - `wwcd [NAME]` → `cd (ward workspace path NAME)`; same picker path, and with neither a name nor
      a picker it takes the default workspace.
  - **The picker seam** — `__ward_picker_present` and `__ward_picker`, the only two functions in the
    emitted script that name fzf, sitting above every shorthand.
  - **`ward shell candidates repos|workspaces`** (`src/shell/candidates.ts`) — one `NAME<TAB>CUE`
    line per candidate: repositories unioned across the workspaces `repo path` would search, cued by
    the workspace that would answer; registered workspaces, most recently used first, stale ones
    dropped. Empty is exit 0 and silence.
  - **Completion for the new names**, in the emitted script: `wrr` by `complete -w` on the command
    it forwards to (so ward's own generated completions serve it), `wrcd`/`wwcd` by calling back
    into the candidate feed.
  - **The shorthand ladder in `ward repo path`** (`src/global/locate.ts`) — exact, then unique
    case-insensitive prefix, then unique case-insensitive substring, rung by rung across the whole
    search order. Ambiguity is a refusal naming every candidate. Human-only; an agent gets exact
    resolution plus the near-miss in the refusal.
  - **Machinery is not usage** (`src/cli/telemetry.ts`) — `isMachineryInvocation` now covers both
    completion callbacks and `shell candidates`, and gates the telemetry row **and** the registry's
    MRU touch. `shell init` is recorded, as the deliberate once-per-install act it is.
  - **A picker finding in `ward doctor`** — fzf present or not, `info` at worst, closing §20's loop
    for the condition `wrcd` degrades on.
  - **Docs**: a "The shell layer" section in `README.md`, beside the completion one.
- **Deferred:**
  - **Ward's in-process picker.** Still deferred, and this entry is the argument that it can stay
    that way longer than 0022 assumed: the deliberate entry intent requires is expressible in the
    shell function itself, and a shell-level picker runs out of process, owns no TTY negotiation,
    and cannot block an agent — the same three properties that made completion the safe half. _Why
    safe:_ what an in-process picker would add is the visual cues (accent, glyph) that only Ward can
    render, and nothing here forecloses it — `shell candidates` already emits the name-plus-cue
    shape such a picker would consume, and swapping `__ward_picker` for `ward pick repos` is a
    two-function edit in one generated file.
  - **bash and zsh layers.** _Why safe:_ the seam is one constant and one row in `LAYERS`, and the
    shorthands themselves are `ward` invocations every shell can make — what differs is only
    function syntax and the `complete` dialect. Emitting a second layer before anyone has typed
    `wrcd` in anger would be guessing at the set.
  - **A configurable picker preference** (`shell.picker` in the global config). _Why safe:_ the
    config axis exists (0024) and the seam is two functions, so this is a later three-line change;
    inventing a key for one hard-coded value would be configuration for its own sake.
  - **The shorthand ladder anywhere but `repo path`.** `workspace path` still takes an exact name or
    a path. _Why safe:_ workspace names are few and are chosen by the human registering them, the
    noun is picked far more often than typed, and a failed name falls into the picker anyway — the
    ladder earns its complexity where the cardinality is (repositories).
  - **A `--json` shape for `shell candidates`, and a `matched` field on `repo path --json`.** _Why
    safe:_ the feed is a machinery format for one consumer, not a contract; and `repo path`'s
    existing `repo` field already carries the name that answered, which is the whole of what a
    caller learns from the match — while an agent, who is the only `--json` audience, never gets an
    inexact one.
  - **An installer verb** (`ward shell install fish`). _Why safe:_ 0022's reasoning verbatim — the
    redirect is the convention, and §18 keeps Ward out of the human's shell configuration.
- **Acceptance:** `mise run check` green, and `bun test test/cli/shell.test.ts` proving: the emitted
  script carries the three functions, the two-line picker seam, and the three `complete`
  definitions; it parses under `fish --no-execute`; an unbuilt shell is refused with the list; the
  candidate feeds' contents, order, staleness rule, their silence when empty, and their silence when
  the registry will not parse; the ladder's four rungs with their stderr echoes,
  exact-beats-shorthand across workspaces, the ambiguity refusal, and the agent's exact-only
  resolution with its near-miss; `shell candidates` writing no telemetry row and not churning the
  MRU while `shell init` does both; doctor naming the picker either way; and — the real proof this
  is a shell feature — `wrcd`, `wwcd`, and `wrr` actually run by `/usr/bin/fish`, with and without a
  picker on PATH.

## Design

- **Decisions:** no new ADRs — optique is already the CLI stack
  ([ADR 0004](../decisions/0004-optique-picocolors.md)) and nothing here needs a new dependency (fzf
  is invoked by the human's shell, never by Ward). Entry-local:
  - **`ward shell init fish`, not `ward shell fish`.** The brief proposed the latter as a sibling of
    `ward completion fish`. Three reasons against: intent says the CLI is organized around **nouns
    and verbs**, and `shell fish` has no verb (`completion fish` gets away with it because the
    subcommand is optique's, not ours); the same noun must also carry the candidate feed, and
    `or(command('candidates'), <positional shell name>)` is a parse ambiguity waiting for the day
    somebody writes a shell called `candidates`; and `init <shell>` is the line every user of
    `starship`, `zoxide`, and `atuin` has already typed. That it also sidesteps reading as
    "shellfish" is a bonus, not the argument.
  - **The candidate feed is a verb, not a flag on `repo list` / `workspace list`.** The set `wrcd`
    picks from is not either verb's listing: it is the union across the workspaces `repo path`
    searches. Getting it from `repo list` would have meant a flag that changes **what** is listed,
    not how it is printed — and a plumbing output mode bolted onto a human-facing verb. Putting it
    under `shell` instead makes the telemetry rule principled rather than special-cased:
    `shell
    candidates` is the emitted layer's own callback, the same class of thing as a
    completion callback, and the noun says so.
  - **The fuzzy rule lives in Ward, not in fish.** `wrcd dot` works because `ward repo path dot`
    works. The rule is then deterministic, unit-testable, identical for whoever calls it, and
    available to a bash layer for free — and the fish function stays four lines. Implementing
    subsequence matching in fish would have been business logic in the shell, which the subsystem
    contract's first constraint forbids.
  - **Rung by rung across the whole search order, not workspace by workspace down the ladder.** With
    `shared-extra` in the workspace underfoot and `shared` in the default, `ward repo path shared`
    must reach the repository actually named `shared`. Descending the ladder inside each workspace
    before moving on would make a repository unreachable by its own name the day a longer one
    appeared beside it in a nearer workspace — a resolution that changes meaning because of state
    the caller did not touch.
  - **Prefix before substring.** With `dotfiles` and `my-dotfiles` registered, `dot` is a unique
    prefix of one and a substring of both. Collapsing the two rungs would make `dot` ambiguous and
    the ladder useless in exactly the case it was built for. Exact stays case-**sensitive** and
    first; the fuzzy rungs are case-insensitive, because a shorthand is typed fast.
  - **The ladder is human-only, and the refusal names the near miss.** A shorthand's meaning depends
    on what else is registered, so the same agent call could change answers because an unrelated
    repository was added — the incidental-state coupling [0006](../0006-scope-from-cwd/README.md)
    refuses for cwd-derived task codes, applied to a name. But declining to _resolve_ a shorthand
    and declining to _say what it was_ are different acts: the refusal carries
    `did you mean 'dotfiles'?`, so the agent corrects in one step. The path verbs stay 0024's "both
    audiences, from anywhere" exception in every other respect.
  - **`wrcd` does not swallow `ward repo path`'s stderr.** The alternative needs a temp file (fish
    command substitution captures stdout only) to keep the crossed-workspace echo for the success
    case while hiding the failure message. Keeping it is better anyway: reading _'zzz' matches
    nothing in workspace 'main'_ and then landing in a prefilled picker is the honest sequence. fzf
    draws on the alternate screen, so the message is still there afterwards.
  - **`wwcd` with no name and no picker takes the default workspace.** The brief left this open. It
    is right because a bare `ward workspace path` already means the default (0024 chose that
    deliberately), so the fallback is not an invention — and it makes `wwcd` the one shorthand that
    never fails for want of a picker. It says so on stderr, because it is an implicit input.
  - **`complete -c wrr -w 'ward repo refresh'`.** Wrapping, not re-describing: `wrr` inherits the
    live repository-name suggestions ward's own generated script produces, so a new flag on
    `repo refresh` completes under `wrr` with no edit here. This is 0022's "never a second
    description of the command tree" honored at the one place this entry could have violated it.
  - **`NAME<TAB>CUE`, one line each.** It is what `complete -a` reads as value-and-description, what
    a picker splits a display column on, and what optique's completion protocol already emits — one
    encoding for both consumers. No escaping is owed: a repository name is a directory name and a
    workspace cue is a path, neither of which can hold a tab.
  - **The picker seam is two functions, and the test asserts it.** `__ward_picker_present` and
    `__ward_picker` are the only running lines that name fzf, and they sit above every shorthand.
    The test counts `command fzf` / `command -q fzf` lines and checks they precede `function wrr` —
    so the seam is enforced, not merely intended.
  - **The fish layer is hand-written, and that is not 0022's violation.** 0022 refuses a
    hand-written `ward.fish` because it would be a second description of Ward's command tree. This
    script describes nothing: `wrr` forwards `$argv` blind, the cd functions ask Ward where to go,
    and completion is delegated or fed. Adding a verb to `src/cli/index.ts` requires no edit here.
  - **The script is a TypeScript string, not a `.fish` file read at runtime.** What ships is what
    the module holds, with no path resolution that differs between `bun src/cli/index.ts` and a
    compiled binary.
  - **`anyRepoName()` now reads `repoCandidates`.** The completion suggester and the picker feed
    were about to be two readers of "which repository did you mean?" — exactly the drift
    `src/cli/suggest.ts` opens by refusing. One reader, two surfaces.
  - **Doctor gains a picker check because a verb degrades on it.** §20's loop is explicit: an
    "unavailable" another surface reports honestly must be a condition doctor can name. It is never
    worse than `info` — declining to install a fuzzy finder is a choice, not a fault.
- **Layout:** `src/shell/` (new): `layer.ts` (the shell → script table and the refusal), `fish.ts`
  (the script), `candidates.ts` (the two feeds and their `NAME<TAB>CUE` rendering).
  `src/global/locate.ts` (the ladder, the ambiguity refusal, the near-miss helper; `RepoLocation`
  gains `matched`). `src/cli/index.ts` (the `shell` noun, the two handlers, the inexact-match echo
  in `cmdRepoPath`, `!callerIsAgent()` passed as `fuzzy`). `src/cli/telemetry.ts`
  (`isMachineryInvocation`, `shell` in `VERB_TREE`). `src/cli/suggest.ts` (`anyRepoName` over the
  shared reader). `src/workspace/doctor.ts` (`pickerFinding`). `README.md`. Tests:
  `test/cli/shell.test.ts` (new file only). No schema change, no record change, no new state: the
  shell layer stores nothing.
- **Mechanisms:** _install:_ `ward shell init fish` prints `FISH_LAYER`; the human redirects it into
  `conf.d/`, where fish sources it at startup and the three functions and three completions exist.
  _`wrcd NAME`:_ `ward repo path NAME` runs the ladder across the search order and prints one path
  (echoing an inexact match or a crossed workspace on stderr); the function `cd`s to it. _`wrcd`
  with nothing, or a name that did not resolve:_ `ward shell candidates repos` produces the
  `NAME<TAB>CUE` lines, `__ward_picker_present` decides between fzf and the printed listing, and the
  chosen name goes back through `ward repo path`. _Completion:_ fish runs
  `ward shell candidates repos` per TAB and reads the tab as the description separator. _Telemetry:_
  `isMachineryInvocation` sees `shell candidates` in argv and skips both the row and the MRU touch,
  before either can happen.

## Build log

### 2026-08-21 — The whole entry in one iteration

**Goal.** Everything in Scope. **What was done.** Read `07-human-shell` whole, 0022 and 0024, and
`suggest.ts`/`telemetry.ts` before designing. Probed the fish semantics the script depends on
against the installed `/usr/bin/fish` **before** writing it — that `set -l x (cmd)` propagates the
command substitution's exit status (so `or return $status` works after a `set`), that `$argv[1]` on
an empty argv makes `test -n "$name"` false, and that `string split -f1 \t` and
`string replace -a \t` behave as assumed. Then: `src/shell/` (three files), the ladder in
`locate.ts`, the `shell` noun and its two handlers, the telemetry and MRU rule, the doctor finding,
the README section, and `test/cli/shell.test.ts` (19 cases).

**What works now — with the exact commands that prove it** (Bun 1.3.14, fish 3.6.0, git 2.54.0,
Linux). In a scratch workspace registered as `ws`, with repositories `dotfiles`, `my-dotfiles`, and
`ward`:

- **The ladder, all four rungs.** `ward repo path ward` → the path, stderr silent.
  `ward repo path
  dot` → `repository dotfiles — 'dot' matched it by prefix` on stderr, the path on
  stdout. `ward
  repo path my-` → `my-dotfiles`, by prefix. `ward repo path files` → exit 1,
  `'files' matches 2 repositories in workspace 'ws': dotfiles, my-dotfiles — name one exactly`.
- **The §8 asymmetry.** `WARD_AGENT=1 ward repo path dot` → exit 1,
  `… (a declared agent resolves names exactly — did you mean 'dotfiles'?) …`;
  `WARD_AGENT=1 ward repo path ward` → the path, unchanged.
- **The feed.** `ward shell candidates repos` from inside the workspace and from `$HOME` both print
  `dotfiles\tws`, `my-dotfiles\tws`, `ward\tws`; `ward shell candidates workspaces` prints
  `ws\t<path>`; `ward shell candidates bogus` is refused by the parser naming both kinds.
- **Emission.** `ward shell init fish | fish --no-execute /dev/stdin` → clean parse;
  `ward shell init bash` → exit 1,
  `no shell layer for 'bash' — available: fish (the other shells are unbuilt, not unsupported)`.
- **The shorthands, in a real fish** (a `ward` shim on PATH, the emitted script sourced, a clean
  `HOME` so the machine's own installed `ward` cannot shadow it): `wrcd ward` from `/` → the
  checkout, with `workspace ws — … (from the registry)` on stderr; `wrcd dot` → the `dotfiles`
  checkout with the prefix echo; `wwcd ws` → the workspace root; `wrr` → the refresh table.
- **Completion, in a real fish** with both scripts sourced: `complete -C 'wrcd d'` → `dotfiles\tws`;
  `complete -C 'wwcd '` → `ws\t<path>`; `complete -C 'wrr '` → `dotfiles\tmaster`,
  `my-dotfiles\tmaster`, `ward\tmaster`, `--help` — byte-identical to
  `complete -C
  'ward repo refresh '`, which is the wrap working.
- **Degradation, with fzf off PATH:** `wrcd` →
  `ward: no picker installed — install fzf, or name one
  of these:` and the three candidates,
  exit 127. `wwcd` → `going to the default workspace` on stderr, and it lands there, exit 0. Neither
  hangs, neither prompts.
- **Telemetry:** two `shell candidates` runs in the workspace left `.ward/telemetry/` with no file
  at all; one `ward shell init fish` then wrote exactly one row, `verb: "shell init", exit: 0`.
- **Doctor:** `ward doctor` → `✓ picker — fzf available — the shell layer can pick interactively`;
  with fzf off PATH, the `info` line naming the fallback.
- `bun test test/cli/shell.test.ts` → `19 pass, 0 fail, 91 expect() calls`.
- `bun test` → `424 pass, 0 fail, 1732 expect() calls` across 39 files (from `405 / 1641 / 38`
  before this entry — the nineteen new cases, no existing case changed).
- `mise run check` → exit 0.

**Decisions.** All recorded under Design → Decisions. The two found while building rather than
before: `wrcd` **not** swallowing `ward repo path`'s stderr (the temp-file machinery the alternative
needs is not worth the tidier failure, and the untidy one is more honest), and the ladder running
**rung by rung across the search order** rather than workspace by workspace — the first shape made a
repository unreachable by its own name whenever a longer name sat in a nearer workspace, which the
test `exact beats a shorthand, even one in a workspace searched earlier` now pins. One false alarm
worth recording: staging "no picker installed" by filtering `fzf`-holding directories out of the
real PATH silently removed `git` too (on this machine both live in `/usr/bin`), which failed two
cases in a way that looked like a shell-layer bug. The fixture now builds three one-file PATH
directories — a `git` shim, an `fzf` shim, a `ward` shim — so each case states exactly what is
installed. That is worth a general note: **a test that varies "is X installed" must own the whole
PATH, not subtract from the machine's.**

**Next.** In dogfood order: let telemetry say which shorthand set is actually wanted before adding a
fourth (`wt` for a task worktree is the obvious candidate, and 0024's `wcd` naming suggests the
question of one prefix versus three is still open); a bash layer once someone asks; `shell.picker`
in the global config when someone wants fzy. The in-process picker stays deferred, now with a
concrete reason it can stay that way.

## Spec-feedback

- **SF-001** — [`human-shell`](../../intent/02-subsystems/07-human-shell.md), _Supply nouns by
  recognition, never by recall_, the **interactive resolution (the picker)** bullet. _Friction:_ the
  slice locates the picker **"in the process"** — "It runs **in the process**, owns its rendering,
  and **branches on caller identity**" — as part of distinguishing it from shell completion. But the
  property that actually matters in the same sentence is the one before it: that the mode is
  **entered deliberately**, not as a side effect of an omitted argument. This entry enters it
  deliberately (typing `wrcd` with no name is the act) and runs it **out** of process, in the
  shell's own picker. Everything the constraint is protecting holds — the entry is explicit, every
  non-interactive `ward` invocation stays deterministic, and an agent can never be routed into it
  because an agent does not source a fish function. Read literally, though, a shell-level picker
  looks like a violation rather than the cheapest correct build of the requirement, and the
  in-process clause quietly implies Ward must own a TTY before a human can pick anything.
  _Assumption to keep moving:_ "in the process" is read as a **consequence** of the visual-cue
  requirement (accent and glyph can only be rendered by whoever draws the menu), not as an
  independent constraint on where picking may happen; a shell-level picker is a legitimate build of
  the deliberately-entered mode, offering the cues that surface can carry, exactly as 0022 read the
  completion half. _Proposed revision:_ state the picker's constraints as **deliberate entry**,
  **deterministic for every non-interactive caller**, and **never reachable by an agent**, and note
  that **where** it runs is an implementation choice with a stated consequence — a shell-level
  picker is cheap and agent-safe but limited to text cues, while an in-process one is what unlocks
  accent and glyph. That would let this entry and a future in-process picker both read as builds of
  the same constraint rather than one superseding the other. _Disposition:_ adjudicated —
  [crumley/ward#50](https://github.com/crumley/ward/pull/50).
- **SF-002** — [`human-shell`](../../intent/02-subsystems/07-human-shell.md), _The interactive layer
  adds mnemonic shorthands for common operations_. _Friction:_ the slice says the alias set is
  expected to churn ("Not a fixed alias set — aliases are expected to churn as telemetry reveals
  real usage") but says nothing about what a human's shell configuration is supposed to do when it
  does. A shorthand set installed by redirect is a **snapshot**: `ward shell init fish` written into
  `conf.d/` in August still defines August's functions in December, and nothing tells the human
  their layer is stale. Completion has the identical problem and 0022 answered it with one line of
  README ("Re-run the command after upgrading Ward"), which is the honest answer for a feature the
  intent does not expect to churn — and a thin one for a feature whose slice says churn is the
  point. _Assumption to keep moving:_ the same README line, and the version-skew surface intent
  already describes is where this belongs if it is worth solving; nothing here is shaped to prevent
  a `shell init` that a shell could re-run at startup. _Proposed revision:_ if the churn expectation
  is meant seriously, say in the slice that the emitted layer must be **re-obtainable cheaply and
  its staleness visible** — either by the shell re-running the generator at startup (the
  `starship init` convention) or by the version-skew surface naming an out-of-date shell layer among
  the things that need the human. Either way, the constraint that churn is expected should carry the
  obligation that churn is **deliverable**. _Disposition:_ adjudicated —
  [crumley/ward#50](https://github.com/crumley/ward/pull/50).
