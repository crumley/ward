# v2 — Scope

> The contract this exercise works to, and the loop's exit test. Fill this **first**
> ([`../README.md`](../README.md)). What is in, what is deferred and why, and the acceptance
> scenario.

**Goal of the exercise.** Make Ward _run_ against the current intent — drive the walkthrough
([`../../intent/03-walkthrough.md`](../../intent/03-walkthrough.md), §0–§10) as real commands
against a real on-disk workspace, reproducibly from a clean state — and, in doing so, discover where
the intent is still wrong and record it in [`spec-feedback.md`](spec-feedback.md). Two deliverables:
a working Ward, and a tighter intent.

**Relationship to v1.** v1 (branch `build/v1`) proved a stack and a spine; its lessons are already
absorbed into `intent/`. v2 does **not** copy v1 — it is a fresh build, tighter and more
opinionated, closing the one gap v1 left open: **`make check` now covers code, not just Markdown**
(formatter + linter + types + tests, in the Makefile _and_ CI), wired as the design foundation
before significant code.

## The MVP boundary

The rule: **build the spine for real; implement each fuzzy seam thinly but really** — thin enough to
skip productionization, real enough to demonstrate the load-bearing invariant that would survive a
design swap. A seam is "done" for v2 when its invariant is provable by a command, not when it is
feature-complete.

### In — built for real

- **The metadata store** ([`00-metadata-store`](../../intent/02-subsystems/00-metadata-store.md)) —
  a filesystem of typed Markdown documents with runtime-validated (Zod) front matter; directory
  nesting expresses scope containment; append-only per-scope logs; derived-not-stored roll-ups.
- **Identity** ([`domain-model`](../../intent/01-concepts/00-domain-model.md)) — floor numbers,
  floor+room codes (`1A1`), session ids **unique among open sessions workspace-wide** (bare id
  addresses).
- **The domain nouns and their lifecycle** — workspace init, project (floor), task (stored
  `active|paused|closed`), worktree (repo+branch), room (opening **mints its first session**;
  **freed** on last-session close), session (open/close/resume/wake).
- **Derived status** ([`domain-model`](../../intent/01-concepts/00-domain-model.md)) — precedence
  `active ▸ paused ▸ closed`, empty container `active`, `in-review` a derived overlay from the
  open-PR set. Never stored.
- **The human shell** ([`07-human-shell`](../../intent/02-subsystems/07-human-shell.md)) — a
  Commander noun/verb CLI; two-audience output (human text + `--json`); **workspace discovery and
  scope derivation from any cwd**; a **`doctor`** command; **file inputs (`@file`/`-`) for long-text
  args**; global + workspace-local config; caller-identity via an ambient agent signal; verbs that
  read true (`resume` per-thread, **`attach`** for the workspace cold start).

### In — thin but real (each proves one invariant)

- **Agent harness** ([`03-agent-harness`](../../intent/02-subsystems/03-agent-harness.md)) — a stub
  runtime behind the `start / handle / resume / locate` adapter. _Invariant:_ the harness handle is
  recorded and resolvable; resume is idempotent.
- **Messaging** ([`02-messaging`](../../intent/02-subsystems/02-messaging-coordination.md)) —
  dispatch / report / wake, **recorded-first**. _Invariant:_ conditions live in the store, fire
  once, and are **re-armed on recovery**; the flow is inspectable.
- **Theming** ([`05-visual-theming`](../../intent/02-subsystems/05-visual-theming.md)) —
  deterministic accent + per-type glyph, recorded as a nameable attribute. _Invariant:_ same
  identity → same accent, collision-free among the visible set, resolvable from words ("the blue
  one").
- **Remote provider + privacy gate**
  ([`06-remote-provider`](../../intent/02-subsystems/06-remote-provider.md)) — a stub forge plus the
  **single upstream privacy-translation gate**. _Invariant:_ **fail-closed** exhaustive redaction of
  the closed role vocabulary and persona names on every outward path; posting is a gated action.
- **Model selection** ([`04-model-selection`](../../intent/02-subsystems/04-model-selection.md)) —
  the override hierarchy. _Invariant:_ narrower scope overrides broader; defaults follow the
  persona.
- **Lifecycle hooks** ([`03-work-lifecycle`](../../intent/01-concepts/03-work-lifecycle.md)) —
  idempotent setup/teardown, validate-on-resume no-op.
- **Scope-boundary reflection**
  ([`04-reflection`](../../intent/01-concepts/04-reflection-and-evolution.md)) — the chunk → distill
  → roll-up map-reduce with a **cursor** (distill step is a deterministic stub). _Invariant:_ the
  cursor advances so the next run is incremental.
- **Recovery** ([`02-sessions`](../../intent/01-concepts/02-sessions-and-lifecycle.md)) — cold-start
  `attach`: enumerate → keep open-not-closed → resume via handle → re-arm wakes → re-validate setup
  for **live worktrees only** → leave closed alone.

### Deferred — and why it is safe to defer

Each deferral keeps a real invariant and drops only productionization behind a thin adapter:

- **A real multiplexer** (tmux/zellij) — the multiplexer is explicitly a _cache over the record_
  (§16); the record plus a host stub proves recovery rebuilds live state. Real pane wiring is
  surface work, not an invariant.
- **A real agent harness** (Claude Code, etc.) — the stub exercises the whole
  `start/handle/resume/
  locate` contract; a real harness is an adapter swap that must not touch
  the concepts (§5).
- **A real forge** (GitHub API) — the **privacy gate** is the load-bearing part and is built for
  real; the API call behind it is a thin, replaceable adapter.
- **Real LLM reflection / model calls** — the map-reduce _structure_ and cursor are the invariant;
  the distill is a deterministic stub so the test is hermetic.
- **Painting terminal surfaces with the theme** — deterministic assignment + recorded/nameable
  attribute is the invariant; painting borders is surface wiring.
- **Fork / side-quests**, **update/migration + reconciliation** (the version stamp _is_ written),
  **a real concurrency lock** (structural no-lost-updates — one-file-per-log-entry, single-owner
  records, derive-don't-store — removes the contention v2 actually creates), **telemetry analysis**,
  and **interactive picker/autocomplete polish** (deterministic resolution + `doctor` + file-args
  are in; the fancy TUI is not). Each is off the §0–§10 critical path.

## The acceptance scenario (the loop's exit test)

`test/acceptance/walkthrough.sh` drives the intent walkthrough §0–§10 as **real `ward` commands**
against a **fresh workspace in a temp directory**, from a clean state, asserting the records written
at each step and ending with the **reboot-recovery** test (§10). Plus the **intent tests** encode
the five invariants that must survive a design swap:

1. Derived status — never stored (precedence, empty=active, in-review overlay).
2. Resume-idempotent / closed-stays-closed.
3. The privacy gate — fail-closed exhaustive redaction.
4. Append-only / no-lost-updates.
5. Cold-start recovery — live worktrees only.

**Done looks like:** the walkthrough script runs green from clean; the five intent tests pass;
`design/` has a plan per implemented seam tracing to intent and `src/` mirrors it; `plan/v2/`
carries this scope, the journal, spec-feedback (`SF-` entries), and the stack ADRs; **`make check`
is green**. Then hand off to the human — never merge to `main` (Ward's own cardinal rule).
