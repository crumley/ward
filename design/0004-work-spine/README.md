# 0004 — The work spine

> The third entry of the bootstrap arc
> ([`0002-store-and-workspace/`](../0002-store-and-workspace/README.md),
> [`0003-repository-set/`](../0003-repository-set/README.md)): projects, tasks, worktrees, session
> records, derived status, and the delivered/abandoned close — the minimum spine of
> [`intent/04-walkthrough-delivering-work.md`](../../intent/04-walkthrough-delivering-work.md),
> which closes the bootstrap loop: the next Ward feature can be delivered as a Ward task.
>
> **Status:** accepted · **Started:** 2026-08-02

Still under the arc's governing constraint (0002): Ward records and plumbs git; the human
orchestrates. Sessions are **recorded, not managed** — `session open` writes the record (purpose,
optional harness handle) and the human runs their harness themselves in the worktree. Nothing here
starts, watches, or resumes an agent.

## Serves intent

- [`work-lifecycle`](../../intent/01-concepts/03-work-lifecycle.md) — the task lifecycle: stored
  states `active | paused | closed` with the close recording an **outcome** `delivered | abandoned`
  (an attribute, not a fourth state); completion gated on the **PR set resolved**; `in-review`
  **derived from the open-PR set, never stored**; teardown at close with the §18 gate on unmerged
  deliverable work; the never-merge-to-main rule made structural (worktree-and-PR is the only path
  Ward offers).
