# 0015 — Mutation reports in JSON: every verb serves both audiences

> `--json` lands on all thirteen mutation verbs — each emits its **existing typed report** (the
> establishment steps, the per-item outcomes, the close gate's named trusts) as one documented,
> schema-registered JSON document, with the human rendering byte-identical without the flag and
> every exit code unchanged. Closes the deferral standing since
> [`0005`](../0005-agent-audience/README.md).
>
> **Status:** accepted · **Started:** 2026-08-12

0005 gave the read verbs their agent form and deferred the write verbs' reports as safe: "the read
verbs are what an agent polls between actions." That load has changed. Delivery is now
agent-orchestrated — the orchestrating session opens tasks, creates worktrees, links PRs, and closes
tasks through `ward` — and it parses close reports, rebase outcomes, and create results by reading
human prose, exactly the guessing `--json` on read verbs was built to end. Meanwhile
[`0008`](../0008-json-shape-home/README.md) made shapes cheap and self-documenting (a shape + a
registry row, emitted by the binary itself), and every mutation verb already builds a typed report
internally — the human rendering is one projection of it. This entry adds the other projection and
finishes the §8 contract: **every verb serves both audiences**.

## Serves intent

- [`principles`](../../intent/00-foundation/01-principles.md) §8 (two audiences, one implementation)
  — the core of this entry: the last surfaces that served only the human gain their agent-facing
  form, both renderings projected from the one typed report the verb already computes; the human
  stays the default (no flag, no change). §6 (deterministic) — a mutation's outcome becomes
  inspectable data: convergent verbs re-run (`repo add`, `task pr`) emit byte-identical documents
  for the same state, and refusals stay deterministic errors. §17 — nothing new is stored; the
  document is the verb's existing return value, rendered. §20 — degraded honesty survives the format
  change: the close gate's named trusts (forge unavailable, reachability unverifiable —
  [`0012`](../0012-close-gate-reachability/README.md)) reach the agent caller verbatim, and a
  partial failure (a `failed` refresh row, a `conflict` rebase row) emits everything it can plus the
  exit-code verdict, never a bare boolean.
- [`human-shell`](../../intent/02-subsystems/07-human-shell.md) — an agent caller "passes explicit
  context and gets deterministic handling … a deterministic result or error": the result half now
  exists for every verb in the noun/verb tree, uniformly (`--json` everywhere), and the error half
  is pinned to the posture the read verbs already had. The scope-from-cwd affordance stays
  human-audience: under `--json` its echo moves out of the document's channel.
- [`work-lifecycle`](../../intent/01-concepts/03-work-lifecycle.md) — the lifecycle acts (open,
  pause/resume, close, teardown) report what they did in the form the acting agent can check,
  including the gated close's step list — what was verified, what was trusted, what was torn down.

## Scope

- **In:**
  - **`--json` on every mutation verb** — `workspace create`, `repo add`, `repo refresh`,
    `project open`, `task open`, `task pause`, `task resume`, `task pr`, `task close`,
    `worktree create`, `worktree rebase`, `session open`, `session close`. Each emits exactly **one
    JSON document, alone on stdout**: the verb's existing typed report, built by an explicit builder
    in `src/cli/json.ts` (never a serialized internal), under a zod shape registered in
    `src/cli/schema.ts` and documented by `ward schema <verb words>`. The 0005 stability policy
    applies verbatim: additive evolution, optional fields omitted (never `null`), empty sets `[]`.
  - **The report's substance, not a bare ok** — `workspace create` emits its establishment steps
    with per-step `established|satisfied`; `repo refresh` its per-repository outcome rows;
    `worktree rebase` its per-worktree outcome rows (`rebased|current|dirty|conflict|failed`,
    [`0011`](../0011-worktree-rebase/README.md)); `task close` its full step list — PR-set
    resolution, per-PR reachability, sessions closed, worktrees torn down — with the named trusts
    carried **verbatim** in each step's `detail`.
  - **The error posture, pinned** (decision below): a verb that refuses or fails before completing
    emits **no document** — stderr text + exit 1, stdout empty, 0005's posture unchanged. A verb
    that completes with bad news in its report emits the document **and** keeps its non-zero exit
    (`repo refresh` with a `failed` row, `worktree rebase` with `conflict`/`failed`) — the doctor
    posture: the agent reads the outcome from the document, a shell reads `$?`, and the two never
    disagree. **Exit codes are unchanged everywhere.**
  - **The human renderings byte-for-byte unchanged** without the flag, proven by exact-bytes
    assertions; the one channel adjustment: the scope-from-cwd echo
    (`task t1 — from the working directory`, [`0006`](../0006-scope-from-cwd/README.md)) moves to
    **stderr** when `--json` is passed, so stdout carries one document, alone.
  - **The workspace `AGENTS.md` teaches it** — one new driving lesson: mutations report as JSON too;
    a refusal emits no document, so parse stdout only when the exit code says the verb ran.
  - **Tests** — a sequenced spawned-CLI suite (`test/cli/mutation-json.test.ts`) that builds the
    spine verb by verb, validating each live document strictly under its registered shape, plus the
    refusal, degraded, conflict, empty-set, echo-channel, and human-bytes cases, and a `ward schema`
    table over every mutation verb.
