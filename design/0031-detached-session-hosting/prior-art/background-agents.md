# Open-Inspect (ColeMurray/background-agents)

Source: https://github.com/ColeMurray/background-agents

Open-Inspect is an open-source reimplementation of Ramp's Inspect: a session is a durable
server-side record, and the compute that runs it is an interchangeable, disposable cloud sandbox. No
session ever runs in your terminal — you send a prompt to a control plane, which spawns (or
restores, or resumes) a sandbox on a provider, streams events back over a WebSocket, and snapshots
the filesystem when work goes idle. It is the maximal version of ward's own posture: the record is
truth, the live half is a cache, and the two are kept at deliberately different levels with no
shared vocabulary. What ward calls attach it gets for free, because no client ever owned the
process.

**Vitals.** TypeScript (~9.5 MB) plus a Python sandbox runtime (~1.3 MB); MIT; ~2,675 stars, 393
forks; created 2026-01-25, last pushed 2026-08-24 with the tip commit merging PR #1590. Shipped, not
sketched: eleven workspace packages, five sandbox backends, heavy unit coverage of the lifecycle
decision logic. Aspiration is confined to `docs/plans/`; everything below is implemented code.

## Process model

No multiplexer, no pty broker, no local daemon — `grep -w tmux` over the tree returns nothing. The
agent's parent is a Python supervisor running _inside_ a cloud sandbox
(`packages/sandbox-runtime/src/sandbox_runtime/supervisor.py`), composing and monitoring five
process owners: the OpenCode agent server, a bridge speaking WebSocket to the control plane,
code-server, a ttyd web terminal, and a browser desktop. Above it, each session is a Cloudflare
Durable Object with its own SQLite database (`packages/control-plane/src/session/durable-object.ts`,
schema in `session/schema.ts`). The harness is OpenCode, chosen because it "runs as a server"
(`docs/HOW_IT_WORKS.md`); model providers plug in underneath it.

## Following and steering; no read-only observe

A human follows a session through the same authoritative WebSocket every client uses. ADR 0003
(`docs/adr/0003-session-snapshot-handoff.md`) pins the mechanism: every subscribe or reconnect gets
one full canonical snapshot read from SQLite, and the handoff to the live stream is synchronous — no
`await` between the final read and socket registration — so a mutation is either in the snapshot or
after it on the ordered stream, never both and never neither. That is the whole reattach story, with
no revision cursors, delta log, or per-socket applied revision.

Steering is multiplayer by default: any participant can prompt, prompts queue behind in-flight work
rather than interrupting, and each is attributed to its author for commit authorship. There is
presence but no viewer role — roles are only `owner | member`
(`packages/shared/src/types/sessions.ts`) and the shell starts as `ttyd … --writable bash`
(`sandbox_runtime/web_terminal.py`). So there is no read-only observe: the event stream is
_effectively_ observe-only for a passive watcher, but nothing enforces it. Interactive channels
(ttyd, code-server, VNC) are gated by per-session credentials fetched from an authenticated
`GET /sessions/:id/sandbox-access`, never carried in snapshots or messages
(`session/sandbox-access.ts`, `sandbox_runtime/ttyd_proxy/server.ts`).

## Foreground / background transitions

None — there is no foreground. Background is fixed at start and is the only mode. The nearest
analogue is _warming_: the web client spawns a sandbox on the first keystroke, before a prompt
exists (`evaluateWarmDecision`, `sandbox/lifecycle/decisions.ts`). That optimization left its own
garbage — a `created` session no prompt ever advanced — and needed a sweeper
(`session/abandoned-draft-sweep.ts`, TTL 8 hours), whose comment is candid about why the TTL is in
hours and not the sandbox's minutes: the composer holds no socket to a warm session, so the
compute-side idle clock can fire while a human is still typing.

## State model: the two-level status split

The sharpest idea in the repo is two status vocabularies, with the reasoning written into the type
(`packages/shared/src/types/sessions.ts`):

