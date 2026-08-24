# 0006 — tmux as the detached session host

> **Status:** proposed · **Date:** 2026-08-24

## Context

The session-multiplexer seam
([`intent/02-subsystems/01-session-multiplexer.md`](../../intent/02-subsystems/01-session-multiplexer.md))
requires that a live agent session can be **kept alive when detached**, **re-attached**, **observed
read-only**, **mapped back from its durable record**, and **re-created when gone** — with the live
host treated as a **cache over the record, never the source of truth** (principles §16), and with
sessions **grouped by scope and labeled by identity** so a human with a dozen open finds the right
one at a glance. The seam deliberately does not name a tool; the foreground start
[0029](../0029-launched-sessions/README.md) built is the seam's stated **baseline**, and it dies
with the caller's terminal by design.

This ADR picks the **added technique**: the host that lets a Ward-launched session outlive the human
walking away. It is a cross-cutting stack choice — the adapter, the naming scheme, doctor's
diagnostics, and the future theming surface all lean on it — so it is recorded here rather than
inside one entry. The design that consumes it is
[`0031-detached-session-hosting`](../0031-detached-session-hosting/README.md).

What the intent fixes and what it leaves free: the **contract** above is fixed; the tool is free,
explicitly plural (§19), and must remain swappable behind the adapter — the seam's own "not a
commitment to one specific multiplexer."

## Options considered

- **tmux** — the ubiquitous terminal multiplexer. Detach/attach are its core verbs
  (`new-session -d`, `attach-session`, `detach-client`); **read-only attach is first-class and
  server-enforced** (`attach-session -r`); every query has a machine-readable form
  (`list-sessions -F '#{…}'`, `has-session`, exit codes meant for scripts); sessions are **named**,
  and the name is stable across the session's life — a deterministic record→live mapping needs
  nothing else; per-session status/border styling (`set-option -t`) is exactly the surface the
  theming seam will want. Packaged everywhere, decades stable, and — crucially for §16 — it holds
  **no durable state of its own**: when the server dies, everything in it is gone, which is the
  correct shape for a cache. Tradeoffs: a real dependency (though only for those who want
  detachment); one more layer of key bindings between the human and the harness TUI; no Windows.
- **zellij** — the modern alternative, with friendlier defaults, first-class layouts, and a CLI
  (`zellij attach`, `zellij list-sessions`, `zellij action …`). Two honest problems. It **serializes
  and resurrects sessions across server death** — a persistence layer of its own, which puts a
  second, competing record under Ward's (§16 says the record rebuilds the live state, not the host
  resurrecting a stale copy of it). And it has **no first-class read-only attach** at the time of
  writing — a seam constraint would have to be faked or dropped. Younger and moving fast, which cuts
  both ways.
- **GNU screen** — detach/attach as old as the idea. But read-only observation exists only through
  multiuser ACLs (clunky, permission-sensitive), `screen -ls` output is made for eyes rather than
  parsers, styling hooks are weak, and development has slowed to maintenance. Everything it offers
  here, tmux offers with a scriptable surface.
- **dtach / abduco** — minimal detach-only tools: a socket per session, attach and detach, nothing
  else (abduco adds a session list and a read-only attach; dtach has neither). Beautifully small,
  but they host one program per socket with **no windows, no labels, no status surface** — grouping,
  identification, and theming would all become Ward's to build from scratch, which is the seam's
  work list re-implemented poorly.
- **A bare daemonized process** — `setsid` the harness, log to a file, no host at all. Keeps the
  process alive, but the harness is an interactive TUI on a pty: "attach" would mean building a pty
  broker and a client — that is, writing a worse dtach — and read-only observation, grouping, and
  labeling would all be greenfield. Fails most of the contract for the price of avoiding a
  dependency the baseline already avoids.

## Decision

**tmux**, driven through a thin adapter (`src/host/tmux.ts`, mirroring `src/harness/claude.ts`), as
the added technique beside the foreground baseline. The two techniques serve the one contract per
§19; convergence is judged in real use and recorded by the design entries that observe it.

## Consequences

- **Every seam constraint maps to a first-class tmux verb** — keep-alive (`new-session -d`),
  re-attach (`attach-session` / `switch-client`), observe read-only (`attach-session -r`,
  server-enforced), map (the session **name**, a pure function of Ward identity), re-create
  (`new-session` again from the record), group/label (name prefixes, `choose-tree`, per-session
  options). Nothing has to be faked.
- **The host stays a cache honestly.** tmux persists nothing across a server death, so a reboot
  leaves exactly what §16 prescribes: the record, and nothing live — recovery rebuilds from the
  record with no stale resurrection to reconcile.
- **An optional dependency, not a new floor.** The foreground baseline remains dependency-free and
  is what an explicit choice or a missing tmux falls back to (with the consequence named). Windows
  is not served by this technique; it was not served by the baseline's audience assumptions either,
  and the adapter boundary is where a different host for a different platform would slot in.
- **The name becomes an API.** The deterministic session-name mapping is load-bearing for attach,
  doctor's drift checks, and theming; changing it later means orphaning live sessions (a cache loss,
  not a record loss — but a visible one).
- **Reversible at the adapter.** Everything tmux-specific lives in one file; swapping hosts (or
  adding zellij as a third technique, should its read-only story change) touches the adapter and the
  ADR that supersedes this one, not the session model or the store.
