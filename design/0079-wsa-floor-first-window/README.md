# 0079 — `wsa N` joins the floor's first window, without a picker

> `wsa N` never asks which of a floor's sessions to join: the floor's candidate feed lists them in
> the order their windows stand in the floor's host, and `wsa N` takes the first.
>
> **Status:** built — awaiting review · **Started:** 2026-11-22

[0059](../0059-session-shorthands/README.md) gave `wsa N` the same shape as bare `wsa`: one open
session is joined, several are a pick. For the coordinator that pick chooses something real. For a
floor it doesn't. Every one of a floor's sessions stands in the floor's one host
([0031](../0031-detached-session-hosting/README.md)), so the terminal lands in the same host
whichever is picked, with every window there, and the pick only decides which window is in front. A
floor that keeps several sessions open (the ground floor often holds three) costs a picker step on
every `wsa N`, and the step buys nothing the human can't get from the host's own window keys.

This entry drops the pick for a floor. The shell can't see the host, so the order has to come from
Ward: the floor's candidate feed now lists its sessions first window first, and `wsa N` joins the
top line.

**0059 is not superseded as a whole.** Two of its affordances are, here: the pick `wsa N` offered
between several floor sessions, and the oldest-first order of
`ward shell candidates coordinators
--floor N`. Bare `wsa` keeps its pick between several
coordinators, and the coordinator feed keeps its order.

## Serves intent

- [`human-shell`](../../intent/02-subsystems/07-human-shell.md): a noun the human would only have to
  confirm is filled in by Ward instead of asked for. A picker that can't change where the human
  lands is a step the layer shouldn't take.
- [`principles`](../../intent/00-foundation/01-principles.md): **§6**, the order is deterministic
  from what the record and the host say; **§20**, a host that can't be asked degrades to the
  record's own order, never to an empty feed.

## Scope

- **In:** the floor feed's order; `wsa N` taking the first line; the tmux host reporting where a
  window stands in each host that shows it (`#{window_index}` on its pane listing).
- **Deferred:**
  - _A pick for `wsa N` when the human wants a specific window._ Safe to defer: `wsa ID` still names
    any session, and inside the host every window is one key away.
  - _Ordering the coordinator feed by window._ Safe to defer: bare `wsa`'s pick is between sessions
    that float into every host, so window position doesn't describe a real difference between them.
- **Acceptance:**
  1. With several floor sessions hosted, `ward shell candidates coordinators --floor N` lists those
     whose window stands in floor N's host (live, or kept dead) by window index, then the rest by
     session number. A window in another floor's host, or one from an earlier launch, doesn't count.
     With no window standing, or a host that can't answer, the order is by session number. A floor
     of foreground sessions never asks the host. The coordinator feed keeps the order its sessions
     were opened in (`test/cli/shell-floor-order.test.ts`).
  2. `wsa N` with several open joins the first line, picker installed or not, and reads the feed
     once. One open, or none open, behaves as 0059 states (`test/cli/shell.test.ts`).
  3. The window index reaches each found group from a real tmux (`test/host/tmux.test.ts` for the
     parse; the conformance transcripts re-recorded on tmux 3.8). `mise run check` passes.

## Design

- **Decisions:** no ADR. Entry-local choices:
  - **The order lives in the feed, not in the shell.** The alternative was to keep the feed as it
    was and teach `wsa` to read each candidate's window through `ward session show --json`. That
    would keep the feed's contract untouched. It lost because fish has no JSON parser (0059's reason
    for re-reading the feed rather than parsing an open's output) and because it would cost a
    process per candidate. The cost of the choice made is that the floor feed now asks tmux once per
    hosted session.
  - **First means the floor's own sessions, not the coordinator.** The coordinator floats in at the
    left edge of every host, so "the first window" read literally would usually be the coordinator,
    which bare `wsa` already reaches. `wsa N` means floor N's own session, so first is the earliest
    of those.
  - **A window kept dead counts as standing.** A failed run's window stays where it was
    ([0070](../0070-clean-exit-closes-window/README.md)), and `attach` re-runs the session in it.
    Leaving it out would let a session further right win only because its neighbour failed.
  - **Session number, not opened time, when nothing stands.** After a reboot, before
    `ward session resume --all --go`, no window stands and `attach` re-creates whichever is named.
    The lowest number is the floor's longest-standing session, and it can be read off the id itself.
    Numbers compare as numbers, so `f7-10` comes after `f7-9`.
- **Layout:** `FoundGroup` gains an optional `index`, filled from tmux's `#{window_index}`, appended
  as the last field of the pane listing so every reader before it splits the same fields. The order
  is decided in `src/shell/candidates.ts`, which reuses `classify` (`src/agent/host.ts`) to tell a
  session's own window from a stale one, the same rule `ward session show` uses.
- **Mechanisms:** for each open floor-N session whose latest launch was hosted, `find` its window,
  keep it only if `classify` calls it the session's own, and read its index in the group stamped
  with this workspace and floor N. Sort: indexed sessions by index, then the rest by session number.
  `wsa N` takes `$open[1]` whenever a floor was given. With no session open it still opens one
  detached and re-reads the feed first.
