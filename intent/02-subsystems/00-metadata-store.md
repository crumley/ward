# Subsystem: Metadata Store

> **Layer:** intent · subsystem (seam). The contract any design must honor; the *how* is planned in [`../../design/`](../../design/). **Status:** living.

## Responsibility

Persist and serve the **recorded state of the workspace** — the hierarchy of scopes, the tasks
and their lifecycle, the sessions and their logs, the artifacts and their provenance, the
identities, the reflection cursors, the version stamp. It is the source of truth that survives
reboots ([`../00-foundation/01-principles.md`](../00-foundation/01-principles.md) §16).

## Constraints any design must honor

- **Deterministic reads** — "the state of X" returns the same answer for the same state, in a
  form agents can parse and humans can read. *Why:* both audiences act on the same record (§8).
- **Durable, promptly-updated writes** through the lifecycle operations. *Why:* recovery must
  reflect reality, not a stale snapshot ([`../01-concepts/02-sessions-and-lifecycle.md`](../01-concepts/02-sessions-and-lifecycle.md)).
- **Identity resolution** — from an identity (including scope-relative) to the thing it names.
- **Enumeration** of scopes and sessions for recovery and reflection.
- **Append-only session logs per scope**, and **durable artifacts per scope with provenance**.
  *Why:* appends don't collide, and stored lineage is what makes a result traceable (§11).
- **Aggregate status is derived from leaf records, not stored** as a separate field. *Why:* a
  stored roll-up goes stale and turns every child transition into a parent write — a lost-update
  hazard ([`../01-concepts/00-domain-model.md`](../01-concepts/00-domain-model.md)).
- **No lost updates** (§17), via this order of preference: *derive don't store* shared roll-ups
  → *append over rewrite* → *one owner per mutable record* (others read or request a change) →
  *serialize the few unavoidable shared writes* (atomic, loss-free). *Why structural first,
  locks last:* each layer removes a class of contention so the next has less to do.
- **Transparent and legible to both audiences** — the working realization is a **filesystem of
  markdown files with typed front matter**, directory nesting expressing scope containment, so a
  human or agent can read the state directly and git can version it (§15). *Why:* a transparent
  store doubles as documentation of the hierarchy and needs no opaque query layer.
- **Documents have explicit types, and types have runtime-validated schemas;** provenance is
  stored as first-class front matter, not reconstructed from logs. *Why:* types make the store
  self-describing and validatable, and schemas are what migration reasons about
  ([`../01-concepts/04-reflection-and-evolution.md`](../01-concepts/04-reflection-and-evolution.md)).

## What this is NOT

- **Not a mandate that the store always be the filesystem.** If it is ever swapped for a
  database, what must be preserved is this **contract** — deterministic reads, durable writes,
  identity resolution, enumeration, append-only logs, provenance, no-lost-updates — **not** the
  directory conventions.
- **Not a requirement for a specific language or schema library.** What must survive is that
  documents are **strongly typed and runtime-validated**, by whatever realizes them.
- **Not a transactional database requirement.** Safety comes from the append / single-writer /
  atomic-write discipline, not from ACID.
- **Not permission** to put machine-critical state in unvalidated free text, or human-only prose
  where a schema field belongs.

## Canonical home for

- The **metadata-store contract**, and the **no-lost-updates discipline** (derive → append →
  single-writer → serialize). Other slices link here for "where state lives and how it stays
  consistent."

## Left to implementation

- Exact directory paths and naming; the full **document-type catalog** and per-type front-matter
  fields; the schema library and version; serialization details; the **concurrency primitive**
  for serialized shared writes (advisory lock, atomic rename, or compare-and-set); the
  `.gitignore` policy (tracked vs. regenerated); provenance depth and how a cross-task artifact
  reference is recorded. Planned in
  [`../../design/metadata-store.md`](../../design/metadata-store.md) and
  [`../../design/00-foundation.md`](../../design/00-foundation.md).

## Open questions

- **Artifact taxonomy** — which document types are first-class and where each lives relative to
  scope (with [`../01-concepts/00-domain-model.md`](../01-concepts/00-domain-model.md)).
- **The concurrency primitive** for the unavoidable shared writes.
