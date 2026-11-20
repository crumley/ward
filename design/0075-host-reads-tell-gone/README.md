# 0075 — The tmux host tells a gone window, and ends a failed attach view

> Three answers of the tmux host that its scripted tests showed to be wrong
> ([0073](../0073-scripted-tmux-runner/README.md)) are put right: a window that has gone reads
> absent, an attach view that cannot be made is ended, and a window with no run pane says so.
>
> **Status:** built — awaiting review · **Started:** 2026-11-19

The scripted-runner recordings ([0073](../0073-scripted-tmux-runner/README.md), _What the recordings
showed_) pinned two behaviours of `tmuxHost()` as they stood, and one of its fault cases pinned a
third, a refusal's wording. Each contradicts what the host already promises: closing a window tmux
no longer holds is never an error, a view that could not be made leaves nothing behind for doctor to
call leftover, and a refusal says why. This entry changes the behaviour and the scenarios that
pinned it; the seam and its outcomes are unchanged.

## Serves intent

- [`session-multiplexer`](../../intent/02-subsystems/01-session-multiplexer.md) — a window that is
  gone reads as absent rather than as someone else's, and teardown of a failed view ends only the
  session that very call made.
- [`principles`](../../intent/00-foundation/01-principles.md) — §20, degrade honestly: a refusal
  names what is actually missing.

## Scope

- **In:**
  - **A gone window reads absent.** The tag reads behind `close` and `typeLine` ask tmux for
    `#{window_id}` beside the tags; an empty id is a window tmux no longer holds. `close` reports
    `absent` (it reported `refused`, "carries no session tag"), and `typeLine` reports `absent` (it
    reported `withheld`).
  - **A failed attach view is ended.** The attach view's `new-session` prints its session id
    (`-P -F '#{session_id}'`); when the `select-window` after it fails, Ward ends that session by
    id, as the observe path already ends its own view. A name another session holds
    (`duplicate session`) makes no session and ends none.
  - **A window with its tag and no run pane** is withheld as "window @N carries 'S' but names no
    pane for its run", in place of "carries 'S', not 'S'".
- **Deferred:**
  - **The dispatch nudge's Enter race**, and **the switch-client view's exposure** to the server
    fault [0031](../0031-detached-session-hosting/README.md)'s follow-ups fixed for attach views.
    Each is a separate behaviour with its own risk; neither is touched by these reads, so nothing
    here makes either worse.
- **Acceptance:**
  1. `mise run check` → exit 0.
  2. Scenarios `close-a-window`, `typing-a-line` and `views` assert the corrected outcomes on a real
     tmux (`test/host/tmux-conformance-live.test.ts`) and from their transcripts
     (`test/host/tmux-scripted.test.ts`); the fault case for a tag with no pane asserts the new
     wording.

## Design

- **Decisions:**
  - **Ask for the window's id, rather than check that the window exists first.** A separate
    `list-windows` or `has-session` call before the read was the obvious alternative; it lost
    because it leaves the same race one call earlier and costs a call. The id in the same format is
    read in the same instant as the tag, so a gone window can never pass for an untagged one. The
    cost: each read's format grows by one field, and the transcripts were re-recorded.
  - **End the failed view by the id it printed, not by its name.** Ending `=<name>` was the observe
    path's precedent and needs no new flag; it lost because a refused `new-session` (a duplicate
    name) made nothing, and a name is the one thing another client may hold. An id is printed only
    by a session this call made, and is never handed out twice
    ([`endViewArgv`](../../src/host/tmux.ts)'s reasoning). The cost: three more words in the attach
    view's argv.
- **Layout:** none this entry — all three changes are inside `src/host/tmux.ts`.
- **Mechanisms:** the read on a gone window answers exit 0 with every field empty (measured on tmux
  3.8; 0073 recorded the same on 3.7c, 3.6 and 3.8). The `can't find window` test on the tag read
  stays for a tmux that refuses the read instead; the fault case that covers it is kept.
