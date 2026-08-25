# muxel — <https://muxel.sh/> (source: <https://github.com/projecthax/muxel>)

**Session model in four sentences.** muxel is a native desktop terminal multiplexer "shaped like an
agent manager": every pane is a real PTY running an interactive agent TUI (Claude, Codex, Grok,
opencode, …), and **tmux sits underneath that PTY as a durability layer rather than as the UI** —
one tmux session per pane, named `muxel_<project>_<uuid8>`, created with `new-session -A` so
launching and re-attaching are one idempotent command. The durable half is a JSON workspace record
holding, per instance, its `tmux_session` name and the harness's own `session_id`; the live half is
the tmux session, and losing it is survivable because the _conversation_ is restored by
harness-native resume out of the harness's own transcript store, never from anything muxel keeps.
Its most transferable machinery is defensive: the recorded session name always beats a recomputed
one, a stored session id is validated against the harness's transcript directory _before_ muxel
dares `--resume`, an orphan sweep re-adopts unowned muxel sessions found inside a project's tree
while never touching the user's own tmux, and a load-time repair pass guarantees no two panes are
attached to one session. There is no read-only observe mode — it was tried and abandoned.

**Vitals.** Rust/GPUI desktop app (crates `muxel`, `muxel-core`, `muxel-store`, `muxel-terminal`)
plus a SwiftUI iOS companion; GPL-3.0 with commercial licensing. Young but fast-moving: 0.0.1 on
2026-06-24, 0.1.8 on 2026-08-20 (`CHANGELOG.md`). The homepage is marketing, but the repo carries an
unusually literate `FEATURES.md`, two committed design docs, and dense rationale comments with
regression tests attached — **everything below was read in the repo at commit `7f1612a`**, so these
are verified mechanics, not copy.

## The session model, condensed

- **Process model.** No daemon, no headless mode. Each pane "embeds a real terminal emulator over a
  PTY" (`README.md`) via `portable-pty` + the Alacritty parser, running the agent's ordinary TUI.
  Durability is bolted on by wrapping that child in tmux:
  `tmux -u set -g mouse on ';' new-session
  -A -s muxel_<project>_<id8> [-c cwd] -- claude …`
  (`crates/muxel-core/src/tmux.rs:7,165,206`). Remote panes run over one multiplexed SSH connection
  per host and are always tmux-backed; local tmux defaults **on** wherever tmux is installed and
  never applies on Windows (`FEATURES.md:600,684`) — so Windows simply has no session durability.
- **Detach/attach.** `-A` (create-or-attach) gives one launch path for both "start" and "reattach".
  The desktop omits `-d` and attaches immediately; the iOS companion creates detached and attaches
  separately (`ios/Muxel/Tmux/TmuxCommands.swift:79-97`). On startup muxel reconnects the tmux panes
  of _every_ remote project in the background, not just the open one (`FEATURES.md:616`).
- **Read-only observe: deliberately absent.** iOS has read-only tmux commands (`capture-pane -p`,
  `display-message -p '#{pane_dead}…'`) but uses them only for background _status polling_
  (`TmuxCommands.swift:6-8,177-188`). An earlier polled `capture-pane` **viewer** was replaced by a
  live attached PTY because "interactive TUI agents (claude) crash if they initialize in a
  _detached_ session, so the pane must be a real attached terminal" (`ios/README.md:39-44`).
- **Foreground↔background.** Every pane is nominally foreground (a visible tile), but its session
  outlives the app, so backgrounding is implicit rather than a verb. Closing a _pane_ always kills
  its tmux session; quitting the _app_ leaves sessions alive **by design**, and the quit dialog then
  offers _Also kill local / remote tmux sessions_, **both off by default** and fire-and-forget so
  quitting never blocks on a slow host (`FEATURES.md:701-708`).
- **State model.** `workspace.json` under the platform data dir, written atomically (temp + rename)
  behind a per-workspace advisory lock on `instance.lock` the OS releases even on a crash
  (`crates/muxel-store/src/lib.rs:66,69-96,123`). An `Instance` carries `tmux_session`,
  `session_id`, `session_started`, `auto_name`, and a persisted `AgentActivity`
  (`muxel-core/src/lib.rs:484,516,556`). A second _roaming_ copy is mirrored to
  `<root>/.muxel/workspace.json` on the host — git-ignored on purpose — so another machine or the
  phone can open the project and re-attach the same sessions; on connect the newer copy wins, the
  replaced one kept as a one-level backup (`FEATURES.md:620-635`).
