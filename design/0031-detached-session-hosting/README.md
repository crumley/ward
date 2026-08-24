# 0031 — Detached session hosting

> The multiplexer seam, realized: `ward session open --purpose TEXT --detach` starts the agent
> inside a tmux session named deterministically from the workspace and session identity, and returns
> — the run survives the human walking away. `ward session attach ID` maps the record back to the
> live session, or re-creates it from the record when the host has lost it;
> `ward session observe ID` watches read-only; `resume` learns to point at a still-live run instead
> of starting a competing one; `close` tears the live half down; `locate` and `doctor` learn to tell
> the live cache from the durable record. The record stays the only source of truth throughout — a
> reboot loses panes, never threads.
>
> **Status:** proposed · **Started:** 2026-08-24

This entry is **design-only**: the complete, reviewable plan for the next arc, written before the
build so the plan can be judged as its own unit. The build that realizes it will journal into this
entry's build log (or into a successor that links back here) once this design is accepted.

The commissioning directive, restated in the entry's own words:
[0029](../0029-launched-sessions/README.md) made Ward launch agents — foreground, in the caller's
terminal, dying with it — and its SF-002 named the debt precisely: that start satisfies the
multiplexer seam's **baseline** and not the capability the seam **adds**, keep-alive-when-detached.
This arc pays that debt. A Ward-launched session must be able to outlive the human walking away, be
re-attached, be watched without being disturbed, and be found again from nothing but its durable
record — and the design must be concrete enough that a builder who was not in the room can start
from it.

## Serves intent

- [`session-multiplexer`](../../intent/02-subsystems/01-session-multiplexer.md) — the seam this
  entry exists to realize, constraint by constraint: **keep it alive when detached** is the hosted
  open; **(re-)attach** and **observe read-only** are `session attach` and `session observe`; **map
  a recorded reference back to a live session, and re-create it when not running** is the
  deterministic name mapping plus attach's re-create path; **the live host is a cache over the
  record** (§16) governs every flow below — nothing essential ever lives only in a pane; **group by
  scope, label by identity** falls out of the naming scheme; the **theming coordination** is
  designed-for and deferred (below). The seam's baseline/added split, adjudicated out of 0029's
  SF-002, is what makes this entry an _addition_ beside the foreground technique rather than a
  replacement of it — design rule 4, plural techniques behind one contract.
- [`sessions-and-lifecycle`](../../intent/01-concepts/02-sessions-and-lifecycle.md) — **open ≠
  running** finally gets a live overlay worth the name: with a host that can be asked `has-session`,
  _running_ is derivable on demand and still never stored. The lifecycle events grow `attached` and
  `observed` beside `opened`/`resumed`, so the trail keeps telling the truth about attention paid to
  a thread. The slice's "a different act deserves a different word" is taken seriously: attaching to
  a live process and resuming a stopped conversation are different acts here, with different verbs
  (and SF-001 asks the seam to say so).
- [`scopes-and-personas`](../../intent/01-concepts/01-scopes-and-personas.md) — _routing resolves to
  a session_, and for the human that means "the command to attach." 0029 could only offer `resume` —
  a restart wearing attach's name. With a live host, `ward session attach ID` is literally that
  command, which is the routing story the status personas are specified against.
- [`agent-harness`](../../intent/02-subsystems/03-agent-harness.md) — consumed, not changed: the
  hosted open runs the same `startArgv`/`resumeArgv` the foreground open runs, inside a host instead
  of the caller's terminal. The handle-assigned-before-start ordering survives intact, because the
  host wraps the spawn, not the id.
- [`visual-theming`](../../intent/02-subsystems/05-visual-theming.md) — designed-for, not built: the
  deterministic session name is the hook the theming entry will hang accents and glyphs on (tmux
  per-session status/border options), so nothing here has to move when that seam is realized.
- [`human-shell`](../../intent/02-subsystems/07-human-shell.md) — verbs read true: `attach`
  attaches, `observe` observes, `resume` resumes, and none of them wears another's meaning. Every
  refusal names its remedy with the exact command.
- [`principles`](../../intent/00-foundation/01-principles.md) — §16 (record then launch, host as
  cache), §19 (two techniques, one contract, convergence judged in use), §20 (a missing host
  degrades or refuses honestly, and doctor can name the break and its remedy), §18 (teardown of live
  state rides on the deliberate close, never on a sweep), §6 (attach, observe, and close are
  idempotent against the live layer), and the prime directive
  ([vision](../../intent/00-foundation/00-vision.md)): a dozen detached sessions a human can find by
  name at a glance is context management on the human's side of the table.

