# 0014 — Stale-base warning: catch the mis-aimed PR before the merge

> The probe's single per-URL call grows a `baseRefName`, and `needs you` gains the derivable
> condition it unlocks: an OPEN PR whose base is not its repository's main line is warned about —
> with the base, the main line, the stake, and the retarget remedy named — while the mistake is
> still cheap to fix, instead of only being refused at the close gate after the merge has already
> stranded the work.
>
> **Status:** accepted · **Started:** 2026-08-11

The motivating incident is [`0012`](../0012-close-gate-reachability/README.md)'s: PR #24 (entry
0010) was stacked on 0009's branch and never retargeted after 0009's PR #22 merged, so when #24 was
merged it merged into the retired base `design/0009-live-forge-state` and the work never reached
main — re-landed later as #26. 0012 taught the **close gate** the difference between "merged" and
"reached the main line," which is the backstop at the only moment the mistake destroys work. But the
gate fires after the merge, when the only fix left is re-landing; the incident's **cause** — an open
PR aimed at a branch that is not the main line — was visible on the forge for days before, in a
field the probe was not asking for. 0012's Deferred section names this entry: "an earlier warning is
additive attention-routing on the same probe data (plus a `baseRefName` field riding the same
call)." This entry asks for that field and routes the attention: retarget before merging, instead of
re-landing after.

## Serves intent

- [`human-shell`](../../intent/02-subsystems/07-human-shell.md) — "**What needs me?** is a
  first-class query" presenting "the conditions **derivable** from the record and the world's live
  state … directly and **never stored as requests just to be presentable** (§17)": the stale base is
  exactly such a condition — it exists in the PR's live base plus the repository record's main line
  alone — and it joins the same one glanceable, deduplicated answer 0009 built, with acting on it
  kept one step (the remedy is a single named command). The condition list this extends is read as
  examples, not a closed set (SF-001).
