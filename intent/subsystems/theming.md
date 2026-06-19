# Subsystem: Visual Theming / Identity Coordination

> **Layer:** intent · subsystem (seam). The constraints any design must honor; names no tool.
> **Design:** `../../design/subsystems/theming.md`. **Status:** placeholder skeleton.

## Responsibility

Give each unit of work a consistent visual identity so a human can tell at a glance which task/room
a window belongs to — coordinated across _all_ surfaces.

## Constraints any design must honor

- Assign a stable, distinguishable visual identity **deterministically and without collisions**.
- Apply it **consistently across every surface** the human interacts with for that work (the
  multiplexer's status/borders, an editor window, any other window).
- Applied via the **idempotent setup hooks** (`concepts/delivery.md`), so re-applying converges.

## What this is NOT

- Not a specific palette or assignment function — those are design.

## Canonical home for

The visual-identity contract (deterministic, collision-free, coordinated across surfaces).

## Open questions

- The palette, assignment function, and themed-surface set are design decisions.