## Scope

- **In** (what the build this design commissions will deliver):
  - **The host adapter** — `src/host/tmux.ts`, a new `src/host/` tree mirroring `src/harness/`: the
    deterministic name mapping, argv builders for new/attach/observe/kill/has/list, and a runner.
    `WARD_TMUX_BIN` selects the binary — the hermeticity seam, `WARD_CLAUDE_BIN`'s exact pattern, so
    no test ever needs a real tmux server.
  - **The hosted open** — `ward session open --purpose TEXT --detach`: record first, then
    `tmux new-session -d` running the same harness argv the foreground path builds, then print the
    attach affordance and return. `--foreground` forces the baseline; bare `open` follows the
    resolved `agent.host` (below).
  - **Attach** — `ward session attach ID`: live → attach (or `switch-client` when the caller is
    already inside tmux); gone-but-open → **re-create from the record** (a hosted resume) and
    attach; closed → refused by name.
  - **Observe** — `ward session observe ID`: read-only attach to a live hosted session.
  - **Resume, host-aware** — `ward session resume ID` refuses when the host still holds the run
    live, pointing at attach; otherwise behaves as today, with `--detach` hosting the resumed run.
  - **Close tears down the cache** — `ward session close ID` (and the task-close cascade) kills the
    session's live host session when one exists, idempotently.
  - **Locate's live half** — `ward session locate ID` reports, beside the transcript answer, what
    the host says right now: the derived name, and live or not.
  - **Doctor** — host present (binary + version); **strays** (live `ward-…` sessions whose record is
    closed or missing — named with the exact `tmux kill-session` remedy, never swept); and the
    informational converse (open sessions opened detached whose live half is gone — ordinary after a
    reboot, reported as fact, not failure).
  - **Configuration** — `agent.host: foreground | tmux` on 0028's two-layer, per-key ladder
    ([0028](../0028-agent-configuration/README.md)); unset resolves to `foreground`.
  - **CLI plumbing** — `--json` shapes for the new and changed verbs, `ward schema` coverage,
    completion, telemetry's verb tree, and the manifest's Sessions section extended to teach
    detach/attach/observe.
  - **Tests** — the adapter's name-mapping and argv tables; end-to-end suites through the spawned
    CLI against a **stub tmux** (records its argv, simulates has/new/attach/kill), including the
    record-written-before-`new-session` ordering, the degrade and refusal paths, and doctor's
    findings against fabricated stray lists.
- **Deferred:**
  - **Messaging, dispatch, and wake riding on the host.** _Why safe:_ that is the messaging seam's
    own arc, and its contract is already **recorded-first** — live delivery is an optimization it
    may later hang on this host, and nothing built here closes that door (SF-002 records the line
    this entry draws).
  - **Fork (`--fork-session`) in any mode.** _Why safe:_ forking is the harness seam's open
    question, orthogonal to hosting — a fork, whenever it lands, is a **new session** with its own
    identity and handle, and this design hosts any session it is handed (SF-003).
  - **Task- and project-scope launches.** _Why safe:_ 0029's deferral stands and nothing here
    narrows it — attach, observe, locate, and close are **id-addressed** and scope-blind, and the
    name mapping already carries any session id, so the scoped launches arrive as data plus a verb,
    not a migration of this entry's work.
  - **Theming the host surface** (accents, glyphs, status lines). _Why safe:_ the theming seam owns
    it, and the deterministic name is the stable hook it needs; painting on top of a name changes no
    mapping.
  - **Grouping several Ward sessions into one tmux session per floor** (windows-per-scope). _Why
    safe:_ today's one-host-session-per-Ward-session mapping keeps attach and read-only semantics
    exact (both are per-tmux-session); prefix grouping serves the at-a-glance need now, and a
    regrouping later changes only the adapter's mapping — the record knows nothing of panes.
  - **A dedicated tmux server** (`tmux -L ward`). _Why safe:_ an isolation lever kept in reserve;
    the default server is where the human's own eyes and muscle memory already are (below, the
    naming decision), and moving later orphans only cache.
  - **Observing a session that is not live** (transcript tailing). _Why safe:_ the record and
    `locate` already answer "what happened"; observe is defined against liveness, and an honest
    refusal names `locate` as the reader for the rest.
