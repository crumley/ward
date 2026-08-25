# dmux — <https://github.com/standardagents/dmux>

**Session model in four sentences.** dmux is not a session host so much as a _pane_ host: it opens
exactly one tmux session per project (named by a pure function of the project root), parks itself in
a control pane as an Ink sidebar, and treats every agent as an ordinary interactive CLI running in a
sibling pane beside a git worktree. It never detaches, never kills the session, and has no close
verb for it — detachment is plain `Ctrl+b d`, and quitting dmux exits only the TUI while every agent
keeps running. Its durable half is a **gitignored** `.dmux/dmux.config.json` that dmux writes on a
two-second cadence and treats as a wish list, reconciling it against tmux in _both_ directions
automatically: a recorded pane that vanished is silently recreated (agent resumed), and an
unrecognised tmux pane is silently adopted into the record. What makes it worth reading for 0031 is
the recovery path — dmux recovers a Claude conversation without any cooperation from Claude, by
walking the pane's process tree and reading the agent process's open file descriptors to find the
transcript it has open.

**Vitals.** TypeScript + Ink (React) on Node ≥18, tmux 3.0+, ~11k lines of `src/`. Created 2025-08,
~1,750 stars, 138 forks, ~747 commits, at v5.11.1 with the last push 2026-08-16 — a year of
continuous work, shipped on npm. Twelve agent CLIs in the registry. Almost everything below is live
code with tests; the one clearly aspirational piece is the browser-streaming path
(`src/services/TerminalStreamer.ts` + `src/shared/StreamProtocol.ts`), which is complete but wired
to nothing in this tree.

## The session model, condensed

- **Process model.** No daemon and no PTY broker: the tmux server is the parent of everything, and
  dmux is one more client of it. `dmux` run outside tmux probes `tmux has-session -t <name>` and
  either attaches or creates (`src/index.ts:280-341`); creation always goes through
  `tmux new-session -d` with dmux itself as the pane command, followed by `attach-session`
  (`src/utils/tmuxSessionStart.ts:15-52`) — so the session is born detached even on the path a user
  experiences as foreground. Agents launch as ordinary shell commands sent into a pane from a
  registry of twelve (`src/utils/agentLaunch.ts`, `AGENT_REGISTRY`). The only daemon in the project
  is a macOS focus/notification helper behind a Unix socket, explicitly progressive enhancement
  (`AGENTS.md:44-60`).
- **Detach/attach.** There is no detach code: `detach-client` and `kill-session` appear nowhere in
  `src/`. Re-entry is just running `dmux` again in the project. **No read-only observe exists**
  either — `attach-session -r` is never used. What stands in for observation is scraping:
  `tmux capture-pane -p -J -S -N` on a poll (`src/utils/paneCapture.ts`) feeds pane cards, an
  LLM-backed status analyser, and attention notifications. Observation-by-sampling, not by
  attachment.
- **Foreground↔background is a per-pane toggle, movable at any time.** `h` hides a live pane with
  `tmux break-pane -d` into a background window named `dmux-hidden-<id>`, and shows it again with
  `join-pane` (`src/hooks/useInputHandling.ts:606-656`, `src/services/TmuxService.ts:824,849`). The
  record carries `hidden` (`src/types.ts:53`) but the live window membership overrides it on every
  load (`syncHiddenStateFromCurrentWindow`, `src/utils/paneVisibility.ts:16-28`). Default is
  visible; nothing is fixed at start.
- **State model.** `.dmux/dmux.config.json` under the project root, and dmux _appends `.dmux/` to
  the project's `.gitignore` on first run_ (`src/index.ts:1141-1164`) — the record is declared a
  local cache, by construction. The live host carries a pointer back: `@dmux_project_root`,
  `@dmux_config_path`, `@dmux_controller_pid`, `@dmux_control_pane` are set as tmux **session
  options** (`src/index.ts:765-773`), so a live session is self-describing to anything holding tmux.
  Record→live mapping is _stored_ (`paneId: "%12"`) and then repaired by derivation: when the id is
  missing, dmux rematches by a stable encoded pane title
  (`display__dmux__slug-<project>-<md5[0:4]>`, `src/utils/paneTitle.ts`,
  `src/utils/paneRebinding.ts`). Across a reboot the record survives and every pane is gone; the
  next run recreates all of them.
