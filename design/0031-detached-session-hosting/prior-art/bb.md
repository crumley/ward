# bb — <https://github.com/get-bb/bb>

**Session model in three sentences.** bb is a client–server agentic IDE: a central server owns a
SQLite database that is explicitly the only source of truth, and per-machine host daemons spawn
agent provider processes headlessly (Claude via the Claude Agent SDK, Codex via its app-server,
generic ACP agents) as JSON-RPC "bridge" subprocesses over stdin/stdout — no terminal, no tmux, no
pty for the agent itself. Detach/attach is therefore not a process operation at all: every client
(web, desktop, CLI, mobile) is a view over the durable event stream, and the live provider process
is a disposable cache that is reaped when idle and rebuilt on demand via harness-native resume,
keyed by a provider session id recovered from the durable event log. Its distinctive machinery is
reconciliation: state-machine lifecycle tables applied by CAS single-writers, a two-way diff between
the DB's belief and the daemon's report on every reconnect, and periodic orphan-cleanup sweeps — all
automatic, none human-confirmed.

**Vitals.** TypeScript pnpm monorepo (~40 packages, 9 apps, 20 plugins). Created 2026-02, ~5k
commits, ~2.6k stars, active daily. Heavily implemented and densely tested; comments cite incident
numbers. Everything below was read in code.

## The session model, condensed

- **Process model.** The unit of work is a **thread**, not a terminal. launcher → server + host
  daemon → runtime per environment → one bridge subprocess per provider
  (`packages/agent-runtime/src/runtime-provider-process.ts`), a plugin-shipped Node bundle speaking
  line-delimited JSON-RPC (`docs/provider-bridge-protocol.md`). The Claude bridge drives the
  **Claude Agent SDK** in-process (`plugins/provider-claude-code/src/bridge/sdk-session.ts`) —
  headless, approvals routed through the protocol, never a TUI. No tmux/zellij/screen anywhere;
  node-pty exists only for _user_ terminals attached to threads.
- **Detach/attach.** Nothing to attach to: threads run under the daemon regardless of clients.
  Following = reading the append-only event stream (SQLite over HTTP + WebSocket notifications);
  `bb thread log/show/wait` from the CLI. Every view is observation; steering (send, stop, approve)
  is separate API calls gated by `pending_interactions` rows. No exclusive attachment, so no
  distinct read-only mode is needed.
- **Foreground↔background.** Dissolved: every run is background from birth; "foreground" is a client
  currently rendered. The cost: no real interactive harness TUI — the UI is bb's own timeline
  reconstruction from a delta grammar.
- **State model.** Everything durable lives in one SQLite DB — threads with a lifecycle `status`,
  append-only `events` (each may carry `provider_thread_id`), environments, hosts, daemon sessions
  (`packages/db/src/schema.ts`); the docs say the server is stateless and the DB is the truth.
  Record→live mapping is **derived**: resume calls `getLastProviderThreadId` over the event log and
  dispatches harness-native resume (SDK `resume: sessionId`); nothing stores "running". Reboot
  survival is exactly this entry's posture: record survives, live half rebuilt lazily.
- **Identity.** Opaque prefixed ids (`thr_…`, `env_…`, `hses_…`). Humans see inferred thread titles
  grouped by project and user-defined sections. The provider's own session id is a separate
  identity, captured via a `thread/identity` notification from inside the bridge and recorded on
  events — bb's id and the harness's id are never conflated.
- **Lifecycle.** Statuses `idle/starting/active/stopping/error` with a generated state diagram
  (`packages/domain/src/thread-lifecycle.ts`); transitions are events applied by CAS single-writers
  with supersession predicates, so a stale event is a logged no-op, never corruption. **Idle is the
  resting state, not closed**: a turn ending returns the thread to idle; an idle provider session is
  later **reaped** on a timeout with no record change — the next message transparently resumes. Stop
  has two intents, `interrupt` vs `release` (unload the live half of an idle thread, leaving it
  resumable). "Close" is archive/delete, which also drives managed-environment teardown. Resume
  capability is declared honestly per provider and refined per session (`sessionRestore` in the
  handshake; `sessionRestorable: false` recorded where a provider cannot).
- **Failure.** On every daemon reconnect the server diffs both directions
  (`reconcileDaemonReportedThreads`): DB-active but daemon-missing → interrupt with a typed reason
  (`host-daemon-restarted`); daemon-active but DB-idle → revive; DB-stopping but daemon-running →
  re-dispatch the lost stop. Revival is blocked for threads whose last interruption was itself a
  daemon restart (anti-flap). Startup and periodic orphan-cleanup sweeps use timeouts rather than
  instant demotion. A poisoned SDK session is torn down and replaced resuming the same provider id,
  announced first ("never silent"). Watchdogs make stalled turn-starts visible. No doctor verb; no
  human-confirmed cleanup of live state.

## Takeaways for ward

1. **Convergent validation of the core stance.** A ~5k-commit production system independently lands
   on: durable record authoritative, live process a disposable cache, resume derived from the record
   via harness-native resume, exit distinct from close. The strongest external evidence this entry's
   posture works.
2. **Reconciliation is two-way.** Doctor's strays cover live-behind-record; bb shows the record can
   also be behind the live world. The converse check — a live host session whose record says closed
   — is in this entry's stray finding, but bb's typed **interruption reasons** written to the
   durable trail ("why did the live half last vanish") would make attach's re-create explainable,
   and its **anti-flap guard** matters the day ward auto-recreates anything.
3. **`release` as a named verb.** Deliberately unload the live half of an idle session, record stays
   resumable — distinct from interrupt and from close. Ward has it implicitly (kill the tmux
   session); bb suggests naming it, since "park this session cheaply" is a real act.
4. **Capability honesty about resume.** bb never assumes a session is resumable; the code that
   implements restore declares it, refined per session. Ward assumes `claude --resume` works;
   recording resumable yes/no/unknown on the session record would make attach's re-create path fail
   legibly instead of at spawn.
5. **Stale-event tolerance.** CAS single-writers where an out-of-date lifecycle event is a logged
   no-op — the right discipline when doctor, close, and a live session race over one record.
6. **Idle-reap validates cache-teardown-is-cheap.** bb kills idle provider processes on a timer
   because rebuilding from the record is transparent; the record's completeness is what makes live
   state cheap to discard. Same argument as this entry's reboot story, proven in production.

## Conflicts with ward's posture

bb's truth is a server-held SQLite DB — unreadable without bb running, and the whole design presumes
a resident server and daemon; Ward's markdown-in-git record is legible dead. bb replaces the
harness's own interactive surface with a timeline reconstruction, at the cost of the entire
bridge/delta-assembler apparatus — evidence of how much code the structured-event end of the trade
costs, where tmux keeps the genuine `claude` TUI for almost nothing. bb has no read-only/exclusive
distinction because its transport makes every client read-only by construction; ward's
observe/attach split is necessary precisely because tmux attach is inherently read-write. And bb
cannot express "resume refused while live" — its equivalent conflict is handled inside the bridge,
where a second resume would _replace_ the live session: exactly the accident ward's refusal prevents
at the door.
