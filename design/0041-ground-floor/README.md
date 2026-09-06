# 0041 — The ground floor: floor 0, and every task on a floor

> The standing workspace project is **floor 0** — `projects/0-workspace/`, the same address in every
> workspace — and every task now opens on a floor, the ground floor when none is named. `tasks/` at
> the root becomes history: its legacy bare tasks are read exactly as they were written and never
> added to.
>
> **Status:** built — awaiting review · **Started:** 2026-09-05

The workspace record carries two address forms and two task containers. A task on a floor is `f3t22`
under `projects/3-…/tasks/`; a bare task is `t7` under `tasks/` at the root
([0036](../0036-floor-addressed-tasks/README.md) settled both spellings). The cost is paid
everywhere: every listing grows a `bare tasks` section, every rule about tasks carries an "…or the
bare pool" clause, and every verb that places work has to decide what "no floor" means. The split
surfaced in the one place it should not have — `ward workspace upgrade`
([0030](../0030-upgrade-self-service/README.md)) opened its own stewardship vehicle as a bare task,
because the derivation falls back to the bare pool when a workspace has no standing project, which
is exactly the state of a workspace created before
[0018](../0018-standing-workspace-project/README.md) and never converged. Ward's own machinery
produced the shape it was meant to move away from.

The home for that work already exists by intent: the standing workspace project, "the home for work
on the workspace itself". What it lacks is a **fixed address**. 0018 allocated its identity like any
project's — floor 1 in a fresh workspace, next-available on converge — so the answer to "where does
work on the workspace go?" is a different number in every workspace. A number that varies cannot be
named by anything Ward authors: not the root manifest, whose bytes must not differ per workspace for
the lineage to recognize them ([0020](../0020-deterministic-upgrade/README.md)), and not a brief
written once and read in three workspaces. That is why the entry that would have the manifest import
the standing floor's notes had to defer it, and why nothing in Ward's defaults can refer to that
floor today.

This entry fixes the number. Floor **0** is reserved for the standing project and ordinary floors
run monotonically from 1, so the ground floor is `projects/0-workspace/` everywhere and can be
named. With one floor guaranteed to exist, "no floor named" stops meaning "no container" and starts
meaning "the ground floor" — which retires the bare pool as a destination without touching a single
record already in it.

## Serves intent

- [`06-workspace-lifecycle.md`](../../intent/01-concepts/06-workspace-lifecycle.md) — _The standing
  workspace project_: one per workspace, established at creation, the home of stewardship work, the
  one project that never closes. This entry gives that project the one thing the slice leaves to
  design — a concrete identity — and chooses a reserved one so the project is nameable from outside
  the workspace that holds it. The slice still says its identity is "allocated like any project's";
  [`spec-feedback.md`](spec-feedback.md) says so rather than assuming.
- [`00-domain-model.md`](../../intent/01-concepts/00-domain-model.md) — _Levels are elided, not
  faked_: the cheapest one-off is still one task and one elided session, and it is now a task on a
  floor that already exists. Nothing empty is created for ceremony — the ground floor is established
  at creation for reasons of its own, and the task lands in a container that is already there.
- [`00-domain-model.md`](../../intent/01-concepts/00-domain-model.md) — _Identity_: floor numbers
  stay **monotonic and never reused**; reserving 0 takes one number out of the sequence and retires
  the floor a relocated standing project came from, so no historical address is ever re-minted.
- [`00-domain-model.md`](../../intent/01-concepts/00-domain-model.md) — _Status: recorded at the
  leaves, derived above_: the ground floor's `active` over an empty container is 0018's blessed
  rollup, unchanged — this entry moves where the container sits, not how its status is read.
- [`01-principles.md`](../../intent/00-foundation/01-principles.md) — **§16** (the record is the
  truth): the relocation rewrites every record that named the old floor rather than leaving one that
  describes somewhere it is not. **§20**: a floor the caller did not name is echoed, converge says
  what it moved and what it could not, doctor names the legacy shapes with the act that settles
  each. **§6**: every state converges — establishing, relocating, and finding the ground floor
  already in place are the same command run twice.
- [`06-workspace-lifecycle.md`](../../intent/01-concepts/06-workspace-lifecycle.md) — _What creation
  establishes_ / re-running creation converges: the relocation is one more check-then-do step, which
  is what makes converge the migration path for every workspace 0018–0040 created.

## Scope

