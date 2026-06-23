# Design: Remote Work-Item Provider & the Privacy Gate

> **Layer:** design — implementation plan. The _how_; may change. **Status:** draft.

The build behind the remote seam. **The privacy-translation gate is the highest-stakes blank —
design it first.**

## Serves intent

- [`../intent/02-subsystems/06-remote-provider.md`](../intent/02-subsystems/06-remote-provider.md) —
  a thin, replaceable forge adapter fed only sanitized content, with outward posts gated and the
  translation enforced upstream at a single point.

## Plan (draft)

- **The forge and adapter API.** Working assumption: a **hosted git forge** (issues + pull requests)
  behind a thin adapter that links a task, carries status both ways, and reports PR state. _Bound:_
  the task model assumes no specific forge.
- **The privacy-translation gate (settle-early).** What the outward re-authoring concretely **strips
  and rewrites** (local paths, private notes, provenance, persona names) and **the single upstream
  place it runs** — covering _both_ remote comment text and artifacts committed into a worktree.
  _Bound:_ enforced upstream of the adapter, strictly outward; the adapter never decides what is
  safe.
- **Attach/merge reconciliation** — how a task records its remote link and reconciles attaching to
  or merging with a duplicate.
- **PR + CI/checks status polling** and **how gated outward posts request authority** (§18).