- **Acceptance** (the exit test of the build, stated now so review can judge it): `mise run check`
  green, and suites proving — the name mapping's determinism and munging table; the record on disk
  before the stub tmux sees `new-session`; attach choosing attach vs `switch-client` vs re-create by
  host answer; observe passing `-r`; resume refusing on a live host with the attach command in the
  message; close killing the live session and staying idempotent when none exists; the explicit-flag
  refusal and the configured-default degrade, each naming its consequence; locate's `host` block in
  `--json`; doctor naming a stray with its remedy; and every pre-0031 record parsing unchanged. For
  **this design-only unit**, acceptance is the gate green over the two documents and this plan
  surviving review.

## Design

- **Decisions:** rests on
  [ADR 0006 — tmux as the detached session host](../decisions/0006-tmux-detached-host.md) (proposed
  with this entry): the candidates surveyed against the seam's constraints, tmux recommended as the
  **added technique** beside the foreground baseline. Entry-local decisions:
  - **Two techniques, one contract — and how convergence will be judged.** Foreground stays the
    universal, dependency-free technique; tmux hosting is the technique for work that must outlive
    the terminal. Neither replaces the other on paper: both ship, `agent.host` and the flags pick
    per use, and the evidence that decides is real usage — the telemetry verb tree already counts
    invocations per verb and flag, and frictions land in the build log of whichever entry observes
    them. Convergence is recorded, per design rule 4, as either one technique kept or an explicit
    technique→situation rule (the expected outcome: foreground for sit-with-it work, detached for
    walk-away work — but that is a hypothesis for use to confirm, not a conclusion).
  - **Record, then launch — unchanged by the host.** The session document is written and committed
    before `tmux new-session` runs, exactly as 0029 ordered the foreground spawn. The host adds no
    new window between record and process: a crash between the two still leaves an open record whose
    handle and host name resolve to nothing, which `locate` and doctor report honestly.
  - **Detach means Ward is no longer the run's parent — the consequence is named, not hidden.** The
    foreground open waits and propagates the run's exit code; a hosted open cannot, and does not
    pretend to: it returns once the host holds the run, and the run's exit is thereafter
    **discovered** (the host session ends when its process does) rather than **observed**. No shim
    is wrapped around the harness to report its exit back — a shim would put Ward machinery inside
    the run's process tree for the sake of an exit code the record does not need (open ≠ running; an
    exit was never a close).
  - **One tmux session per Ward session.** Attach and read-only are per-tmux-session in tmux;
    mapping one-to-one keeps `attach ID` and `observe ID` exact — attaching to a thread never shows
    a neighbor's pane. Grouping is served by the name prefix (and tmux's own `choose-tree`);
    regrouping into per-floor sessions with per-thread windows stays open as a later adapter-only
    change (deferred, above).
  - **The default tmux server, not a private socket.** Ward's sessions appear in the human's own
    `tmux ls`, prefix-grouped — discoverable exactly where a tmux user already looks, which is the
    seam's at-a-glance requirement met with zero new surface. A private `-L ward` server would
    isolate Ward from name collisions and from a stray `kill-server`, at the price of hiding every
    session from the surface humans actually check; if collisions bite in practice, the socket is a
    one-line adapter change and a superseding note here.
  - **The host name is a pure function of identity — nothing new is stored to map record→live.**
    `ward-<workspace-name>-<session-id>`, munged to tmux's safe alphabet (below). Storing the name
    would create a second copy of derivable truth to keep consistent (§17's derive-don't-store); a
    pure function means the mapping survives any loss of live state by construction.
  - **The record gains `host` — how the run was started, never whether it is running.** An optional
    `host: 'tmux'` field (absent = foreground, so every pre-0031 record reads unchanged), set at
    open/resume when the run is hosted. It is launch provenance in the exact sense of the recorded
    `model`/`effort` — what the session was started with — and it is what lets resume and doctor
    reason about the live half without ever persisting _running_ (the lifecycle slice's hard rule).
  - **Explicit flag refuses; configured default degrades — both honestly (§20).** `--detach` with no
    usable tmux is refused with the diagnosis and remedy: detachment was the point of the
    invocation, and a foreground session silently substituted would be the seam's named consequence
    hidden. `agent.host: tmux` with no usable tmux degrades to foreground and **says so** — "host
    tmux unavailable — running in the foreground; this session ends with this terminal" — because a
    preference must never be the reason an agent cannot start (0029's own §20 argument, extended
    from config to capability). Doctor names the precise break either way.
  - **Resume refuses over a live host.** `claude --resume` on a conversation that is still running
    in a pane would race two processes over one thread's state. The refusal names the true verb:
    attach. This keeps resume's promise exact — it re-establishes a live attachment where none
    exists — and makes attach the only door to a live run.
  - **Attach re-creates when the live half is gone — and inherits locate's honesty when the
    transcript is gone too.** Re-create is a hosted resume: same handle, same recorded directory,
    the conversation continuing where it left off — the seam's "re-create it when not running"
    realized as composition, not new machinery. When `locate` says the transcript is gone as well,
    attach refuses with that answer rather than silently opening an empty conversation under an old
    name — the lifecycle slice's fresh-run-is-a-different-act rule, enforced at the door.
  - **Close kills the cache; nothing else ever does.** Teardown of live state rides on the
    deliberate close (the same shape as task close tearing down worktrees), is idempotent when the
    live half is already gone, and is the **only** automatic kill in the design. Doctor surfaces
    strays with the exact remedy and never acts on them — a sweep would spend §18's authority on a
    heuristic (SF-004 proposes the seam say this outright).
- **Layout:** new `src/host/tmux.ts` (adapter: naming, munging, argv builders, runner, list parser)
  and `src/agent/host.ts` (the Ward-shaped half: hosted open/resume orchestration, attach/
  observe/re-create flows, close teardown — consuming `src/agent/run.ts`'s argv building rather than
  duplicating it). Changed: `src/agent/run.ts` (the launch grows a hosted variant),
  `src/agent/settings.ts` (the `host` key, enum-validated like `harness` — the host roster is Ward's
  own adapter list, exactly the reasoning that enum-validates `harness` and refuses to enum-validate
  `model`), `src/store/types.ts` (the optional `host` field; `attached`/`observed` events),
  `src/workspace/sessions.ts` (event appends), `src/workspace/tasks.ts` (close cascade teardown),
  `src/workspace/doctor.ts` (host checks, stray/gone findings), `src/cli/index.ts` + `json.ts` +
  `schema.ts` + `suggest.ts` + `telemetry.ts` (verbs and shapes), `src/workspace/templates.ts` +
  `lineage.ts` (the manifest teaching detach/attach/observe). Tests: `test/host/tmux.test.ts`,
  `test/agent/hosted.test.ts`, a stub tmux beside the stub harness in `test/helpers.ts`.
- **Mechanisms:**
  - _Naming and mapping._ `hostSessionName(workspaceName, sessionId)` =
    `ward-<workspace>-<session-id>` with every character outside `[A-Za-z0-9_-]` replaced by `-`
    (tmux rejects `.` and `:` in names, and the munge mirrors the harness adapter's cwd munge in
    spirit). The `ward-` prefix is the grouping cue and doctor's scan key; the workspace name (from
    `workspace.md`, recorded at creation) is what keeps two workspaces on one machine from colliding
    on `workspace-1`. The mapping lives in the adapter and is exported for tests, and it is the
    single point theming will later decorate.
  - _Hosted open._ Resolve configuration (host, model, effort, args) → mint the UUID → write and
    commit the record (state `open`, handle, `host: tmux`, directory, purpose, model/effort) →
    report (`--json` emits here, before any process — cleaner than the foreground path, since no
    terminal handover follows) → `tmux new-session -d -s <name> -c <dir> <claude argv>` with
    `WARD_AGENT=<id>` in the pane's environment → verify with `has-session` → print the affordances:
    `ward session attach <id>` and the raw `tmux attach -t <name>` beside it (the routing story
    hands humans a command that works even where `ward` is not on PATH).
  - _Attach._ Resolve the session (open only) → derive the name → `has-session`? live: attach —
    `tmux attach-session -t <name>`, or `tmux switch-client -t <name>` when `$TMUX` says the caller
    is already inside a client (attaching a nested client is tmux's own refusal; switch is the
    honest verb there). Not live: re-create — locate first; transcript found → `tmux new-session -d`
    running `resumeArgv`, append `resumed`, then attach; transcript gone → refuse with locate's
    path-and-retention answer. Append `attached` before handing the terminal over. Idempotent by
    construction: attaching twice is two clients on one session, tmux's ordinary case.
  - _Observe._ Live only: `tmux attach-session -r -t <name>` — read-only enforced by the tmux
    server, not by politeness. Appends `observed`. Not live → refusal naming `attach` (which would
    re-create) and `locate` (which reads the history).
  - _Resume._ Unchanged flow from 0029, with one new gate at the top: derive the name, ask
    `has-session`, and refuse over a live host with the attach command in the message. `--detach`
    routes the resume through the hosted path (new host session, `resumed` appended, affordances
    printed, no wait).
  - _Close._ After the record mutation, derive the name and `tmux kill-session -t <name>` if live;
    report the teardown in the mutation's steps. A kill that finds nothing is a no-op, not an error.
  - _Locate._ The existing transcript answer, plus a `host` block: `{kind, name, live}` when the
    record says the session was hosted, `null` otherwise. One read then answers both halves of
    "where is this session?" — durable history and live cache — with the cache clearly labeled as
    the half that may honestly say nothing.
  - _Doctor._ Three additions. **Capability:** the tmux binary and version (a finding, not an error
    — foreground is a complete technique). **Strays:** `list-sessions` filtered to the workspace's
    `ward-<workspace>-` prefix, joined against the records; a live name whose record is closed or
    missing is named with `tmux kill-session -t <name>` as the remedy. **Gone:** open records with
    `host` set whose live half is absent — reported as information ("not running — attach re-creates
    it"), because after any reboot this is the _normal_ state of every detached session, and §20
    forbids dressing the ordinary up as failure.
  - _Reboot, end to end (the scenario the seam exists for)._ The tmux server dies with the machine;
    every pane is gone; every record survives. Nothing needs sweeping: the records still say `open`,
    doctor reports the gone live halves as information, and each thread comes back through `attach`
    (re-create) exactly when someone wants it — no mass restart burning tokens on threads nobody is
    ready to look at. The future recovery arc orchestrates this per the lifecycle slice; this entry
    supplies the per-session mechanics it will call.

## Build log

### 2026-08-24 — The design, as its own reviewable unit

**Goal.** Design the multiplexer-seam arc completely enough that a builder can start from it, and
ship the design for review before any implementation exists. **What was done.** Read the governing
intent (the multiplexer seam and its neighbors: messaging, harness, theming, sessions-and-
lifecycle, scopes-and-personas, vision, principles), 0029 in full (the machinery this stacks on, and
the SF-002 that names the debt), and the current code read-only (`src/agent/run.ts`,
`src/harness/claude.ts`, the session record schema, the session verbs). Surveyed the host candidates
and recorded the choice as [ADR 0006](../decisions/0006-tmux-detached-host.md) (proposed); wrote
this entry — verb surface, naming, failure semantics, scope boundaries, and the acceptance the build
will be measured against. No `src/`, `test/`, or `intent/` files were touched: this is a design-only
unit, and the frictions it surfaced went to Spec-feedback below. **What works now — with the exact
command that proves it:** the two documents pass the repo's full gate — `mise run check` (Biome +
dprint + `tsc --noEmit` + `bun test` + lychee + actionlint) → exit 0 on this branch. **Decisions.**
All recorded under Design, above. **Next.** Human review of this entry and ADR 0006; on acceptance,
the build proceeds against the Scope and Acceptance stated here.

