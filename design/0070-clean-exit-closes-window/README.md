# 0070 — A clean exit closes its window

> A hosted run that exits 0 closes its own window; only a run that fails or is killed keeps one,
> dead, to say how it ended. Ward sets tmux's `remain-on-exit failed` where it set `on`.
>
> **Status:** built — awaiting review · **Started:** 2026-11-17

[0031](../0031-detached-session-hosting/README.md) kept every hosted run's window after the run
ended, so that the host, and not a shim inside the run, could say how it ended. It named the cost as
it took it: "a dead window lingers in its floor host (and, for the coordinator, in every floor host)
until a re-create or a close clears it." In use the cost is paid almost entirely by the case that
has nothing to say. An agent a human leaves the ordinary way exits 0 — measured below, for every
ordinary way of leaving both harnesses — and its window then stands, dead, in the status line of
every host that shows it, reading `exited 0`. A floor tended for a week collects them. The windows
that carry information, a run that died of an error or a signal, look the same from the status line
and are lost among the ones that do not.

This entry keeps the retained exit for the runs it informs and gives it up for the rest: the
window's rule becomes tmux's `remain-on-exit failed`. It supersedes one clause of one 0031 decision
— "the host, not a shim, keeps the exit legible", where that decision keeps the window of **every**
ended run — and nothing else of 0031: the host still keeps the exit and no shim is added, the
liveness vocabulary keeps its four words, and resume, attach, close, and doctor keep their shapes.
The one place the change leans on a reading of intent is recorded in
[`intent-feedback.md`](intent-feedback.md).

## Serves intent

- [`session-multiplexer`](../../intent/02-subsystems/01-session-multiplexer.md) — the live host is a
  cache over the record: what a clean exit leaves behind is the open record, which is all that was
  ever needed to run the session again, and the host stops holding a pane that caches nothing.
- [`sessions-and-lifecycle`](../../intent/01-concepts/02-sessions-and-lifecycle.md) — open ≠
  running: a session whose run has exited is open with nothing attached, and a host showing no
  window for it now says exactly that.
- [`principles`](../../intent/00-foundation/01-principles.md) — §16, nothing about how a run ended
  is stored, so nothing stored changes; §20, a failure is still kept and still named, and "no
  window" is worded as the two things it can mean rather than as one of them.

## Scope

- **In:**
  - **The rule.** A session's window is created `remain-on-exit failed`. A run that exits 0 closes
    its window; a non-zero exit or a signal keeps the pane, dead, with `pane_dead_status` or
    `pane_dead_signal` readable, exactly as before.
  - **Standing windows.** The refresh that already runs on every hosted launch, attach, and identity
    change sets the rule on each of the workspace's own windows whose run is still going. A window
    already dead is not touched.
  - **A run over before it was linked.** Placing a floating window whose run has already exited
    cleanly no longer fails at the link into the other hosts.
  - **Wording.** Every message built from the liveness answer that a clean exit now reaches, listed
    under Mechanisms; the workspace manifest's Sessions section, with its lineage.
- **Deferred:**
  - **Telling a clean exit from a window that was ended.** Both read `gone`. Safe to defer — and
    possibly forever — because no decision turns on it: the record never stored how a run ended, an
    open session is resumed the same way from either, and the one consumer of the difference was a
    human reading `exited 0`, who learned from it only that there was nothing to learn. What is lost
    is named under Decisions.
  - **A harness whose ordinary way of leaving exits non-zero.** None was found (Mechanisms). If one
    appears, its window lingers as every window did before this entry, which is the safe direction;
    mapping that harness's status to "clean" would be a per-adapter fact, added then.
  - **The `key` and `failed-key` values** (tmux 3.7 and 3.8: keep the pane until a key is pressed).
    Above the version floor, and they answer a different question — a human at the pane — than the
    one a detached window poses. Safe to defer because nothing here forecloses them.
