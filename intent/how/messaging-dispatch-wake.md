# How-Intent: Messaging, Dispatch & Wake

Durable choices behind the **inter-scope messaging & coordination** seam
(`../what/07-subsystem-seams.md`). The *what* — that dispatch (down), report (up), and wake
(notify) exist — lives in `../what/02-domain-model.md` and `../what/03-scopes-and-personas.md`.
This doc records how Ward realizes them. Ward is deliberately **opinionated** here because
these flows overlap heavily with the multiplexer and the metadata store, and an unprincipled
realization would leak live, unrecoverable state.

## Choice: messages and dispatch are addressed by identity, and recorded

A dispatch or message targets a thing by its **identity** (`../what/02-domain-model.md`) — a
room, a task, a session — and the act of sending is **recorded in the metadata store**, not
held only in a live process.

**Why.** Identity-addressing means the sender does not need the receiver to be *running* — only
*open*. Recording means a dispatched unit of work or an unread message survives a reboot: on
recovery, the receiver can still find what was sent to it (`../what/01-principles.md` §16,
recorded over live).

## Choice: delivery rides on the multiplexer where the target is live, but the record is the truth

When a target session is **running**, a message may be delivered to it directly through the
multiplexer (the live channel). When it is **open but not running**, the message waits **in the
record** until the target is resumed.

**Why.** This gives the responsiveness of live delivery without making liveness a requirement.
The multiplexer is an optimization for the running case; the metadata store is the durable
backstop. (Exactly how much rides on each is provisional — `../what/08-open-questions.md`.)

## Choice: wake is a recorded, idempotent condition — not a held process

A "wake me when X" request (e.g. a resident waiting on a room) is recorded as a **condition
against an identity**, not as a blocked process sitting in memory.

- A waiting scope may **block** on the condition, or **detach** and be woken later.
- When the condition is met, the waiter is nudged (delivered as above).
- The whole mechanism is **idempotent**: re-arming or re-firing a wake must not double-act, and
  a wake whose condition is already satisfied fires once and resolves.

**Why.** A held, blocked process does not survive a reboot and wastes context while it waits.
Recording the condition lets the wait be re-armed on recovery (see below) and lets senior
scopes detach instead of busy-waiting — directly serving the prime directive.

## Choice: wake conditions are re-armed during recovery

Because a wake is a **recorded condition against an identity** — not a live process — cold-start
recovery can **re-arm** it. When Ward brings a workspace back to life
(`../what/04-sessions-and-lifecycle.md`), after resuming the open sessions it walks the recorded
wake conditions and re-establishes each: a still-unmet condition is re-armed to fire later, and
a condition that was **satisfied while the machine was down** fires **once** and resolves
(idempotently, never double-acting). A detached waiter learns on resume that its condition is
met.

**Why this is the crux.** The motivating scenario for the whole system is a reboot with many
threads in flight (`../what/04-sessions-and-lifecycle.md`). The delegate-and-return pattern — a
resident detaches and is woken when its room finishes — only holds if the wake survives the
reboot. A wake that lived only in a running process would silently vanish exactly when it is
needed most. Recording-first is what lets the asynchronous model survive the very event it
exists to survive.

## Guardrails — what this is, and what it is not

- **Is:** identity-addressed, recorded-first messaging/dispatch/wake, with live multiplexer
  delivery as an optimization and idempotent wake conditions.
- **Is not:** a general-purpose message bus or queue with broadcast, topics, or guaranteed
  ordering across unrelated scopes — only the dispatch/report/wake flows the model needs.
- **Is not:** a mandate that delivery *always* go through the multiplexer; a not-running target
  is served entirely from the record.
- **Is not:** a held-process wait. Anything that cannot survive a reboot is the wrong
  realization.

## For the implementation plan — where to fill in the blanks

Within the guardrails: the message/dispatch record format and where it lives relative to the
session log; how a wake **condition** is expressed and evaluated; the split of responsibility
between multiplexer and store for the running vs. not-running cases; and how waits are re-armed
during recovery (`../what/08-open-questions.md`). These are the focus areas.
