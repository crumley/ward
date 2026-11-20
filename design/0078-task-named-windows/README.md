# 0078 — Task-named windows and harness session names

> A floor's session can name the task it is working, and its window and its harness run take that
> task's name (`f7t54 task-named-windows`), every name derived from the record and given again at
> every resume, so a restored window comes back as what it was working.
>
> **Status:** built — awaiting review · **Started:** 2026-11-20

[0061](../0061-host-names-and-titles/README.md) named a window for what its session _is_: `coord`, a
floor's slug, `t<room> <slug>`. In a workspace run through floor hosts nearly every hosted window is
a floor's own session ([0051](../0051-floor-scope-sessions/README.md)), and a floor session works
one task after another without becoming a task session. So nearly every window reads as its floor's
slug whatever it is working on, and a floor host with three windows reads `ward-development` three
times. The harness's own surfaces say less still: Claude Code's resume picker and prompt box show
the harness's generated title or nothing, so a human scanning them cannot tell which run belongs to
which piece of work.

This entry lets a floor's session record the task it is working, as a fact appended to its trail,
and makes that task the name the session wears — on its window, and as the name the harness gives
the run. Nothing new is stored as a name: the name is derived from the trail and the task's record
on every use, as 0061's are. Detached hosting ([0031](../0031-detached-session-hosting/README.md))
and the bulk resume ([0068](../0068-bulk-session-resume/README.md)) already rebuild every window
from the record, so a window named this way comes back named after a reboot without anything
remembering it.

**0061 is not superseded as a whole.** One rule is, here: a task's window label read relative to the
host it stands in (`t33 <slug>` on its own floor's host). A task's window is now its full address in
every host.

## Serves intent

- [`session-multiplexer`](../../intent/02-subsystems/01-session-multiplexer.md) — sessions are
  labelled by the work they belong to, with the floor/room code where the code is what a command
  takes: a floor session working a task is labelled by that task, and a task's label is always the
  address a command takes. (The constraint reads "the work they belong to" as the session's scope;
  [IF-001](intent-feedback.md).)
- [`agent-harness`](../../intent/02-subsystems/03-agent-harness.md) — start and resume pass the run
  a name its own surfaces show, through the adapter, so the harness's resume picker agrees with
  Ward's window list. (The seam's start does not list a name; [IF-002](intent-feedback.md).)
- [`sessions-and-lifecycle`](../../intent/01-concepts/02-sessions-and-lifecycle.md) — the session
  log is append-only: which task a session worked, and when it moved on, are events on its trail.
  (What a floor session working a task _is_ is [IF-003](intent-feedback.md).)
- [`messaging-coordination`](../../intent/02-subsystems/02-messaging-coordination.md) — a hand-off
  is picked up when an agent takes up its task, and a floor's session naming the task is that act.
- [`principles`](../../intent/00-foundation/01-principles.md) — §16, every name is derived from the
  record and none is stored; §20, a name that cannot be worked out is passed over, never the reason
  a launch, a resume or a rename stops.

## Scope

