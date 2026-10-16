# Prime Agent — daemon-hosted agent sessions

Source: <https://www.primeintellect.ai/blog/prime-agent> · code:
<https://github.com/PrimeIntellect-ai/prime-agent> (MIT, `@earendil-works/pi-coding-agent` v0.8.0,
inspected at commit `a9b5d88`, 2026-08-24)

Prime Agent solves the same problem 0031 solves — an agent run that outlives the terminal that
started it — and reaches the opposite architectural answer: rather than hosting the harness inside a
multiplexer, it splits the harness into a **client** and a **daemon**, so the agent loop never lived
in the terminal to begin with. A background supervisor owns one detached worker process per root
session tree; the TUI is a thin attachable client that can come and go, and a second client can
subscribe read-only to the same session's events without steering it. The durable half is an
append-only JSONL transcript per session, and the daemon's crash recovery restores a worker _from
that transcript_ — the same record-is-the-truth move 0031 makes, applied one level lower. Its main
lesson for ward is where the seam between client and run belongs.

**Vitals.** Open-source local coding harness with an in-repo daemon architecture; shipped and mature
(wire protocol v4, capability negotiation, ~30 daemon test files, benchmarks). Everything below is
**verified from the repository and its docs**, not from the announcement, except where marked.
Nothing here is cloud or remote: the daemon is a local Unix socket among processes of one OS user,
and the repo says so explicitly.

## What was verified

**Process model.** The supervisor is a detached process owning public sockets, client attachments,
routing, worker health, command journals, and coordinated updates, and explicitly "does not execute
providers, tools, compaction, bash, kernels, schedules, or transcript scans"
(`packages/coding-agent/docs/daemon.md`). Each _resident worker_ is "one detached process group per
active root tree" owning one root session, its IPython kernel, its scheduler, and its recursive
children; "Closing the TUI detaches the client; it does not stop the worker" (ibid.). A separate
catalog subprocess does saved-session scanning, so a scan failure cannot interrupt live workers.

**Attach, detach, observe.** The CLI is `prime-agent list [--all]`, `attach <agent>`, `detach`,
`stop`, `rename`, `send`, `status`, `doctor [--fix]`, `shutdown [--force]` (`docs/usage.md`;
dispatch in `src/cli/daemon-command.ts:132-230`). Read-only observation is a first-class protocol
verb, not a terminal trick: a client sends `{"type":"observe","activeSessionId":"…"}`, receives the
target's messages plus later events wrapped as `observed_session_event` so they cannot be confused
with its own, gets `observed_session_closed` on teardown, and stops with `unobserve`
(`docs/rpc.md`). Steering is a separate verb set — `send`/`steer`/`follow-up`, with delivery modes
and a `delivered`-vs-`queued` receipt (`docs/long-running-agents.md`).

**Two identities, deliberately.** A session has a durable id — its file,
`~/.prime/agent/sessions/<session-id>.jsonl` (`docs/session-format.md`) — and a separate live
handle, the `activeSessionId`, minted as a 12-character suffix of a fresh UUID when a runtime starts
(`src/modes/daemon/active-session-state.ts`, `src/core/session-id.ts`). The live handle survives
operations that swap the durable one underneath it: "New, switch, fork, and import operations
replace the root runtime inside the worker while preserving the public active-session ID"
(`docs/daemon.md`). Selectors resolve by unique suffix, by name, or exactly, and an ambiguous
selector raises rather than guesses. Humans get stable names via `rename` / `/name`; the roster
shows `name · id · status · age · model · messages · clients` (`src/cli/daemon-list-format.ts`).

**The record/live join, made visible.** The agents view (Left Arrow on an empty prompt) sorts every
thread into **Running / Idle / Inactive** (`src/modes/agents-view/agents-view-state.ts`). Those
sections come from `reconcileUnifiedSessions`, which joins live daemon summaries against the saved
catalog on a set of _identity aliases_ (active id, session id, canonicalized file path); a row with
no live half classifies as `inactive`. Its docstring states the precedence: "Daemon data remains
authoritative; saved data only enriches durable/search fields."

