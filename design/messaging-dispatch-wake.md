# Design: Messaging, Dispatch & Wake

> **Layer:** design — implementation plan. The *how*; may change. **Status:** draft.

The build behind the messaging seam — record formats and the re-arm-on-recovery mechanism.

## Serves intent

- [`../intent/02-subsystems/02-messaging-coordination.md`](../intent/02-subsystems/02-messaging-coordination.md)
  — identity-addressed, recorded-first, idempotent, re-armed-on-recovery dispatch/report/wake.

## Plan (draft)

- **Message/dispatch record format** and where it sits relative to the session log.
- **Intent-addressed routing resolution** — when a message is addressed *by intent* to a scope's
  status persona (sender doesn't know the target), how the **charge nurse / house supervisor**
  resolves it to a concrete target: CLI resolving an identity to a session handle, or an agent
  dispatch. Includes how the sender expresses "route this for me," and the supervisor's span
  (cross-project only, or intra-project on request). *Bound:* direct identity-addressing must stay
  available for senders that already know the target — routing-through-a-persona is the fallback,
  not a mandatory hop.
- **The inspection surface** — how the recorded flow is exposed so a human *and* an agent can see,
  at any time, what messages crossed (source, destination, time, delivered/pending). A CLI view
  and/or a queryable log over the message records. *Bound:* reads from the record, adds no
  authoritative state of its own.
- **Wake condition expression and evaluation** — how "wake me when X" is written and checked.
- **The multiplexer-vs-store split** — what rides on live multiplexer delivery (running target)
  vs. what waits in the record (not-running target). *Bound:* a not-running target is fully served
  from the record; nothing essential lives only live.
- **Re-arm on recovery** — the concrete mechanism that, on cold start, re-arms still-unmet
  conditions and fires (once) any satisfied while the machine was down. *Bound:* idempotent — no
  double-acting.
