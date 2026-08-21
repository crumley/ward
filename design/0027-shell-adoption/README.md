# 0027 — Adoption: the shorthands as files you own

> `ward shell adopt fish [NAME…]` writes the **real definition** of a shorthand the human names into
> `functions/<name>.fish` and `completions/<name>.fish` under their fish configuration — a snapshot
> they then own, track, and edit. Naming nothing prints the offering (`available` / `current` /
> `changed` / `yours`) and writes nothing; `--all` takes everything; `--dir PATH` writes into a
> dotfiles repo's stow package instead of the live configuration; `--force` is the only way past a
> file ward did not write. `ward shell diff fish NAME` shows what has moved on, and `ward doctor`
> reports drift **per alias** with all three of the human's choices named — ignore it, see it, take
> it. `ward shell init fish` is untouched and stays the always-fresh style.
>
> **Status:** accepted · **Started:** 2026-08-21

[0025](../0025-fish-shell-layer/README.md) emitted one monolithic layer the human redirects into
`conf.d/`, and [0026](../0026-shell-staleness-doctor/README.md) made its staleness visible — one
verdict for the whole file. Both entries deferred "an installer verb" with the same sentence: §18
keeps Ward out of the human's shell configuration. This entry builds it anyway, because the owner
asked for something the deferral was not about:

> I don't think the fish command not found hook is the way to go here. I like that it's explicitly
> like, look, if you decided that you want to adopt this specific fish alias that Ward is offering,
> then great, we're gonna install it just as that. and the user can then track that file. and if it
> changes, Ward can say, hey, look, the command `wrr` has changed. Your choices are to ignore it or
> here's the diff, or you can choose to adopt it. The user gets to choose what to do.

What §18 forbids is Ward writing into somebody's shell configuration **unasked**. Naming a shorthand
is the ask. So the deferral holds exactly as stated and this entry sits beside it: the human's act
of naming `wrcd` _is_ the install, nothing is written that was not named, and naming nothing writes
nothing at all.

## Serves intent

- [`human-shell`](../../intent/02-subsystems/07-human-shell.md) — _The interactive layer adds
  mnemonic shorthands … **evolvable** as telemetry reveals real usage_, and its clause amended by
  0025's SF-002: **churn must be deliverable** — "whatever installed form the shorthands take in the
  human's shell configuration, that form is **cheaply re-obtainable** from the tool, and its
  **staleness is visible**". Adoption is a second installed form, and it honors both halves at a
  finer grain than the layer can: re-obtaining is `ward shell adopt fish wrr`, and staleness is
  visible **per alias**, with a diff. Also _Verbs read true to the operation_ — the argument for the
  name (below). Also _A self-diagnosis command_ and its §20 clause: every state adoption can be in
  is a condition doctor names, including the one that only exists because two install styles do.
  Also _All real logic lives in the Ward tool_ — the fish written into the human's configuration is
  the same fish the layer holds, assembled by Ward, and it describes nothing about Ward's command
  tree.
- [`workspace-lifecycle`](../../intent/01-concepts/06-workspace-lifecycle.md) — the **repair
  posture**: doctor reports and recommends, and **the human enacts**. This entry is the first place
  where the enacting verb exists, and the split is kept exact — doctor prints
  `ward shell adopt fish wrr` and runs nothing. Also the **global-state boundary**: these files hold
  conveniences, so nothing here is ever an `error`.
- [`principles`](../../intent/00-foundation/01-principles.md) — **§18**: Ward writes only what it
  was asked for, by name; the selection surface writes nothing; a file without ward's marker is
  never overwritten without `--force`. **§6**: adopting converges — a file already holding these
  bytes is not rewritten at all, so a re-run costs no mtime in a tracked dotfiles repo. **§17**: an
  adopted file's standing is **derived** from its bytes — no manifest, no stamp, nothing two writers
  could disagree about. **§8**: the offering and the write report reach an agent as one documented
  `--json` document. **§20**: declining to overwrite is reported as `kept`, not as success.

