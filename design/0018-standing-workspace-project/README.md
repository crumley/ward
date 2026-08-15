# 0018 — The standing workspace project

> `workspace create` establishes the **standing workspace project** — one project per workspace for
> work on the workspace itself (upgrades, migrations, reflection adoption), identified by a
> `standing: true` marker in its typed front matter that only creation writes, at slug `workspace`
> and the next floor number (floor 1 in a fresh workspace, next-available on converge). A pre-0018
> workspace lacks it — the second concrete migration target after 0017's CLAUDE.md, bridged the same
> way: an `info` doctor finding carrying the converge remedy. Status keeps the **honest derived
> reading**: "never closes" lives in the record (no terminal act, the floor never retired), not in
> the rollup.
>
> **Status:** accepted · **Started:** 2026-08-15

The intent settled _that_ every workspace carries a home for its own stewardship — established at
creation, never closing, concentrating "what has been done _to_ this workspace?" in one place. This
entry decides the _how_: how the record durably says what it is, where its identity comes from, how
existing workspaces gain it, and what its status honestly reads when its work is done for now. The
deliberate constraint throughout: the standing project **passes the project test; it does not bend
it** — so every mechanism here is the ordinary project mechanism, plus exactly one marker.

## Serves intent

- [`workspace-lifecycle`](../../intent/01-concepts/06-workspace-lifecycle.md) — _The standing
  workspace project_: one per workspace, established at creation, home of stewardship work, the only
  project that never closes; and _What creation establishes_: re-running create **converges** — the
  new step is check-then-do like every step, which is what makes it the migration path for pre-0018
  workspaces.
- [`domain-model`](../../intent/01-concepts/00-domain-model.md) — _Identity_: allocated **like any
  project's** (the next monotonic floor number, never reused); _Project_: the standing project as
  stated there; _Status_: recorded at the leaves, derived above — this entry adds **no** derivation
  special case, and argues why below.
- [`human-shell`](../../intent/02-subsystems/07-human-shell.md) — doctor's report-and-recommend
  constraint: the absent standing project is named with its remedy, never repaired by doctor itself.
  Plus [`principles`](../../intent/00-foundation/01-principles.md) §3 (the workspace's own history
  findable in the same place in every workspace), §6 (repeat-safe creation), §16 (one recorded
  truth: the marker lives in the record, nothing derived is stored).

## Scope

- **In:**
  - **A new `workspace create` step, `standing project`**, after `scope directories` and before
    `installed baselines`: if no project record carries the standing marker, allocate the next floor
    and write `projects/<floor>-workspace/project.md` with `standing: true`; if one exists, report
    `satisfied`. Established on fresh creates (floor 1) and on converge re-runs of older workspaces
    (next-available floor) — the deliberate migration target, 0017's pattern. The record rides the
    run's single commit; it gets **no baseline entry** (it is a record the store validates by
    schema, not an installed artifact whose customization a fingerprint must detect).
  - **The marker**: `standing: z.literal(true).optional()` on the project record schema — typed
    front matter, the store's way. Slug `workspace`; address `projects/<floor>-workspace`, the
    ordinary `<floor>-<slug>` form. `findStandingProject()` resolves by the **marker, never the
    slug**.
  - **Doctor names the states.** A `standing project` finding: present → `ok` naming the floor;
    absent → `info` with the remedy `ward workspace create <root>` and the note that a future
    upgrade will carry it; an unreadable project record → `error` (the existing checkDocument
    posture). Report-only; absence never fails the run; no schema change — one more open
    `check`/`severity`/`message` row.
  - **The guard is free, and said so:** `ward project open` never writes the marker — creation is
    its only writer — so no verb can mint a second standing project (Design → Decisions).
  - **The manifest explains the floor.** The installed `AGENTS.md` layout section says what
    `projects/<floor>-workspace` is, so a cold reader listing `projects/` knows.
  - **Tests:** the fresh create (floor 1, marker, committed, step count 11 → 12); converge
    re-establishment at the next-available floor on a workspace shaped pre-0018; `project open`
    minting only ordinary records; doctor's ok/info states, healthy throughout; the derived-status
    consequences (the standing project as an ordinary row in `status`/`project list`, floors
    shifting to 2 for opened projects) across the CLI suites.
