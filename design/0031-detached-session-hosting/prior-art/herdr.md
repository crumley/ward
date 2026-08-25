# herdr — <https://github.com/herdrdev/herdr>

**Session model in three sentences.** Herdr inverts this entry's posture: instead of parking each
agent in a shared multiplexer, it _is_ the multiplexer — a self-daemonizing Rust server that owns
every agent's PTY, with thin TUI clients that attach and detach over a Unix socket, so "detached and
re-attachable" is the only mode and the live server is the source of truth. Durable state (a
debounced `session.json` snapshot) is a best-effort cache of the live server — the exact opposite of
Ward's record-as-truth — and the only thing that genuinely survives a server death is the
harness-native conversation handle (`claude --resume <id>`), captured live from inside the agent via
hook scripts. Liveness is fully derived (socket connectability, never stored PIDs), restore degrades
stale or duplicated session references to plain shells rather than guessing, and its distinctive
value-add is live agent lifecycle state (working/blocked/done/idle) rolled up so a human can find
the stuck agent.

**Vitals.** Rust, one binary (vendored `portable-pty`, `interprocess`). Created 2026-03, ~32k stars,
55 releases through v0.8.2, PRs past #3166, versioned docs per release. Shipped, mature software;
everything below was read in code, not marketing.

## The session model, condensed

- **Process model.** Running `herdr` auto-detects a server on the client socket; if none, it
  re-execs itself as a detached daemon (`src/server/autodetect.rs` `spawn_server_daemon`). The
  headless server is the parent of every agent; agents (Claude Code, Codex, ~20 others — one
  directory each under `src/integration/assets/`) run as ordinary interactive TUIs inside
  server-owned panes. Pane environments carry `HERDR_ENV`, `HERDR_PANE_ID`, `HERDR_SOCKET_PATH`.
- **Detach/attach.** Client exit detaches; `herdr` reattaches. Three grains: full-UI attach, direct
  per-terminal attach (`herdr agent attach reviewer`) with **one writable client at a time** and an
  explicit `--takeover` to steal input, and true read-only observation
  (`herdr terminal session observe`, multi-viewer, zero ownership) streaming JSON frames
  (`docs/…/persistence-remote.mdx`). Remote is SSH-then-herdr, or `herdr --remote host`
  bootstrapping a matching server over SSH.
- **No foreground mode exists.** Background hosting is the default from the first command;
  "foreground" is just an attached client. The one fixed-at-start choice is `--no-session`
  monolithic mode, which can never be promoted to hosted.
- **State model.** Live is truth; `session.json` (snapshot v3, `src/persist/snapshot.rs`) is a
  debounced, atomically-written cache. The survival matrix (`docs/…/session-state.mdx`): detach
  preserves everything; server death loses all processes, and restore rebuilds only _shape_ — panes
  return as fresh shells in their saved cwd — **except** panes holding a native agent session
  reference, which relaunch via the harness's own resume argv (`src/agent_resume.rs`). Live↔record
  mapping is derived, never stored: no PID files anywhere; "alive" = socket connects; a socket that
  refuses is stale by definition and removed. The experimental exception: live handoff for updates
  passes actual PTY file descriptors to a replacement server (`src/server/handoff.rs`).
- **Identity.** Session (server namespace) / workspace / pane (`w1:p2`, stable public numbers) /
  ephemeral agent alias (`herdr agent rename w1:p2 reviewer`, unique among live agents only).
  Terminal identity and the identity of the agent occupying it are kept separate. Git worktrees get
  first-class grouping (`herdr worktree create`).