## Scope

- **In:**
  - **`ward shell adopt <shell> [NAME…]`** (`src/shell/adopt.ts`, `src/cli/index.ts`):
    - **No names** → the offering: every shorthand with its standing — `available`, `current`,
      `changed`, `yours` (plus `unreadable`, below) — and the two commands that act on it. Writes
      nothing.
    - **Names** → adopts those. **`--all`** → adopts every one; naming both is refused.
    - **`--dir PATH`** → writes into that fish configuration root instead of the live one.
    - **`--force`** → replaces a file carrying no ward marker; without it such a file is `kept`.
    - **`--json`** → the offering and the write report under `shellAdoptShape`
      (`src/cli/schema.ts`), registered as a mutation verb so `ward schema shell adopt` documents
      it.
    - Exit 0 throughout, including a `kept` file and a `changed` alias; 1 only for an unbuilt shell,
      an unoffered name, contradictory selections, and operational failure.
  - **`ward shell diff <shell> [NAME…]`** — the unified diff of each named shorthand's files, `-`
    being the human's copy and `+` ward's offer. Writes nothing, honors `--dir`, silent when nothing
    differs, exit 0 always.
  - **What is written, per adopted shorthand**: `functions/<name>.fish` (the real function body),
    `completions/<name>.fish` (its `complete` line), and one file per helper it transitively needs
    (`functions/__ward_choose.fish`, `functions/__ward_picker.fish`,
    `functions/__ward_picker_present.fish`). Every file opens with `FISH_ADOPTED_MARKER` and names
    no path.
  - **The emission decomposed** (`src/shell/shorthands.ts`, new) — the shorthands and helpers as
    units (body, completion, dependencies, summary), from which `fish.ts` assembles the monolithic
    layer and `adopt.ts` assembles the per-alias files. The layer's emitted bytes are **unchanged**,
    byte for byte, which is the proof the decomposition forked nothing.
  - **A unified diff** (`src/shell/diff.ts`, new) — line-oriented, `diff -u`-compatible output.
  - **Doctor, per adopted alias** (`src/workspace/doctor.ts`): `current` → ok; `changed` → **warn**
    naming the alias, the files that differ, `ward shell diff fish NAME`,
    `ward shell adopt fish
    NAME`, and that keeping theirs is a choice; `yours` → info, kept;
    `unreadable` → warn with the reason; the un-adopted remainder → **one** dim info line. Plus the
    **shadowing** warn: an installed `conf.d/ward.fish` defines the same functions at startup and
    wins over anything autoloaded, so adopted files beside it never run. 0022/0026's two whole-file
    findings are untouched.
  - **Docs**: the two install styles side by side in `README.md`, and when each fits.
- **Deferred:**
  - **The `fish_command_not_found` hook** — the alternative the owner rejected; recorded in full
    under Design → Decisions, because it is the road not taken and the reasons are not only the
    owner's.
  - **`--json` on `shell diff`.** _Why safe:_ a unified diff is already a machine-readable format
    with a specification older than Ward, and wrapping the same bytes in a JSON string would be a
    second encoding of one payload. An agent that wants the standings rather than the bytes reads
    `ward shell adopt fish --json`, which answers exactly that without writing.
  - **Adopting a helper on its own** (`ward shell adopt fish __ward_choose`). _Why safe:_ helpers
    are dependencies, not offers — nothing in the human's vocabulary calls `__ward_choose` — and
    they arrive and refresh with whichever shorthand needs them. The offering lists what a human
    would type.
  - **bash and zsh adoption.** _Why safe:_ 0025's seam reason, plus a new one: `functions/<name>`
    and `completions/<name>` autoloading is a **fish** convention, and bash's equivalent (one
    sourced file, or a `~/.bashrc.d` fragment per alias) is a different file layout with the same
    units behind it. `shorthands.ts` is where a second shell's assembly would read from; nothing
    forks.
  - **`ward setup` installing either style interactively.** _Why safe:_ the guided-setup capability
    is unbuilt everywhere (0024 deferred it too), and adoption is the enacting verb it would call.
  - **An `unadopt` verb.** _Why safe:_ the files are the human's, `rm` is what removes a file they
    own, and a verb that deletes from `~/.config` earns its own entry and its own argument.
