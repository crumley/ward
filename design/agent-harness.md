# Design: Agent Harness

> **Layer:** design — implementation plan. The *how*; may change. **Status:** draft.

The build behind the harness seam — the adapter interface and per-harness specifics.

## Serves intent

- [`../intent/02-subsystems/03-agent-harness.md`](../intent/02-subsystems/03-agent-harness.md) —
  a thin adapter (start / handle / resume / locate, optional fork) honoring an externally-chosen
  model.

## Plan (draft)

- **The adapter interface** — the exact `start / expose-handle / resume / locate-history` surface,
  plus optional `fork`.
- **Per-harness handle format and history location** — and how start/resume are invoked per
  harness. *Bound:* the handle is recorded and resolvable back to the run.
- **Fork capability** — how it is detected and exercised for exact-clone forks. *Bound:* the
  harness-neutral distilled-brief fork never depends on it; an exact-clone fork is a new session
  with its own identity and handle.
- **Default harness and per-scope override** mechanism.
