# 0061 — Host names and terminal titles

> A floor host is named for its floor (`main-f7-ward-development`), a window for what its session is
> (`coord`, a floor's slug, `t33 host-names-and-titles`), and a terminal looking at either is given
> a title — all derived from the records, and brought up to date in place on hosts that already run.
>
> **Status:** built — awaiting review · **Started:** 2026-11-15 · **Partly superseded:** a task's
> window label, read relative to its host, by [0078](../0078-task-named-windows/README.md)

Detached hosting ([0031](../0031-detached-session-hosting/README.md)) named a floor host
`ward-<workspace>-f<N>` and a window by its session id, and left anything richer to a later arc. In
use the names answered the wrong question. `f7-1@mac` says a floor number, an ordinal, and a machine
— and a human who does not remember what floor 7 is learns nothing from the first, cannot say what
the second counts, and reads the third on every window of the machine. The coordinator, the one
window linked into every host, wore the longest name of all (`workspace-16@mac`), and its number
grows with every session the workspace has ever opened. Meanwhile the terminal itself said `ward`:
the foreground process of an attach is `ward session attach`, and nothing ever set a title.

0031 made this cheap to fix by deciding that hosts are found by stamps and windows by tags, never by
name. Names are presentation, so this entry changes what they say, and renames what is already
running, without touching a binding. The session shorthands
([0059](../0059-session-shorthands/README.md)) already took the id out of the human's hands on the
way in; this takes it off the screen once they are there.

**0031 is not superseded as a whole.** Two of its affordances are, here: the minted host name
(`ward-<workspace>-f<N>`, and with it the `ward-` prefix as a namespace), and the window's label
("its id by default").

## Serves intent

- [`session-multiplexer`](../../intent/02-subsystems/01-session-multiplexer.md) — the constraint to
  label sessions by identity so a human finds the right one at a glance: a window now says what its
  session is rather than which record it is. (What "identity" had to mean to be recognizable is
  [IF-001](intent-feedback.md).)
- [`visual-theming`](../../intent/02-subsystems/05-visual-theming.md) — one labelling module is
  where a floor's recorded mark joins every name that mentions the floor; this entry leaves the mark
  itself, and all color, to the entry that records it.
- [`human-shell`](../../intent/02-subsystems/07-human-shell.md) — the human is handed recognizable
  nouns (a slug, a room) instead of ids to decode, on the surfaces they actually look at: `tmux ls`,
  the window list, the terminal's tab.
- [`principles`](../../intent/00-foundation/01-principles.md) — §16, names are derived from the
  record on every use and stored nowhere, so a stale one is corrected rather than trusted; §18, a
  rename ends and re-creates nothing; §20, a name that cannot be applied is passed over and never
  stops a launch or an attach.

## Scope

- **In:**
  - **Host names.** `<workspace>-f<N>-<floor-slug>`, the slug cut to whole hyphen-words within 24
    characters; no slug when no project record stands on the floor. Views keep their derivation
    (`<host>-v<n>`, `<host>-o<n>`).
  - **Window names.** The coordinator is `coord`. A floor's own session is the floor's slug. A task
    session is `t<room> <slug>`. A window placed in _another_ floor's host by lineage carries its
    floor (`f5 <slug>`, `f5t2 <slug>`). A workspace-scope session another session started is the
    purpose it was given, cut to 24 characters, or `helper`. A legacy bare task is
    `legacy-t<room> <slug>`. Two open hosted sessions that would read the same in one host each take
    their id's ordinal (`coord 16`, `coord 17`).
  - **Terminal titles, hosted.** Every floor host and every view sets tmux `set-titles` and a
    `set-titles-string` on itself — session options, never the server's — reading
    `<window> · <workspace> f<N>`, with `(observing)` in an observe view, then `· <pane title>` when
    the run has set one.
  - **Terminal titles, foreground.** One OSC 2 escape, written to a terminal only, immediately
    before the harness takes it: `<label> · <workspace>`, the label spelled with its floor
    (`f7 ward-development · main`).
  - **Renaming in place.** Every launch into a host and every attach first brings every host and
    every verified window of the workspace to its current name and title. Nothing is created, moved,
    or ended. Observe changes nothing.
  - **Doctor.** A foreign host is recognized by its stamp; the `ward-` prefix is consulted only for
    unstamped tmux sessions, as the legacy name.
  - **The manifest.** The Detached sessions section teaches the names, the titles, and where a
    window's id is read; the outgoing default joins the lineage.
- **Deferred:**
  - **A floor's emoji and color, and the host's status bar.** `FloorIdentity` carries an optional
    `emoji` that the title and the cross-floor window label already place; reading it from a record
    and styling a status bar are the floor-identity entry's. Safe to defer because every name is
    complete without the mark, and adding it is one field filled in `floorIdentities`.
  - **Renaming a view that is already attached.** A view lives exactly as long as its one client,
    and its name is seen by nobody but `tmux ls`; a view made under an old host name keeps it, and
    its terminal stays untitled, until that client next attaches. Safe to defer because a view is
    found by `@ward_view`, the next attach from that terminal makes a new one, and the old one ends
    by itself. (The deferral did not hold in use; built by
    [0063](../0063-views-follow-their-host/README.md).)
  - **An explicit rename verb.** Safe to defer because the refresh rides the two acts that put a
    human in front of a host — nothing is looked at between a rename becoming due and the next open
    or attach except a detached host nobody is watching.
  - **Holding the title against a foreground harness.** Claude Code retitles its terminal as it
    starts (see Decisions). Safe to defer because what replaces Ward's title is the harness's own
    line about the work, not `ward`; holding it would mean running the harness under a pty of
    Ward's, which the foreground baseline exists to avoid.
- **Acceptance:**
  1. `mise run check` → exit 0.
  2. Label tables: every scope's window label on its own floor's host and on another's; host names
     with long, absent, and emoji-marked floors; duplicates told apart per host
     (`test/agent/labels.test.ts`, `test/agent/naming.test.ts`).
  3. Adapter tables: the title string, with a literal `#` escaped; rename and title argv exact-match
     and session-scoped (`test/host/tmux.test.ts`).
  4. Against a real tmux on a private server (`test/host/tmux-live.test.ts`): hosts and windows
     named as above while every window is still found by its tag; a client on a real pty receives
     `alpha · <workspace> f1`, then `… · working on it` once the pane sets a title, and
     `coord · <workspace> f0 (observing)` through an observe view; the server's global `set-titles`
     untouched.
  5. Same suite: a host and window renamed back to the old scheme are renamed in place by the next
     attach — the same pane id and process id before and after — and a second coordinator makes both
     read `coord 1`, `coord 2`.
  6. Attach on a fake host renames only groups stamped for this workspace and windows that verify
     (tag, epoch, stamp), and observe issues no rename (`test/agent/attach.test.ts`).

## Design

- **Decisions:** rests on [ADR 0006](../decisions/0006-tmux-detached-host.md) and on 0031's
  found-by-stamp and identified-by-tag decisions, which are what make every choice below reversible.

  - **The slug joins the number in the host's name; the `ward-` prefix leaves.** Keeping
    `ward-<workspace>-f<N>` and putting the slug only in a title was attractive: no host is renamed,
    and the prefix keeps marking Ward's hosts in `tmux ls`. It loses because `tmux ls` and the
    status bar are where a human picks a floor, and a number there is the thing they could not read.
    The prefix goes to pay for the slug's length: it was never a binding (the stamps are), nothing
    destructive ever keyed on it, and `main-f7-ward-development` already reads as what it is. The
    cost: a human's own tmux session can now share a shape with a host's name — which the mint-time
    refusal of a name held by an unstamped session already covers — and doctor's foreign-host
    finding had to move to the stamp.
  - **The slug is cut, at a word.** An uncut slug is honest and needs no rule; it loses because the
    name is read in a status bar and typed after `tmux attach -t`, and one long project slug would
    crowd both. Twenty-four characters holds a three- or four-word slug whole. The cost: two floors
    whose slugs share their first 24 characters differ only by number in the host name — the number
    is still there.
  - **A window says what its session is, relative to the host it stands in.** The alternative —
    always the full address and slug (`f7t33 host-names-and-titles`) — is uniform, and loses because
    in floor 7's host every window would begin with the same three characters, which is the id's
    machine suffix over again. So the floor is spelled only where it is news: on a window lineage
    placed in another floor's host. (Superseded for tasks by
    [0078](../0078-task-named-windows/README.md): a task's window is its full address in every host,
    because the address is what a command takes.) A floor's own session is the slug rather than the
    word "floor", because the window list is the one surface certain to be on screen, and there the
    slug answers what the number means.
  - **The purpose names a helper, and nothing else.** A purpose is the richest text a session has,
    and using it wherever one was given is attractive. It loses for coordinators, floor sessions,
    and task sessions because what they _are_ is already a short, stable noun and a purpose is a
    sentence; and because the harness's own pane title — which the terminal title carries — is the
    live version of the same information. A workspace-scope helper has no noun of its own, so its
    purpose is its name. The purpose Ward writes when none is given is recognized exactly and never
    used.
  - **Ordinals only on a collision.** Always suffixing the id's ordinal keeps the id one glance
    away, and loses because the ordinal is the part of the id that means nothing to a reader. A
    label is numbered only when another open hosted session in the same host would read the same;
    both then take their ordinals, and each is renamed by the refresh that follows the other's open
    or close. The cost: a window can change its name when a neighbor arrives. The id stays one
    command away — it is the window's `@ward_session` tag — and `ward status` lists every one.
  - **Titles are composed by tmux, from options on Ward's own tmux sessions.** Having Ward write the
    title itself from `attach` is simpler to reason about, and loses because the title must follow
    the current window as the human moves between windows, and must fold in a pane title that
    changes while the client is attached; only tmux sees both. `set-titles` and `set-titles-string`
    are session options, so they are set on each host and each view and never on the server, where a
    human's own sessions live. A grouped session shares its host's windows but not its options, so a
    view is titled for itself.
  - **The title leads with the window and names the floor by number.** Spelling the floor's slug in
    the title too is the fuller answer, and loses because a tab shows the head of a title: the
    window's name is the specific thing, the slug is already in it or in the host's name, and the
    harness's line is worth the remaining width. A pane that never set a title carries the machine's
    hostname, which is left out. (Revised: the floor's emoji now leads the title, ahead of the
    window, by [0064](../0064-floor-identity-palette/README.md).)
  - **A foreground run is titled once, and the harness may replace it.** Measured on a pty: Claude
    Code writes its own title (`✳ Claude Code`, then a line about the work) moments after it starts,
    replacing Ward's; `CLAUDE_CODE_DISABLE_TERMINAL_TITLE=1` stops it. Setting that variable for
    foreground runs would keep Ward's title on the tab, and loses because it trades a live
    description of the work for a static one, and reaches into one harness's private switch from the
    Ward-shaped half. So Ward titles the terminal for the stretch before the harness speaks and for
    any harness that never does. The cost: under Claude Code a foreground tab names the work but not
    the workspace or floor — the hosted path is where both appear.
  - **The refresh covers the whole workspace, and rides open and attach.** Renaming only the host
    being joined is narrower, and loses because the coordinator is linked into every host and a
    human moves between them with tmux's own keys: one stale host among fresh ones is worse than
    none. Each refresh is one inventory read plus one tmux call per host and per window. A name
    another tmux session already wears is left to it and the host keeps the name it has. The cost: a
    window a human renamed by hand is named back at the next open or attach — stated in the
    manifest.
  - **Observe renames nothing.** Observe's contract in 0031 is that watching disturbs nothing; a
    rename is visible to everyone on the host. It titles the view it creates, which is its own.

