# Design: Agent Harness

> **Layer:** design — one realization. Names tools/structures; may change. **Status:** placeholder —
> to be filled during implementation.

## Governed by

`../../intent/subsystems/harness.md` — run an agent, expose a resolvable handle, per-scope
selectable, optionally fork; harness-/model-agnostic.

## Realization (to fill)

- **Pluggable harness behind a thin adapter** — default per workspace, overridable per scope; new
  harnesses added without disturbing the role/session models.
- The **adapter interface**.
- The **per-harness handle format** and history location (shared with `../concepts/sessions.md`).
- **Fork/branch** support where available, and how exact-clone interacts with identity + handle.

## Blanks to settle

- See `../blanks-register.md` (adapter interface; handle format/location; fork mode first).
