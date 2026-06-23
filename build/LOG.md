# Build Log

Append-only journal of the Ward build. Newest entries go at the **bottom**. Each iteration adds one
entry; never rewrite past entries (correct them with a later one). This is the build's cold-start
memory: a new session re-orients by reading [`v1-scope.md`](v1-scope.md), the tail of this file, and
the open items in [`spec-feedback.md`](spec-feedback.md).

**Entry format**

- **Goal** — what this iteration set out to do.
- **Did** — what actually happened.
- **Works now** — what is demonstrably working, each with the **exact command** that proves it (and
  its observed result). No "works" claim without a command.
- **Decisions** — links to any ADRs added/changed in [`decisions/`](decisions/).
- **Spec feedback** — links to any entries added in [`spec-feedback.md`](spec-feedback.md).
- **Next** — the next bounded chunk.

---

## Iteration 0 — scaffolding (2026-06-22)

- **Goal** — stand up the `build/` journal so the first real iteration starts oriented.
- **Did** — created [`build/README.md`](README.md), this log, [`v1-scope.md`](v1-scope.md) (a
  template to fill), [`spec-feedback.md`](spec-feedback.md) (a template), and
  [`decisions/0000-template.md`](decisions/0000-template.md). Added a pointer to `build/` from the
  root `AGENTS.md`. No Ward code yet; no stack chosen yet.
- **Works now** — nothing executable yet (scaffolding only).
- **Decisions** — none yet. The first real iteration's first act is choosing the stack and writing
  its ADRs in [`decisions/`](decisions/).
- **Spec feedback** — none yet.
- **Next** — read the intent in full (start at [`../AGENTS.md`](../AGENTS.md) →
  [`../intent/README.md`](../intent/README.md)), then write [`v1-scope.md`](v1-scope.md), then
  choose the toolchain and record the stack ADRs before writing significant code.

---

## Iteration 1 — stack chosen, store spine + workspace lifecycle (2026-06-23)

- **Goal** — read the whole intent; choose and justify the stack; write `v1-scope.md`; stand up the
  metadata-store spine and the first real CLI slice (`init` / `repo add` / `status`) against a real
  on-disk workspace; encode the first invariants as tests.
