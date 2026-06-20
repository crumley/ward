# Design: Visual Theming

> **Layer:** design — implementation plan. The *how*; may change. **Status:** draft.

The build behind the theming seam — the palette, the assignment function, and the surfaces.

## Serves intent

- [`../intent/02-subsystems/05-visual-theming.md`](../intent/02-subsystems/05-visual-theming.md) —
  a deterministic, collision-free, per-work visual identity applied via idempotent hooks across
  every surface.

## Plan (draft)

- **The palette and the deterministic assignment function** that maps a work's identity to an
  accent, and its **collision-avoidance scope** (among what is visible together). *Bound:* same
  work → same accent across reboots; no collision among concurrent work.
- **Which surfaces are themed and how each is driven** — multiplexer status/borders
  ([`session-multiplexer.md`](session-multiplexer.md)), editor windows, others.
- **The exact setup/teardown hook steps** ([`lifecycle-hooks.md`](lifecycle-hooks.md)) and how the
  accent is recorded so it stays stable across resumes.
