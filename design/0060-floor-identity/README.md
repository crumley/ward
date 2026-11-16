# 0060 — Floor identity: a color and an emoji, worn by the floor's host

> Every floor's record carries a color, by name from a ten-color palette, and one emoji: assigned
> when the floor opens, changed with `ward project identity`, backfilled by the upgrade. The floor's
> host wears them on its status line, and every listing of floors shows them.
>
> **Status:** built — awaiting review · **Started:** 2026-11-15

Detached hosting ([0031](../0031-detached-session-hosting/README.md)) gave each floor a tmux host of
its own, and a human who works several floors keeps several of them attached side by side.
[0061](../0061-host-names-and-titles/README.md) named each host for its floor, but every one still
has the same status line in the same color, the coordinator's window stands in all of them, and
tmux's default left edge cuts the new, longer name off after ten cells. Telling floors apart is the
first thing the eye is asked to do and the surface gives it nothing to do it with.

The [visual-theming](../../intent/02-subsystems/05-visual-theming.md) seam names what is missing, an
identity recorded on the work and painted on every surface, and 0031 left the floor host and its
windows as the hooks that seam would decorate. This entry realizes the seam for one concept, the
floor, on the surfaces a floor has today: its host, and the listings. 0061 left a place for a
floor's emoji in its titles and labels; this entry is what fills it.

## Serves intent

- [`visual-theming`](../../intent/02-subsystems/05-visual-theming.md): a stable identity recorded on
  the floor at creation, collision-free among the open floors while the palette lasts, nameable in
  words, and applied by an idempotent step that a re-run converges. The seam's glyph is categorical
  where this entry's emoji is per-floor; that friction is [IF-001](intent-feedback.md).
- [`session-multiplexer`](../../intent/02-subsystems/01-session-multiplexer.md): the host stays a
  cache over the record. The theme is derived from the floor's record at every hosted launch and
  attach, nothing finds a host by it, and a host that loses it is dressed again.
- [`domain-model`](../../intent/01-concepts/00-domain-model.md): the identity is a judgment stored
  at the container, not derived from its children, and it rides the project record.
- [`workspace-lifecycle`](../../intent/01-concepts/06-workspace-lifecycle.md): an existing workspace
  gains the field through the upgrade's convergence, in its one journal commit.
- [`human-shell`](../../intent/02-subsystems/07-human-shell.md): the same cue in `status`,
  `project list`, and the host, and the same fact in `--json` for an agent to resolve "the blue
  one".

## Scope

- **In:**
  - `color` and `emoji` on the project record, both optional in the schema so older records stay
    valid; a color is one of ten palette names, an emoji is exactly one emoji.
  - Assignment at `ward project open`, and for the ground floor at creation, clear of what the
    floors that are not closed already wear.
  - `ward project identity FLOOR [--color NAME] [--emoji EMOJI]`, which writes what is named,
    reports which open floors share the color, and dresses the floor's standing host. With neither
    flag it writes nothing and only dresses the host.
  - A convergence step, `floor identities`, that gives every open floor lacking one its identity. It
    runs at create and at `ward workspace upgrade`.
  - The theme on the floor host: status line background in the floor's color with the ink that reads
    on it, and `<emoji> f<N> <slug>` in full at its left edge. A host is born wearing it, and 0061's
    refresh of names, which already runs at every hosted launch and every attach, dresses every
    standing host of the workspace in the same pass. Attach views and observe views wear it too.
  - The floor's emoji in the terminal titles and cross-floor window labels 0061 builds, filled from
    the record.
  - The identity in `ward status` and `ward project list`, human and `--json`, and in
    `project open --json`; `ward schema project identity`.
  - One bullet in the workspace manifest, with the outgoing default added to its lineage.
