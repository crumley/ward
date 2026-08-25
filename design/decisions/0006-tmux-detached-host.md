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
[`0031-detached-session-hosting`](../0031-detached-session-hosting/README.md). After the choice was
first drafted it was tested against a systematic survey of eleven comparable systems
([`prior-art/`](../0031-detached-session-hosting/prior-art/), committed beside that entry); the
survey did not change the choice, and it did add caveats — recorded under Consequences below and
amended in place, this ADR still being proposed.

What the intent fixes and what it leaves free: the **contract** above is fixed; the tool is free,
explicitly plural (§19), and must remain swappable behind the adapter — the seam's own "not a
commitment to one specific multiplexer."

## Options considered

- **tmux** — the ubiquitous terminal multiplexer. Detach/attach are its core verbs
  (`new-session -d`, `attach-session`, `detach-client`); **read-only attach is first-class and
  server-enforced** (`attach-session -r`); every query has a machine-readable form
  (`list-sessions -F '#{…}'`, `has-session`, exit codes meant for scripts); sessions are **named**,
  and the name is stable across the session's life — a record→live mapping needs nothing beyond a
  name minted from Ward identity and recorded; per-session status/border styling (`set-option -t`)
  is exactly the surface the theming seam will want. Packaged everywhere, decades stable, and —
  crucially for §16 — it holds **no durable state of its own**: when the server dies, everything in
  it is gone, which is the correct shape for a cache. Tradeoffs: a real dependency (though only for
  those who want detachment); one more layer of key bindings between the human and the harness TUI;
  no Windows — and two field-reported sharp edges the survey surfaced: interactive TUI agents can
  crash when initialized in a **detached** session
  ([muxel](../0031-detached-session-hosting/prior-art/muxel.md), which deliberately omits `-d`), and
  `-t` targets **prefix-match** by default, so every scripted target needs the `=` exact-match
  prefix ([amux](../0031-detached-session-hosting/prior-art/amux-survey.md), after prefix matching
  once killed the wrong session).
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
  server-enforced), map (the session **name**, minted from Ward identity and recorded — below),
  re-create (`new-session` again from the record), group/label (name prefixes, `choose-tree`,
  per-session options). Nothing has to be faked.
- **The host stays a cache honestly.** tmux persists nothing across a server death, so a reboot
  leaves exactly what §16 prescribes: the record, and nothing live — recovery rebuilds from the
  record with no stale resurrection to reconcile.
- **An optional dependency, not a new floor.** The foreground baseline remains dependency-free and
  is what an explicit choice or a missing tmux falls back to (with the consequence named). Windows
  is not served by this technique; it was not served by the baseline's audience assumptions either,
  and the adapter boundary is where a different host for a different platform would slot in.
- **The name is minted, then recorded — never re-derived as a binding key.** The session name is
  load-bearing for attach, doctor's drift checks, and theming — and the survey was unanimous that a
  name derived from a **mutable** input (Ward's workspace name is editable) must not be the binding:
  a rename would orphan every live session at once
  ([cmux](../0031-detached-session-hosting/prior-art/cmux.md) bans workspace-derived keys;
  [muxel](../0031-detached-session-hosting/prior-art/muxel.md)'s recorded-name-wins resolver
  documents the duplicate-and-misreap failure;
  [amux](../0031-detached-session-hosting/prior-art/amux-survey.md) keys to an immutable id). 0031
  therefore mints the name once, records it on the session, treats it as an opaque whole thereafter,
  and confirms a found session is Ward's own by a token the launch placed inside it — never by the
  name alone.
- **The detached start is the premise to validate first.** The field reports interactive TUI agents
  (Claude named explicitly) crashing when initialized with no client attached
  ([muxel](../0031-detached-session-hosting/prior-art/muxel.md)), and headless defaults being raised
  because TUIs misrender at 80×24 ([herdr](../0031-detached-session-hosting/prior-art/herdr.md)).
  The hosted session is therefore created at an explicit size, and 0031's build begins with a smoke
  check against a real tmux; if the premise fails, the mechanism pivots to attach-then-launch
  **within tmux** — the pivot changes 0031's create flow, not this ADR's choice of host.
- **Exit legibility is free if asked for at create.** `remain-on-exit on` makes the host retain a
  finished run's exit status and signal (`#{pane_dead_status}`, `#{pane_dead_signal}`), turning "the
  session is gone" into "exited 0" or "killed by SIGKILL" with no shim in the run's process tree
  ([amux](../0031-detached-session-hosting/prior-art/amux-survey.md)). The cost is owned: dead panes
  linger, so liveness has layers (session present ≠ process alive) and close must kill dead sessions
  too.
- **Sharing the default server obliges Ward to start it hygienically.** The tmux server inherits the
  argv of the client that first forks it; a create run naked would leave the workspace path in the
  server's command line, and an agent's `pkill -f <workspace>` would then kill every session on the
  machine. The adapter starts the server with a path-free argv and `exit-empty off` before the first
  create ([muxel](../0031-detached-session-hosting/prior-art/muxel.md), verbatim).
- **Reversible at the adapter.** Everything tmux-specific lives in one file; swapping hosts (or
  adding zellij as a third technique, should its read-only story change) touches the adapter and the
  ADR that supersedes this one, not the session model or the store.
