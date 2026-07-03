# v2 — Build Log

> Append-only build journal ([`../README.md`](../README.md)). One entry per iteration: **goal**,
> **what I did**, **what works now (with the exact command that proves it)**, **decisions**,
> **spec-feedback**, **next**. No "works" claim without a command. Newest entries at the bottom.

## Iteration 1 — Orient + design foundation (stack, toolchain, CI)

**Goal.** Read the full intent, set up the exercise, and — before significant code — choose and
justify the stack and **wire an opinionated code formatter + strong linter into `make check` and
CI** (the one gap v1 left open). `make check` must cover code, not only Markdown.

**What I did.**

- Read the repo governance (`AGENTS.md`, `CONTRIBUTING.md`) and the full intent in reading order
  (foundation → concepts → subsystems → walkthrough), plus `plan/README.md` and `design/README.md`.
- Studied v1 (`build/v1`) as prior art: TS/Node + Zod + Commander + YAML + shell-out git, a clean
  `store/ → domain/ → seams/ → cli/` layout, and — confirmed — a Makefile whose `check` ran **only**
  `dprint check` + `lychee` (no code formatter, linter, typecheck, or tests; no CI). That is the
  gap.
- Branched `build/v2` off an up-to-date `main`.
- Wrote `plan/v2/scope.md` (MVP boundary + acceptance scenario), this log, and `spec-feedback.md`.
- Chose the stack and wrote ADRs `0001`–`0007` in `plan/decisions/` (language/runtime, test runner,
  Zod schemas, front-matter determinism, Commander CLI, git shell-out, **Biome format+lint**).
- Wired the toolchain: `package.json`, `tsconfig.json` (strict + `erasableSyntaxOnly`), `biome.json`
  (opinionated formatter + strong linter), an updated `Makefile` (`format`/`format-check`/`lint`/
  `typecheck`/`test`/`links`/`check`), and `.github/workflows/check.yml` running `make check`.
- Wrote `design/00-foundation.md` (Serves-intent pointer, stack, module layout, on-disk layout, the
  spine) and began the store spine in `src/` so the type gate has inputs.

**What works now (with the command that proves it).**

- The toolchain is installed and each tool runs: `node_modules/.bin/biome --version` → `2.5.2`;
  `node_modules/.bin/tsc --version` → `5.9.3`; `dprint --version`, `lychee --version` on PATH.
- **`make check` is green and now covers CODE, not just Markdown** — `dprint check` (md format) +
  `biome ci .` (code format + lint + import order, 8 files) + `tsc --noEmit` (strict types) +
  `node --test` (5 pass) + `lychee .` (319 links OK). This closes the one gap v1 left open.
- The store spine works and the **first intent invariant passes**: `make test` →
  `append-only log — no lost updates` (concurrent appends lose none; gap-free sequences; state
  derived by folding). Built: `store/frontmatter`, `store/schemas` (Zod discriminated-union
  catalog), `store/doc`, `store/paths`, `store/ids`, `store/log`.

**Decisions.** Stack ADRs `0001`–`0007`. Reused v1's validated language/runtime/schema/CLI/git
choices (they earned it) but added the missing code-quality gate with **Biome** — a single
opinionated Rust binary doing formatting **and** linting, matching the dprint/lychee single-binary
aesthetic and closing the CONTRIBUTING.md "opinionated on everything" mandate for code.

**Spec-feedback.** _(pending — recorded in `spec-feedback.md` as the build reveals frictions.)_

**Next.** Land the store spine (`frontmatter` → `schemas` → `doc` → `paths` → `ids` → `log`) with
its first intent test (append-only / no-lost-updates), get `make check` green, then build the domain
nouns and drive the walkthrough.

## Iteration 2 — Domain nouns + derived status

**Goal.** Build the domain layer over the store spine — workspace `init`, personas, project (floor),
task (stored `active|paused|closed`), the session lifecycle (open/close/resume), and **derived
status** — with two more intent invariants: derived-status and
resume-idempotent/closed-stays-closed.

**What I did.**

- `src/store/workspace.ts` — workspace discovery (walk up from any cwd to `.ward/`), load/save, and
  scope→dir resolution (workspace/project/task).
- `src/seams/model.ts` (tier-follows-persona, narrower-overrides-broader) and `src/seams/harness.ts`
  (stub harness: `start/handle/resume/locate`, deterministic run id, idempotent resume).
- `src/domain/`: `personas` (closed roles / open cast, default cast from a static name list),
  `workspace` (`initWorkspace`: version stamp, default cast, ignore policy; idempotent), `project`
  (floors, NO stored status), `task` (state machine with legal transitions; closed terminal),
  `session` (open/close/resume; leaf state `open|closed`; id reuse archives prior closed record),
  `status` (the `rollup` rule + project/workspace status, derived).

