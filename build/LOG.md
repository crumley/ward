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

---

## Iteration 3 — messaging seam: dispatch / report / wake (2026-06-23)

- **Goal** — realize the dispatch (down) / report (up) / wake (notify) flows, recorded-first in the
  store, idempotent (a satisfied wake fires once), inspectable, and re-armable on recovery
  (walkthrough §4 + §6).
- **Did** — `seams/messaging.ts`: `dispatch`/`report` (write `message` docs addressed to an
  identity), `armWake` (a `wake` doc + an append-only wake log; state **derived** by folding the
  log), `satisfyCondition` (append `satisfy` to matching armed wakes — fires once), `pendingWakes`
  (the still-armed set recovery re-arms), `listMessages`/`listWakes` (the inspection surface). CLI
  verbs `dispatch`, `report <target> <status>`, `wake arm|list`, `messages`. Design draft
  [`messaging-dispatch-wake.md`](../design/messaging-dispatch-wake.md). Test
  [`messaging.test.ts`](../test/design/messaging.test.ts).
- **Works now** (scripted against a fresh temp workspace, after the §1–§5 setup) —
  - `dispatch --to 1A1 --ref write-csv-endpoint --body …` → `Dispatched Riley → 1A1 (ref …)`.
  - `wake arm --on 1A1:done --armer Riley` → `[armed] 1A1:done → Riley`.
  - `report 1A1 done` → `woke 1 (w-…)`; **second** `report 1A1 done` →
    `already satisfied (fires
    once)`; `wake list` → `[satisfied]`.
  - `messages --to 1A1` lists the dispatch; on disk `.ward/messages/*.md` and
    `.ward/wakes/<id>.log/{arm,satisfy}` confirm recorded-first.
  - `npm test` → **13/13** (added wake-fires-once + recorded/inspectable); `npx tsc --noEmit` clean.
- **Decisions** — no new ADRs.
- **Spec feedback** — none new (routing-through-status-persona deferred, matching the seam's own
  open question; noted in the design draft).
- **Next** — iteration 4: the privacy translation gate (real, the 4th invariant) + stub remote
  provider + PR tracking + gated merge (§7–§8), and the privacy-gate intent test. Then iteration 5:
  scope-boundary reflection (§9), cold-start recovery (§10), and the acceptance walkthrough script.

---

## Iteration 4 — privacy gate + remote/PR + gated actions (2026-06-23)

- **Goal** — the local↔remote crossing (walkthrough §7–§8): a REAL privacy translation gate (the 4th
  invariant), the remote-item link, PR status, and gated outward/irreversible actions (§18).
- **Did** — `seams/privacy.ts`: `translate` (drop front matter; redact local paths; neutralize
  persona names + role words; strip glyphs) + `assertClean` (independent, fail-closed verifier that
  THROWS on any residual leak). `domain/remote.ts`: `attachRemote` (local link), `openPr` (gated;
  body routed through the gate; sanitized body stored as a `pr-body` artifact; task → in-review),
  `reviewPr` (incoming status, not gated), `mergePr` (gated + only when approved — never-merge-to-
  main). CLI: `task attach-remote`, `pr open|review|merge` with `--authorize`. Design draft
  [`remote-provider.md`](../design/remote-provider.md). Intent test
  [`privacy-gate.test.ts`](../test/intent/privacy-gate.test.ts).
- **Works now** (scripted) —
  - `pr open` **without** `--authorize` → `error: gated action … requires explicit human authority`.
  - `pr open … --authorize` with a body naming `Riley`/`Morgan`, the workspace path, `the resident`,
    and `🚪` → sanitized to `the team … <redacted-path> … the team`;
    `stripped: local-path,
    persona:Riley, persona:Morgan, role, glyph`; the stored
    `artifacts/pr-42.md` body is clean.
  - `pr merge` before approval → refused (needs approved); `pr review approved` → approved;
    `pr merge` without `--authorize` → gated refusal; with `--authorize` → merged.
  - `npm test` → **17/17** — now ALL FOUR intent invariants pass (derived status; resume idempotent
    / closed stays closed; **privacy gate**; no lost updates). `npx tsc --noEmit` clean.
- **Decisions** — no new ADRs (forge kept a stub per v1-scope).
- **Spec feedback** — reinforces [SF-001](spec-feedback.md) (`in-review` better derived from open-PR
  than stored); noted in the remote design draft.
- **Next** — iteration 5: scope-boundary reflection map-reduce (§9), cold-start recovery (§10,
  consuming `pendingWakes` + `revalidateWorktree`), the acceptance walkthrough script
  (`test/acceptance/walkthrough.sh`) from clean state, and the final summary LOG entry.
