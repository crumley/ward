# 0004 — Front matter: YAML via `yaml`, serialized deterministically

> **Status:** accepted · **Date:** 2026-06-22

## Context

The store is "a filesystem of **markdown files with typed front matter**"
([metadata-store](../../intent/02-subsystems/00-metadata-store.md)). Two intent constraints bear
directly on _how_ we serialize that front matter:

- **Deterministic reads** ([§6](../../intent/00-foundation/01-principles.md)): "the state of X
  returns the same answer for the same state." If serializing the _same_ record produced different
  bytes (key order, quoting), diffs would be noisy and git history misleading.
- **Token economy / cache sharing** ([§12](../../intent/00-foundation/01-principles.md),
  [context-loading](../../intent/01-concepts/05-context-loading.md)): context is built from "stable
  artifacts in a deterministic order" so sessions share token caches. Churn in serialization defeats
  that.

So serialization must be **canonical**: the same logical record always yields byte-identical output,
and small logical changes yield small diffs.

## Options considered

- **`gray-matter`.** The popular front-matter parser. Tradeoff: it delegates stringification to
  `js-yaml` with little control over key ordering and quoting, and round-trips can reorder or
  restyle — directly at odds with the determinism requirement. Good parser, weak _canonical writer_.
- **`js-yaml`.** Mature, but its dump options give limited canonical-output guarantees and the
  project is in maintenance mode.
- **`yaml` (eemeli/yaml).** Actively maintained, spec-compliant, exposes a Document API and
  `stringify` options (`sortMapEntries`, explicit quoting/flow control). Lets us impose a **fixed
  field order** and stable scalar styling. Tradeoff: we write a thin wrapper to enforce our
  canonical form (a few dozen lines) rather than getting it for free.
- **Hand-rolled key=value front matter.** Zero deps, fully controlled. Tradeoff: re-implements YAML
  badly the moment a value is a list or nested object (provenance, repos, success criteria are
  structured), and breaks the "legible to both audiences" promise the moment it diverges from a
  format humans recognize.

## Decision

Use the **`yaml`** package, wrapped in a small `store/frontmatter` module that enforces a
**canonical serialization**: a defined top-of-document field order (`type`, `schemaVersion`,
identity, then the rest sorted), stable scalar styling, and a trailing-newline-normalized body.
Parse splits the `---` fenced front matter from the markdown body; serialize re-emits canonically.
Field _values_ are validated by Zod ([0003](0003-zod-schemas.md)); this module owns only
_byte-canonicality_.

## Why

- A canonical writer is the concrete mechanism behind two durable principles at once: deterministic
  inspection (§6) and cacheable, append-biased context (§12). Neither is achievable if "write the
  same record twice" can produce two different files.
- Putting canonicality in **one wrapper module** (not scattered at call sites) means every document
  Ward writes — across every seam — is automatically diff-stable and cache-friendly, and a future
  store swap re-points one module.
- Choosing a structured YAML library over hand-rolled key=value keeps the front matter **legible to
  both audiences** and able to hold the structured provenance/lists the domain model requires,
  without us babysitting an ad-hoc format.

## Consequences

- **Easy:** clean git diffs; stable token-cache prefixes; structured front matter (lists, nested
  provenance) for free; one place to evolve the canonical form.
- **Hard / committed-to:** we own the canonical-form rules (field order, quoting) and must keep the
  wrapper the _only_ writer of front matter, or determinism leaks. A trailing-newline / ordering bug
  shows up as workspace-wide diff churn, so the wrapper is itself worth an intent test.
- **Reversibility:** high. The `yaml` dependency hides behind `store/frontmatter`; swapping it
  leaves call sites and on-disk files untouched as long as the canonical form is preserved.
