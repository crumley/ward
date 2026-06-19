# Design: Visual Theming

> **Layer:** design — one realization. Names tools/structures; may change. **Status:** placeholder —
> to be filled during implementation.

## Governed by

`../../intent/02-subsystems/07-theming.md` — deterministic, collision-free visual identity,
coordinated across surfaces, applied via idempotent hooks.

## Realization (to fill)

- The **accent-color palette** and the **deterministic assignment function** (and its collision
  scope).
- Which **surfaces** are themed (multiplexer status/borders, editor window, others).
- The exact **setup/teardown hook steps** that apply/remove a theme (shared with
  `../01-concepts/01-delivery.md`, hooks).

## Blanks to settle

- See `../blanks-register.md` (palette; assignment function; themed surfaces; hook steps).
