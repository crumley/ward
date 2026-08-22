# Subsystem: Session Multiplexer

> **Layer:** intent · subsystem (seam). The contract any design must honor; the _how_ is planned in
> [`../../design/`](../../design/). **Status:** living.

## Responsibility

Host **live agent sessions** so they can be started, attached to, observed, detached from, and
resumed — by both humans and agents — and survive a human walking away. It is where a session is
**running**; the store is where it is **open**
([`../01-concepts/02-sessions-and-lifecycle.md`](../01-concepts/02-sessions-and-lifecycle.md)).

## Constraints any design must honor

- **Start** a session for a given scope/identity — the **baseline** any design must offer. A session
  may legitimately be **hosted in the caller's own terminal**, in the foreground: the
  harness-neutral, dependency-free rung, and the one that is available before any hosting technique
  is. The consequence is named, not hidden — such a session **ends when the terminal does**. _Why
  that is admissible:_ nothing essential depends on liveness (below); the record is the truth and
  resume rebuilds the thread from it, so a session that dies with its terminal loses a process, not
  a thread.
- **Keep it alive when detached** — the capability the multiplexer **adds** on top of that baseline.
  _Why:_ work must survive a human walking away and be **re-attachable** rather than restarted, and
  that is worth a hosting dependency where detachment is actually needed. _Why it is stated
  separately:_ paired with start it reads as one indivisible requirement, so a foreground start
  looks like a violation of the seam rather than what it is — the plainer of two techniques serving
  one contract (§19), with detachment added when the work asks for it.
- Let a human or agent **(re-)attach**, and **observe read-only**.
- **Map a recorded session reference** (its identity and **harness handle**) back to a live session
  for resume, and re-create it when not running.
- **The live host is a cache over the record, never the source of truth** (§16). Nothing essential
  lives _only_ here; if every pane vanished on a reboot, the record would still hold every open
  thread and recovery would rebuild the live state. _Why:_ liveness is fragile and machine-local;
  treating a pane as authoritative loses threads at the reboot — the moment the system exists to
  protect.
- **Group sessions by the work they belong to** (by scope) and **label them by identity** (the
  floor/room codes humans already hold in their heads), so a human with a dozen sessions open finds
  the right one at a glance. _Why:_ navigability is context management for the human
  ([`../00-foundation/00-vision.md`](../00-foundation/00-vision.md)).
- Support **visual grouping/identification** coordinated with the theming seam
  ([`05-visual-theming.md`](05-visual-theming.md)).

## What this is NOT

- **Not the source of truth.** Anything that must survive a reboot lives in the store
  ([`00-metadata-store.md`](00-metadata-store.md)), not here.
- **Not a commitment to one specific multiplexer or grouping scheme.** The contract — start,
  keep-alive-when-detached, re-attach, observe read-only, map a recorded reference back to a live
  session — is what must hold; the tool may change.
- **Not a requirement that every start be hosted here.** Starting is the baseline and a foreground
  session in the caller's terminal satisfies it; this seam is where a session gains the ability to
  outlive the caller.
- **Not the messaging channel.** Live delivery may _ride on_ the multiplexer
  ([`02-messaging-coordination.md`](02-messaging-coordination.md)), but this seam's job is hosting
  sessions, not routing messages.

## Canonical home for

- The **session-multiplexer contract**: a persistent attach/detach host for live sessions, grouped
  and labeled by work, treated as a cache over the durable record — and the **baseline/added split**
  within it: starting is the baseline (a foreground session in the caller's terminal satisfies it,
  and ends with it), keeping a session alive when detached is what this seam adds.

## Left to implementation

- The specific multiplexer; the exact grouping/window/pane layout and naming; how a recorded session
  maps to and from a live pane; how read-only observation is exposed; how the surface is themed.
  Planned in [`design/`](../../design/).

## Open questions

- **Messaging vs. multiplexer overlap** — how much of dispatch/wake rides on the multiplexer vs. the
  store (with [`02-messaging-coordination.md`](02-messaging-coordination.md)).
