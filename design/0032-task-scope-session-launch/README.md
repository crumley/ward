# 0032 — Task-scope session launch

> `ward session open TASK --purpose TEXT` now opens a session at **task scope** and **starts the
> agent in it**, standing in the task's own worktree — the same launch spine 0029 built (assigned
> handle, record-then-launch, `WARD_AGENT`, exit ≠ close), reached from the task's side. With one
> worktree the directory is derived; with none or several Ward refuses legibly and `--dir` says
> where. `--handle` stays the record-only path at either scope, byte-for-byte.
>
> **Status:** accepted · **Started:** 2026-08-24

The owner's commissioning directive made one ask with three edges — restated here in the entry's
words, not the owner's:

1. **The launched open reaches task scope.** 0029 deferred exactly this ("task-scoped
   `session open TASK` stays record-only"), and this entry is the pickup: the core delivery loop — a
   task, its worktree, an agent working in it, a pull request out of it — becomes one command, with
   everything the workspace-scope launch already guarantees (the id assigned before the process
   exists, the record complete before the launch, the lifecycle trail, the recorded model and
   effort).
2. **The record-only path does not move.** `--handle` — the path for a run Ward did not start —
   keeps its exact behavior at both scopes; an agent recording itself mid-run must find the verb it
   was taught.
3. **Where the agent stands is designed, not guessed.** The launch directory is the task's worktree,
   and the edge cases are deliberate: a sole worktree is used; zero or several are refused with the
   options named (create one, or pass `--dir`); `--dir` keeps the meaning it has always had on this
   verb — the recorded working directory, now also the launch directory.

## Serves intent

- [`sessions-and-lifecycle`](../../intent/01-concepts/02-sessions-and-lifecycle.md) — the same
  lifecycle, at a second scope: the record precedes the process, an exit leaves the session `open`,
  `resumed` / `resume-failed` / `closed` land on the trail, and the session-log minimum (purpose,
  directory, handle, model) is met by the same fields at task scope that 0029 wrote at workspace
  scope. Nothing lifecycle-shaped is scope-shaped, which is what made this entry an extension rather
  than a redesign.
- [`scopes-and-personas`](../../intent/01-concepts/01-scopes-and-personas.md) — **the two axes**,
  exercised for real: scope (the task's outcome) and working directory (the task's worktree) are
  recorded separately, the directory derived from the scope's own record when the opener does not
  choose and refused when derivation would be a guess (SF-001 records the friction in how the slice
  words the independence).
- [`domain-model`](../../intent/01-concepts/00-domain-model.md) — the session nests under the scope
  it belongs to (`tasks/<code>-<slug>/sessions/`), exactly where record-only task sessions have
  lived since 0004; ids stay unique among open sessions workspace-wide, so `resume`, `locate`, and
  `close` address a launched task session by its bare id with nothing new.
- [`agent-harness`](../../intent/02-subsystems/03-agent-harness.md) — _start an agent at a scope …
  in a working directory_, now true for the scope the seam's sentence most obviously meant. The
  adapter (`src/harness/claude.ts`) is untouched: a second scope needed nothing from the seam, which
  is the seam working.
- [`workspace-lifecycle`](../../intent/01-concepts/06-workspace-lifecycle.md) — the installed
  `AGENTS.md` taught that a task open records without launching; that sentence is now false, so the
  manifest is refreshed and the outgoing default's fingerprint joins the lineage
  ([0020](../0020-deterministic-upgrade/README.md)'s mechanism, 0029's precedent), reaching existing
  workspaces through `ward workspace upgrade`.
- [`principles`](../../intent/00-foundation/01-principles.md) — §16 (the record is written before
  the process and a refusal writes nothing at all), §12 (the handle still costs zero tokens —
  nothing about the task is asked of the agent), §6 (the sole-worktree rule is deterministic, and
  ambiguity is a refusal rather than a heuristic), §20 (the refusal names both ways through).

## Scope

- **In:**
  - **The launched open at task scope.** `ward session open TASK --purpose TEXT` with no `--handle`:
    resolve the agent configuration, settle the launch directory, mint the UUID, write and commit
    the record (scope `task`, its task code, handle, directory, purpose, and the resolved
    `model`/`effort`), report it, then run the agent in the foreground with
    `WARD_AGENT=<session id>`, in the recorded directory. Exit ≠ close; the run's exit code is the
    invocation's; a spawn failure is refused legibly with the record standing — all of it the 0029
    contract, at the new scope.
  - **One launch spine for both scopes.** `launchWorkspaceSession` and the new `launchTaskSession`
    are two openers over one private `launchOpened` in `src/agent/run.ts`, so the launch semantics
    cannot drift between scopes by construction.
  - **The launch-directory rule.** `--dir` wins when given. Otherwise: exactly one worktree — use
    it; zero — refuse, naming `ward worktree create TASK --repo NAME` and `--dir PATH`; several —
    refuse, naming every worktree path and `--dir`. A refusal happens **before the record exists**:
    no session, no id spent, no trail for a launch that had nowhere to stand.
  - **The record-only path, unmoved.** `--handle` at either scope behaves exactly as before — same
    records, same output, no spawn — and the store-level `openSession` API keeps its record-only
    nature (it additionally records `model`/`effort` when the launch passes them, mirroring
    `openWorkspaceSession`).
  - **Resume / locate / close for launched task sessions** — already scope-agnostic since 0029 (bare
    id, recorded directory); this entry proves them against a launched task session rather than
    changing them.
  - **The manifest refresh** — the Sessions section gains the task-scope bullet (launched, in the
    task's worktree, sole-or-`--dir`), and the record-only bullet now says `--handle` is what makes
    an open record-only; the outgoing 0029-era default's sha256 joins `INSTALLED_ARTIFACT_LINEAGE`
    so `ward workspace upgrade` brings an untouched manifest forward.
  - **Tests** — task-scope cases in the stub-harness end-to-end suite (record beside the task,
    launch cwd, `WARD_AGENT`, record seen from inside the run, model/effort recorded; both refusals
    with nothing manufactured; `--dir` at zero and at several; `--handle` record-only; resume in the
    recorded worktree), the scope suite's task-open case updated to the launched behavior, and the
    lineage pins moved.
- **Deferred:**
  - **Launching at project scope.** _Why safe:_ unchanged from 0029 — the scope enum grows a value
    with the verb that opens one; both launched scopes now go through one spine, so the third is an
    opener, not a migration.
  - **A workspace-level sessions line in `ward status`.** 0029 deferred it to "the entry that adds
    project scope … with more than one case in hand", and this entry deliberately keeps the
    deferral: the decision here was that there is **nothing to build for task scope** — task rows
    have carried their open session ids since the status report gained `openSessions` (human
    `— sessions: …` and JSON alike), so a launched task session is already visible exactly where its
    work is. _Why safe:_ the only sessions `status` cannot yet place are the ones that belong to no
    task row — workspace scope today, project scope next — and that is the same presentation
    question 0029 named, still best answered with the project case in hand. `ward session locate`,
    the record, and `workspace restore`'s count see every scope today.
  - **Room-scope sessions, and a persona on the launch.** _Why safe:_ rooms have no records yet and
    personas no cast (0029's SF-004, adjudicated: fields conditioned on a source existing); SF-002
    below records what building at the worktree taught about where that boundary will land.
  - **Usage/token recording at close.** _Why safe:_ 0029's reasoning, unchanged — optional by the
    seam's contract, and this entry's job was the second scope, not the accounting.
  - **Hardening the test scaffolding against an ambient `WARD_AGENT`.** Building from inside a
    Ward-launched session showed the spawned-CLI suites inherit the caller's `WARD_AGENT` and eight
    pre-existing cases fail under it (they assert human-shaped output); this entry's gate runs are
    `env -u WARD_AGENT`. _Why safe:_ the failures predate this entry, CI has no `WARD_AGENT`, and
    the fix (stripping it at every spawn helper) touches many suites this entry otherwise leaves
    alone — it deserves its own small change, not a rider.
- **Acceptance:** `mise run check` green, and the suites proving: the launched task open writes
  scope `task` beside its task with the worktree as its directory and the resolved model/effort on
  the record; the stub observes its own record from inside a run whose cwd is the worktree and whose
  `WARD_AGENT` is the session id; the zero- and multi-worktree refusals name their options and
  manufacture nothing; `--dir` launches exactly where it says at both edge cases; `--handle` at task
  scope records without any spawn; resume of a launched task session re-attaches in the recorded
  worktree; and the outgoing `AGENTS.md` is a known default so upgrade brings it forward.

## Design

- **Decisions:** no new ADRs — the store stack ([ADR 0005](../decisions/0005-store-stack.md))
  governs the record, and every stack choice this launch rests on was 0029's. Entry-local:
  - **One spine, two openers.** The launch invariants — configuration resolved before the record,
    record written and reported before the spawn, `WARD_AGENT` set, argv from the same `startArgv` —
    are one private function (`launchOpened`); each scope contributes only how its record is opened.
    The alternative (a parallel `launchTaskSession` transcribing 0029's body) would have been two
    copies of the ordering the whole design rests on, divergeable by any future edit. The refactor
    changes nothing observable at workspace scope, which the untouched 0029 suites prove.
  - **The task's agent stands in the task's worktree.** The worktree is where the task's changes are
    made — the anchor the domain model gives the work — so it is the directory in which the launched
    agent loads context and acts. The workspace root would hand a task-scope agent the whole
    workspace's ground and leave it to find its own way down; the worktree is the honest default and
    the reason this launch automates the delivery loop at all.
  - **Sole worktree derived; ambiguity refused, never guessed.** With one worktree there is nothing
    to decide. With zero, launching in a fabricated place (the root, a nonexistent path) would
    record a directory the work never stood in; with several, picking one silently would load one
    branch's context for another branch's work — exactly the wrong-context failure a refusal costs
    nothing to prevent. Both refusals name the way through (create the worktree, or `--dir`), and
    both happen **before the record is written**: a launch that never had a place to stand leaves no
    session, no spent id, and no trail to explain away. The record-only default
    (`worktrees[0] ?? '.'`, from 0004) is deliberately untouched: a `--handle` caller is recording a
    run that already stood somewhere, and a guessed-at default there mis-records at worst, where a
    launched guess mis-**acts**.
  - **`--dir` stays one thing.** It has always named the recorded working directory on this verb; on
    the launched path the recorded directory is also the launch directory, so `--dir` now steers the
    launch by meaning exactly what it always meant — not by gaining a second sense.
  - **`--handle` is what makes an open record-only.** The verb's paths are now split on one flag
    rather than on scope: no `--handle` launches (workspace or task), `--handle` records a run Ward
    did not start (workspace or task). One rule to teach, and the manifest now says it that way. The
    task+`--handle` combination is byte-for-byte the 0004 behavior.
  - **`openSession` records what the launch passed, and nothing more.** The store function gains the
    same optional `model`/`effort` spreads `openWorkspaceSession` got in 0029 — recorded only where
    Ward did the starting, because they state what actually ran, and a hand-recorded session has no
    source for them (the session-log minimum's own conditioning).
  - **No new shapes, verbs, or completion.** 0029 built the JSON shapes scope-ready:
    `sessionMutationShape` already carries `scope`, `task`, `model`, `effort`, so the launched task
    open emits the same document the record-only one did, `ward schema` already publishes it, the
    parser tree gained no words (no new flag, no new verb), and telemetry's verb tree is unchanged.
    Parity cost zero lines, which is the 0029 groundwork paying out.
- **Layout:** changed: `src/agent/run.ts` (`launchTaskSession`, the shared `launchOpened`, the
  sole-worktree resolver), `src/workspace/sessions.ts` (`openSession` records model/effort),
  `src/cli/index.ts` (`cmdSessionOpen` split on `--handle`, one launched renderer for both scopes
  via `describeScope`, the verb's brief), `src/workspace/templates.ts` (the manifest's Sessions
  section), `src/workspace/lineage.ts` (the outgoing default's fingerprint). Tests:
  `test/agent/launch.test.ts` (the task-scope section and a fixture that fabricates worktree records
  — the launch reads the record, so no git worktree is needed), `test/cli/scope.test.ts` (the
  task-open case, now launched), `test/workspace/lineage.test.ts` (pins moved, the 0032-supersedes
  guard added).
- **Mechanisms:**
  - _Open (task, launched):_ settle the directory — `--dir`, else the task's sole worktree, else
    refuse naming the options → resolve the configuration → mint a UUID → write and commit
    `tasks/<dir>/sessions/<id>.md` (scope `task`, task code, handle, directory, purpose,
    model/effort) → report → spawn `claude --session-id <uuid> [--model M] [--effort E] <args…>` in
    the worktree with `WARD_AGENT=<id>` → wait → print the resume line → exit with the run's code.
  - _Open (task, `--handle`):_ unchanged — record and commit, no spawn.
  - _Resume / locate / close:_ unchanged code paths; a launched task session is found by bare id at
    its scope, resumed in its recorded worktree, located against it.
  - _Upgrade:_ unchanged — the lineage knows the 0029-era `AGENTS.md`, so a workspace still carrying
    it untouched is `stale` and comes forward.

## Build log

### 2026-08-24 — The second launched scope

**Goal.** Everything in Scope. **What was done.** Read the governing intent
(`02-sessions-and-lifecycle`, `01-scopes-and-personas`, `03-agent-harness`) and the layers below
(0028, 0029) before designing; then: the launch spine factored out and the task opener added;
`openSession`'s model/effort; the CLI's `--handle` split and shared launched renderer; the
manifest's task bullet with its lineage entry; the suites.

Two things changed shape while building. (1) `launchTaskSession` began as a transcription of the
workspace launcher and became an opener over a shared spine the moment the two bodies were
side-by-side: every line that differed was scope, every line that matched was invariant, and the
invariant is exactly what must not drift. (2) The directory refusal moved ahead of the record — the
first draft resolved worktrees inside the open and refused after allocation, which would have spent
an id and written nothing to explain it; settling the directory first means a refusal manufactures
nothing, which the tests pin (`readSessions` empty, `runs()` empty).

**What works now — with the exact commands that prove it** (Bun 1.3.14, Linux):

- **Dogfood, in a scratch workspace** with `WARD_CONFIG_DIR`, `CLAUDE_CONFIG_DIR`, and
  `WARD_CLAUDE_BIN` pinned at a stub that prints its argv, cwd, and environment. With a task `t1`
  and no worktree, `ward session open t1 --purpose "drive the feature"` refuses:
  `task 't1' has no worktree to stand the agent in`, naming both
  `ward worktree create t1 --repo NAME` and `--dir PATH` — and no session record exists. After
  `ward worktree create t1 --repo demo`, the same command prints
  `opened session feature-1 (task t1, handle claude:3c786ca7-…)` then
  `launching the agent in worktrees/t1-feature — WARD_AGENT is set`; the stub reports
  `--session-id 3c786ca7-…`, cwd `…/ws/worktrees/t1-feature`, `WARD_AGENT=feature-1`; on exit:
  `session feature-1 is still open — an exit is not a close`. The record at
  `tasks/t1-feature/sessions/feature-1.md` carries `scope: task`, `task: t1`,
  `workingDirectory: worktrees/t1-feature`, the handle, and the `opened` event.
- `ward session resume feature-1` → `--resume 3c786ca7-…`, cwd the worktree again, and the trail
  reads `opened`, `resumed`. `ward session locate feature-1` resolves against the **worktree's**
  munged path, exit 0.
- With a second worktree, `ward session open t1 --purpose …` refuses:
  `task 't1' has 2 worktrees — say where the agent stands with --dir PATH (one of:
  worktrees/t1-feature, worktrees/t1-second)`;
  adding `--dir worktrees/t1-second` records and launches exactly there. `--handle claude:abc`
  records without any spawn, and `ward status` shows the open session on its task's own row
  (`t1 feature [active] — sessions: feature-1`) — the indicator this entry decided not to duplicate
  at workspace level.
- `bun test test/agent` → `58 pass, 0 fail` (the launch suite grew from 15 to 22 cases); `bun test`
  → `550 pass, 0 fail, 2357 expect() calls` across 47 files, from `543 / 2313 / 47` at this branch's
  base. **Two existing cases changed, deliberately:** the scope suite's
  `session open TASK records the task session …` became
  `… launches at task scope, the sole
  worktree as its directory (0032)` (same record assertions,
  now through the stub harness), and the launch suite's no-handle resume fixture opens its
  handle-less session through the store API, since the CLI's handle-less path now launches.
- `mise run fmt` then `mise run check` → exit 0 (Biome + dprint + `tsc --noEmit` + `bun test` +
  lychee + actionlint). Both run as `env -u WARD_AGENT mise run check` on this machine: the build
  ran inside a Ward-launched session, whose own `WARD_AGENT` leaks into the spawned-CLI suites and
  fails eight **pre-existing** cases that assert human-shaped output (verified against the untouched
  base: `bun test` → `8 fail`, `env -u WARD_AGENT bun test` → `543 pass`). The scaffolding hardening
  is deferred, above, with its why-safe.

**Shared surfaces this entry touches** — with 0029: `src/agent/run.ts` (the spine factored out under
the existing exports), `src/cli/index.ts` (the one `session open` handler),
`test/agent/launch.test.ts` (the same stub, log, and scaffolding). With 0020:
`src/workspace/lineage.ts` + `test/workspace/lineage.test.ts` (one history entry appended, the
current pin moved — the exact bookkeeping the guard test demands). The harness adapter, the JSON
shapes, the schema registry, completion, and telemetry are untouched.

**Next.** Project-scope launches (the third opener over the same spine, and the entry that owes
`status` its answer for sessions without a task row); the `WARD_AGENT`-hermetic test scaffolding;
rooms, when they have records to stand on.

## Spec-feedback

- **SF-001** — [`scopes-and-personas`](../../intent/01-concepts/01-scopes-and-personas.md), _Scope
  and working directory: the two axes of a session_. _Friction:_ the slice says the two axes "are
  chosen independently when a session starts", and its why is real — responsibility and standing are
  different choices. But this entry (and 0029 before it, silently) has Ward **derive** the directory
  from the scope when the opener does not choose: workspace scope stands in the root, task scope in
  the task's sole worktree, and an ambiguous derivation is refused rather than guessed. Nothing in
  the slice says who chooses, or what an unchosen directory means at each scope — read literally,
  "chosen independently" could demand that every open name both axes, which would cost the launched
  open its one-command shape for no gain in the ordinary case. _Assumption to keep moving:_
  independence means the axes **can** be set independently (`--dir` overrides at either scope), not
  that Ward may not derive a natural default from the scope's own record; a derivation with more
  than one honest answer is a refusal, never a pick. _Proposed revision:_ one sentence in the
  two-axes section: "Each scope has a natural standing place — the workspace its root, a task its
  worktree, a room its anchor — which Ward may derive when the opener does not choose; where the
  derivation is ambiguous, Ward asks rather than guesses. Independence means the opener can always
  override it." _Why it belongs in intent:_ it holds however the launch is built, and it is the
  difference between a one-command open and a form with two required fields.
- **SF-002** — [`scopes-and-personas`](../../intent/01-concepts/01-scopes-and-personas.md), _The
  roles_ (resident vs. room) with [`domain-model`](../../intent/01-concepts/00-domain-model.md)'s
  scope vocabulary. _Friction:_ deciding where a task-scope session stands surfaced a boundary the
  role model draws and the session machinery cannot yet honor. In the role model, the **resident**
  (task scope) directs and evaluates but "does not do the work itself"; the hands-on work happens in
  a **room**, standing on the worktree. This entry launches a task-scope session standing **in** the
  worktree to do the hands-on work — the honest shape today, because rooms have no records and
  personas no cast, but it means the one session is both resident and room, and when room-scope
  sessions arrive, every session this entry launched will read as a resident doing student work. The
  intent never says what the role model means for a workspace operating **below** its persona
  machinery. _Assumption to keep moving:_ scope names responsibility, not conduct — a task-scope
  session is responsible for the task's outcome, and until a narrower scope exists to hold the
  hands-on episode, recording it at task scope in the worktree is accurate, not a violation; the
  role model describes the cast Ward is growing toward, not a constraint on a cast-less workspace.
  _Proposed revision:_ a clause where the roles are introduced: "Until a workspace has rooms and a
  cast, sessions at a scope may do the work the role model would delegate below it; the role model
  constrains personas, and a session with no persona is bound only by its scope's responsibility."
  Alternatively, fold it into the existing conditioned-minimum idiom (0029's SF-004): role
  expectations, like persona fields, are conditioned on the cast existing.
