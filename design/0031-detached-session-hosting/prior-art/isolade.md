# Isolade — https://github.com/isolade/isolade

Isolade is a local-first workbench that runs coding agents inside per-chat microVMs, driven by a
long-lived local server rather than by the terminal you started them from. There is no foreground
mode and no multiplexer: an agent turn is born detached, registered in an in-memory hub whose SSE
response is "just a subscriber", and a SQLite database is declared authoritative over everything the
hub holds. Clients attach by fetching a transcript page plus a hub snapshot and then tailing an
event stream, and re-attach by replaying persisted events when the live half is gone. Conversations
resume harness-natively — `claude --resume <id>`, codex `thread/resume` — with the session id stored
on the chat row and a per-turn anchor stored on each message.

**Vitals.** TypeScript (Bun workspaces) plus a small Rust/Tauri desktop shell; Apache-2.0; 19 stars,
205 commits, created 2026-07-15, last release v0.6.1 on 2026-08-04; ~97k lines across
`packages/{server,web,shared,sandbox}` and `app/`. A shipped product, not a sketch — installer,
desktop app, a `CHANGELOG.md` through six minor releases, a large test suite. Every claim below is
read out of code, not out of the README.

## Process model

The agent is not a pty and not a multiplexer pane. `packages/server/src/chat/claude-session.ts`
wraps "one long-lived `claude -p --input-format stream-json` process", pushing user turns onto stdin
as newline-delimited JSON and parsing stdout events; it starts through
`sandboxClient.execStream(vmId, command, …)` — a WebSocket into a microVM — so its immediate parent
is the guest's exec agent, not the server, and force-kill is expressed as aborting that WebSocket,
"which the sandbox turns into a SIGKILL of the child". Above it sit three nested parents: a sandbox
runtime that runs _in-process inside the server_ (`AGENTS.md`, `packages/sandbox`); the Bun/Hono
server; and that server's own parent, either the Tauri shell, which spawns it as a sidecar in its
own process group (`app/src/lib.rs`, `process_group(0)` plus a `libc::killpg` teardown), or a dev
terminal (`scripts/dev.sh`, `trap 'kill 0' EXIT`). A second harness rides the same shape:
`packages/server/src/chat/codex-manager.ts` keeps a `codex app-server --listen stdio://` per VM and
addresses conversations as threads.

## Detach, attach, observe

Attach is an HTTP conversation, and it is many-to-one. `packages/server/src/chat/stream-hub.ts`
states the model outright: "In-memory pub/sub for in-flight chat turns. The POST handler that starts
a turn registers it here. The SSE response itself is just a subscriber. Reconnects/multi-tab open
additional subscribers." A joining client gets an atomic snapshot — `subscribeSnapshot` folds the
render chunks and registers for later events in one synchronous step, so nothing slips between the
two — and every event carries a monotonic per-turn `seq` duplicated into the SSE `id:` line, so a
dropped client resumes from `Last-Event-ID`. The client half of that ladder is
`packages/web/src/lib/chat-stream.ts`: first attempt a POST, every retry a GET against the resume
endpoint.

Read-only observation falls out of the transport rather than being a mode. Subscribing mutates
nothing, and `packages/server/src/routes/chats.ts` exposes pure read paths (`/transcript`,
`/render`, `/events/in-flight`) that reconstruct a turn by folding persisted events —
`ChatManager.getInFlightEvents` in `packages/server/src/chats.ts` reads the chat's
`inFlightMessageId` and replays `chat_events` with no producer alive at all. There is no declared
read-only _role_, though: any client holding the launch bearer token can also POST.

The one tmux-like thing here is the shell tab: `packages/server/src/session-manager.ts` gives each
terminal a `PersistentSession` holding a 1 MB `RingBuffer` of pty output and a set of WebSocket
clients, where `attach` sends the whole buffer then tails, `detach` merely drops the client, and the
pty keeps running. Scrollback-replay attach in ~160 lines — deliberately _not_ how the agent is
hosted.

## Foreground and background

