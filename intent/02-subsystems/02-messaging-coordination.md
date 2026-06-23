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
- **Route through the originating scope's status persona when the sender does not know the
  target.** A session knows its own neighbors, not the whole workspace — it cannot be expected to
  know what other sessions exist or which one should receive a message. So delivery can be
  addressed **by intent to the status persona of the scope the message originates at** — the
  **charge nurse** for work inside a project, the **house supervisor** for work that crosses the
  workspace — which resolves it to the right target and dispatches it
  ([`../01-concepts/01-scopes-and-personas.md`](../01-concepts/01-scopes-and-personas.md),
  *Routing resolves to a session*). Direct identity-addressing (above) holds when the sender
  already knows the target; routing through the status persona is the path when it does not.
  *Why:* routing knowledge lives with the status personas **by design**; forcing every session to
  carry workspace-wide awareness of who-is-where would defeat the context discipline the whole
  model exists for.
- Let a scope **report status upward** to its container.
- Let a scope **wait on a condition** (e.g. another scope finishing) or **detach and be woken**
  when it is met — addressed by identity so it survives pause/resume.
- **Recorded-first.** The act of sending, and every wake condition, is **recorded in the store**,
  not held only in a live process (§16). Live multiplexer delivery is an *optimization* for the
  running case; a not-running target is served entirely from the record. *Why:* a held, blocked
  process does not survive a reboot — exactly when the delegate-and-return pattern is needed most.
- **Observable and inspectable at any time — by both the human and an agent.** Because every send
  and every wake condition is recorded (above), the message flow is **legible**: who sent what, to
  whom, when, and whether it was delivered or is still pending. At any moment a human or an agent
  can ask "what messages have crossed, from where, to where, and what is still outstanding?" and
  get a straight answer. *Why:* coordination the human cannot see is coordination the human cannot
  trust, debug, or take over; inspectability is what keeps dispatch/report/wake an accountable
  system rather than a black box — the deterministic-inspection principle
  ([`../00-foundation/01-principles.md`](../00-foundation/01-principles.md)) applied to messaging.
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
- **Routing through the originating scope's status persona** when the sender does not know the
  target (the *capability*; the resolution-to-a-session concept it leans on lives in
  [`../01-concepts/01-scopes-and-personas.md`](../01-concepts/01-scopes-and-personas.md)).
- **Observability of the message flow** — that the whole of dispatch/report/wake is inspectable by
  human and agent at any time (built on recorded-first; the principle is
  [`../00-foundation/01-principles.md`](../00-foundation/01-principles.md)).

## Left to implementation

- The message/dispatch record format and where it sits relative to the session log; how a wake
  **condition** is expressed and evaluated; the split of responsibility between multiplexer and
  store for running vs. not-running; the concrete **re-arm-on-recovery** mechanism; **how a status
  persona resolves an intent-addressed message to a target** (CLI resolving identity→session
  handle, or an agent dispatch); and the **inspection surface** — how the recorded flow is exposed
  to a human and an agent (a CLI view, a log). Planned in
  [`../../design/messaging-dispatch-wake.md`](../../design/messaging-dispatch-wake.md).

## Open questions

- **Multiplexer-vs-store split** — drawn provisionally; revisit with real usage (with
  [`01-session-multiplexer.md`](01-session-multiplexer.md)).
- **Wake across a reboot** — the exact re-arm path (with
  [`../01-concepts/02-sessions-and-lifecycle.md`](../01-concepts/02-sessions-and-lifecycle.md)).
- **Routing-path mechanics.** *Settled:* **both** paths hold — **direct** identity-addressing when
  the sender knows the target, and **routing through the originating scope's status persona**
  (charge nurse / supervisor) when it does not (a constraint, above). *Open:* the **mechanism** —
  how a sender expresses "route this for me," how the persona resolves it (CLI resolving
  identity→session handle vs. an agent dispatch), and whether the supervisor handles only
  cross-project routing or also intra-project on request.