- **Record→live mapping and identity.** `session_for(recorded, slug, instance)`: the name **recorded
  on the instance wins**, canonical `muxel_<slug>_<id8>` derived only when nothing is recorded
  (`tmux.rs:106-126`). Its comment spells out the failure it prevents — a client that recomputed the
  name from its own slug "would attach to neither the session iOS created nor the one it left behind
  itself: it would mint a fresh duplicate on every launch, and its teardown … would never reap the
  session it was actually running." Three identifiers stay separate: `instance_id`, `session_id`
  (the harness's resumable root conversation), `parent_session_id`. "One muxel instance owns one
  harness session ID. Two panes must never resume the same session ID concurrently."
  (`docs/session-lineage.md:31-40`).
- **Exclusivity is repaired, not merely asserted.** `dedupe_instances` runs on every workspace load,
  unlinking a second instance claiming the same `(project, tmux_session)` — "both attach as clients
  to the same terminal, so they mirror each other keystroke for keystroke … (and closing one kills
  the session under the other)" — plus surplus tabs, plus instances the layout never got
  (`muxel-core/src/lib.rs:1230-1310`; its regression test cites the real incident, two concurrent
  remote connects each adopting the host's sessions).
- **Resume.** Two preset-configurable shapes (`muxel-core/src/agent.rs:93-104,592-601`):
  _host-minted_ (Claude, Grok) — muxel mints a UUID, passes `--session-id` first and `--resume <id>`
  after; _agent-minted_ (Codex) — first launch bare, then muxel captures the UUID that pane
  published. Before any resume it **validates the id against the harness's own store**:
  `claude_session_path` builds `~/.claude/projects/<slugged-cwd>/<id>.jsonl`, `codex_session_exists`
  walks `~/.codex/sessions` (`agent.rs:604-651`). If the transcript is gone it mints a _fresh_ id
  rather than "a doomed resume that just hangs", never reusing the old one, and refuses to fall back
  to "latest" because that "can steal a sibling pane's conversation" (`muxel/src/app.rs:4442-4475`).
- **Orphan adoption.** `orphan_sessions` returns sessions prefixed `muxel_`, inside the project's
  tree, owned by no instance — "agents still running from an earlier run … that nothing in the
  workspace points at any more … otherwise unreachable … while quietly holding the host's resources"
  (`tmux.rs:74-104`). Attribution is by the session's **path**, not its name slug, since the slug
  may be the _host's_ rather than the project's; a worktree under the root counts, a prefix-sibling
  directory does not. Opening a remote project adopts them back mid-conversation
  (`app.rs:5244-5330`).
- **Failure handling.** A dropped SSH relay never auto-closes the pane: "Connection lost —
  reconnecting…", not "exited", with backoff 5s→30s for as long as the outage lasts
  (`FEATURES.md:606-615`). A killed terminal or tmux server does not tombstone either: the relaunch
  reattaches if the session survived, or `new-session -A` recreates it and the agent relaunches with
  `--resume`, "restoring the conversation from its transcript — the tmux scrollback is the only
  casualty", with an explicit note that resetting the id here "would throw the conversation away"
  (`app.rs:7790-7838`). The feed distinguishes **reattached** from **session restored**; a resume
  launch that exits within seconds is read as a bad id and respawned fresh (`app.rs:7842-7849`).
- **tmux server hygiene.** muxel starts the server itself with an argv naming no project —
  `tmux
  start-server ';' set -s exit-empty off` — because tmux's server inherits the command line
  of whichever client first forked it, so an agent running `pkill -f <project>` to clear its own dev
  server would otherwise SIGKILL the **shared** server and every agent on the host. `exit-empty off`
  is required: a server with no sessions exits at once, so `start-server` alone would evaporate
  before the first `new-session` (`tmux.rs:128-160`, `FEATURES.md:688-694`).
- **Durable liveness bookkeeping.** `docs/agent-lifecycle-design.md` persists one
  `AgentActivity
  { work_started_at, completed_at, blocked_at, last_attended_at, last_state }` per
  instance, keeps lifecycle separate from notification attendance, ranks evidence (semantic OSC
  title, on-screen marker, bell, process exit strong; raw PTY output weak and "never records
  completion"), and derives unread-ness from timestamps: "There is no persisted `unseen` boolean
  that can disagree with the timestamps." Its fragility is admitted in `CHANGELOG.md` 0.1.8 — Codex
  0.147 changed its title format, the parser rejected every frame, and typing read as working.

## Takeaways for ward

1. **Make the recorded host name authoritative; the deterministic scheme is only a minting rule.**
   0031 derives `ward-<workspace>-<session-id>` everywhere; `session_for` (`tmux.rs:106-126`) is the
   same idea with the recorded name winning, and documents the alternative — duplicate sessions
   every launch plus a teardown that reaps the wrong name. Ward should write the resolved tmux name
   onto the session record at open and read _that_ after, so a workspace rename or a slug-rule
   change can never orphan a live session.
2. **Use `new-session -A` so `open` and `attach` are one code path.** It deletes 0031's "is the live
   half there?" branch from the command layer; the record→resume decision then hinges only on
   whether the harness transcript exists.
3. **But test that Claude Code survives initializing detached before committing to detach-first
   hosting.** muxel's desktop deliberately omits `-d`, and its iOS notes report that an interactive
   agent TUI initializing in a detached session crashes (`ios/README.md:41-44`). 0031's premise is
   that the agent starts with nobody attached — this is the highest-value thing to verify first.
   Related: attach at the client's real grid size, since a detached session's default 80×24 garbles
   later resizes.
4. **Validate the harness transcript before resuming; treat a missing one as a new session.** 0031
   has attach re-create from the record via harness-native resume; muxel supplies the missing
   pre-flight — check `~/.claude/projects/<slugged-cwd>/<session-id>.jsonl` first
   (`agent.rs:604-621`), and on absence mint and record a new id instead of a `--resume` that hangs
   (`app.rs:4446-4455`). Also steal "a resume that exits within seconds means the id was bad".
5. **Never resume "latest", never reuse a dead id** (`app.rs:4459`) — falling back to the newest
   transcript in a directory "can steal a sibling pane's conversation". Ward runs several sessions
   per workspace over shared worktrees, so this is a live hazard, not a theoretical one.
6. **Add a load-time integrity repair, not just a refusal.** 0031 refuses resume while live;
   `dedupe_instances` (`lib.rs:1230-1310`) goes further, unlinking a second record claiming one
   session and — the mirror case worth copying — restoring a record whose live session exists but
   has no reachable home. `ward doctor` is the natural place for both checks.
7. **Attribute stray sessions by path, not by name.** `orphan_sessions` (`tmux.rs:74-104`) filters
   on prefix **and** containment in the project tree **and** unowned-ness, with tests that a
   prefix-sibling directory does not count and that a user's own tmux is never claimed. Ward's
   `worktrees/` layout gives it the same containment test for free.
8. **Steal the tmux server-hygiene preamble verbatim** (`tmux.rs:128-160`):
   `start-server ';' set -s
   exit-empty off` before the first session, no workspace path in the
   server's argv, `-u` on the client. Ward is squarely in this blast radius — its worktree paths
   embed the workspace name, so a ward agent clearing its dev server with `pkill -f <workspace>`
   would kill every ward session on the machine.
9. **Confirms 0031's teardown asymmetry, with a default worth copying.** Closing the unit kills its
   session; quitting the host application leaves sessions alive, and killing them is an explicit,
   default-off opt-in (`FEATURES.md:701-708`) — "close tears down the live half" plus "doctor
   surfaces but never kills", validated in shipped software.
10. **If ward ever records liveness on the session record, derive it from timestamps** — one struct
    of transition stamps, no boolean that can disagree, weak evidence that never latches a durable
    claim (`docs/agent-lifecycle-design.md`). And **don't build status inference on terminal
    titles**: muxel's best signal is also its most fragile.

## Conflicts with ward's posture

- **The record is app-private, not git.** muxel's truth is `workspace.json` in the platform data
  dir, and the shared roaming copy is deliberately git-ignored (`FEATURES.md:631`), so it needs its
  own merge policy — "load whichever copy is newer", with a one-level backup per side. Ward gets
  that from git and should not import last-writer-wins.
- **muxel lets the live half create records.** Adoption reconstructs instance rows from what tmux
  reports on the host (`app.rs:5244-5330`) — live→record, the reverse of 0031's direction. Under
  record-as-truth, ward's doctor should _surface_ a stray session and leave adoption a deliberate
  human verb, not a side effect of opening a project.
- **Truncated ids as session names.** `muxel_<slug>_<uuid8>` takes eight hex characters
  (`tmux.rs:7-19`). Given ward's own history of recycled task codes, its tmux name should carry the
  full session id.
- **Single-writer scope differs.** muxel locks the _record_ to one process per workspace
  (`muxel-store/src/lib.rs:69-96`) while the host's sessions stay concurrently drivable by the iOS
  client. Ward's `.ward/store.lock` covers the same ground; 0031 should say plainly that the lock
  makes no claim about who is attached to a live session.
- **No read-only observe exists to copy.** The only attempt — polled `capture-pane` — was abandoned
  as unable to host an interactive agent (`ios/README.md:41-44`). 0031's `observe` will have to be
  either a genuine second tmux client in read-only mode (`attach -r`, which muxel does not use) or
  an accepted snapshot view; muxel offers no evidence that a polled view substitutes for a live one.
