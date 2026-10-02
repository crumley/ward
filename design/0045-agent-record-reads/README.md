# 0045 — Records read through Ward: one session on one screen, and a handle no agent spells

> An agent can now answer every question about a session through `ward` — `ward session show ID`,
> and refusals that say which miss they are — and records its own task session's handle from the run
> it stands in; the manifest says that `ward`, not the record files, is how records are read.
>
> **Status:** built — awaiting review · **Started:** 2026-10-02

The store is markdown so that it is transparent
([`intent/02-subsystems/00-metadata-store.md`](../../intent/02-subsystems/00-metadata-store.md)),
and the installed manifest ([`0005`](../0005-agent-audience/README.md), carried by every upgrade
since) told an agent to "read them directly; that is what they are for". In use, an agent does: it
greps a task's `sessions/` directory to learn whether its session closed. The habit has a concrete
cost. Part of what a record means is derived rather than stored (the aggregate-status constraint in
the same slice), a write beside Ward skips the store lock and the journal commit
([`0013`](../0013-telemetry-and-serialized-writes/README.md)), and a reader that learns the layout
couples itself to what the slice explicitly calls swappable.

The habit is also a symptom. The question the agent was asking, "did my session close?", had no
verb. `task show` lists only open sessions, `status` lists only open workspace-scope ones, and
`session close` on a session its task's close had already swept up answered "no open session has id
…" — the same words as for an id that was never allocated. A caller that cannot tell those two
misses apart, and has no verb that reads a closed session, goes to the files. Fixing the guidance
alone would leave the gap that caused it.

A second gap sits beside it. A session Ward did not launch records itself with `--handle`, and the
agent was asked to spell its own run id. An agent that does not know its id composes one, and a
recorded `claude:unknown` locates nothing, ever: the run is stranded exactly as
[`intent/02-subsystems/03-agent-harness.md`](../../intent/02-subsystems/03-agent-harness.md) warns,
behind a record that looks complete. Claude Code names its run in the environment of every process
it starts, so the handle can be read rather than spelled.

## Serves intent

- [`metadata-store`](../../intent/02-subsystems/00-metadata-store.md) — _Deterministic reads_ in a
  form agents parse: a closed session becomes readable through a verb, so no read an agent needs
  requires the layout; see [`spec-feedback.md`](spec-feedback.md), SF-001, on the slice's "a human
  or agent can read the state directly".
- [`human-shell`](../../intent/02-subsystems/07-human-shell.md) — _Organized around nouns and
  verbs_: `show` joins the session noun as it already sits on the task noun. _Degrade honestly_
  (principles §20): a refusal names which of two misses it is.
- [`agent-harness`](../../intent/02-subsystems/03-agent-harness.md) — _Expose a harness handle_ and
  _make the run's history locatable from the recorded handle_: a self-recorded task session carries
  the handle of the run it was opened from, read from the harness rather than spelled by the agent.
- [`principles`](../../intent/00-foundation/01-principles.md) — §8 (one record, two audiences: the
  human reads the files, the agent reads the verb over them), §16 (recorded state is read through
  the tool that derives it).

## Scope

- **In:**
  - **`ward session show ID [--json]`.** Any session, open or closed, at any scope, resolved by the
    same `findSession` that `session locate` uses. The human view shows state, purpose, scope,
    machine, directory, handle, the open and close instants, and the event trail. `--json` emits the
    session-record shape the session mutations already emit (`sessionMutationShape`), registered
    under `session show` among the argument-taking read verbs. Completion offers every id, open or
    closed.
  - **The refusal names its miss.** `requireOpenSession` (behind `session close` and
    `session resume`) answers an id whose session is closed with
    `session 'ID' is already closed at <instant> — closed stays closed; its record: ward session show ID`,
    and an id that names nothing with `no session has id 'ID'`.
  - **The ambient handle.** The harness adapter gains an optional `ambientEnvVar`, the variable the
    harness sets for everything its run starts. Claude Code's is `CLAUDE_CODE_SESSION_ID`.
    `ambientHandle(env)` in the registry returns the first adapter's handle whose variable is set
    and non-empty. `session open TASK` without `--handle` records it. `--handle` still wins, and
    outside any run nothing is recorded.
  - **The manifest.** The installed `AGENTS.md` says that `ward` is how records are read and
    changed. It names the record paths an agent does not open, grep, list, or edit. It adds
    `session show` to the read verbs and the Sessions section, drops the instruction to spell a
    handle, and says that `task close` closes the task's open sessions and names them. The outgoing
    default's hash joins the lineage, so an untouched manifest upgrades
    ([`0020`](../0020-deterministic-upgrade/README.md)).
- **Deferred:**
  - **A session list verb** (`ward session list [--all]`). Safe to defer because `show` answers the
    question that drove the habit (one known id). Listing every session at every scope is what
    `status` and `task show` partly do already, and widening them is a surface change of its own.
  - **The ambient handle at workspace scope.** `session open` with no TASK and no `--handle`
    _launches_ an agent, and turning that into a record-only open whenever an ambient run exists
    would change what the verb does based on the environment it happens to run in. Safe to defer
    because the workspace-scope self-record path still takes `--handle` explicitly, and the manifest
    now warns against a guessed one.
  - **The ambient variable for pi.** Safe to defer because pi is not known to export its run id to
    child processes. Its adapter leaves `ambientEnvVar` unset, and a pi run records with `--handle`
    as before.
  - **Validating a handle's native id.** Each harness owns its id format, and a test seam uses
    readable ids. Reading the handle removes the guess at its source, which a format check would
    only catch after the fact.
- **Acceptance:**
  1. `bun test test/cli/session-show.test.ts`: show reads open and task-closed sessions, the JSON
     parses as `sessionMutationShape`, both misses read apart for `close` and `resume`, and the
     ambient handle is recorded, overridden by `--handle`, and absent outside a run.
  2. `bun test test/cli/upgrade.test.ts test/workspace` stays green with the new lineage entry: the
     0044 manifest classifies as stale, not customized.
  3. `env -u WARD_AGENT mise run check` is clean.

## Design

- **Decisions:**
  - **`show` emits the record shape, not a new one.** _Alternative:_ a `sessionShowShape` with
    derived fields, such as history found or gone, or the task's full address. _Attractive_ because
    it would answer more in one call. _Lost_ because `session locate` already owns the history probe
    and the record shape is what every session mutation emits: one shape means a caller who reads
    `session close --json` and later `session show --json` parses one document. _Cost:_ `task`
    carries the room code the record stores (`t1`), not the floor address.
  - **Read the handle, do not validate it.** _Alternative:_ refuse a `--handle` whose native half is
    not the harness's id format (a UUID for claude). _Attractive_ because it catches
    `claude:unknown` at the door. _Lost_ because the format belongs to the harness, readable test
    ids are a seam the suite relies on, and the failure was a guess, which reading removes. _Cost:_
    an explicitly wrong `--handle` still records.
  - **The test environment blanks the ambient variable.** `WARD_GLOBAL_ENV` pins
    `CLAUDE_CODE_SESSION_ID` to empty for the same reason it pins the machine name. A suite run from
    inside Claude Code would otherwise stamp the developer's own run onto every record-only session
    it opens.
- **Layout:** the ambient lookup lives in the harness registry beside `adapterForHandle`, because
  "which harness am I inside" is a selection across adapters like "which adapter reads this handle".
  Each adapter owns only the name of its variable.
- **Mechanisms:** `requireOpenSession` now reads all sessions (as `findSession` does) so it can tell
  a closed match from no match. It is still one scan under whatever lock the caller holds.
