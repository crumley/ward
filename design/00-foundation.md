# Design: Foundation (global architecture)

> **Layer:** design — implementation plan. The *how*; may change; moves with `../src/` and `../test/`. **Status:** draft.

The recommended first design step: the cross-cutting architecture decisions no single later plan
owns — language, the on-disk workspace shape, and the **settle-early spine** every subsystem reads
or writes.

## Serves intent

- [`../intent/00-foundation/`](../intent/00-foundation/) — the global what & why this architecture
  realizes.
- [`../intent/02-subsystems/00-metadata-store.md`](../intent/02-subsystems/00-metadata-store.md) —
  the store contract whose on-disk shape is fixed here.
- [`../intent/02-subsystems/07-human-shell.md`](../intent/02-subsystems/07-human-shell.md) — the
  caller-identity signal fixed here.

## Architecture

- **Language & schema approach.** Working assumption: **TypeScript with a Zod-style
  runtime-validating schema layer**, so one definition yields both compile-time types and runtime
  validation ([store contract](../intent/02-subsystems/00-metadata-store.md): documents must be
  strongly typed *and* runtime-validated — the language is replaceable, that property is not). The
  workspace's configuration shape is emitted as a **typed interface** Ward writes into the
  workspace, so a newer CLI can detect drift and migrate it.
- **Repo/module layout.** The four legs — `intent` / `design` / `src` / `test`. `src/` is laid out
  to **mirror the design's module boundaries** (one module per seam/mechanism, plus a store core);
  that layout is itself recorded here as it is chosen.
- **On-disk workspace layout (settle-early).** A **filesystem store** with **directory nesting
  expressing scope containment**; durable documents are **markdown with typed front matter**. The
  workspace is itself a **git repository** with a `.gitignore` policy separating tracked durable
  state from regenerable/transient state (principle §15). The exact paths and the document-type
  catalog are pinned in [`metadata-store.md`](metadata-store.md).
- **Version stamp (settle-early).** The workspace records the Ward version that created and last
  updated it, with the schema version it implies; `update` vs. `migrate`
  ([`../intent/01-concepts/04-reflection-and-evolution.md`](../intent/01-concepts/04-reflection-and-evolution.md))
  reason about it.
- **Caller-identity signal (settle-early).** Ward sets an **ambient environment variable** (plus
  context fields: persona, scope, working directory) when it starts an agent, **propagated to
  subprocesses**; its presence means "agent, require context," its absence means "human, require
  nothing." The exact variable name and required-vs-inferred fields are pinned in
  [`cli-and-telemetry.md`](cli-and-telemetry.md).
- **Cross-cutting conventions.** The **no-lost-updates discipline** (derive → append →
  single-writer → serialize) is the default for every writer; deterministic, parseable output for
  the agent audience and readable output for the human (principle §8); errors and logs follow one
  shared convention (to settle).
- **How `design/` is organized.** Spine first (the settle-early decisions above), then one plan
  per seam and per cross-cutting mechanism — see [`README.md`](README.md).
