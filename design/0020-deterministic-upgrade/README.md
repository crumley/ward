# 0020 — The deterministic workspace upgrade

> Upgrades are tool acts, not agent acts: the workspace record learns the name of its own main line
> (recorded, never assumed — merged intent PR #39 built), doctor names a root standing off it and a
> record that never learned it, the journal proceeds loudly when its commits land off the recorded
> line, and `ward workspace upgrade TASK` mechanically brings every installed artifact the user
> never touched to the current default — deciding untouched-vs-customized from a shipped **lineage**
> of every default the binary ever installed, backfilling the baselines the classification proves,
> and leaving customized artifacts byte-untouched, **named** as reconciliation residue. The act
> writes into the task's stewardship worktree, so 0019's preview, gated merge, and delivered close
> carry it home.
>
> **Status:** accepted · **Started:** 2026-08-16

The owner's directive, verbatim: "i dont want manual edits on the workspace. i want the ward tool to
deterministically upgrade it and only use an agent to generate changes when the user has
non-ward-provided content that needs to be merged with upgraded ward content." This entry is that
directive built. The gap it closes was measured on the live bootstrap workspace: its
`.ward/baselines.md` is **empty** (`artifacts: []`) — converge fingerprints only what it itself
establishes — so untouched-vs-customized was undecidable exactly where an upgrade needs the answer,
its `AGENTS.md` and `.ward/README.md` are stale-but-untouched originals from designs 0004 and 0002,
and its record has no main-line name (0019's SF-001). All four are fixed here, deterministically.

## Serves intent

- [`workspace-lifecycle`](../../intent/01-concepts/06-workspace-lifecycle.md) — _The workspace's own
  main line_: "creation records the name of the workspace's main line in the workspace's own record
  … a root standing on another branch is ordinary drift, named by doctor rather than quietly
  redefining what the main line is; and … **a journal commit landing off the recorded main line
  proceeds — refusing would wedge the record's own bookkeeping — but never silently**" — the three
  rails this entry builds. _How a workspace evolves_: "divergence must be detectable, so Ward
  records what it installed" (the lineage extends detectability backward to workspaces whose install
  predates the baselines); "**where the default moved and the copy was untouched, the new default
  simply applies — there is no decision to make**" (the deterministic replacement is exactly this
  sentence, mechanized); the baseline moving "with the artifact it fingerprints" (both ride one
  commit on the stewardship branch); and comparison staying Ward-side ("whether a default moved is a
  question about Ward's own shipped versions, answerable on Ward's side alone").
- [`domain-model`](../../intent/01-concepts/00-domain-model.md) — _Repositories and the main line_:
  the workspace's own main line's "name is recorded at creation like any repository's (the
  recorded-not-assumed rule, applied to the workspace itself) — so a root moved off it is detectable
  drift, not a quiet redefinition of the main line."