- **Lifecycle.** Detach ≠ stop (their "exit is not a close"). `session stop` is the deliberate close
  (processes die, snapshot remains); `session delete` removes the record and **refuses while
  running** (`src/session.rs`). Resume is harness-native and **hook-fed**: the Claude integration
  installs a hook that pushes `session_id` (+ transcript path) back to herdr on every session event
  (`src/integration/assets/claude/herdr-agent-state.sh`), because Claude's id _changes_ across
  `/clear`, compaction, and forking (`normalize_session_start_source` tracks
  `startup | resume | clear | compact | branch | new | fork`). Resume-on-restore is deferred until a
  client attaches with real terminal size and theme (`src/app/agent_resume.rs`) — resuming a TUI
  into a zero-area or theme-less terminal garbles it; the headless default terminal was bumped 80×24
  → 120×40 for the same reason (CHANGELOG 0.8.2).
- **Failure.** Stale sockets auto-removed on connection-refused; a live one refuses a second server
  legibly. Protocol-version skew after a binary update is detected and refused with named guidance.
  Stale, invalid, or **duplicated** resume refs restore as plain shells — degrade, never guess, with
  a dedupe-key set so two panes can never claim one harness session (`src/persist/restore.rs`). No
  doctor verb; `herdr status` + `agent explain` diagnose; socket cleanup is automatic, record
  deletion is human and gated.

## Takeaways for ward

1. **Hook-fed handle freshness.** The harness session id is a moving target (`/clear`, compact, fork
   all mint a new one). Herdr keeps the record current by having a harness hook push the live id as
   it changes. Ward's handle is assigned once at launch; a long-lived detached session that compacts
   would strand `resume`/`locate` on a stale id. The record's handle needs a refresh channel — Ward
   already rides the environment (`WARD_AGENT`), so a SessionStart hook running a `ward` verb is the
   natural shape.
2. **Create the hosted session at a real terminal size.** Herdr defers resume until an attached
   client supplies size and theme, and raised its headless default because TUIs rendered garbage.
   The hosted open and attach-recreate paths must size the tmux session (`-x`/`-y`, or
   attach-then-launch) or Claude's TUI misrenders on first attach.
3. **Write ownership is a designed thing.** attach (single writer) / observe (many readers, no
   ownership) / takeover (explicit steal) is the complete triad. This entry has attach and observe;
   it says nothing about a second attacher or reclaiming input from a terminal that went away —
   tmux's default is shared-write, which is _less_ safe than herdr's default.
4. **Liveness derived, never stored — validated at scale.** No PIDs anywhere in a 32k-star tool;
   probe-and-clean is enough. Confirms this entry's pure-function name mapping and `has-session`
   probing.
5. **Degrade-don't-guess on stale/duplicate refs.** Herdr's restore suppresses the second claimant
   of one harness session deterministically. Ward's analog: if a record and a live host (or two
   records) ever claim one conversation, exactly one must win, by rule.
6. **Blocked-state visibility is what makes a fleet usable.** Herdr's whole UX is "never hunt for
   the stuck one" (working/blocked/done/idle per agent, `agent wait --until blocked` for scripting).
   Once Ward hosts N detached sessions, surfacing _which one awaits a human_ becomes the difference
   between a fleet and a graveyard — hooks can feed it nearly free.
7. **Environment-at-open is a trap.** Issue #966: keychain/agent-socket state inside panes is the
   daemon's, from when it started, not the attacher's. A tmux-hosted `claude` inherits the tmux
   server's creation environment — a consequence to name in the entry.
8. **Version skew between the durable tool and the live host.** Herdr grew detection, refusal text,
   and eventually FD-passing handoff because the updated binary kept meeting an old live server.
   Ward's analog (an old ward's tmux sessions under a new ward) deserves a doctor finding.

## Conflicts with ward's posture

Herdr's durable snapshot is a cache of the live server; Ward's live host is a cache of the durable
record. Herdr pays for the inversion with its heaviest machinery — snapshot versioning and
migration, a four-row survival matrix users must learn, FD-passing handoff to survive its own
updates. The vindicating detail: even in herdr, the only state that truly survives a dead host is
the harness-native session reference — precisely what Ward's record holds durably. Ward's design is
herdr's "native agent session restore" fallback promoted to the definition of recovery; herdr's
experience says that path works, provided the handle stays fresh (takeaway 1) and resume waits for a
real terminal (takeaway 2).
