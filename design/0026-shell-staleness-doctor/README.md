# 0026 — Doctor sees a stale shell layer

> `ward doctor` learns the two installed shell artifacts — `fish/conf.d/ward.fish` and
> `fish/completions/ward.fish` under `$XDG_CONFIG_HOME` — and reports each against what the running
> ward would emit, compared byte for byte. Byte-identical is ✓; ward's own emission gone stale is
> the single **warn**, carrying the exact re-run; a file ward did not write is named as somebody's
> own and never told to overwrite; absent is a dim note; and a machine that keeps no fish
> configuration hears nothing at all. Never `error` — a convenience cannot make a machine unhealthy.
>
> **Status:** accepted · **Started:** 2026-08-21

[0025](../0025-fish-shell-layer/README.md) emitted a shell layer the human installs by redirect, and
recorded its own hole in the same breath (SF-002): a redirect-installed layer is a **snapshot**, the
intent slice says the shorthand set is expected to **churn**, and nothing anywhere told the human
their copy had fallen behind. The adjudication of that friction — the intent edit landing beside
this entry, [crumley/ward#50](https://github.com/crumley/ward/pull/50) — adds the obligation that
the emitted layer be cheaply re-obtainable and its **staleness visible**, "surfaced, not nagged".
This entry builds the visibility half, for the layer and for the completions
([0022](../0022-shell-completion/README.md)) that have the identical problem.

## Serves intent

- [`human-shell`](../../intent/02-subsystems/07-human-shell.md) — _A self-diagnosis command_, whose
  §20 clause is the whole argument: **any "unavailable" another verb can honestly report must be a
  condition doctor can name and explain**. An installed layer that no longer matches the ward beside
  it is exactly that condition, and until now the only surface that mentioned it was one line of
  README ("re-run the command after upgrading Ward"). The same slice's _must also work **outside** a
  workspace, where only the machine can be checked_ is what makes these **machine** findings: the
  two files are per-user machine state, not workspace state. Also _The interactive layer adds
  mnemonic shorthands … evolvable as telemetry reveals real usage_ — an expectation of churn is
  worth something only if churn is deliverable. Also _All real logic lives in the Ward tool_: the
  staleness rule is Ward's, computed from Ward's own emission, and the shell script stays plumbing.
- [`workspace-lifecycle`](../../intent/01-concepts/06-workspace-lifecycle.md) — the **repair
  posture**, verbatim: doctor reports and recommends; it does not repair what is neither local nor
  reversible. Every finding here names the one-line remedy and Ward runs none of them. Also the
  **global-state boundary** in its widest reading: these files hold conveniences only, so their
  worst state costs a shortcut — which is why nothing here is ever an `error`.
- [`principles`](../../intent/00-foundation/01-principles.md) — **§18**: Ward emits and the human
  redirects, so doctor may **look** at what was installed and must never write it, nor tell a human
  to overwrite a file Ward did not write. **§20**: the degradation loop, closed for the two files.
  **§8**: the finding reaches an agent through doctor's existing `--json` shape, unchanged and
  unenlarged. **§17**: an installed artifact's currency is **derived** by regenerating and
  comparing, never stored as a stamp that two writers could disagree about.

## Scope

- **In:**
  - **Two machine findings in `ward doctor`** (`src/workspace/doctor.ts`), one per conventional
    install site, honoring `$XDG_CONFIG_HOME` (default `~/.config`):
    - `fish shell layer` — `fish/conf.d/ward.fish`, against `ward shell init fish`'s emission.
    - `fish completions` — `fish/completions/ward.fish`, against `ward completion fish`'s emission.
  - **Five verdicts per site** (`src/shell/installed.ts`): `absent` (info, naming the redirect that
    installs it — or, on a machine with no fish configuration at all, silence), `current` (ok),
    `stale` (**warn**, naming the file and the exact re-run), `foreign` (info: present, not ward's
    emission, kept as the human's own), `unreadable` (warn with the reason).
  - **The emission, re-obtainable in process**: `emitShellLayer` (`src/shell/layer.ts`) and
    `renderCompletionScript` (`src/shell/completion.ts`, new) return exactly the bytes the two verbs
    print — and `ward shell init` now prints through the former, so there is one definition of the
    emitted bytes rather than two that could drift.
  - **An identifying header, as a constant**: `FISH_LAYER_MARKER` (`src/shell/fish.ts`) is the
    header the layer already carried, extracted so the emission and the detector read the same
    string. The completion script gets none, and does not need one (below).
  - **The hermeticity seam**: `xdgConfigHome()` (`src/global/paths.ts`), one function that decides
    where the per-user configuration root is, pinned for every suite in `test/helpers.ts` so no test
    reads the developer's real `~/.config/fish`.
  - **Docs**: the staleness sentence in `README.md`'s completion and shell-layer sections, replacing
    "re-run the command after upgrading Ward" with what now tells you when to.
- **Deferred:**
  - **`ward shell init fish | source` at shell startup** — the `starship init` convention, which
    kills staleness at the root because the layer is never installed at all. Rejected **for now**,
    with a measured reason: ward is bun-interpreted TypeScript, and a bare invocation costs ~150–200
    ms on this machine (183 ms, measured below), which every new shell would pay before the prompt
    appears. _Why safe:_ nothing here forecloses it — `emitShellLayer` is already the single source
    of the emitted bytes, so the change is one README line and one deleted finding. It becomes the
    **right** answer the day ward ships as a compiled binary (`bun build --compile`), where what is
    being paid for is a process start rather than an interpreter reading a module graph; that is the
    future path, and this entry is the interim that keeps the promise honest meanwhile.
  - **A `--fix` / `ward shell install fish`.** _Why safe:_ 0022's and 0025's reasoning verbatim —
    §18 keeps Ward out of the human's shell configuration, and the remedy doctor prints is one line
    the human runs. Report-only is also what lets the `foreign` verdict exist at all.
  - **bash and zsh sites, and non-XDG fish locations** (`$__fish_config_dir`, a hand-chosen
    `conf.d`). _Why safe:_ there is one emitted layer today (fish), `$XDG_CONFIG_HOME/fish` is what
    fish itself reads and what every install line in the README says; a human who installs elsewhere
    gets silence, which is honest — doctor reports what it can see and never guesses at a path
    nobody named. The sites are a table in one function when a second shell arrives.
  - **A version stamp in the emitted files.** _Why safe:_ it would detect strictly less than the
    byte comparison (below) at the cost of writing a version into a file the human keeps, and it
    would need a migration for every already-installed copy.
  - **Making `ward workspace upgrade` carry these files.** _Why safe:_ upgrade writes installed
    **workspace** artifacts into a stewardship worktree and lands them through the gated merge; the
    human's `~/.config` is neither in a worktree nor merged, and a machine-state writer bolted onto
    a workspace verb is the boundary violation 0024 spent an entry avoiding.
- **Acceptance:** `mise run check` green, and `test/cli/shell-staleness.test.ts` proving: the seven
  installed-state rows (nothing configured → silence; configured but absent → two dim notes with
  their redirects; both current → two ✓; each of the two stale → warn naming its own file and its
  own re-run, with the other still ✓; unrecognized files → info, never warn; an unreadable path →
  warn with the reason), that no row ever makes the machine unhealthy, that both comparisons are
  against the **real** emission (`ward shell init fish` and `ward completion fish` spawned and
  compared byte for byte), the human rendering's warn mark and remedy at exit 0, and `--json`
  carrying the finding in the shape `ward schema` documents.

## Design

- **Decisions:** no new ADRs — nothing here adds a dependency or a stack choice. Entry-local:
  - **Byte comparison, not a version marker.** Ward has sat at `0.1.0` since before either file
    existed — 0022 shipped the completions, 0025 the layer, both inside that one version, and both
    are expected to change inside it again; a version check would have detected nothing.
    Regenerating and comparing catches every drift, including drift Ward did not author: the
    completion script is **optique's** generated driver, so a dependency bump can make an installed
    copy stale with no Ward commit at all. It also costs nothing to keep true — there is no stamp to
    remember to bump.
  - **Doctor, not `workspace upgrade`.** The installed files are per-user **machine** state, and
    intent already requires doctor to work outside a workspace, where the machine is all there is.
    Upgrade is the wrong verb twice over: it operates inside a workspace's stewardship worktree, and
    it **writes**.
  - **The comparison is against the CLI's own bytes, and a test spawns the CLI to prove it.**
    `ward shell init fish` now writes `emitShellLayer('fish')` rather than `console.log`-ing the
    script, so the trailing newline is part of a named emission instead of a fact the print
    statement knew privately. The completion side cannot be centralized that way — optique's
    `completion: 'command'` owns the printing — so `renderCompletionScript` re-derives it from the
    same generator and two spawn-and-compare cases pin both couplings (the callback arguments, and
    the newline optique's line-oriented writer appends). Without those cases this whole feature
    could report a freshly installed file as stale, which is the one failure that would make it
    worse than nothing.
  - **No header on the completion script; the script already says whose it is.** Ward never sees
    those bytes on the way out — optique's subcommand generates and prints them — so adding a header
    would mean wrapping the emission in a second path that can drift from the one answering TAB. It
    is also unnecessary: optique names the driver function after the program (`__ward_complete`) and
    the script calls `ward completion fish` back on every keystroke, which no other tool's file will
    contain. The layer, which Ward does author, keeps its human-readable header — now a constant
    both the emission and the detector read, so the marker cannot drift from the file it marks.
  - **A file with no marker is `info`, and is called the human's own.** The brief left the posture
    open. It is the `claude guidance` idiom (0017): a file Ward did not write is somebody's
    arrangement, kept — and telling them to redirect over it would be Ward writing into a human's
    shell configuration by proxy, which §18 forbids doing directly. The message still names what the
    file would have to be replaced with, so a human who wants ward's layer there is one line away;
    it just never reads as an instruction.
  - **Silence when the machine keeps no fish configuration.** The gate is whether
    `$XDG_CONFIG_HOME/fish/` exists, not whether `fish` is on `PATH`. Two reasons: a filesystem
    question is hermetic and cheap, while varying "is fish installed" in a test means owning the
    whole `PATH` (0025's own hard-won note); and the directory is the better signal — a machine with
    a fish configuration is a machine that runs fish, whether or not the binary is on the `PATH`
    doctor happens to inherit. Two permanent info lines on every non-fish machine would be exactly
    the nagging the adjudication rules out.
  - **Absent-but-configured is a dim note, not silence.** It matches how doctor already treats an
    optional capability that is not installed (`gh`, the picker): info, naming what it would buy and
    the one line that installs it. Not installing is a legitimate choice, so it is never a warning —
    and a fish user who has never heard of the layer learns it exists from the surface built to
    explain the machine.
  - **One finding per file, named after the file.** The two live and die separately: the layer can
    be a year old while the completions are fresh, and their remedies are different commands. A
    single "shell artifacts" finding would have had to say which of the two it meant anyway.
  - **`$XDG_CONFIG_HOME`, not a new `WARD_FISH_DIR`.** It is what fish itself reads, so honoring it
    makes doctor correct on a machine that moves its configuration — and it is already the seam the
    test suite can set. `test/helpers.ts` pins it for **every** suite (the 0024 move, extended):
    doctor now reads paths under the per-user config root that belong to another tool, and no test
    may touch the developer's real one.
  - **Unreadable is warn with the reason, never a guess.** 0024's posture for a global file that
    will not read, applied: doctor says what it could not do and why, and does not claim the file is
    stale or current.
  - **No schema change.** Doctor's `--json` shape is a generic array of findings, so two more
    findings appear in it without an edit ([0008](../0008-json-shape-home/README.md)'s one-place
    growth). The suite parses the real `--json` output under `doctorShape` so "the schema stays
    truthful" is asserted rather than asserted-by-comment.
- **Layout:** `src/shell/completion.ts` (new — the completion script re-render and its marker),
  `src/shell/installed.ts` (new — the two sites, the read, the five verdicts), `src/shell/layer.ts`
  (`emitShellLayer`), `src/shell/fish.ts` (`FISH_LAYER_MARKER`), `src/global/paths.ts`
  (`xdgConfigHome`, with `configDir`/`stateDir` rebuilt on it — same behavior), `src/cli/index.ts`
  (`shell init` prints the named emission), `src/workspace/doctor.ts` (`shellArtifactFindings`,
  beside the picker finding), `test/helpers.ts` (the `XDG_CONFIG_HOME` pin), `README.md`. Tests:
  `test/cli/shell-staleness.test.ts` (new file only). No schema change, no record change, no new
  state: nothing is written anywhere.
- **Mechanisms:** doctor's machine pass calls `inspectInstalledShellArtifacts()`, which resolves
  `$XDG_CONFIG_HOME/fish`, reads both files as buffers, and compares each against its site's
  `emit()` — `emitShellLayer('fish')` for the layer, `renderCompletionScript('fish')` for the
  completions. `ENOENT` is `absent`; any other read failure is `unreadable` with the reason; an
  equal buffer is `current`; an unequal one is `stale` if it contains the site's marker and
  `foreign` if it does not. If the fish directory does not exist and both files are absent, no
  finding is emitted at all. Each verdict renders to one `Finding` — the same
  `{check, severity, message}` triple every other check produces, so the human rendering, the
  `--json` shape, and the exit-code rule need no knowledge of any of this.

## Build log

### 2026-08-21 — The whole entry in one iteration

**Goal.** Everything in Scope. **What was done.** Read 0024 (the machine-findings pattern and its
never-`error` posture), 0025 whole (the emission layout and the SF this answers), the human-shell
slice, and `src/workspace/doctor.ts` before writing anything. Then: the completion re-render and its
proof that it matches the CLI; `emitShellLayer` and the print site that now uses it; the marker
constant; `xdgConfigHome`; `installed.ts`; the two findings; the `XDG_CONFIG_HOME` pin in
`test/helpers.ts`; and `test/cli/shell-staleness.test.ts` (11 cases).

**What works now — with the exact commands that prove it** (Bun 1.3.14, git 2.54.0, Linux), in a
scratch `$XDG_CONFIG_HOME`:

- **Nothing configured:** `ward doctor` names neither file — no line about a shell this machine does
  not run.
- **Configured, nothing installed** (`mkdir $XDG_CONFIG_HOME/fish`): two `i` lines, each ending in
  its own redirect (`ward shell init fish > …/fish/conf.d/ward.fish`,
  `ward completion fish > …/fish/completions/ward.fish`).
- **Freshly installed** (both commands redirected into place):
  `✓ fish shell layer — … matches what
  this ward emits` and the same for `fish completions`.
- **Stale** (one line appended to the installed layer):
  `! fish shell layer — … differs from what
  this ward emits — the installed copy is a snapshot of an earlier ward; re-emit it: ward shell init
  fish > …`,
  with the completions still `✓`, and `ward doctor` still exiting **0**.
- **Not ward's file** (a hand-written `conf.d/ward.fish`):
  `i … is present but is not ward's
  emission — your own file, kept; ward will not tell you to overwrite what it did not write …`.
- **Unreadable** (a directory where the file belongs):
  `! … could not be read — EISDIR: illegal
  operation on a directory, read; whether the installed copy is current cannot be told from here`.
- **The emission is the real one:**
  `ward shell init fish | cmp - <(bun -e 'import {emitShellLayer} …')` and the same for
  `ward completion fish` against `renderCompletionScript` — `cmp` silent both times, and both
  comparisons pinned as cases so a bun or optique bump cannot quietly break them.
- **The starship comparison, measured** on this machine (the reason `ward shell init fish | source`
  at startup is deferred): 20 runs of `ward shell init fish`, bun-interpreted, averaged **183 ms**
  per invocation — the cost every new shell would pay before its first prompt.
- `bun test test/cli/shell-staleness.test.ts` → `11 pass, 0 fail`.
- `bun test` → `436 pass, 0 fail, 1758 expect() calls` across 40 files, from `425 / 1736 / 39` at
  this branch's base (measured on a detached worktree at that commit) — the eleven new cases, and no
  existing case changed.
- `mise run check` → exit 0.

**Decisions.** All recorded under Design → Decisions. The two found while building rather than
before: the trailing newline — `console.log(FISH_LAYER)` emits one byte more than the constant, so a
naive comparison would have called every freshly installed layer **stale**, which is what turned
"compare against the emission" into a named `emitShellLayer` plus a spawn-and-compare case for each
of the two verbs; and the `foreign` verdict's severity, which started as `warn` ("something is wrong
at a path Ward expects to own") and became `info` once the file at that path is read as what it
actually is — the human's, at a path Ward suggested but does not own.

**Next.** The compiled binary is the thread to pull: `bun build --compile` makes
`ward shell init fish | source` cheap, at which point this entry's warn finding becomes vestigial
for the layer (it stays for the completions, which are still a file). Until then: a second shell's
sites when a bash or zsh layer exists, and `ward setup` as the place a human would install both
without a redirect they had to remember.

## Spec-feedback

- **SF-001** — [`human-shell`](../../intent/02-subsystems/07-human-shell.md), _A self-diagnosis
  command_ → _What it checks_. _Friction:_ the slice hands doctor's subject to
  [`workspace-lifecycle`](../../intent/01-concepts/06-workspace-lifecycle.md), which draws it as two
  things: **machine preconditions** (the tools and settings the environment must have) and the
  **integrity of the record against the world**. The files this entry checks are neither. They are
  artifacts **Ward emitted** into a directory Ward does not own, in a shell Ward does not run — not
  a precondition (nothing needs them; every verb works without them), and not record↔world drift
  (nothing in any record mentions them). They were reached by way of §20's degradation loop, which
  is a **surface** clause, so the check set now has a member its own definition does not describe.
  _Assumption to keep moving:_ read "machine preconditions" as covering **Ward's own footprint on
  the machine** — what Ward has installed outside any workspace, whether or not something depends on
  it — which is the same widening 0024 already performed for the global config and registry (both
  are reported as machine findings, and neither is a precondition either). _Proposed revision:_ name
  the third class in the lifecycle slice's doctor paragraph — **Ward's per-user footprint**: files
  Ward emitted or wrote outside a workspace (global configuration, the workspace registry, installed
  shell artifacts), reported against what the running Ward would produce today, never repaired, and
  never an error, since by the global-state boundary their worst state costs a shortcut. That gives
  the growing set of machine findings a stated home instead of three entries each widening the same
  sentence by implication.
