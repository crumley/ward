# 0051 — Floor-scope sessions: a session responsible for one floor

> `ward session open --floor N` records a project-scope session beside floor N's project record and
> launches the agent at the workspace root, and every session verb reads the new scope; the scope
> enum grows by one value, so no existing record changes.
>
> **Status:** built — awaiting review · **Started:** 2026-10-16

The intent names four session scopes — workspace, project, task, room
([`00-domain-model.md`](../../intent/01-concepts/00-domain-model.md), _Working directory: the second
axis_) — and the role that owns a project's outcome sits at the second of them
([`01-scopes-and-personas.md`](../../intent/01-concepts/01-scopes-and-personas.md), _Attending
physician_ and _Charge nurse_). The build has two: [0029](../0029-launched-sessions/README.md)
launched workspace-scope sessions and [0004](../0004-work-spine/README.md) records task-scope ones.
A long-lived session that owns one floor — that routes the floor's work and decides what to do with
each task on it — has no honest record: opened at workspace scope it claims to be responsible for
every floor, and opened as a task session it needs a task invented to hold it. The record says
something false either way, and `ward status` cannot put the session next to the floor it actually
serves.

Both earlier entries left this exact gap ready. 0029 placed the workspace's sessions at the
workspace's own level so that project-scope sessions "will live under `projects/<floor>/sessions/`,
which needs no migration of anything written today", and [0041](../0041-ground-floor/README.md)
deferred floor-scope sessions because the scope enum "gains a value without a migration". This entry
adds that value and the verb that opens it.

## Serves intent

- [`00-domain-model.md`](../../intent/01-concepts/00-domain-model.md) — _Working directory: the
  second axis_: project becomes a recordable session scope, and its working directory (the workspace
  root) is chosen apart from its scope.
- [`02-sessions-and-lifecycle.md`](../../intent/01-concepts/02-sessions-and-lifecycle.md) —
  _Recording per scope_: the project scope keeps its own session log beside its project record, and
  a floor session opened to receive work may record the kind of session it is as its purpose.
- [`00-domain-model.md`](../../intent/01-concepts/00-domain-model.md) — _Identity_: a floor
  session's id is unique over the workspace's history across machines, so the bare id still
  addresses it in every verb.
- [`06-workspace-lifecycle.md`](../../intent/01-concepts/06-workspace-lifecycle.md) — _The standing
  workspace project_: the ground floor is a project, so it gets a floor session like any other,
  distinct from the workspace-scope session that holds status across every floor.
- [`07-human-shell.md`](../../intent/02-subsystems/07-human-shell.md) — _Organized around nouns and
  verbs_: one more flag on `session open`, not a new noun; `status` puts the session on the floor's
  row.

## Scope

- **In:**
  - **The scope value.** `sessionScopeSchema` gains `project`. A project-scope record carries
    `floor` (the floor number), present exactly when the scope is `project`, checked by a refine
    beside the existing `task` one. Records written before this entry carry no `floor` and parse
    unchanged.
  - **`ward session open --floor N [--purpose TEXT] [--dir PATH] [--handle H]`.** It refuses an
    unknown floor or a closed project, and refuses TASK together with `--floor`. With no run to
    record, it launches the agent exactly as the workspace-scope open does: same adapter, same
    assigned handle, same `WARD_AGENT`, the same exit question. The record is
    `projects/<floor>-<slug>/sessions/<id>.md`, the id is `f<N>-<n>@<machine>`, the working
    directory defaults to `.`, and the purpose, when omitted, is
    `Coordinating floor N · opened <instant>`.
  - **The record-only path at workspace and floor scope.** `--handle H` records without launching,
    as before. Without `--handle`, an open run from inside a harness run that names itself in the
    environment (Claude Code's `CLAUDE_CODE_SESSION_ID`,
    [0045](../0045-agent-record-reads/README.md)) records that run instead of launching a second
    agent inside it. Task sessions already read the ambient handle; this extends it to the two
    scopes that launch.
  - **Every session verb reads the scope.** `session show` prints `scope floor N`. `show`, `open`,
    `resume`, `close`, and `locate --json` carry `scope: project` and `floor`. `resume`'s
    fresh-start affordance names `--floor N` for a floor session. Completion describes the session
    as `floor N`. `readAllSessions` (behind resolution, completion, restore's count, and id
    allocation) scans each project directory.
  - **`ward status`.** Each floor row carries its own open sessions: `projects[].sessions` in
    `--json` (the `statusSessionShape` row), and a `session <id> — <purpose> (<history>)` line under
    the floor header for a human. The top-level `sessions` block stays workspace-scope only. A floor
    with an open session is never hidden by the settled-work window.
  - **`ward schema`.** The session shapes take the new scope value and `floor`, and the status shape
    takes the per-floor `sessions` array.
  - **The installed manifest.** It gets the `--floor` bullet, the layout note, the status line, and
    the record-only bullet at every scope. The outgoing 0049 default joins the lineage, so an
    untouched manifest upgrades.
