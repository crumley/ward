# Design: Session Multiplexer

> **Layer:** design — one realization. Names tools/structures; may change. **Status:** placeholder —
> to be filled during implementation.

## Governed by

`../../intent/subsystems/multiplexer.md` — host/attach/observe/resume, the recorded↔live mapping,
live-as-cache-over-record.

## Realization (to fill)

- A **terminal multiplexer** as the starting point: attach/detach, persistence across disconnects,
  themeable status surfaces.
- The **window/pane grouping** strategy and labeling.
- The concrete **recorded↔live mapping** (how a recorded session reference resolves to a live
  pane/window).

## Blanks to settle

- See `../blanks-register.md` (the specific multiplexer; grouping; recorded↔live mapping).
