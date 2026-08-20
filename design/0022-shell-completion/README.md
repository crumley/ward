# 0022 — Shell completion: the parser teaches the shell, the record fills it in

> `ward completion <shell>` emits a completion script for fish, bash, zsh, PowerShell, or Nushell —
> generated from the noun/verb parser itself, never hand-written — and the generated script calls
> back into `ward` on every TAB for **live** candidates read from the workspace the caller is
> standing in: open task codes with their slugs, registered repository names, open session ids,
> stewardship branches the main line does not hold, and `ward schema` verb phrases completed one
> word at a time. Outside a workspace the tree still completes itself and the record half answers
> nothing. A callback is the shell asking, not a human invoking, so it writes no telemetry row;
> generating a script does, as verb `completion`.
>
> **Status:** accepted · **Started:** 2026-08-19

Completion is the first piece of `07-human-shell`'s interactive-resolution constraint to be built,
and deliberately the cheap half: the shell already knows how to show a menu and filter it, so
"autocompletes partially-typed nouns, verbs, and identities" costs a parser that can name its own
candidates — no prompt, no picker, no TTY. The expensive half (a picker for a _missing_ argument,
with the human's visual cues) stays deferred, and this entry says why the two are separable.

## Serves intent

- [`human-shell`](../../intent/02-subsystems/07-human-shell.md) — the constraint verbatim: the shell
  "**autocompletes** partially-typed nouns, verbs, and identities". Nouns and verbs come from the
  parser tree; **identities** — the task code, the repository name, the session id — are exactly
  what a human cannot be expected to recall, which is the prime directive's own argument for this
  feature ("making them recall an exact handle … is precisely the friction Ward exists to remove").
  Also: _All real logic lives in the Ward tool_ — the generated script is plumbing that asks `ward`
  a question and prints the answer, holding no knowledge of Ward's nouns; and _§8 asymmetry_ —
  completion is a **human-audience** affordance that can never block anyone, because it runs
  out-of-process, before the command, and its worst failure is an empty menu.
- [`domain-model`](../../intent/01-concepts/00-domain-model.md), _Identity_ — codes and session ids
  are unique among **open** things and reused after close. That single sentence decides what every
  identity suggester offers: non-closed only, because a closed task's code either addresses nothing
  or addresses somebody else's task.
- [`principles`](../../intent/00-foundation/01-principles.md) — §17: a suggester never fabricates
  (git cannot answer → no branches, not a guessed list); §20: every failure degrades to "no
  suggestions", never to shell noise — a completion callback runs inside the human's terminal
  mid-keystroke, where an exception is the most expensive thing a program can emit; §4: telemetry
  stays the local, analyzable usage signal it was built to be, which is why keystroke callbacks are
  kept out of it.
- [`json-shape-home`](../0008-json-shape-home/README.md) (design) — `ward schema VERB…` completes
  from the shape **registry**, so a new `--json` verb becomes completable by its registry row alone;
  the self-describing contract extends to the keyboard.

## Scope

- **In:**
  - **Completion enabled** in `src/cli/index.ts` via optique's `completion: 'command'` — the
    `ward completion <shell>` subcommand, which both **generates** the script and **serves** the
    per-TAB callback the generated script makes. Five shells ship with optique 1.1.1: `fish`,
    `bash`, `zsh`, `pwsh`, `nu`; an unknown shell is refused with the available list, exit 1.
  - **Dynamic suggestions** (`src/cli/suggest.ts`), each an `async` value parser wrapping optique's
    `string()` and adding only `suggest(prefix)`:
    - **task codes** (`taskCode`) — non-closed tasks, slug as the description; bound to
      `task pause|resume|close|pr CODE`, `worktree create|rebase TASK`, `session open TASK`,
      `workspace upgrade TASK`;
    - **repository names** (`repoName`) — the registered set, main line as the description; bound to
      `--repo NAME` and `repo refresh NAME`;
    - **open session ids** (`sessionId`) — task code as the description; bound to
      `session close ID`;
    - **stewardship branches** (`workspaceBranch`) — local branches of the workspace's own
      repository the main line does not already contain; bound to `workspace merge BRANCH`;
    - **schema verbs** (`schemaVerb`) — the `jsonVerbShapes` registry, completed one word at a time;
      bound to `schema VERB…`.
  - **The three callback contracts**, held in one wrapper so every suggester inherits them: never
    throw; yield only what starts with the prefix; outside a workspace yield nothing.
  - **Telemetry** (`src/cli/telemetry.ts`): a completion **callback** is not recorded (it fires per
    keystroke); `ward completion <shell>` **is**, as verb `completion`, added to `VERB_TREE`.
  - **Both audiences, unchanged**: nothing here alters what any verb accepts — the suggesters wrap
    `string()` and change only what the shell offers, so an agent's explicit call is byte-identical
    to what it was.
  - **Docs**: a "Shell completion" section in `README.md` with the per-shell install line, fish
    first.
- **Deferred:**
  - **The interactive picker** — the other half of the intent constraint: a human who omits a
    required argument still gets the deterministic error naming the fix (0006), not a prompt. _Why
    safe:_ the two halves are genuinely separable — completion happens **before** the command runs,
    in the shell, with no TTY negotiation and no agent hazard, while a picker is an in-process
    interactive affordance that must branch on `callerIsAgent()` and own a TTY. Completion also
    removes most of the picker's demand: the argument is rarely missing if it was easy to type.
    (Filed as SF-001, because intent states them as one clause.)
  - **Visual cues in the menu** —
    [`05-visual-theming`](../../intent/02-subsystems/05-visual-theming.md)'s accent color and type
    glyph beside each candidate. The shell completion protocols carry a **plain text description
    column and nothing else** (optique's encoder even strips tabs and newlines, and fish/zsh style
    the column themselves). _Why safe:_ the description already carries the recognizable cue that
    matters today — the slug behind `t1`, the main line behind a repo name — and glyph/accent land
    naturally in the picker, which owns its own rendering. (SF-001.)
  - **Project slugs, floors, PR urls, outcomes.** `--outcome` is already a `choice()`, which optique
    suggests for free; the rest are either new names being coined (`task open SLUG`,
    `project open SLUG`, `workspace create PATH`) — where a suggestion would be nonsense — or values
    with no cheap local source (a PR url). _Why safe:_ suggesting nothing is the honest answer for
    an argument the caller is inventing.
  - **Ranking, recency, and fuzzy matching.** Candidates come back in record order, prefix-filtered.
    _Why safe:_ the sets are small (in-flight cardinality is the whole point of short task codes),
    and the shells do their own filtering and presentation. Intent's open question about candidate
    scoping and ranking belongs with the picker.
  - **Caching the record between callbacks.** Each TAB is a fresh process that re-reads the task
    documents. _Why safe:_ it is a handful of small files and measures well below the shell's own
    latency budget; a cache would introduce staleness in exactly the surface whose value is being
    live.
  - **An installer verb** (`ward completion install fish` writing the file itself). _Why safe:_ the
    one-line redirect is the convention every shell's users already know, and writing into a human's
    shell configuration is not a thing Ward should do unasked (§18).
- **Acceptance:** `mise run check` green, and `bun test test/cli/completion.test.ts` proving: the
  emitted fish script is derived from the tree and calls back into `ward`; every shell optique ships
  emits its own script and an unknown one is refused; the tree completes itself; each identity
  suggester returns the right non-closed set with its cue, prefix-filtered; outside a workspace the
  callback exits 0, prints nothing, and says nothing on stderr; and the telemetry rule holds in both
  directions. Plus the real proof this is a shell feature: candidates appearing through
  `complete -C` in an actual `fish`.

## Design

- **Decisions:** no new ADRs — optique is already the CLI stack
  ([ADR 0004](../decisions/0004-optique-picocolors.md)). Entry-local:
  - **Optique's built-in completion, not a hand-written script.** Optique 1.1.1 generates the script
    for each shell from the parser, and the generated script calls the program back for candidates.
    A hand-written `ward.fish` would be a **second description of the command tree** — the one thing
    the four-leg discipline calls out as drift waiting to happen — and would go stale on the first
    new verb. Here a command added to `src/cli/index.ts` is completable the moment it parses, with
    no other edit anywhere.
  - **`completion: 'command'`, not `'option'` or `'both'`.** One spelling, one argv shape. The
    subcommand form (`ward completion fish`) is what every shell's install line uses and what
    optique's own help footer prints; adding `--completion fish` beside it would double the argv
    shapes that telemetry and the callback detector must recognize, to no one's benefit. (Ward's
    `--help` stays an option — help is a modifier of a command being typed, completion is a thing
    you run once at install.)
  - **Suggestions come from the verbs' own modules.** `readTasks`, `listRepositories`,
    `readOpenSessions`, `resolveWorkspaceMainLine`, `jsonVerbShapes` — the same readers the verbs
    call. A parallel reader (a quick `readdir` of `tasks/`, say) would be faster and would
    eventually disagree with the verb: a menu that offers a code the verb then refuses is worse than
    no menu, because it spends the human's attention **and** their trust. `readOpenSessions` was
    private to `sessions.ts`; it is now exported rather than reimplemented, so `session close`
    completes from the very listing `closeSession` resolves against.
  - **Async parsers, and therefore an awaited `run()`.** The record is markdown documents read
    asynchronously; optique's value parsers can be async, and their mode propagates through
    `argument` → `object` → `or` to the whole tree. So `run()` returns a promise and
    `src/cli/index.ts` awaits it. The alternative — synchronous re-readers written just for
    completion — is exactly the parallel reader above. Nothing else about parsing changes; the whole
    existing suite passes untouched.
  - **Only non-closed things are offered.** Codes and session ids are reused after close (domain
    model, Identity). Offering `t3` after t3 closed would complete to a code that names either
    nothing or the _next_ task to take it. This is the one place where a real-looking candidate
    actively misleads, so the filter is a correctness rule, not a nicety.
  - **Three contracts, held in one wrapper.** (1) _Never throw_ — a suggester's whole body is inside
    a `try`, and a failure yields nothing: an exception escaping a completion callback surfaces as
    noise in the human's terminal while they are mid-word (§20's degrade-to-a-named-lesser-answer,
    where the lesser answer is silence). (2) _Prefix only_ — optique passes the word being completed
    and expects the filtering done in the suggester. (3) _Outside a workspace, nothing_ — there is
    no record to read and guessing would be fabrication (§17). Holding all three in the
    `suggesting()` wrapper rather than in five generator bodies is what keeps a future suggester
    from quietly dropping one.
  - **`workspace merge` suggests exactly what it can act on.** `git branch --no-merged <main line>`
    against the **resolved** main line (0020's recorded name where there is one) is the set the verb
    would not answer `already-merged` for — the honest candidate list, in one git call. When git
    cannot answer (detached root, main line absent locally, no repository) the suggester yields
    nothing: the alternative, listing every branch, would offer branches the verb refuses. The
    task's brief said "if cheap enumeration isn't clean, suggest nothing rather than lying" — it is
    clean, and the failure path still tells the truth.
  - **`schema VERB…` reads the callback's own argv for position.** The verb phrase is _multiple_
    arguments (`ward schema task list`), and optique hands a value parser only the prefix, never the
    words already typed — so a prefix-only suggester would have to offer every word of every phrase
    at every position. The generated script invokes
    `ward completion <shell> <typed words…> <prefix>`: the callback's argv **is** the command line
    under the cursor. Reading it gives `task` → `list|open|pause|resume|pr|close` and nothing else.
    _Why this is safe rather than clever:_ the shape is the same one the telemetry rule already
    depends on and the same one optique's facade splits on, it is verified by test, and when the
    words are absent (any non-completion invocation) the suggester degrades to prefix-only — never
    to a wrong answer.
  - **A completion callback is not an invocation.** `recordInvocation` skips it. Telemetry exists to
    be analyzed for "which flows are clumsy" (§4); a row per TAB would bury that signal under
    keystroke noise and put a file append on the shell's latency path. Script generation is the
    opposite — a deliberate act, once per install, worth knowing about — so it is recorded as verb
    `completion`. (Intent says "per invocation" without qualification: SF-002.)
  - **The bare-`ward` guard is untouched.** `process.argv.length === 2` fires only with no
    arguments; both completion paths carry `completion <shell>` at minimum. Verified by test and by
    the live fish session.
- **Layout:** `src/cli/suggest.ts` (new — the `suggesting()` wrapper, the five suggesters,
  `isCompletionCallback`, and the argv-word helper); `src/cli/index.ts` (the suggesters bound at
  eleven argument sites, `completion: 'command'`, `await run(...)`); `src/cli/telemetry.ts` (the
  callback skip, `completion` in `VERB_TREE`); `src/workspace/sessions.ts` (`readOpenSessions` and
  its listing type exported); `README.md` (the install section). Tests:
  `test/cli/completion.test.ts` (new file only). No schema, json, or record change — completion
  reads the record and writes nothing.
- **Mechanisms:** _install:_ `ward completion fish` → optique renders its fish template with the
  program name and the callback arguments baked in → the human redirects it into their completions
  directory. _Per TAB:_ fish collects the typed tokens and the current word and runs
  `ward completion fish <tokens…> <word>` → optique's facade sees arguments beyond the shell name,
  parses all but the last against the real tree, and asks the parser in that position for
  suggestions → the value parser's `suggest(prefix)` resolves the workspace from `process.cwd()`,
  reads the record through the verbs' own modules, and yields prefix-matching literals with
  descriptions → optique encodes them as `text\tdescription` lines → fish renders the menu.
  _Telemetry:_ the same argv shape that distinguishes the two paths decides whether a row is
  appended at exit.

## Build log

### 2026-08-19 — The whole entry in one iteration

**Goal.** Everything in Scope. **What was done.** Verified optique 1.1.1's completion API against
the installed package before writing anything (`node_modules/@optique/core/dist/completion.js`,
`facade.js`, `valueparser.d.ts`) — five shells, `ValueParser.suggest(prefix)`, and the facade's
split between script generation (no arguments after the shell name) and callback (one or more).
Probed the **generated fish script against a stub program in a real fish** to pin the callback argv
before designing around it, because the whole telemetry rule and the `schema` positional trick rest
on it. Then: `src/cli/suggest.ts` (wrapper + five suggesters), the eleven bindings and
`completion: 'command'` in `src/cli/index.ts`, the telemetry rule, `readOpenSessions` exported, the
README section, and `test/cli/completion.test.ts` (12 cases).

**What works now — with the exact commands that prove it** (Bun 1.3.14, git 2.54.0, Linux):

- **The callback argv shape, measured, not assumed.** A stub on `PATH`, the generated script sourced
  in fish, and `complete -C 'wardstub task pause '` → the stub logs
  `[completion] [fish] [task] [pause] []` — five arguments, the last an **empty string**. So fish
  always passes the word being completed, and `completion <shell>` alone is unambiguously script
  generation. `complete -C 'wardstub task pa'` → `[completion] [fish] [task] [pa]`.
- **Script generation:** `bun src/cli/index.ts completion fish | head` → `function __ward_complete`,
  ending in `complete -c ward -f -a '(__ward_complete)'`; `bash`, `zsh`, `pwsh`, `nu` each emit
  their own; `completion csh` → exit 1 with `Error: Unsupported shell "csh".` and the available
  list.
- **Live suggestions**, in a scratch workspace (`repo add` of a bare origin as `demo`, tasks
  `shell-completion`/`second-thing`, a session on t1, a stewardship worktree on t2 with a commit):
  - `bun src/cli/index.ts completion fish task pause ''` → `t1\tshell-completion`,
    `t2\tsecond-thing`; with prefix `t1` → `t1` alone.
  - `… completion fish repo refresh ''` → `demo\tmain`; `… worktree create t1 --repo ''` →
    `demo\tmain`.
  - `… completion fish session close ''` → `shell-completion-1\ttask t1`.
  - `… completion fish workspace merge ''` → nothing while the stewardship branch sat at the main
    line's tip (it _is_ merged — the verb would say `already-merged`), then `steward/second-thing`
    once a commit landed on it. The suggester tracking that transition is the honesty check.
  - `… completion fish schema ''` → the eight first words; `… completion fish schema task ''` →
    `list open pause resume pr close` and no first words.
- **End to end in a real fish** (`ward` wrapper on `PATH`, generated script sourced, clean `HOME` so
  the machine's own installed `ward` does not shadow it):
  `fish -c "cd <ws>; source ward.fish; complete -C 'ward task pause '"` → `t1\tshell-completion` /
  `t2\tsecond-thing`; `complete -C 'ward ta'` → `task`; `complete -C 'ward workspace merge s'` →
  `steward/second-thing`; `complete -C 'ward worktree create t1 --repo '` → `demo\tmain`.
- **Telemetry:** after eight callbacks in the scratch workspace, `.ward/telemetry/usage-*.jsonl`
  held only the four real invocations (`repo add`, `task open` ×2, `session open`); two
  `ward completion <shell>` runs then appended two rows with `verb: "completion"`, `exit: 0`.
- `bun test test/cli/completion.test.ts` → `12 pass, 0 fail, 109 expect() calls`.
- `bun test` → `332 pass, 0 fail, 1403 expect() calls` across 35 files (from `320 / 1294 / 34`
  before this entry — the twelve new cases, no existing case changed).
- `mise run check` → exit 0 (Biome + dprint + `tsc --noEmit` + `bun test` + lychee).

**Decisions** (found while building, all recorded under Design → Decisions): the async-mode
propagation was the one architectural consequence — a single async value parser makes the whole tree
async and `run()` awaited — and it landed with **zero** changes to any existing test, which is the
evidence that it is a parsing-mode change and not a behavior change. Two false alarms worth
recording so the next builder does not re-chase them: (1) fish appeared to drop the empty current
word, since `set -l x (printf "\n")` yields an empty **list** — but `commandline -ct` under a real
completion yields an empty **string**, which the stub probe settled; (2) `complete -C 'ward …'`
returned nothing for a long while because this machine's own `~/.bun/bin/ward` (an older build,
without `completion`) won the `PATH` after the user's fish config re-ordered it — an environment
artifact, not a defect, and the reason the fish proof runs with a clean `HOME`.

**Next.** In dogfood order: the interactive picker for a genuinely missing argument (the deferred
half, with `callerIsAgent()` branching and the visual cues that only an in-process renderer can
carry); project floors and slugs once a verb takes one where recall is hard; a `needs you`-aware
ordering of task candidates if telemetry says the recall problem is "which of my six", not "what was
the code".

## Spec-feedback

- **SF-001** — [`human-shell`](../../intent/02-subsystems/07-human-shell.md), _Resolve missing or
  ambiguous arguments interactively — and make it delightful_. _Friction:_ the slice binds
  **autocomplete** and the **interactive picker** into one constraint, and attaches the visual-cue
  requirement (identity handle plus accent color and type glyph, so "the blue 🗂️ one" is selectable)
  to both. They are not one mechanism. Completion runs **in the shell, before the command exists**:
  no TTY, no prompt, no agent hazard, and a candidate list whose only presentation channel is a
  plain text description column — the shell protocols carry nothing else, so accent and glyph are
  not merely unbuilt here, they are unbuildable at this surface. The picker runs **in the process,
  after a verb was invoked without its noun**, owns its rendering, and must branch on caller
  identity. Read as one clause, the slice makes shipping the cheap, agent-safe half look like a
  partial implementation of the expensive one. _Assumption to keep moving:_ treated as two
  mechanisms behind one intent — completion built now, offering the recognizable cue the protocol
  does carry (slug behind the code, main line behind the repo name); the picker and its visual cues
  left whole for a later entry, with the missing-argument path unchanged (deterministic error, never
  a prompt). _Proposed revision:_ split the constraint into **completion** (shell-level, out of
  process, human-audience but harmless to agents, cues limited to what the shell protocol carries)
  and **interactive resolution** (in-process, TTY-owning, `callerIsAgent()`-branching, where the
  accent/glyph requirement lives), stating that the first reduces demand for the second and that
  both serve the same "do not make them recall a handle" purpose.
- **SF-002** — [`human-shell`](../../intent/02-subsystems/07-human-shell.md), _Record command usage
  as local telemetry_. _Friction:_ the constraint says "**per invocation**", and a completion
  callback is, mechanically, an invocation of the binary — several per typed command, one per TAB.
  Recording them would satisfy the letter of the constraint and destroy its purpose, which the same
  sentence states: the signal is analyzed to decide "what needs a new alias, which flows are
  clumsy". Keystroke rows would swamp that, and an append on every TAB puts telemetry on the shell's
  latency path — against the "costs the command nothing" posture 0013 built. _Assumption to keep
  moving:_ "invocation" means **a command the caller asked for**; a completion callback is the
  shell's own machinery and is not recorded, while the deliberate `ward completion <shell>` is,
  under verb `completion`. _Proposed revision:_ say in the slice that telemetry records **commands
  the caller invoked**, explicitly excluding machinery invocations the interaction layer makes of
  itself (completion callbacks today; anything similar later) — and note the reason, that such rows
  would degrade the very analysis the constraint exists to enable.
