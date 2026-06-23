# Design: Metadata Store

> **Layer:** design — implementation plan. The _how_; may change. **Status:** draft.

The build behind the metadata-store seam — the document catalog, schemas, and concurrency primitive.
The global on-disk shape is fixed in [`00-foundation.md`](00-foundation.md).

## Serves intent

- [`../intent/02-subsystems/00-metadata-store.md`](../intent/02-subsystems/00-metadata-store.md) —
  deterministic reads, durable writes, identity resolution, enumeration, append-only logs,
  provenance, no-lost-updates.
- [`../intent/01-concepts/00-domain-model.md`](../intent/01-concepts/00-domain-model.md) — the nouns
  these documents record (artifacts, identity, status).

## Plan (draft)

- **Realization:** filesystem of markdown files with typed front matter; directory nesting = scope
  containment (from [`00-foundation.md`](00-foundation.md)).
- **Document-type catalog + schemas (settle-early).** The full list of document types (project
  record, task record, session-log entry, brief, workflow policy, dataset, …) and the exact
  front-matter fields/schema each must satisfy. _Bound:_ every durable document is typed and
  runtime-validated.
- **Status roll-up derivation (settle-early).** The query computing a containing scope's status from
  its children's leaf records (status is derived, not stored).
- **Concurrency primitive.** Choose for the few serialized shared writes: advisory lock, atomic
  write-to-temp + rename, or compare-and-set on a version stamp. _Bound:_ no lost updates; prefer
  derive/append/single-writer so this set stays tiny.
- **`.gitignore` policy.** Which artifacts are tracked vs. regenerated (§15).
- **Provenance.** Default depth (stored vs. on-demand) and how a cross-task artifact reference is
  recorded so the borrowing task does not appear to own it.