- `SessionStatus` — `created | active | completed | failed | archived | cancelled` — "a session's
  conversation lifecycle: durable, user-visible, and **independent of whether any compute is
  currently attached**."
- `SandboxStatus` —
  `pending | spawning | connecting | warming | ready | stale | snapshotting |
  stopped | failed` —
  "the state of a session's CURRENT sandbox incarnation… A session may be `completed` with a live
  sandbox attached, or `active` with none at all. **Do not render this as the session's status:
  doing so is what let the sidebar and the header disagree about the same session.**"

That last line is a bug report embedded in a type definition, and it is the exact failure 0031 is
designing away. The same file records a pruning rule: every member of the live enum must be
producible by some code path, and `syncing`/`running` were deleted because nothing ever wrote them.

Reboot survives everything in the Durable Object's SQLite — messages, events with stable
`eventId`/`timelineSequence` envelopes, artifacts, participants, PR links — plus a D1 index for
cross-session listing. The sandbox does not survive, and the record→live mapping is **stored, not
derived**: the `sandbox` table holds `modal_sandbox_id`, `modal_object_id` (provider handle),
`snapshot_image_id`, `snapshot_runtime_version`, `auth_token_hash`, `last_heartbeat`,
`last_activity`, and rotating access URLs and passwords (`session/schema.ts`). Even the
harness-native conversation handle is on the record:
`session.opencode_session_id TEXT -- OpenCode
session ID (for 1:1 mapping)`.

## Identity, naming, listing

Sessions are addressed publicly by `session_name`, falling back to the row id then the Durable
Object id (`session/public-session-id.ts`). Sandbox names are timestamped —
`sandbox-<owner>-<repo>-<now>`, or `sandbox-<sessionId>-<now>` with no repo
(`buildSandboxIdForSession`, `sandbox/lifecycle/manager.ts`) — and that timestamp is load-bearing;
see fencing below. Grouping is by parent (`parent_session_id`, `spawn_depth`, `spawn_source`) for
agent-spawned children; listing is a D1 query on status
(`packages/shared/src/session-list-query.ts`).

## Lifecycle semantics

Open and close are kept separate from run and exit. `archive` is a filing action, refused when work
is queued and refused for cancelled sessions; `cancel` is terminal and additionally sends
`{type: "shutdown"}` to the sandbox and marks it `stopped`; `unarchive` explicitly does not assert
`active` but calls `settleFromMessageState()` — "Restoring, not starting: unarchive returns the
session to whatever its messages already imply. Asserting `active` here claimed work that does not
exist… so an idle session sat in the in-progress group until someone prompted it again"
(`session/http/handlers/session-lifecycle.handler.ts`). Which statuses accept new work is its own
named predicate, `isSessionPromptable`, deliberately including `completed` and `failed` (idle, not
over) while excluding `archived` and `cancelled` (`shared/src/types/session-activity.ts`).

Conversation resume is harness-native and cache-checked, not replayed. The bridge persists the
OpenCode session id to a file in the sandbox, reloads it on boot, and probes the live agent with
`session_exists()` before trusting it, dropping to `None` and creating a fresh OpenCode session on
any failure (`sandbox_runtime/bridge.py`, `_load_session_id`). The user-visible transcript is never
at risk, because it lives in the control plane's event log regardless of what OpenCode remembers.

Restarting compute is a three-way decision in one pure function, `evaluateSpawnDecision`
(`sandbox/lifecycle/decisions.ts`): `resume` the same provider sandbox (Daytona, E2B), `restore` a
filesystem snapshot (Modal, Vercel, OpenComputer), or `spawn` fresh. Restore is version-gated —
`isSnapshotRuntimeCompatible` fails closed below `MIN_COMPATIBLE_RUNTIME_VERSION`, because "a
snapshot carries the whole sandbox filesystem, including the pinned agent binary, so restoring one
silently resurrects the runtime that took it." The comment names the incident: a runtime fix that
never reached any session that kept restoring.

