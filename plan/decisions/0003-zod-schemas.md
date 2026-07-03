# 0003 — Document schemas: Zod, a discriminated union as the catalog

> **Status:** accepted · **Date:** 2026-07-03

## Context

The metadata store requires that **documents have explicit types, and types have runtime-validated
schemas** ([`metadata-store`](../../intent/02-subsystems/00-metadata-store.md)) — machine-critical
state must never sit in unvalidated free text. Because TypeScript types are **erased** at runtime
([0001](0001-language-and-runtime.md)), the filesystem boundary is exactly where validation must be
re-established: every document read off disk must be parsed and checked before code trusts it.

## Options considered

- **Zod.** Schema-first; `z.infer` derives the static type from the runtime schema, so there is one
  source of truth for both audiences (§8). `z.discriminatedUnion('type', …)` models the document
  catalog directly and gives targeted errors. Mature, ubiquitous, no codegen step. Cost: a runtime
  dependency; large unions cost a little inference time (irrelevant at our scale).
- **Valibot.** Same idea, smaller bundle. Cost: bundle size is irrelevant for a local CLI, and the
  ecosystem/familiarity is thinner — no upside here.
- **JSON Schema + Ajv.** Standard, portable schema documents. Cost: the schema and the TS type are
  **two** sources of truth that drift; ergonomics for discriminated unions are worse; codegen creeps
  back in.
- **Hand-written type guards.** No dependency. Cost: exactly the "machine-critical state in
  unvalidated free text" the seam forbids, one forgotten field at a time.

## Decision

**Zod**, with a **`z.discriminatedUnion` on the `type` field** as the document-type catalog. Each
document type is one schema; the union _is_ the store's self-describing type registry. Static types
are `z.infer`red from the schemas — never declared twice.

## Why

One schema per type, discriminated by `type`, is the most direct encoding of the seam's "documents
have explicit types with runtime-validated schemas," and deriving the TS type from it keeps the
human and agent views of a document provably identical. It also gives migration something concrete
to reason about ([`reflection`](../../intent/01-concepts/04-reflection-and-evolution.md)): the
schema version is the shape a migration transforms.

## Consequences

- **Easy:** parse-and-validate on read, validate-on-write; a bad document fails loudly at the
  boundary with a field-level error, not deep in domain logic; front matter is strongly typed
  everywhere above the store.
- **Hard / committed:** every persisted shape needs a schema (the point); schemas and any on-disk
  format version move together.
- **Reversible?** The _contract_ (typed, runtime-validated) is what the seam mandates; swapping Zod
  for another validator is a `store/` change that leaves the document format and intent untouched.
