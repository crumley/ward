# agent-term — <https://github.com/albertwujj/agent-term>

**Session model in four sentences.** AgentTerm is an Electron terminal that hosts CLI coding agents,
where one OS window _is_ one session — no tabs, no daemon, no multiplexer, and nothing that outlives
the window. Its durable half is an append-only JSONL event log folded by id, and its live half is a
per-window `active/<id>.json` carrying pid, boot stamp, and compositor stamp, so liveness is stored
and then re-derived on every read. What it calls "resume" takes over a past record's identity in a
fresh window and then drives the agent's own TUI — typing the CLI name into a shell, swallowing the
user's next Enter, and sending `/resume` — because it never learns the harness's conversation id.
Its real contribution to this entry is not detachment (it has none) but a three-tier residency model
— visible, hidden-but-alive, dead-in-log — with automatic demotion under a window cap and automatic
promotion when the agent produces output.

**Vitals.** JavaScript; Electron + xterm.js (WebGL) + node-pty + esbuild; MIT. Created 2026-07-21,
last pushed 2026-08-24, 146 commits, 3 stars, ~29k lines under `src/`. Daily-driven by its author,
so the session machinery below is shipped and load-bearing — but `spec.md` and `progress.md` are
stale phase-1/2 planning docs, and `README.md` runs ahead of the code in places. Everything below
was read in `src/`. One feature (post-reboot recovery) is fully built and tested but has no caller.

## The session model, condensed

- **Process model.** No daemon, no multiplexer, no pty broker: grep finds no `tmux`/`dtach` anywhere
  in `src/`. The Electron main process spawns one PTY per window (`src/main.js:1871` `createPty`)
  running the user's login shell, or `wsl.exe` on Windows (`src/main.js:1551`). The agent CLI is
  _not_ spawned by the app — it is typed into that shell as a command line
  (`ptyProcess.write(launch + '\r')`, `src/main.js:2289`), and which agent is running is _inferred_
  by pattern-matching shell command lines (`detectCli`, `src/main.js:1182`). Claude Code, Codex,
  Copilot, and Cursor's CLI are all handled this way. The parent chain is Electron → shell → agent,
  and killing the window kills all of it.
- **Session promotion is implicit.** A window is not a session until its first prompt is captured;
  that promotion assigns the id and hue, writes the active file, and appends the `started`/`cli`/
  `title` events (`assignSessionIdentity`, `src/main.js:1033`, and the comment at
  `src/main.js:1005`). A window where nobody typed anything leaves no record at all.
- **Detach/attach: neither exists.** The nearest analogue is a visible-window cap of ten
  (`MAX_VISIBLE`, `src/window-cap.js:22`). Over the cap, the stalest non-working window is hidden
  from the taskbar via `setSkipTaskbar` — "the window stays alive (CLI + PTY + scrollback intact)"
  (`src/window-cap.js:5`, `pickEvictionVictim:56`). Bringing one back is a JSON control file dropped
  at `cap-control/<id>.json`, which the addressed window picks up through its own `fs.watch` and
  consumes before dispatching (`sendControl`/`startCapControlWatcher`, `src/window-cap.js:108-152`;
  caller at `src/main.js:2344`). Cross-process control with no socket and no daemon.
- **Read-only observe is remote and not read-only.** Local observation has no grain of its own. The
  remote path is a push client that POSTs session frames to a self-hosted relay
  (`src/stream/client.js`), whose phone viewer both renders the live terminal _and_ submits prompts
  and voice transcripts back (`onInputs`/`onVoiceInputs`, `src/stream/client.js:69`).
- **Foreground↔background is movable, automatic, and defaults to foreground.** There is no "start in
  the background." Demotion is involuntary (the cap), and promotion is too: a hidden window that
  sees PTY output pops itself back into the taskbar without stealing focus (`src/main.js:1927`). A
  hidden window with no user input and no agent output for four hours quits itself — "the session
  record stays in the log so the user can still resume from the picker" (`checkIdleClose`,
  `src/main.js:1410`; `IDLE_CLOSE_MS`, `src/window-cap.js:29`).
