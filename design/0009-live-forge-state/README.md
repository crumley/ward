# 0009 — Live forge state

> The in-review overlay stops approximating: for tasks with linked PRs, `status` and `task list`
> read each PR's live state from the forge (via `gh`) at the moment of asking — state and review
> decision, never stored — refine in-review to intent's exact ≥1-open-PR rule, and derive a minimal
> `needs you` surface (the seed of "what needs me?"); without `gh`, both verbs render everything
> they render today with forge state marked unavailable.
>
> **Status:** accepted · **Started:** 2026-08-09

Since [`0004`](../0004-work-spine/README.md) the in-review overlay has meant "has linked PRs and is
not closed" — an approximation recorded there as an approximation, with the honest rule (≥1 **open**
PR) waiting on a forge to ask. The PR set already stores **URLs only**, exactly so that review state
could be read live when this entry arrived: 0004's decision — "review state is the forge's truth,
read via `gh` when present; storing it would be the stale-cache §17 warns about" — is intent's rule
([`work-lifecycle`](../../intent/01-concepts/03-work-lifecycle.md), Task states: a stored review
state "would be a second source that goes stale the instant a PR opens or merges"). This entry asks
the forge, keeps storing nothing, and spends the answer twice: the exact overlay, and the first
derived items of the human-shell's "what needs me?" query.

## Serves intent

- [`work-lifecycle`](../../intent/01-concepts/03-work-lifecycle.md) — _Completion_: "Track PRs. For
  each: identity, status (open / changes requested / approved / merged)" — the probe reads exactly
  this pair, live; _Task states_: `in-review` **derived from the open-PR set, never stored** — now
  computed from the actual open-PR set, not the linked-PR approximation; _Ward absorbs the recurring
  toil_: "watch PR and CI status … and **surface only what needs a human** — what is blocked, what
  is ready" — the `needs you` items are that surfacing, minimally.
- [`principles`](../../intent/00-foundation/01-principles.md) §17 (no lost updates → derive shared
  state) — review state's source of truth is the forge; a stored copy is the stale cache, so the
  record keeps identity (URLs) and the state is read at the moment of asking. §16 is the nuance, not
  a conflict: "prefer recorded state" governs Ward's **own** state, and the forge's state is the
  forge's record — Ward storing a copy would be exactly the fragile live-state cache §16 warns
  against, held one system too far from its truth. §6 — the same records plus the same forge answers
  produce the same bytes, and the degraded mode is itself deterministic. §8 — both audiences get the
  same content: human rendering extended in place, `--json` extended additively, a declared agent
  (`WARD_AGENT`) ANSI-free. §18 — the gated close is the human's; `needs you` routes attention to
  the gate, it never acts.
