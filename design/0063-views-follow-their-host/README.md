# 0063 — Views follow their host

> A view a client is looking through is brought up to date with its host — renamed after it, given
> its title, dressed as its floor — in place, by the same refresh that renames the host. And what a
> foreground harness will and will not do with a title is measured and recorded.
>
> **Status:** built — awaiting review · **Started:** 2026-11-15

Host names and titles ([0061](../0061-host-names-and-titles/README.md)) and floor identity
([0060](../0060-floor-identity/README.md)) both refresh what already stands, and both stopped at the
view. 0061 renamed and titled the floor host and deferred "a view that is already attached", on the
reasoning that a view lives only as long as its one client and is seen by nobody but `tmux ls`. 0060
dressed a host's attach views but set no title on them, and deferred an open observe view
altogether.

Applied to hosts that had been running for days, that reasoning turned out backwards. A terminal
left attached is exactly the view that outlives an upgrade, and it is the one surface the human is
looking at: after the refresh the floor hosts read `main-f7-ward-development` and carried their
title, while the three terminals actually open sat in views still named `ward-main-f7-v1`, with
tmux's default title, wearing the floor's color and nothing else. A view made between the two
entries had a title with no emoji, and kept it — an identity changed after a view is made reached
the host's title and not the view's. The two symptoms are one gap: a view's name and title were
written once, when it was made.

This entry closes the gap inside the refresh 0061 already runs. It supersedes two deferrals — 0061's
"renaming a view that is already attached" and 0060's "refreshing an observe view that is already
open" — and nothing else of either entry.

## Serves intent

- [`session-multiplexer`](../../intent/02-subsystems/01-session-multiplexer.md) — the label that
  lets a human find the right session at a glance now holds on the terminal they are sitting in, not
  only on the host behind it.
- [`visual-theming`](../../intent/02-subsystems/05-visual-theming.md) — a floor's mark reaches every
  standing surface that names the floor when the mark changes, the view's title included.
- [`principles`](../../intent/00-foundation/01-principles.md) — §16, a view's name and title are
  derived again on every refresh rather than trusted from the day it was made; §18, bringing one up
  to date ends, re-creates, and moves nothing; §20, a view that cannot be renamed is reported and
  passed over.

## Scope

- **In:**
  - **Views in the refresh.** Every refresh of the workspace's hosts (a hosted launch, an attach, a
    change of floor identity) also takes each standing view of each host: renames it to
    `<host>-v<n>` / `<host>-o<n>` for the host's current name when it is not already so named, sets
    its `set-titles` and `set-titles-string`, and dresses it — attach views and observe views alike,
    with their clients attached.
  - **One title.** A view's title is its host's — the same standing text, emoji included — with
    `(observing)` kept in an observe view, whenever the view was made.
  - **Finding views.** By `@ward_view` stamp and by what tmux says the view shows: its session group
    for an attach view, its one window for an observe view. Never by name.
  - **What the host reports.** The inventory says which group an attach view looks at; the rename
    answer lists the views renamed; attach prints them beside the hosts.
  - **Foreground titles: a finding, no code.** See Decisions.
- **Deferred:**
  - **Naming the foreground session to the harness.** A supported flag exists and was measured; it
    is not used, for the reasons under Decisions. Safe to defer because nothing depends on it and
    adopting it later is one argument on a foreground launch.
  - **A view of a host that is gone.** A view whose host cannot be told — an observe view whose
    window no longer stands in any host of the workspace — is left as it is. Safe to defer because
    doctor already names a leftover view and the command that ends it, and such a view has nothing
    current to be named after.
- **Acceptance:**
  1. `mise run check` → exit 0.
  2. Tables: the host an attach view looks at, from session group and stamps
     (`test/host/tmux.test.ts`); which views stand over which host, including a floating window's
     observe view and views that are not this workspace's (`test/agent/naming.test.ts`); whether a
     name is already derived from a host.
  3. The refresh hands a host's views to `rename` and reports the ones renamed
     (`test/agent/naming.test.ts`).
  4. Against a real tmux on a private server (`test/host/tmux-live.test.ts`): an attach view and an
     observe view, each with a client on a pty, renamed to an older naming with their title options
     unset; one refresh later both wear names derived from their hosts, the attach view's title
     string equals its host's, each client receives the new title (the observer's with its mark),
     each client's pid is still on its view, and the server's global `set-titles` is untouched. A
     derived name another tmux session already wears is stepped over.
  5. By hand, once, with views made by the released code before 0061 (main at `50c38dd`), then main
     at 0060 to reproduce the stale state, then this entry — recorded in the build log.