- **Deferred:**
  - **A JSON error envelope for refusals.** _Why safe:_ the refusal channel is already deterministic
    and complete — exit 1 plus a stable, legible message naming the fix — and it is the one posture
    every existing verb has; an envelope would be a second error contract carried beside the first.
    If dogfooding shows agents genuinely parsing refusal prose, structuring it is its own entry with
    the whole surface in scope at once.
  - **Structured trust/refusal fields on the close steps** (e.g. a `trusted: true` marker). _Why
    safe:_ it would either change the report's semantics (out of this entry's scope) or be derived
    by string-matching the detail prose — the brittleness this entry exists to end. The step names
    (`pr set`, `reachability`) are stable keys and the trust language is carried verbatim; a
    structured marker can be added additively to the same rows when a caller needs it.
  - **Reusing the read verbs' task shape for mutation reports.** _Why safe (and deliberate):_
    decision below — the shapes describe different things and are free to converge later without
    breaking anyone (additive evolution).
  - **`--json` for interactive/prompted flows.** None exist yet; when they do, the human-shell
    contract already forbids prompting a declared agent, and the flag will mean what it means here.
  - **Streaming/progress output.** One document per invocation stays the contract; a long mutation's
    progress is a different artifact than its report.
- **Acceptance:** from a cold checkout, `mise run check` is green, and `bun test` proves:
  1. every mutation verb, through the spawned CLI, emits one parseable document that validates
     **strictly** under its registered schema and carries the report's substance (steps, outcome
     rows, trusts — not a bare ok), with `ward schema <verb>` emitting exactly that schema;
  2. the postures: a refused close (open PR) exits 1 with **nothing on stdout** and the reason on
     stderr; a degraded close (forge unavailable) emits its document with the named trust verbatim
     in the `pr set` step; a rebase conflict emits its document with the `conflict` row **and**
     exits 1; empty sets are `[]` (refresh with no repositories, rebase with no worktrees);
  3. the human renderings are byte-identical without the flag (exact-bytes assertions on
     `task pause` and `task resume`), and the scope-from-cwd echo reaches stderr, not stdout, under
     `--json`;
  4. convergent re-runs emit byte-identical documents (`task pr` twice), and re-running
     `workspace create` shows `satisfied` steps in the document;
  5. the installed `AGENTS.md` carries the mutation-report lesson.

## Design

