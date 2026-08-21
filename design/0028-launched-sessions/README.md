# 0028 — Launched sessions

> `ward session open --purpose TEXT` opens a session at **workspace scope** and **starts the agent
> in it**: Ward mints the harness handle, writes the record, and only then runs the harness under
> that very id — so the id costs no tokens and nothing of Ward's ever enters the agent's context.
> Resume re-attaches to the same run, locate resolves the handle to its history (found or gone), and
> the lifecycle trail — opened / resumed / resume-failed / closed — becomes part of the record.
>
> **Status:** built — awaiting review · **Started:** 2026-08-21

The owner commissioned this entry in these words:

> "for session tracking, like recording what session ID Claude is using. I don't want to use tokens
> if we don't have to. […] we should lean into to Claude hooks or some other mechanism that Claude
> provides from the CLI to integrate with it at a level that lets us get the session ID without
> polluting the session with context, with ward context that isn't beneficial just for tracking."

> "we'll want to ensure that we consider updating and refreshing the agent's MD that gets written
> into a workspace space so that it can really understand the flow. So that each time we use word to
> start a session That session automatically has context of how to use it really well and how to go
> through the flow."

> "when we start a session, we might have several modes that we want to to do it in like starting a
> session for a specific task where the task is already defined, but also we might want to start a
> task at the project scope or start a task at the workspace scope. and all of those and we can in
> the spirit of not boiling the ocean we could decide to just choose the like no scope at all and
> then work our way to the others. but it's important to know that we do want the others eventually
> and so we should plan accordingly."

Three demands, and the design turns on each: **the id must cost nothing**, **the manifest must teach
the flow**, and **the scopes must arrive one at a time without a migration between them**.

The first is answered by a single verified fact about the harness — `claude --session-id <uuid>`
takes the id of the conversation it is about to create — which inverts the whole problem. Ward does
not _discover_ the handle after the fact (a hook, a prompt, a transcript scrape, all of which either
cost context or arrive too late); Ward **assigns** it and the run is born under it. Nothing is asked
of the agent, so nothing enters its window.

[0027](../0027-agent-configuration/README.md) built the configuration this launch consumes and
deferred "actually launching an agent" to this entry, stacked on it; its numbering note explains why
these two are 0027 and 0028.

## Serves intent

- [`agent-harness`](../../intent/02-subsystems/03-agent-harness.md) — the seam, first realized:
  _start / handle / resume / locate behind a thin adapter_ is `src/harness/claude.ts`, and
  everything Ward-specific stays outside it. _Make the run's history locatable from the recorded
  handle_ — with **found and gone as distinct outcomes**, because the harness owns retention — is
  `ward session locate`. _Accept an externally-chosen model and thinking depth and pass them
  through_ is where 0027's resolution meets an actual command line, absent keys and all.
- [`sessions-and-lifecycle`](../../intent/01-concepts/02-sessions-and-lifecycle.md) — **open ≠
  running**, made behavioral: the agent exiting leaves the session `open`, and Ward says so and
  names the resume. _Resume_ re-establishes the live attachment without changing the stored state.
  The **session log's lifecycle events** — opened / resumed / **resume-failed with its cause** /
  closed — are now on the record, so a failing re-attach is a recorded fact rather than a silent
  retry. The **harness handle** stays an attribute: the session is addressed by its Ward id, and the
  handle is what re-attaches.
- [`domain-model`](../../intent/01-concepts/00-domain-model.md) — **levels are elided, not faked**:
  a workspace-scope session invents no task to hold it, and its record lives at the workspace's own
  level, exactly as `tasks/` holds the bare tasks that elide the project level. **Identity**: ids
  stay unique among open sessions workspace-wide, now across scopes, so a bare id still addresses
  every operation.
- [`scopes-and-personas`](../../intent/01-concepts/01-scopes-and-personas.md) — **the two axes**:
  scope (what the session is responsible for) and working directory (where it stands) are chosen
  independently, and this entry records both — the workspace-scope session stands in the root, and
  the recorded directory is what `locate` resolves against.
