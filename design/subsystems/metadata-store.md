# Design: Metadata Store

> **Layer:** design — one realization. Names tools/structures; may change. **Status:** placeholder —
> to be filled during implementation.

## Governed by

`../../intent/subsystems/metadata-store.md` — the store contract (deterministic reads, durable
writes, identity resolution, enumeration, append-only logs, provenance, no-lost-updates).

## Realization (to fill)

- **The filesystem is the store** — directory nesting expresses scope containment; `ls`-able and
  directly readable. _(This is where most concept-realization lives — the on-disk form of the
  hierarchy, identity codes, and artifacts.)_
- **Documents are markdown with typed front matter** — prose for humans, front matter for agents.
- **Documents have explicit types, each with a runtime-validated schema** — the document-type
  catalog (🔴 spine).
- **Provenance stored as first-class front matter.**
- **Concurrency by structure** — derive-don't-store, append-over-rewrite, one-owner-per-record, then
  serialize the rest via atomic rename / compare-and-set.
- **Directory paths/naming, the `.gitignore` policy, the schema library/version.**

## Blanks to settle

- See `../blanks-register.md` (document-type catalog + schemas, workspace layout + version stamp —
  both 🔴; concurrency primitive; gitignore policy; provenance depth).