**What works now (with the command that proves it).**

- `make check` green — `biome ci` (21 files) + `tsc` + **`node --test` 24 pass** + `dprint` +
  `lychee` (322 links).
- **Derived status** invariant: `make test` → `derived status — the roll-up rule …` +
  `… resolved fresh from the record as children change` (empty→active, active wins,
  all-paused→paused, all-closed→closed; in-review overlay; nothing stored).
- **Session lifecycle** invariant: `session lifecycle guarantees` — resume idempotent (no second
  session, handle stable, record unchanged), closed-stays-closed (resume rejects), close idempotent,
  ids unique-among-open + reused-once-freed with history retained.

**Decisions / spec-feedback.** Building surfaced two genuine intent frictions, both grounded in
§16/§17 — recorded as **SF-001** (room occupancy: leaf-recorded _and_ derived — v2 derives it,
dropped the stored field) and **SF-002** (session "running": presented as a stored state but it is a
live/derived attribute — v2 stores `open|closed`, derives running). Building proceeds on the stated
assumptions; `intent/` is untouched.

**Next.** Iteration 3 — worktree + theming (deterministic accent/glyph) + idempotent lifecycle
hooks + room (mints its first session; occupancy derived) + messaging (dispatch/report/wake,
recorded-first)

- cold-start recovery, with the recovery intent test (live worktrees only).

## Iteration 3 — Worktrees, theming, hooks, rooms, messaging, recovery

**Goal.** Build the coordination layer and prove the cold-start recovery invariant: worktree
creation with deterministic theming + idempotent hooks, rooms (minting their first session;
occupancy derived), messaging (dispatch/report/wake recorded-first), and `attach` recovery — live
worktrees only.

**What I did.**