## Design

- **Decisions:**

  - **The view is renamed, not left to die.** Leaving the name stale and fixing only the title was
    attractive: the name is seen in `tmux ls` alone, and a rename is one more thing that can fail.
    It loses because a host's views are how a human reads who is attached where, and three views
    named for a host that no longer exists read as leftovers of something else — which is how they
    were first noticed. The cost: a view's number can change under it, when the name it would keep
    is taken.
  - **A name is read to decide whether it is due, and for nothing else.** Renaming every view on
    every refresh needs no test at all, and loses because the smallest free number is not stable —
    two views would trade names on alternate refreshes. So a view keeps a name already of the form
    `<current host>-v<n>`; anything else is renamed to the smallest free one. What a view _is_, and
    whose, still comes only from its stamp and from what it shows.
  - **The Ward side says which views stand over which host; the host says what each view shows.**
    0060 had the tmux adapter discover a host's attach views by itself, inside `rename`. Extending
    that to observe views is where it stops working: an observe view shares no session group, only a
    window, and the coordinator's window stands in every host — telling which host such a view
    belongs to needs the session's placement, which is the record's. So the inventory reports the
    one tmux fact (the group an attach view is grouped with), the Ward side joins it with placement,
    and `rename` is handed each host's views by name. The cost: the adapter's own view discovery
    from 0060 is removed, and a caller that hands `rename` no views dresses none.
  - **An observe view is refreshed too, though observe still renames nothing.** 0060 left an open
    observe view alone as "gone when its client leaves". It is included because the reasoning is the
    one that failed for attach views, and because a view is Ward's own object: bringing it up to
    date disturbs the run it watches no more than making it did. `ward session observe` itself still
    issues no refresh.
  - **Foreground: Ward's label is not pushed into the harness.** 0061 measured that Claude Code
    replaces a foreground title as it starts and declined to set
    `CLAUDE_CODE_DISABLE_TERMINAL_TITLE`. Measured again here, on a pty, against Claude Code
    2.1.325, looking for a supported lever:
    - `claude --name <text>` is one: documented, and "shown in the prompt box, /resume picker, and
      terminal title". With it the title is `✳ <text>` from the first moment — and stays exactly
      that while the agent works. Without it the title goes from `✳ Claude Code` to a line about the
      work (`✳ Single word reply`) within seconds of the first prompt.
    - The name is stored with the conversation: resuming that session with no flag titles the
      terminal `✳ <text>` again.
    - A settings key, `terminalTitleFromRename: false`, keeps the generated topic line and ignores
      the name. There is no prefix, suffix, or template: the title is the name or the topic, never
      both.

    So a supported lever exists, and using it was attractive — `✳ f7 ward-development · main` on a
    foreground tab, with no private switch. It loses on the reason 0061 gave for the switch, which
    this does not escape: it trades the live line for a static one. And it loses on a cost the
    switch did not have — the name travels with the conversation, so the same session resumed in a
    host would set its pane title to the static label, and the hosted title, the one place both
    appear today, would read `coord · 🌊 main f0 · ✳ coord · main`: Ward's words twice and the work
    not at all. Passing the settings key on hosted runs to undo that is a second lever to carry for
    the first. The cost of declining: a foreground tab under Claude Code still names the work and
    not the workspace or floor, as 0061 left it.

- **Layout:** no module moves. The seam gains one fact in each direction — `InventoryGroup.viewHost`
  (what an attach view is grouped with) and `RenameRequest.groups[].views` (the views to bring after
  a group) — and `Renamed.views`. `standingViews` in `src/agent/naming.ts` is the join; the adapter
  keeps only what is tmux's: reading `session_group`, the `-v`/`-o` derivation, and the calls.

- **Mechanisms:**
  - _Which host a view stands over._ A view is this workspace's by `@ward_view`. Attach: the member
    of its tmux session group that carries floor stamps and no view stamp. Observe: a host showing
    the view's one tagged window — where several do, the host on the floor the window's session is
    placed on, which is the host observe was pointed at; failing that, the first. tmux keeps a
    session group's name from the day the group was made, so the group is matched and never parsed.
  - _Bringing a view up to date._ After its host is renamed, titled, and dressed:
    `rename-session -t '=<view>' <host>-<v|o><n>` when due, then the title options with the view's
    mode, then the theme. Each is a session-scoped call on the view; a client attached to it stays
    attached, and tmux repaints its title and status line itself. A view that ended between the
    inventory and the call is skipped.
  - _Reporting._ `refreshNames` lists renamed views after renamed hosts, and a floor's dressed names
    are its host, then its views by the names they wear now.