- [`domain-model`](../../intent/01-concepts/00-domain-model.md) — the containment hierarchy with
  **levels elided, not faked** (bare tasks under the workspace; no rooms — the session acts directly
  as the anchor's occupant); **status recorded at the leaves, derived above** with the precedence
  rule `active ▸ paused ▸ closed` and empty-container-is-active; identity — **floor numbers
  monotonic and never reused**, task codes **unique among open tasks** (a bare code addresses every
  operation), session ids unique among open sessions; worktrees keyed repo+branch with disposition
  `deliverable` (the only kind this entry builds).
- [`sessions-and-lifecycle`](../../intent/01-concepts/02-sessions-and-lifecycle.md) — the session
  log minimum this entry records: identity, purpose, working directory, the **harness handle** as an
  optional free-form attribute, opened/closed times, stored state `open | closed`; closed stays
  closed.
- [`workspace-lifecycle`](../../intent/01-concepts/06-workspace-lifecycle.md) /
  [`03-walkthrough-getting-started`](../../intent/03-walkthrough-getting-started.md) — the workspace
  this spine runs in, unchanged.
- [`human-shell`](../../intent/02-subsystems/07-human-shell.md) — the noun/verb tree grows
  `project`, `task`, `worktree`, `session`, and `status`.
- [`metadata-store`](../../intent/02-subsystems/00-metadata-store.md) — containment expressed in the
  layout (tasks nest under their project; sessions and worktree records nest under their task); one
  owner per mutable record; the ID-allocation writes are the store's first serialized writes, sized
  to their real load (one human, sequential commands — existence checks, no lock file yet).

## Scope

- **In:**
  - **Project records** — `projects/<floor>-<slug>/project.md`: floor number (monotonic over all
    projects ever, never reused), slug, state `active | paused | closed`. Verbs:
    `ward project
    open SLUG`, `ward project list`.
  - **Task records** — `<container>/tasks/<code>-<slug>/task.md`, where container is a project
    directory or the workspace root (bare tasks — levels elided, not faked): code (unique among
    **open** tasks, smallest free `t<n>`), slug, state, optional project floor, recorded intent
    (`--purpose`), the **PR-link set** (URLs only — review state is read live via `gh`, never
    stored), and at close the **outcome**. Verbs:
    `ward task open SLUG [--project N] [--purpose
    TEXT]`, `ward task list`,
    `ward task pause|resume CODE`, `ward task pr CODE URL`,
    `ward task
    close CODE [--outcome delivered|abandoned]`.
  - **Worktrees** — `ward worktree create TASK --repo NAME [--branch NAME]`: refreshes the canonical
    checkout, then `git worktree add` off `origin/<mainLine>` into `worktrees/<task>-<branch>/`
    (disposition `deliverable`, the only kind built); the record at
    `<task>/worktrees/<repo>--<branch>.md`. `ward worktree list`. Teardown happens at task close.
  - **Session records** — `ward session open TASK --purpose TEXT [--handle TEXT] [--dir PATH]`
    allocates an id unique among open sessions (`<task-slug>-<n>`), records purpose, working
    directory, optional harness handle; `ward session close ID`. Recording only — the human runs the
    agent.
  - **`ward status`** — the derived rollup: each project's status derived from its tasks
    (`active ▸ paused ▸ closed`, empty = `active`), bare tasks listed at the root, the `in-review`
    overlay on tasks with linked PRs, open sessions shown per task. Nothing aggregated is stored.
  - **Close semantics** — `task close` requires the PR set **resolved**: with `gh` available, every
    linked PR must be merged for `delivered` (closed-unmerged PRs and unmerged work require an
    explicit `--outcome abandoned`, which **is** the §18 authority in this human-driven arc);
    without `gh`, the human's stated outcome is trusted and noted. Close tears down the task's
    worktrees (`git worktree remove`; `--force` only on the abandoned path), closes its open
    sessions, and refreshes affected checkouts.
- **Deferred:**
  - **Rooms, briefs, dispatch, wakes, personas, recovery, reflection** — the growth path the
    walkthrough itself defers; all elidable by intent. _Why safe:_ the records built here (tasks,
    sessions with handles) are exactly what those features will read.
  - **Sandbox worktrees and workdirs** — the second anchor kinds. _Why safe:_ disposition is
    recorded on the worktree record from day one, so adding `sandbox` later is a new value, not a
    migration.
  - **Rebase toil on worktrees, PR/CI watching on a cadence** — on-demand `repo refresh` exists;
    watching arrives when something can watch. _Why safe:_ the PR set is stored as URLs and read
    live, so no stored state goes stale meanwhile.
  - **Remote-linked task identity** (referencing a task by its work-item id) — the PR-link set
    covers the bootstrap loop's need. _Why safe:_ links are attributes; adding a resolution route
    later touches lookup, not the records.
  - **A lock file for ID allocation.** One human, sequential commands; allocation reads the
    directory and writes a new file, and a collision is a legible error. _Why safe:_ the store
    contract sizes the primitive to real load, and the 0002 layout reserved `.ward/` for locks when
    concurrency arrives.
- **Acceptance:** the bootstrap loop, end to end in tests: create workspace → register a repo (local
  bare remote) → `project open` (floor 1) → `task open` under it → `worktree create` → commit work
  in the worktree → `task pr` → `task close --outcome delivered` (PR check skipped without `gh`
  against a local remote — the trusted path) → worktree torn down, sessions closed, `status` shows
  the project closed. Plus: floor monotonicity across a closed project, task-code reuse only after
  close, the derived-status precedence table, in-review overlay, pause/resume, the dirty-worktree
  close refusal, and `--outcome abandoned` forcing teardown.

## Design

- **Decisions:** no new ADRs — the existing stack carries this entry. Entry-local:
  - **Containment in the layout, addressing by scan.** Tasks nest under their project directory
    (bare tasks under `tasks/` at the root); a bare task code addresses every operation by scanning
    the two levels. Identity need not mirror containment (intent), and at in-flight cardinality a
    scan is cheaper than an index that can drift (§16).
  - **The PR set stores URLs only.** Review state is the forge's truth, read via `gh` when present;
    storing it would be the stale-cache §17 warns about. `in-review` is computed from "has linked
    PRs and not closed."
  - **Worktrees are worktrees of the canonical checkout** (`git -C repos/<name> worktree add`), so
    branches live in the one repository the record names, and teardown is `git worktree
    remove`
    — no second clone to reconcile.
  - **Session ids** are `<task-slug>-<n>`, smallest free `n` among open sessions — workspace-unique
    bare addresses, sized to in-flight cardinality, reused only after close (intent's session
    identity rule, minimally realized).
- **Layout:** `src/workspace/projects.ts`, `tasks.ts`, `worktrees.ts`, `sessions.ts`, `status.ts`
  beside the existing modules; `src/store/types.ts` grows the four schemas; `src/cli/index.ts` grows
  the four nouns plus `status`. Tests: `test/workspace/spine.test.ts` (the loop and the lifecycle
  rules) and `test/workspace/status.test.ts` (the derivation table, table-driven).
- **Mechanisms:**
  - _Allocation:_ floors = max over all project dirs + 1; task codes and session discriminators =
    smallest positive integer not taken by an **open** record (closed ones don't reserve).
  - _Derivation:_ one pure function from leaf states to container status, shared by `status` and
    `project list`, tested as a table.
  - _Close:_ an ordered sequence — resolve PR set → close open sessions → tear down worktrees →
    write outcome + state → commit the record changes → refresh affected checkouts — each step
    reported, the §18 gate enforced before any destruction.

## Build log

### 2026-08-02 — The spine built end to end

**Goal.** Everything in Scope in one iteration. **What was done.** Grew `src/store/types.ts` with
the four schemas (project, task, worktree, session — each a path-parameterized `DocumentType`);
built `src/workspace/scan.ts` (containment scanning, bare-code resolution, smallest-free allocation,
the record-commit helper), `projects.ts` (monotonic floors), `tasks.ts` (lifecycle, PR-link set, the
gated close sequence), `worktrees.ts` (worktrees _of_ the canonical checkout, off the refreshed
`origin/<mainLine>`), `sessions.ts` (record-only sessions with workspace-unique bare ids), and
`status.ts` (the pure derivation rule + the report); grew the CLI with `project`, `task`,
`worktree`, `session`, and `status`. Tests: `test/workspace/status.test.ts` (the derivation table,
table-driven per CONTRIBUTING) and `test/workspace/spine.test.ts` (the bootstrap loop and seven
lifecycle-rule cases, against local bare remotes).

**What works now — with the commands that prove it** (Bun 1.3.14, git 2.54.0, macOS):

- `bun test` → `47 pass, 0 fail, 120 expect() calls` across 7 files — including the acceptance loop
  verbatim: workspace → repo → `project open` (floor 1) → `task open t1` → `worktree create` →
  committed work → merge simulated at the remote → `task close --outcome delivered` → worktree torn
  down, session closed, status derives `closed` at every level.
- Dogfood smoke in a scratch workspace: the same loop by hand through the CLI, including the §18
  refusal (`t1 holds commits that never reached a PR`) before the merge landed, and the clean
  `delivered` close after it.
- `mise run check` → green end to end.

**Decisions** (entry-local, found while building):

- **A refused close mutates nothing.** The first smoke run caught the close sequence closing the
  task's sessions _before_ the worktree gate threw — so the refused close had half-applied, and a
  retry closed less than the first attempt saw. All gates (PR set, dirty tree, unmerged local-only
  commits) are now validated read-only before any mutation; a test pins the guarantee (§6 — the only
  safe operation is one that repeats cleanly).
- **The no-PR unmerged-work gate compares against the canonical checkout's main line**
  (`rev-list main..branch`), applied only when the task has no linked PRs — with PRs, resolution is
  the forge's answer (squash merges make ancestor-checks lie about merged work).
- **Simulating the forge in tests** = fast-forwarding the bare remote's main from the pushed branch
  via a staging clone, then refreshing the canonical checkout — no network, no `gh`, exercising
  exactly the state a merged PR leaves behind.

**Next.** The bootstrap loop is closed: the next Ward feature can be delivered as a Ward task in a
Ward workspace. Natural follow-ons, in dogfood-priority order: `--json` output (the walkthrough's
own example task), live PR state in `status` via `gh`, and the workspace skill installed at
creation.

## Spec-feedback

None this entry. One observation recorded for later rather than raised as friction: intent's
session-id rule (slug + discriminator, unique among open sessions) is realized here as
`<task-slug>-<n>`, which satisfies the contract but couples the slug to the task; when sessions gain
personas, the slug will likely become the persona name, and the records carry enough to migrate.
