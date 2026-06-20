# Subsystem: Inter-Scope Messaging & Coordination

> **Layer:** intent · subsystem (seam). The contract any design must honor; the *how* is planned in [`../../design/`](../../design/). **Status:** living.

## Responsibility

Realize the **dispatch (down) / report (up) / wake (notify)** flows
([`../01-concepts/00-domain-model.md`](../01-concepts/00-domain-model.md),
[`../01-concepts/01-scopes-and-personas.md`](../01-concepts/01-scopes-and-personas.md)) — delivering
work and context downward, status upward, and notifications on conditions — across sessions that
may be paused and resumed. Ward is deliberately **opinionated** here because an unprincipled
realization would leak live, unrecoverable state.

## Constraints any design must honor

- **Deliver** a message or dispatched unit of work to a target **identity** (a room, a task, a
  session), and let the target read what was sent. *Why:* identity-addressing means the sender
  needs the target only *open*, not *running*.
- Let a scope **report status upward** to its container.
- Let a scope **wait on a condition** (e.g. another scope finishing) or **detach and be woken**
  when it is met — addressed by identity so it survives pause/resume.
- **Recorded-first.** The act of sending, and every wake condition, is **recorded in the store**,
  not held only in a live process (§16). Live multiplexer delivery is an *optimization* for the
  running case; a not-running target is served entirely from the record. *Why:* a held, blocked
  process does not survive a reboot — exactly when the delegate-and-return pattern is needed most.
- **Idempotent where it touches lifecycle.** A duplicate wake must not double-act; a condition
  already satisfied fires **once** and resolves.
- **Wake conditions are re-armed during recovery.** After a cold start, a still-unmet condition
  is re-armed and one satisfied while the machine was down fires once. *Why this is the crux:*
  the whole system exists for the reboot-with-threads-in-flight scenario; a wake that lived only
  in a running process would silently vanish.

## What this is NOT

- **Not a general-purpose message bus or queue** with broadcast, topics, or guaranteed ordering
  across unrelated scopes — only the dispatch/report/wake flows the model needs.
- **Not a mandate that delivery always go through the multiplexer** — a not-running target is
  served from the record.
- **Not a held-process wait.** Anything that cannot survive a reboot is the wrong realization.

## Canonical home for

- The **dispatch / report / wake contract**, and its defining discipline: identity-addressed,
  recorded-first, idempotent, re-armed-on-recovery.

## Left to implementation

- The message/dispatch record format and where it sits relative to the session log; how a wake
  **condition** is expressed and evaluated; the split of responsibility between multiplexer and
  store for running vs. not-running; the concrete **re-arm-on-recovery** mechanism. Planned in
  [`../../design/messaging-dispatch-wake.md`](../../design/messaging-dispatch-wake.md).

## Open questions

- **Multiplexer-vs-store split** — drawn provisionally; revisit with real usage (with
  [`01-session-multiplexer.md`](01-session-multiplexer.md)).
- **Wake across a reboot** — the exact re-arm path (with
  [`../01-concepts/02-sessions-and-lifecycle.md`](../01-concepts/02-sessions-and-lifecycle.md)).
