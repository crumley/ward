# Design: Session Multiplexer

> **Layer:** design — implementation plan. The *how*; may change. **Status:** draft.

The build behind the multiplexer seam — which host runs live sessions, and how it maps to the
record.

## Serves intent

- [`../intent/02-subsystems/01-session-multiplexer.md`](../intent/02-subsystems/01-session-multiplexer.md)
  — start, keep-alive-when-detached, re-attach, observe read-only, map recorded ↔ live; cache over
  the record.

## Plan (draft)

- **The specific multiplexer.** Working assumption: a **terminal multiplexer** (attach/detach,
  persistence across disconnects, a themeable status surface). *Bound:* the contract holds; the
  tool may change.
- **Window/pane grouping and naming** — grouped by scope (project/task/room), labeled by identity
  (floor/room codes).
- **The recorded ↔ live mapping** — how a recorded session (identity + harness handle) is mapped
  to a live pane and re-created on resume.
- **Read-only observation** — how an observer attaches without taking the session.
- **Theming the surface** — driven by [`theming.md`](theming.md).