- [`workspace-lifecycle`](../../intent/01-concepts/06-workspace-lifecycle.md) — the installed
  `AGENTS.md` is yours-tier content reconciled on upgrade; the manifest's new **Sessions** section
  reaches existing workspaces through `ward workspace upgrade` by the mechanism
  [0020](../0020-deterministic-upgrade/README.md) built, with the outgoing default's fingerprint
  appended to the lineage.
- [`human-shell`](../../intent/02-subsystems/07-human-shell.md) — new verbs teach the shell
  ([0022](../0022-shell-completion/README.md)), mutations report as JSON
  ([0015](../0015-mutation-json/README.md)), and the launched open is the shell's most
  human-affording act yet: one command, and the agent is running.
- [`principles`](../../intent/00-foundation/01-principles.md) — §16 (the record is written before
  the process exists and outlives it), §12 (the handle costs zero tokens), §17 (append-only events,
  every writer under the store lock), §20 (an unreadable workspace record degrades the launch to the
  global layer rather than refusing to start an agent), §4 (nothing local leaks: the launch passes
  no Ward prose into the run).

## Scope

- **In:**
  - **The harness adapter** — `src/harness/claude.ts`, a new `src/harness/` tree: argv construction
    for start and resume, a foreground spawn inheriting stdio in a given directory with a given
    extra environment, the `claude:<native-id>` handle and its reader, and transcript resolution
    (`<config>/projects/<munged-cwd>/<id>.jsonl`, honoring `CLAUDE_CONFIG_DIR`). `WARD_CLAUDE_BIN`
    selects the binary — the hermeticity seam, `WARD_CONFIG_DIR`'s pattern.
  - **Workspace-scope sessions.** `ward session open --purpose TEXT` with **no TASK** opens at
    workspace scope; the record lands in `sessions/` at the root. The session record gains a
    **scope** (`workspace | task`, optional so every pre-0028 record stays valid) with `task`
    present exactly when the scope is a task.
  - **The launched open.** No `--handle` ⇒ Ward generates a UUID, **writes and commits the record
    first** (state `open`, handle, working directory, purpose, and what it will be started with),
    then runs the agent with `WARD_AGENT=<session id>` in its environment. Ward waits; when the run
    exits the session **stays open** and Ward prints the resume affordance.
  - **Resume** — `ward session resume ID`: `claude --resume <native-id>` in the recorded directory,
    carrying `agent.args` but never `--model`/`--effort`. Appends `resumed` before the launch and
    `resume-failed` with its cause when the spawn never gets off the ground. Works for any session
    with a `claude:` handle, including manually recorded task-scoped ones.
  - **Locate** — `ward session locate ID`: found (with the path) or gone, human and `--json`, both
    exit 0. Open and closed sessions alike, because reflection reads finished work.
  - **Lifecycle events** on the record, append-only, including the `closed` event from
    `session close` and from the task-close cascade.
  - **What the run was started with**, recorded on a launched session (`model`, `effort`) — the
    intent's session-log minimum, and the half of 0027's SF-001 that entry called thin.
  - **The manifest refresh** — `AGENTS.md` gains a **Sessions** section (Ward opens sessions and the
    open starts the agent; exit ≠ close; resume; locate; where the agent configuration lives; the
    manual `--handle` path) plus a `sessions/` layout bullet, reaching existing workspaces through
    `ward workspace upgrade`.
  - **CLI plumbing** — `--json` shapes for the changed and new verbs, `ward schema` coverage,
    completion for `session resume` / `session locate`, telemetry's verb tree, and `sessions` in the
    reserved scope directories.
  - **Tests** — the adapter's argv/munging/handle tables, and an end-to-end suite through the
    spawned CLI against a stub harness that **looks for its own session document from inside the
    launch**.