- [`principles`](../../intent/00-foundation/01-principles.md) — §6 (creation, converge, and the
  upgrade itself all converge on re-run); §16/§17 (the record is the one truth: a drifted root
  cannot silently retarget branching, the merge, or the close gate; nothing Ward didn't provably
  write is ever overwritten); §18 (the upgrade lands only through the human's gated merge); §20
  (every refusal names its remedy; the loud proceed names the way back as it writes).
- [`human-shell`](../../intent/02-subsystems/07-human-shell.md) — the new verb serves both
  audiences: `--json` per 0015's conventions, the loud proceed on stderr so stdout stays one
  document, doctor's report-and-recommend posture unchanged.

## Scope

- **In:**
  - **The recorded main-line name.** `workspace.md` (the workspace record) gains an optional
    `mainLine` field (`src/store/types.ts`). A new creation step, `workspace main line` (12 steps →
    13), reads the name from the repository after `git init` and records it; converge backfills a
    pre-0020 record and **never** re-records over a drifted root — that disagreement is doctor's to
    name. `resolveWorkspaceMainLine` (recorded ?? live root read) becomes the target for stewardship
    branching, rebase, freshness, and the workspace-anchored delivered-close gate, so a drifted root
    cannot silently retarget any rail.
  - **Doctor drift findings.** One new check, `workspace main line`: recorded and the root stands on
    it → `ok` naming the branch; no recorded name → `info` naming both remedies (the upgrade, or
    re-running create); root on another branch, detached, or the recorded branch missing → `warn`
    with the one-line way back (`git switch <mainLine>`) — record↔disk drift named, never an error,
    because the workspace still operates.
  - **The loud proceed.** `commitRecords` — the one seam every journal writer flows through — and
    create's convergence commit surface a stderr note when the commit lands off the recorded main
    line: the journal proceeds (refusing would wedge the record's own bookkeeping) but never
    silently, and the note names the way back. Under `--json`, stdout still carries one document
    alone (the 0006 derivation-echo precedent). Inside a stewardship copy the note is suppressed:
    commits there land on a branch by design, and the 0019 guard already keeps the journal out. The
    stewardship-copy refusal itself is unchanged. The **gated merge**, by contrast, **refuses** a
    drifted root: it mechanically advances whatever branch the root stands on, so proceeding would
    carry stewardship into the wrong history.
  - **The installed-artifact lineage + backfill.** `src/workspace/lineage.ts` ships the history of
    every default the binary ever installed: per artifact, an ordered list of sha256 fingerprints of
    superseded defaults (each naming its introducing commit and design entry), with the **current**
    default derived at runtime from the very constants creation installs (`templates.ts`, and the
    catalog through the same `renderDocument` serializer `writeDocument` uses). `classifyArtifact`
    answers `current` / `stale` (bytes match a historical default or the install-time baseline:
    untouched, merely old) / `customized` (matches nothing Ward ever wrote) / `missing`. Backfill
    falls out: an artifact proven untouched gets its baseline written even though no install-time
    fingerprint ever existed.
  - **The deterministic upgrade verb.** `ward workspace upgrade TASK` writes into TASK's existing
    workspace worktree (the 0019 stewardship rails, reused): untouched → replaced with the current
    default; missing → installed; customized → left **byte-untouched** and reported as
    reconciliation residue. It also installs the CLAUDE.md bridge where absent (0017's promised
    carrier), records the main-line name where unrecorded, refreshes the version stamp, and rewrites
    the baselines to fingerprint everything now standing at a current default — all riding **one
    commit** on the stewardship branch. Preview is `workspace merge --preview`, landing is the
    human's gated merge, verification is the task's delivered close. Convergent: a second run
    reports `current` and commits nothing. Registered in `ward schema` (`workspace upgrade`) and
    telemetry's `VERB_TREE`; `--json` per 0015 (refusals: stderr + exit 1 + empty stdout).
- **Deferred:**
  - **Agent-orchestrated reconciliation of customized artifacts.** The tool names the residue; the
    merge of user content with moved defaults is the one place an agent enters, and it stays out of
    the tool's scope by the owner's directive. _Why safe:_ residue is left byte-identical and named
    in the report — nothing is lost, nothing decided; the future reconciliation entry consumes
    exactly this report.
  - **Recorded declines** (intent's "chosen, not drifted" mark). _Why safe:_ nothing regresses —
    doctor already reads customized artifacts as `info`, never worse; the decline record belongs to
    the reconciliation entry that creates decisions to record (SF-001 below).
  - **Steward-branch pruning after merge** — deferred by 0019, stays deferred; it did not fall out
    naturally here. _Why safe:_ a merged branch holds nothing unmerged; pruning is cosmetic and
    reversible.
  - **0019's other deferred doctor findings** (a stewardship copy on disk, a stale stewardship
    branch, a record whose worktree is a copy). Only the root-off-main-line finding folded in
    naturally — it is this entry's drift class. _Why the rest stay deferred:_ none degrades silently
    — the copy guard refuses loudly at the moment of harm with the remedy inline, and a stale merged
    branch is history, not risk; adding findings for them now would be doctor rows without evidence
    of need.
  - **Anything forge/PR-related for the workspace's own repository.** _Why safe:_ intent's §19
    second technique on the same branch-and-merge boundary; the invariant this entry rides is the
    boundary itself.
  - **Standing project and ignore-policy convergence inside the upgrade.** Both remain
    `workspace create`'s (0018's step; the line-based `.gitignore` converge). _Why safe:_ both acts
    are convergent and doctor names each with its own remedy; duplicating them in the upgrade would
    be a second mechanism for the same convergence (§6 argues one).
- **Acceptance:** from a cold checkout, `mise run check` is green, and `bun test` proves:
  1. a fixture workspace in the live workspace's **exact state** — stale untouched `AGENTS.md`
     (sha256 `05eaa276…`, the c7962cc/0004 default) + stale `.ward/README.md` (`73043945…`, the
     a71b091/0002 default) + empty baselines + no recorded main-line name — upgrades
     deterministically end to end: both artifacts byte-identical to the current defaults after the
     gated merge, baselines backfilled (three entries, current fingerprints), main line recorded,
     the delivered close verifying reachability; and the upgrade converges (second run: `current`,
     no commit);
  2. a customized `AGENTS.md` is left **byte-identical**, named in `residue`, and gets **no**
     baseline entry, while the stale README still upgrades mechanically beside it;
  3. doctor: recorded-and-standing reads `ok`; no recorded name reads `info` naming upgrade and
     converge; a root on another branch (and detached, and a recorded branch that no longer exists)
     reads `warn` with `git switch <mainLine>` — healthy (exit 0) in every state;
  4. the loud proceed: a journal commit off the recorded main line exits 0, lands, and says so on
     stderr — including under `--json`, where stdout stays one parseable document; on the recorded
     line the journal is quiet; the gated merge refuses the drifted root and lands after
     `git switch` back;
  5. the lineage covers the live workspace's exact bytes (the fixture texts hash to the pinned live
     sha256s and classify `stale` with their eras named), the current defaults are pinned (changing
     `templates.ts` without moving the outgoing hash into history fails the suite), and
     `ward schema workspace upgrade` documents the verb.

