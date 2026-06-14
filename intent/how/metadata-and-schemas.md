# How-Intent: Metadata Store, Documents & Schemas

Durable choices behind the **metadata store** seam (`../what/07-subsystem-seams.md`) and the
shape of the data Ward keeps. These are *how* choices — independent of the concepts, and
replaceable — recorded here because they should outlive any one implementation.

## Choice: the filesystem is the store

Ward's recorded state lives on the **filesystem**, with **directory nesting expressing scope
containment**. A human or agent can `ls` and read the state directly; the on-disk structure
*is* a legible projection of the domain model (`../what/02-domain-model.md`).

**Why.** It is transparent (no opaque database to query), trivially inspectable by both
audiences, naturally versionable by git (`../what/01-principles.md` §15), and it lets the
directory layout double as documentation of the hierarchy.

## Choice: documents are markdown with typed front matter

Durable documents (artifacts including briefs, scope records, notes) are **markdown files
with structured front matter** — key attributes in a front-matter block, prose in the body.

**Why.** Markdown serves the two audiences at once (`../what/01-principles.md` §8): humans
read the prose, agents read the front matter deterministically. Front matter carries the
machine-relevant attributes (type, identity, status, timestamps, **provenance**, links)
without polluting the human-readable body.

## Choice: documents have explicit types, and types have schemas

Every durable document has a **document type** (e.g. *brief*, *task record*, *session log
entry*, *workflow policy*, *dataset*), and each type has a **strongly-typed, runtime-validated
schema** its front matter must satisfy.

**Why.** Types make the store self-describing and validatable; agents can rely on a *brief*
always having a brief's fields. Schemas are the contract between the store and everything that
reads it, and they are what migration reasons about (`../what/06-reflection-and-evolution.md`).

**Document types are enumerated as we go.** The set is open; `../what/08-open-questions.md`
tracks the artifact taxonomy.

## Choice: provenance is stored, not just current state

Artifact front matter records **lineage** (`../what/02-domain-model.md`,
`../what/01-principles.md` §11): which persona created it, in what working directory, from
which session, why, and which source artifacts it derived from.

**Why.** The store must answer "where did this come from?" months later. Storing provenance as
first-class front matter — rather than reconstructing it from logs — is what makes lineage
queryable and an erroneous result traceable to its root.

## Choice: lean into schemas; keep them out of the concepts

Schemas are a first-class part of the *how*. Nothing in Ward's concepts requires a particular
language, but where schemas are implemented the strong preference is a **typed language with a
runtime-validating schema layer** (working assumption: TypeScript with a Zod-style layer), so
one definition yields both compile-time types and runtime validation.

**Why.** Strong typing plus runtime validation catches malformed state early and makes the
store's guarantees enforceable rather than aspirational.

## Choice: configuration shape is expressed as code interfaces

A workspace's configuration format is defined by a **typed interface Ward emits into the
workspace**; the human-edited config is checked against it, and the generated interface gives
validation and editor autocomplete. The generated artifact is part of what update/migration
regenerates and reconciles (`../what/06-reflection-and-evolution.md`).

**Why.** It makes the config self-documenting and version-aware: the workspace carries the
exact shape the current CLI expects, so a newer CLI can detect drift and migrate it.

## Choice: concurrency is safe by structure — append, single-writer, atomic

Many sessions write to the store at once, so the store is shaped to make **lost updates
impossible** (`../what/01-principles.md` §17), in this order of preference:

1. **Derive, don't store, shared roll-ups.** A containing scope's status is computed from its
   children's records, not kept as a field every child rewrites (`../what/02-domain-model.md`).
   This removes most contention before it can happen.
2. **Append over rewrite.** Where many writers touch one scope, each **appends its own entry**
   (the session log is the model) rather than editing a shared field. Appends do not collide
   the way rewrites do.
3. **One owner per mutable document.** A mutable record (a task record, say) has a single
   writer — its owning scope; others **read** it or **request** a change through the messaging
   seam (`messaging-dispatch-wake.md`), they do not write it. This generalizes the artifact
   ownership rule ("a task must not alter another task's artifact").
4. **Serialize the unavoidable shared writes.** For the few genuinely shared records, a write
   is **atomic and loss-free** — write-to-temp + atomic rename, or compare-and-set on a version
   stamp — so concurrent writers cannot interleave into a corrupt or clobbered state.

**Why structural first, locks last.** Each layer removes a class of contention so the next has
less to do; by the time you reach step 4 the shared-write set is tiny. A store that leaned on
coarse locking instead would serialize work that never actually conflicts and still lose
updates wherever someone forgot the lock.

## Guardrails — what this is, and what it is not

- **Is:** a transparent, human-readable, git-versionable store whose structure mirrors the
  domain model, with typed+validated documents and stored provenance.
- **Is not:** a mandate that the store *always* be the filesystem. If it is ever swapped for a
  database, what must be preserved is the metadata-store **contract**
  (`../what/07-subsystem-seams.md`) — deterministic reads, durable writes, identity
  resolution, enumeration, append-only logs, provenance — **not** these directory conventions.
- **Is not:** a requirement to use TypeScript or Zod specifically. What must survive is that
  document types are **strongly typed and runtime-validated**, by whatever language realizes
  them.
- **Is not:** permission to put human-only prose where a schema field belongs, or
  machine-critical state in unvalidated free text.
- **Is not:** a requirement for a transactional database. Safety comes from the
  append/single-writer/atomic-write discipline above, not from ACID. If filesystem concurrency
  ever proves painful, a transactional store is the escape hatch — but it must preserve the
  same **no-lost-updates** contract, not relax it.

## For the implementation plan — where to fill in the blanks

Within the guardrails above, the implementer decides: the exact directory paths and naming;
the precise front-matter fields per document type and the full type list; the schema library
and version; serialization details; the **concurrency primitive** for the serialized shared
writes (advisory lock, atomic rename, or compare-and-set); and the `.gitignore` policy for
which artifacts are tracked vs. regenerated. These are the focus areas; this doc fixes the
constraints, not the answers.