- **Deferred:**
  - **Launching at task or project scope.** _Why safe:_ the record shape already carries a scope and
    project scope arrives as a new enum value with the verb that opens one — data, not a migration —
    and the directive explicitly asks for one mode first. Task-scoped `session open TASK` stays
    record-only.
  - **The SessionStart-hook capture path.** Documented below as the fallback if the `--session-id`
    create semantics turn out not to hold. _Why safe:_ the assumption fails **visibly at first use**
    — the launch errors, nothing is silently mis-recorded — and the fallback is designed, so
    building it is a small, known change rather than a redesign.
  - **Usage/token recording at close.** _Why safe:_ the harness contract makes usage optional and
    nothing may depend on its presence; reading it needs a transcript parser whose shape is the
    harness's, not Ward's, and this entry's job was the run, not the accounting.
  - **Fork (`--fork-session`), any multiplexer, detach, or background hosting.** _Why safe:_ Arc 2,
    and the multiplexer is its own seam — see SF-002, which records that the foreground start does
    not satisfy that seam's keep-alive-when-detached constraint and why that is acceptable now.
  - **A workspace-level sessions line in `ward status`.** _Why safe:_ `status` reports the state of
    the work — projects and tasks — and a workspace-scope session belongs to no task row; where to
    put it is a presentation question the entry that adds project scope will face with more than one
    case in hand. `ward session locate`, the record, and `workspace restore`'s count all see it
    today.
  - **A `closed` event backfilled onto records written before this entry.** _Why safe:_ the trail
    starts where the record starts; fabricating an `opened` for an event nobody recorded would put
    invented history in the store.
- **Acceptance:** `mise run check` green, and the suites proving: the argv table (absent keys omit
  their flags, args last, resume passes no model); the stub observing its own record before it runs;
  `WARD_AGENT` set to the session id; the session still open after an exit, with the run's exit code
  propagated; a spawn failure refused legibly with the record standing; `resumed` and
  `resume-failed` with cause; locate found and gone; a pre-0028 session record still parsing,
  closing, and locating; and the outgoing `AGENTS.md` recognized as a known default so upgrade
  brings it forward.

## Design