- **Identity and grouping.** Session name = `dmux-<basename(projectRoot)>-<md5(projectRoot)[0:8]>`,
  munged to `[A-Za-z0-9_-]` (`src/index.ts:683-689`) — the same pure-function-of-identity shape 0031
  proposes, with the hash there to stop two projects named `api` from colliding. Pane records are
  `dmux-N`, sequential and reused (`src/utils/shellPaneDetection.ts:232`). Grouping is multi-project
  _inside one session_ via `sidebarProjects`, plus hide/isolate filters — not separate sessions.
- **Lifecycle.** The session has no open/close/exit distinction at all: it is immortal. `q` runs
  `cleanExit`, which only tears down the Ink tree (`src/DmuxApp.tsx:1444-1470`). The only close is
  per-pane, and it _is_ human-gated — a three-way choice between keeping the worktree, deleting the
  worktree, and deleting worktree plus branch
  (`src/actions/implementations/closeAction.ts:168-198`). Notably it kills the tmux pane **first**,
  verifies it is gone across three retries, and only then removes it from the record
  (`closeAction.ts:70-107,239-252`) — the inverse of Ward's order, and necessarily so, because
  dmux's own recreate loop would otherwise resurrect the pane.
- **Resume.** Harness-native, per agent, with an explicit ladder: exact
  `claude --resume <id>{permissions}` when an id is known, else `claude --continue`, else a cold
  launch (`src/utils/agentLaunch.ts:97-98,608-636`); `codex resume --last`,
  `gemini --resume latest`, `qwen --continue`, and so on for the rest. The resume command is typed
  into the recreated pane's shell (`src/hooks/usePaneLoading.ts:89-144`).
- **Where the session id comes from — the interesting part.** dmux never receives it from the
  harness. Every two seconds (`src/hooks/usePanes.ts:38`) it runs
  `tmux list-panes -s -F '#{pane_id}\t#{pane_pid}\t#{pane_current_command}'` plus
  `ps -axo
  pid=,ppid=,args=`, walks each pane's process tree breadth-first to find an agent
  process (by executable name, or by `@anthropic-ai/claude-code`-style package markers in a `node …`
  argv), and then reads that pid's **open file descriptors** — `/proc/<pid>/fd` on Linux,
  `lsof -Fn -p` as fallback — matching `~/.claude/projects/**/<uuid>.jsonl` for Claude and
  `~/.codex/sessions/**/rollout-*-<uuid>.jsonl` for Codex
  (`src/utils/paneAgentTracking.ts:174-297`). Consequence: it tracks agents _it did not launch_, and
  it re-reads the id whenever the process changes.
- **Failure handling: automatic in both directions.** Missing panes are recreated — all of them on
  initial load (`recreateMissingPanes`, `src/hooks/usePaneLoading.ts:271-317`), and any that die
  later on each poll (`recreateKilledPanes`, `:326-435`) — new pane, `cd` to the last observed cwd,
  resume command sent, no confirmation. Untracked tmux panes are adopted into the record as shell
  panes, also silently (`src/hooks/useShellDetection.ts:12-89`). The only brake is an in-memory
  closing marker with a 30-second stale sweep (`src/services/PaneLifecycleManager.ts`), plus pausing
  the config watcher around writes (`src/shared/StateManager.ts:180-196`). Config writes serialise
  on an **in-process** `p-queue` only (`src/hooks/usePanes.ts:37-42`) — two dmux processes on one
  project have no cross-process lock. Events come from tmux hooks (`after-split-window`,
  `pane-exited`, `client-resized`, `after-select-pane`) signalling the dmux pid with SIGUSR2, with
  polling as the decline path (`src/services/TmuxHookManager.ts:19-45`). Separately, work that
  outlived the record is re-derived from git itself: "reopen worktree" scans orphaned worktrees plus
  local and remote branches (`src/utils/resumeBranches.ts:281-345`).

## Takeaways for ward

1. **Pure-function host naming, validated at a year and 1,750 stars.**
   `dmux-<name>-<md5(root)[0:8]>` is exactly `hostSessionName`'s shape, and the hash exists for
   exactly the collision 0031 names. Confirms the mechanism — and suggests the workspace half of
   `ward-<workspace>-<session-id>` should be considered against two workspaces sharing a name on one
   machine, since dmux found the name alone insufficient and reached for the path hash.
2. **Recover the harness handle from the process, not only from the record.** dmux reads
   `/proc/<pid>/fd` (lsof fallback) to find the transcript a running Claude has open. Ward assigns
   the handle at launch and stores it — but this gives doctor's **stray** finding a real answer: a
   live `ward-…` session whose record is closed or missing can be identified back to a conversation,
   and a handle stranded by `/clear` or compaction can be re-read, with zero harness cooperation and
   no hook to install. Extends `locate`'s host block from `{kind, name, live}` to "and here is the
   conversation actually running in it".
