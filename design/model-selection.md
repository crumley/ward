# Design: Model Selection

> **Layer:** design — implementation plan. The _how_; may change. **Status:** draft.

The build behind the model-selection seam — the config shape and the concrete tiers.

## Serves intent

- [`../intent/02-subsystems/04-model-selection.md`](../intent/02-subsystems/04-model-selection.md) —
  a per-scope override hierarchy whose defaults follow the persona's job; ids as configuration.

## Plan (draft)

- **Configuration shape** for defaults and overrides, and how an override at one scope is recorded
  and resolved against broader defaults (narrower wins).
- **Initial persona → tier mapping** and the **concrete model ids** behind "fast" and "deep."
  _Bound:_ a default the workspace can change and reflection can tune; no concept names a model.
- **Thinking depth** — how it is expressed and passed through to the harness
  ([`agent-harness.md`](agent-harness.md)).
