# Implementation Blanks Register

The **bridge between intent and the implementation plan.** It aggregates, in one place, every
spot the intent deliberately left for the implementer to fill — the "where to fill in the blanks"
sections of the `how/` docs and the unresolved items in `what/08-open-questions.md` — and tags
each by **when it must be settled**.

This is **not** a plan: it sequences nothing and designs nothing. It is the **checklist a plan
must consume** so no deferred decision is silently forgotten. As a blank is filled, fold the
answer into the relevant intent doc (and into tests and code) and check it off here.

## How to read this

Each entry names a **decision**, its **source** in intent, and a **tag**:

- 🔴 **Settle early** — foundational; other work reads or writes whatever this decides, so an
  ambiguous answer propagates. Resolve before or at the very start of implementation.
- 🟡 **Settle during build** — real, but local to one subsystem; decide it when that subsystem is
  built, without blocking the rest.

The 🔴 set is small on purpose — it is the spine. Everything else is 🟡.

## 🔴 Settle early — the spine

| Decision | Source | Why early |
|---|---|---|
| **Document-type catalog + schemas.** The full list of document types and the exact front-matter fields / schema each must satisfy. | `how/metadata-and-schemas.md`; `08` (artifact taxonomy) | The store is the spine; every subsystem reads and writes these documents. Nothing typed can be built until the types exist. |
| **Identity scheme specifics.** Task codes (and whether project-relative); floor-letter uniqueness scope and the past-26 case; reuse-after-close policy. (Rooms = floor + number, projects = floor letters, are settled.) | `what/02-domain-model.md`; `08` (Identity) | Identity is how everything is addressed and where it lives on disk; paths and references depend on it. |
| **Task state machine.** The precise states, transitions, and which are recorded vs. derived. | `what/05-work-lifecycle.md`; `08` | The CLI, the status roll-up, and the status personas all read it. |
| **Status roll-up derivation.** The query that computes a containing scope's status from its children (status is derived, not stored). | `what/02-domain-model.md` (Status); `07` (store contract) | Defines the read model the status personas and CLI depend on. |
| **Privacy-translation gate.** What the outward re-authoring concretely strips/rewrites, and the single upstream place it runs. | `how/remote-provider.md` | The highest-stakes correctness boundary; a leak here is the failure the system exists to prevent. |
| **Caller-identity signal.** The env-var name and the context fields it carries (which required vs. inferred), propagated to subprocesses. | `how/cli-and-telemetry.md`; `08` | Every agent-issued command, and all provenance and telemetry, depends on it. |
| **Workspace layout + version stamp.** The on-disk directory layout, and the version/schema stamp update/migrate reason about. | `how/metadata-and-schemas.md`; `what/06` | Fixes the shape everything else is written into and migrated forward. |

## 🟡 Settle during build — by subsystem

**Metadata store** — exact directory paths and naming, serialization details; the concurrency
primitive for serialized shared writes (advisory lock, atomic rename, or CAS); the `.gitignore`
policy (tracked vs. regenerated, §15); provenance depth (default vs. on demand) and how a
cross-task artifact reference is recorded so the borrower doesn't appear to own it.
(`how/metadata-and-schemas.md`, `08`)

**Context loading** — `AGENTS.md` field conventions and how skills are referenced/resolved; the
exact deterministic ordering algorithm and where the mutable tail begins; where evolving context
lives relative to the stable cacheable prefix. (`how/context-loading.md`, `08`)

**Sessions / harness / multiplexer** — per-harness handle format and history location, and the
adapter interface; "enough metadata" to resume, validated against a real reboot; the specific
multiplexer, its window/pane grouping, and the recorded↔live mapping; which fork mode ships first
(brief vs. exact-clone) and how exact-clone interacts with identity and the handle.
(`how/harness.md`, `how/multiplexer.md`, `08`)

**Messaging / dispatch / wake** — the message/dispatch record format and where it sits relative
to the session log; how a wake condition is expressed and evaluated; the multiplexer-vs-store
split; the concrete re-arm-on-recovery mechanism (the *what* is fixed).
(`how/messaging-dispatch-wake.md`, `08`)

**Model selection** — the configuration shape for defaults/overrides; the initial persona→tier
mapping and the concrete model ids behind "fast" and "deep"; how thinking depth is expressed.
(`how/model-selection.md`)

**Work lifecycle / hooks / policy** — the set of transition points, how a hook declares its
satisfied-check, hook format/location, ordering, and failure surfacing; refresh/rebase cadence
and how rebase conflicts are surfaced; the default workflow-policy content, skill format/location,
divergence detection, and reconciliation UX; how delegated authority for gated actions (§18) is
represented and bounded. (`how/lifecycle-hooks.md`, `how/workflow-policy.md`, `08`)

**Reflection & evolution** — the default reflection goals and how a new one is added; chunk
heuristics, distillation shape, roll-up procedure, and cross-chunk theme preservation; the
cursor's concrete form per goal; cadence/boundary triggers; migration idempotency/reversibility
via the workspace's version history. (`how/reflection.md`, `08`)

**Theming** — the palette and deterministic assignment function (and its collision scope); which
surfaces are themed; the exact setup/teardown hook steps. (`how/theming.md`)

**Remote provider** — which forge and the adapter API; attach/merge reconciliation; PR-status
polling; the gated-post authority flow. (`how/remote-provider.md`)

**CLI & telemetry** — the exact command tree and naming; the initial alias bindings; the telemetry
storage format/fields and the analysis loop (is it a reflection type?). (`how/cli-and-telemetry.md`,
`08`)

## Living tensions to keep watching

Not single decisions but ongoing balances (`08`): append-vs-rewrite against evolving context;
what/how boundary drift; intent-file granularity; cross-chunk reflection learnings. Revisit these
at each scope boundary, not once.