- **Deferred:**
  - **Stewardship worktrees, the workspace merge verb, and the stewardship close gate.** _Why safe:_
    that is sibling entry 0019's scope this round; the standing project is the container that work
    will live in, and the container is useful (addressable, listable, honest in status) before the
    first stewardship verb exists.
  - **Upgrade orchestration** (the reconciliation task that would open under this project). _Why
    safe:_ a later entry; its home now exists in every workspace it will run in, which is the point
    of establishing the project first.
  - **A project-close refusal for the standing project.** _Why safe:_ no verb closes projects today
    — nothing writes `state: closed` or `closedAt` on any project record — so "never closes" is true
    by construction. When a project-close verb arrives, the marker is its ready-made refusal test;
    that entry must add the test with the verb.
  - **Surfacing `standing` in `--json` shapes.** _Why safe:_ every JSON builder picks fields
    explicitly, so the marker cannot leak unversioned into a documented shape; no consumer needs it
    yet, adding it later is additive (0005's evolution policy), and `src/cli/schema.ts` /
    `src/cli/json.ts` are concurrently owned by the sibling entry this round. The record itself is
    readable directly — that is what records are for.
- **Acceptance:** from a cold checkout, `mise run check` is green, and `bun test` proves:
  1. a fresh workspace has `projects/1-workspace/project.md` with
     `floor: 1, slug: workspace, standing: true, state: active`, committed in the initial commit,
     and create reports 12 steps;
  2. re-running create is `satisfied` throughout; a workspace shaped pre-0018 (floor 1 already the
     human's) gains the standing project at floor 2 on converge, and the convergence commit holds
     exactly that record;
  3. `project open` allocates around it (floor 2 in a fresh workspace) and never writes the marker;
  4. doctor reads `ok` naming the floor on a fresh workspace and `info` carrying
     `ward workspace create <root>` on the pre-0018 shape — healthy and exit 0 in both;
  5. the standing project appears as an ordinary row in `status` and `project list` (human and
     `--json`), deriving `active` while empty.

## Design

- **Decisions:** no new ADRs — entry-local only:
  - **The marker is typed front matter: `standing: true`, optional literal.** The record must say
    durably _what it is_, and typed front matter is the store's way of saying anything durably. An
    optional `z.literal(true)` keeps every pre-0018 record valid unchanged (additive schema
    evolution), admits no ambiguous `standing: false` state — a project is marked or it is not — and
    gives resolution one test: `record.standing === true`.
  - **Resolution is by the marker, never the slug.** A human may `ward project open` a project named
    anything — `workspace` included — and gets an ordinary project; nothing resolves to the wrong
    record because nothing reads the name. Refusing the slug would be enforcement against a hazard
    that does not exist once identity lives in the marker.
  - **The slug is `workspace`; the address is `projects/<floor>-workspace`.** The project is the
    workspace's own, and the plainest true name wins — the same reasoning that named `anchor` and
    `workdir`. The address keeps the ordinary `<floor>-<slug>` form: the standing project passes the
    project test, so it must not need a special address form (identity allocated like any project's
    — the intent's own constraint).
  - **`project open` cannot mint a second standing project — free, by construction.** Creation is
    the only writer of the marker; `openProject` builds its record without the field, and nothing
    else writes project records. Said here so the guarantee is a stated invariant the next entry can
    rely on, not an accident.
  - **Allocation is shared, not duplicated: `nextFloor()`.** The create step and `openProject` now
    call one exported allocator (monotonic max+1 over the floor scan), so the two writers cannot
    drift on what "next floor" means. The create step writes inline rather than calling
    `openProject`: the store lock is already held by `createWorkspace` and is deliberately not
    reentrant, and the record must ride the create run's single commit, not a second one.
  - **The step runs after `scope directories`, before `installed baselines`.** The record steps run
    in containment order — the workspace's own records first, then the project that lives under
    `projects/`; baselines stay last-before-git so the fingerprint set is complete however it grows.
  - **No baseline entry for the record.** Baselines exist to tell a _customized installed artifact_
    from an untouched one; a project record is the store's data, guarded by schema validation and
    read by doctor, and fingerprinting it would report every legitimate future write to the record
    as drift. Same shape as 0017's no-baseline call for the symlink: a dedicated check beats a
    misleading fingerprint.
  - **Status presents the honest derived reading — no special case.** The argued decision:
    derivation answers _"where can progress still be made?"_, never _"what has been terminated?"_.
    So the standing project derives like any container: `active` while empty — intent's own
    blessing: the true reading of a workspace whose arc has just begun, with guaranteed first
    clients — and `closed` when every stewardship task is closed, exactly the reading the workspace
    itself gives between arcs. **"Never closes" lives where it has teeth:** in the record (its
    `state` is never written `closed` — no verb closes projects today, and the marker is the future
    verb's refusal test) and in identity (its floor is never retired). A derived `closed` has no
    behavioral bite — the only guard that reads project state (`taskContainer`) reads the _recorded_
    state, so stewardship tasks can always open under it. Pinning the rollup to `active`, or adding
    a fourth presentation state, would either make the rollup lie or add a state with no routing
    benefit. Smallest honest answer: zero changes to `status.ts`.
  - **Stated consequence of that decision:** the workspace-level rollup reads `active` as long as
    the standing project has never held a task — a fresh workspace, and one whose stewardship has
    not yet begun, no longer read `closed` when all other work closes. That is the empty-container
    rule applied honestly, but the asymmetry (whether a workspace reads `closed` between arcs now
    depends on whether stewardship ever happened) is worth intent's attention — SF-001.
  - **The doctor finding mirrors 0017's bridge exactly.** Absent is the pre-0018 workspace: `info`,
    never `warn` — nothing is broken, ordinary work is unaffected — carrying the one-line converge
    remedy doctor itself never runs. Present is `ok` naming the floor, so the finding doubles as the
    answer to "where is this workspace's own history?" (§3). An unreadable project record is `error`
    through the same conversion `checkDocument` applies everywhere else.
  - **One layout note in the installed manifest.** The `projects/` bullet in `AGENTS.md` now names
    the standing project, its slug, and its marker — a cold reader listing `projects/` sees a floor
    they never opened, and the manifest is where "what is this?" is answered.
- **Layout:** `src/store/types.ts` (the `standing` field on `projectSchema`);
  `src/workspace/projects.ts` (`nextFloor`, `STANDING_PROJECT_SLUG`, `findStandingProject`;
  `openProject` now allocates through `nextFloor`); `src/workspace/create.ts`
  (`establishStandingProject` between scope dirs and baselines); `src/workspace/doctor.ts`
  (`standingProjectFinding` after the claude-guidance finding); `src/workspace/templates.ts` (the
  manifest bullet); tests in `test/workspace/create.test.ts`, `test/workspace/doctor.test.ts`,
  `test/workspace/spine.test.ts`, `test/cli/{workspace,json,schema,mutation-json}.test.ts` (step
  counts 11 → 12; floors shift to 2 for opened projects).
- **Mechanisms:** `establishStandingProject` runs under the create run's store lock:
  `findStandingProject` scans every project record for the marker; found → `satisfied` naming the
  directory; absent → `nextFloor()` allocates, `writeDocument` writes the marked record with a body
  that says what the project is, and the path joins `establishedPaths` so the run's one commit
  carries it. Doctor maps found/absent/unreadable onto one finding row. A record whose marker the
  human hand-edits away is, from that moment, simply absent — doctor names it, converge
  re-establishes at the next floor; hand-editing records is already outside what the store defends.

## Build log

### 2026-08-15 — The step, the marker, the finding, the honest rollup

**Goal.** Everything in Scope in one iteration. **What was done.** Added the `standing` marker to
`projectSchema`; `nextFloor` / `STANDING_PROJECT_SLUG` / `findStandingProject` in
`src/workspace/projects.ts` (with `openProject` re-routed through the shared allocator); the
`standing project` create step in `src/workspace/create.ts`; the `standing project` doctor finding
in `src/workspace/doctor.ts`; the manifest bullet in `templates.ts`; tests as laid out above,
including the deliberate downstream shifts (floors 2+ for opened projects, the workspace rollup
reading `active` over an empty standing project, `project list` on a fresh workspace never being an
empty set).

**What works now — with the commands that prove it** (Bun 1.3.14, macOS):

- `bun test` → `250 pass, 0 fail, 884 expect() calls` across 26 files (from 245/866 at entry start):
  the fresh create writes `projects/1-workspace/project.md` with
  `floor: 1, slug: workspace, standing: true, state: active` inside the initial commit and reports
  12 established steps; a converge on a workspace shaped pre-0018 (floor 1 the human's own)
  establishes the standing project at floor 2 and the convergence commit holds exactly
  `projects/2-workspace/project.md`; `openProject` allocates floor 2 in a fresh workspace and its
  record carries no marker, whatever its slug; doctor reads ok/info with `report.healthy` true in
  both states; the standing project rides `status --json`, `project list --json`, and the human
  renderings as an ordinary floor-1 row deriving `active`.
- `mise run check` → exit 0, end to end (Biome + dprint + `tsc --noEmit` + `bun test` + lychee).
- Dogfood in a scratch workspace (`bun src/cli/index.ts workspace create …` outside any live
  workspace): create renders `established standing project (projects/1-workspace/)` and
  `Workspace ready — 12 established, 0 already satisfied`; the record on disk carries the marker in
  its front matter; `doctor` reads
  `✓ standing project — floor 1 (projects/1-workspace/) — the workspace's own project`; after
  `rm -rf projects/1-workspace` + commit it reads the `i` finding carrying
  `ward workspace create <root>`; a converge re-run reports
  `established standing project (projects/1-workspace/)` and `2 established, 10 already satisfied`;
  `status` renders `floor 1 — workspace [active]` and `project list` renders
  `floor 1 — workspace [active] (0 tasks)`.

**Decisions** (found while building): all recorded under Design → Decisions; the one worth naming —
the workspace-rollup consequence was found by the spine test, not foreseen: the bootstrap arc's
final assertion (`workspace: closed` after the only project delivers) became `active`, because the
standing project is empty until its first stewardship task. The honest reading was updated in the
test with the why, and the asymmetry filed as SF-001 rather than papered over with a derivation
special case.

**Next.** Sibling entry 0019 hangs the stewardship surface (worktrees, merge, close gate) off this
project; the upgrade-orchestration entry opens its reconciliation task under it; a future
project-close verb must refuse the marked record (its test is ready to write the day the verb
exists).

## Spec-feedback

- **SF-001** — [`workspace-lifecycle`](../../intent/01-concepts/06-workspace-lifecycle.md), "The
  standing workspace project" / [`domain-model`](../../intent/01-concepts/00-domain-model.md), "The
  derivation rule". **Friction:** the two slices compose into an asymmetry neither names. The
  derivation rule says an empty container is `active`, and the standing-project section blesses that
  as "the true reading of a workspace whose own arc has just begun" — but with a standing project in
  _every_ workspace, the workspace-level rollup now reads `closed` between arcs **only after
  stewardship has happened at least once** (all-closed children), and `active` forever in a
  workspace whose standing project never held a task, even when every other project delivered and
  closed. Whether a workspace reads `closed` between arcs thus depends on its stewardship history,
  not on whether anything is in flight. **Assumption made:** both readings are honest under the
  stated rule, so the derivation was left untouched and the changed expectation recorded in the
  spine test with its why — no special case, per "smallest honest answer". **Proposed revision:**
  one sentence in the standing-project section acknowledging the rollup consequence — either
  blessing it ("a workspace is never done being a workspace; `active` over an empty standing project
  is that, stated") or directing a future entry to treat the never-begun standing project distinctly
  in derivation. As it stands, a reader of the derivation rule alone would expect a fully-delivered
  workspace to read `closed` and be surprised.