## Failure handling

Layered, and mostly automatic rather than human-confirmed.

- **Fencing over killing.** An ambiguous spawn failure retries with a rotated sandbox id _and_ auth
  token hash, because "the failed attempt may have actually created a sandbox provider-side… and
  rotating the token hash and sandbox id locks such an orphan out of this DO exactly like the next
  user-initiated respawn would" (`lifecycle/manager.ts`). A bridge reconnecting with a stale
  identity is refused 403 "Sandbox credentials changed" (`session/durable-object.ts`). The record
  decides which incarnation is legitimate; the illegitimate one is denied, not hunted down.
- **Reconnect blocking is narrower than deadness.** `isDeadSandboxStatus` covers
  `stopped | stale | failed`; `isSandboxReconnectBlockedStatus` covers only `stopped | stale`, since
  "Failed is intentionally reconnectable: a slow boot can outlive the connecting watchdog and then
  self-heal when its bridge arrives." The dead set is a deny-list, so unknown states count as live.
- **Watchdogs.** 30 s heartbeats with a 90 s staleness threshold; a 120 s connecting timeout that
  also covers `spawning`, because an interrupted spawn can otherwise pin the status and make every
  later attempt "skip with 'already spawning' forever"; a 10 min inactivity timeout extended 5 min
  while clients are connected; a circuit breaker at 3 spawn failures per 5 min window. In-sandbox,
  the supervisor restarts each crashed child up to `MAX_RESTARTS = 5` with backoff capped at 60 s,
  then reports a fatal error and shuts down (`supervisor.py`).
- **Losing the socket is not losing the session.** The bridge reconnects while the control plane
  schedules a heartbeat check in case the process is genuinely gone (`docs/HOW_IT_WORKS.md`), and a
  close event from an already-replaced socket is ignored so it cannot schedule the live one's
  termination (`session/disconnect-handler.ts`). Scheduled wake-ups persist in a
  `session_alarm_state` table — the schema's "runtime alarm recovery source for hosts that can be
  adopted by another process" (`session/alarm/scheduler.ts`) — so timers survive their host's death.

## Takeaways for ward

1. **Steal the two-vocabulary split, and the warning with it.** Ward's session record should carry a
   durable lifecycle (`open`/`closed`) sharing _no_ enum members with the live host's state
   (`live`/`gone`/`stale`). Open-Inspect names the failure: rendering the incarnation as the session
   status is what made two views disagree. 0031's `attach`, `observe`, and `doctor` output should
   each say which level it reports, never merging the two into one word.
2. **Store the harness handle, verify it live before use, never trust it as the transcript.** The
   bridge's load → `session_exists()` → fresh-session fallback is exactly the shape 0031's
   "re-create from the record via harness-native resume" needs: the resume flag is a _hint_, and a
   failed probe must degrade to a clean new host rather than an error. The entry currently says
   "resume when the live half is gone" without saying how a stale-but-present handle is detected.
3. **Fence strays rather than killing them.** 0031 already says doctor surfaces strays and never
   kills. Open-Inspect shows what makes that safe: give the live host an identity the record can
   rotate, so an orphan is locked out (403) instead of left able to write. Ward's deterministic
   `ward-<workspace>-<session-id>` has no generation marker — a stray tmux session from a previous
   incarnation has exactly the name the record expects. A generation suffix, or a per-incarnation
   handle recorded beside the name, would let `attach` tell "my host" from "a host with my name".
4. **Make refusal rules named predicates, not inline conditions.** The `isSessionPromptable` /
   `isSessionInactive` / `isTurnSettled` trio — with a header comment demanding a predicate be
   "named for its question, not for the shape of its answer" and a test asserting the one place two
   of them deliberately diverge — is a discipline 0031's refusals (`resume` refused while live,
   `close` gated) should copy verbatim into the spec.
