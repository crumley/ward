# 0005 — Store realization stack: YAML front matter, zod, system git, atomic renames

> **Status:** accepted · **Date:** 2026-08-02

One consolidated ADR for the entangled choices that realize the metadata store
([`intent/02-subsystems/00-metadata-store.md`](../../intent/02-subsystems/00-metadata-store.md)) in
[`0002-store-and-workspace/`](../0002-store-and-workspace/README.md): the document format, the
schema validator, the YAML engine, how git is driven, and how writes stay atomic. They are decided
together because they trade off against each other — a format choice constrains the parser, the
parser constrains validation, and all of them answer to the same contract clause: machinery **sized
to its real load** (one human, sequential CLI invocations — not a database workload).

## Context

The store contract fixes the shape — a filesystem of markdown documents with **typed,
runtime-validated front matter**, deterministic reads, no torn reads, no resident process — and
leaves the technique open. This ADR picks the technique for the first build. The choices must keep
documents legible to both audiences (a human browsing the workspace, an agent parsing it) and keep
the dependency footprint small enough that nothing here becomes a platform commitment.

## Options considered

**Document format** — how typed data and prose share a file:

- **YAML front matter + markdown body** — the prevailing convention (static-site generators,
  Obsidian, Jekyll); YAML is the most human-writable of the candidates for nested data.
- **JSON front matter** — trivially parseable, but hostile to hand-editing (quoting, commas) — and
  the store's documents are explicitly meant to be read and edited by humans.
- **TOML front matter** — pleasant for flat config, awkward for nested lists (the catalog's type
  list); far rarer as front matter, so both audiences would meet an unfamiliar convention.

**Schema validation:**

- **zod** — the de-facto standard TypeScript validator; schema-first with inferred static types, so
  the record type and its runtime validation cannot drift apart; huge ecosystem familiarity.
- **valibot / arktype** — smaller or faster, but younger APIs and less familiarity; nothing in the
  store's load justifies trading familiarity for micro-optimization.
- **Hand-rolled validators** — no dependency, but every record type would re-implement error
  reporting, and validation quality would erode exactly where the contract demands it.

**YAML engine:**

- **`Bun.YAML`** (built in) — parse and stringify with no dependency; block-style output via
  `stringify(value, null, 2)`. The runtime is already pinned by ADR 0001, so this adds nothing.
- **`yaml` npm package** — more knobs (comments, custom tags), none of which the records need.
- **`gray-matter`** — bundles front-matter splitting, but the split is a five-line regex; the
  dependency would outweigh its job.

**Git operations:**

- **Shell out to system git** — the workspace's own tracking (§15) is plumbing: init, add, commit,
  rev-parse. The system git is already a required machine precondition
  ([`intent/01-concepts/06-workspace-lifecycle.md`](../../intent/01-concepts/06-workspace-lifecycle.md)),
  battle-tested, and identical to what the human runs by hand.
- **isomorphic-git / libgit2 bindings** — a heavy dependency to avoid spawning a binary that is
  guaranteed present, with subtle behavioral drift from the git the human uses.

**Atomic writes:**

- **Stage in `.ward/tmp/` + `rename()`** — rename within one filesystem is atomic on POSIX; readers
  (human, agent, git) see the old document or the new, never a partial one. Staging inside `.ward/`
  keeps debris out of the record and under the ignore policy if a crash strands a temp file.
- **Direct `write()`** — simplest, but a crash mid-write leaves a torn document, which the store
  contract explicitly forbids.
- **`write-file-atomic`** (npm) — solves the same problem with a dependency; the two-line version
  needs no library.

## Decision

YAML front matter + markdown body, parsed and serialized by **`Bun.YAML`**; schemas defined and
validated with **zod** (v4), one schema per document type, static types inferred from them; git
driven by **shelling out to the system `git`**; writes staged in **`.ward/tmp/` and renamed into
place**.

## Why

Every choice is the smallest technique that satisfies its contract clause. YAML front matter is what
both audiences already know how to read and write — legibility is the store's stated reason for
being a filesystem at all. zod is the one dependency added, and it pays for itself by making "the
type and its validation agree" structural rather than disciplined. `Bun.YAML` and system git add
zero dependencies by leaning on platform already pinned elsewhere (ADRs 0001, and git as a machine
precondition). The rename dance is the classic no-torn-reads answer, sized exactly to the store's
few, brief writes — no locks yet, because a single human driving a sequential CLI generates no
contention; the serialization primitive the contract reserves for identity allocation arrives with
the entry that allocates identities (0004).

## Consequences

- Records are diffable, hand-editable, and self-describing; a corrupted record fails validation with
  a message naming the file and field, which is what `doctor` reports.
- zod is a real dependency in the record path; swapping it later means touching every schema, so it
  is the one choice here with switching cost. Accepted: it is also the ecosystem's most durable
  choice.
- `Bun.YAML.stringify` output is the fixed serialization; if its formatting ever changes across Bun
  versions, byte-determinism tests will catch it and pin the response.
- Shelling out means git behavior follows the machine's git version — the same coupling the human
  already lives with, and `doctor` reports the version.
- No locking exists yet by design; the contract's contention clauses (legible, fail-safe,
  no-resident-process) bind the 0004 entry that first needs serialized writes.
