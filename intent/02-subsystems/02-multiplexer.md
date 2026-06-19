# Subsystem: Session Multiplexer

> **Layer:** intent · subsystem (seam). The constraints any design must honor; names no tool.
> **Design:** `../../design/02-subsystems/02-multiplexer.md`. **Status:** placeholder skeleton.

## Responsibility

Host live agent sessions so they can be started, attached to, observed, detached from, and resumed —
by both humans and agents — and survive a human walking away.

## Constraints any design must honor

- Start a session for a given scope/identity and keep it alive when detached.
- Let a human or agent (re-)attach to a session, and observe read-only.
- Map a recorded session reference back to a live session for resume (the recorded↔live mapping).
- Support visual grouping/identification of sessions (see `07-theming.md`).
- Live process state is a **cache over the record**, never the source of truth (`01-principles.md`
  §16).

## What this is NOT

- Not a specific multiplexer; the grouping strategy and the multiplexer itself may change. Nothing
  in the concepts assumes a particular one.

## Canonical home for

The multiplexer contract (host/attach/observe/resume mapping). The chosen multiplexer and grouping
scheme are design.

## Open questions

- **Messaging vs. multiplexer overlap** — how much of dispatch/wake rides on the multiplexer vs. the
  store (shared with `03-messaging.md`).