5. **`attach`/`resume` should settle from the record, not assert a state.** `unarchive` calling
   `settleFromMessageState()` instead of writing `active` is the direct analogue of ward reopening a
   session: the record already implies the state, so deriving beats asserting. Confirms 0031's
   record-as-truth posture precisely where it is easiest to accidentally write.
6. **Prune the live-state enum to what some code path writes.** The `syncing`/`running` deletion
   note is cheap to adopt while 0031's host states are still being chosen: every state needs a
   producer, and a state that exists only as client-side optimism should say so in its type.
7. **Separate "connection lost" from "host gone".** Ward's `observe` and `attach` will drop
   connections routinely. Open-Inspect's rule — a lost connection schedules a _check_, never a
   lifecycle change, and a close from a superseded connection is ignored — belongs in 0031 as an
   explicit invariant, not an implementation detail.
8. **Expect an optimistic pre-create path to leave garbage.** If ward ever creates a tmux host
   before the session record is committed, `abandoned-draft-sweep.ts` is the warning: the reaping
   clock must run on the human's timescale, not the host's idle timeout, or you reap work someone is
   still composing.
9. **Reconnect by bounded full snapshot, not by delta log.** ADR 0003's trade — one small handoff
   invariant instead of revision retention and catch-up state machines — argues that `attach` should
   re-read the whole session record and re-derive rather than replay what changed since detach. Its
   follow-up rule ("no retained delta log without measured reconnect-bandwidth evidence") is a good
   default for a workspace-sized record.
10. **Version-gate anything that resurrects a captured environment.** `isSnapshotRuntimeCompatible`
    fails closed on unversioned snapshots because a restore brings back the pinned agent binary. If
    ward ever caches more than a host's name — a captured environment, a pinned harness version —
    the same floor-and-fail-closed rule applies, and being wrong should cost one clean re-create.

## Conflicts with ward's posture

**No local host, therefore no attach seam at all.** Ward's central mechanism — a live multiplexer
session on the operator's own machine, re-attachable from a terminal — has no counterpart here.
Open-Inspect deletes the problem by moving compute to a provider the control plane owns. That buys
unlimited concurrency, survival across laptop reboots, and one authoritative event stream; it costs
a cloud dependency, five provider integrations, a token-brokering security model, and a README that
opens with "single-tenant only… no per-user repository access validation." Ward's tmux choice stays
local, offline-capable, and trust-free by construction.

**Human-in-the-loop is inverted.** 0031 refuses `resume` while live and leaves strays for a human to
decide about. Open-Inspect's default is automatic: idle sandboxes stopped and snapshotted without
asking, unresponsive ones marked `stale` and terminated, abandoned drafts archived by a sweeper,
spawns suppressed by a circuit breaker. That buys unattended operation at scale; it costs the
operator's ability to inspect a wedged host before it is reclaimed — the affordance ward's `observe`
exists to provide.

**The record is a database, not files in git.** Session state lives in per-session SQLite inside a
Durable Object plus a D1 index — fast, transactional, queryable, and opaque to `git log` or a text
editor. Ward trades query performance and write throughput for reviewability, diffability, and
offline durability. The concrete tension: Open-Inspect can afford to store the live mapping
(`modal_object_id`, rotating URLs, heartbeat timestamps) _on_ the record because writes are cheap;
ward cannot commit a heartbeat, so more of its record→live mapping must be derived at read time from
the multiplexer itself. 0031 should state that explicitly — it is the one place where copying the
stored-mapping design would quietly break ward's self-sufficient git-tracked history.

**Multiplayer without a viewer role.** Every participant is a steerer, so "observe" here is a
convention rather than a capability. Ward's read-only `observe` is a stronger claim, and tmux can
enforce it (`attach -r`). Nothing in this repo validates that design — but nothing contradicts it
either; it is a place where ward is ahead of its prior art rather than behind.
