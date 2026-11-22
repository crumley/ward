# 0086 — The coordinator stays home

> The coordinator's window lives in the ground floor's host alone, like every other window in its
> own floor's host, and is linked into no other. Floating, as
> [0031](../0031-detached-session-hosting/README.md) built it, is removed rather than made a
> setting.
>
> **Status:** built — awaiting review · **Started:** 2026-11-22

[0031](../0031-detached-session-hosting/README.md) gave each floor one tmux host, and then made one
exception to that grouping. A workspace-scope session that no other session started, the
coordinator, **floats**: its window lives in the floor-0 host and is `link-window`ed into every
other floor host, so it is "a keystroke away wherever you stand". Placement, attach, doctor,
`resume --all`, the window list and the workspace manifest all carry that exception.

In use, the exception costs more than it returns. Every floor host shows a `coord` window that is
not that floor's, at its left edge, so a floor's own windows never start at the first slot. A
coordinator seen from two hosts at two terminal sizes is one window with one size, and the two
terminals take turns resizing it. A floor host whose own sessions have all ended is kept alive by
tmux for the link alone. Attach repairs missing links, and doctor reports them. And the thing
floating made reachable is already reachable without it: `ward session attach` from inside tmux
switches the human's own client to a view of whichever host holds the window
([0031](../0031-detached-session-hosting/README.md) phase 3), and bare `wsa`
([0059](../0059-session-shorthands/README.md)) attaches to the coordinator from any shell. The
keystroke floating saved is one command.

This entry removes floating. The coordinator is placed by the same rule as everything else: its
placement floor is 0, so its window stands in the floor-0 host (`<workspace>-f0-workspace`) and
nowhere else, on open, attach, resume and `resume --all`.

**0031 is superseded in part.** The floating rule ("The coordinator floats", in its Design), the
links made at host creation and at a floating window's creation, attach's repair of a missing link,
and doctor's missing-link finding are superseded here. 0031's placement, ownership, views, close and
hygiene stand.

## Serves intent

- [`session-multiplexer`](../../intent/02-subsystems/01-session-multiplexer.md): sessions are
  grouped by the work they belong to. The coordinator's work is the workspace, the ground floor's,
  so its window is grouped there and only there. The one exception to that grouping is gone.
- [`human-shell`](../../intent/02-subsystems/07-human-shell.md): the human reaches the coordinator
  by naming it (`wsa`), from wherever they stand, and does not have to see it in every host.
- [`principles`](../../intent/00-foundation/01-principles.md): **§6**, where a window lives is still
  a pure function of records, with one rule fewer.

## Scope

- **In:** placement links nothing (the `floats`/`floating` placement request, the host's `link`
  operation and its `link-window` argv are removed); attach no longer relinks; `resume --all` brings
  the coordinator back to floor 0's host alone; doctor drops the missing-link finding and names
  links an older Ward left; the workspace `AGENTS.md` template; `ward session resume --all
  --json`
  renames its `floats` field to `coordinator`.
- **Deferred:**
  - _A setting to float the coordinator again._ Safe to defer because nothing else depends on
    floating, and putting it back would be a new entry that restores a known mechanism. A setting
    now would keep every floating code path, and its tests, alive for a behavior nobody has asked to
    keep.
  - _Unlinking an older Ward's links automatically._ Safe to defer because such a link is harmless
    (the window and its run are the coordinator's own), goes away by itself when the coordinator's
    run next ends, and doctor names each one with the command that takes it out. See **Decisions**.
- **Acceptance:**
  1. A coordinator opened while several floor hosts stand appears in the floor-0 host only, and a
     floor host minted afterwards does not hold it. Closing a floor's last session lets tmux end
     that host, which no link keeps alive (`test/host/tmux-live.test.ts`; the
     `coordinator-stays-home` conformance scenario, `test/host/tmux-scenarios.ts`).
  2. From a shell window inside floor 1's host, `ward session attach <coordinator>` (what `wsa`
     runs) switches the client to a view of the floor-0 host and links nothing
     (`test/host/tmux-live.test.ts`).
  3. Attach, re-create and `resume --all --go` place the coordinator in the floor-0 host alone
     (`test/agent/attach.test.ts`, `test/agent/resume-all.test.ts`, `test/host/tmux-live.test.ts`).
  4. A coordinator window an older Ward linked into another floor's host is joined through its own
     host and left linked. Doctor reports it as information with
     `tmux unlink-window -t
     =<host>:<window>` for each such host, and that command takes it out
     of the one host while the run goes on (`test/agent/host-findings.test.ts`,
     `test/host/tmux-live.test.ts`).
  5. `mise run check` passes.

