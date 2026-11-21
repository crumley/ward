# 0076 — The tmux host's two remaining races: the nudge's Enter, and the switched view

> The hand-off nudge's submitting key is sent by tmux itself, behind a check of the screen made in
> the same command, and no Ward view is ever left to tmux's `destroy-unattached` to end — so a view
> switched into from inside tmux can no longer take the server down with it.
>
> **Status:** built — awaiting review · **Started:** 2026-11-19

Two races in the tmux host were known and left open. The first is the nudge's
([0067](../0067-floor-dispatch/README.md)): `typeLine` read the screen back on Ward's side, saw the
typed line alone on the input line, and then started a second tmux client to send Enter. A question
that appeared in between took the Enter as its answer — Yes at a permission question, "No, exit" at
the trust question (measured on Claude Code 2.1.325 in 0067). The second is the switched view's:
tmux through 3.7c destroys a `destroy-unattached` session under a client that was told to detach and
has not yet gone, and the server dies of it. The follow-ups to
[0031](../0031-detached-session-hosting/README.md) took that option off a view whose client
attaches; the view joined with `switch-client` — an attach run from inside tmux — still set it at
join, and so did Ward's own end of an attach view, in case tmux had moved another client into it.

## Serves intent

- [`session-multiplexer`](../../intent/02-subsystems/01-session-multiplexer.md) — a view is
  transient and ends with its client, and nothing Ward does to end one can end the server, and every
  host and run on it, instead.
- [`messaging-coordination`](../../intent/02-subsystems/02-messaging-coordination.md) — live
  delivery stays the optimization it is: a notice is submitted only where a typed line is a message,
  and the window in which it could be taken as an answer shrinks to what no sender outside the
  harness can close.

## Scope

