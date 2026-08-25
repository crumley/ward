# cmux — <https://cmux.com/> · <https://github.com/manaflow-ai/cmux>

**Session model in four sentences.** cmux is a native macOS terminal (Ghostty rendering engine,
Swift + AppKit) that owns the pty for every pane it shows; an agent is an ordinary child process
inside a cmux terminal surface, not a daemon and not a multiplexer client. There is therefore no
detached live half locally — when the app quits, every local agent dies — and continuity comes
entirely from a durable record plus **harness-native resume**: cmux records what each agent session
is and where its transcript lives, then on relaunch re-runs `claude --resume <id>` /
`codex resume <id>` / one of fourteen more per-agent forms. The surface→session binding is
deterministic by construction (a cmux-minted `CMUX_SURFACE_ID` env token injected at spawn, with tty
and process-tree as backstops), and the project's central design document is an argument that every
heuristic alternative — terminal-title matching, newest-transcript-by-mtime — had to be deleted
outright. The live process is treated so explicitly as a disposable cache that cmux will _kill idle
agents on purpose_ to reclaim RAM and silently resume them when you return to the tab.

**Vitals.** Swift-dominant (~8.7k `.swift` files) with a Go remote daemon and TypeScript CLI/web
pieces; GPL, Manaflow Inc.; read at commit `eb76c7c6` (2026-08-24). Very active and very large — PR
numbers past #10600, issue references past #8446, twenty-one translated READMEs. Maturity is uneven
by subsystem: local agent tracking is implemented and densely tested, the detachable _remote_ PTY
work is still `IN PROGRESS`. Everything below cites a repo file or docs page; the site's framing
("every agent in a run is visible and controllable") is marketing and is not relied on here.

## What was verified

**Process model — the app owns the pty; tmux appears twice, never as the local host.**
`docs/agent-session-tracking-spec.md:322-326` says it plainly: "cmux does NOT own a `Process` handle
for a terminal agent (the agent is a child in the pty), so there is no `terminationHandler` to
hook." tmux enters only in two unrelated roles. First, _impersonation_: cmux implements a
tmux-compatible CLI (`capture-pane`, `resize-pane`, `pipe-pane`, `swap-pane`, `join-pane`,
`wait-for`, `set-hook`, …) plus an internal `__tmux-compat` dispatcher
(`docs/cli-contract.md:181,296-318`), so agents that shell out to tmux work inside cmux panes.
Second, _remote mirroring_: a real tmux on an SSH host is driven over control mode and mirrored into
native panes, with tmux as the grid authority (`docs/remote-tmux-sizing-design.md:1-42`). Local
hosting is never delegated to a multiplexer.