- **Decisions:** no new ADRs — the store stack ([ADR 0005](../decisions/0005-store-stack.md))
  already governs the record this entry extends. Entry-local:
  - **Ward assigns the handle; it does not discover it.** `claude --session-id <uuid>` accepts the
    id of the conversation it creates, so the id exists before the process does. Everything else
    follows: the record can be complete and committed _before_ the launch, the handle in it is the
    id the run is actually under, and no hook, prompt, or transcript scrape is needed. This is the
    directive's first quote satisfied structurally rather than economically — not "few tokens" but
    **zero**, because the agent is never asked anything. **The stated assumption:** passing a fresh
    UUID _creates_ the session under that id. It is implied by the CLI's help text and not
    documented explicitly; if it is wrong the launch fails visibly at first use, and the recorded
    fallback is a **user-level SessionStart hook** gated on a Ward-set environment variable — the
    hook's input JSON carries `session_id`, and exiting 0 with empty stdout injects nothing into the
    agent's context, so the token cost stays zero and only the direction of the handshake changes.
    Not built now: building both would mean maintaining a capture path nothing uses.
  - **Record, then launch — never the other way.** The session document is written and committed
    before the spawn. A crash in between leaves an honest record: an open session whose handle
    resolves to nothing, which `locate` reports as `gone`. The reverse order would leave a _running
    agent Ward has never heard of_, which is the one failure the record cannot describe afterwards
    (§16). The CLI's callback (`onRecorded`) exists to make the ordering observable rather than
    merely promised: the `--json` document is emitted from it, and the test's stub harness looks for
    its own session file from inside the launch and finds it.
  - **The workspace's sessions live at the workspace's level: `sessions/` at the root.** Two homes
    were considered. **Anchored to the standing workspace project**
    ([0018](../0018-standing-workspace-project/README.md)) would have reused an existing container —
    but that project is a _project_, and a session hung under it would be recorded at project scope
    while claiming to be responsible for the workspace; the standing project is the home for
    stewardship **work** (tasks), not for the workspace's own attention. **A workspace-level home**
    says exactly what is true, and it is the same move `tasks/` already makes for bare tasks: a
    scope's records live at that scope's level, and eliding the levels between changes ceremony,
    never semantics. It also keeps the shape uniform for what comes next — project-scope sessions
    will live under `projects/<floor>/sessions/`, which needs no migration of anything written
    today.
  - **Scope is a field; the referent is the field that already meant it.** `scope: workspace | task`
    with `task` present exactly when the scope is a task — the refine is the worktree record's
    `repo`-vs-`source` idiom, absence of a referent over a fabricated one. A workspace has no code
    to carry: it is identified by location. Both `scope` and the trail are optional in the schema
    **only** so pre-0028 records stay valid; every record written from now on states its scope
    outright, and `sessionScopeOf` reads the one implied by a carried task for the rest.
  - **The lifecycle trail lives on the session document.** The intent asks for append-only events;
    the store's discipline is typed front matter written atomically (ADR 0005), with one writer at a
    time under the store lock. An `events` array on the record satisfies both: appends never collide
    (§17), and one read answers "what is this session, and what has happened to it?" — where a
    sidecar log would be a second document to keep consistent with the first and a second thing to
    find. Append-only is a discipline here, not a filesystem guarantee: nothing rewrites or drops an
    entry. `openedAt`/`closedAt` stay as they were — the record's own summary fields, which `status`
    and the JSON shapes already read.
  - **Omitting TASK means workspace scope, which supersedes 0006's inference for this one verb.**
    [0006](../0006-scope-from-cwd/README.md) gave every task-addressed verb a cwd inference,
    `session
    open` included. That affordance and this scope rule cannot coexist: the same bare
    invocation cannot mean both "the task I am standing in" and "the workspace". The scope rule wins
    because it is what makes the launched path reachable at all (the directive's chosen first mode),
    and because the inference was always the _human's_ shortcut for a verb a declared agent had to
    spell out anyway. Everything else 0006 built is untouched, and the manifest and its test now say
    so. 0006 is not superseded as a whole; this one affordance is, explicitly, here.
  - **A resume passes the args and withholds the model.** A resumed run restores the model it was
    saved with; passing today's configuration would silently re-model an old conversation mid-thread
    — and the configuration may have changed for reasons that have nothing to do with this session.
    `agent.args` is different in kind: `--dangerously-skip-permissions` is a property of _this
    invocation_, not of the conversation, and a resumed process needs it exactly as much as a fresh
    one did.
  - **`resumed` is appended before the launch; `resume-failed` after the attempt.** The attempt is
    the fact worth recording, and an attempt that dies with the process it was about to start must
    still be visible. The pair is what makes a struggling recovery legible later — the intent's own
    argument for events.
  - **Gone is an outcome, not an error.** `locate` exits 0 either way and reports the path in both
    cases: retention belongs to the harness (Claude Code discards transcripts after
    `cleanupPeriodDays`, 30 by default), so a missing transcript is an ordinary fact reflection must
    be able to read — and "we looked _here_ and it is not there" is what makes it actionable. The
    lookup uses the **recorded** working directory, because the transcript's address includes the
    directory the run stood in, not wherever the caller is asking from.
  - **`src/harness/`, not `src/agent/`.** 0027 expected the adapter beside its settings. It landed
    in its own tree instead, because the boundary is the point: `src/harness/claude.ts` knows the
    CLI's flags and file layout and knows nothing about Ward, while `src/agent/` holds the
    Ward-shaped half — the configuration vocabulary (0027), the reader, and `run.ts`, which decides
    what gets recorded and when. A second harness is then a second file in `src/harness/`, which is
    the seam's whole promise. The directory boundary is cheaper to keep honest than a convention
    inside one file.
  - **`--json` emits its document, then the run takes the terminal.** The alternatives were refusing
    `--json` on the launched path (a verb that rejects the house flag) or suppressing the launch for
    a `--json` caller (the same command doing two different things). Neither is better than the
    honest arrangement: Ward emits exactly one document, before any process exists, and what appears
    after it is the _agent's own session_, not Ward's output. The record-only paths — task scope,
    and `--handle` at either scope — are unaffected, which is what the mutation-JSON suite
    exercises.
  - **The run's exit code is the invocation's.** Ward wrapped the run; swallowing a nonzero exit
    would tell a script the agent succeeded when it did not. The resume affordance still prints
    first, because the session is still open whatever the process did.
  - **An unreadable workspace record degrades the launch to the global layer.** §20 at the point of
    use: doctor already names a broken record precisely, and a preference file must never be the
    reason an agent cannot be started.
- **Layout:** new `src/harness/claude.ts` (the adapter), `src/agent/config.ts` (the reader 0027
  deferred until it had a caller that starts from a root), `src/agent/run.ts` (launch / resume /
  locate — the Ward-shaped half). Changed: `src/store/types.ts` (scope, events, model/effort, and
  `sessionRecordType` taking a scope directory), `src/workspace/sessions.ts` (the workspace-scope
  open, the event appends, one all-scopes reader), `src/workspace/layout.ts` (`sessions/`),
  `src/workspace/tasks.ts` (the close cascade's event), `src/workspace/restore.ts` (counting open
  sessions at every scope), `src/workspace/templates.ts` + `src/workspace/lineage.ts` (the manifest
  and its outgoing fingerprint), `src/cli/index.ts` (three paths through `session open`, plus
  `resume` and `locate`), `src/cli/json.ts` + `src/cli/schema.ts` (the shapes; `pathVerbShapes`
  became `argumentReadVerbShapes`, since `session locate` is the same kind of read verb — one whose
  argv is not derivable from its key), `src/cli/suggest.ts`, `src/cli/telemetry.ts`. Tests:
  `test/agent/harness.test.ts`, `test/agent/launch.test.ts`, and the stub in `test/helpers.ts`.
- **Mechanisms:**
  - _Open (launched):_ resolve the configuration → mint a UUID → write and commit `sessions/<id>.md`
    with the handle, directory, purpose, and what it will run with → report → spawn
    `claude --session-id <uuid> [--model M] [--effort E] <args…>` in the root with `WARD_AGENT=<id>`
    → wait → print the resume line → exit with the run's code.
  - _Resume:_ resolve the session at any scope → read its `claude:` handle (refusing a missing or
    foreign one by name) → append `resumed` → spawn `claude --resume <native-id> <args…>` in the
    recorded directory → on a spawn failure, append `resume-failed` with the cause and refuse.
  - _Locate:_ find the session (open or closed) →
    `<CLAUDE_CONFIG_DIR|~/.claude>/projects/<cwd with
    every non-alphanumeric character replaced by`-`>/<native-id>.jsonl`
    → found or gone.
  - _Upgrade:_ unchanged — `INSTALLED_ARTIFACT_LINEAGE` now knows the 0018-era `AGENTS.md`, so a
    workspace still carrying it untouched is `stale` (brought forward) rather than `customized`
    (kept and named).

## Build log

### 2026-08-21 — The seam, the scope, the launch, the manifest

**Goal.** Everything in Scope. **What was done.** Read the governing intent (`03-agent-harness`,
`02-sessions-and-lifecycle`, `01-scopes-and-personas`, `00-domain-model`) and the layer below (0027)
before designing; then, in four commits: the adapter and its tables; the record's scope and trail,
the workspace-scope open, the launch/resume/locate orchestration and its CLI; the manifest's
Sessions section with its lineage entry; and the recorded model/effort.

Three things changed shape while building. (1) `locate` was written against open sessions and turned
out to be wrong the moment reflection was the reader: a closed session's history is exactly what a
reflection wants, so the resolver grew an any-state twin and `resume` kept the open-only one —
closed stays closed. (2) The record home was decided against the domain model rather than against
convenience: hanging the workspace's sessions under the standing project would have reused an
existing container at the cost of recording a workspace-scope session at project scope. (3) The
`--json` question — a verb that emits one document _and_ hands the terminal to a child — was settled
by making the ordering the answer: the document describes the record, and the record is complete
before the process exists.

**What works now — with the exact commands that prove it** (Bun 1.3.14, Linux):

- **Dogfood, in a scratch workspace** with `WARD_CONFIG_DIR`, `CLAUDE_CONFIG_DIR`, and
  `WARD_CLAUDE_BIN` pinned at a stub that prints its argv and looks for the record. With
  `agent: {model: fable, effort: high, args: [--dangerously-skip-permissions]}` globally,
  `ward session open --purpose "dogfood the launched open"` prints
  `opened session workspace-1 (workspace scope, handle claude:97945a30-…)`, then the stub reports
  `--session-id 97945a30-… --model fable --effort high --dangerously-skip-permissions`, cwd the
  workspace root, `WARD_AGENT=workspace-1`, and — from inside its own run — the record already on
  disk carrying that very handle. On exit:
  `session workspace-1 is still open — an exit is not a
  close. Resume it: ward session resume workspace-1`.
- `ward session resume workspace-1` → `--resume 97945a30-… --dangerously-skip-permissions` (no
  model, no effort), and the record's trail reads `opened`, `resumed`.
- `ward session locate workspace-1` →
  `gone — no transcript at …/projects/-tmp-…-ws/97945a30-….jsonl` with the retention note, exit 0;
  after fabricating that file, `--json` gives
  `{outcome: "found", harness: "claude", nativeId: "97945a30-…", workingDirectory: ".", …}`.
- `ward schema session locate` emits the new shape as JSON Schema — the contract ships in the
  binary.
- `bun test test/agent/harness.test.ts test/agent/launch.test.ts` → `22 pass, 0 fail` (this entry's
  two suites); `bun test test/agent` → `52 pass`, with 0027's thirty untouched beside them.
- `bun test` → `492 pass, 0 fail, 1924 expect() calls` across 44 files, from `466 / 1806 / 42` at
  this branch's base. **One existing case changed**, deliberately: 0006's `session open, inferred`
  became `session open with no TASK is workspace scope, even inside a worktree`, plus a new case
  keeping the explicit `session open TASK` behavior it used to cover.
- `mise run fmt` then `mise run check` → exit 0 (Biome + dprint + `tsc --noEmit` + `bun test` +
  lychee).

**Shared surfaces this entry touches** — with 0027: the resolver in `src/agent/settings.ts`
(consumed, unchanged) and the workspace record's `agent` block (read by the new
`src/agent/config.ts`). With main: `src/cli/index.ts` (the session verbs),
`src/workspace/sessions.ts` (rewritten around scope), `src/workspace/templates.ts` +
`src/workspace/lineage.ts` (the manifest and its history), `src/store/types.ts` (the session
schema), and the mechanical rename of `pathVerbShapes` → `argumentReadVerbShapes` in
`src/cli/schema.ts` and `test/cli/global.test.ts`.