- **Acceptance:** `mise run check` green, and `test/cli/shell-adopt.test.ts` (34 cases) proving: the
  offering writes nothing and says how to select; each shorthand's exact file set, including that
  `wrr` needs no helper and `wrcd` transitively needs three; the adopted file holds the real
  definition and explains its own lifecycle; `--all`; re-adopting as a no-op that does not touch
  mtimes; the six standings classified from bytes alone; `yours` kept and `--force` replacing;
  `--dir` producing byte-identical, location-independent files in a separate root, and honored by
  the diff; the diff's content, its silence, and that it **agrees with `diff -u` line for line**
  across 40 seeded realistic edits; doctor's seven finding shapes and that none makes the machine
  unhealthy; the shadowing warn and its absence without adoption; the human rendering at exit 0;
  that both assemblies hold the same bodies verbatim; `--json` under the registered shape; the verb
  path; the three refusals; and — the real proof — every adopted file parsing under
  `fish
  --no-execute` and `wwcd` **autoloading and running** in a real fish, completion included.

## Design

- **Decisions:** no new ADRs — nothing here adds a dependency or a stack choice. Entry-local:
  - **`adopt`, not `install`.** Intent's _verbs read true to the operation_ is the test, and the two
    words describe different operations. **Install** is what a package manager does: it puts
    something under the tool's management, and the tool keeps it current. **Adopt** is a transfer of
    ownership — the human takes a definition Ward offered, and from that moment Ward has no claim on
    it. The second is what this verb actually does, and every downstream behavior follows from
    saying so: the file is never rewritten unless named again, drift is reported rather than
    corrected, and a file Ward did not write is somebody else's. It is also the owner's own word.
    `ward shell init fish` keeps its name because it, too, reads true — it initializes a layer Ward
    keeps fresh.
  - **`diff` is a sibling verb, not `--diff NAME` on `adopt`.** Same clause. A flag that makes a
    verb not do its verb reads false at the surface and forces the parser to describe two operations
    under one name; `shell diff` writes nothing and says so in its name. It also makes doctor's
    remedy line read as two parallel choices — `ward shell diff fish wrr` and
    `ward shell adopt fish wrr` — rather than one command with a mode.
  - **The adopted file holds the real definition, not a lazy trampoline.** The obvious cheap build
    is a one-line `function wrr; ward shell run wrr $argv; end`, which never goes stale. It was
    rejected, and the reason is the whole feature: a trampoline's behavior changes silently with
    every ward upgrade, and there is nothing to diff — "wrr has changed" could not be said, let
    alone shown. The snapshot is what makes drift a **visible, per-alias event** the human decides
    about. The cost is stated plainly: adoption trades the always-fresh property for explicit
    control, which is why `shell init` stays and both styles are documented as legitimate.
  - **Rejected: the `fish_command_not_found` hook.** The alternative the brief names, and it is
    genuinely attractive — zero files per alias, no staleness by construction, one handler that asks
    ward what an unknown `w*` command means. Rejected first because the owner ruled against it:
    adoption is meant to be explicit, and a hook that answers for every command the human mistypes
    is the opposite of naming what you want. Two further reasons stand on their own. **The typo
    tax**: `fish_command_not_found` fires on every mistyped command in every shell, so a
    ward-interpreted handler puts a bun process start (~180 ms, measured in 0026) on the latency
    path of typos that have nothing to do with Ward. **The completion gap**: fish completes commands
    it can see, and a command that exists only inside a not-found handler has no name to complete
    and no `complete -c` to attach — `wrcd <TAB>` would be dead, which is half of what 0025 built.
  - **Each helper is its own autoloaded function file.** The brief allowed a shared helper file or
    duplication into each adopted alias. Neither: `functions/__ward_choose.fish` is what **fish
    itself** does — a function file is autoloaded the first time its name is called, and a file
    holding several functions under some other name would never be autoloaded at all (it would have
    to go in `conf.d/`, which is the other style's directory and is sourced eagerly). One function
    per file also keeps per-alias granularity honest in both directions: adopting `wrr`, which calls
    no helper, writes exactly two files, and a helper two shorthands share is one file on disk
    however many of them are adopted. Duplication was rejected outright — two copies of
    `__ward_choose` under different file names means fish defines it twice, last loader wins, and a
    human editing "their" copy might be editing the one that never runs.
  - **Helpers are resolved transitively, and refreshed with any adoption.** `wrcd` calls
    `__ward_choose`, which calls both picker functions. One level deep would have been a
    coincidence; an adopted `wrcd` arriving without the picker seam would fail the first time a name
    did not resolve — the exact moment the human is least able to debug it.
  - **Completion lives in `completions/<name>.fish`, not in the function file.** A `complete` line
    inside `functions/wrr.fish` would not run until `wrr` had already been called once, because that
    is when the file is autoloaded — so completion would be dead until first use and alive
    thereafter, which is worse than absent. `completions/<name>.fish` is fish's own convention, is
    autoloaded when completing that name, and keeps the granularity per alias.
  - **The status is folded from the files, and the function file decides two of them outright.**
    `available` is decided by the shorthand's own function file alone — a shared helper some other
    adoption left behind must never make an un-adopted `wwcd` look installed. A function file
    without the marker is `yours` and ward stops there. Otherwise the shorthand is as current as its
    least current file, because an adopted `wrcd` whose `__ward_choose.fish` has drifted is a `wrcd`
    that no longer behaves the way this ward describes it.
  - **A fifth standing, `unreadable`.** The brief named four. 0026 already refuses to guess at a
    file it could not read, and the same honesty is owed here: a directory where
    `functions/wrr.fish` belongs is neither `changed` nor `yours`, and calling it either would tell
    the human to act on a fact Ward does not have.
  - **A distinct marker.** `FISH_ADOPTED_MARKER` (`# ward — adopted fish`) is deliberately not
    `FISH_LAYER_MARKER`. The two styles write different files into different directories, and a
    `conf.d` layer read as an adopted function — or the reverse — would produce a confidently wrong
    verdict. Both are derived from bytes, so neither needs a manifest.
  - **No written byte names its own location.** The header says what the file is, whose it is, and
    the two commands that act on it — never where it was written. That is what makes `--dir` honest:
    the files a dotfiles repo adopts are byte-identical to the live ones, so stow can symlink them
    into place and the header stays true. It is also why the sibling task can adopt into a stow
    package with nothing but `--dir`.
  - **`--dir` names a fish configuration ROOT, not a flat dump.** `--dir ~/dotfiles/fish` produces
    `functions/` and `completions/` beneath it — the same tree `~/.config/fish` holds — which is
    exactly the shape a stow package or a symlinked dotfiles directory wants.
  - **An unchanged file is not rewritten at all.** Reporting `unchanged` would have been enough for
    §6; not touching the file is what matters to the human this feature is for, whose adopted files
    are in git. A re-adopt that rewrote identical bytes would still change mtimes, and on some
    setups that is a diff.
  - **The diff is written here rather than depended on.** The inputs are two shell functions of a
    few dozen lines and the entire need is `diff -u` over them; a dependency would be an ADR for
    output nothing else in Ward consumes. The one rule that matters is a labeling choice no library
    would make for us — `-` is the file the human owns, `+` is ward's offer, so the human is being
    shown what adopting would do **to their file**. The classic O(n·m) LCS is used rather than a
    greedy approximation, because these inputs are tiny and the smallest diff is the readable one.
    Where several equally short diffs exist (many identical lines, as in random data), the tie-break
    can differ from GNU diff's; on the shape of input this actually gets — mostly unique lines with
    a handful of edits — the output agrees line for line, which the suite asserts against `diff -u`
    itself across 40 seeded rounds.
  - **A file ward did not write is not diffed.** Ward has no claim on it, so showing it against
    ward's own definition would frame somebody's arrangement as a deviation from ours — 0026's
    posture for the same situation, and the reason `yours` is not a warning anywhere.
  - **One finding per adopted alias; one dim line for the rest.** The aliases live and die
    separately — `wrr` can be a year old while `wrcd` is this morning's — and a single "adopted
    shorthands" finding would have had to say which one it meant anyway. The un-adopted remainder is
    one line, never per-alias and never a warning: not adopting is a choice, and the whole premise
    of adoption is that Ward writes only what it was asked for.
  - **The `changed` finding names all three choices out loud.** "See it", "Take it", "Or keep yours
    — nothing rewrites it but you". The owner's directive is that the choice stays with the human,
    and a finding that named only the fix would be making one of the three for them.
  - **The shadowing finding, and why it is a warn.** fish sources `conf.d/ward.fish` at startup,
    which **defines** `wrcd`; an autoloaded `functions/wrcd.fish` is only ever consulted for a
    function that is not already defined. So an installed layer silently wins over every adopted
    shorthand beside it, and the human's own tracked file does nothing. It is a warning rather than
    a note precisely because the failure is invisible from the shell — nothing misbehaves, the wrong
    definition simply runs — and §20 is explicit that a condition a surface can honestly report must
    be one doctor names. Never an `error`: both files are conveniences.
  - **`shell adopt` and `shell diff` are recorded as usage; `shell candidates` still is not.**
    Adopting is the install act, and asking to see a diff is a decision being made — both are
    commands the caller invoked, which is exactly what the telemetry constraint records. The
    machinery exclusion is unchanged.
  - **The parser holds the offered set.** `choice([...FISH_SHORTHAND_NAMES])` means an unoffered
    name is refused before anything is read or written, and the refusal lists what exists — the same
    treatment `shell candidates KIND` already gets.
  - **`shell adopt` is registered as a mutation verb.** It writes, so 0015's rule applies: every
    mutation verb emits its typed report under `--json`, and `ward schema shell adopt` documents it
    from the same registry row.
- **Layout:** `src/shell/shorthands.ts` (new — the units and their dependency resolution),
  `src/shell/adopt.ts` (new — the file set, the standings, the write, the diff assembly),
  `src/shell/diff.ts` (new — the unified diff), `src/shell/fish.ts` (now an assembly of the units;
  emitted bytes unchanged), `src/cli/index.ts` (`shell adopt`, `shell diff`, their handlers and
  rendering), `src/cli/schema.ts` (`shellAdoptShape` + registry row), `src/cli/json.ts`
  (`shellAdoptJson`), `src/cli/telemetry.ts` (two more sub-verbs), `src/workspace/doctor.ts`
  (`shellFindings`, `adoptedShorthandFindings`, `shadowedFindings`), `README.md`. Tests:
  `test/cli/shell-adopt.test.ts` (new), and one line of `test/cli/schema.test.ts` (an explicit
  timeout on a case whose cost grows with the `--json` registry — see the build log). No record
  change and no new state: what adoption writes lives in the human's fish configuration and nowhere
  else.
- **Mechanisms:** _the offering:_ `inspectAdoption(dir)` builds each shorthand's file set, reads
  each path as a buffer, and derives a per-file state (`absent` / `current` / `changed` / `yours` /
  `unreadable`) by byte comparison against what this ward would write plus a marker test; `fold`
  turns the files into the shorthand's standing. _adopting:_ for each named shorthand, each file is
  written unless it is already identical (`unchanged`) or carries no ward marker without `--force`
  (`kept`); the standing is re-read afterwards so the report says what is true now. _the diff:_ the
  `changed` files are run through `unifiedDiff`, installed on the `-` side. _doctor:_
  `shellFindings` reads 0026's two sites and the adoption in one pass and emits the artifact
  findings, one finding per adopted alias, the remainder line, and the shadow warn.

## Build log

### 2026-08-21 — The whole entry in one iteration

**Goal.** Everything in Scope. **What was done.** Read `CONTRIBUTING.md`, 0025 and 0026 whole, the
`human-shell` slice (including the clause SF-002's adjudication had just added), all of
`src/shell/`, doctor's machine pass, `test/cli/shell*.test.ts`, and `test/helpers.ts`'s XDG pins
before writing anything. Then, in order: the units (`shorthands.ts`) and `fish.ts` rebuilt as an
assembly of them — **verified byte-identical to the previous emission before going further**; the
diff; `adopt.ts`; the two CLI verbs, the shape, the builder, the telemetry rows; doctor's findings;
`test/cli/shell-adopt.test.ts`; the README section.

**What works now — with the exact commands that prove it** (Bun 1.3.14, fish 3.6.0, Linux), in a
scratch `$XDG_CONFIG_HOME`:

- **The decomposition forked nothing.** The emitted layer was captured before the refactor and
  compared after: `diff layer-before.fish layer-after.fish` → silent. `ward shell init fish` emits
  the same 4718 bytes it did at this branch's base, so no installed layer anywhere went stale for a
  refactor.
- **The offering, writing nothing:** `ward shell adopt fish --dir DIR` → three `available` rows with
  their summaries and the two commands that act on them; `find DIR -type f` → nothing.
- **Adopting by name:** `ward shell adopt fish wrcd --dir DIR` → five `written` rows —
  `functions/wrcd.fish`, `completions/wrcd.fish`, and the three helpers `__ward_choose` transitively
  needs — and the standing `current`. `ward shell adopt fish wrr` writes exactly two files: `wrr`
  calls no helper.
- **Re-adopting:** the same command again → five `unchanged` rows, and the files' mtimes are
  unchanged (asserted in the suite, not just reported).
- **The four words:** with `wrr` adopted then appended to → `changed`; with a hand-written
  `functions/wrr.fish` → `yours`; with nothing → `available`; freshly adopted → `current`.
- **`yours` is kept:** `ward shell adopt fish wrr` over a hand-written file →
  `kept
  functions/wrr.fish`, the file byte-unchanged, exit **0**, and the note about `--force`.
  `--force` → `replaced`.
- **The diff:** after appending `# my own tweak` to an adopted `wrr`, `ward shell diff fish wrr`
  prints `--- functions/wrr.fish (adopted)` / `+++ functions/wrr.fish (this ward)` and
  `-# my own tweak`. Checked against the real tool: the same two texts through `diff -u` produce
  byte-identical output, and the suite repeats that comparison over 40 seeded realistic edits.
- **`--dir`:** adopting `--all` into a scratch root and into the live configuration produces the
  same relative tree and byte-identical files, and no file contains either directory's path — which
  is what lets a dotfiles repo stow them.
- **Doctor**, in a scratch `$XDG_CONFIG_HOME` with `wrr` adopted-then-drifted, `wrcd` current, and a
  hand-written `wwcd`:
  `! fish shorthand wrr — wrr has changed — functions/wrr.fish differs
  from what this ward defines. See it: ward shell diff fish wrr. Take it: ward shell adopt fish wrr.
  Or keep yours — nothing rewrites it but you`,
  `✓ fish shorthand wrcd — …/functions/wrcd.fish — matches what this ward defines`, and
  `i fish shorthand wwcd — … is present but carries no ward marker — your own \`wwcd\`, kept
  …`.`ward doctor` exits **0**.
- **The shadow:** with `ward shell init fish > conf.d/ward.fish` beside an adopted `wrr` →
  `! fish shorthands shadowed — …/conf.d/ward.fish defines wrr, wrcd too, and wins — fish sources
  conf.d at startup and only autoloads a function that is not already defined … Keep one style`.
  Absent when nothing is adopted.
- **A real fish runs what was adopted.** Every written file parses under `fish --no-execute`. With
  `fish_function_path` prepended to the adopted `functions/` and no fzf on PATH, `wwcd` autoloaded —
  along with `__ward_choose` and both picker functions — and took the honest lesser answer
  (`ward: no picker installed — going to the default workspace`), landing in the registered
  workspace; `complete -C 'wwcd '` answered `ws<TAB><path>` from the adopted completion file. With
  fzf on PATH the same call reached fzf itself, which is the seam working.
- **Refusals:** `ward shell adopt bash` → exit 1,
  `no shell adoption for 'bash' — available: fish (the other shells are unbuilt, not unsupported)`;
  `ward shell adopt fish wxx` → the parser's refusal naming `"wrr"`, `"wrcd"`, `"wwcd"`;
  `ward shell adopt fish wrr --all` → exit 1,
  `--all adopts every shorthand; naming some as well
  says two different things`, nothing written.
- **`--json`:** the offering (`offeredOnly: true`, empty `files`) and the write report (per-file
  `written` / `unchanged`, the standing after the run) both parse under `shellAdoptShape`;
  `ward schema shell adopt` emits it, proven by 0015's own registry-driven table.
- `bun test test/cli/shell-adopt.test.ts` → `34 pass, 0 fail, 248 expect() calls`.
- `bun test` → `471 pass, 0 fail, 2009 expect() calls` across 41 files, from `436` tests across 40
  files at this branch's base (measured on a stashed tree at that commit) — the 34 new cases plus
  the one `ward schema shell adopt` case 0015's registry-driven table generates from the new row,
  and no existing case's assertions changed.
- **One pre-existing failure fixed on the way past**, and it is worth naming because it is not this
  entry's: `test/cli/schema.test.ts`'s whole-contract case spawns one CLI per registered `--json`
  verb, and on this machine that already exceeded bun's 5-second default at the base (`5911 ms`,
  measured on the stashed tree) — the registry had outgrown the implicit timeout before this entry
  added a row. It now carries an explicit `30_000` with the reason: the cost grows with the
  contract, by design.
- `mise run check` → exit 0.

**Decisions.** All recorded under Design → Decisions. The three found while building rather than
before: the **`unreadable` standing** (the brief named four words; a directory where a function file
belongs is none of them, and 0026's refusal to guess is the precedent); **not rewriting an unchanged
file** (reporting `unchanged` satisfies §6, but the human this feature is for keeps these files in
git, where a rewritten-identical file is still an mtime change); and the **shadowing finding**,
which did not exist in the brief at all and is the one condition that only comes into being because
two install styles now do — an adopted file that is silently never run is exactly the invisible
failure §20 says doctor must name. One false alarm worth recording: a test asserting
`expect(finding).toMatchObject({ message: expect.stringContaining(…) })` passed against `undefined`
under bun 1.3.14 and then made the **following** assertion fail with a type error about the received
value — the finding was present the whole time. Direct field assertions
(`expect(finding?.severity).toBe(…)`) are used instead; a matcher that cannot fail is worse than no
assertion.

**Next.** In dogfood order: the sibling task adopting these files into the dotfiles repo through
`--dir`, which is the first real user of the location-independence rule; then whether telemetry
shows anyone using `shell init` once adoption exists (if not, the monolith becomes the deferred
style rather than the default one); a bash layout when someone asks; and `ward setup` as the guided
place a human would pick between the two styles rather than reading a README section that compares
them.

## Spec-feedback

- None this entry. The `human-shell` slice's shorthand clause was amended by 0025's SF-002
  adjudication ([crumley/ward#50](https://github.com/crumley/ward/pull/50)) to require that
  "whatever installed form the shorthands take in the human's shell configuration, that form is
  cheaply re-obtainable from the tool, and its staleness is visible" — deliberately phrased over
  _whatever installed form_ rather than over the emitted layer, and this entry's second form landed
  inside it without strain. The one clause that had to be read rather than applied is §18, and the
  reading is recorded above rather than as friction: what §18 forbids is writing into a human's
  shell configuration **unasked**, and naming a shorthand is the ask — which is why the verb that
  could write everything writes nothing when asked for nothing.