## Design

- **Decisions:** no new ADRs — the existing stack carries this entry. Entry-local:
  - **The main-line name lives in the workspace record (`workspace.md`), optional.** 0019's SF-001
    named the workspace document the natural home, and it is: the record already carries the
    workspace's identity and stamp, and the field is exactly the repository-set rule
    (recorded-from-the-repository) applied to the workspace's own repository. `optional` keeps every
    pre-0020 record valid unchanged — 0018's additive-schema pattern.
  - **A dedicated creation step, after `git repository`, before the commit.** The name is the
    repository's to give — it exists only once `git init` has run (a fresh init's symbolic HEAD is
    readable before any commit), so the record step cannot carry it; and it must precede the commit
    so the run's one commit carries the record complete. Converge backfills an absent name from the
    root's live branch but **never** re-records over a drifted root: creation converging the record
    to wherever the root happens to stand would be exactly the quiet redefinition the recorded name
    exists to prevent — drift is doctor's to name, not creation's to absorb.
  - **`resolveWorkspaceMainLine` = recorded ?? live, everywhere the rails aim.** Worktree branching,
    rebase targets, freshness, and the delivered-close gate all resolve through the recorded name
    when there is one, so a drifted root cannot silently retarget them (proven: a stewardship
    worktree created while the root stands on `experiment` branches from the recorded line). The
    pre-0020 fallback is the live root read — 0019's definitional stance, kept for records that have
    nothing better.
  - **The journal proceeds loudly; the merge refuses.** Intent scopes the loud proceed to
    bookkeeping — "it lands on a branch history the human has chosen, and the honest response is a
    loud proceed." The gated merge is not bookkeeping: `git merge` advances the branch the root
    stands on, so on a drifted root the mechanical act itself would land stewardship into the wrong
    history — the refusal names the one-line way back. Implementation seam: `warnJournalOffMainLine`
    inside `commitRecords`, the single chokepoint every journal writer already flows through, plus
    create's convergence commit; stderr, so `--json` stdout stays one document; suppressed inside
    stewardship copies, whose commits are branch-bound by design.
  - **Lineage representation: historical hashes, current text from the installing code.** Detection
    only ever asks "equal or not" — 0005 sized it at one sha256 per artifact, and the lineage is the
    same question against more candidates — so shipping superseded **texts** would be binary bloat
    nothing reads, while the exact bytes stay recoverable from this repository's own history (every
    entry names its introducing commit). The **current** default is the deliberate exception: its
    text ships anyway (`templates.ts` installs it), so the lineage derives text and hash from those
    constants at runtime — one source of truth that cannot drift from what create writes. The
    catalog's current bytes come through `renderDocument`, factored out of `writeDocument` so the
    lineage and the installer serialize through one code path.
  - **The lineage's history is hand-maintained, and a test makes forgetting impossible.** The
    current-default hashes are pinned in `test/workspace/lineage.test.ts`: whoever changes
    `templates.ts` (or the catalog seed) sees the suite fail with the exact bookkeeping — append the
    outgoing hash to the artifact's history, repin. Without the guard-rail, a moved default would
    silently reclassify every untouched-but-old workspace as customized, and the upgrade would stop
    touching exactly the artifacts it exists to carry forward.
  - **Classification is conservative in the direction 0005 chose.** Only bytes Ward provably wrote
    are ever replaced: a match against the current default, a historical default, or the
    install-time baseline fingerprint. Everything else is `customized` — worst case the tool leaves
    an old default in place and names it, never the reverse. (The baseline-hash widening is
    defensive; today every baseline hash is also a lineage hash.)
  - **The upgrade writes into an existing task's workspace worktree — the pressure-tested
    recommendation, adopted.** `ward workspace upgrade TASK` requires the stewardship worktree to
    exist (refusal names `ward worktree create TASK --workspace`) rather than conjuring task,
    worktree, and branch itself. Why: the whole act becomes **one reviewable diff** on rails that
    already exist — preview (`merge --preview`), landing (the gated merge, §18), verification (the
    delivered close's reachability gate) are 0019's, reused unchanged; the artifact and the baseline
    that fingerprints it ride one commit (intent's atomicity requirement); and the record-first
    invariants hold because the candidate copy already records its own worktree. A self-scaffolding
    verb was rejected: it would re-implement three verbs' worth of convergence for the convenience
    of one command line, and the refusal teaches the flow instead.
  - **What the upgrade touches, and what it leaves to converge.** In scope: the three lineage
    artifacts, the CLAUDE.md bridge (absent → installed, fulfilling 0017's "a future workspace
    upgrade will carry this"; a regular file or foreign link → kept, named), the main-line name, the
    version stamp, the baselines. Left to `workspace create`: the standing project (0018's step) and
    the ignore policy — both already convergent, both named by doctor with their own remedy;
    duplicating them here would be a second mechanism for the same convergence.
  - **A divergent CLAUDE.md counts as residue.** 0017 named it "your own arrangement, kept" and this
    entry keeps that posture byte-for-byte — but the upgrade report additionally lists it as
    reconciliation residue, because after an upgrade moves `AGENTS.md` a divergent guidance surface
    is precisely user content that needs merging with upgraded ward content (the directive's own
    definition). Naming is not nagging: the report is per-run, and doctor's steady-state reading
    stays `info`.
  - **Baselines backfill only what stands at a current default.** A customized artifact gets no
    entry — an absent baseline already reads as customized, which is its honest standing — and
    entries whose fingerprints already match are kept byte-identical (preserving `installedAt`), so
    re-runs converge without a write. Kept entries for customized artifacts survive untouched: they
    are the record of what Ward installed, which is evidence, not error.
  - **The stamp advances with the upgrade commit, residue or not.** The human's gated merge is the
    adjudication act (intent: "a gated, Ward-managed merge is that adjudication made mechanical"),
    and the diff it lands names the residue it does not touch. The tension with "the stamp records
    changes considered and decided" when residue is left unreconciled is real and filed as SF-001
    rather than resolved by this entry.
  - **Doctor severities mirror the existing bridges.** Unrecorded name = `info` (the pre-0020
    workspace: nothing broken, the 0017/0018 migration-target pattern, remedy named). Drift,
    detached, or a vanished recorded branch = `warn`, never `error`: the workspace still operates —
    the journal proceeds loudly and the rails aim at the recorded name — and the remedy is one
    `git switch`. The finding emits only when the record is readable and the repository has commits;
    the broken-record and untracked cases already have their own findings.
- **Layout:** `src/workspace/lineage.ts` (new: `INSTALLED_ARTIFACT_LINEAGE`, `classifyArtifact`,
  `sha256OfText`), `src/workspace/upgrade.ts` (new: `upgradeWorkspace`); `src/store/types.ts` (the
  record's optional `mainLine`), `src/store/document.ts` (`renderDocument` factored out of
  `writeDocument`), `src/workspace/steward.ts` (`recordedWorkspaceMainLine`,
  `resolveWorkspaceMainLine`, `warnJournalOffMainLine`; the merge's drift refusal),
  `src/workspace/scan.ts` (`commitRecords` warns), `src/workspace/create.ts` (`establishMainLine`,
  the 13th step), `src/workspace/worktrees.ts` + `src/workspace/tasks.ts` (rails resolve through the
  recorded name), `src/workspace/doctor.ts` (`mainLineFinding`); `src/cli/schema.ts`
  (`workspaceUpgradeShape` + registry row), `src/cli/json.ts` (`workspaceUpgradeJson`),
  `src/cli/index.ts` (the `workspace upgrade` command + rendering), `src/cli/telemetry.ts`
  (`VERB_TREE`). Tests: `test/fixtures/legacy.ts` (the byte-exact historical defaults),
  `test/workspace/lineage.test.ts`, `test/workspace/upgrade.test.ts`,
  `test/workspace/mainline.test.ts`, `test/cli/upgrade.test.ts` — new files; deliberate edits to the
  three step-count pins only (`test/workspace/create.test.ts`, `test/cli/workspace.test.ts`,
  `test/cli/mutation-json.test.ts`).
- **Mechanisms:** _classify:_ hash the on-disk bytes → equal to current default → `current`; in the
  artifact's history (or the install-time baseline) → `stale` + era; else `customized`; absent →
  `missing`. _upgrade:_ resolve task → require its `source: 'workspace'` worktree, present and clean
  → under the store lock: classify each lineage artifact in the copy and write/install/keep →
  CLAUDE.md bridge → record `mainLine` (enclosing root's resolved name) + stamp → rebuild baselines
  from what now stands current → one `commitRecords` in the copy with exactly the changed paths →
  report (actions, residue, commit). _loud proceed:_ after every journal commit, compare the root's
  HEAD branch to the recorded name; differ → one stderr note naming both and the way back. _doctor:_
  recorded name vs `refs/heads/<name>` existence vs the root's symbolic HEAD → one finding row.

## Build log

### 2026-08-16 — Archaeology, the recorded main line, the lineage, and the upgrade — end to end

**Goal.** Everything in Scope in one iteration.

**The archaeology first** (read-only, against this worktree's own repository). The commits that ever
shaped installed defaults: `git log --follow --oneline -- src/workspace/templates.ts` → a71b091
(0002), d5336c3 (0003), c7962cc (0004), fd72287 (0005), bdd3363 (0008), 5f0d4be (0006), 3a9e4e0
(0011), 65f1e8b (0013), 2d83363 (0017), f8cb17b (0015), 94e6890 (0018);
`git log --oneline --
src/store/frontmatter.ts` → a71b091 only (the serializer never changed, so
historical catalog bytes are reconstructable with today's `joinFrontMatter`). Each commit's tree was
extracted read-only (`git archive <commit> src package.json | tar -x -C …`) and a Bun script
imported each era's `templates.ts` + `types.ts` and hashed `AGENTS_MD`, `WARD_INTERNAL_README`, and
the serialized catalog. Results: **AGENTS.md** has 11 distinct defaults (every listed commit;
current `de4ee843…` since 94e6890/0018), **.ward/README.md** has 3 (`73043945…` a71b091/0002,
`606af55f…` fd72287/0005, current `6f108456…` since 65f1e8b/0013), **catalog.md** has exactly 1
(`0487e4b2…`, byte-stable since a71b091/0002). The live workspace's required contents are proven
members: `AGENTS.md` `05eaa276…` is **c7962cc's default (design 0004)** — consistent with the live
workspace's creation on 2026-08-05, between 0004 and 0005 — and `.ward/README.md` `73043945…` is
**a71b091's default (design 0002)**. The ten historical AGENTS hashes and two historical README
hashes ship in `lineage.ts`; the fixture texts in `test/fixtures/legacy.ts` were generated
byte-exactly from read-only copies of the live files, and the suite re-hashes them against the
pinned live sha256s so a transcription error cannot pass.

**What was done.** Built everything under Design → Layout: the record's `mainLine` + the
`workspace main line` creation step (**12 steps → 13** — the pinned count in
`test/cli/mutation-json.test.ts` updated deliberately, with `test/workspace/create.test.ts` and
`test/cli/workspace.test.ts` beside it); `recordedWorkspaceMainLine` / `resolveWorkspaceMainLine` /
`warnJournalOffMainLine` in `steward.ts` with the merge's drift refusal; the rails re-aimed through
the resolved name; doctor's `workspace main line` finding; `lineage.ts` and `upgrade.ts`; the
`workspace upgrade` CLI arm, shape, builder, registry row, and `VERB_TREE` entry. Tests: 4 new files
(9 lineage + 6 upgrade + 10 mainline + 6 CLI cases) plus the three deliberate pin edits.

**What works now — with the commands that prove it** (Bun 1.3.14, git 2.54.0, macOS):

- `bun test` → `307 pass, 0 fail, 1196 expect() calls` across 32 files (from 276/1059/28 at entry
  start) — all five acceptance scenarios, including the live-shape fixture upgraded end to end
  (upgrade → converge-on-rerun → gated merge → delivered close with the `reachability` step), the
  customized artifact byte-identical and named in `residue` with no baseline invented, doctor's
  ok/info/warn states all healthy, the loud proceed on stderr with stdout intact under `--json`, and
  the merge refusing the drifted root then landing after `git switch` back.
- `mise run check >/dev/null 2>&1; echo exit=$?` → `exit=0` (Biome + dprint + `tsc --noEmit` +
  `bun test` + lychee, end to end).
- Dogfood in a scratch workspace (`bun src/cli/index.ts`, never the live workspace): a fresh create
  reports 13 steps; regressed to the live shape (fixture `AGENTS.md`, fixture `.ward/README.md`,
  empty baselines, `mainLine` stripped from the record), `ward doctor` reads
  `i workspace main line — no recorded main-line name …`; then `task open upgrade-ward` →
  `worktree create t1 --workspace` → `workspace upgrade t1` renders
  `upgraded .ward/README.md (untouched since a71b091 (design 0002) …)`,
  `upgraded AGENTS.md (untouched since c7962cc (design 0004) …)`, `current catalog.md`,
  `current CLAUDE.md`, `main line ('main' recorded)`, `baselines (updated)` and commits `8d064d3` on
  `steward/upgrade-ward`; `workspace merge --preview` shows the 4-file diff stat; the merge lands as
  `8b1d7ae`; `task close t1` verifies
  `reachability (branch 'steward/upgrade-ward' (tip 8d064d3) reaches main …)` and tears down. After
  the merge: `shasum -a 256 AGENTS.md .ward/README.md` → `de4ee843…` and `6f108456…` (the current
  defaults, byte-exact), `workspace.md` carries `mainLine: main`, and doctor reads all three
  baselines `untouched since install` and `✓ workspace main line`.

**Decisions** (entry-local, found while building): all recorded under Design → Decisions. Two worth
naming: the converge-never-re-records rule was forced by a test sketch in which converging a drifted
root would have silently moved the recorded name to the drifted branch — the exact quiet
redefinition the field exists to prevent; and a Bun test quirk surfaced (`toMatchObject` with
`expect.stringContaining` mutates the received finding's field into the matcher object), worked
around by asserting severity and message separately in `mainline.test.ts`.

**Next.** In dogfood-priority order: run the real upgrade against the live bootstrap workspace
through these rails (the acceptance fixture is its exact state, so the flow is proven); the
agent-orchestrated reconciliation entry that consumes the residue report; recorded declines
(SF-001); 0019's remaining deferred doctor findings when evidence of silent degradation appears.

## Spec-feedback

- **SF-001** — [`workspace-lifecycle`](../../intent/01-concepts/06-workspace-lifecycle.md),
  _Reconciliation is one task, and its close asserts adjudication_ / _What the stamp therefore
  means_. _Friction:_ the slice narrates upgrades through a reconciliation **task** whose delivered
  close asserts per-artifact adjudication, and defines the stamp as "changes considered and decided"
  — but the owner's directive (and this entry) make the common case a **deterministic tool act**
  with no decisions in it: where copies are untouched "the new default simply applies — there is no
  decision to make" (intent's own sentence), and the only human act is the gated merge. The friction
  is the stamp under **residue**: this entry's upgrade advances `wardVersion` in the same commit
  even when customized artifacts are left unreconciled, so the stamp now means "the mechanical
  upgrade landed and the residue was named," which is weaker than "considered and decided."
  _Assumption to keep moving:_ the gated merge of a diff whose report names the residue is the
  human's adjudication of **this** upgrade, and doctor's per-artifact `customized` findings keep the
  residue permanently visible, so nothing is hidden by the stamp. _Proposed revision:_ name the
  deterministic fast path explicitly in the slice (the tool act for untouched artifacts, no task and
  no adjudication needed), and state what the stamp asserts when residue exists — either bless
  "mechanically upgraded, residue named" as sufficient, or direct that the stamp advance only when a
  reconciliation task has adjudicated the residue.
- **SF-002** — [`workspace-lifecycle`](../../intent/01-concepts/06-workspace-lifecycle.md),
  _Reconciliation_ (the trigger rule: "Ward's default changed **between the stamped version and the
  CLI in hand**"). _Friction:_ the trigger is keyed on version numbers, but Ward's actual practice
  gives them no resolution — every workspace ever created is stamped `0.1.0` while the installed
  defaults moved **eleven times** (AGENTS.md alone, per the archaeology above). A
  version-stamp-keyed "did the default move" question is unanswerable in practice; the workable key
  is content. _Assumption to keep moving:_ the content lineage satisfies the trigger's purpose
  exactly — an artifact is touched only when its bytes match a default Ward actually shipped and
  that default is no longer current — with no version algebra anywhere. _Proposed revision:_ restate
  the trigger as content-keyed ("Ward's default moved since the default the workspace's copy was
  installed from"), leaving the stamp to mean what _Version skew_ needs (schema generation), not
  artifact deltas.

One near-candidate adjudicated rather than filed: intent's "comparison is always
current-versus-current-default, never a delta between two Ward versions" might seem to forbid a
shipped history of defaults — but the same section says whether a default moved "is a question about
Ward's own shipped versions, answerable on Ward's side alone," which is precisely what the lineage
is; what is **presented** (the upgrade report, doctor) remains current-vs-current throughout, so no
revision is needed.