- **State model.** Durable is `<userData>/sessions.jsonl`, append-only NDJSON folded by id at read
  time (`src/sessions-log.js:1-33`, `listSessions:130`); events are `started`, `cli`, `title`,
  `prompt`, `branches`, `token`, `closed`. The fold encodes identity semantics explicitly: `prompt`
  is FIRST-wins (the session's identity), `lastPrompt` LAST-wins (recency), `title` LAST-wins
  (`src/sessions-log.js:148-171`). Live is `active/<id>.json`: pid, bootTime, guiSession, token,
  `hiddenAt`, and three activity timestamps (`src/sessions-log.js:193-204`), written at promotion
  and deleted on close.
- **Record→live mapping is stored, then validated by derivation.** `isSessionActive` requires the
  same boot, the same compositor session, and a live pid (`src/sessions-log.js:268`). The boot stamp
  is `now − uptime` rounded to the minute (`src/sessions-log.js:50`), so a reboot invalidates every
  active file at once without touching them. Nothing live survives it; the log does, minus anything
  older than four weeks, dropped by startup compaction (`compactSessionsLog`,
  `src/sessions-log.js:358`).
- **Identity, naming, listing.** The id is a monotonically incremented integer from a counter file
  (`readAndIncrementCounter`, `src/main.js:414`). There is no name: a session shows as its verbatim
  first prompt, a hue stripe, and the CLI's own OSC title (`src/sessions-picker.js:543`). Finding
  one is search, not hierarchy — the picker filters prompts and titles, and a deeper streaming pass
  searches every prompt event ever typed (`searchHiddenPromptMatches`, `src/sessions-log.js:482`;
  driver at `src/main.js:2190`). A second identifier, `AGENT_SESSION_ID` (four random bytes,
  `src/main.js:3274`), is injected into the PTY environment (`src/main.js:1891`) and bridged into
  WSL via `WSLENV` (`:1896`); sibling tools address the session by it, and it is deliberately
  inherited across resume (`:1212`), backfilled with a `token` event for records that predate it.
- **Lifecycle: open and close only.** Both the window's X button and `exit` in the shell funnel into
  the same idempotent `writeClosedSessionEvent`, which deletes the active file and appends `closed`
  (`src/main.js:1534`, called at `:1812` and `:1956`). PTY exit writes `closed` and quits the app
  (`src/main.js:1946`). There is no state meaning "open but not running" — exit _is_ close.
- **Resume is a driven TUI, not a flag.** Picking a past row makes the new window take over that
  record's identity — id, hue, prompt, token, active file — so "this window IS that session"
  (`resumeFromSession`, `src/main.js:1190`; `picker-pick`, `src/main.js:2271`). Then it types the
  CLI name into the shell and arms `pendingResumeIntercept`, so the user's next plain Enter is
  swallowed and replaced by a `/resume` submission into the agent's own picker
  (`src/main.js:2008-2022`), while an overlay tells them what to type into that picker's filter:
  "Press Enter to send `/resume` → filter for the prompt above, or try `<title>`"
  (`src/resume-hint.js:1-29`, markup at `:220`). The code is candid about why: "User-as-timing-
  signal is reliable in a way that no programmatic 'CLI ready' signal is" (`src/main.js:2282`).
  `scripts/copilot-resume-probe.js` tried "several submit-shape variants against Copilot" to find
  one that opens its session picker — they hunted for a programmatic hook and settled for the TUI.
- **Resume while live is refused in the UI.** Visible-active rows are rendered disabled
  (`src/sessions-picker.js:480`, `:640`); hidden-active rows stay clickable but "bring forward"
  instead of resuming (`src/sessions-picker.js:502`, `:558`).
- **Failure handling is automatic and never asks.** `gcActiveFiles` sweeps on app start and before
  the relaunch check (`src/sessions-log.js:292`). Two scars are documented in the source. First, the
  boot-stamp tolerance (`src/sessions-log.js:54-71`): Windows derives uptime from a counter that
  does not advance across sleep, so strict equality "read live Windows windows as dead… gc deleted
  their records, and a user close saw zero visible sessions and relaunched even with other windows
  on screen" — fixed with a five-minute tolerance plus a 30-second restamp heartbeat. Second,
  `src/gui-session.js`: a macOS WindowServer crash destroys every window while the Electron process
  survives, leaving "no window, no dock icon, no way for the user to reach it — while its active
  file still advertises the session," so the picker showed it active-and-disabled forever. The fix
  stamps WindowServer's pid and start time; a changed stamp makes the orphan write `closed` and exit
  (`src/main.js:1427`). Where no stamp exists, "unknown never reaps."
- **The recovery surface is built and dark.** `pending-recovery.json` snapshots, after a reboot,
  every session with `started`+`cli`+`prompt`, no `closed`, and no live window, so a picker can
  auto-offer them (`src/sessions-log.js:22-28`, `initPendingRecoveryIfNeeded:325`,
  `autoRecoveryList:376`). It is exported and unit-tested (`test/sessions-log.test.js:290`) and grep
  finds no caller outside `sessions-log.js` and that test.

## Takeaways for ward

1. **Give the live half a generation stamp, not just a deterministic name.** 0031 maps record to
   live through `ward-<workspace>-<session-id>`; a name alone can be satisfied by a stale or
   recycled tmux session. AgentTerm pairs the stored pid with a boot stamp _and_ a compositor stamp
   and re-derives liveness on every read (`src/sessions-log.js:268`). Record when the live half was
   created and treat a mismatched generation as gone, not found.
2. **Split "is it live?" from "may I delete the bookkeeping?"** `isSessionActive` and
   `isSessionReapable` are deliberately different predicates, the second demanding positive evidence
   of death (`src/sessions-log.js:279-290`), because a wrong reap makes a live session invisible to
   every other consumer. This confirms 0031's "doctor surfaces stray live sessions but never kills
   them" and extends it one level down: even ward's internal cleanup of a live pointer should
   require evidence, not the absence of proof.
3. **Store the harness handle at open — this repo shows the price of not having it.** AgentTerm
   never captures Claude Code's conversation id, so resume degrades to typing `/resume` and handing
   the human a search string (`src/main.js:2008`, `src/resume-hint.js`). Ward's
   `--handle claude:<session-id>` convention is exactly the missing piece, and 0031's "attach
   re-creates from the record via harness-native resume" only holds if that handle is captured at
   open and treated as record-critical. Strongest confirmation of a ward choice in this subject.
4. **Adopt a middle residency tier between attached and closed.** Visible → hidden-but-alive →
   dead-in-log (`src/window-cap.js:1-16`) is what makes many concurrent agents survivable. tmux
   gives ward tier two for free, but 0031 currently has no vocabulary for "running and not costing
   you attention." Naming that state changes what `ward session list` should show.
5. **Bound the background tier, and say so in the record.** Hidden + idle for four hours quits the
   window, and the log keeps it resumable (`src/main.js:1410`). 0031 should decide whether a
   detached tmux session lives forever; if it may be reaped for resource reasons, the record must
   already carry everything needed to re-create it, which is the same invariant as takeaway 3.
6. **Auto-surface on agent output is what makes background hosting usable.** A hidden window that
   produces output pops back into view without stealing focus (`src/main.js:1927`). Ward's `observe`
   is human-initiated; a cheap equivalent is a doctor/status line that flags which detached sessions
   have produced output since you last attached.
7. **A control-file channel is enough to reach a live session.** Ward already has a filesystem store
   and a lock; a `cap-control/<id>.json`-shaped drop (`src/window-cap.js:108-152`), consumed before
   its handler runs, would let `ward session attach`/`close` signal a running agent without
   introducing a daemon or socket to 0031.
8. **Keep the agent-facing session token stable across attach.** `AGENT_SESSION_ID` is injected into
   the PTY environment and explicitly inherited on resume so sibling tools keep addressing the same
   session (`src/main.js:1891`, `:1212`); the `WSLENV` bridge at `:1896` is the same problem in
   another tunnel. 0031 must guarantee `WARD_AGENT` survives detach/attach and reaches every shell
   tmux spawns under the pane, not just the first one.
9. **Make fold semantics explicit per field.** The log distinguishes first-wins identity from
   last-wins recency in commented code (`src/sessions-log.js:148-171`). Ward's markdown records
   should be equally explicit about which front-matter fields are frozen at open and which track the
   latest, since attach reconstructs from the record alone.
10. **Listing scales by search, not hierarchy.** Sessions are found by the prompt that started them,
    with a deep pass over every prompt ever typed (`src/sessions-log.js:482`). Ward's
    `--purpose TEXT` is the first half; 0031's listing could cheaply carry a "last activity" line
    harvested from the live host so ten open sessions are distinguishable at a glance.
11. **Put the recovery surface on a startup path or it does not exist.** `pending-recovery.json` is
    complete, tested, and never called. 0031's doctor is the right home for the equivalent check;
    the lesson is that "surfaces stray sessions" must be wired into a command people already run.

## Conflicts with ward's posture

**Identity is discovered from the live stream, not declared into a record.** A window becomes a
session only when a prompt is captured (`src/main.js:1005`), and what identifies it afterwards is
scraped from the terminal — the typed prompt, the CLI's OSC title, the shell command line
(`src/main.js:1182`). Ward opens the record first and launches the agent from it. AgentTerm's way
buys zero ceremony — you just type — at the cost that an unprompted session leaves no trace and that
displayed identity drifts with whatever the CLI last emitted.

**Resume is a human gesture, deliberately.** Ward's record-as-truth wants a handle it can act on
unattended; agent-term gives up unattended resume outright and hands the user a filter string
(`src/main.js:2282`, `src/resume-hint.js`). What that trade buys is universality: it works against
any CLI with _some_ resume UI, including ones exposing no flags at all, which is why
`scripts/copilot-resume-probe.js` exists. Ward's narrower posture only works because it targets
harnesses whose resume it can name.

**Exit and close are the same event.** PTY exit writes `closed` and quits (`src/main.js:1946`), so
there is no "open but nothing running." 0031's distinction between exit and close is precisely what
makes detached hosting mean anything — and this repo is the counterexample worth citing: a tmux
session dying must _not_ write a close to ward's record, or ward collapses into agent-term's model.

**The durable record is itself a cache.** Startup compaction drops every event older than four weeks
(`src/sessions-log.js:358`), making the log a recency index rather than history. Ward's record is
git-tracked and permanent. The trade is bounded startup time bought by forgetting.

**Nothing detaches, and remote access is a push, not an attach.** Sessions are bound to a GUI
process on one machine's compositor, with the phone reached through a self-hosted relay
(`src/stream/client.js`). That buys a surface no pty seam can offer — taskbar previews,
click-to-IDE, inline review threads, commenting on selected output — and costs the exact thing 0031
exists for: closing the lid ends the session. It also has no read-only grain; its remote viewer
writes back (`src/stream/client.js:69`), where 0031 treats read-only `observe` as a distinct, safer
mode.