- `src/seams/theming.ts` — deterministic accent (stable hash, collision-free among the visible
  set) + per-type glyph, both recorded as **nameable** attributes (`accentByName` resolves "the blue
  one").
- `src/seams/git.ts` — thin real git wrapper (init / worktree add+remove / current branch),
  injectable.
- `src/seams/messaging.ts` — dispatch/report + wake arm/satisfy, **recorded-first**, idempotent
  (satisfied fires once), inspectable (`listMessages`/`listWakes`).
- `src/domain/hooks.ts` — idempotent worktree setup/teardown hooks (deps, theme) as checkable
  markers; `applySetupHooks` / `revalidateSetupHooks` (re-apply only what vanished) /
  `removeTeardownHooks`.
- `src/domain/worktree.ts` — create (accent + glyph + hooks + record), teardown (record retained,
  `tornDown:true`), `listWorktrees`, `revalidateWorktree`.
- `src/domain/room.ts` — `openRoom` mints the first session; occupancy **derived**
  (`isRoomOccupied`); `closeRoom` frees it; room-code allocation reuses freed codes.
- `src/domain/recovery.ts` — `attachWorkspace`: enumerate → keep open → resume (idempotent) → re-arm
  wakes (fire a met one once) → re-validate **live** worktrees only (skip torn-down) → leave closed.
- `src/store/workspace.ts` — room-scope resolution (`findRoomDir`, bare code addresses a room).

**What works now (with the command that proves it).**

- `make check` green — `biome ci` (29 files) + `tsc` + **`node --test` 26 pass** + `dprint` +
  `lychee`.
- **Cold-start recovery** invariant: `make test` →
  `cold-start recovery — restore in-flight threads,
  live worktrees only` — open session
  re-attached, closed left alone, the live worktree's vanished setup hook re-validated (re-applied),
  the torn-down worktree **skipped not errored**, the room-done wake re-armed while occupied then
  **fired exactly once** when the room freed.

**Decisions / spec-feedback.** No new intent frictions this iteration; SF-001 (room occupancy
derived) is now realized in code (rooms carry no stored occupancy; it derives from sessions). 4 of 5
intent invariants pass; the privacy gate is next.

**Next.** Iteration 4 — remote provider seam + the single upstream **privacy-translation gate**
(fail-closed exhaustive redaction of the closed role vocabulary + persona names), PR tracking, gated
outward actions — with the privacy-gate intent test.

## Iteration 4 — Remote provider + the fail-closed privacy gate (5th invariant)

**Goal.** Build the local↔remote boundary: the single upstream **privacy-translation gate**
(fail-closed, exhaustive), the remote-provider seam, PR tracking, and the §18 authority gate —
proving the last intent invariant. All five invariants now have passing tests.

**What I did.**

- `src/seams/privacy.ts` — THE gate, its own module (the "one upstream place"). `translateOutward`
  re-authors local text for the remote audience: strips a provenance front-matter block, redacts
  every prose form of the **closed** role vocabulary (exhaustive because ROLES can't grow), persona
  names (supplied as data), and local/absolute paths; then **verifies** and throws (fail-closed) if
  anything forbidden survives. Branded `Sanitized` type (only the gate produces it) + `Authority`
  (§18).
- `src/seams/remote.ts` — provider interface + in-memory stub whose every text arg is `Sanitized`
  and every mutation demands `Authority`, so a raw string / unauthorized post won't compile.
- `src/store/schemas.ts` — added the `pr` document type to the catalog; `src/store/paths.ts` PR
  paths.
- `src/domain/remote.ts` — link task↔remote (attribute, not identity), PR tracking (`trackPr`,
  `advancePrState`, `listPrs`, `openPrCount`), and `completeTask` (closes only when all PRs merged).

**What works now (with the command that proves it).**

- `make check` green — `biome ci` (33 files) + `tsc` + **`node --test` 43 pass** + `dprint` +
  `lychee`.
- **Privacy gate** invariant: `make test` → `privacy gate — exhaustive outward redaction`,
  `… CLOSED role vocabulary is caught in every prose form` (8 forms), `… fail-closed` (refuses on a
  role word / persona name; own output always passes),
  `… remote provider only receives sanitized,
  authorized content`.
- **All five intent invariants pass**: no-lost-updates, derived-status, resume/closed-stays-closed,
  cold-start recovery, privacy-gate.

**Decisions / spec-feedback.** No new frictions — the closed role vocabulary made exhaustive
redaction clean, as the intent predicted. The branded-type enforcement realizes "receive only
already-sanitized content" and "posting is gated" structurally, not by convention.

**Next.** Iteration 5 — the human-shell CLI (Commander noun/verb; two-audience output + `--json`;
workspace/scope discovery from any cwd; `doctor`; `@file`/`-` inputs; verbs read true incl.
`attach`) and scope-boundary reflection (map-reduce + cursor). Then iteration 6 drives the
walkthrough §0–§10 end to end and writes the per-seam `design/` plans.

## Iteration 5 — The human-shell CLI + reflection

**Goal.** Build the CLI that ties the core together so the walkthrough runs as real commands, plus
scope-boundary reflection (map-reduce + cursor).

**What I did.**

- `src/cli/output.ts` (two-audience: human text vs `--json`), `src/cli/context.ts` (caller identity
  via the ambient agent signal; workspace + cwd-scope discovery; `@file`/`-`/inline text args),
  `src/cli/doctor.ts` (node/git/workspace checks), `src/cli/index.ts` (Commander noun→verb tree:
  init, doctor, status, attach, reflect;
  project/task/worktree/room/session/pr/remote/wake/dispatch).
- `src/domain/reflection.ts` — scope-boundary reflection: chunk → distill → roll-up → proposals,
  with a per-(scope, goal) cursor so re-runs are incremental. `src/domain/artifact.ts` —
  briefs/artifacts with provenance.
- Verbs read true: per-thread `session resume`, workspace-wide `attach` (not `recover`).

**What works now (with the command that proves it).**

- `make check` green — `biome ci` (39 files) + `tsc` + `node --test` (43 pass) + `dprint` +
  `lychee`.
- **The CLI runs Ward end-to-end against a real workspace + real git worktree.** Proven by driving,
  in a temp workspace: `ward init` → `ward doctor` (all ✓) → `project open` (floor 1; attending
  avery, charge nurse casey) → `task open` (resident riley) → `worktree create` (real
  `git worktree`, hooks `deps`+`theme` on disk) → `room open --brief …` (mints session `quinn`,
  dispatches `brief-1A1`) → `wake arm` → `report` → `pr track`/`advance` (open→approved→merged;
  `task list` shows `active (in-review)`) → `room close`/`session close`/`task close` (completion
  guard) → `reflect` (2 proposals, cursor 6) → `attach` (wake fired once, worktree revalidated) →
  `--json status` (`workspace: closed`).

**Decisions / spec-feedback.** No new intent frictions. The branded `Sanitized`/`Authority` types
plus the cwd-derived scope and `@file` inputs realize the human-shell DX bar.

**Next.** Iteration 6 — an automated `test/acceptance/walkthrough.sh` driving §0–§10 reproducibly
from a clean state (asserting records + the reboot test), the per-seam `design/` plans (each _Serves
intent_), a couple of extra tests (reflection cursor, completion guard), and final polish.
`make check` stays green.