- **Did** —
  - Read all of `intent/` (foundation, six concepts, eight seams, walkthrough) and the leg READMEs.
  - Verified the toolchain empirically: **Node 26 runs `.ts` directly** and **`node --test` runs TS
    tests** (native type-stripping) — decided a **zero-build, low-dependency** TS CLI.
  - Wrote six stack ADRs
    ([0001](decisions/0001-language-and-runtime.md)–[0006](decisions/0006-git-integration-shell-out.md)):
    TS-on-Node, native exec + `node:test`, Zod, deterministic YAML front matter, Commander, git
    shell-out — each with options/why/consequences.
  - Filled [`v1-scope.md`](v1-scope.md): in/deferred, a WT-step→command acceptance table, the four
    invariants.
  - Wrote design drafts [`design/00-foundation.md`](../design/00-foundation.md) (stack + module
    layout, src mirrors it) and [`design/metadata-store.md`](../design/metadata-store.md) (document
    catalog + the no-lost-updates discipline, structural-first).
  - Built the store spine: `frontmatter` (canonical/deterministic), `schemas` (Zod discriminated
    union = the document catalog), `paths` (dir nesting = containment), `doc` (typed read/write,
    atomic), `ids` (floors/rooms/slugs/sessions), `log` (one-file-per-event append-only + `fold` to
    derive session/wake state). Domain: `personas` (default cast), `workspace` (init/addRepo),
    `status` (derive, don't store). Seam: `git` (thin wrapper). CLI: `context` (caller identity),
    `output` (two audiences), `index` (Commander noun/verb).
- **Works now** —
  - `npx tsc --noEmit` → clean (type gate passes).
  - `node src/cli/index.ts -C <ws> init` → creates a real git-tracked workspace:
    `.ward/workspace.md` (version stamp, model defaults, cast) + five persona docs; front matter is
    canonically ordered; `git log` shows `ward: initialize workspace`.
  - `… repo add meal-planner <local-origin>` → clones a canonical checkout, registers the repo
    (printed `Registered repo meal-planner (main)`).
  - `… status` → `workspace [empty] / nothing in flight`; `… --json status` → derived JSON.
  - `npm test` → **6/6 pass**, incl. two intent invariants: derived-status (pure + "no stored status
    field" on the schema) and no-lost-updates (64 concurrent appenders, all entries present).
- **Decisions** — [0001](decisions/0001-language-and-runtime.md),
  [0002](decisions/0002-execution-and-test-runner.md), [0003](decisions/0003-zod-schemas.md),
  [0004](decisions/0004-frontmatter-determinism.md),
  [0005](decisions/0005-cli-framework-commander.md),
  [0006](decisions/0006-git-integration-shell-out.md).
- **Spec feedback** — [SF-001](spec-feedback.md) (task state machine undefined but the schema needs
  a concrete enum), [SF-002](spec-feedback.md) (status rollup precedence + empty-container case
  unspecified).
- **Next** — the end-to-end slice (task #4): `project open` → `task open` → `worktree create` (real
  `git worktree` + idempotent themed hooks) → `room open` + brief + `dispatch` + `wake` →
  `session
  open/close/resume` via the stub harness handle, deriving status up the hierarchy. Add
  the theming and harness seams. Then the lifecycle intent test (resume idempotent / closed stays
  closed).

---

## Iteration 2 — containment slice end-to-end + theming/harness/hooks (2026-06-23)

- **Goal** — drive the walkthrough's containment spine (§1–§5) as real commands: project → task →
  worktree (real `git worktree` + idempotent themed hooks) → room (+ brief) → session
  (open/close/resume), with status rolling up; build the theming + harness seams; prove the
  resume-idempotent / closed-stays-closed invariant.
- **Did** —
  - Seams: `theming` (FNV-1a deterministic accent, linear-probe collision-free, per-type glyph,
    recorded+nameable) and `harness` (stub runtime exposing start/handle/resume/locate + native
    history file — a real, resolvable handle).
  - `domain/hooks` (idempotent worktree setup: deps marker + theme-by-value, validate-on-resume,
    teardown). `domain/session` (lifecycle over the event log + harness). `domain/resolve` (floor /
    task / room-code resolvers + sibling-accent collectors). `domain/{project,task,worktree,room}`
    (scope ops; project/task auto-open a scope session; room hosts sessions separately).
  - CLI verbs: `project open`, `task open`, `worktree create`, `room open|close`,
    `session open|resume|close|list`.
  - Design drafts: [`theming.md`](../design/theming.md),
    [`agent-harness.md`](../design/agent-harness.md),
    [`lifecycle-hooks.md`](../design/lifecycle-hooks.md) (each "Serves intent"; also clears their
    lychee link errors).
- **Works now** (one scripted run against a fresh temp workspace) —
  - `project open "meal plan exports"` → 🏢 floor 1 (accent lime), attending session `avery-1` with
    handle `stub:…`.
  - `task open "csv export" --floor 1 --repo meal-planner --success …` → 🗂️ task [active], resident
    session.
  - `worktree create --floor 1 --task csv-export --repo meal-planner` → **real** worktree (confirmed
    by `git -C repos/meal-planner worktree list` showing
    `…/worktrees/meal-planner/csv-export
    [csv-export]`); hooks applied (`.ward-setup-deps`,
    `.ward-theme.json` present).
  - `room open … --brief "write CSV endpoint"` → 🚪 room `1A1` (violet) + brief artifact.
  - `session open --room 1A1` → student session `morgan-1` (handle, cwd = worktree path).
  - `session resume … ×2` → idempotent (same handle, no error); `session close` then `resume` →
    **`error: closed stays closed`**; second `close` → idempotent no-op.
  - `status` → derived rollup `workspace [active] ← floor 1 [active] ← csv export [active]`.
  - `npm test` → **11/11**, now incl. intent invariant **resume-idempotent / closed-stays-closed**
    and theming determinism/collision-free; `npx tsc --noEmit` clean.
- **Decisions** — no new ADRs (used the stack from iteration 1).
- **Spec feedback** — [SF-003](spec-feedback.md) (walkthrough §4/§5 conflate opening a room with
  opening its first session; resolved on the domain-model reading).
- **Next** — iteration 3: messaging/dispatch/wake + report (walkthrough §4/§6), recorded-first and
  idempotent. Then iteration 4: privacy translation gate + stub remote/PR + gated merge (§7–§8),
  scope-boundary reflection (§9), cold-start recovery (§10), the privacy-gate intent test, and the
  acceptance script running the whole walkthrough.
