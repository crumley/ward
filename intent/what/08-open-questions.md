# Open Questions

Unresolved tensions and decisions deliberately deferred. This file is *expected* to be
non-empty — it is where we are honest about what we have not settled. As we build, answers
get promoted into the relevant intent file (and reflected in tests and code), and new
questions get added.

## Recently resolved (kept briefly for context)

- **"Mission" is not a containment level.** If it returns, it is an **attribute of a
  project**, not a container above it. (`02-domain-model.md`.)
- **Identity need not be globally unique.** Prefer memorable codes sized to real cardinality;
  a project's code is a floor letter and a room's is floor + number (`A3`); identity need not
  mirror containment. (`02-domain-model.md`.) Edges below.
- **Workspace-wide coordinator + charge-nurse span.** A **house supervisor** persona holds
  workspace-wide status and routing; the human owns workspace direction; the charge nurse is
  per-project. (`03-scopes-and-personas.md`.)
- **A session has one identity.** The harness's native run id is a recorded **harness handle**
  (an attribute), not a second identity. (`04-sessions-and-lifecycle.md`.)

## Role model

- **Persona ↔ scope cardinality.** Multiple personas commonly share a scope. Does exactly one
  persona "own" a scope while others assist, or is it flat?

## Domain model & artifacts

- **When does each level exist?** Rules for a task directly under the workspace vs. inside a
  project; when a project is warranted vs. an ad hoc task; the cheapest possible one-off task.
- **Task state machine.** `05` sketches states but the precise machine, transitions, and which
  are recorded vs. derived are unsettled.
- **Artifact taxonomy.** Beyond *brief*, what other artifact types are first-class (decision,
  status snapshot, dataset, script, handoff)? Where exactly do they live relative to scope
  (`../how/metadata-and-schemas.md` must pin this).
- **Provenance depth.** How much lineage is captured by default vs. on demand, and how is a
  cross-task artifact reference recorded so the borrowing task does not appear to own it?
- **Cross-task mutation.** What does "specific guidance to alter another task's artifact" look
  like concretely — who can grant it, and how is it recorded?

## Identity

- **Task codes.** Rooms are floor + number and projects are floor letters; what convention
  gives **tasks** their codes, and are they scope-relative to the project?
- **Floor-letter uniqueness.** Are floor letters unique within a workspace (recommended), and
  what happens past 26 in-flight projects — two-letter floors, or beyond real cardinality?
- **After close.** Is a floor letter / room number reused, retired, or retained for history?

## Sessions, recovery & coordination

- **"Enough metadata" to resume.** `04` lists a minimum; validate against a real
  reboot-recovery scenario before treating it as settled.
- **Wake across a reboot.** Does a "wake me when the room finishes" request survive a reboot,
  and how is it re-armed during recovery (`../how/messaging-dispatch-wake.md`)?
- **Messaging vs. multiplexer overlap.** How much of messaging/dispatch/wake rides on the
  multiplexer vs. the metadata store? Drawn provisionally; revisit with real usage.
- **Fork mode first.** Which fork inheritance mode ships first — the harness-neutral
  **distilled brief** (universal) or **exact-clone** (where the harness supports it) — and how
  does exact-clone interact with a session's identity and harness handle
  (`02-domain-model.md`, `03-scopes-and-personas.md`, `../how/harness.md`)?

## Work lifecycle, hooks & policy

- **Delegated authority for gated actions.** How is "the human delegated authority for a
  gated action (`01-principles.md` §18) — direct merge, remote-item creation, destructive
  cleanup — to a senior scope" represented and bounded, so it cannot be silently assumed?
- **Hook validation.** How does a setup/teardown hook *check* it is already satisfied (so
  resume is a no-op) — exit codes, marker artifacts, declared checks
  (`../how/lifecycle-hooks.md`)?
- **Refresh/rebase cadence.** Time-based, event-based, human-initiated, or a mix? How are
  rebase conflicts surfaced and handled?
- **Policy encoding home.** `05` says workflow policy is a workspace-owned skill. Confirm vs.
  a dedicated config document, and define the reconciliation UX precisely.

## Reflection & evolution

- **Reflection-type taxonomy.** Which goal-directed reflections ship by default, and how is a
  new type added (`06`)?
- **Cadence/boundary triggers.** Time-based, event-based (project/task close), human-
  initiated, or a mix — for reflection and for main-line refresh?
- **Cross-chunk learnings.** In the chunk→distill→roll-up flow, how are insights that only
  emerge in aggregate not lost?
- **Migration safety.** Is migration always idempotent and re-runnable, and is it reversible
  via the workspace's own version history?

## CLI, telemetry & caller identity

- **Caller-identity enforcement.** The agent caller declares scope/persona/working directory
  (e.g. via an env var Ward sets when it starts an agent, propagated to subprocesses), the
  human declares nothing. Pin the exact mechanism and what is *required* vs. inferred
  (`../how/cli-and-telemetry.md`).
- **Telemetry analysis loop.** How does recorded command usage actually feed alias/tooling
  optimization — is it a reflection type?

## Context economy

- **Append vs. rewrite line.** §12 wants append-only, deterministically ordered context for
  cache sharing; reflection and teaching want context to *evolve*. Where does evolving,
  rewritable context live relative to the stable cacheable prefix (`../how/context-loading.md`)?

## Process & structure

- **Granularity of intent files.** Is the current `what/` 00–08 + `how/` split right, or will
  some files want to split or merge as they grow?
- **What/how boundary drift.** As `how/` fills in, watch for *what*-statements that crept into
  `how/` and *how*-choices that crept into `what/`.
