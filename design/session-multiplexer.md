# Design: Session Multiplexer

> **Serves intent:** [session-multiplexer seam](../intent/02-subsystems/01-session-multiplexer.md);
> [§16](../intent/00-foundation/01-principles.md) (live state is a cache over the record).

## v1 status: deferred (the record is proven authoritative)

The multiplexer hosts **live** sessions (start, attach, detach, observe, re-attach). v1 deliberately
**does not** wire a real multiplexer (e.g. tmux); instead it proves the seam's _defining_ constraint
— **the live host is a cache over the record, never the source of truth**:

- Every session is recorded as append-only events in the store; its open/closed state is
  **derived**, not held in a pane (`store/log.ts`, `domain/session.ts`).
- The stub harness mints a **resolvable handle** and a native-history file (`seams/harness.ts`); a
  recorded handle is all that is needed to re-attach.
- **Recovery rebuilds the live state from the record** (`domain/recovery.ts`, proven by
  `test/intent/recovery.test.ts` and the acceptance walkthrough §10): open threads are re-attached
  via their handles, and closed ones are left alone. If every pane vanished on reboot, the record
  would still hold every open thread — exactly the seam's requirement.

## The realization when built

A real multiplexer (tmux is the working assumption) maps a recorded session reference (identity +
handle) to a live pane: `start` a pane keep-alive-when-detached, `(re-)attach`, `observe read-only`,
and **group panes by scope / label by identity** (the floor/room codes), themed via the coordinated
accent+glyph that are already recorded (`seams/theming.ts`). For the **human**, routing to a session
hands over the attach command (scopes-and-personas: routing resolves to a session); live message
delivery may ride on the multiplexer as an optimization over the recorded flow
(`messaging-dispatch-wake.md`).

## Open / deferred

- The specific multiplexer and the exact grouping/window/pane layout; how a recorded session maps to
  and from a live pane; read-only observation; how the surface consumes `.ward-theme.json`.
- Multiplexer-vs-store split for live message delivery
  ([seam open question](../intent/02-subsystems/01-session-multiplexer.md)).