- **Deferred:**
  - **Personas, model tiers, dispatch, and wakes.** A floor session is recorded with the same
    configuration as any launched session. _Safe to defer because_ the record has no field any of
    them would need rewritten: persona is conditioned on a cast existing
    ([`02-sessions-and-lifecycle.md`](../../intent/01-concepts/02-sessions-and-lifecycle.md),
    _Recording per scope_) and joins as an optional field, and per-scope model selection is
    configuration resolved at launch, which this entry routes through the one launch path that
    already resolves it.
  - **Multi-floor sessions.** One session responsible for two floors is not built (see Design for
    how that case is served). _Safe to defer because_ the intent gives a session one scope, and a
    session's working directory, not its scope, decides what it can read. A floor session at the
    root reads every floor already.
  - **Room-scope sessions.** _Safe to defer because_ rooms are not built at all yet, and the enum
    takes `room` the same way it took `project`.
  - **Closing a floor's sessions when its project closes.** _Safe to defer because_ no verb closes a
    project today. The entry that adds one inherits the task close's pattern, closing the scope's
    open sessions and naming them, and `readSessions(root, project.dir)` is the reader it needs.
  - **Refusing a second open record for one run.** A workspace session's agent that records itself
    at floor scope leaves two open records with one handle. _Safe to defer because_ task sessions
    already allow it, since a coordinating run commonly records itself at several scopes, and
    `ward status` shows both, each with `ward session close ID` to hand.
- **Acceptance:**
  1. `bun test test/agent/floor-sessions.test.ts` covers the following. A launch at `--floor 1`
     writes `projects/1-alpha/sessions/f1-1@test.md` before the stub runs, in the root, with
     `WARD_AGENT` set and the default purpose. `--floor 0` and workspace scope stay distinct. An
     unknown floor and TASK with `--floor` are refused with nothing written or launched. `--handle`
     and the ambient run record without launching, at floor and workspace scope. `status --json`
     puts the session on its floor's row and not in the workspace block. `show`, `locate`, `resume`
     (gone, then found), and `close` all read `scope: project, floor: 1`. Ids climb per floor and
     never repeat. The schema refuses `project` without `floor` and `floor` on any other scope,
     while a pre-0029 record still parses. `ward schema session open` names both.
  2. `bun test test/agent/launch.test.ts test/cli/session-show.test.ts` stays green. Workspace and
     task sessions are unchanged, and the pre-0029 record still parses, closes, and locates.
  3. `bun test test/workspace/lineage.test.ts test/cli/upgrade.test.ts` passes with the 0049
     manifest in history.
  4. `env -u WARD_AGENT mise run check` exits 0.

## Design

