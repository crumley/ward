# 0080 — Renaming a floor

> `ward project rename FLOOR SLUG` gives a floor a new slug. The record directory, the view, the
> open tasks' worktrees, the reflection cursor and the host's name all move with it, and the floor's
> number and every address stay as they were.
>
> **Status:** built — awaiting review · **Started:** 2026-11-22

A floor's slug is fixed when the floor opens, and up to now nothing could change it. Floors outlive
the names they opened with. A floor opened for one piece of work becomes the standing home of a
wider one, and its slug then misdescribes it in every place it shows: the record directory
`projects/<N>-<slug>/`, the view `floors/<N>-<slug>/` that every worktree path passes through
([0057](../0057-context-from-root/README.md)), the host's name `<workspace>-f<N>-<slug>`
([0061](../0061-host-names-and-titles/README.md)), and every listing. The only way out today is to
hand-edit records, which the record forbids.

The slug can change because nothing that addresses a floor depends on it. A task's address is
`f<floor>t<room>` ([0036](../0036-floor-addressed-tasks/README.md)), a floor session's id names the
number, a hand-off records the number, and a host is found by its stamps, never by its name. What
spells the slug is the record directory, everything derived from where that directory stands, and
the reflection records, which name covered tasks by their directory
([0069](../0069-floor-reflection/README.md)). This entry moves all of those together and leaves the
number alone. Renumbering a floor is a later entry, and it is built as a caller of the same core
(Design, below).

## Serves intent