- **Acceptance:**
  1. `mise run check` → exit 0, on macOS and Linux.
  2. Tables (`test/host/tmux.test.ts`): the start argv sets `remain-on-exit failed` before the
     respawn; the rule's value sits at the version floor; the argv that brings a standing window to
     the rule.
  3. The refresh hands the host each window with whether its run is still going
     (`test/agent/naming.test.ts`, `test/agent/attach.test.ts`).
  4. Against a real tmux on a private server (`test/host/tmux-live.test.ts`):
     - a run that exits 0 on cue: its window is gone, its host and the other window in it stand, the
       session is open and reads `gone`, doctor reports it as information, observe refuses it, and a
       resume records no cause;
     - a run that exits 3, one killed with SIGKILL, and one with SIGTERM: each window kept, each
       read `exited` with its status or signal;
     - a coordinator whose run exits 0 before Ward links it into the other hosts (tmux held back at
       the link until the run has logged): the open exits 0, says the run left no window, offers
       resume and no join command; the host it made is gone and the other floor's is untouched;
     - the coordinator's clean exit: its window leaves every host, and the host that showed nothing
       else ends;
     - a clean exit of a host's last window under a client sitting in the host, one in an attach
       view, and an observer: the observer's terminal returns saying the run ended and the session
       is open, both participants are in a host still standing, and the server is up;
     - the same under a client switched into its view from inside tmux: it is back in its own
       session;
     - two windows set to `remain-on-exit on` by hand, one running and one already dead with status
       0: after the next open the running one reads `failed` and closes when its run exits 0; the
       dead one still reads `on`, still stands, and a resume clears it with its cause.

## Design

