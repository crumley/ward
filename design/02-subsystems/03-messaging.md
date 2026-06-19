# Design: Inter-scope Messaging & Coordination

> **Layer:** design — one realization. Names tools/structures; may change. **Status:** placeholder —
> to be filled during implementation.

## Governed by

`../../intent/02-subsystems/03-messaging.md` — identity-addressed, recorded-over-live, idempotent
dispatch/report/wake, re-armed on recovery.

## Realization (to fill)

- The **message/dispatch record format** and where it sits relative to the session log.
- How a **wake condition** is expressed and evaluated.
- The **split of responsibility** between multiplexer (live delivery when running) and store
  (durable backstop when not running).
- The concrete **re-arm-on-recovery** mechanism (the _what_ is fixed in intent).

## Blanks to settle

- See `../blanks-register.md` (record format; wake-condition expression; multiplexer-vs-store split;
  re-arm mechanism).