- **In:**
  - **Floor 0 is the standing workspace project's floor**, in every workspace, at
    `projects/0-workspace/`. Ordinary floors keep the monotonic sequence **from 1**: `nextFloor`
    ignores 0, so an empty set of ordinary floors still yields 1, and counts the floor a relocated
    standing project vacated (`previousFloor` on its record), so no number is ever handed out twice.
  - **The record says it once.** The project record's `floor` becomes a non-negative integer, and a
    record on floor 0 without `standing: true` is refused by the schema — the reserved number and
    the marker cannot disagree in anything Ward writes. The task record's `floor` becomes
    non-negative; `floorOf`, `parseTaskAddress` (`f0t7`), and `--project 0` all accept 0.
  - **Creation and converge** (`src/workspace/create.ts`): establish the standing project at floor
    0; **relocate** one already standing on floor `N ≥ 1` — the directory moves whole with its
    closed tasks, the project record and every task record that named `N` are rewritten, and `N`
    stays retired. With an open task under it the step reports `satisfied` and names what is in the
    way.
  - **Every task lives on a floor.** `OpenTaskOptions.floor` is required; `ward task open SLUG` with
    no `--project` and no placing `--repo` claim ([0037](../0037-repo-floor-affinity/README.md))
    opens on the ground floor and says so on the echo; the derived stewardship task
    ([0030](../0030-upgrade-self-service/README.md)) always does. A workspace with **no** standing
    project is refused — `no ground floor — establish it: ward workspace create ROOT` — rather than
    served from the bare pool.
  - **`tasks/` at the root is never written again**, and everything already in it keeps working:
    legacy bare tasks import, address as `t<room>`, resolve through the bare shorthand, list while
    open, and settle out of the glance like any other task. `layout.ts` keeps the directory
    reserved. `status` keeps its `bare tasks` heading only while one is shown.
  - **Surfaces**: the ground floor leads every project listing (ordered in `readProjects`, so
    `status` and `project list` cannot disagree) and is rendered
    `floor 0 — workspace (ground
    floor)`; its derived state is `active` even when empty,
    unchanged from 0018.
  - **Doctor**: the standing-project finding gains its two migration states — `info` naming the
    converge that relocates a floor-`N` standing project, `warn` when open tasks block the move,
    with the order the two acts have to happen in. A separate `info` counts the legacy bare tasks
    under `tasks/` and offers **no remedy**.
  - **The manifest** names the ground floor, calls `tasks/` legacy, and states that every task has a
    floor; the outgoing default's fingerprint is appended to the lineage so existing workspaces
    upgrade ([0020](../0020-deterministic-upgrade/README.md)).
  - **Tests**: `test/workspace/ground-floor.test.ts` (creation, converge on a pre-0018 workspace,
    relocation and its refusal, placement, the refusal with no ground floor, the schema refinement,
    the legacy pool's continuity, the doctor findings) plus `test/cli/ground-floor.test.ts` (the
    echo, `--project 0`, the renderings, the JSON).