**One addition beyond the commissioned scope, named because it is one.** A launched session records
the `model` and `effort` it was started with. 0027 deferred exactly this to "the launch that knows
what it actually ran" (its SF-001, the half that entry called thin), and the intent's session-log
minimum names the model; it is four optional fields and it is what keeps a per-user configuration
layer from making a workspace unreproducible. Everything else here is the commission as written.

**Next.** Task- and project-scope launches (the records are ready); usage at close; and the first
real question this entry raises rather than answers — what a workspace does with sessions that are
open, unresumable, and never coming back (SF-003).

## Spec-feedback

- **SF-001** — [`sessions-and-lifecycle`](../../intent/01-concepts/02-sessions-and-lifecycle.md),
  _Recording per scope_ / [`agent-harness`](../../intent/02-subsystems/03-agent-harness.md), _Expose
  a harness handle_. _Friction:_ the seam says Ward **exposes** the handle the harness produced, and
  the lifecycle slice says the handle is "recorded" — both read as though the run mints its id and
  Ward writes down what came back. This entry does the opposite, and the inversion is load-bearing:
  **Ward assigns the id before the process exists**, which is the only ordering under which the
  record can be complete and committed before anything runs, and the only one that costs no context
  in the run. Nothing in intent permits or forbids it, but a design following the slices literally
  would build the losing order and inherit a window in which a live agent exists that the record has
  never heard of. _Assumption to keep moving:_ assignment is permitted and preferred wherever the
  harness accepts an externally-supplied run id; where it does not, the adapter reports the id the
  run minted and Ward records it immediately, accepting the window. _Proposed revision:_ one clause
  in the seam — "**The handle is recorded before the run exists where the harness allows it.** Where
  a harness accepts an externally-supplied run id, Ward assigns the handle and starts the run under
  it, so the record always precedes the process; where it does not, the adapter surfaces the id the
  run minted and Ward records it as its first act after start." _Why it belongs in intent:_ it holds
  however the launch is built, and it is the difference between a record that can always be trusted
  and one with a hole at the moment of starting.