- **Decisions:** no new ADRs — the store stack ([ADR 0005](../decisions/0005-store-stack.md))
  governs the record this entry extends. Entry-local:
  - **The record lives beside the project record.** _Alternative:_ the root `sessions/` directory,
    with the floor as a field. _Attractive_ because every non-task session would sit in one place
    and `status` would read one directory. _Lost_ because a scope's records live at that scope's
    level everywhere else (a task's beside its task, the workspace's at the root — 0029), and
    reading a floor's directory should reveal the threads responsible for it
    ([`02-sessions-and-lifecycle.md`](../../intent/01-concepts/02-sessions-and-lifecycle.md),
    "reading a scope's record also reveals the threads beneath it"). _Cost:_ `readAllSessions` scans
    one more directory per floor, a few `existsSync` calls on a workspace with a dozen floors.
  - **The id is `f<N>-<n>@<machine>`.** _Alternatives:_ the project slug (`night-shift-2@mbp`), as
    task sessions use the task slug, or `floor-7-2@mbp`. _The slug is attractive_ because it reads
    as the work. _It lost_ because the ground floor's slug is `workspace`, so `workspace-3@mbp`
    would name either a workspace-scope session or a ground-floor one, and the scope is exactly what
    the id should not leave ambiguous. A project slug may also repeat a task's slug. _`floor-7-2`
    lost_ on reading: two numbers joined by hyphens. `f7` is the floor half of the task address
    `f7t14` that the workspace already reads as "floor 7". _Cost:_ `f7-2` does not say which project
    floor 7 is; `session show` and `status` do. Allocation is unchanged: the number is the highest
    ever recorded for the slug on this machine plus one, across every scope
    ([0038](../0038-machine-bound-sessions/README.md)), so an id is never reused.
  - **One floor per session.** _Alternative:_ a `floors` list, for a session that manages two floors
    at once. _Attractive_ because the practice exists: a single coordinating run looking after two
    closely related floors. _Lost_ because the intent gives a session one scope, and a two-floor
    scope is a scope the hierarchy does not have. The case is served two ways, and the manifest says
    which fits which. Two floors whose work keeps crossing are one body of work by the project test
    ([`00-domain-model.md`](../../intent/01-concepts/00-domain-model.md)): success is defined across
    both, so they belong on one floor. A session whose job is routing between floors is a
    workspace-scope session, which already has every floor in view. _Cost:_ a human who wants both
    floors' rows to show the session must pick one floor or open two sessions.
  - **`--floor 0` is allowed, and it is not workspace scope.** _Alternative:_ refuse floor 0 and
    point at workspace scope, treating the ground floor's owner and the workspace's as one role.
    _Attractive_ because the ground floor is the workspace's own project, so the two can look like
    one job. _Lost_ because they are different responsibilities in the intent. Workspace scope holds
    the status of every floor and routes between them without owning any one outcome
    ([`01-scopes-and-personas.md`](../../intent/01-concepts/01-scopes-and-personas.md), _House
    supervisor_). The ground floor is a project whose outcome is the workspace's own health:
    upgrades, migrations, reflections
    ([`06-workspace-lifecycle.md`](../../intent/01-concepts/06-workspace-lifecycle.md)). A
    reflection run belongs to the second, not the first. _Cost:_ none in the record. The two are
    told apart by scope and id (`workspace-3` vs `f0-1`).
  - **The working directory is the workspace root.** _Alternative:_ the project directory. It is
    _attractive_ because the agent would load the floor's own notes first. It _lost_ because a
    project directory is a record directory, the place an agent is told never to write. The root is
    where a coordinating agent reads every floor and every repository record from, and it is where a
    workspace-scope session already stands, so one launch path serves both. _Cost:_ none. `--dir`
    still chooses, and the scope still says what the session answers for.
  - **An open inside a harness run records that run (workspace and floor scope).** 0045 deferred
    this at workspace scope because it "would change what the verb does based on the environment it
    happens to run in". _Alternative:_ keep that deferral and have the agent pass `--handle`.
    _Attractive_ because a verb's effect would never depend on the environment. _Lost_ because the
    environment already decides the outcome. A launch from inside an agent's tool call starts an
    interactive harness with no terminal, nested in a run that is itself the session being recorded,
    and that is never what the caller meant. Reading the handle also removes the guessed-handle
    failure 0045 named. Task sessions read the ambient handle already, so this makes the rule the
    same at every scope. This supersedes that one deferral of 0045 and nothing else in it. _Cost:_ a
    human who wants a nested launch from inside an agent must run it outside the agent.
  - **A floor with an open session is never hidden.** The settled-work window hides a floor whose
    tasks all closed over a week ago ([0036](../0036-floor-addressed-tasks/README.md)). An open
    floor session is a thread someone is still responsible for, and hiding it would make the one
    surface built to show it go quiet exactly when nothing else on the floor moves.
- **Layout:** the scope stays a property of the record (`src/store/types.ts`).
  `src/workspace/sessions.ts` gains `openFloorSession` beside `openWorkspaceSession`, and both share
  `writeOpened`. The launch path (`src/agent/run.ts`) takes a `LaunchScope` so one function launches
  at either scope. The adapters never learn which scope a run was opened at. The CLI keeps one verb:
  the scope is chosen by its arguments (TASK, `--floor`, or neither), never by a second noun.
- **Mechanisms:** `status` reads each floor's session directory as it walks the floors and attaches
  the rows to `ProjectStatus.sessions`. The JSON row is the one workspace sessions and `task show`
  already emit (`statusSessionJson`), so a session reads the same at every scope.