3. **Name the resume ladder's missing rung as a rejected option.** dmux's ladder is exact id →
   `--continue` (latest conversation for this cwd) → cold launch. 0031's attach-recreate refuses
   when the transcript is gone, which is the right call under fresh-run-is-a-different-act — but
   `--continue` is what every comparable tool does, so the entry should record it as considered and
   declined rather than absent.
4. **A stable secondary key on the live half, for the grain the entry defers.** dmux repairs a lost
   `paneId` by matching an encoded tmux pane title. Ward needs nothing like it at session grain,
   because the session name is derived — but the deferred regrouping (per-floor sessions with
   per-thread _windows_) trades a derivable name for non-derivable window ids, and dmux shows the
   price: a title encoding, a rebinder, and a rule about when a renamed title must _not_ rebind
   (`paneRebinding.ts:22-25`). Worth citing in the deferred item as the cost of that change.
5. **Publish the record's identity into the live host as tmux session options.** dmux sets
   `@dmux_config_path` and friends on the session, so anything holding tmux can ask a live session
   which record owns it. Ward puts `WARD_AGENT` in the pane environment, which is invisible from
   outside the process. Setting `@ward_workspace` / `@ward_session` at hosted open would make
   doctor's stray scan able to report _which workspace_ a foreign `ward-…` session belongs to —
   useful precisely when the record is the thing that has gone missing.
6. **Kill-order asymmetry is load-bearing, not stylistic.** dmux must kill the pane before mutating
   the record, and says so in a comment, because its healer would otherwise resurrect the entry
   mid-close. Ward writes the record first and then kills. That inversion is only safe because Ward
   never auto-recreates — which is to say, "close kills the cache; nothing else ever does" is what
   buys the safe ordering. Worth stating that dependency explicitly in the entry.
7. **Doctor-reports-never-acts, confirmed by the counterexample.** dmux's automatic healing forces
   an entire subsystem into existence whose only job is to stop the healer: a lifecycle lock, a
   stale-operation sweep, a paused file watcher, three kill-verification retries, and comments
   marked CRITICAL about race conditions. Ward's refusal to sweep buys all of that back. The
   sharpest instance: after a reboot dmux's initial load restarts **every** recorded agent at once —
   the mass restart 0031 explicitly refuses in its reboot scenario, with dmux as the evidence that
   the alternative is a real design, not a straw man.
8. **The store lock becomes a first-class part of hosted design.** dmux serialises config writes
   in-process only, so a second instance races. Ward has `.ward/store.lock` — but hosted sessions
   multiply the number of `ward` processes touching one store (each attach, each in-pane verb, each
   background session), so the lock's holder-naming and stale takeover move from background detail
   to something the hosted flows should be tested against.
9. **Background↔foreground as a movable per-session state, and why Ward's is fixed.** dmux moves a
   _live_ pane between visible and background windows at any time with `break-pane -d` /
   `join-pane`. Ward's `--detach` is fixed at open — correctly, because tmux cannot adopt an
   already-running foreground process, only a client. That constraint is the actual reason the
   choice is fixed, and naming it in the entry pre-empts the obvious "why can't I detach later?"
   question.

## Conflicts with ward's posture

dmux's record is a gitignored local cache, written on a two-second cadence, and its reconciliation
runs live-wins in both directions — the record is a wish list, tmux is the truth, and both sides
converge without a human ever being asked. That buys something real: dmux survives users doing
arbitrary tmux things (`Ctrl+b x`, manual splits, a machine reboot) with no explanation, no
refusals, and no vocabulary to learn. It pays for it in volatile state stored where it need not be —
`paneId`, `agentProcessId`, `agentStatus`, `lastAgentObservedAt`, `shellCwd` all sit in the record
and are all re-derived anyway on the next poll — which is §17's derive-don't-store rule demonstrated
by violation. Ward's committed record could not take that write cadence even if it wanted the
ergonomics, so the trade is forced rather than chosen: Ward keeps `host` as launch provenance and
derives everything else, and pays in refusals a human must read.

The second, quieter conflict is that dmux has no session lifecycle at all. Its tmux session is
immortal; only panes close. That is coherent for a tool whose unit of work is a worktree and whose
session is just "this project's window onto them" — but it means dmux never had to answer the
question 0031 exists for, namely what it means for a bounded episode of agent work to be open,
detached, and not running all at once. dmux's answer to "is it still going?" is to look at the
screen. Ward's is a record, and the whole of `attach`/`observe`/`locate`/`close` is the price of
being able to answer without looking.