**Durable record — two app-private JSON stores.** Layout and scrollback go to a "versioned JSON
snapshot" at `~/Library/Application Support/cmux/session-<bundle-id>.json`
(<https://cmux.com/docs/session-restore>). Agent bindings go to
`~/.cmuxterm/<agent>-hook-sessions.json`, written by hook processes fired inside the agents; the
shape is `Sources/RestorableAgentHookSessionRecord.swift` — `sessionId`, `workspaceId`, `surfaceId`,
`cwd`, `transcriptPath`, `pid`, **`pidStartSeconds`/`pidStartMicroseconds`** ("exact
process-generation identity captured when the hook recorded `pid`"), a sanitized `launchCommand`,
`lastPermissionMode`, `isRestorable`, `agentLifecycle`, `updatedAt`. The record reads with nothing
running: `cmux sessions [list] --json` "reads saved hook state from disk and never connects to a
cmux socket" (`docs/cli-contract.md:185-201`).

**Identity and binding.** `CMUX_SURFACE_ID` (with `CMUX_WORKSPACE_ID`/`CMUX_PANEL_ID`/`CMUX_TAB_ID`)
is injected as a PROTECTED env key into every surface at spawn
(`docs/agent-session-tracking-spec.md:46-52`), so even a hand-typed `claude` inherits it. A fired
hook resolves its surface in a fixed order: explicit flags, inherited env, controlling tty matched
against the app's live terminal table, then the agent pid found in a surface's process tree (lines
53-64). The principles forbid the alternatives — "Never from terminal-title string matching. Never
from newest-file-by-mtime scans" (line 20) — and "What gets deleted" (lines 268-281) removes the
entire title-detection file, the `newestClaudeTranscript` claim machinery, and the `kill(pid,0)`
liveness sweep.

Identity durability is the spec's own weak point. Surface ids are rehydrated verbatim on restore
only since commit `44dc053e` (2026-06-12), and are still regenerated on collision
(restore-into-a-running-instance, duplicate-workspace); workspace ids are **always** regenerated and
are explicitly forbidden as the binding key (lines 108-147). The stated cause generalizes: "restore
mints fresh objects, and only the id something depended on was preserved."

**Resume is the reattach primitive.** `docs/agent-hooks.md:18-36` is a sixteen-row matrix of agent →
binary → installed hook file → native resume command → feed bridge; Claude Code is
`claude
--resume <id>` through a cmux-injected `--settings` wrapper. The stored launch command is
sanitized before replay: it "preserves model, sandbox, config, and cwd-related flags. It drops
prompts, credentials, old session selectors, and noninteractive commands so relaunch resumes the
session instead of starting a new task or leaking secrets" (line 50). Replaying a _user-supplied_
resume command is a privilege, not a record field: `cmux surface resume set --shell` commands are
"kept for inspection and manual restore by default", and auto-run requires a prefix approval "signed
by cmux" that also binds cwd and exact env values — "A process can propose a command, but it cannot
make that command sticky" (lines 114-118). Auto-resume is globally defeatable via
`terminal.autoResumeAgentSessions: false`, which restores layout and leaves agents idle (lines
120-136).

**Resume is refused while live — twice over.** `Sources/AgentResumeLiveness.swift` centralizes "is
there already a live process for this agent session?" so the launch-time gate and the persist-time
stale-binding reconciliation "agree on the same definition of live (#8446)". Because the live index
lags a just-spawned process, `Sources/AgentResumeLaunchGuard.swift` adds a 60-second TTL claim on
`(kind, sessionId)` so two panels restoring the same session "never both fire `codex
resume <id>` /
`claude --resume <id>` concurrently", with an explicit release for a claim whose launch never
happened. The TTL is deliberate: "A permanent, never-expiring claim would otherwise block a
legitimate resume the next time the same session is restored."

**Exit detection and stale live state.** The pid-polling sweep was replaced by a
`DispatchSource.makeProcessSource(… .exit)` watcher on the recorded pid, flipping to `ended` "ONLY
if the exited pid is still the record's current pid (so a `claude --resume` under a new pid is not
ended by its predecessor's exit)" (spec lines 326-331). Stale bindings are pruned by
`Workspace.reconcileSurfaceResumeBindings` (`Sources/Workspace.swift:1310`) via
`isStaleAgentHookBinding` (`Sources/Workspace+AgentLifecycle.swift:450-492`), which carries the
sharpest caveat in the repo: a remote agent's process "can never appear in that local scan, so
treating it as this function's kind of stale would prune every live remote agent-hook binding on the
very next reconciliation" — so only local-launch bindings are judged, and the SSH path uses bounded
consecutive-miss counters rather than one observation. `ended` is retained, never deleted: it
disables the input bar and leaves the session visible (principle 6).

**Read-only observation.** cmux's iOS "coding agent" mode is a genuine observe surface with a
pull/push split: "Push is best-effort; pull is authoritative" (principle 4). Every `AgentSession`
carries a monotonic `version` bumped on any change; pushes are hints carrying that version; the
client re-pulls `mobile.chat.sessions`/`mobile.chat.session` on reconnect, foreground, resubscribe,
and any detected version gap, applying a push only if its version exceeds the last applied (lines
190-236). Reading and steering (`send`/`interrupt`/`answer`) are separate RPCs, and steering is
gated off when `state == ended` (lines 292-299).

**Detach/attach exists — but only for remote.** Having no local detached half, cmux built one for
SSH: `cmuxd-remote` runs as a persistent authenticated daemon slot exposing
`session.open/attach/resize/detach/status/close`, with a `pty.session.persistent_daemon` capability
that must be advertised before a saved PTY session id survives app relaunch
(`docs/remote-daemon-spec.md:46,52-54`); user verbs are `ssh-session-list`,
`ssh-session-attach
--session-id <id>`, `ssh-session-cleanup` (`docs/cli-contract.md:112-114`).
Multi-attachment sizing is tmux's rule verbatim — "smallest screen wins" — and "If no attachments
remain, keep last-known PTY size (do not force 80x24 reset)" (`remote-daemon-spec.md:110-135`). The
whole milestone (M-011) is still `IN PROGRESS`.

**Deliberate killing of live sessions.** Agent Hibernation "kills idle background agent processes to
free their RAM and CPU, then resumes each one with its saved session when you return to its tab"
(`docs/agent-hooks.md:60-95`). The gating is the instructive part: restorable and resume-buildable,
lifecycle-`idle`, off-screen, over `maxLiveTerminals` (12), quiet for `idleSeconds` (5) — then a
~60s confirmation window during which output, input, lifecycle and pid must all stay unchanged, any
change cancelling. Only then `SIGTERM` to the agent's process group "scoped to that workspace and
surface", after revalidating "the exact process generation and workspace/surface scope". Visible
terminals are never touched; the placeholder shows a manual Resume button.

**Reconciliation as the execution model.** `docs/remote-tmux-reconcile-design.md` argues over 1084
lines that edge-triggered handling of live-vs-record state produces a bug _class_ — a ledger of
twelve fixes, each a hand-written re-arm for "state that only a lost edge could have corrected". The
replacement is a dirty _generation_ counter plus one pass that snapshots the world in a single
instant, computes desired as a pure function of that snapshot, diffs against actual, and commits;
convergence is an empty diff at an unchanged generation (lines 42-88).

## Takeaways for ward

1. **Put a ward token inside the live half, don't only name it.** The deterministic tmux name makes
   _finding_ the host easy but makes _attribution_ a name-parse. cmux's principles 1–3 insist the
   binding be established by construction: export `WARD_SESSION` into the tmux session's environment
   at `open`, so `attach`, `close`, and doctor confirm a candidate host is ward's own rather than
   inferring it from a string anyone can `tmux rename-session` into existence.
2. **Doctor's stray check needs a process generation, not a name or a pid.**
   `RestorableAgentHookSessionRecord` pairs `pid` with `pidStartSeconds`/`pidStartMicroseconds`
   precisely so a recycled pid cannot be mistaken for the original. Whatever 0031 stores about the
   live half should carry a start-time, so doctor can tell "still the same host" from "a different
   host wearing the same name".
3. **"Resume refused while live" wants two gates.** cmux needed both a liveness check and a 60s
   launch claim, because the liveness index cannot see a process spawned microseconds ago. Ward has
   the same race between two concurrent `ward session attach` calls: the store lock covers the
   record write but not the window between that write and the tmux session existing. Take the claim
   inside the lock, expire it, and release it explicitly when the spawn fails.
4. **Harness-native resume is the right seam, and the argv shapes are already catalogued.**
   `docs/agent-hooks.md:18-36` is a maintained matrix of sixteen harnesses' resume invocations
   (`claude --resume <id>`, `codex resume <id>`, `amp threads continue <id>`,
   `acli rovodev run
   --restore <id>`, …). If ward grows a second harness behind `agent.harness`,
   that table is the shape of config it needs — resume is per-harness argv, not a universal verb.
5. **Treat replay as a privilege, and store an id rather than a command.** cmux sanitizes the stored
   launch command and additionally requires a _signed_, cwd- and env-bound prefix approval before
   any process-proposed resume command auto-runs. Ward's records are markdown in git, editable by
   hand and by PR — if `attach` ever reconstructs a command line from a session record, that field
   is an execution vector. Derive the argv from ward's own resolved `agent.*` config plus a bare
   session id, and store only the id.
6. **Absence of a live process is not evidence of death.** `isStaleAgentHookBinding`'s remote
   carve-out is the lesson: a scan that cannot see a class of hosts must not judge that class.
   Doctor should require N consecutive observations before naming a session stray (cmux uses bounded
   miss counters for exactly this), and must never read "tmux server unreachable from here" as
   "session gone".
7. **Confirms record-as-truth with the live half absent.** `cmux sessions --json` deliberately reads
   disk and never dials the app socket, and it is the docs' first troubleshooting step for a failed
   resume. Ward gets this free from markdown in git; 0031 should state it as a guarantee — every
   read verb answers with the tmux server and the agent both gone.
8. **Make `observe` a versioned pull, not only a tail.** "Push is best-effort; pull is
   authoritative" with a monotonic per-session `version` is the cheapest correctness story for a
   read-only view: any missed event self-heals on the next pull. If 0031's `observe` is
   `tmux
   attach -r` it inherits tmux's stream semantics — pair it with a record snapshot the
   observer re-reads on attach.
9. **Confirms exit ≠ close, and extends it: `ended` must stay observable.** cmux's principle 6 —
   "`ended` is retained, not deleted … It must not gate presence" — reaches ward's "when the agent
   exits, the session stays open" from the other side. Extend it: `observe` should still work on a
   session whose live half is gone, serving the record and transcript, with only `resume` refused.
10. **Confirms on-demand attach over auto-restore.** cmux's default is to auto-replay every saved
    resume command at app launch, and that default is what forced the signed-approval system, the
    global opt-out, the duplicate-launch guard, and the stale-binding pruner. 0031's "attach
    re-creates from the record when the live half is gone" pays none of that cost, because nothing
    is re-created until a human asks.
11. **If doctor ever grows teeth, steal hibernation's gating recipe.** 0031's never-kill rule is
    right, but cmux's kill path is the reference for what safe automatic teardown costs: never touch
    a visible session, require an explicit idle lifecycle, require a stability window with output,
    input and pid unchanged, revalidate the exact process generation immediately before signalling,
    signal the process group scoped to the one session, and leave a manual Resume behind.

## Conflicts with ward's posture

**cmux is not evidence that multiplexer-hosted local sessions work — it is evidence for the other
half of 0031.** Its local design deliberately owns the pty and rebuilds from the record, so it
validates record-as-truth and harness-native resume strongly and says nothing in favour of the tmux
host. Notably, when cmux _did_ need a surviving live half (remote SSH) it did not reach for tmux: it
wrote a daemon with `session.attach/detach` and slot leases, and that work is still unfinished.

**Its record is written by the agent, not by the tool.** `~/.cmuxterm/<agent>-hook-sessions.json` is
populated by hook processes running inside the agent. That is what makes cmux's binding work for a
hand-typed `claude`, and it is exactly what ward should not copy: it puts the agent inside the trust
boundary of the record. Ward's records are written by `ward`; 0031 should keep the agent strictly a
subject of the record, never an author of it.

**App-private mutable JSON versus reviewed markdown.** cmux can rewrite its store on every hook
event because nobody reads it. Ward cannot: every field 0031 adds to a session record is a field a
human reads in a diff. That argues for storing the minimum non-derivable facts (session id, harness,
handle, scope, purpose) and deriving everything about the live half at read time, rather than
mirroring cmux's twelve-field binding record.

**It kills live sessions automatically; 0031 forbids that.** Hibernation and the memory-pressure
path both terminate agents without asking. "Doctor surfaces stray live sessions but never kills
them" is the opposite commitment and should stay that way — cmux's elaborate gating measures how
much machinery an automatic kill costs to make safe.

**Its identity story is a direct warning about ward's session names.** cmux had to special-case
surface ids to survive restore, still regenerates them on collision, and forbids workspace ids as a
binding key because they are volatile. 0031's `ward-<workspace>-<session-id>` embeds a _workspace_
component in the live host's name. If a workspace slug can ever change — a rename, a clone, a move —
that name is volatile in exactly the way cmux's workspace id was, and every live host silently
orphans. Either pin the name to the immutable session id alone, or make the workspace component
provably immutable and say so in the entry.
