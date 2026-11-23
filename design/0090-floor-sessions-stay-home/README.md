# 0090 — Floor sessions stay home

> A floor's session, and a task's, is placed in its own floor's host whoever started it. Only a
> workspace-scope helper, which has no floor of its own, still goes with the session that started
> it. Doctor names a window an older Ward left in another floor's host, with the move that takes it
> home.
>
> **Status:** built — awaiting review · **Started:** 2026-11-22

[0031](../0031-detached-session-hosting/README.md) derives a window's host from the record: the
session's own floor, unless it records a parent whose placement floor is not 0, in which case the
parent's. The reasoning was a coordinator on floor 3 watching the floor-5 work it dispatched. Two
entries since have made a floor's host the place that floor is tended.
[0086](../0086-coordinator-stays-home/README.md) put every window in one host alone, and the
workspace manifest says each window lives in its own floor's host.
[0089](../0089-floor-attending/README.md) made the floor's general session, its attending, window 1
of that host, and pointed `wsa N` and a hand-off's typed line at it.

Under lineage placement those rules break whenever a session on one floor opens a session for
another. The child's window stands in the parent's host. Floor N's host does not show floor N's
work, the attending of floor N may stand in floor 3's host and lead nothing (0089 deferred exactly
this case), and a human looking for floor N's windows in floor N's host does not find them. In use,
the case is not rare: a floor's session that hands a task to another floor's work and opens the
session for it, with `ward session open --task ADDRESS --detach`, lands that session in its own host
every time, because a launched session records the caller as its parent.

This entry narrows lineage to the one scope that has no floor to go to. A floor-scope session
(plain, working a task, opened with `--new-task`) and a task session place by their own floor. A
workspace-scope session started by another session still places by its parent, as 0031 ruled: its
own floor would be 0, and floor 0 is where the workspace itself is tended, not the floor whose work
it is helping with.

**0031 is superseded in part**: its placement rule ("Placement is derived from the record: a
session's own floor, or its recorded parent's") holds now for workspace-scope sessions only. 0089's
`leadsHost`, which existed to exclude an attending placed beside another floor's parent, is removed:
an attending is now always in its own floor's host.

## Serves intent

- [`session-multiplexer`](../../intent/02-subsystems/01-session-multiplexer.md): sessions are
  grouped by the scope or the lineage that owns them, derived from the record. A floor session's
  scope names its floor and owns it; lineage owns only a session whose scope names no floor.
- [`human-shell`](../../intent/02-subsystems/07-human-shell.md): a floor's host shows that floor's
  work, so the human finds it where its floor's identity says it is.
- [`principles`](../../intent/00-foundation/01-principles.md): **§6**, where a window lives stays a
  pure function of facts recorded at open.

## Scope

- **In:** `placementFloor` (`src/agent/placement.ts`) follows the parent only for a workspace-scope
  session; every placement reader (open, resume, attach's re-create, `resume --all`, the name
  refresh's labels, doctor, the hand-off nudge) takes the narrower rule unchanged. `leadsHost` is
  replaced by `isAttending`. Doctor's misplaced-window finding carries a remedy: the `move-window`
  that takes the window to the end of its floor's host when that host stands, and otherwise the
  resume that places it there once its run exits. The host seam gains
  `moveCommand(window, from,
  to)`, a remedy string like `unlinkCommand`.
- **Deferred:**
  - _Moving a misplaced window at the next open or attach._ The name refresh already moves a late
    attending to the front of its own host (0089), and moving a window between hosts is the same
    tmux verb with a different target. Safe to defer because a misplaced window is a leftover of an
    older Ward only: no new launch makes one, its run is unaffected, attach follows it wherever it
    stands, doctor names it with the exact move, and it goes home by itself at its next resume.
    Building the repair means a new host operation on the hot path, a conformance scenario and
    re-recorded transcripts, and acting on the human's tmux unasked, for a state that ages out — the
    trade [0086](../0086-coordinator-stays-home/README.md) made for an older Ward's links.
  - _A recorded "watch" relation for a dispatcher._ A session that wants to watch the work it
    started on another floor can attach to it or observe it. Safe to defer because nothing records
    or needs that relation today, and the parent link stays recorded for whoever does.
- **Acceptance:**
  1. A floor-2 session started by a floor-1 session, plain, working a task, on a task opened with
     it, and resumed, is placed in floor 2's host; a workspace-scope helper the floor-1 session
     starts is placed in floor 1's; a floor-2 attending started from floor 1 leads floor 2's host
     (`test/agent/cross-floor-placement.test.ts`).
  2. The placement table: a floor session, a floor session working a task, a task session and a
     ground-floor session started from floor 3 each place by their own floor; a helper, and a
     helper's helper, of floor 3's session place on floor 3 (`test/agent/host.test.ts`).
  3. Doctor reports a live window standing outside its placement floor's host as information, with
     `tmux move-window -s =<host>:<window> -t =<home>:` when the home host stands and the detached
     resume when it does not, and moves nothing (`test/agent/host-findings.test.ts`,
     `test/agent/cross-floor-placement.test.ts`, `test/host/tmux.test.ts`).
  4. `mise run check` passes.

## Design

- **Decisions:** no ADR. Entry-local choices:
  - **Lineage for helpers only, not removed outright.** Removing the parent rule altogether would
    make placement read only scope. It was attractive as one rule fewer. It lost because a
    workspace-scope session started by a floor session is that floor's helper, opened to do part of
    that floor's work, and would otherwise stand in the ground floor's host beside the coordinator,
    where nothing about it belongs. The cost is that placement stays recursive over the parent
    chain, now only through workspace-scope links.
  - **Placement by the caller's tmux pane was not reconsidered.** It is what 0031 rejected, and the
    reason holds: a re-create after a reboot has no caller pane.
  - **Remedy, not repair.** See **Deferred**. The remedy's source names the host as well as the
    window id, `=<host>:@<id>`: 0089 measured a bare `@<id>` failing with "sessions are grouped"
    when an attach view shows the window. Its target `=<home>:` names no index, so tmux appends the
    window after the home host's last. Measured on tmux 3.8 and 3.7c with a view grouped with the
    source host: the window leaves the source host and the view, keeps its id and its run, and
    stands last in the target.
- **Layout:** the rule stays in `src/agent/placement.ts`, the one home of placement. The seam's new
  `moveCommand` sits beside `unlinkCommand` and `closeCommand` in `src/host/host.ts`, built in
  `src/host/tmux.ts`; nothing runs it.
- **Mechanisms:**
  - _Placement._ `placementFloor` walks the parent chain only while the session it stands on is at
    workspace scope; a floor or task session answers its own floor at once. A floor-0 parent still
    never pulls a helper anywhere, and a loop in a hand-edited chain still stops at the first
    session seen.
  - _The attending._ With every floor session in its own floor's host, the attending of a floor
    always stands there, so the launch asks for it first and the name refresh moves it to the front
    whenever `isAttending` holds.
  - _Labels._ A window's label still compares the session's floor with its placement floor. A floor
    or task window no longer stands in another floor's host, so the floor-marked label
    (`🔧f0 workspace`) appears for no newly placed window; the rule is left in `labels.ts`, which
    still describes any session against any host.
  - _Doctor._ The misplaced-window finding was already there (it read "attach follows it wherever it
    is"). Its message now ends with the remedy, and a session placed under the old rule is reported
    by it as soon as this Ward reads the record.