- **Decisions:** no new ADRs — the existing stack carries this entry. Entry-local:
  - **Error posture: refusals emit no document; completed reports emit theirs whatever they say.**
    The line runs between _the verb refused or failed before doing its work_ (a gated close, a bad
    argument, no workspace — `WardError`, stderr + exit 1, stdout empty: nothing happened, so there
    is no report to emit; the message itself is the deterministic error the human-shell contract
    promises an agent) and _the verb completed and its report contains bad news_ (`repo refresh`
    rows `failed`, `worktree rebase` rows `conflict`/`failed` — the document is emitted **and** the
    human path's exit verdict is kept). This is 0005's posture extended, not a new one: read verbs
    already refuse with stderr + exit 1 and stdout empty (`ward schema flimflam`), and
    `doctor --json` already emits its document and exits non-zero — an agent reads `healthy` (here:
    the outcome rows) from the document and a shell reads `$?`, and the two never disagree. A JSON
    error envelope was rejected as a second error contract (Deferred).
  - **The close report's trust language survives verbatim in the step details.** The report is
    emitted as its `{step, detail}` rows exactly as the human reads them: `pr set` /
    `forge unavailable — trusting the stated outcome 'delivered'`, `reachability` /
    `… reachability unverifiable — trusting the stated outcome 'delivered'` (0012). The step names
    are the stable keys an agent locates by; the detail is the named trust, carried as data rather
    than collapsed into a success boolean. Deriving a structured `trusted` flag was rejected twice
    over: computing it in the builder means string-matching prose (the exact brittleness in
    question), and computing it in the report means changing report semantics (out of scope).
  - **Mutation shapes are their own family — the read shapes are not reused.** A mutation report
    describes **the state the verb just recorded** (§16), while the read verbs' task shape carries
    derived overlays (`inReview`, live `forge` state) computed against the forge at read time —
    reusing it would either bolt a forge probe onto every mutation (cost and nondeterminism the
    verbs never had) or emit those fields dishonestly absent. Within the family, one shape is shared
    exactly where one typed thing backs it: `taskMutationShape` for the five task verbs (the record
    as written — `outcome`/`closedAt` present only after a close), `sessionMutationShape` for both
    session verbs; everything else is verb-local. `worktree create` emits flat rows in the same
    vocabulary as `worktree list` (minus `present` — creation just proved presence). Keeping the
    families textually separate also keeps this entry's registry additions clear of the status
    shapes entry 0016 is concurrently growing.
  - **The registry splits into `readVerbShapes` + `mutationVerbShapes`, composed into
    `jsonVerbShapes`.** The 0008 test table derives each verb's argv from its registry key — true
    only of read verbs, whose invocation needs no arguments. Mutation verbs need arguments and
    sequencing, so the split gives each family its honest proof: the read table stays auto-derived,
    the mutation suite is sequenced, and `ward schema` documents the union (read verbs first, in the
    0008 order; then the mutation verbs in lifecycle order).
  - **`workspace create` fits the pattern — no exception.** Like `ward schema`, the verb runs before
    any workspace exists, and nothing in the `--json` path needs one: the report is the run's own
    step list, built in memory and printed. The only workspace-less caller concession already exists
    (telemetry records nothing outside a workspace, 0013).
  - **The scope-from-cwd echo moves to stderr under `--json`.** The 0005 contract is one document,
    alone on stdout; the echo is a human affordance (0006), not part of the result. stderr keeps the
    derivation visible in a terminal without corrupting the document — suppressing it entirely would
    hide from a human piping to `jq` which task their location just targeted.
- **Layout:** `src/cli/schema.ts` (nine mutation shapes + the registry split — the read shapes are
  untouched); `src/cli/json.ts` (nine builders, type-pinned to the shapes' inferred types like every
  builder since 0008); `src/cli/index.ts` (the `--json` flag on each mutation command, the
  `printJson` short-circuit in each arm, the echo routing in `resolveTaskTarget` — dispatch
  structure otherwise unchanged); `src/workspace/templates.ts` (one lesson). Tests:
  `test/cli/mutation-json.test.ts` (the sequenced suite + the schema table),
  `test/cli/schema.test.ts` (the auto table now iterates `readVerbShapes`; the whole-contract and
  slice cases cover the union), `test/workspace/create.test.ts` (the lesson row). No workspace
  module changes: every verb's typed report already existed.
- **Mechanisms:** each verb computes its report exactly as before; `--json` short-circuits the human
  renderer through the verb's builder into `printJson`, and the exit verdict is computed identically
  on both paths (`repo refresh` and `worktree rebase` decide `exit 1` from the same rows the
  document carries). Refusals throw `WardError` before any printing, so the posture needs no
  per-verb handling — the existing catch renders stderr and exits. Adding the next mutation verb is
  the same one-place change 0008 promised: shape + registry row, builder pinned to it, one
  `if
  (json)` arm.

## Build log

### 2026-08-12 — The mutation reports built end to end

**Goal.** Everything in Scope in one iteration. **What was done.** Grew `src/cli/schema.ts` with the
mutation-report family (`workspaceCreateShape`, `repoAddShape`, `repoRefreshShape`,
`projectOpenShape`, `taskMutationShape`, `taskCloseShape`, `worktreeCreateShape`,
`worktreeRebaseShape`, `sessionMutationShape`) and split the registry into `readVerbShapes` +
`mutationVerbShapes` composing `jsonVerbShapes`; grew `src/cli/json.ts` with the nine type-pinned
builders; wired `--json` through every mutation command in `src/cli/index.ts` (flag, dispatch arms,
the stderr echo in `resolveTaskTarget`, exit verdicts preserved on the JSON paths of `repo refresh`
and `worktree rebase`); added the mutation-report lesson to the installed `AGENTS.md`. Tests:
`test/cli/mutation-json.test.ts` (the sequenced spine — create/converge, add/ converge, refresh +
empty `[]`, project open, task open with omitted optionals, worktree create, session open, task pr
twice byte-identical, pause/resume, rebase `current`, the stderr echo, session close, the
forge-unavailable close with the trust verbatim; then the refused close, the rebase conflict, the
empty rebase; then the `ward schema` table over all thirteen); `test/cli/schema.test.ts` retargeted
its auto table at `readVerbShapes`; `test/workspace/create.test.ts` gained the lesson row.

**What works now — with the commands that prove it** (Bun 1.3.14, zod 4.4.3, macOS):

- `bun test` → `226 pass, 0 fail, 789 expect() calls` across 24 files (from 195/668/23 at entry
  start) — all five acceptance scenarios, including the refusal (exit 1, stdout empty, stderr naming
  the open PR), the degraded close carrying
  `forge unavailable — trusting the stated outcome 'delivered'` verbatim, the conflict document with
  exit 1, and the exact-bytes human renderings.
- `mise run check` → green end to end (Biome + dprint + `tsc --noEmit` + `bun test` + lychee).
- Dogfood smoke in a scratchpad workspace (`bun src/cli/index.ts`, hermetic git env, `WARD_GH`
  pinned unusable): `workspace create ws --json` emits the ten-step document; the full spine —
  `repo add … --json`, `project open … --json`, `task open … --json`, `worktree create … --json`,
  `session open … --json`, `task pr … --json`, `task pause/resume … --json`,
  `worktree rebase … --json`, `session close … --json` — each emits one parseable document;
  `task
  close t1 --json` reports the trusted PR set, the torn-down worktree, and the closed
  record; `bun src/cli/index.ts schema task close` emits the registered schema.

**Decisions** (entry-local, found while building): all recorded under Design → Decisions; the one
worth naming — the 0008 schema-test table ("a future `--json` verb is covered by adding its registry
row") holds only for verbs whose argv is the registry key, which is what forced the read/mutation
registry split rather than a special-cased table.

**Next.** Natural follow-ons, in dogfood-priority order: 0016's worktree-freshness status lands its
registry rows beside these (whichever merges second rebases); a structured trust marker on the close
steps if agent orchestration proves it needs one (Deferred here); file inputs for long free-text
arguments (`--purpose` from a file), the other half of the human-shell agent ergonomics.

## Spec-feedback

None this entry. Two near-candidates adjudicated rather than filed:

- [`human-shell`](../../intent/02-subsystems/07-human-shell.md) nowhere names the **refusal
  channel** for a declared agent — this entry pins it (a deterministic non-zero exit plus a
  complete, legible message on stderr; never a document on stdout) as a design choice under the
  contract's existing words ("a deterministic result or error"). Not filed: the wording already
  covers both halves, and naming the mechanism in intent would push a _how_ up a layer. If a future
  entry structures refusals (the deferred error envelope), that is the moment to revisit.
- [`principles`](../../intent/00-foundation/01-principles.md) §8's "where one form cannot serve
  both, the tool offers both" needed no revision to license this completion — the friction was never
  in the intent, only in the build's coverage of it. Recorded here so the trail shows the deferral
  closing against an unchanged principle. 0008's still-open SF-001 (the self-describing contract as
  a human-shell constraint) now covers thirteen more verbs and is reinforced, not re-filed.
