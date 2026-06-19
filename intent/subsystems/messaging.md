# Subsystem: Inter-scope Messaging & Coordination

> **Layer:** intent · subsystem (seam). The constraints any design must honor; names no tool.
> **Design:** `../../design/subsystems/messaging.md`. **Status:** placeholder skeleton.

## Responsibility

Realize the **dispatch / report / wake** flows (defined as concepts in `concepts/roles.md`) —
delivering work and context downward, status upward, and notifications on conditions — across
sessions that may be paused and resumed.

## Constraints any design must honor

- Deliver a message or dispatched unit of work to a target **identity**, and let the target read
  what was sent to it; the sender needs the target _open_, not _running_.
- Let a scope report status upward to its container.
- Let a scope **wait** on a condition or **detach and be woken** when it is met, addressed by
  identity so it survives pause/resume.
- **Recorded over live** — the act of sending is recorded; live delivery (where the target is
  running) is an optimization, the record is the truth.
- **Idempotent** where it touches lifecycle — a duplicate wake must not double-act; a wake whose
  condition is already satisfied fires once and resolves.
- **Re-armed on recovery** — a wake recorded before a reboot is re-established at cold start.

## What this is NOT

- Not a general-purpose message bus with broadcast/topics/global ordering — only the
  dispatch/report/wake flows the model needs.
- Not a held-process wait — anything that cannot survive a reboot is the wrong realization.

## Canonical home for

The coordination **contract** and its idempotency/recovery constraints. The _flows themselves_ are
defined in `concepts/roles.md`; this owns their delivery guarantees.

## Open questions

- **Messaging vs. multiplexer overlap** — the split between live delivery and the record (shared
  with `multiplexer.md`).
- **Wake across a reboot** — how the condition is expressed and re-armed during recovery.