- **Decisions:**

  - **The rule is tmux's own, set where `on` was set — no shim, no hook, no reaper.** The
    alternatives each end the window from outside the pane's death. A `pane-died` hook that kills
    the window when `pane_dead_status` is 0 is attractive because it could run anything, including a
    note of the exit; it loses because it is a second mechanism racing the first — the window is
    dead and visible until the hook has run, and a hook set per window is one more thing a standing
    window from an older Ward would not have. Clearing dead-clean windows from the next Ward verb
    that happens to look is attractive for touching no tmux option at all; it loses outright, since
    it is hygiene ending something, on a schedule nobody can state. `remain-on-exit failed` is
    decided by the server in the same breath as the exit, needs nothing of Ward's to be running, and
    is one word in an argv that already existed. The cost: the definition of "failed" is tmux's — a
    non-zero status or any signal — and Ward does not get to refine it.
  - **No fallback and no new floor: the value arrived at the floor.** `failed` is listed under
    _CHANGES FROM 3.1c TO 3.2_ in tmux's `CHANGES` ("Add a value for remain-on-exit that only keeps
    the pane if the program failed"), and `options-table.c` reads `"off", "on", "failed"` at tag
    `3.2` where 3.1c has a plain flag. Ward already refuses anything below 3.2 for the observe
    client flags (0031). So there is no supported tmux that needs `on`, and a version check here
    would be a branch nothing can reach.
  - **`gone` now means two things, and says so.** Under `on`, no window meant the window or its host
    had been ended from outside — a reboot, a `kill-window`. Now it also means the run exited
    cleanly. Keeping them apart was possible — a fifth state fed by a marker the pane writes on its
    way out, or by a `pane-exited` hook — and attractive because 0031's layered liveness prizes not
    collapsing answers. It loses because the distinction has no consumer: resume proceeds over both
    the same way, attach re-creates both the same way, close is a no-op over both, and doctor's
    remedy is the same line. What was collapsed in 0031's sense was "could not determine" into "not
    running", which stays separate. The costs, named: `ward session show` can no longer say
    `exited 0`; a `resumed` event after a clean exit carries no cause, where it used to carry
    `previous run exited 0`; and a window ended by hand is worded as possibly a clean exit. Every
    message that reads `gone` therefore names both readings rather than asserting one.
  - **Standing windows are brought to the rule, and only while their run is going.** Leaving windows
    an older Ward made as they are was attractive: it changes nothing under a run in flight, and the
    old rule dies out as sessions are resumed. It loses because the windows that live longest are
    the ones the change is for — a coordinator can run for weeks — and until each is next resumed
    the workspace would hold two exit behaviours with nothing on screen saying which window has
    which. The refresh already visits every verified window of the workspace on each hosted launch
    and attach, so the rule rides on the call that relabels the window. A dead window is excluded by
    the Ward side, from the same inventory read: it was kept under the rule it died by, and nothing
    makes it vanish but the resume or close that always did. The cost: one fact more crosses the
    seam (whether a window's run is still going), and a window made by an older Ward changes
    behaviour without having been asked — by the next open or attach anywhere in the workspace.
  - **A run already over is not a failed launch.** With every window kept, placement could assume
    the window it had just started still existed when it linked a floating one into the other hosts.
    A run that exits 0 at once now takes the window with it, and the link fails. Treating that as
    "the agent did not start" was the path of no change, and is wrong: the run started and finished.
    Placement stops linking and reports what it placed; the open's one read a beat later says
    `gone`. The cost: a link that fails for this one reason — tmux no longer knows the window — is
    passed over, on the strength of tmux's wording for it.
  - **Recorded as a new entry.** A build-log addition to 0031 was the lighter choice and is how
    0031's follow-ups landed; those completed or repaired what 0031 decided. This reverses part of
    what it decided, for a reason that came from use, and the ledger's rule for that is a new entry
    with the earlier one pointing forward.

- **Layout:** no module moves. The rule is a constant of the tmux adapter beside the version floor.
  The seam gains one field — `RenameRequest.windows[].running` — because which windows are this
  workspace's own is the record-reading side's to say, and the adapter is handed finished lists; and
  the meaning of `FoundWindow.dead` narrows to "ended, and kept". Everything else is wording at the
  consumers.

- **Mechanisms:**
  - _What tmux does._ Measured on 3.7c, per window, the option set and then the pane respawned:
    `exit 0` → window gone; `exit 3` → pane kept, status 3; a command that cannot be executed →
    kept, status 126; SIGKILL, SIGTERM, SIGHUP, SIGINT → kept, signal readable. Setting `failed` on
    a window whose pane is already dead (status 0, kept under `on`) leaves it standing: tmux
    consults the option when the pane dies and not again. Setting it on a window whose run is going
    takes effect at that run's exit.
  - _What the harnesses return._ Measured on a private server, each run in a throwaway configuration
    directory with no working credential, idle at an empty prompt, the exit code written by the
    wrapper that started it. Claude Code 2.1.325: `/exit` → 0; Ctrl-C twice → 0; Ctrl-D twice → 0;
    SIGTERM → 143; SIGHUP → 129 (both ordinary exits with a status, so both kept). pi 1.4.0: `/quit`
    → 0; Ctrl-C twice → 0; Ctrl-D → 0. Not measured: leaving in the middle of a turn, and a run
    under a signed-in account with a human's own hooks.
  - _When the closing window is the host's last._ Nothing new happens: tmux ends the host as it does
    when `ward session close` ends the last window, and 0031 phase 3 and its follow-ups already
    decide where each client goes — a participant to a session still standing, an observer back to
    the shell by its view's hook, a view whose client attached ended by Ward once the client has
    left. The difference is only that no Ward verb is running when it happens, which none of those
    mechanisms needed.
  - _The messages a clean exit now reaches._
    - `ward session show` / `locate`:
      `not running (no tmux window, floor N — it exited cleanly, or its window was ended)`.
    - `ward session open --detach` and `resume --detach`, when the one read a beat after placement
      finds no window: the run "has already ended and left no window — it exited cleanly, or its
      window was ended", with `ward session resume ID`, and without the join command (the host may
      have gone with the window). Under `--json` the `live` block reads `gone`.
    - `ward session observe`, to an observer whose window went with the record still open: "session
      ID's run ended — the window you were watching is gone, and the session is still open", with
      attach and close. It used to say the session ended, which a clean exit makes plainly wrong.
    - `ward session observe` refused: `is not running (it has no window)`.
    - `ward session attach`, when the run it re-created is not there a moment later:
      `was re-created, then left no window`.
    - doctor: the gone finding gains the other way on — "if it is done, close it" — since gone is
      now where every finished conversation rests; the kept-window finding says the session's _run_
      exited.
    - Unchanged in words, changed in when they apply: attach's "re-created session ID from its
      record (it was not running)", and resume's gate, which finds nothing to clear.
  - _The manifest._ The Sessions section gains one bullet — a clean exit closes the window, the
    session stays open, a failure is kept — and the liveness list is spelled out. The outgoing
    default's hash joins the lineage.