There are no transitions to design, because there is no foreground state. A turn the user walks away
from is expected to finish: the hub's grace timer after the last subscriber leaves defaults to six
hours, spanning "user switched to another chat and came back", while conceding it "is NOT the
primary abandonment backstop" — the desktop launcher reaping the sidecar is. Settled turns linger
five more minutes in memory so a slow reconnect tails the warm buffer instead of DB replay. One
level down, the CLI process outlives individual turns ("the process stays alive between turns so
background tasks it spawned survive"), retired by a 15-minute idle reaper in `claude-backend.ts`.

## State: durable versus live

The posture is stated in `stream-hub.ts` and enforced in code: "Persistence remains authoritative.
Every publish() writes to chat_events first, then fans out. On server restart turns are gone from
memory. Resume requests fall back to DB replay only." The enforcement is the interesting part — if
the `appendEvent` write fails, `publish` aborts the producer and throws rather than continuing,
because "exposing an event that cannot be replayed would make reconnect correctness impossible."
Nothing reaches a viewer that is not already in the record.

`packages/server/src/db/schema.ts` annotates each column with whether it is stored or derived and
why. `instances.unread` is stored, and the comment adds that "the companion 'working' signal is
derived live from the stream hub and is never stored" — the hub's `activeInstanceIds()` computes it
per read. `chats.inFlightMessageId` is "a direct O(1) hydration pointer" that "survives a server
crash". The `title_vms` table is the purest case: it exists _only_ so a crashed server can find and
destroy leftover VMs, and says so — "The live state of record is in-memory."

Record-to-live mapping is stored, never derived from a name. An instance row carries `vmId`; a chat
row carries `claudeSessionId` / `codexThreadId`; each assistant message carries its own `sessionId`
plus an `anchorId` (the transcript uuid to resume at, or codex's turn id). VM names are opaque —
`packages/sandbox/src/vms.ts` mints one with `randomUUID()`. Across a host reboot the VM rootfs, the
database, `port_forwards` and `terminals` survive; the CLI process, the hub's turns and the guest's
relay/watcher/broker processes do not, and re-establishing them is an explicit step.

## Identity and lifecycle

Ids are opaque uuids; human identity is a _generated title_, null until the first message is
summarized by a small titling model on an always-warm per-profile VM — so untitled means "abandoned
draft", which boot uses as a reaping heuristic. The sidebar groups by profile and by pinned/archived
sections. Note the shape: an instance is one VM and can hold several chats, so the isolation unit
and the conversation unit are different objects.

`InstanceManager.restart` in `packages/server/src/instances.ts` carries the line worth stealing:
"Same code path runs at server boot (auto-restart everything we know about) and from the user-facing
'Restart VM' action. There's no separate 'first attach' path." Create, restart and boot re-attach
all funnel into one `establishAttachments` reconciliation. Archive stops the VM and hides the row;
unarchive is just restart; failures land as `status=error` plus a free-form `lastError`, surfaced
with a manual retry.

Conversation resume is harness-native and anchored. `claude-backend.ts` builds `--resume <id>`, and
for an edited message adds `--resume-session-at <anchorId> --fork-session`, forking the prefix into
a _new_ session id so "the source session's file stays intact, which is what keeps the original
branch continuable"; codex mirrors this with `thread/resume` and `thread/fork` at a `lastTurnId`.
Crucially, a _live_ process cannot be rewound: "there is no control request to rewind a live
conversation … the resume-at/fork flags only exist at launch", so a fork always retires the running
process. Model, effort and fast-mode changes go the other way — applied to the live process through
control requests, specifically to avoid "trad[ing] running work for tidiness".

## Failure handling

Reconciliation at boot is automatic and unconfirmed. `packages/server/src/app.ts` fires, in order,
`titleVmManager.reapOrphans()` (destroy every titling VM a prior run left behind),
`instances.resyncAll()` (re-attach titled instances, force-stop archived ones, _delete_ untitled
ones), and `instances.sweepOrphanClients()` (remove sandbox clients whose instance row no longer
exists) — that last one being the reverse sweep, live-to-record rather than record-to-live.

Two scars show in the comments. First, auto-resuming everything was a footgun: it "booted up to a
dozen invisible msb processes every isolade start", which is why untitled instances are now reaped
instead. Second, stale-live is a genuine third state. `vms.ts` documents "stale-running" — the
record still says running but its agent socket is gone after a SIGKILL — and repairs it by
classifying the error, `kill()`ing the record and cold-booting from the surviving rootfs. The
classifier carries its own bug report: letting it go stale against an SDK bump "is exactly how
stale-running instances got stuck in `error` after every unclean shutdown instead of self-healing".
Orphan prevention runs the other way too — `parent-watchdog.ts` watches an inherited fd for EOF and
polls for a ppid reparent, because macOS has no `PR_SET_PDEATHSIG` and orphaned VMs "collide with
the next launch". Finally, `routes/chats.ts` treats a repeated POST carrying the same stable client
message id as "a stream recovery, not a second prompt", rejecting only a reuse with different
content.

## Takeaways for ward

1. **Record-as-truth needs an ordering rule, not just a declaration.** Isolade's `publish` persists
   before it fans out and aborts the producer if the write fails. 0031 should state the same
   invariant: nothing about a live host is reported to a caller — or acted on — before the record
   that would let it be reconstructed has been written. Its companion is annotating each record
   field with stored-versus-derived _and why_, the way Isolade's schema does; that habit is why its
   truth model stays coherent across a large surface.
2. **Make `attach` and `open` one code path.** "There's no separate 'first attach' path" is the
   cleanest idea in this repo. 0031 describes `attach` as re-creating from the record via
   harness-native resume when the live half is gone; fold `open` into the same `ensure(record)`
   function, differing only in whether the record already existed, so the rare path runs on every
   launch.
3. **Store the host name that was actually used, alongside deriving it.** Isolade stores `vmId` and
   derives nothing from names. 0031's `ward-<workspace>-<session-id>` gives doctor a free reverse
   index, worth keeping — but recording the name the session was really created with means a manual
   `tmux rename-session` degrades to "live half missing" rather than orphaning the record silently.
4. **Give doctor both sweeps.** Isolade runs record→live (`resyncAll`) _and_ live→record
   (`sweepOrphanClients`). 0031 says doctor surfaces stray live sessions; the mirror — a record
   whose named tmux session is absent — deserves equal billing, since a reboot produces it.
5. **Model "stale-live" as a third state, and test liveness at two levels.** A named tmux session
   that exists but whose pane process is dead is neither live nor gone; Isolade wedged instances
   into `error` after every unclean shutdown until it classified exactly this. It also separates "is
   the host up" from "is the conversation resumable" (`claudeSessionId` on disk) — ward has the same
   two halves in the tmux session and `ward session locate`, so `attach` should say which is missing
   and `resume`'s refusal-while-live should test liveness, not existence of the name.
6. **Record a per-turn anchor, not just the session handle.** Storing `sessionId` + `anchorId` per
   message is what lets Isolade resume at a point and fork without disturbing the original branch.
   Even if ward never forks, a recorded last anchor makes `attach` after a crashed turn resumable at
   a known position instead of "wherever the harness left off".
7. **Detached as the only mode, with foreground as an immediate attach.** Isolade has no foreground
   at all and loses nothing by it. If 0031 keeps a foreground↔background axis, the cheapest correct
   answer is to always detach and let the launching command attach synchronously by default — which
   makes the background case the tested one.
8. **Observe should also work from the record alone.** Isolade's `/events/in-flight` renders a turn
   with no producer alive. `tmux attach -r` covers read-only observe of a _live_ session; 0031
   should also define observe over a session whose live half is gone, served from the record.
9. **Give the refusal an idempotent escape hatch.** "Resume refused while live" matches Isolade's
   409 "another turn is in flight" — but Isolade pairs it with same-id replay so a caller that
   legitimately lost its stream is not told 409 forever. Re-running `attach` on a session you
   already hold must be a no-op re-attach, never a refusal.
10. **Name the abandoned state before automating anything about it.** Isolade's "untitled means
    never really started" heuristic exists only because auto-revival went wrong at scale (see
    below). Ward's surface-never-kill posture is vindicated, but doctor still needs a _word_ for a
    session whose record was opened and never used.

## Conflicts with ward's posture

**The live half is not disposable here, and ward should say why its own is.** An Isolade VM's disk
holds uncommitted work — the schema even carries `diffAdded`/`diffDeleted` probed from inside the
guest — so destroying the live half loses real state, which is why recovery cold-boots from the
surviving rootfs rather than starting fresh. Ward's worktrees live on the host, so ward genuinely
can treat the tmux session as a cache. That is a precondition 0031 should state, not assume; the
moment anything durable lives only inside the pane, the posture stops holding.

**A SQLite database owned by one writer versus markdown in git.** Isolade buys transactions,
indexes, millisecond ordering and an append-only usage log that outlives the rows it describes; it
pays in opacity — no human reads `chat_events`, and no other tool inspects it. Ward's markdown
records are inspectable, diffable and mergeable, but cannot do read-modify-write under concurrency,
which is precisely why ward needs `.ward/store.lock` where Isolade needs nothing.

**Automatic reaping without confirmation.** Isolade destroys orphan titling VMs, deletes untitled
instances and force-stops archived ones at every boot, silently. 0031's doctor surfaces stray live
sessions and never kills them. Isolade's trade buys a workbench that looks identical after a crash
and costs the user any chance to inspect what was thrown away. Ward's choice is right for a tool
whose whole value is the record — but the cost is real, and 0031 should pair "never kills" with a
one-command _cleanup verb_ the human can run, or strays accumulate.

**A daemon versus a cold CLI.** Isolade can hold a live index in memory and treat the database as
recovery because exactly one long-lived process ever writes. Every `ward` invocation is a cold
process with no memory of the last, so anything Isolade keeps in RAM ward must either store or
re-derive from tmux per call — which argues for keeping the derived surface to `tmux list-sessions`
filtered by the name prefix and nothing more expensive on the hot path.
