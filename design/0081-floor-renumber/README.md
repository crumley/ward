# 0081 — Renumbering a floor

> `ward project renumber FLOOR N` gives a floor a number never spent, once in its life. Every record
> that says the old number is rewritten in one commit, the old number is retired in the project
> record, and every address under it names nothing afterwards. The disk and the hosts follow on each
> machine.
>
> **Status:** built — awaiting review · **Started:** 2026-11-22

A floor's number is fixed when it opens. A workspace that adopts a numbering convention after its
floors exist (low numbers for what recurs, a range for one kind of work) has no way to bring them
into it. Two machines that each open a floor on the same number before syncing leave a collision
that doctor reports and nothing can end ([0077](../0077-floor-chosen-number/README.md), _Floor
collisions_). The only way out today is to hand-edit records, which the record forbids.

[0080](../0080-floor-rename/README.md) built `moveFloor` to re-place a floor's record directory and
everything derived from where it stands, with rename as a thin caller, and listed what a renumber
adds. The number is harder than the slug. Addresses compose with it (`f<floor>t<room>`,
[0036](../0036-floor-addressed-tasks/README.md)), records outside the directory say it (hand-offs,
the ground floor's reflection tasks), a floor session's trail names tasks by a floor-qualified
address ([0078](../0078-task-named-windows/README.md)), and a host is found by a stamp that carries
it ([0061](../0061-host-names-and-titles/README.md)). This entry rewrites each of those, retires the
old number, and teaches the name refresh to restamp a host still wearing it.

## Serves intent

- [`domain-model`](../../intent/01-concepts/00-domain-model.md), Identity: a floor number is still
  never reused. The number a renumber vacates is retired in the record for good, so the addresses
  recorded under it can never come to name another floor's rooms. The slice does not yet say a
  renumber is one of the ways a number is retired
  ([IF-001](intent-feedback.md#if-001--a-floor-number-is-retired-by-a-renumber-as-well-as-by-a-close)).
- [`sessions-and-lifecycle`](../../intent/01-concepts/02-sessions-and-lifecycle.md): a session's id
  stays the id it was minted with, so it still addresses one session over the workspace's history,
  though the floor its number names has moved
  ([IF-002](intent-feedback.md#if-002--a-floor-sessions-id-keeps-a-number-its-floor-no-longer-holds)).
- [`workspace-lifecycle`](../../intent/01-concepts/06-workspace-lifecycle.md): the renumber journals
  as one commit. Each machine's disk converges to it through the steps `ward workspace upgrade`
  already runs, and its hosts at the next name refresh.
- [`principles`](../../intent/00-foundation/01-principles.md): **§16**, no record is left saying the
  floor is on a number it left (tasks, sessions, hand-offs, reflections); **§6**, the disk half and
  the restamp are check-then-do, and a second run changes nothing; **§20**, every refusal says what
  clears it.

## Scope

- **In:**
  - The verb `ward project renumber FLOOR N [--json]`, its report, and its `ward schema` shape.
    `FLOOR` is a number, a slug, or a record directory (`projects/7-alpha` or `7-alpha`).
  - The record half, one journal commit: everything a rename writes, plus the project record's
    `floor`, `previousFloor` (the number left) and the body's `Floor N:`; `floor` on every task of
    the floor, open and closed; `floor` on the floor's own sessions, open and closed; a fresh
    `task-named` on each open floor session working a task; `to` on the hand-offs of this floor's
    tasks and `fromFloor` on the hand-offs it sent; `floor` on its reflections; `reflects` on the
    ground floor's reflection tasks of it; and every open worktree record's path, whose leaf carries
    the address.
  - The refusals, all reported together, nothing written: a rename's (0080), plus a floor renumbered
    before, a target the record has spent, a target outside 1–999, and a move that would change
    which floor keeps a shared emoji. A number two floors hold is refused as a `FLOOR`, naming each
    by its directory.
  - Pick-up detection that survives a renumber: a hand-off's `task-named` pick-up is matched by room
    and slug within the floor's own sessions.
  - `SessionHost.restamp`, and a restamp in the name refresh (`refreshNames`) of every host stamped
    with a retired number. `ward workspace upgrade` runs the refresh too. Doctor names a host still
    stamped with a retired number.
  - `floorCollisionRemedy` names the verb with the directory to give it.
  - A bullet in the root `AGENTS.md` template.
- **Deferred:**
  - _A second renumber of the same floor._ This is a decision, not a gap: `previousFloor` holds one
    number, and a list would be a record-shape change and a format level. Safe because the refusal
    says so before anything is written, and a floor that needs another number can still be given a
    new floor with its work moved by hand-off.
  - _Aliases for old addresses._ Also a decision. After a renumber, `f7t49`, `--floor 7` and
    `--project 7` name nothing. An alias table would be a second record of a floor's identity that
    could drift from the first, and a closed task is still found by its slug.
  - _Rewriting quotations._ A hand-off's `task`, a brief's `for`, the trail's earlier `task-named`
    events and closed sessions' working directories say what was said at the time. Safe because
    nothing resolves them as live keys: pick-up detection no longer compares the floor half.
  - _Hosted runs on another machine._ As for a rename (0080, Deferred): the live check reads this
    machine's host. That machine's host is restamped at its next attach, launch or upgrade. Every
    hosted launch refreshes names before it places, so no run there lands in a second host.
  - _A running harness's name._ As for a rename: kept until its next resume.
  - _An older Ward._ A Ward from before this entry reads the renumbered records correctly
    (`previousFloor` already counts as spent since 0041), so no format level is raised. It does not
    restamp hosts, and it reads a hand-off picked up before the renumber as pending. Both settle as
    soon as this Ward runs on that machine.
- **Acceptance:** each check is a case in `test/workspace/floor-renumber.test.ts` unless noted.
  1. A renumber of a floor with an open task's worktree, a closed task with a worktree record and a
     reflection, the ground floor's reflection task, a hand-off received and picked up, a hand-off
     sent, an open floor session working a task and a closed one commits once, as a git rename.
     Every rewrite above is asserted; the checkout is at `floors/22-alpha/f22t1-feature` with the
     same tip; the host is restamped and renamed; `f1t1` names nothing and `f22t1` names the task;
     the hand-off still reads picked up, by the same session at the same time; a new floor session
     is `f22-1`; the next unchosen floor is 23. Asking again, by the old number or the new, commits
     nothing.
  2. Each refusal writes nothing: a floor renumbered before; a held target; a retired target; the
     old number asked for another target; the ground floor; 0, above 999 and a non-number as the
     target; a missing floor; an emoji the floor would lose; an emoji the floor would take; the
     caller being the floor's own session.
  3. Of two floors on one number, the bare number is refused naming both directories; the one named
     by directory is renumbered, and only its sessions and the hand-off its session sent follow it.
     Doctor's collision finding names the verb, and is gone afterwards.
  4. A machine whose disk stands under the old number converges on upgrade with nothing committed;
     doctor names its host stamped with the old number; the name refresh restamps it once.
  5. A renumber cut short after its commit is finished by asking again.
  6. `ward project renumber alpha 22 --json` matches its schema; a second run reads `satisfied`; a
     refusal leaves stdout empty and exits non-zero.
  7. The `restamp-a-host` conformance scenario passes on a real tmux and from its transcript
     (`test/host/tmux-conformance-live.test.ts`, `test/host/tmux-scripted.test.ts`).
  8. The verb is in `test/cli/format-guard.test.ts`, the `AGENTS.md` lineage is re-pinned, and
     `mise run check` passes.

## Design

- **Decisions:** no ADR. Entry-local choices:
  - **A renumber is `moveFloor` with a number in its target.** `FloorTarget` gained `floor`, and a
    `FloorRef` (a number, or a record directory) names the floor. The refusals and the disk half are
    0080's unchanged; `renumberRecords` holds what only a renumber rewrites. The alternative was a
    separate function, which would read more simply today. It lost for 0080's reason: two copies of
    the refusal set would drift.
  - **Retired in the existing `previousFloor`, so once per floor.** The record already counts
    `previousFloor` as spent (0077), and an older Ward reads it correctly. A list of previous
    numbers would let a floor be renumbered again, at the cost of a record-shape change that every
    older Ward rejects. Renumbering is rare, a floor that has been renumbered once has already
    reached the convention it was moved for, and a second renumber is refused before anything is
    written, saying why.
  - **Every task's `floor` rewritten, closed ones included.** Containment already answers a task's
    floor, so the field could have been left. It lost because a record saying a floor it is not on
    is the drift §16 forbids, and because the ground-floor move (0041) set the precedent of
    rewriting them all.
  - **A fresh `task-named`, and pick-up matched by room and slug.** After a renumber, an open floor
    session's trail names its task by the old number, and both `workingTaskOf` and hand-off pick-up
    compare against the task's address now. Two answers were possible: rewrite the trail, or read it
    more tolerantly. The trail is append-only, so the renumber appends one `task-named` per open
    floor session working a task, and the session reads as working it. Pick-up detection reads the
    first naming, which stays under the old address, so it compares room and slug only. That is safe
    because it reads only the task's floor's own sessions, where a room and slug name one task for
    good. Rewriting the pick-up's event would have moved the time the hand-off was picked up.
  - **A hand-off's `to` and `fromFloor` rewritten; its `task` and the brief's `for` left.** `to` and
    `fromFloor` are what `ward task dispatches --to/--from` filter on, and a floor asking for its
    own must find them. `task` and `for` record what the sender wrote, and nothing resolves them.
  - **On a shared number, only what is provably this floor's.** When two floors hold the number, a
    sent hand-off's `fromFloor` is rewritten only when its sending session is one of this floor's
    (its own or its tasks'), and a reflection task's `reflects` only when this floor's reflections
    name it. A shared number is not restamped on any host, since the host stamped with it is the
    other floor's too.
  - **Hosts restamped in the name refresh, from the record.** The refresh runs at every hosted
    launch, every attach, `ward project identity`, rename, renumber, and now
    `ward workspace
    upgrade`. Restamping there reaches another machine's host without a new step
    or a stored mapping: `previousFloor` says where each retired number went (`renumberedFloors`).
    The alternative was a convergence step, which would have put a tmux call into every converge
    run, tests included. The cost is that a machine that runs none of those verbs keeps a stale
    stamp, which doctor names.
  - **An emoji clash that would flip is refused.** Of two open floors wearing one emoji, convergence
    gives the higher-numbered another (0064). A renumber across the other wearer would change which
    floor that is with nobody having chosen it. The refusal names `ward project identity` to settle
    the clash first. A clash the renumber does not flip is left as it is.
  - **The verb takes a directory.** Of two floors on one number, the number names both and a slug
    may too. The directory always names one, so the verb reads `FLOOR` itself (a string, not a floor
    reference), and refuses a shared bare number with each directory spelled out.
- **Layout:** everything lives in `src/workspace/floor-move.ts` beside the rename.
  `renumberedFloors` (in `projects.ts`) is the one reader of where retired numbers went: the name
  refresh in `src/agent/naming.ts` and doctor's host findings both call it. `spentRefusal` (in
  `projects.ts`) is shared by `project open --floor` and the renumber, so both describe a spent
  number in the same words.
- **Mechanisms:**
  - _Resolution:_ `renumberFloor` parses the target before the lock (`requireRenumberTarget`), then
    reads `FLOOR` as a directory, a number (refusing a shared one, and answering a number the floor
    left with that floor when the target is the one it took) or a slug.
  - _The record half:_ `moveRecords` (0080's, now also writing the number, `previousFloor`, the body
    line, the worktree placements and the reflections' `floor`), then `renumberRecords`, then one
    `commitRecords` staging the directory and the files outside it.
  - _The disk half:_ 0080's `settleFloor` on the new number. The placement step already moves a
    checkout whose placement changed, so a worktree's new leaf needs nothing new.
  - _Hosts:_ `refreshNames` reads `renumberedFloors`, asks `host.restamp` for each of this
    workspace's hosts stamped with a retired number, then names them for the floor they now belong
    to. tmux sets `@ward_floor` on the session in place (`restampGroupArgv`).
