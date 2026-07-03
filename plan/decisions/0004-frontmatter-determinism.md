# 0004 — Front matter: YAML, canonically serialized for determinism

> **Status:** accepted · **Date:** 2026-07-03

## Context

The store is **a filesystem of Markdown files with typed front matter**, git-versioned and legible
to both audiences ([`metadata-store`](../../intent/02-subsystems/00-metadata-store.md)). Two forces
bite: **deterministic reads/writes** (§6) and **token-cache-friendly, append-biased context** (§12,
[`context-loading`](../../intent/01-concepts/05-context-loading.md)). If writing the same logical
document twice produces different bytes (reordered keys, reflowed strings), every write churns the
git diff and can invalidate a cache prefix — the opposite of what §12 wants.

## Options considered

- **YAML front matter, serialized canonically** (stable key order, fixed string style, trailing
  newline) behind a single writer. Human-friendly, the de-facto front-matter format, diffs cleanly.
  Cost: YAML has sharp edges (the "Norway problem", ambiguous scalars) that must be pinned by
  convention and guarded by the schema.
- **TOML front matter.** Less ambiguous scalars. Cost: unconventional as Markdown front matter,
  weaker tooling, and still needs canonicalization for determinism — no net win.
- **JSON front matter.** Trivially canonical. Cost: hostile to the human audience (no comments,
  noisy quoting) — it fails the "legible to a human reading the file" half of the seam.

## Decision

**YAML front matter**, emitted through **one canonical serializer** (the sole writer of front
matter): sorted keys, a fixed scalar/quoting style, normalized line endings, terminal newline.
Reading is tolerant; writing is canonical. Zod ([0003](0003-zod-schemas.md)) validates the parsed
object, closing YAML's ambiguous-scalar edges before any code trusts a value.

## Why

Canonical bytes make writes **idempotent at the file level** — re-writing an unchanged document is a
no-op diff — which is what lets append-over-rewrite (§12) and no-lost-updates (§17) hold in a plain
git working tree without a database. Determinism here is not tidiness; it is the concrete mechanism
behind two principles.

## Consequences

- **Easy:** clean git diffs; stable cacheable prefixes; front-matter writes that never spuriously
  churn; one obvious place (the canonical writer) to reason about serialization.
- **Hard / committed:** all front-matter writes must go through the one serializer — no ad-hoc
  `stringify` elsewhere; YAML's ambiguous scalars must be pinned by the schema.
- **Reversible?** The determinism _requirement_ is the seam's; the format (YAML) is swappable behind
  the same single-writer boundary.
