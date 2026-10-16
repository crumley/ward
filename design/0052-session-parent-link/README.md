# 0052 — A session records the session that started it

> `ward session open` run from inside a session records that session as the new one's `parent`, on
> every path and at every scope, so the parent→child relation is a recorded fact rather than
> something read off whichever windows happen to sit side by side.
>
> **Status:** built — awaiting review · **Started:** 2026-10-16

A session that coordinates a floor starts other agent sessions for the tasks on it, and nothing on
the record says so. Each child's record carries its scope, handle, machine, and purpose
([0029](../0029-launched-sessions/README.md), [0038](../0038-machine-bound-sessions/README.md)), but
not who opened it. The only trace of the relation is live: the child's window sits next to its
parent's in a multiplexer host. That trace is gone the moment a window closes or the machine
reboots, and it was never trustworthy anyway. Two windows in one host are co-located, not related.
Recovery and reflection would have to guess.

The intent now names the parent session as a conditioned field of the session log, recorded on the
child at open from the opener's declared identity
([`sessions-and-lifecycle`](../../intent/01-concepts/02-sessions-and-lifecycle.md), _Recording per
scope_). The declared identity already exists. Every Ward-launched run is born with
`WARD_AGENT=<its session id>` ([0029](../0029-launched-sessions/README.md)), and the workspace
manifest tells a self-recorded agent to set it to its id. So a `ward session open` that runs inside
a session already carries the parent's id in its environment. This entry writes it down.

## Serves intent

- [`sessions-and-lifecycle`](../../intent/01-concepts/02-sessions-and-lifecycle.md) — _Recording per
  scope_: the parent session is recorded on the child at open, from the opener's declared identity,
  absent where none is declared or the declaration names no session here.
- [`session-multiplexer`](../../intent/02-subsystems/01-session-multiplexer.md) — _the live host is
  a cache over the record_: the relation lives in the record, so a host that groups a parent and its
  children can be rebuilt from it instead of being its only witness.
- [`principles`](../../intent/00-foundation/01-principles.md) — §11 (provenance: a session's record
  says where it came from), §16 (recorded state over live state), §17 (the link is written once, on
  the child, under the store lock; no parent record is rewritten when a child opens).

## Scope

- **In:**
  - **A `parent` field on the session record.** It is optional and holds a session id. Every record
    written before this entry parses unchanged and reads as having no parent.
  - **`ward session open` sets it on every path.** That covers a task session (record-only), a
    workspace session recorded with `--handle`, and a launched workspace session. The value is the
    caller's `WARD_AGENT` when that names a session in this workspace, open or closed. The one
    exception is a declared session whose handle equals the new session's handle: that is the same
    run recording itself again, so no parent is recorded. Anything else records no parent and
    refuses nothing.
  - **The parent is shown.** `ward session show` prints a `parent` row when there is one. The
    session JSON document (`session open|resume|close|show --json`, and so `ward schema`) carries
    `parent` under the same rule.
  - **The manifest.** The agent section says that a session opened while `WARD_AGENT` holds your id
    records you as its parent, and that a new terminal or multiplexer window does not inherit it.
    The outgoing default's hash joins the lineage ([0020](../0020-deterministic-upgrade/README.md)).
- **Deferred:**
  - **An explicit `--parent ID` flag.** Safe to defer because every caller that starts a session is
    either Ward itself, which sets `WARD_AGENT` on the run it launches, or an agent whose
    environment already holds its own id. The gap is a launcher that drops the environment, such as
    a new multiplexer window. The manifest names the fix there: pass `WARD_AGENT` along. A flag
    would also let any caller claim any parent. The environment carries only the opener's own
    declaration. If a launcher ever exists that cannot pass the environment, the flag is a small
    addition then.
  - **The reverse view: a session's children.** Safe to defer because the link is on every child's
    record, so "what did this session start?" is a scan over records that already exist. No
    migration is owed when a verb starts answering it. Putting a derived list on the session
    document now would split the one shape the mutations and `session show` share
    ([0045](../0045-agent-record-reads/README.md)).
  - **Parent-aware recovery, status, or host grouping.** Safe to defer because each of these reads
    the field this entry writes and needs nothing more from it. Recovery rounds and floor hosts are
    their own entries.
- **Acceptance:**
  1. `bun test test/cli/session-parent.test.ts`:
     - The rule table holds: no declaration, an open session, a closed session, `1`, a foreign id,
       and the same run recording itself.
     - A task session, a record-only workspace session, and a launched workspace session each record
       `COORDINATOR` as parent.
     - The launched child's own run is declared as itself.
     - A grandchild names its child.
     - `session show` prints the row, and `--json` parses as `sessionMutationShape` with `parent`.
     - No `WARD_AGENT`, `WARD_AGENT=1`, and an unknown id each open successfully with no parent.
  2. `bun test test/workspace/lineage.test.ts`: the 0049 manifest is in the lineage history and the
     0052 default is pinned.
  3. `env -u WARD_AGENT mise run check` exits 0.

## Design

- **Decisions:**
  - **Record nothing, and refuse nothing, when the declaration names no session here.**
    _Alternative:_ refuse an open whose `WARD_AGENT` is not a session id in this workspace.
    _Attractive_ because a mistyped or stale id would surface instead of quietly dropping the link.
    _Lost_ because `WARD_AGENT=1` is the manifest's own instruction for an agent with no session,
    and an id from another workspace names a real session somewhere else (one agent can drive two
    workspaces). A refusal would fail opens that are entirely legitimate, to protect a field the
    intent makes conditional. _Cost:_ a parent can be missing without anything saying so. The record
    makes no false claim either way, and `session show` makes the absence visible.
  - **A closed parent still links.** _Alternative:_ link only an open session. _Attractive_ because
    a closed session "should not" be starting anything. _Lost_ because the link records who opened
    this session, and a run outlives its record's close: a task close sweeps that task's sessions
    without stopping any process. Dropping the link would record less than what happened. _Cost:_
    none; a reader who cares about state reads the parent's own record.
  - **The same run recording itself is not its own child.** _Alternative:_ always link the declared
    session. _Attractive_ because it is one rule with no exceptions. _Lost_ because an agent
    standing in session X can record a task session for its own run, and since
    [0045](../0045-agent-record-reads/README.md) that record's handle is read from the run, so it
    equals X's. Linking would say X started a session that is actually X itself. _Cost:_ one handle
    comparison. When either handle is unknown, nothing is assumed and the link stands.
  - **The CLI reads the environment; the store decides.** `declaredSession()` in the caller module
    returns `WARD_AGENT` unverified, beside `callerIsAgent`. Whether the value names a session is
    decided by `parentOf` in the sessions module, under the store lock that allocates the id. That
    keeps the env read at the edge, as `ambientHandle` is, and keeps the check inside the same
    critical section as the write it decides.
- **Layout:** The resolution sits in `writeOpened`, the one writer every scope's open passes
  through. A scope added later (a floor-scope session, say) gets the link by threading `startedBy`
  through its options, with no new rule. `parentOf` is exported as a pure function so the rule is
  tested as a table without a workspace.
- **Mechanisms:** Inside the lock, `writeOpened` reads every session record, which is the scan
  allocation already makes. It finds the declared id and writes `parent` beside `machine`, `model`,
  and `effort`, before the `opened` event and the journal commit. The launched path resolves the
  parent before the child exists, then starts the child with `WARD_AGENT=<child id>`
  ([0029](../0029-launched-sessions/README.md)). So whatever the child opens names the child, and a
  delegation chain records itself one link at a time.