- **SF-002** — [`session-multiplexer`](../../intent/02-subsystems/01-session-multiplexer.md),
  _Constraints_ (**Start** … and **keep it alive when detached**). _Friction:_ that seam owns
  "hosting live sessions", and its first constraint pairs starting with surviving detachment. This
  entry **starts** a session — in the caller's own terminal, in the foreground, dying with it — and
  therefore satisfies half of a constraint stated as one. The intent never says whether every start
  must go through the multiplexer, so today's build either violates the seam or sits outside it, and
  which of the two is a question only intent can settle. It matters practically: the routing job
  (`01-scopes-and-personas.md`, _Routing resolves to a session_) hands a human "the command to
  attach", and `ward session resume ID` is that command — but it re-attaches by **restarting the
  conversation**, not by attaching to something already alive. _Assumption to keep moving:_ a
  foreground start is a legitimate baseline — the harness-neutral, dependency-free rung — and the
  multiplexer is the alternate technique for the same contract (design rule 4, plural techniques),
  to be added when detachment is actually needed. Nothing here depends on liveness: the record is
  the truth, and resume rebuilds the run from it. _Proposed revision:_ split the seam's first
  constraint in two — "**Start** a session for a given scope/identity" as the baseline any design
  must offer, and "**Keep it alive when detached**" as the capability the multiplexer adds — and say
  plainly that a session may be hosted in the caller's terminal, with the consequence named (it ends
  when the terminal does; the record and resume are what survive).