- **Deferred:**
  - **Pane borders and the current-window style.** Both are tmux window options, and a window linked
    into several hosts (the coordinator) has one value for all of them, so setting them would paint
    the coordinator in one floor's color everywhere. They can be made per-host by setting a format
    that reads a session option on every window, including windows a human adds; that is more reach
    into the human's windows than a status line needs. Safe to defer because the status line already
    carries the color and the name, and a hosted agent's window is a single pane, which draws no
    border at all.
  - **Other surfaces** (an editor window, terminal tab color, a task's own accent). The record now
    holds what they would read. Safe to defer because nothing painted here has to move when they
    arrive.
  - **A doctor finding for an undressed host.** Safe to defer because the next open, resume, or
    attach dresses it, and the verb does so on demand.
  - **A switch to turn the theme off.** The options are set on Ward's own hosts only. Safe to defer
    because a human who wants their own status line there can ask for the switch, and until then
    nothing outside a floor host is changed.
  - **Refreshing an observe view that is already open** when the identity changes. It is dressed
    when it is made and is gone when its one client leaves. Safe to defer because the next observe
    is right. (Since built, with the views' names and titles, by
    [0063](../0063-views-follow-their-host/README.md).)
- **Acceptance:**
  1. `test/theme/palette.test.ts`: every palette pair holds a WCAG contrast of 4.5:1 or more, uses a
     fixed xterm color (16 to 255), and has a distinct single-code-point emoji.
  2. `test/workspace/floor-identity.test.ts`: assignment's table; distinct identities at open; the
     verb's change, no-op, shared-color, and refusal cases; the backfill writes open floors in floor
     order, skips closed ones, never touches an identity already present, and commits once.
  3. `test/host/tmux.test.ts`: the theme is five `set-option` calls on one exactly-named session
     with no global, server, window, or pane flag; a host's attach views are found by session group
     and view stamp, never by name.
  4. `test/host/tmux-live.test.ts`, against a real tmux on a private server: a new host wears its
     floor; two hosts sharing the coordinator's window differ; the server's global options and a
     human's own session are unchanged; the verb re-dresses a standing host and the view an attached
     client is looking through, and that client is sent the new color; a host stripped of its theme
     is dressed by the next open and the next attach; observe dresses its view and not the host.
  5. `test/cli/floor-identity.test.ts`: the listings and their `--json`, the painted swatch under
     color and the bare word for a declared agent, the verb's report and schema.
  6. `mise run check` passes.

## Design

- **Decisions:** rests on [ADR 0006](../decisions/0006-tmux-detached-host.md) (tmux as the detached
  host). Entry-local:
  - **A color is a name from a closed palette, not a hex value.** Free hex was attractive because it
    never runs out and a human can match a brand or an editor theme. It lost on three counts: a name
    is what a human says and an agent resolves, which the seam asks for; a closed set can be checked
    for legibility once, in a test, where free hex needs a contrast computation at every write and
    still admits ugly pairs; and a hex value has no word. The cost is ten colors: the eleventh open
    floor shares one.
  - **Swatches are fixed xterm-256 indices, each painted as a background under its own ink.** The
    sixteen ANSI names were attractive because every terminal has them. They lost because a terminal
    theme redefines them, so "blue" has no fixed contrast against anything. Indices 16 to 255 are
    the same color under a light theme and a dark one, and painting the swatch as a background with
    a chosen ink over it means the pair never depends on the terminal's own foreground or
    background. The cost is that a terminal without 256 colors shows tmux's nearest approximation.
  - **The identity is recorded, and assigned by a deterministic rule.** Hashing the floor number was
    attractive because it needs no record field and no backfill. It lost for the reason the seam
    gives: a pure function cannot avoid what is visible together, and the record is what lets a
    human change it. The rule is the least-worn color in palette order, then that color's own emoji
    unless a floor already wears it, in which case the first palette emoji no floor wears. The cost
    is a schema field and a convergence step.
  - **Collisions are counted among floors that are not closed.** Counting every floor ever opened
    would keep history's colors stable and exhaust the palette in ten floors. A closed floor has no
    host and drops off the listings, so its color is free. The cost: a closed floor reopened by hand
    may share a color.
  - **A human may choose a color another open floor wears.** Refusing was attractive because it
    keeps the collision-free property absolute. It lost because past ten floors a collision is
    unavoidable anyway and the human is the one looking at them; the verb records it and names who
    it is shared with.
  - **The emoji is free, the color is not.** Any single emoji is accepted, because it sits beside a
    label and has no legibility to protect. The ten the palette offers are single code points from
    Unicode 6, so every font has them and tmux measures them two cells wide; an emoji with a
    variation selector or a joiner may be measured wrongly by a terminal, and that is the chooser's
    trade.
  - **One verb, `ward project identity`, that also dresses the host.** A separate verb to re-dress
    was considered. It lost because the two are one intention, and running the verb with no flag is
    already the re-dress.
  - **Existing hosts are dressed by 0061's refresh, never re-created.** Hosts are in use while Ward
    is upgraded. A separate pass that themes hosts was built first, and worked; it lost to riding
    the refresh that already walks every host of the workspace at each hosted launch and each
    attach, because one pass with one ownership rule is less to keep right than two. The options are
    set again each time, which is idempotent, so a host from before this entry converges at
    whichever comes first, and the verb runs the same refresh on demand. The cost is a few more tmux
    calls per launch. The upgrade itself does not touch tmux: it is a store operation, and its
    convergence commit should not depend on what a multiplexer answers.
  - **The theme replaces `status-left`.** Appending to the human's own `status-left` was considered,
    to keep what they configured. It lost because the default shows the host's name there and the
    floor's label says the same thing better. `status-right` and every other option are left as the
    human has them.
- **Layout:**
  - `src/theme/palette.ts` is a leaf: the names, the swatches, and the emoji test. The record
    schema, the assignment, the CLI's swatch, and the tmux adapter all read it, so what is recorded
    and what is painted cannot drift.
  - `src/workspace/floor-identity.ts` owns assignment, the verb, and the backfill.
  - The host seam (`src/host/host.ts`) carries a `GroupIdentity` (a palette name, an emoji, a label)
    beside a group's name and title, and on a view; `rename` dresses the groups it is handed and
    answers with what it dressed. No tmux styling crosses the seam; how a color becomes a status
    line is `src/host/tmux.ts`'s alone.
  - `src/agent/naming.ts` reads each floor's color and emoji from its record into 0061's floor
    identity, and turns that into the `GroupIdentity` (`f<N> <slug>` is the label). A record that
    will not read leaves the floor with its number and slug, so a color is never why a launch stops.
- **Mechanisms:**
  - **The theme** is five session options on one tmux session, targeted by exact name:
    `status-style`, `status-left`, `status-left-length` (the label's width, capped at 48), and two
    stamps, `@ward_color` and `@ward_emoji`, that say what it wears to anything that asks. Never
    `-g`, never the server. Because they are session options, the coordinator's one window shows
    under each host's own theme.
  - **Who wears a floor's theme:** the tmux session stamped with the workspace and the floor, and
    every attach view of it. An attach view is a session grouped with its host, so it is found by
    `session_group` and its `@ward_view` stamp, never by its name. An observe view is not in the
    group and is dressed once, when it is made.
  - **A failed theme never fails a launch.** Placement and view creation ignore a theme call that
    errors; the verb reports `themed`, `absent`, or `unknown` with the reason.
  - **Record order.** `color` and `emoji` are last in the project shape, so the backfill appends two
    lines to a record and changes no other.
