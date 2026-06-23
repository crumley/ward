# Design: Context Loading

> **Layer:** design — implementation plan. The *how*; may change. **Status:** draft.

The build behind context assembly — the ordering algorithm and field conventions the intent
deliberately left open.

## Serves intent

- [`../intent/01-concepts/05-context-loading.md`](../intent/01-concepts/05-context-loading.md) —
  harness-neutral `AGENTS.md` hierarchy, deterministic/append-biased prefix, harness handle per
  session.

## Plan (draft)

- **`AGENTS.md` field conventions** — the manifest fields each level declares (artifacts, skills,
  records to load) and how skills are referenced and resolved.
- **The deterministic ordering algorithm** for the cacheable prefix, and **where the mutable tail
  begins**. *Bound:* identical prefix for sessions at the same scope, to share token caches; the
  evolving/rewritable tail is kept off the cacheable prefix (the open append-vs-rewrite tension).
- **Per-harness handle formats and history locations**, and any caching configuration. *Bound:*
  the handle stays recorded and resolvable back to the underlying run.
