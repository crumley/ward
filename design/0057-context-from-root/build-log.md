# 0057 — Build log

> What building context from the root forced or revealed. The commits and the pull request carry
> what was done.

## 2026-11-10 — the build

**What building forced.**

- **The migration journals after the convergence commit, not inside it.** Phase 1 is one list
  (`convergeWorkspace`), and until now it ended in a single journal commit. The placement step needs
  one commit per task and the retirement step one of its own, so both run after the convergence
  commit. That ordering also matters for correctness: by the time a worktree moves under `floors/`,
  the `/floors/` ignore line is already committed, so a moved checkout can never surface as an
  untracked embedded repository. On a fresh `workspace create` both steps report `satisfied`, which
  is why create's report now ends in two satisfied rows.
- **`git worktree move` does not create the destination's parent.** The move creates the parent
  first. Placement at create time needed nothing extra, because `git worktree add` creates leading
  directories, but create now establishes the floor's view before the worktree under it, so the path
  carries the manifest from the first moment.
- **Matching a checkout by branch alone is unsafe.** Two open tasks can record the same branch name
  in one repository; a task reopened as another leaves exactly that shape. Git holds a branch in at
  most one worktree, so the branch's one checkout belongs to whichever task stands there. Placement
  and restore both take the checkout only when it stands at a path the record itself can mean (its
  `path`, its placement, or the old `worktrees/` spelling of the placement's name) or at a path no
  other open record claims. Without that rule, a missing record's restore or move would carry
  another task's work under its name. `ownCheckout` in `worktrees.ts` is the one home for it.
- **The second machine journals nothing.** When the record already names the placement, only the
  move runs, and no record file changes; committing anyway would fail on an empty commit. The step
  commits only the record files it actually rewrote.
- **A record with no checkout here moves alone.** A floor task's record can name a worktree that
  exists only on another machine. With no checkout of its branch here, and nothing at the recorded
  path, the record's `path` is rewritten to the placement: there is nothing on this machine to move,
  and the machine that holds the checkout moves it on its own upgrade (the second-machine case). A
  checkout at the recorded path on some other branch is drift, and is refused instead.
- **Git's own refusals are reported in git's words.** A locked worktree, or one holding submodules,
  is not pre-checked: the move is attempted and git's refusal becomes the residue's reason. Doctor's
  `worktree placement` finding names only the refusals it can see without moving anything (dirty, an
  open session inside, an occupied placement, a checkout on another branch).
- **The residue needed a home in the report.** Converge steps gain an optional `residue` array
  (`path`, `reason`, `command`), additive in `workspace create` and `workspace upgrade` `--json`.
  `workspace restore --json` gains `floorViews` (floors, links written, detail). `ward context` is
  registered among the read verbs, so the schema suite validates its live output.
- **The legacy ignore line belongs to old workspaces only.** `/worktrees/` leaves `IGNORE_LINES`, so
  a workspace created now never carries it. A legacy bare task exists only in a workspace an older
  ward created, which already carries the line until retirement drops it; the placement tests seed
  it the same way.

**Observed, outside this entry.** Converge's commit step fails ("nothing to commit") when a tracked
installed file was deleted from the working tree and converge writes it back byte-identical: the
path is staged, but nothing differs from `HEAD`. This predates the entry; the floor-views tests
commit such a deletion before converging rather than depend on it.

**What proves it.**

```sh
bun test test/workspace/floor-views.test.ts test/workspace/worktree-placement.test.ts \
  test/cli/context.test.ts test/cli/session-show.test.ts test/workspace/lineage.test.ts
bun install --frozen-lockfile && env -u WARD_AGENT mise run check
CI=true env -u WARD_AGENT mise run check
```

**Deferred, beyond the entry's own list.**

- **Open sessions on other machines block a move here.** The placement guard reads every open
  session, whatever machine recorded it, as the design states. A session's `resume` is bound to its
  machine, so a session recorded elsewhere cannot land in a directory this machine moved, and the
  guard could be narrowed to this machine's sessions. _Safe to defer because_ the wider guard only
  leaves more worktrees in place, each named with `ward session close ID`, and narrowing it later is
  a filter on one list.
- **Doctor does not pre-name a locked or submodule refusal.** _Safe to defer because_ the upgrade
  names it in git's words the first time it is attempted, and nothing moves.
- **Converge's empty-commit edge above.** _Safe to defer because_ it needs a hand deletion of a
  tracked installed file, and the remedy is to commit the deletion and converge again.

**Next.** Run `ward workspace upgrade` in each workspace, on each machine (Order of work, step 5).
Worktrees with an open session inside, or uncommitted changes, are listed and stay; checkouts no
open task records keep `worktrees/` until a human removes them with the listed command.