- **In:**
  - **The record.** Two session events, `task-named` (carrying `task`, the slug-qualified address
    `f7t54-task-named-windows`) and `task-cleared`. The task a session is working is the latest of
    them, while that task is open on the session's floor. Workspace format level 3.
  - **The verbs.** `ward session open --task ADDRESS` opens a floor session already working an open
    task of its floor (the floor is the task's; `--floor` may say it too, and must agree), on the
    launched and the `--handle` paths alike. `ward session task ID ADDRESS` names a task on an open
    floor session; `ward session task ID --clear` sets it down. Saying what the trail already says
    writes nothing.
  - **Window labels.** A task's window — a task session's, or a floor session working the task — is
    `f<N>t<room> <slug>` in every host; in another floor's host it carries that floor's emoji
    (`🔍f9t6 markup`). `coord`, a floor session with no task, a helper, and a legacy bare task keep
    0061's labels. `ward session task` renames the window in place at once.
  - **Harness names.** Every launch and every resume passes the run a name: the window's label read
    from no host — no ordinal, no emoji — and qualified by the workspace for a workspace-scope
    session (`f7t54 task-named-windows`, `f7 ward-development`, `main coord`). Claude Code gets
    `--name` with a `--settings` that keeps its terminal title its own (see Decisions); pi gets
    `--name`. Ward's flags stay before `agent.args`.
  - **Reads.** `workingOn` (`address`, `slug`) on `session show` and on each floor session in
    `ward status`, derived; the event's `task` in the trail; `task show` lists a floor session
    working the task among the task's sessions. `ward schema` carries all of it, and `session task`
    is a mutation verb with the session shape.
  - **Hand-offs.** A floor session naming a handed-over task picks the hand-off up
    ([0067](../0067-floor-dispatch/README.md)).
  - **The manifest.** The root AGENTS.md teaches `--task`, `session task`, the full-address label
    and the harness name; the outgoing default joins the lineage.
- **Deferred:**
  - **Renaming a live harness run when its task changes.** `ward session task` renames the window at
    once; the run's own name follows at its next resume. Renaming it live would mean typing
    `/rename` into the run, and typing into a harness is safe only where 0067's checks hold. Safe to
    defer because the window, which is what is looked at, is right at once, and every resume —
    including the bulk resume after a reboot — passes the current name.
  - **A task session or a workspace session naming a task.** A task session is already its task's; a
    workspace session answers for every floor. Both are refused with the reason. Safe to defer
    because nothing a floor session can do here needs either.
  - **The duplicate name in a pi run's hosted title.** pi writes `π - <name> - <cwd>` as its title,
    so a hosted pi window's title says the task twice (see Decisions). Safe to defer because pi's
    title carries no live description to lose, and the cost is width at the end of a title.
  - **`workingOn` on the open's own report.** `session open --json` reports the record, whose trail
    carries the `task-named` event; `session show` derives `workingOn`. Safe to defer because the
    fact is on the report either way.
- **Acceptance:**
  1. `mise run check` → exit 0.
  2. Label tables: a task at home and abroad, a marked floor's task, a long slug cut at a word; the
     harness name for every scope (`test/agent/labels.test.ts`).
  3. Naming over a real record: a floor session working a task is named for it, window and harness;
     moves to the next task; reads as its floor's once the task closes; `launchName` before the
     record agrees with `Naming.harness` after (`test/agent/naming.test.ts`).
  4. Adapter argv: the name after the id with Claude's title setting, before the human's args, at
     start and at resume, for both harnesses (`test/agent/harness.test.ts`, `pi.test.ts`); every
     launch and resume in `launch.test.ts` and `floor-sessions.test.ts` passes it.
  5. CLI: `open --task` and its refusals; `session task` names, is idempotent, moves, clears, and
     refuses a workspace or task session and another floor's task; `status`, `task show` and
     `session show` report `workingOn` until the task closes, which leaves the floor session open;
     naming a handed-over task picks it up; a format-2 workspace refuses with the remedy
     (`test/cli/session-task.test.ts`).
  6. Format: a session that names or clears a task needs level 3, one that never did needs nothing;
     the record shapes re-pinned at 3 (`test/store/format.test.ts`).
  7. Against a real tmux on a private server: a floor session opened with `--task` stands in a
     window named for the task and its run was started with the name; `session task` renames the
     same pane's window; after the server is killed, `resume --all --go` brings the window back with
     the new task's name and resumes the run under it (`test/host/tmux-live.test.ts`).

## Design

- **Decisions:** rests on [ADR 0006](../decisions/0006-tmux-detached-host.md), on 0031's
  found-by-stamp and identified-by-tag decisions, and on 0061's refresh, which is what lets a label
  change rename every live window in place.

  - **What a floor session works is an event on its trail, not a field on its record.** A `task`
    field (or a second field beside the task-scope one) is one read and one write, and attractive
    for it. It loses because a field is overwritten: the record would say what the session works now
    and forget what it worked before, where the session log is the place that history is meant to
    live. Two events, appended, keep every change in order; the current task is the latest of them.
    The cost: reading it is a walk of the trail, a few events long.
  - **The event names the task by its slug-qualified address.** The room address (`f7t54`) is the
    spelling a human types, and passes to whoever holds the room next; a session naming `f7t54` for
    a week could come to name a different task. `f7t54-task-named-windows` names one task for good
    ([0058](../0058-room-collisions/README.md)) and every resolver accepts it. Reports speak the
    address that names the task now (`workingOn.address`).
  - **A floor session names only an open task of its own floor.** A floor session is responsible for
    its floor; handing work to another floor is a hand-off, and the refusal names that verb. The
    named task can be changed or cleared on an open session, so a running floor session moves to its
    next task without being reopened, and sessions opened before this entry can be named.
  - **A closed task stops naming without a write.** The alternative is for `task close` to append
    `task-cleared` to every floor session naming the task, so the record says it outright. It loses
    because the close would then write records outside the task it closes, and because the fact is
    already derivable: the task's state is on its record. So the trail keeps its last `task-named`
    event, `workingOn` is absent, and the window reads as the floor's again at the next refresh. The
    cost: a reader of the raw trail must check the task's state to know whether its last naming
    still holds — `session show` does it for them.
  - **A task's window is its full address in every host.** 0061 spelled a task `t33 <slug>` on its
    own floor's host and `f7t33 <slug>` elsewhere, so that a host's windows did not all begin with
    the same characters. It loses for tasks because the address is what every task-addressed command
    takes — the multiplexer constraint asks for the code where it is what a command takes — and a
    label that drops the floor is one a human has to complete before typing it. A floor's own
    session keeps its slug: there the slug is the name, and no command takes `f7`. In another
    floor's host a task keeps the floor's emoji, which marks a stranger. The cost: a floor host
    whose windows are all its own tasks repeats `f<N>` on each.
  - **The harness's name is the window's label read from no host.** The window label depends on the
    host it stands in and on its neighbours (ordinals); the harness name is shown in places no host
    reaches — a resume picker, a prompt box — and is written into the harness's own history, so it
    must not change because a neighbour arrived. It has no emoji, because it is text a human
    searches for in a picker. A workspace session's label (`coord`) says nothing outside its
    workspace, so its name carries the workspace (`main coord`). It is worked out before the record
    exists — a launch builds its argv first — from what the open will record, never from the id.
  - **Claude Code is given the name and keeps its own title.** Measured on 2.1.325 (build log):
    `--name` pins the terminal title to `✳ <name>` and stops the title Claude otherwise generates
    from the conversation after the first prompt. Ward's hosted title is
    `<window> · <workspace> f<N> · <pane title>`, so passing `--name` alone would say the task twice
    and lose the live description. Two alternatives: drop the pane title from Ward's title when it
    repeats the window — which throws away the description as well — or not pass `--name` to Claude
    — which leaves its picker and prompt box unnamed. Both lose to Claude's own setting
    `terminalTitleFromRename: false`, passed with `--settings` beside `--name`: measured, the name
    stays in the prompt box and the transcript, and the title keeps describing the work. The cost:
    the adapter reaches into one harness's setting — which is the adapter's job — and a human who
    passes `--settings` in `agent.args` overrides it key by key (measured), as the tail is theirs.
  - **pi is given the name, and its title repeats it.** pi 1.4.0 titles itself `π - <cwd>` without a
    name and `π - <name> - <cwd>` with one; neither form carries a description of the work. Passing
    the name is what puts it in pi's footer and session list, and costs a repeat at the end of a
    hosted title.
  - **The name is passed again at every resume.** Both harnesses accept a name on resume and record
    it (Claude appends a new title; pi a new session-info entry), so a session that has moved to
    another task comes back under it. A name that cannot be worked out is left off, and the run
    starts or resumes without one.
  - **Naming a task requires workspace format 3.** An older Ward reads a session record through a
    schema whose event kinds are a closed set: a `task-named` event is not dropped by it, it fails
    the whole record, and every listing that reads sessions with it. That is the case 0066's level
    exists for. So level 3 is added, `ward workspace upgrade` raises a workspace to it, an older
    Ward refuses a raised workspace cleanly, and a workspace still below 3 refuses `session task`
    and `open --task` with the remedy. The cost: a workspace must be upgraded before its first
    naming, on every machine that shares it.
  - **Naming a handed-over task picks the hand-off up.** 0067 marks a hand-off picked up when a
    session is opened on its task, and its notice is typed into the floor's own session — which then
    takes the task up by naming it, not by opening a task session. Not counting the naming would
    leave a hand-off pending while its floor's session works it. The pick-up is the first
    `task-named` event naming the task, and stays even if the session later moves on, as an ended
    task session's does.

- **Layout:** the record half is `src/workspace/sessions.ts` — the two events, `namedTaskOf` (what
  the trail says), `workingTaskOf` (what holds now), and `nameSessionTask`. Naming
  (`src/agent/naming.ts`) reads tasks once with the sessions and turns a floor session working a
  task into a task subject; `src/agent/labels.ts` stays pure and gains `harnessName`. The adapters
  gain only an optional name on start and resume: what the name says is Ward's, how a harness takes
  it is the adapter's. Nothing in `src/host/` changes — a label is a finished string there.

- **Mechanisms:**
  - _Open._ `launchSession` works out the name (`launchName`) before the record, passes it to
    `startArgv`, and hands the task to `openFloorSession`, which resolves it under the store lock
    and writes `task-named` beside `opened` at the same instant. The window is placed after both are
    written, so it is labelled for the task from its first moment.
  - _Rename._ `ward session task` writes the event, then runs the name refresh (0061) over the
    workspace's hosts when the session's latest launch was hosted; the window keeps its pane.
  - _Resume._ `resumeSession` asks `Naming.harness` of the record as it stands and passes it to
    `resumeArgv`; the bulk resume goes through it unchanged, and placement labels the new window
    from the same record.
  - _Long names._ A slug is cut at a whole word within 24 characters, as before, so a task label is
    at most `f<N>t<room>` plus 24 columns — `f12t99 obsidian-brain-refresh` is 29. In tmux's default
    status line a window reads `<index>:<label><flag>`; a host whose windows do not fit is tmux's
    own list to scroll, and Ward does not shorten labels to fit it.
