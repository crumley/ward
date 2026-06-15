# How-Intent: Session Multiplexer

Durable choices behind the **session multiplexer** seam (`../what/07-subsystem-seams.md`); the
*what* lives in `../what/04-sessions-and-lifecycle.md`. This records the kind of technology that
hosts live sessions, and the line between it and the record.

## Choice: a terminal multiplexer hosts live sessions

Live sessions run inside a **terminal multiplexer** — a long-lived host that keeps a session's
process alive when no human is attached, and lets a human or agent **attach and detach** at
will.

**Why a multiplexer (vs. raw processes).** The motivating need is that work survives a human
walking away (`../what/04-sessions-and-lifecycle.md`): a session must keep running detached, and
be re-attachable later from the same machine. A multiplexer gives exactly that — persistence
across disconnects, attach/detach, and a surface Ward can theme (`theming.md`) — without Ward
reimplementing process supervision.

## Choice: the multiplexer hosts the *running* session; the record owns the *open* one

The multiplexer is where a session is **running**; the metadata store is where it is **open**
(`../what/04-sessions-and-lifecycle.md`, open vs. running). A live pane is a **cache over the
record**, never the source of truth (`../what/01-principles.md` §16).

- Ward maps a recorded session (its identity and **harness handle**) to a live pane when it is
  running, and re-creates that pane on resume when it is not.
- Nothing essential lives *only* in the multiplexer. If every pane vanished on a reboot, the
  record would still hold every open thread, and recovery would rebuild the live state from it.

**Why.** Liveness is fragile and machine-local; the record is durable. Treating the pane as
authoritative would lose threads at exactly the moment the system exists to protect them — the
reboot.

## Choice: sessions are grouped and labeled so a human can navigate them

The multiplexer presents sessions **grouped by the work they belong to** (by scope — project,
task, room) and **labeled by identity** (the floor + room codes humans already hold in their
heads, `../what/02-domain-model.md`), so a human with a dozen sessions open can find the right
one at a glance.

**Why.** Navigability is context management for the human (`../what/00-vision.md`): a screen of
indistinguishable panes is the human-side equivalent of an unfocused context window.

## Guardrails — what this is, and what it is not

- **Is:** a persistent, attach/detach host for live sessions, grouped and labeled by work,
  themeable, treated as a cache over the durable record.
- **Is not:** the source of truth. Anything that must survive a reboot lives in the store, not
  the multiplexer.
- **Is not:** a commitment to one specific multiplexer or grouping scheme. The seam contract
  (`../what/07-subsystem-seams.md`) is what must hold; the tool may change.
- **Is not:** the messaging channel itself. Live delivery may *ride on* the multiplexer
  (`messaging-dispatch-wake.md`), but the multiplexer's job is hosting sessions, not routing
  messages.

## For the implementation plan — where to fill in the blanks

Within the guardrails: the specific multiplexer; the exact grouping/window/pane layout and
naming; how a recorded session is mapped to and from a live pane; how read-only observation is
exposed; and how the multiplexer surface is themed (`theming.md`).