**Liveness is a cache, and it is evicted on purpose.** A supervisor sweep passivates idle children
and evicts whole idle workers past a configurable `idleEvictionMinutes` (`"off"` disables it)
(`src/modes/daemon/daemon-supervisor.ts:runIdleEvictionSweep`). The predicate is conservative and
worth copying: evictable only when not busy, with **zero attached clients**, no registered heartbeat
and no registered cron job, and idle past the threshold (`isIdleEvictionThresholdMet` /
`canEvictWorker`, `src/core/session-action-store.ts:373-422`); the worker must additionally be
ready, connected, not stopping, not client-owned, and not mid-update. The blog gives the
user-visible consequence: subagents "can be removed from memory after 30 minutes of inactivity, and
the moment a user or agent addresses any of them, they are reloaded from disk."

**Failure handling.** Workers monitor the supervisor socket; if it disappears, one worker takes an
atomic launch lease and starts a replacement, which **adopts** the live workers and their
active-session ids (`docs/daemon.md`). A worker crash is scoped to one root tree; recovery retries
at 250 ms, 1 s, and 5 s, and three failures mark that root failed. Recovery "reaps its old process
group and tracked detached bash trees, appends a **visible recovery marker** to the transcript,
restores the root under the same active-session ID, and does not replay uncertain side effects"
(ibid.). Mutating commands are journaled by `clientId + commandId` before dispatch: a repeat returns
the stored result, and a command with no durable result is reported _uncertain_ rather than
replayed. Every persisted session is protected by a process-safe lease keyed by canonical JSONL
path, so a concurrent open returns `session_already_active` naming the owner rather than
double-writing a transcript. Reconnect carries a `{generation, sequence}` cursor; a gap is not fatal
because "the attach snapshot is the durable recovery baseline."

**Not remote, and honest about it.** Private worker connections are authenticated and
generation-fenced, but "It is process coordination, not a sandbox boundary: all processes still run
as the same OS user" (`docs/daemon.md`). `docs/agent-connection.md` is blunt that this does not
generalize: "The local boundary is suitable for another adapter, but it does not define a hosted
control plane. A hosted system still needs explicit authentication, authorization, sandbox identity,
artifact transfer, stable public DTOs, multi-client ownership, and network-level compatibility
policy" — and warns against extending local session paths into a remote API. **There is no cloud or
sandbox hosting of Prime Agent sessions anywhere in this material.**

**tmux appears — as a terminal, not a host.** `docs/tmux.md` is entirely about `extended-keys` and
`csi-u` so modified `Enter` survives; hosting is never tmux's job. Separately the repo ships a
built-in integration with **Herdr**, a third-party agent-aware multiplexer: when `HERDR_ENV=1` an
extension reports lifecycle state (`working`/`blocked`/`idle`) to the pane over a Unix socket,
guarded by a monotonic sequence number so a successor session after `/new`, resume, or fork can
never report below a seq the previous instance used
(`src/core/extensions/builtin/herdr-agent-state.ts`). Confidence: high on the mechanism, which is
in-tree; Herdr itself I confirmed only by web search as a Rust agent multiplexer with
detach/reattach.

## Takeaways for ward

1. **Read-only as protocol vs. as a flag — ward's is cheaper, and that is an argument.** Prime Agent
   needed an `observe`/`unobserve` verb pair with wrapped event envelopes to keep a watcher from
   being mistaken for a driver. 0031's `observe` gets the same guarantee from `tmux attach -r`,
   enforced by the tmux server. **Confirms** the observe mechanism, and is the strongest available
   argument for the multiplexer technique.
2. **The two-identity problem is real; ward should keep dodging it, and cite this.** Prime Agent
   carries a live `activeSessionId` beside the durable file id precisely because a worker's root can
   be swapped under a stable public handle. 0031's `hostSessionName()` is a pure function of
   `(workspace, session-id)` with nothing stored — this is the concrete counter-example showing what
   storing the mapping costs: an alias set, a suffix resolver, an ambiguity error. **Confirms**
   derive-don't-store.
3. **Steal the roster's three states — Running / Idle / Inactive.** 0031 has a binary live/not-live
   from `has-session`. tmux cannot distinguish a thinking agent from a waiting prompt, so ward
   cannot derive _Idle_ from the host — but the three-way shape is what humans want at a glance, and
   it names a real gap the theming seam could fill. **Extends** doctor's "gone" finding and the
   deferred theming work.
4. **Adopt `reconcileUnifiedSessions`'s shape for the record↔live join.** 0031 already has this
   per-session in `locate`'s `host: {kind, name, live} | null`. The missing piece is the _list_: a
   roster joining every open record against one `tmux list-sessions` scan, labelling each row live
   or not — which is also doctor's stray scan seen from the other side. **Extends** locate and
   doctor into one shared join.
