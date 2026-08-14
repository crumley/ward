# Subsystem: Metadata Store

> **Layer:** intent · subsystem (seam). The contract any design must honor; the _how_ is planned in
> [`../../design/`](../../design/). **Status:** living.

## Responsibility

Persist and serve the **recorded state of the workspace** — the hierarchy of scopes, the tasks and
their lifecycle, the sessions and their logs, the recovery records, the artifacts and their
provenance, the identities, the reflection cursors, the version stamp. It is the source of truth
that survives reboots ([`../00-foundation/01-principles.md`](../00-foundation/01-principles.md)
§16).

## Constraints any design must honor

- **Deterministic reads** — "the state of X" returns the same answer for the same state, in a form
  agents can parse and humans can read. _Why:_ both audiences act on the same record (§8).
- **Durable, promptly-updated writes** through the lifecycle operations. _Why:_ recovery must
  reflect reality, not a stale snapshot
  ([`../01-concepts/02-sessions-and-lifecycle.md`](../01-concepts/02-sessions-and-lifecycle.md)).
- **Identity resolution** — from an identity (including scope-relative) to the thing it names.
- **Enumeration** of scopes and sessions for recovery and reflection.
- **Append-only session logs per scope**, and **durable artifacts per scope with provenance**.
  _Why:_ appends don't collide, and stored lineage is what makes a result traceable (§11).
- **Aggregate status is derived from leaf records, not stored** as a separate field. _Why:_ a stored
  roll-up goes stale and turns every child transition into a parent write — a lost-update hazard
  ([`../01-concepts/00-domain-model.md`](../01-concepts/00-domain-model.md)).
- **No lost updates** (§17), via this order of preference: _derive don't store_ shared roll-ups →
  _append over rewrite_ → _one owner per mutable record_ (others read or request a change) →
  _serialize the few unavoidable shared writes_ (atomic, loss-free). _Why structural first, locks
  last:_ each layer removes a class of contention so the next has less to do.
- **Readers never observe a partial document.** Any observer — human, agent, git — sees a record
  whole: as it was before a write or as it is after, never mid-write. _Why:_ deterministic reads
  (§6, §8) must hold at concurrent moments too; a torn read is a wrong answer with no error
  attached.
- **Serialization must not depend on a resident process.** The store accepts safe writes from a cold
  start, when nothing else is running. _Why:_ recovery writes before anything else is alive (§3,
  §16); a store that needs a broker cannot record the recovery that would restart the broker.
- **Contention is legible and fails safe.** If a record is held for writing, an inspecting human or
  agent can see that — and by whom — in the workspace itself; a crashed writer never wedges a record
  permanently, and taking over from one is principled and safe to repeat (§6). _Why:_ two audiences
  (§8) and transparency (§15) apply to the mechanism, not just the data — and partial failure is
  normal, so recovering from it cannot require archaeology.
- **The serialization primitive is sized to its real load.** The unavoidable shared writes are few
  and brief — identity allocation, not database workloads. _Why:_ the structural discipline above
  removes most contention first; what remains does not justify heavyweight machinery.
- **Transparent and legible to both audiences** — the working realization is a **filesystem of
  markdown files with typed front matter**, directory nesting expressing scope containment, so a
  human or agent can read the state directly and git can version it (§15). _Why:_ a transparent
  store doubles as documentation of the hierarchy and needs no opaque query layer.
- **Documents have explicit types, and types have runtime-validated schemas;** provenance is stored
  as first-class front matter, not reconstructed from logs. _Why:_ types make the store
  self-describing and validatable, and schemas are what migration reasons about
  ([`../01-concepts/04-reflection-and-evolution.md`](../01-concepts/04-reflection-and-evolution.md)).
- **Document types come in two tiers.** **Records** are Ward-owned and closed — the session logs,
  recovery records, reflection proposals and cursors, the version stamp — versioned with the CLI and
  changed only through its update/migration path. **Artifact types** are an open set: seeded by Ward
  (**brief**, **decision**, **note**), extendable by the workspace itself, each registered with a
  runtime-validated schema — and the catalog of registered types is itself a validated document,
  **composed** from Ward's seed and the workspace's own registrations, later winning per type name
  ([`../01-concepts/06-workspace-lifecycle.md`](../01-concepts/06-workspace-lifecycle.md), the
  compose-first rule's worked instance), so the store stays self-describing as it grows. _Why:_ the
  machinery must be able to rely on its own records absolutely, while the workspace's output
  vocabulary must be free to evolve (§13, §14) — a reflection can propose a new artifact type
  without waiting on a CLI release
  ([`../01-concepts/04-reflection-and-evolution.md`](../01-concepts/04-reflection-and-evolution.md)).

## What this is NOT

- **Not a mandate that the store always be the filesystem.** If it is ever swapped for a database,
  what must be preserved is this **contract** — deterministic reads, durable writes, identity
  resolution, enumeration, append-only logs, provenance, no-lost-updates — **not** the directory
  conventions.
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

- Exact directory paths and naming — bounded: an identity must resolve from the layout and the
  documents themselves, without a maintained index that can drift from them (a derived index is a
  cache over the record, never a second truth, §16). The per-type front-matter fields and the
  **registration mechanics** for workspace-added artifact types; the schema library and version;
  serialization details; the **concurrency primitive** for serialized shared writes — bounded by the
  contention constraints above (no partial reads, no resident process, legible, fail-safe, sized to
  few brief writes), and per §19 free to be plural while the evidence accumulates; the `.gitignore`
  policy (tracked vs. regenerated); provenance depth and how a cross-task artifact reference is
  recorded. Planned in the [`design/`](../../design/) record.

## Open questions

- None currently. The artifact taxonomy is settled as the two-tier constraint (above); the
  concurrency primitive is not an open _question_ but a bounded technique choice (§19) — the
  contention constraints above are the contract any candidate must satisfy, and the choice itself is
  design history ([`design/`](../../design/)).