- [`work-lifecycle`](../../intent/01-concepts/03-work-lifecycle.md) — _Ward absorbs the recurring
  toil_: "watch PR and CI status … and **surface only what needs a human**" — a PR whose merge
  cannot deliver its work is the surfacing at its highest value, because the cardinal rule ("work …
  reaches the main line **only through a pull request**") is satisfied in letter and defeated in
  substance by a PR aimed at a branch that never lands; the incident proved the human's move
  (retarget) is cheap before the merge and expensive after.
- [`principles`](../../intent/00-foundation/01-principles.md) §20 — precision is a **cost
  decision**: this warning costs **zero extra forge calls** (one more field in the same single
  read), so the high-frequency glance can afford it, exactly where 0012's fetch-per-repository
  verification could not live; and every link that cannot answer — unmappable URL, unreported base —
  degrades to honest silence, never a guess. §17 — the condition is derived at read time from live
  forge state plus the repository record; nothing is stored. §16 — the base is the **forge's**
  record about its own PR, read live like the rest of the probe's answer; the main line is
  **ward's** record, read from the repository record it already keeps. §18 — retargeting a PR is an
  outward act on the forge: the warning names the command, the human runs it.
- [`remote-provider`](../../intent/02-subsystems/06-remote-provider.md) — "report PR status … so
  Ward can drive a task to completion and surface what is blocking a merge": the base joins the
  adapter's neutral vocabulary as one more optional field of the same single read, the same additive
  move `reviewDecision` (0009) and `mergeCommit` (0012) made before it.

## Scope

- **In:**
  - **The probe carries the base.** The single per-URL call grows to
    `gh pr view URL --json state,reviewDecision,mergeCommit,baseRefName`; `PrForgeState` gains an
    optional `baseRefName`. Same one call per URL — zero added forge cost, zero added latency. A
    missing or empty value stays absent: it degrades, it is never guessed — the same convention as
    `reviewDecision` and `mergeCommit`.
  - **The derivable condition: an OPEN PR whose base is not the repository's main line.** Derived at
    read time in the `needs you` derivation, never stored (§17): map the PR URL to a repository
    record (0012's `prBelongsToRemote` — host + repository path against the recorded remote),
    compare the reported base to that repository's recorded `mainLine`. Only OPEN PRs qualify — a
    merged PR's base is history the glance can do nothing about, and the close gate (0012) owns that
    end. Every unanswerable link is honest silence: no matching repository record, no reported base,
    a non-open state. The close gate still backstops whatever the silence misses.
  - **Surfaced where attention routes: `needs you`.** A qualifying PR joins the list as a
    `stale-base` entry naming the task, the PR, its current base, the expected main line, the stake
    (merging as-is delivers into a branch that may never land — the close gate would refuse it), and
    the cheap remedy: `gh pr edit <url> --base <mainLine>`. In `--json` the entry carries `pr`,
    `base`, and `mainLine` as optional fields on the existing `needsYou` shape; the availability
    semantics are untouched (`needsYou` omitted ⇔ forge unavailable; `[]` ⇔ nothing waits).
  - **The per-PR `forge` rows in `--json` carry `baseRefName`** whenever the forge reported it — the
    raw datum, under the same presence rule as `reviewDecision` (absent ⇔ the forge did not report
    it, never the result of a comparison). The human renderings of the per-task lines are
    **unchanged** — the adjudication is under Design → Decisions.
  - **Tests, hermetic throughout:** the fake `gh` answers `baseRefName` in gh's own shape; the
    translation table grows the field (including the incident-prequel row: an open PR based on
    `design/0009-live-forge-state`); the derivation table covers warned and every silent case; a new
    spawned-CLI suite replays the exact #24 prequel over a repository registered under a
    forge-shaped remote (0012's `insteadOf` seam) and asserts the warning verbatim in both
    renderings, plus each silence and the unchanged availability bit.
- **Deferred:**
  - **Acting on the warning — ward retargeting the PR itself.** Editing a PR's base is an outward
    act on the forge (§18): the remedy is named on the surface, running it is the human's. _Why
    safe:_ the named command is one paste away, and the close gate refuses the destructive path if
    the warning goes unheeded.
  - **Doctor involvement.** A stacked base is a **work-state condition, not a broken capability
    link**: stacking a PR on another task's branch is a legitimate, sometimes deliberate arrangement
    — wrong only if it is still aimed there when the merge happens — while doctor's remit (§20's
    loop) is naming the capability breaks other surfaces degrade over (gh absent, unauthenticated).
    No surface renders "unavailable" because a base is stale, so there is nothing here doctor is
    obliged to explain; routing work-state to `needs you` and capability health to doctor keeps both
    surfaces meaning one thing. _Why safe:_ the condition is never invisible — the glance carries it
    live wherever the forge answers, and doctor gains nothing over that except a second place to say
    it.
  - **A "knowingly stacked" acknowledgment** (suppressing the warning for a deliberate stack). It
    would require recording a human judgment just to quiet a derived surface — a stored suppression
    is a new mutable record with §17 obligations — and a deliberately stacked PR is precisely the
    state worth one line of standing attention until its base merges (the incident happened because
    that state was invisible, not because it was noisy). _Why safe:_ additive if dogfooding proves
    the noise real; the entry shape already carries everything a suppression rule would key on.
  - **Verifying the base beyond the name** — e.g. asking the forge whether the base branch still
    exists or its own PR merged. Each is a second forge call; this entry's license is the
    zero-added-cost field. _Why safe:_ the name comparison alone catches the incident's shape, and
    the close gate verifies delivery with git itself where the cost is affordable (0012).
  - **`needs you` on `task list`.** `status` remains the one attention surface (0009's decision);
    the `task list --json` rows now carry the raw `baseRefName`, which is that verb's honest share
    of the answer. _Why safe:_ deriving the warning elsewhere is a pure-function call away
    (`deriveNeedsYou`), additive when wanted.
  - **Other forges.** As since 0004. _Why safe:_ the base field and the URL→repository mapping live
    in the adapter's neutral vocabulary; a second forge supplies its own read behind the same types.
- **Acceptance:** from a cold checkout, `mise run check` is green, and `bun test` proves:
  1. **the incident prequel**: the exact #24 shape — an open PR based on another entry's branch, in
     a repository whose recorded main line is `main` — produces the `needs you` warning with the
     base, the main line, and the retarget remedy, asserted **verbatim** through the spawned CLI,
     and the `--json` entry carries `pr`, `base`, and `mainLine`;
  2. the derivation: open + non-main base + mappable → warned; merged + non-main base → silent
     (awaiting-close still derives); absent base → silent; unmappable URL → silent; open + main base
     → silent; one open PR can carry both changes-requested and stale-base;
  3. the probe translates `baseRefName` alongside state, review decision, and merge commit — same
     single call — and absence stays absent;
  4. both renderings: the human warning line and the `--json` shapes (needsYou entry and per-PR
     `forge` rows) validate under the registry schemas;
  5. the availability semantics are unchanged: without a usable `gh`, `needsYou` is omitted entirely
     and the degraded rendering is exactly 0009's.

## Design

- **Decisions:** no new ADRs — the existing stack carries this entry. Entry-local:
  - **The base rides the same call.** `baseRefName` is one more field in the single `gh pr view` the
    probe already makes — zero extra processes, zero extra latency — so the high-frequency glance
    affords the warning by construction (§20: precision is a cost decision, and this precision is
    free). Absence is represented by absence, the `reviewDecision` convention.
  - **Warn only when every link answers; otherwise silence, not "maybe."** The chain is: PR is OPEN
    → forge reported a base → a repository record's remote matches the URL (0012's
    `prBelongsToRemote`) → base ≠ that record's `mainLine`. Any earlier exit derives nothing. A
    speculative item ("this PR _might_ be mis-aimed") would spend the human's glance on a guess —
    §20's wrong answer in attention-routing form — and unlike the close gate, which must decide and
    therefore names its trust aloud, the glance has a backstop: the gate re-asks the question with
    git itself before anything is destroyed. Silence here is honest _because_ 0012 exists.
  - **Only OPEN PRs qualify.** A merged PR's base is history — retargeting is no longer among the
    human's moves, so a warning would route attention at a decision that no longer exists. The
    delivered close is where a merged-into-a-dead-base PR gets caught, with the re-land remedy that
    moment actually has (0012). The two surfaces split by what the caller can still do.
  - **The warning is a `needs you` entry, not a new surface.** The human-shell contract wants one
    glanceable, deduplicated answer; the stale base is a third spring feeding the same list —
    `reason: 'stale-base'` plus optional `base` and `mainLine` on the existing entry shape, presence
    semantics untouched. The line names diagnosis, stake, and remedy in one breath because the
    reader acts from this line alone: which PR, based where, expected where, why it matters (merging
    as-is delivers into a branch that may never land — the close gate would refuse it), and the
    command (`gh pr edit <url> --base <mainLine>`). Ward names the command and never runs it: a PR's
    base is the forge's record, and editing it is an outward act (§18). The alternative move —
    knowingly leaving the PR stacked until its base merges — is also legitimate, and costs exactly
    one standing line.
  - **Per-PR `forge` rows carry the raw base; human lines do not.** Adjudicating the zero-cost-data
    vs. noise trade: `--json` gains `baseRefName` because it is a **raw forge datum** under the same
    contract as `reviewDecision` — and because `task list --json` has no `needsYou` surface, the row
    is where an agent reading that verb sees the base at all. This differs from 0012 keeping
    `mergeCommit` internal deliberately: the oid is gate input no glance caller acts on, while the
    base is glance data by this entry's whole argument. A conditional emission (only when ≠ main)
    was rejected as the dishonest shape — presence would encode a judgment, and absence would be
    ambiguous between "based on main" and "could not tell." The **human** task lines stay untouched:
    the `prs:` summary is a count, branch names would wreck its glanceability, and the diagnosis
    already lives in the `needs you` block — repeating it per-task would break the one-deduplicated-
    answer bar the surface exists to meet.
  - **Growing the `reason` enum is the additive move.** The schema ships inside the binary (0008),
    so the emitted contract and the emitting build always agree; a consumer discovers `stale-base`
    from `ward schema` exactly as it discovered the field itself. New optional fields (`base`,
    `mainLine`) follow the 0005 policy verbatim.
  - **First matching repository record decides the main line.** Records are read in name order
    (deterministic, §6); two names registered for one remote is the degenerate case and the first
    answers. Not worth a plural-match refusal: the mapping is identity by host + path, and identical
    remotes share a main line in every non-pathological workspace.
  - **Stale-base rides per-PR, after the changes-requested check.** One open PR can legitimately
    carry both conditions and gets both entries, in a stable order (task order, then PR-set order,
    then reason order within a PR). The all-merged short-circuit is untouched — a fully merged set
    has no open PR to warn about.
- **Layout:** `src/forge/gh.ts` (the `baseRefName` field and its parse — adapter knowledge stays in
  the adapter); `src/workspace/status.ts` (`NeedsYouEntry` grows the reason and fields;
  `deriveNeedsYou` takes the repository records; `staleBase` is the four-link chain; `statusReport`
  reads the records it already owns the store path for); `src/cli/schema.ts`
  (`prForgeShape.
  baseRefName`, the grown `needsYouShape`); `src/cli/json.ts` (the two builders
  emit the new optionals); `src/cli/index.ts` (`renderNeedsYou` gains the stale-base line — the only
  touch on that file, kept clear of the dispatch). Tests: `test/cli/stale-base.test.ts` (the
  incident prequel and every silence through the spawned CLI, over the `insteadOf` seam),
  `test/forge/gh.test.ts` (the grown translation table), `test/workspace/status.test.ts` (the grown
  derivation table), `test/cli/forge-state.test.ts` (unmappable silence + the JSON rows carrying the
  base), `test/helpers.ts` (fake gh answers `baseRefName` as gh does).
- **Mechanisms:** the probe's single `gh pr view` asks for one more field and translates it under
  the absence convention → `statusReport` reads the repository records alongside tasks and projects
  → `deriveNeedsYou(tasks, repositories)`, per non-closed task with forge state: all-merged →
  `awaiting-close`; else per open PR: changes-requested → entry; `staleBase(pr, repositories)` (open
  ∧ base reported ∧ `prBelongsToRemote` match ∧ base ≠ `mainLine`) → `stale-base` entry with
  `{pr, base, mainLine}` → rendering: one `!` line naming diagnosis, stake, and remedy; `--json` via
  the explicit builders. Nothing is stored; the probe's cost is unchanged.

## Build log

### 2026-08-11 — The warning built end to end

**Goal.** Everything in Scope in one iteration. **What was done.** Grew `src/forge/gh.ts` (the
single call asks for `baseRefName`; `PrForgeState.baseRefName` under the absence convention);
`src/workspace/status.ts` (`NeedsYouEntry` gains `stale-base` + `base`/`mainLine`;
`deriveNeedsYou(tasks, repositories)` with the `staleBase` four-link chain; `statusReport` reads the
repository records); `src/cli/schema.ts` + `src/cli/json.ts` (the grown `needsYouShape` and
`prForgeShape.baseRefName`, matching type-pinned builders); `src/cli/index.ts` (the `stale-base` arm
of `renderNeedsYou` — the file's only change). Tests: `test/cli/stale-base.test.ts` (six spawned-CLI
cases over a repository registered under `https://forge.example/demo` through the `insteadOf` seam),
the grown translation table in `test/forge/gh.test.ts` (including the incident-prequel row), six new
derivation rows in `test/workspace/status.test.ts`, the unmappable-silence + JSON-rows case in
`test/cli/forge-state.test.ts`, and `writeFakeGh` answering `baseRefName` in gh's own shape in
`test/helpers.ts`.

**What works now — with the commands that prove it** (Bun 1.3.14, macOS):

- `bun test` → `173 pass, 0 fail, 554 expect() calls` across 20 files (from 160/515/19 at entry
  start) — all five acceptance scenarios, including the verbatim incident-prequel assertion, every
  silent link of the derivation chain, and the unchanged availability semantics.
- `mise run check` → green end to end (Biome + dprint + `tsc --noEmit` + `bun test` + lychee).
- Dogfood smoke (scratch workspace via `bun src/cli/index.ts`, local bare remote registered as
  `https://forge.example/demo` through the `insteadOf` seam, fake `gh`): replaying the prequel — t1
  linking `…/demo/pull/24`, the fake forge reporting `OPEN`/`APPROVED` with base
  `design/0009-live-forge-state` — `ward status` renders `needs you` /
  `! task t1 — PR https://forge.example/demo/pull/24 is based on 'design/0009-live-forge-state',
  not the main line 'main' — merging as-is delivers into a branch that may never land (the close
  gate would refuse it); retarget first: gh pr edit https://forge.example/demo/pull/24 --base main`;
  `status --json` carries
  `{"task":"t1","reason":"stale-base","pr":…,"base":"design/0009-live-forge-state","mainLine":"main"}`
  and the forge row's `baseRefName`; after the retarget (the fake now reporting base `main`) the
  same command renders no `needs you` block and `needsYou` is `[]`.
- `bun src/cli/index.ts schema status` emits the grown contract: `reason` enum
  `awaiting-close|changes-requested|stale-base`, optional `base`/`mainLine` on the needsYou entry,
  optional `baseRefName` on the per-PR forge row — self-describing, no new documentation surface.

**Decisions** (entry-local, found while building): all recorded under Design → Decisions; the one
worth naming — the derivation initially returned the main line alone and the entry re-read
`pr.baseRefName`, which the type system rejected at the exact-optional boundary; making `staleBase`
return the `{base, mainLine}` pair made the four-link chain's all-or-nothing contract structural
instead of incidental.

**Next.** Natural follow-ons, in dogfood-priority order: checks (CI) status joining `prForgeShape`
when something reads it (deferred since 0009); the messaging-seam successors to `needs you` (0009
SF-001); the "knowingly stacked" acknowledgment if dogfooding shows standing stale-base lines are
noise rather than signal.

## Spec-feedback

- **SF-001** — [`human-shell`](../../intent/02-subsystems/07-human-shell.md), "Constraints any
  design must honor" → the "what needs me?" bullet. _Friction:_ the derivable-conditions clause
  enumerates its conditions in a parenthetical — "(a task's PR set fully merged and awaiting the
  gated close, changes requested awaiting action, version skew)" — that reads as a closed list. The
  stale base is a fourth condition squarely inside the clause's own definition ("derivable from the
  record and the world's live state"), and under a closed reading every future derivable condition
  needs a spec edit before it may be surfaced — inverting the relationship between a living contract
  and its examples. _Assumption to keep moving:_ the parenthetical is illustrative, not exhaustive;
  the durable contract is "derivable conditions are presented directly and never stored," and this
  entry adds one under it. _Proposed revision:_ mark the list as examples — "the conditions
  **derivable** from the record and the world's live state (e.g. a task's PR set fully merged and
  awaiting the gated close, changes requested awaiting action, work aimed at a target that cannot
  deliver it — a PR based on a branch that is not the main line —, version skew)" — or drop the
  enumeration entirely and let the design ledger carry the growing set. One near-candidate not
  filed: the [`remote-provider`](../../intent/02-subsystems/06-remote-provider.md) contract's
  "report PR status" does not name the base branch among what the adapter reports — adjudicated as
  adapter detail under the existing "PR status" clause, the same call 0012 made for the merge commit
  and 0009 for the review decision.