5. **Copy the eviction predicate as doctor's stray predicate, though ward never kills.**
   `canEvictWorker` refuses to touch anything with an attached client, heartbeat, or pending job.
   0031's stray rule is "record closed or missing"; adding "and no client is attached" to what
   doctor names _loudly_ stops it nagging about a session a human is sitting in right now
   (`tmux list-sessions -F '#{session_attached}'` supplies it free). **Extends** SF-004.
6. **Write a visible recovery marker when attach re-creates a run.** Prime Agent "appends a visible
   recovery marker to the transcript" on recovery. 0031's re-create path appends a `resumed`
   lifecycle event to the record but leaves the _conversation_ unmarked, so an agent resuming after
   a reboot cannot tell it was interrupted mid-turn from anything it can read. A one-line marker, or
   a `WARD_RESUMED_AFTER=…` beside the `WARD_AGENT` the design already sets in the pane's
   environment, closes it. **Changes** the attach mechanism, minimally.
7. **Name the uncertain-mutation case in the hosted open.** Prime Agent journals mutations before
   dispatch and reports one with no durable result as _uncertain_, never replaying it. 0031's "a
   crash between record and `new-session` leaves an open record whose handle resolves to nothing" is
   the same state, already resolved correctly — but framed as an accident rather than a named state.
   **Confirms** record-then-launch; suggests borrowing the vocabulary.
8. **`has-session` is a check, not a lock — say so in the resume gate.** Prime Agent enforces
   single-writer per transcript with a process-safe lease keyed by canonical path, returning
   `session_already_active`. 0031's resume gate gets the same effect from `has-session`, correct in
   the common case, but two `ward session resume` calls racing before either host session exists
   both pass. Ward already has `.ward/store.lock` to hang a real guard on if it bites. **Changes**
   the resume gate's stated guarantee, from exclusion to detection.
9. **For the GCP VM: the absence of a remote design is itself the signal.** The most mature local
   agent-hosting architecture available explicitly declines to generalize its local boundary into a
   hosted control plane, and enumerates what that would require. Ward's tmux-over-SSH answer — the
   workspace lives on the VM, the human reaches it with `ssh` then `ward session attach` — needs
   none of that list, because authentication is SSH's and the record is a git-tracked file on the
   same box. **Confirms** ADR 0006 for ward's actual deployment, and is the citation to reach for if
   a daemon-or-service alternative is proposed later.
10. **The Herdr integration is the theming seam's mechanism, already proven.** An agent reporting
    `working`/`blocked`/`idle` to its multiplexer pane over a socket, sequence-guarded against a
    successor session reporting stale state, is exactly what 0031 defers under "theming the host
    surface" — with its failure mode documented in-tree: without the monotonic seq, a resumed
    session's idle report is dropped and the pane sticks on "working." **Extends** the deferred
    theming work with a known-good design.

## Conflicts with ward's posture

- **Live-is-authoritative in the join.** "Daemon data remains authoritative; saved data only
  enriches durable/search fields" is the exact inversion of 0031 §16. It is _earned_ there — the
  worker holds an IPython kernel and un-flushed state the file does not — and that is precisely why
  ward should keep its own precedence: a tmux pane holds nothing the record does not. Import the
  join's shape (takeaway 4), never its precedence rule.
- **Automatic eviction spends authority ward has reserved.** Prime Agent kills idle workers on a
  timer; SF-004 says teardown rides on a deliberate close, never on hygiene. Both are defensible
  because the cost differs: an evicted worker rehydrates from JSONL on next address, whereas killing
  a ward pane discards un-recorded working state with no auto-rehydrate. Copy the predicate
  (takeaway 5); do not copy the sweep.
- **`doctor --fix` acts.** Prime Agent's `doctor` prints and `doctor --fix` reaps — conservatively,
  re-probing before unlinking and touching only orphaned socket files (`src/cli/daemon-ps.ts`).
  0031's doctor never acts at all. That is a stricter line than the prior art draws, and the entry
  should be able to say it chose the stricter line knowingly rather than by omission.
- **A daemon would replace the seam, not fill it.** Prime Agent's answer works because the _harness_
  is daemon-shaped. Ward consumes Claude Code as-is and cannot split it; a ward-side daemon would
  put Ward machinery permanently inside the run's process tree — the same objection the entry
  already raises against an exit-code shim. Prior art to cite when the multiplexer choice is
  questioned, not an alternative ward could adopt.
