# Design: Visual Theming

> **Layer:** design — implementation plan. The _how_; may change. **Status:** draft.

The build behind the theming seam — the palette, the glyph set, the assignment function, and the
surfaces.

## Serves intent

- [`../intent/02-subsystems/05-visual-theming.md`](../intent/02-subsystems/05-visual-theming.md) — a
  per-work visual identity (per-instance accent + per-type glyph), recorded as a nameable attribute
  legible to human and agent, applied via idempotent hooks across every surface.

## Plan (draft)

- **The palette and the deterministic assignment function** that maps a work's identity to an
  accent, and its **collision-avoidance scope** (among what is visible together). _Bound:_ same work
  → same accent across reboots; no collision among concurrent work.
- **The glyph/emoji set, keyed by concept type** — project, task, the session-grouping around a
  task, room/session. _Bound:_ categorical (shared by all things of a type), so unlike the accent it
  carries no collision constraint; it answers "what kind," the accent answers "which one."
- **The recorded, nameable mapping and reference-resolution** — how accent + glyph are stored on the
  work's identity and exposed in words ("blue," "the project"), and how an agent **resolves a
  human's visual reference** ("the blue one") back to the identity, including disambiguation when a
  color recurs outside the visible set (the seam's open question). _Bound:_ the cue is local —
  resolution never causes it to cross the privacy boundary into a remote artifact.
- **Which surfaces are themed and how each is driven** — multiplexer status/borders
  ([`session-multiplexer.md`](session-multiplexer.md)), editor windows, others.
- **The exact setup/teardown hook steps** ([`lifecycle-hooks.md`](lifecycle-hooks.md)) and how the
  accent **and glyph** are recorded so they stay stable across resumes.