## Spec-feedback

- **SF-001** — [`session-multiplexer`](../../intent/02-subsystems/01-session-multiplexer.md),
  _Constraints_ ("map a recorded session reference … back to a live session **for resume**, and
  re-create it when not running"). _Friction:_ with a real host, the constraint's wording conflates
  two acts the lifecycle slice itself insists on keeping distinct: **attaching** to a run that is
  alive (joining a process, costing nothing) and **resuming** one that is not (re-establishing a
  live attachment). The seam's "for resume" reads as though mapping exists to serve resume, when in
  the hosted world the mapped-to live session is precisely the case where resume must _refuse_ (this
  design's resume gate) and attach is the true verb — the same different-act-different-word rule the
  lifecycle slice already applies to fresh-run-vs-resume. _Assumption to keep moving:_ the
  constraint means "map the record to the live session so a caller can reach it — attach when live,
  re-create (resume) when not," and this design builds that reading. _Proposed revision:_ reword the
  constraint to name both acts: "Map a recorded session reference back to a live session — to
  **attach** when it is running, and to **re-create it** (a resume into the host) when it is not."
  _Why it belongs in intent:_ the two-verb distinction holds for any host technique, and a design
  following the current wording literally could build resume-as-attach — the exact conflation 0029's
  routing note already had to apologize for.
- **SF-002** — [`session-multiplexer`](../../intent/02-subsystems/01-session-multiplexer.md) /
  [`messaging-coordination`](../../intent/02-subsystems/02-messaging-coordination.md), the shared
  open question (_multiplexer-vs-store split_). _Friction:_ both slices track "how much of
  dispatch/wake rides on the multiplexer" as open, and this design had to take a position to draw
  its own boundary: a live host makes injecting into a pane trivially available, and nothing in
  either slice says whether the hosting arc may start using it. _Assumption to keep moving:_ the
  host carries **hosting only** — no delivery, no wake, no nudge rides on it in this arc; every
  coordination flow stays recorded-first in the store, and live delivery over the host remains the
  messaging arc's optimization to design against its own contract (idempotent, recorded-first,
  re-armed on recovery — properties a raw pane injection has none of). _Proposed revision:_ note
  under both slices' open question that the split has a provisional floor: the multiplexer's
  responsibility ends at hosting; anything message-shaped that later rides on it is the messaging
  seam's design, built on the record. _Why it belongs in intent:_ it keeps a future hosting change
  from quietly becoming an unrecorded delivery channel — the leak the messaging seam calls out as
  the reason it is opinionated.
- **SF-003** — [`agent-harness`](../../intent/02-subsystems/03-agent-harness.md), _Open questions_
  (fork mode first) with
  [`scopes-and-personas`](../../intent/01-concepts/01-scopes-and-personas.md). _Friction:_ the
  fork-mode-first question is tracked as if some arc must resolve it before adjacent work can
  proceed, and this arc sits adjacent (the harness's `--fork-session` is the exact-clone mechanism,
  and a fork of a hosted session must live somewhere). Nothing says whether hosting may land first.
  _Assumption to keep moving:_ hosting is **neutral** to fork mode and lands first — an exact-clone
  fork, whenever it ships, produces a _new session_ with its own identity and handle (the harness
  seam already says so), and a new session is hosted by this design like any other open; the
  distilled-brief fork is just an open with a brief for a purpose. Neither mode needs anything from
  the host beyond what every session gets. _Proposed revision:_ one sentence under the open question
  recording that hosting does not gate on it: a fork in either mode arrives at the multiplexer as an
  ordinary new session, so the question stays open without blocking (or being reopened by) hosting
  work. _Why it belongs in intent:_ the question's answer will come from fork-arc evidence, and
  marking its non-dependency keeps a future builder from re-deriving this entry's neutrality
  argument — or worse, assuming hosting prejudged the mode.
- **SF-004** — [`session-multiplexer`](../../intent/02-subsystems/01-session-multiplexer.md),
  _Constraints_ (cache-over-record) with
  [`../../intent/00-foundation/01-principles.md`](../../intent/00-foundation/01-principles.md) §18.
  _Friction:_ the seam says the live host is a cache and never the truth, but is silent on **who may
  destroy live state and when** — and a cache full of processes is not a cache of bytes: killing a
  live pane discards an agent's un-recorded working state even though the durable record survives.
  This design needed the rule three times (close's teardown, doctor's strays, the temptation to
  sweep) and found it nowhere. _Assumption to keep moving:_ teardown of a session's live half rides
  on that session's **deliberate close** (the actor closing has the authority the close itself
  required); stray live sessions — cache entries whose record is closed or missing — are **surfaced
  with a remedy and never swept**, the same never-on-the-session's-behalf shape as the
  unresumable-thread rule. _Proposed revision:_ a clause in the seam: "**Live state is torn down by
  the lifecycle, not by hygiene.** Closing a session tears down its live hosting; anything live that
  no open record explains is surfaced to the human with its remedy, never reaped automatically."
  _Why it belongs in intent:_ it holds for any host, and without it every future design re-litigates
  whether doctor may kill — with §18 arguing one way and "just a cache" arguing the other.