- [`domain-model`](../../intent/01-concepts/00-domain-model.md), Identity: the floor number stays
  the floor's identity, so a rename changes no address. The slug now works as a name the floor
  carries rather than half of its identity, which the slice does not yet say
  ([IF-001](intent-feedback.md#if-001--a-projects-slug-is-a-name-it-can-change-not-half-of-its-identity)).
- [`workspace-lifecycle`](../../intent/01-concepts/06-workspace-lifecycle.md): the rename journals
  as one commit, and each machine's own disk converges to it through the same idempotent steps
  `ward workspace upgrade` runs. A crash mid-move and a second machine pulling the commit finish the
  same way.
- [`context-loading`](../../intent/01-concepts/05-context-loading.md): a moved floor's worktrees
  stand under the new view, so the path down to each one still passes the floor's manifest.
- [`principles`](../../intent/00-foundation/01-principles.md): **§16**, no record is left describing
  a place the floor no longer is (the worktree paths, the reflection cursor); **§6**, every disk
  step is check-then-do and a second run changes nothing.

## Scope

- **In:**
  - The verb `ward project rename FLOOR SLUG [--json]`, its report, and its `ward schema` shape.
  - The record half: the directory moved with `git mv`; the project record's `slug` and the body
    line that spells it; the `path` of every open task's worktree record under the old view; and the
    `tasks[].dir` of every reflection record of the floor. One journal commit.
  - The disk half on this machine: the new view; each open task's checkout moved with
    `git worktree move`; each outside worktree's link re-made at its new placement; the old view
    retired; the hosts renamed.
  - The refusals, all reported together, with nothing written (Design, Mechanisms).
  - Three convergence steps: `orphaned floor directories` (ahead of the standing project),
    `outside worktree links` and `retire stale floor views` (after the placement step). Two doctor
    checks: `floor records` and `stale floor views`.
  - A legible error from `readProjects` for a project directory with no `project.md`.
  - A line in the root `AGENTS.md` template on renaming a floor.
- **Deferred:**
  - _Renumbering._ Safe to defer: no record says a number is wrong, and floor collisions keep their
    doctor finding and its remedy sentence ([0077](../0077-floor-chosen-number/README.md)) until the
    renumber verb exists. The shape that verb fills is below.
  - _Old slugs that keep resolving._ This is a decision, not a gap. Nothing addresses a floor by its
    slug, so there is nothing to keep resolving, and an alias table would be a second record of the
    floor's name that could drift from the first.
  - _Rewriting the floor's `notes.md` heading._ The notes are the floor's own, and Ward never
    rewrites them ([0055](../0055-floor-manifests/README.md)). The heading keeps the slug it was
    seeded with until a reflection or a human changes it.
  - _A running harness's name._ A run keeps the `--name` it was started with
    ([0078](../0078-task-named-windows/README.md)) until its next resume. Safe to defer: the rename
    is refused while any session of the floor is running in a host, so the only run that can outlast
    a rename is a foreground one, and the next resume names it afresh.
  - _Hosted runs on another machine._ The live check reads this machine's host. A floor session
    hosted on another machine is invisible here. Safe because that machine's disk is not touched by
    this one: its checkouts and view converge at its next upgrade, refused there exactly as here
    while a session works inside them.
- **Acceptance:** each check is a case in `test/workspace/floor-rename.test.ts` unless noted.
  1. A rename of a floor with an open task's worktree, a closed task's worktree record and a
     reflection commits once, as a git rename. It rewrites the project record, the open worktree's
     record and the reflection, and leaves the closed record's path as it was. It moves the checkout
     (same tip, git agrees), puts the new view's links on the moved record, retires the old view,
     keeps the covered task reflected, and renames the floor's host. Asking again commits nothing.
  2. Each refusal writes nothing: a dirty checkout; a session working inside a checkout or the view;
     an open reflection of the floor; a live hosted session of the floor; the caller being one of
     the floor's own sessions; a view already standing at the new name; the ground floor; an invalid
     slug; a floor that does not exist.
  3. A host that is not usable here is not asked, and the rename goes ahead.
  4. An outside worktree stays where its command made it, and only its link moves.
  5. A stale view holding only Ward's links is retired by the upgrade. One holding anything else is
     kept whole, named as residue, and reported by doctor as a warn.
  6. A machine whose disk still stands under the old name converges on upgrade: checkout moved, view
     established, old view retired, nothing committed.
  7. A task written under the old name after the rename: `readProjects` refuses legibly, doctor
     warns `floor records`, and the upgrade folds it in, stopping on a file that differs. Once that
     file is cleared, the next upgrade folds the rest.
  8. `ward project rename 1 beta --json` matches its schema, a second run reads `satisfied`, and a
     refusal leaves stdout empty and exits non-zero.
  9. The verb is listed in `test/cli/format-guard.test.ts`, the create and upgrade step counts are
     re-pinned (23 and 22), the `AGENTS.md` lineage is re-pinned, and `mise run check` passes.

## Design

- **Decisions:** no ADR. Entry-local choices:
  - **One core that re-places a floor, and a thin verb on top.** `moveFloor(root, floor, target)` in
    `src/workspace/floor-move.ts` does the refusals, the record half, the disk half and the host
    refresh. `renameFloor` only validates the slug. The alternative was a rename-specific function,
    which would have been shorter today. It lost because renumbering has to do every one of those
    steps again with more record rewrites, and two copies of the refusal set would drift. The cost
    is that `FloorTarget` carries only `slug` today, and its comment says where the number goes.
  - **The record moves first, in one commit, and the disk follows.** The alternative was to move the
    checkouts first, then write the records, so a crash could never leave a record pointing where
    nothing stands. It lost because a second machine always starts from that state anyway: it pulls
    the record and its disk is behind. The placement step already finishes exactly that case
    (`planRelocation` finds a branch's checkout through git, wherever it stands). So the disk half
    is a set of convergence steps, and running it inside the verb is the one-machine shortcut. The
    cost is a window where this machine's checkouts lag the record. Doctor's placement finding names
    that state, and `ward project rename` run again, or an upgrade, finishes it.
  - **Refused while anything of the floor is running, so it is run from the coordinator.** Moving a
    directory under a live harness strands its working directory, and the harness's history is keyed
    by that directory. The alternative was to move only what nothing stands in and leave the rest as
    residue. It lost because a floor half-renamed across its own running sessions is a state no
    reader can explain. The verb refuses a live or undeterminable hosted run of the floor's own
    session or any of its tasks' sessions, an open session whose working directory is inside the
    view, the record directory or a checkout, and a caller that declares itself one of the floor's
    sessions. The refusal says to run it from the coordinator. A host that is not usable here is not
    asked: no run can be standing in it.
  - **An open reflection refuses the rename.** A reflection's stewardship worktree is a copy of the
    record cut before the move. Merged afterwards, it would bring back the old directory with the
    reflection record in it. Waiting for it to land or close costs one reflection's lifetime.
  - **Nothing records the old slug.** The number identifies the floor. The alternative was to record
    each previous slug, as `previousFloor` records a vacated number. It lost because a number has to
    stay spent (addresses compose with it), while a slug is spent by nothing.
  - **A floor directory without its record is folded into the floor on its number.** Two machines
    that each write under a floor before syncing can leave `projects/<N>-<old>/tasks/...` beside the
    renamed `projects/<N>-<new>/`, if git does not carry the new files across the directory rename.
    The number is the floor's identity, so its contents belong to the floor holding that number. The
    fold goes file by file: a file the floor lacks moves in, one it holds identically is dropped,
    and one that differs is left in place. The alternatives were to leave the directory for a human,
    or to make `readProjects` skip it. Leaving it blocks every verb that reads the floors. Skipping
    it hides tasks that `readTasks` still sees. Because no later step can get past the directory, a
    fold that leaves a differing file journals what it moved and stops the run, naming each file.
    With no single floor on the number it is left whole, and doctor says so.
  - **Same slugs as `project open`.** `requireSlug`, and no refusal of a slug another floor wears,
    because open has none. Two floors with one slug still differ by number in every directory and
    address.
- **Layout:** `src/workspace/floor-move.ts` is the new home for moving a floor and for finishing
  one: the core, its refusals, the record rewrite, and the three helpers convergence calls
  (`linkOutsideWorktrees`, `retireStaleViews`, `foldOrphanFloorDirs`). It also holds the two
  read-only inspections doctor shares with them (`staleViews`, `orphanFloorDirs`). `moveTracked`
  moved from `converge.ts` to `git.ts`, so the 0041 relocation and this module share one copy
  without an import cycle. `establishOutsideLink` is now exported from `worktrees.ts`.
- **Mechanisms:**
  - _Refusals_ are gathered as clauses and thrown together, before the store is touched. The
    checkout check asks `planRelocation` about each open task as it _will_ stand, with its directory
    under the new name, so the rename refuses exactly what the placement step would refuse once the
    record moved. A refusal about a path with nothing on disk is not one: the record moves alone.
  - _The record half_ is `moveTracked`, then the project record (slug, and the body's
    ``the `slug` project`` phrase where it still reads that way), then each open task's worktree
    record whose path lies under the old view, then each reflection whose task directories lie under
    the old directory. `commitRecords(root, …, newDir)` stages it all. The `git mv` already staged
    the removals.
  - _The disk half_ (`settleFloor`): the floor's view; `relocateWorktree` for each open task's
    checkout; `establishOutsideLink` for each outside worktree on this machine; then
    `retireStaleViews`. A record the relocation had to rewrite, because it stood away from its
    placement before the rename, gets the placement step's own commit.
  - _A stale view_ is any directory under `floors/` that is no open floor's view. Ward's own links
    are the view's three, recognized by the exact text Ward writes even when they dangle, and links
    onto an outside worktree an open task records. A view holding only those is retired: each link
    unlinked, then `rmdir`, never recursively, the posture of 0057's `worktrees/` retirement.
  - _Hosts_ are renamed by `refreshHosted`, after the lock, as `ward project identity` dresses them:
    hosts are found by stamp and named from the records on every call
    ([0061](../0061-host-names-and-titles/README.md)), so no stamp changes.
  - _What a renumber adds_ to `moveFloor`: the target's number in the directory name; every task
    record's `floor`; the `floor` of the floor's own sessions; a hand-off's `to` and `fromFloor`;
    the reflections' `floor`; the old number kept spent (today `previousFloor` holds one number,
    which needs a record-shape change, [0077](../0077-floor-chosen-number/README.md)); and worktree
    placements whose directory names carry the address, which `planRelocation` already moves. Its
    refusals and disk half are this entry's unchanged.