- [`human-shell`](../../intent/02-subsystems/07-human-shell.md) — "**What needs me?** is a
  first-class query": this entry builds its seed — the two attention items derivable today (a fully
  merged PR set awaiting the gated close; changes requested on an open PR) — as a derived-only
  surface inside `status` (friction with the constraint's messaging-seam wording: SF-001). Also the
  doctor posture — `gh` stays an **optional external tool Ward takes advantage of when installed**,
  so its absence degrades and never breaks.
- [`remote-provider`](../../intent/02-subsystems/06-remote-provider.md) — "report PR status — review
  state and checks (CI) status" behind a **thin, replaceable adapter**: the probe is that adapter's
  first read path, in its own module with a neutral vocabulary; checks stay deferred (below).

## Scope

- **In:**
  - **The forge probe** (`src/forge/gh.ts`): live state per PR URL —
    `open | merged | closed |
    unknown` plus review decision
    `approved | changes-requested | review-required` — from one
    `gh pr view URL --json state,reviewDecision` call per unique URL, all in parallel under a short
    deadline (default 3000 ms). One honest availability bit: absent, unauthenticated, offline,
    rate-limited, and hung forges all collapse to `live: false`. Two ambient seams (`WARD_GH`,
    `WARD_GH_TIMEOUT_MS`) make the boundary fakeable through a spawned CLI.
  - **`status` and `task list` read live forge state** for the non-closed tasks' PR sets: in-review
    refined to intent's exact rule (cleared only when every linked PR is known resolved); a per-task
    `prs:` summary on the human lines; per-PR `forge` arrays in `--json`. Declared agents get the
    same content, no ANSI.
  - **Graceful degradation:** when the forge cannot answer, both verbs render everything they render
    today — the 0004 approximation stands, one dim note marks forge state unavailable, forge-state
    JSON fields vanish (never null), exit codes unchanged, output still byte-deterministic.
  - **The `needs you` surface, minimal and derived-only** (in `status`): a task whose PR set is
    fully merged awaits the human's gated close; an open PR with changes requested awaits their
    action. Derived from records + live forge state at render time, nothing stored, no messaging
    seam. Present in `--json` exactly when the forge answered (`needsYou`, possibly empty); rendered
    as a block only when non-empty.
  - **The close gate reads through the same probe** — `task close`'s PR-set resolution
    (`resolvePrSet`) drops its own `gh` calls for the shared boundary: same trust semantics as 0004
    (unreadable set → the human's stated outcome is trusted and the trust reported), now
    deadline-bounded and fakeable in tests.
  - **Schema registry rows** (`src/cli/schema.ts`): `prForgeShape`, the `forge` field on the shared
    task shape, `needsYouShape` and `needsYou` on the status shape — all optional, additive, and
    emitted by `ward schema` like every other field (0008).
- **Deferred:**
  - **CI / checks status.** The remote-provider contract names it, but review decision rides in the
    same single `gh pr view` call while checks (`statusCheckRollup`) are a second, per-check payload
    — real cost on a high-frequency verb — and neither `needs you` rule needs them. _Why safe:_ the
    additive-evolution policy means checks later join `prForgeShape` as one more optional field; the
    probe already owns the callsite.
  - **Watching on a cadence.** Deferred since 0004; still nothing that can watch. _Why safe:_ the
    probe is a pure read invoked per command; a watcher later calls the same function on a timer.
  - **`needs you` beyond the two PR rules** — closed-unmerged PR sets (abandoning is a judgment, not
    a derivation: claiming a closed PR "needs you" guesses the human's intent), version skew (the
    human-shell says it reaches this surface; it needs the skew condition plumbed, its own entry),
    wakes and recorded requests (the messaging seam does not exist). _Why safe:_ the surface is a
    derived list with a stable entry shape; each new source appends entries and, per SF-001, the
    deduplicated-answer contract is what must hold when sources multiply.
  - **A dedicated "what needs me?" verb.** _Why safe:_ the items live in `status` — the glanceable
    place — and `needsYou` in its JSON is already the entry shape a future `ward needs` (or the
    contract's chosen name) would emit; extracting a verb is additive.
  - **Other forges.** `gh` is today's only forge, as since 0004. _Why safe:_ the adapter boundary is
    now a module with a neutral vocabulary (`src/forge/`); a second forge is a sibling behind the
    same types, selected by the PR URL's host — a new file, not a migration.
  - **A workspace `AGENTS.md` lesson for the new fields.** _Why safe:_ the contract is
    self-describing (`ward schema`, 0008) — an agent discovers `forge` and `needsYou` from the tool;
    a prose restatement is the drift the 0008 entry exists to prevent.
- **Acceptance:** from a cold checkout, `mise run check` is green, and `bun test` proves:
  1. against a fake forge (never the network), `status --json` and `task list --json` carry per-PR
     `forge` state validating strictly under the registry shapes; in-review follows the exact rule
     (a fully merged set is **not** in review); `needsYou` derives both reasons; the human
     renderings carry the PR summaries and the `needs you` block;
  2. without a usable `gh` (absent, erroring, or hung past the deadline), both verbs render
     everything they render today plus the unavailable note — exit 0, no forge-state JSON fields,
     byte-identical across runs — and the hung probe is cut at the deadline;
  3. the probe translates gh's vocabulary correctly, dedupes URLs, stays live on a partially
     readable set (unreadable PR → `unknown`, never guessed), and treats nothing-to-ask as live;
  4. `task close` reads the same seam: an open PR refuses the close, a merged set delivers, an
     unavailable forge trusts the stated outcome aloud;
  5. a declared agent gets byte-identical content to a NO_COLOR human, ANSI-free under
     `FORCE_COLOR`.

## Design

- **Decisions:** no new ADRs — the existing stack carries this entry (gh already the forge tool
  since 0004, zod already the schema home per [ADR 0005](../decisions/0005-store-stack.md)).
  Entry-local:
  - **Read live, store nothing — and what "nothing" means.** The task record keeps the PR URLs it
    always kept; no probe result is ever written anywhere (no cache file, no field, no memo). Cost:
    every `status` pays the probe. Accepted because the stale copy is the worse failure — silently
    wrong routing of the human's attention (§17) — and the probe is bounded (below).
  - **Review decision rides along; checks stay behind.** `state` alone cannot derive "changes
    requested awaits you," and `reviewDecision` is one more field in the **same** `gh pr
    view`
    call — zero extra processes, zero extra latency. Checks are the opposite trade (a second
    heavyweight payload) and no built rule reads them: deferred, additively.
  - **The seam is ambient (`WARD_GH`), not a function parameter.** The test idiom proves contracts
    through the spawned CLI (0005), so the boundary must survive a process boundary; an env-named
    executable is the same hermetic move as the git-config pins in `test/helpers.ts`, and the
    helpers pin it to an impossible path so no test can reach the machine's real `gh`. It doubles as
    a human affordance (a wrapper script for a nonstandard `gh`).
  - **Degradation is one honest bit.** `live` is true when at least one URL resolved — or when there
    was nothing to ask (no PRs means nothing can be stale). All-URLs-failed collapses to
    unavailable: unauth, offline, and rate-limited are indistinguishable from bad URLs at this
    distance, and a wrong "merged" is worse than an honest "unavailable." A **partially** readable
    set stays live with the unreadable PRs marked `unknown` — and `unknown` degrades conservatively
    everywhere: it never clears in-review (the approximation stands for that task) and never
    contributes to an all-merged claim.
  - **`inReview` keeps its name and meaning; only its accuracy changes.** The field always meant
    intent's derived in-review; 0004 recorded its computation as an approximation. With forge state
    the exact rule applies; without it the approximation stands. Additive evolution holds — no field
    changed name or meaning.
  - **`needsYou`'s presence is the availability signal.** Omitted exactly when the forge did not
    answer; present-and-empty means "the forge answered: nothing awaits you." No second
    `forgeAvailable` indicator — the brief fields policy (forge state vanishes when unavailable)
    already encodes the bit, and a task's `forge` array carries the same signal per task.
  - **The probe is parallel, deadline-bounded, and skips settled work.** One spawn per unique URL,
    all concurrent, each killed at the deadline (default 3000 ms, `WARD_GH_TIMEOUT_MS` to override):
    worst case one deadline, not one per PR. Only **non-closed** tasks' sets are probed — a closed
    task's set was resolved at its gated close, and probing settled work spends latency on nothing.
    An absent binary costs no spawn at all, so the 0004-era experience is unchanged where `gh` never
    existed.
  - **`needs you` renders last, and only when non-empty.** The head of the human output stays
    byte-identical to the degraded (and 0004) rendering — degradation is literally truncation plus a
    note — and the call to action sits where the eye stops. An empty block would be noise in the
    glanceable answer; the JSON keeps the explicit `[]` for agents.
  - **The close path joins the same boundary.** 0004's `resolvePrSet` shelled to `gh` on its own;
    now one module owns every forge read, so the close gate got the deadline and the fake for free,
    and its trust semantics (unreadable → trust the stated outcome, aloud) are pinned by a spawned
    test for the first time.
- **Layout:** `src/forge/gh.ts` (the probe — a new top-level home because the remote-provider seam
  is a different subsystem from the workspace record logic; its neutral types are what a second
  forge would implement); `src/workspace/status.ts` (the refined `inReview`, `openPrUrls`,
  `forgeStates`, `deriveNeedsYou`, the probe wired into `statusReport`); `src/workspace/tasks.ts`
  (`resolvePrSet` via the probe); `src/cli/schema.ts` (`prForgeShape`, `needsYouShape`, the grown
  task/status shapes); `src/cli/json.ts` (builders for the new optional fields, type-pinned as
  ever); `src/cli/index.ts` (`task list` probing; the `prs:` summaries, `needs you` block, and
  unavailable note). Tests: `test/forge/gh.test.ts` (the probe), `test/workspace/status.test.ts`
  (the derivation tables, grown), `test/cli/forge-state.test.ts` (both renderings live and degraded,
  timeout, agent parity, close), `test/helpers.ts` (the `WARD_GH` pin and `writeFakeGh`),
  `test/cli/schema.test.ts` (the stability row grown).
- **Mechanisms:**
  - _The probe:_ dedupe URLs → spawn `gh pr view URL --json state,reviewDecision` per URL in
    parallel (`stderr` ignored — a failing probe must not spray the human's terminal) → kill each at
    the deadline → translate gh's vocabulary (`OPEN`/`MERGED`/`CLOSED`,
    `APPROVED`/`CHANGES_REQUESTED`/`REVIEW_REQUIRED`) into Ward's → fold to
    `{ live, states: Map<url, PrForgeState> }` under the one-honest-bit rule. Never throws.
  - _Derivation:_ `inReview(record, forge?)` — closed is never in review; with forge state, in
    review unless every PR is known resolved; without, linked-PRs. `deriveNeedsYou(tasks)` — per
    non-closed task with forge state: all merged → `awaiting-close`; else each open PR with changes
    requested → `changes-requested` naming the PR. Pure functions, table-tested.
  - _Rendering:_ each task line gains a dim `— prs: 1 open (changes requested) · 1 merged` summary
    when forge state exists; `status` appends the `needs you` block (bold heading, `!`-marked lines
    naming the task and the act — `ward task close CODE` for the gated close); degraded runs append
    one dim `forge state unavailable (gh) …` note, only when a rendered non-closed task actually has
    PRs (otherwise nothing forge-dependent was shown and the note would be noise).
  - _JSON:_ `taskJson(record, inReview, forge?)` appends the optional `forge` array (per-PR, in
    `prs` order); `statusJson` appends optional `needsYou`. Both shapes registered in 0008's
    registry, so `ward schema` documents them and the live-validation table covers them without new
    rows.

## Build log

### 2026-08-09 — Live forge state built end to end

**Goal.** Everything in Scope in one iteration. **What was done.** Built `src/forge/gh.ts` (the
parallel, deadline-bounded probe with the one-honest-bit degradation and the `WARD_GH` /
`WARD_GH_TIMEOUT_MS` seams); grew `src/workspace/status.ts` (exact in-review with conservative
`unknown`, `openPrUrls`, `forgeStates`, `deriveNeedsYou`, the probe in `statusReport`, `needsYou` on
the report); rewired `resolvePrSet` in `src/workspace/tasks.ts` onto the probe (semantics kept,
lowercase states in the step detail); added `prForgeShape`/`needsYouShape` and the grown task/status
shapes to `src/cli/schema.ts` with matching type-pinned builders in `src/cli/json.ts`; extended the
CLI renderings (per-task `prs:` summaries, the `needs you` block, the single unavailable note,
`task list` probing). Tests: `test/forge/gh.test.ts` (vocabulary table through a fake `gh`,
absent/erroring/hung/partial/dedupe/nothing-to-ask), the grown derivation tables in
`test/workspace/status.test.ts`, `test/cli/forge-state.test.ts` (live and degraded through the
spawned CLI, timeout cut, agent parity, the close gate both ways), and the `WARD_GH` hermetic pin
plus `writeFakeGh` in `test/helpers.ts` so no test can reach a real forge.

**What works now — with the commands that prove it** (Bun 1.3.14, macOS):

- `bun test` → `135 pass, 0 fail, 401 expect() calls` across 15 files (from 104/300/13 at entry
  start) — covering all five acceptance scenarios, including the degraded byte-identity runs and the
  300 ms-deadline cut of a 30 s-hung fake forge.
- `mise run check` → green end to end (Biome + dprint + `tsc --noEmit` + `bun test` + lychee).
- Dogfood smoke in a scratch workspace (two tasks; a fake `gh` serving MERGED/APPROVED,
  OPEN/CHANGES_REQUESTED, MERGED): `ward status` renders
  `t1 payments [active · in-review] — prs: 1 open (changes requested) · 1 merged`,
  `t2 cleanup [active] — prs: 1 merged` (fully merged: no longer in-review), and the block
  `needs you` / `! task t1 — changes requested on …/pull/15` /
  `! task t2 — PR set fully merged; close it: ward task close t2`; with `WARD_GH` pointed at an
  impossible path the same command renders the 0004 output plus
  `forge state unavailable (gh) — in-review means linked PRs, not live review state`.
- `bun src/cli/index.ts schema status` emits `needsYou` (optional) and the task `forge` field
  (optional, state enum `open|merged|closed|unknown`) — the contract stayed self-describing with no
  new documentation surface.

**Decisions** (entry-local, found while building): all recorded under Design → Decisions; the one
mid-build reversal worth naming — `unknown` initially cleared in-review (state ≠ open), which the
derivation table exposed as false certainty: an unreadable PR now falls back to the linked-PRs
approximation instead of silently un-marking a task that may well be in review.

**Next.** Natural follow-ons, in dogfood-priority order: checks (CI) status joining `prForgeShape`
when something reads it; version skew and further attention sources joining `needs you` (SF-001's
resolution decides the constraint wording they join under); `--json` on the mutation reports
(deferred since 0005).

## Spec-feedback

- **SF-001** — [`human-shell`](../../intent/02-subsystems/07-human-shell.md), "Constraints any
  design must honor" → the "what needs me?" bullet. _Friction:_ the constraint scopes the surface to
  requests "**recorded by the messaging seam**," but the first real attention items turn out to be
  **derivable, not recorded**: a fully merged PR set awaiting the gated close and an open PR with
  changes requested exist in the records-plus-forge state alone, and per the derive-don't-store bias
  (§17; [`work-lifecycle`](../../intent/01-concepts/03-work-lifecycle.md), Task states) they should
  never become recorded requests just to be presentable. As written, a faithful design would either
  route derived conditions through a messaging seam that does not exist (storing what must not be
  stored) or leave them off the surface. _Assumption to keep moving:_ the constraint's durable core
  is the **one glanceable, deduplicated answer**, not the provenance of its items; this entry
  presents derived items directly and stores nothing. _Proposed revision:_ reword the bullet so the
  surface presents "the requests addressed to the human — **recorded by the messaging seam** … —
  **and the conditions derivable from the record and live forge state** (a PR set awaiting the gated
  close, changes requested awaiting action)" as one deduplicated answer; which items are recorded
  versus derived stays left to implementation.