- **SF-003** — [`sessions-and-lifecycle`](../../intent/01-concepts/02-sessions-and-lifecycle.md),
  _Open vs. running_ and _Recovery_. _Friction:_ "an exit is not a close" is exactly right and this
  entry implements it — and it creates a population the intent has no answer for: sessions that are
  **open, not running, and never coming back**. The agent exited; nobody resumed it; the transcript
  aged out after thirty days, so `locate` says `gone` and `resume` would start a conversation with
  no history. Recovery is specified to "filter to those that are open and not closed" and re-attach
  **each** of them, which for these means a growing set of doomed re-attachments — precisely the
  case the `resume-failed` event exists to make visible, with nothing specified to _act_ on it.
  _Assumption to keep moving:_ nothing sweeps anything; the events accumulate honestly, `locate`
  tells the truth, and closing stays a deliberate act by a human or agent — Ward never closes a
  session on the session's behalf, because "closed stays closed" is too strong a guarantee to hand
  to a heuristic. _Proposed revision:_ a clause under _Recovery_ naming the third outcome per
  thread, beside re-attached and skipped-as-closed: **unresumable** — open, but its handle no longer
  resolves — recorded on the recovery episode with its cause, surfaced to the human as something
  that needs them (`../02-subsystems/07-human-shell.md`), and never closed automatically.
  Optionally, a note that a session whose harness history is gone may still be resumed _as a fresh
  run under a new handle_, which is a different act and deserves a different word.
- **SF-004** — [`sessions-and-lifecycle`](../../intent/01-concepts/02-sessions-and-lifecycle.md),
  _Recording per scope_ (the minimum entry). _Friction:_ the minimum names **the persona (name +
  role)** among the fields every session entry captures, and Ward has no persona machinery at all —
  no cast, no name list, no way to say which persona a launch is for. A launched session therefore
  records identity, scope, working directory, handle, model, purpose, state, and events, and no
  persona. The list reads as a contract this build silently fails rather than as a target it has not
  reached yet. _Assumption to keep moving:_ `purpose` carries "what was this thread trying to do"
  (which the slice itself calls the load-bearing one), and persona is added by the entry that
  introduces the cast, at which point a launched session names one. _Proposed revision:_ mark the
  minimum's fields with what each depends on — persona once the cast exists, usage where the harness
  exposes it (already marked best-effort) — or state that the minimum is "everything the build can
  supply", so an entry can be complete against it without inventing a field it has no source for.
