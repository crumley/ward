# Design: Messaging, Dispatch & Wake

> **Layer:** design — implementation plan. The *how*; may change. **Status:** draft.

The build behind the messaging seam — record formats and the re-arm-on-recovery mechanism.

## Serves intent

- [`../intent/02-subsystems/02-messaging-coordination.md`](../intent/02-subsystems/02-messaging-coordination.md)
  — identity-addressed, recorded-first, idempotent, re-armed-on-recovery dispatch/report/wake.

## Plan (draft)

- **Message/dispatch record format** and where it sits relative to the session log.
- **Wake condition expression and evaluation** — how "wake me when X" is written and checked.
- **The multiplexer-vs-store split** — what rides on live multiplexer delivery (running target)
  vs. what waits in the record (not-running target). *Bound:* a not-running target is fully served
  from the record; nothing essential lives only live.
- **Re-arm on recovery** — the concrete mechanism that, on cold start, re-arms still-unmet
  conditions and fires (once) any satisfied while the machine was down. *Bound:* idempotent — no
  double-acting.