- **Deferred:**
  - **Migrating legacy bare tasks onto the ground floor.** _Why safe:_ moving one would renumber its
    room into the ground floor's sequence, and the room is the root of every path that names the
    task — its worktree directories, its branch names, and the briefs, transcripts, and PR
    descriptions that quote them. Nothing rots by leaving them: they are read exactly as they were
    written, they address unambiguously (a bare `t<room>` is their _full_ address, 0036), and the
    pool cannot grow, so the set is finite and shrinking as its tasks close.
  - **Removing `tasks/` from the layout.** _Why safe:_ the directory exists in every workspace made
    so far, and `SCOPE_DIRS` is what converge re-creates — dropping it would make converge delete
    nothing and doctor complain about a directory that is legitimately there. It costs one entry in
    a list; it can go when the last legacy task is closed and the last workspace converged.
  - **The root manifest's import of the ground floor's notes.** _Why safe:_ this entry supplies the
    precondition — an address the manifest can name — and nothing else about the import is settled
    here: what is imported, and how a workspace's own edits survive it, belongs with the entry that
    builds it. Nothing is lost meanwhile, because the manifest names the directory, so a reader
    finds it by hand.
  - **Floor-scope sessions** — a session responsible for the ground floor rather than a task on it.
    _Why safe:_ the session scope enum already has room for `project` and gains a value without a
    migration (`src/store/types.ts`), and until the verb exists the honest recording is a task
    session on the ground floor, which is what every stewardship session is today.
  - **A `ward floor` noun** (aliasing `project` for the metaphor's sake). _Why safe:_ it is a
    renaming with no new capability, and doing it here would put a second spelling of every project
    verb in front of the change that matters. The metaphor is already carried by the addresses.
  - **Renaming closed floors' addresses**, and any relocation of an ordinary project. _Why safe:_
    monotonic floor numbers are the intent's rule and the root of every historical room address; the
    one relocation this entry performs is bounded to a container whose tasks are all closed and
    whose old number is retired, never reused.
- **Acceptance:**
  1. `mise run check` green.
  2. `bun test test/workspace/ground-floor.test.ts` — a fresh create establishes floor 0 and the
     first ordinary floor is 1; converge on a pre-0018 workspace establishes floor 0 beside floors
     1–5 and `nextFloor` yields 6; converge relocates a floor-1 standing project holding only closed
     tasks, rewriting its records and retiring 1; converge leaves one holding an open task and
     doctor warns with the remedy; `task open` with no floor lands on `f0t1` with worktree path
     `worktrees/f0t1-<branch>`; a workspace with no standing project refuses with the converge
     remedy; the schema refuses floor 0 without the marker; the derived upgrade task opens at
     `f0tN`; legacy bare tasks still list, resolve, and settle; doctor counts them.
  3. `bun test test/cli/ground-floor.test.ts` — `ward task open` echoes the ground floor;
     `--project 0` is accepted; `ward status` and `ward project list` render
     `floor 0 — workspace
     (ground floor)` first, and carry floor 0 in `--json`.
  4. `bun test test/workspace/lineage.test.ts` — the 0037 manifest is a known default and the
     current one is repinned, so a workspace carrying either upgrades rather than reading as
     customized.
  5. In a throwaway workspace: `ward workspace create /tmp/ws` then `ward task open a-thing` opens
     `f0t1` saying the ground floor took it; `ward status` leads with
     `floor 0 — workspace (ground
     floor)`; `ward project open toolchain` opens floor 1.

## Design

- **Decisions:** no new ADRs. Entry-local:
  - **A reserved number, not an allocated one.** 0018 allocated the standing project's floor like
    any project's, which is the conservative choice: it bends no rule and needs no reserved value.
    It lost on one requirement it cannot meet — the address has to be the **same in every
    workspace**, because the things that need to name it (the root manifest, whose bytes are
    lineage-identical across workspaces by construction; a brief written once and read in three)
    exist outside any one workspace. Reserving 0 costs exactly one number out of the ordinary
    sequence and one refinement on the record; it buys an address that can be written down. It also
    reads correctly: the ground floor is the one you arrive on, below the numbered floors, and the
    workspace's own work is what happens there.
  - **Relocate on converge, not doctor-only.** Leaving pre-0041 workspaces on their old standing
    floor forever — doctor naming it, nothing moving — was the cheaper option and would have made
    this entry additive. It lost because it makes the fixed address a lie exactly where it is
    needed: a manifest that names `projects/0-workspace/` would be wrong in every workspace created
    by 0018–0040, and "the ground floor is floor 0 unless your workspace is old" is not an address
    anything can be written against. Converge is already the migration path for every installed
    artifact, so relocation is one more check-then-do step rather than a new mechanism. The cost is
    that a converge run can move a directory, which is why it is bounded by the next decision.
  - **Relocation is safe for closed tasks, and only for them.** Moving the directory changes every
    task's address under it. For a **closed** task that is inert: its worktrees were torn down at
    the gated close ([0004](../0004-work-spine/README.md)), so no path on disk, no branch, and no
    live process is named by the old address; what remains is a record, and the record moves with
    it. For an **open** task it is destructive in the way that matters — its worktree directories
    are named `worktrees/f<floor>t<room>-…`, its sessions record a working directory under that
    path, and its briefs and PR links quote the address. So an open task blocks the move, converge
    says which one and reports `satisfied` rather than failing (a workspace that cannot converge is
    a workspace that cannot upgrade anything else either), and doctor carries the ordered remedy:
    close them, then converge. The cost is that a workspace with a permanently open stewardship task
    never relocates — accepted, because the standing project's tasks are stewardship acts that end.
  - **The vacated floor is retired in the record, not inferred from the directories.** Floor
    allocation reads the directory names, and after a relocation no directory carries the number the
    standing project came from — so the next `project open` would hand it straight back, and every
    address recorded under it (`f1t3` in a brief, a session log, a merged PR title) would name two
    different floors. Leaving a tombstone directory behind was the alternative, and it lost for
    being a record no reader could interpret: an empty `projects/1-workspace/` says nothing about
    why it is there. The number is recorded instead, as `previousFloor` on the project that vacated
    it, and the allocator counts it — the record is the truth (§16), and it is the only thing left
    that can say the number was spent. The cost is one optional field, written by exactly one step.
  - **The schema refuses the squatter, not the legacy.** The invariant is that floor 0 and the
    `standing` marker name the same thing. Enforcing the full equivalence in the schema — rejecting
    a standing record on floor 3 as well — was attractive because it states the rule once and
    exactly. It lost on a fact the rule cannot see: a standing record on floor `N ≥ 1` is precisely
    what every 0018–0040 workspace holds, and a schema that rejects it makes those workspaces
    unreadable by the verbs that exist to fix them — converge could not find the project to
    relocate, doctor could not name it, `status` would refuse to run. So the schema refuses only the
    direction that Ward never writes and no history contains (floor 0 without the marker), and the
    other direction is a **state doctor reports** with the act that settles it. The cost is one
    invariant held in two places; it is paid down when the last workspace converges.
  - **Refuse when there is no ground floor; never fall back.** `ward task open` on a pre-0018
    workspace could keep opening a bare task — no error, work proceeds. That is what the upgrade's
    own derivation did, and it is the failure this entry exists to close: the fallback quietly adds
    one more record to the pool the workspace is trying to leave, and it does so at the exact moment
    the human is starting new work and would have accepted a one-command detour. The refusal names
    the same converge doctor already offers, so the remedy is one string in two places, not two
    answers. The cost is that one workspace shape gets an error where it used to get a task — the
    shape that is one command away from never seeing it again.
  - **Legacy bare tasks are read, never migrated, and never counted as a problem.** The alternative
    — rewriting them onto the ground floor during the same converge — would make the split disappear
    entirely, and was rejected on the same ground the open-task rule rests on: a room is the root of
    the paths that name a task, and the pool's tasks are the oldest in the workspace, quoted in the
    most places. Doctor counts them with no remedy on purpose: a finding whose only honest advice is
    "nothing" should not pretend otherwise, and the count is still worth having — it says the pool
    is finite and how much of it is still open.
  - **The order is a fact, not a rendering.** `readProjects` returns the ground floor first, rather
    than each surface sorting for itself. Two surfaces sorting independently is how they come to
    disagree, and where the ground floor sits is a property of the workspace: it is the floor every
    workspace has, and the one a session with no obvious floor starts from.
- **Layout:** `src/workspace/projects.ts` owns the ground floor: the reserved number, its directory,
  the ordering, and `requireGroundFloor` — the one place that answers "where does a task with no
  floor go?", so no caller re-derives it or re-invents the refusal. The relocation lives in
  `create.ts` beside the step it belongs to, because it is a convergence step and shares the run's
  established-paths bookkeeping and store lock. `tasks.ts` loses its container branch entirely: a
  floor is required, so there is nothing left to decide there. The CLI keeps the resolution of
  _which_ floor (`--project`, then affinity, then the ground floor), because that ordering is a rule
  about the command line, exactly where 0037 put it. **Relationship to the entries this changes:**
  [0018](../0018-standing-workspace-project/README.md) is not superseded as a whole — its marker,
  its converge, and its honest rollup all stand; the one affordance replaced is the **allocation**
  of the standing project's floor, here. [0036](../0036-floor-addressed-tasks/README.md) keeps every
  address it built, including the bare form and the shorthand; what it loses is the bare pool as a
  **destination**.
- **Mechanisms:** _Creation_ writes `projects/0-workspace/project.md` with
  `floor: 0, standing:
  true`; the body is a constant now that the floor is one. _Relocation_ moves
  the directory with `git mv` when git already tracks it (so the journal reads as a rename) and a
  filesystem rename otherwise, rewrites the project record and each moved task record's `floor`, and
  stages both the old and new paths so the converge commit carries the whole move. _Placement_ is
  unchanged up to its last step: `placeTask` weighs `--project` against affinity as before, and a
  `Placement` with no floor now means "the ground floor" rather than "no container". _Upgrade_
  derives its task with `requireGroundFloor`, so the vehicle is on the ground floor or there is no
  vehicle. _Reading_ is untouched: `taskFloor` still answers from containment first, so a legacy
  bare task under `tasks/` composes `t<room>` exactly as it always did.
