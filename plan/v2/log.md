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