- **In:**
  - **The submitting key is guarded inside tmux.** `submitArgv` is one `if-shell -F` command: its
    format is true while the pane is in no mode and the rows the input line's reading rested on
    still read as they did; when it holds, `send-keys Enter` runs behind it, and it prints
    `submitted` or `held`. A held key is tried again over a fresh reading while the line still reads
    alone, within the same 2 s wait as the read-back; otherwise the line is reported `unknown` ("its
    screen changed before the line could be submitted"), never submitted, and no key is sent to
    whatever took the screen.
  - **The harness reader says where the line is.** `HarnessAdapter.inputLine` (and so
    `TypeRequest.inputLine`) answers `{ text, rows }`: the text as before, and the screen rows the
    reading rests on. For Claude Code that is the upper rule to the last status row beneath the
    lower one — every row the reader looked at, and nothing of the transcript above, which scrolls
    while a turn runs.
  - **No view is ever `destroy-unattached`.** Every view carries a `client-detached` hook that ends
    it, once a client that was in it has gone, if nobody is left in it; Ward's own end of an attach
    view is the same check and `kill-session` by id, as one tmux command. Every view is marked
    `@ward_joined` as its client joins.
  - **A view left by switching away is swept.** tmux runs no hook of the view's when its client
    switches to another session, so the next view made in the workspace (`ward session attach` or
    `observe`) first ends every view of the workspace that was joined and has nobody in it, each by
    the same guarded `kill-session`.
- **Deferred:**
  - **The harness's own latency.** A harness that has decided to ask a question and has not yet
    drawn it, or has drawn it and tmux has not yet read it, still looks like an input line to any
    sender outside it. Safe to defer because no arrangement of tmux calls can see it: the residue is
    stated below, measured where it could be, and every other part of the guarantee holds.
  - **A view left by switching away, between sweeps.** It stands empty until the next view is made
    in the workspace, and `ward doctor` reports it as a leftover view with the command that ends it.
    Safe to defer because it holds no client, ends nothing when it ends, and is no hazard to the
    server: it is never `destroy-unattached`.
- **Acceptance:**
  1. `mise run check` → exit 0.
  2. Scenario `a-question-before-the-key`: a stand-in draws a question over its input line at the
     instant before the host's submitting call; `typeLine` reports `unknown` and the stand-in is
     handed no line. With the key sent unguarded (the check replaced by `1`) the same scenario
     reports `typed` — the question took the Enter.
  3. Scenario `typing-a-line` types and submits a line holding every character special to a regular
     expression or a tmux format; scenario `views` shows the sweep ending a joined, empty view and
     leaving a not-yet-joined one and another workspace's.
  4. `test/host/tmux-live.test.ts`, "a view switched into from inside tmux ends once its client has
     left": the view is not `destroy-unattached`; a client switched away leaves it to the next view,
     which ends it; a client held stopped while it is told to detach and other clients disconnect
     leaves the server standing, and the hook ends the view once it has gone. On tmux 3.7c, with the
     old join (`destroy-unattached on`), this case fails with "server exited unexpectedly".
  5. Fast tier: `submitArgv`, `screenHolds`, `rowPattern`, `endViewArgv`, `endLeftViewArgv`,
     `parseLeftViews` pinned in `test/host/tmux.test.ts`; the held, retried and timed-out keys and
     the sweep as fault cases in `test/host/tmux-scripted.test.ts`; the reader's rows in
     `test/agent/input-line.test.ts`.

## Design

- **Decisions:**
  - **Check and key in one tmux command, rather than a tighter loop on Ward's side.** The gap was
    one tmux client round trip (spawn, connect, parse) plus Ward's own parse of the capture:
    measured at 2.5 ms median, 2.6 ms at the 90th percentile, for a single `tmux` client on an idle
    laptop, and larger under load. Polling faster narrows nothing: whatever Ward reads, the key
    still leaves in a later client. `if-shell -F` evaluates its format and, when it holds, inserts
    the `send-keys` directly behind itself in the same command queue (`cmd-if-shell.c`), and tmux
    runs a queue to its end before its event loop reads from any pane again (`cmdq_next` in
    `cmd-queue.c`). So no output of the run can be parsed between the check and the key. The cost:
    the check must be a format, which cannot run the adapter's reader, so the reader has to say
    which rows it rested on (next decision).
  - **Re-check the rows the reading rested on, not re-run the rule.** The rule (`claudeInputLine`)
    cannot be written as a tmux format: it finds the last two rules on the screen and inspects what
    lies between and beneath them. What a format can say is "this row still reads exactly this, at
    this place": `#{C/r:^…$}` answers the first visible row a regular expression matches. So Ward
    runs the full rule on its side, as before, and tmux checks at the key that every non-blank row
    the rule looked at is unchanged — the rules, the line, the status beneath. A screen that passes
    is, in every non-blank row the rule read, the screen the rule passed; what it cannot see is a
    blank row turning into text (below, under _What remains_). The alternative — checking only that
    the prompt row still holds the typed text — was cheaper and lost because a question drawn
    beneath an intact line would pass it. The cost: a status row that changes (a timer, a hint)
    holds the key back until a fresh reading, at one poll's delay.
  - **Hook plus sweep, rather than `destroy-unattached` set later.** The fault is in tmux's
    unattached-session check, which destroys a session without first moving the clients that still
    point into it; `kill-session` takes the other path, which moves them first. So the fix is never
    to let that check end a view: views end only by `kill-session`. A hook covers every way a client
    leaves by going (a detach, a closed terminal) and runs once the client is gone. Leaving by
    switching to another session runs hooks in the session switched TO, never the view's, and a
    global hook on a human's server is not Ward's to set — so that case is swept at the next view
    instead. Making Ward's `ward session attach` wait in the pane it was run from, as the outside
    attach does, was the other candidate; it lost because it would hold that pane busy for as long
    as the human is in the view. Leaving everything to `ward doctor` lost because every switched
    attach would then leave a session behind for a human to end. The cost: one more `list-sessions`
    on every attach and observe, and a view left by switching away stands until the next one.
  - **Every end is guarded by "nobody is in it", in the same command.** A view tmux has moved a
    client into since (it moves clients into views when a host ends) must not be ended under that
    client; the old `destroy-unattached` "held on" for it, and the guard does the same: the hook
    runs again when that client goes. For the sweep the guard also requires `@ward_joined`, so a
    view another Ward has just made and not yet joined is never ended.
- **Layout:** none moved. `InputLine` is the harness seam's type (`src/harness/adapter.ts`), and the
  host's `TypeRequest` takes it; the checks are argv builders in `src/host/tmux.ts` beside the calls
  they guard.
- **Mechanisms:**
  - **A row as a pattern.** Each character special to a POSIX extended regular expression is
    escaped; a run of four or more of the same character is counted as a group, `(─){40}`, so a
    multi-byte character repeats whole in any server locale and a wide pane's rule stays short (runs
    are split at 255, macOS's `RE_DUP_MAX`). Then `#`, `,` and `}` are escaped for the format. A row
    seen twice is checked by where it was first seen, a pattern tmux cannot compile matches nothing,
    and an empty set of rows is `0`: every failure of the check holds the key back.
  - **The screen tmux searches is the one capture prints.** `window_pane_search` reads the visible
    screen row by row, trailing blanks trimmed, as `capture-pane -p` prints it. Measured on Claude
    Code 2.1.325 in a 100×30 pane: every non-blank row of its screen (banner block glyphs, `⚠`, `▎`,
    `⏵⏵`, `◐`, rules, a typed notice wrapped onto two rows) answered `#{C/r:^…$}` at the row the
    capture had it on — 14 of 14 rows at an empty prompt, 15 of 15 with the notice typed. And
    `typeLine` itself typed and submitted a notice to that real REPL (a scratch configuration with a
    dummy key, on a private server), the guard holding.
  - **The sweep** lists `#{session_id}`, `#{@ward_view}`, `#{@ward_joined}` and
    `#{session_attached}`, and ends each view of this workspace that is joined and empty with
    `if-shell -F -t '$N:' '<empty and joined>' "kill-session -t '$N'"` — quoted, since tmux reads a
    bare `$N` in a command string as a variable.

## What was measured, and what remains

**The server fault.** Reproduced on tmux 3.7c (Homebrew, macOS) with a pane producing output: a
`destroy-unattached` view, its client stopped (SIGSTOP), `detach-client -s` on the view, then
SIGCONT — the server died 4 of 4 runs, switched or attached alike; without the option it stood. The
reproduction without pane output did not crash: the freed session is touched by a redraw. tmux 3.8
(the pinned build) did not crash in 3 of 3 runs, and its source shows why: `server_check_unattached`
now calls `server_destroy_session` before `session_destroy`. The fix here still matters: CI's
nightly runs the native tmux (3.6 on Ubuntu), and users run what their system ships. With the fix,
the same sequence on 3.7c left the server standing, and a guarded `kill-session` of a view whose
client was mid-detach did too.

**The Enter.** What remains is the run's own latency, which no sender outside the harness can see:

- output the harness has written to its terminal that tmux has not yet read when the check runs —
  normally well under a millisecond, as tmux reads a pane whenever its event loop turns, and longer
  only when the tmux server itself is starved; and
- a question the harness has decided to ask and not yet drawn — its own render latency.

Not measured: either of these on Claude Code. For the key to be taken as an answer, a question would
have to be decided, and not yet visible to tmux, at the instant of the check; before this entry it
had a full client round trip (about 2.5 ms on an idle laptop) after the read-back as well.

**Blank rows are not checked.** A format can say a row reads exactly some text; it cannot say a row
is still blank (the first blank row on the screen answers every such question). So something drawn
into rows that were blank beneath the status area, with the rules, the line and the status left
exactly in place, would pass the check where the rule would have refused it. Claude Code draws a
question in place of its input box (0067's measurements), which changes the checked rows; a harness
that appended one beneath an intact box would not be caught here.

**A weaker check of a repeated row.** A row that reads the same as one above it is known by where
the first stands. Claude Code echoes a submitted message into its transcript as `❯ <text>`, so a
second notice with exactly the same text as one already on the screen would have its prompt row
checked through the transcript's copy. The other rows of the reading — the rules' place, the status
beneath — are still checked, and a notice names its task, so two identical notices on one screen
mean the same task handed over twice.

## Intent feedback

None this entry.
