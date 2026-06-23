# 0003 — Schema & validation library: Zod

> **Status:** accepted · **Date:** 2026-06-22

## Context

The [metadata-store seam](../../intent/02-subsystems/00-metadata-store.md) requires: "Documents have
explicit types, and types have **runtime-validated schemas**; provenance is stored as first-class
front matter." And: "Not permission to put machine-critical state in unvalidated free text." The
store is the spine of Ward; every document read or written crosses this validator. Schemas are also
"what migration reasons about" ([§14](../../intent/00-foundation/01-principles.md),
[reflection](../../intent/01-concepts/04-reflection-and-evolution.md)).

So we need a library that (a) validates untyped YAML front matter at the I/O boundary, (b) yields a
static TS type from the same definition, and (c) carries enough structure (versioned, inspectable)
to support migration later.

## Options considered

- **Zod.** De-facto standard for TS runtime schemas. `z.infer<typeof S>` gives the static type from
  the runtime schema (single source of truth). Rich, composable validators; discriminated unions
  (ideal for a typed-document catalog keyed on a `type` field); good error messages for the
  two-audiences error surface. Tradeoff: a real (if small) dependency; schemas are values, not
  classes.
- **Valibot.** Similar model, smaller bundle via modular imports. Tradeoff: smaller ecosystem and
  less battle-tested; bundle size is irrelevant for a local CLI (our weak constraint), so its main
  advantage doesn't apply.
- **TypeBox / Ajv (JSON Schema).** Produces portable JSON Schema (nice for cross-language store
  consumers and for migration tooling). Tradeoff: more ceremony to get ergonomic static types;
  JSON-Schema-first is heavier than we need for v1, and our store is read mostly by Ward itself.
- **Hand-rolled validators.** Zero deps. Tradeoff: re-implements a solved problem; every document
  type needs bespoke validation and a separately-maintained type — exactly the drift the seam warns
  against ("a schema field" vs "human-only prose").

## Decision

**Zod**, with one schema per document type, assembled into a **discriminated union on the `type`
front-matter field** as the document-type catalog. Every store read parses through the matching
schema; every write is constructed from a typed object and re-validated before serialization.

## Why

- It directly satisfies the seam's hardest requirement with the least code: _one_ `z.object` is both
  the runtime gate and (`z.infer`) the static type, so "typed" and "runtime-validated" cannot drift
  — the precise failure the contract exists to prevent.
- A **discriminated union on `type`** mirrors the store's own self-description: the front-matter
  `type` field _is_ the discriminator, so "read this file as whatever type it declares, and reject
  it if it doesn't conform" is one `schema.parse`. This makes the store self-validating and self-
  describing, as the seam asks.
- Zod schemas are **inspectable values**, which gives migration
  ([§14](../../intent/00-foundation/01-principles.md)) something concrete to reason about later
  (introspect fields, diff schema versions) without us committing to a migration engine now.

## Consequences

- **Easy:** add a document type = add a schema to the catalog union; validation and types come for
  free; malformed front matter fails loudly at the boundary, not deep in logic.
- **Hard / committed-to:** Zod schemas are the canonical definition of every document's shape; the
  on-disk YAML must match them, so schema evolution is a real (versioned) concern — which is
  correct, since the seam says schemas are what migration reasons about. We stamp a `schemaVersion`
  to make that tractable later.
- **Reversibility:** medium-high. Schemas are isolated in one module; swapping to Valibot/TypeBox is
  a contained rewrite of that module. The _on-disk_ YAML is library-neutral, so the workspace itself
  is unaffected by a validator swap.