- **Layout:** the words are a third module beside the two halves 0031 drew. `src/agent/labels.ts` is
  pure — floor identity and session subject in, strings out — and is the single place a floor's mark
  can enter a name. `src/agent/naming.ts` is the record-reading side: it turns listings into
  subjects, tells duplicates apart, and runs the refresh. `src/host/` is handed finished names and
  one title fragment; it owns only what is tmux's — the safe alphabet, the format string around the
  fragment, and the rename calls — behind one new interface method (`rename`) and two new request
  fields. `src/agent/title.ts` is the caller's own terminal, which is no host's.

- **Mechanisms:**
  - _Floor identity._ `floorIdentities` reads number and slug from the `projects/<N>-<slug>/`
    directory names, so naming a host opens no record.
  - _Refresh._ Under the store lock on a launch, and before the first probe on an attach: read the
    host's inventory; take the groups stamped for this workspace that are not views, and the windows
    whose tag names an open hosted session, whose epoch is that session's latest launch, and that
    stand in such a group; hand both to `rename`. On a launch it runs before placement, so the join
    command printed names the host as it is now called.
  - _Rename, in tmux._ `rename-session -t '=<old>' <new>` when the name differs and is free, then
    `set-titles` / `set-titles-string` on it; `rename-window -t <window_id> <label>`. A failure is
    collected and returned, never thrown.
  - _The title string._ `#{window_name} · <standing>#{?<unset>,, · #{pane_title}}`, where
    `<standing>` is literal text with `#` doubled and `<unset>` is true for an empty pane title or
    one equal to `#{host}` or `#{host_short}`.