## Design

- **Decisions:** no ADR. Entry-local choices:
  - **Removed, not a setting.** A configuration key (`agent.float` in `config.md`, overridable in
    `workspace.md`) was the obvious alternative. It would keep floating for anyone who wants it. It
    lost because a setting keeps all of floating's cost (the placement request's float fields, the
    host's link operation, attach's relink, two doctor findings, the sizing caveat in the manifest)
    for a behavior with no remaining defender, and doubles the cases every hosting test must
    consider. The cost of removing it is that a human who wanted the coordinator in every host now
    runs `wsa` instead.
  - **An older Ward's links age out; doctor names them.** The alternative was to unlink, at the next
    open or attach, every window shown in a floor host other than its own. That would leave every
    host clean right away. It lost because it is a migration that has to stay in the code forever,
    needs a new host operation (`unlink-window`) on the hot path, and acts on the human's tmux
    without being asked. Hygiene only reports
    ([`session-multiplexer`](../../intent/02-subsystems/01-session-multiplexer.md): teardown only by
    a session's deliberate close). A link costs nothing to leave in place. It goes when the
    coordinator's run ends, and the next run is placed in floor 0's host alone. Doctor's finding
    carries the exact `unlink-window` for anyone who wants it gone sooner. The cost is that, on a
    machine upgraded with the coordinator running, the old `coord` window keeps showing in each
    floor host until then.
  - **`floats` becomes `coordinator` in `resume --all --json`.** The field said whether a row was
    the coordinator, which `resume --all` still brings back first. Keeping the name would leave a
    field whose name describes something that no longer happens. Renaming it changes a published
    shape (`ward schema session resume`), so a consumer reading `floats` sees it missing. No shipped
    consumer reads it: the shell shorthands read candidate feeds, never this document.
  - **`wsa 0` is left as [0079](../0079-wsa-floor-first-window/README.md) made it.** `wsa 0` means
    floor 0's own session (`ward session open --floor 0`), not the coordinator, which bare `wsa`
    reaches. With the coordinator open and no floor-0 session open, `wsa 0` opens a floor-0 session
    detached and joins it. That session lands in the same host as the coordinator, so the human ends
    up one window away from it either way.
- **Layout:** the record side (`src/agent/placement.ts`) keeps one question about the coordinator,
  `isCoordinator(record)`, which replaces `floats(record)`. It decides only what bare `wsa` offers,
  what the window is called (`coord`), and that `resume --all` brings it back first. The host seam
  (`src/host/host.ts`) loses `PlaceRequest.floats`/`floating`, `Placement.linkedInto` and `link()`,
  and gains `unlinkCommand(window, group)`. That is a remedy string for doctor, like `closeCommand`
  and `endGroupCommand`, and nothing runs it. A found window still lists every group it stands in,
  so a link made by an older Ward is read as it stands.
- **Mechanisms:**
  - _Placement._ The tmux host finds or mints the floor's host by its stamps, creates the run's
    window, and clears the placeholder the host was born holding. Nothing else is linked in.
    `createGroupArgv` now prints only `#{window_id}`, since the placeholder's index was only ever
    used to put a floating window in its slot. Every transcript that creates a host was re-recorded
    on tmux 3.8.
  - _Doctor._ For each open, live, verified window: when it stands in its placement floor's host and
    also in other floor hosts of this workspace, an info finding names those hosts, says the links
    go when the run ends, and gives one `unlink-window` per host. When it stands only elsewhere, the
    existing misplaced finding applies. A floor host whose every window lives in another host (an
    older link alone) gets the idle-host finding, with `kill-session` as the human's option, which
    only unlinks.
  - _Names and titles._ Unchanged in code. Ordinals already tell windows apart per placement floor
    (`distinguish`), and a terminal's title already names the host's floor. With nothing linked, the
    coordinator's window is titled `coord · <workspace> f0` everywhere it is seen.
  - _`wsa`._ Its body is unchanged, so installed copies do not read as changed. Bare `wsa` reads the
    coordinator feed and runs `ward session attach ID`. From inside another floor's host that attach
    takes the switch-client path to a view of the floor-0 host.
  - _The manifest._ The workspace `AGENTS.md` template's "The coordinator floats" bullet becomes
    "The coordinator stays home". The relink sentence and the sizing example that named the
    coordinator seen from two hosts are rewritten. The outgoing template hash moves into the lineage
    (`src/workspace/lineage.ts`), so `ward workspace upgrade` brings an untouched manifest forward.
