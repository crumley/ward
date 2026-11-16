# 0031 — Build log

> The journal of [`0031-detached-session-hosting`](README.md): what designing (and later, building)
> forced or revealed. One block per iteration, newest at the bottom.

## 2026-08-24 — The design, as its own reviewable unit

**Goal.** Design the multiplexer-seam arc completely enough that a builder can start from it, and
ship the design for review before any implementation exists. **What was done.** Read the governing
intent (the multiplexer seam and its neighbors: messaging, harness, theming, sessions-and-lifecycle,
scopes-and-personas, vision, principles), 0029 in full (the machinery this stacks on, and the SF-002
that names the debt), and the current code read-only (`src/agent/run.ts`, `src/harness/claude.ts`,
the session record schema, the session verbs). Surveyed the host candidates and recorded the choice
as [ADR 0006](../decisions/0006-tmux-detached-host.md) (proposed); wrote the entry — verb surface,
naming, failure semantics, scope boundaries, and the acceptance the build will be measured against.
No `src/`, `test/`, or `intent/` files were touched: this is a design-only unit, and the frictions
it surfaced went to [`intent-feedback.md`](intent-feedback.md). **What works now — with the exact
command that proves it:** the documents pass the repo's full gate — `mise run check` (Biome +
dprint + `tsc --noEmit` + `bun test` + lychee + actionlint) → exit 0 on this branch. **Decisions.**
All recorded under the entry's Design. **Next.** Human review of the entry and ADR 0006; on
acceptance, the build proceeds against the Scope and Acceptance stated there.

## 2026-08-25 — The prior-art sweep, absorbed

**Goal.** Test the proposed design against comparable systems before it is reviewed, and rewrite it
wherever the evidence changed the answer. **What was done.** Eleven systems were surveyed in source
and recorded under [`prior-art/`](prior-art/); the entry and ADR 0006 were then rewritten against
them. What the sweep forced: the host name is now **minted and recorded** rather than re-derived
everywhere — a pure function over the mutable workspace name would orphan every live session on a
rename — and consumers treat it as an opaque whole; every tmux target became **exact-match** and
destructive verbs are scoped to the `ward-` namespace; found-by-name is now **verified as ours** by
a token and generation stamp the create places inside the live half; `remain-on-exit` keeps the
run's **exit legible** without a shim, which layered liveness into host-present / process-alive /
transcript-resumable and taught every create and close path about dead panes; the **detached-init
premise** — the field reports interactive TUI agents crashing when initialized detached — became the
build's named first validation step, with its pivot stated in advance and the hosted session
explicitly sized; probe failures became **"could not determine"**, never "not running"; the hosted
spawn moved **strictly after the store-lock release**; and the `--continue` fallback and
`new-session -A` were recorded as considered and declined. Newly deferred, each with its why and
named consequence: the handle-freshness refresh channel, `release`, and fleet roll-up. Two new
frictions went to [`intent-feedback.md`](intent-feedback.md) (SF-005, SF-006), and ADR 0006 was
amended in place — still proposed — with the caveats the survey added to the tmux choice. **What
works now — with the exact command that proves it:** the rewritten documents pass the repo's full
gate — `mise run check` → exit 0 on this branch. **Decisions.** All recorded under the entry's
Design, cited to the prior-art file that justified each. **Next.** Human review of the rewritten
entry and amended ADR; on acceptance, the build starts with the premise validation.

## 2026-10-16 — Regrouped: one floor host per floor

**Goal.** Re-decide the grouping the entry had deferred, now that the work it hosts is coordinated
per floor: long-lived floor-scope sessions (0051 floor-scope-sessions) that start further sessions
for their floor's tasks, with the parent recorded on each (0052 session-parent-link). **What was
done.** The one-host-per-session decision was superseded in place, with what it bought kept on the
record: one **floor host** per floor, one window per session, floor 0's windows linked into every
floor host, placement derived from the record (own floor, or a non-zero parent's). What the
regrouping forced, each now a decision under Design: window identity by **window-option tag**
(`@ward_session`, `@ward_epoch`, `@ward_pane`) instead of a derived name, since window ids are not
derivable and titles are rewritten — the dmux rebinder is the cost avoided; ownership moved off the
tmux session environment, which a floor host shares and which every later window would inherit, so
`WARD_AGENT` is now pane-only via `new-window -e` and verification reads window and host options;
the host is found by **stamps** (`@ward_workspace`, `@ward_floor`) and its name minted only when the
floor has none, which let the record **drop** `hostName` — `host` alone remains; attach goes through
a **grouped view** so it never moves another client's current window; observe is a **single-window
read-only view** built with `link-window -k`, after `attach -r` of the floor host (wrong grain),
`capture-pane` (a poll, not a view), and `pipe-pane` (size-garbled, one pipe per pane) were weighed;
close kills the window and the host only when nothing of its own remains, relying on tmux unlinking
rather than killing floor-0 windows at `kill-session`; and since windows have no unique names to
arbitrate a race, the probe-and-create moved **inside the store write** — safe because Ward's store
lock is a link(2) lockfile holding no descriptor, which also retires the first version's
spawn-after-release rule (that hazard was a flock's). One new friction went to
[`intent-feedback.md`](intent-feedback.md) (SF-007, grouping by lineage), the six existing SFs were
re-read against floor hosts and moved to one `**Status:**` line each, all still pending, and ADR
0006 was amended in place, still proposed. **What works now — with the exact command that proves
it:** `env -u WARD_AGENT mise run check` → exit 0 on this branch. **Next.** Human review of the
regrouped entry; on acceptance, the build starts with the premise validation.

## 2026-11-06 — Review answers: who floats, who kills a host, what stamps it

**Goal.** Apply Ryan's answers to the five review questions on #109. **What was done.**

- **Placement is confirmed as designed.** A session the coordinator starts for floor 5 is a floor-5
  session and goes in floor 5's host. A workspace-scope session that a floor-N session starts goes
  in floor N's host by lineage. Placement never reads the caller's tmux session. SF-007 is now
  accepted.
- **Floating is narrowed** to the one case the review named. A window floats exactly when its
  session is at workspace scope and records no parent: the coordinator a human opened. A
  workspace-scope child of the coordinator is placed on floor 0 and stays in the floor-0 host. So
  does a ground-floor task or floor session. Floating every floor-0 window would have put each
  helper the coordinator starts at the left edge of every floor host.
- **Shared-write attach is ruled** (SF-005, pending its intent edit): two humans on one window share
  its keyboard, and observe is the protected grain.
- **Close no longer kills hosts.** Close kills the session's window and nothing else. Ward never
  runs `kill-session`. A linked window is a full window of every tmux session it is linked into, and
  tmux keeps a session while it has any window. So a finished floor's host that still shows the
  coordinator stays, and a host left with no window ends by tmux's own rule. This removed the
  interrupted-close stray-host finding. Doctor now reports a host holding only floating links as an
  idle host (information). The emptied-host acceptance case became a duplicate-host case.
- **The host stamp is now a workspace id.** `@ward_workspace` carries the workspace's immutable id,
  declared in intent by [#114](https://github.com/crumley/ward/pull/114) in its own PR (rule 3). It
  no longer carries the root path, so a move on disk, like a rename, finds the same hosts. This
  entry's build now depends on a separate, earlier build task that mints the id. One new consequence
  is recorded: two checkouts of one workspace on one machine would share floor hosts. #114 records
  that as an open question.

ADR 0006's binding consequence now names the id. **What works now — with the exact command that
proves it:** `bun install --frozen-lockfile && env -u WARD_AGENT mise run check` → exit 0 on this
branch. **Next.**

1. Merge #114.
2. Build the workspace-id mint.
3. Adjudicate SF-005 and SF-007 in intent.
4. Start this entry's build with the premise validation.

## 2026-11-08 — Second review pass: ADR 0006 accepted, host interface named

**Goal.** Record what the intent review of 2026-11-08 settled for this entry. **What was done.**

- **ADR 0006 is accepted.** tmux is the first added technique. A later change to the choice goes
  through a superseding ADR, never an in-place amendment.
- **The adapter boundary is now a host interface.** It is stated in host terms (place, tag, find by
  tag, view, close), and no tmux call is made outside `src/host/`. A further host, such as a
  terminal app that hosts sessions itself, is then one more implementation selected by `agent.host`.
  The ADR records this as a consequence, and the Layout states it.
- **IF-001, IF-004, IF-005, IF-006, and IF-007 are ruled.** Their intent edits ride
  [#116](https://github.com/crumley/ward/pull/116), its own PR (rule 3). Each Status line reads
  ruled-and-awaiting until #116 merges. Two of the rulings sharpen what the build must do. Close
  tears down only the session's own verified window, and every other pass reports and never kills.
  Ownership is confirmed by launch-placed evidence, and the binding survives identifiers that move.

**What works now — with the exact command that proves it:**
`bun install --frozen-lockfile && env -u WARD_AGENT mise run check` → exit 0 on this branch.
**Next.**

1. Merge #116, then flip the five Status lines to adjudicated.
2. Build the workspace-id mint.
3. Start this entry's build with the premise validation.

## 2026-11-08 — Build, phase 1: the host interface, placement, close, and a live read

**Goal.** Ship a reviewable vertical slice of the build: a hosted open and resume that land in their
floor's host, a close that ends the session's own window, and `session show` saying where a run is
live. The rest of Scope follows in later phases (listed under **Next**).

**What was built.**

- **The host interface**, `src/host/host.ts`, in host terms: `check`, `prepare`, `place` (find or
  create the floor's group by its stamps, then create the tagged window), `find` (every window
  carrying a session's tag), `close` (one window, only while it still carries that tag), and
  `joinCommand`. `src/host/tmux.ts` is the one implementation and the only file that runs tmux;
  `src/host/index.ts` selects by kind. The Ward-shaped half is `src/agent/host.ts` (host choice,
  ownership, the resume gate, teardown) and `src/agent/placement.ts` (the pure placement and
  floating rules).
- **Configuration and flags.** `agent.host: foreground | tmux`, default `foreground`, resolved per
  key like `harness`. `--detach` and `--foreground` on `session open` and `session resume`. The flag
  refuses when no detached host is usable. The configured default degrades to the foreground and
  says so on stderr.
- **Placement** happens inside the store write that records the launch, after its commit. Two
  concurrent opens on an empty floor make one host (tested).
- **Close** (and the task-close cascade) ends the session's own verified window and never runs
  `kill-session`.
- **The live read**: `session show` (and its `--json` `live` block) reports `live`, `exited` (with
  the retained status), `gone`, or `unknown`, plus the host, the window, and any strangers. The
  hosted open and resume report the same block, read back a beat (300 ms) after placing, so an
  instant exit shows at once.

**What building changed in the design.**

- **`host` is recorded on the launch event, not on the record.** The design gave the record one
  optional `host` field. A session can be opened hosted and resumed in the foreground, or the other
  way round, and the epoch the window is verified against is the latest launch event's `at`. So the
  provenance belongs on that event: `opened` and `resumed` carry `host: tmux` when hosted. That
  keeps the trail append-only and leaves no field to rewrite on each resume. The read is one line:
  the latest launch's `host`.
- **A window is created holding, then started by a respawn.** The design set `remain-on-exit` with
  `set-option` right after `new-window` started the agent. Against a real tmux, a run that exits at
  once beats that `set-option`, and the window and its exit status are both lost. So the window is
  created running `cat`, tagged and set `remain-on-exit on` while it holds, and only then started
  with `respawn-pane -k -c DIR -e WARD_AGENT=ID -- COMMAND`. `-e` on the respawn puts `WARD_AGENT`
  on that pane's process alone, which is the property the design wanted from `new-window -e`. The
  floor host's own placeholder holds `cat` the same way.
- **Targets inside a tmux session need the colon.** `set-option -t '=name'` fails ("no such
  session"), because `set-option`'s target is a pane. Every option on a host is set with
  `-t '=name:'`.
- **Strangers are counted only in this workspace's hosts.** Session ids repeat across workspaces:
  every workspace on a machine has a `workspace-1@<machine>`. The real-tmux suite found exactly
  that, with each case's workspace beside the last on one server. A window tagged with this id that
  stands only in another workspace's hosts belongs to that workspace and is not reported. A window
  tagged with this id in an unstamped tmux session (one a human moved it into) still is.
- **Resume checks for a live window before it locates the transcript.** A run that is still going
  may not have flushed its transcript yet. Locating first would record `resume-failed` for a run
  that is fine. Resume now refuses over a live window first, read-only. The binding gate, which may
  clear a dead window, runs again under the lock.
- **A `resumed` event may carry a `cause`**: how the previous hosted run ended ("previous run exited
  3", "previous run killed by SIGKILL"), read from its dead pane before the new window replaces it.
  The schema already allowed the field; its comment now says so.
- **`WARD_TMUX_SOCKET` sits beside `WARD_TMUX_BIN`.** It names a private server (`tmux -L NAME`).
  The real-tmux suite runs on one, and a human can try hosting on a throwaway server. Unset, Ward
  uses the default server, as the server decision says. The client environment Ward talks to tmux
  from drops `TMUX`, `TMUX_PANE`, and `WARD_AGENT`. That way a run inside tmux still reaches the
  default server, and a server Ward starts never carries the caller's session id into its global
  environment.
- **Tests run against a real tmux instead of a stub.** The design planned a stub tmux for the
  end-to-end suites. Two suites replace it: unit tables over a fake host (`test/agent/host.test.ts`)
  and over the adapter's argv builders and parsers (`test/host/tmux.test.ts`), and an end-to-end
  suite through the spawned CLI against tmux on a private socket (`test/host/tmux-live.test.ts`).
  The real server caught three of the changes above; a stub would have caught none. The suite starts
  its own server with `-f /dev/null`, kills it and removes its socket in `afterAll`, and skips
  itself, saying why, when tmux is absent. CI installs tmux on both runners.

**What works now — with the exact command that proves it:**

- `bun install --frozen-lockfile && env -u WARD_AGENT mise run check` → exit 0 on this branch.
- `env -u WARD_AGENT bun test test/host test/agent/host.test.ts` → the host suites alone, real tmux
  included.
- On a throwaway server: `WARD_TMUX_SOCKET=try ward session open --detach`, then
  `tmux -L try attach -t '=ward-<workspace>-f0'`, then `ward session close ID`, then
  `tmux -L try kill-server`.

**Not yet proven: the premise smoke** (Acceptance 2). This phase's real-tmux runs use a stand-in
harness; Claude Code itself initializing in a detached window has not been checked. It is the first
thing to run by hand before relying on `--detach` for real work.

**Next** (phases 2 and 3, against Scope and Acceptance):

1. The premise smoke with real Claude Code at `-x 120 -y 40`, or the attach-then-launch pivot.
2. `ward session attach ID`: the grouped per-client view, re-create when gone, and floating-link
   repair. Resume's refusal points at the raw `tmux attach` until then.
3. `ward session observe ID`: the read-only single-window view.
4. `locate`'s `host` block, and `attached`/`observed` events.
5. Doctor: tmux capability and version floor, stray windows and hosts, duplicate floor hosts, views,
   misplaced windows, missing floating links, idle hosts, foreign hosts, gone-as-information,
   could-not-determine, and `@ward_version` skew.
6. The manifest's Sessions section: detach, attach, observe, the floor host, and the sizing caveat
   of the floating coordinator.
7. `detach-on-destroy` behaviour for attached clients beyond what close needs, and completion and
   telemetry for the new flags if the tree does not already pick them up.

## 2026-11-10 — Build, phase 2: the premise check, attach, observe, locate, and doctor

**Goal.** Run the premise check against real Claude Code (Acceptance 2), then build the rest of the
human-facing half: `ward session attach` and `ward session observe` through views, `locate`'s `host`
block, doctor's host findings, and the manifest's teaching of all of it.

**The premise check, against real Claude Code.** Run by hand on macOS (tmux 3.7c, Claude Code
2.1.319), in a throwaway workspace created with `ward workspace create` under a scratch directory,
with its own floor (`ward project open realcheck`), its own `WARD_CONFIG_DIR` and `WARD_STATE_DIR`
(the global config set `agent.model: haiku`, the cheapest model the adapter passes through), and a
private server (`WARD_TMUX_SOCKET=ward-realcheck`). The terminal side was driven through a real
pseudo-terminal (a small Python `pty` driver). What was observed:

- **Detached init is healthy.** `ward session open --floor 1 --detach` returned once the window held
  the run; the window read back `live` a beat later. `capture-pane` with no client attached showed
  Claude Code fully drawn at 120×40: its folder-trust prompt, then (once accepted) its welcome
  screen and input box. No crash, no garbled frame, no need for the attach-then-launch pivot. The
  premise holds; the pivot is not taken.
- **It takes input through an attach.** A pty client (150×45) on `tmux attach` saw the same screen,
  moved the trust prompt's selection and confirmed it; the window resized to the client (150×44,
  less the status line) and kept that size after the client left. A trivial prompt typed through a
  second attach ("Reply with exactly the word pong…") was answered `pong`. Later, through
  `ward session attach` itself (110×32), "…ping…" was answered `ping`, the trail gained `attached`,
  and the view was gone once the client detached.
- **`WARD_AGENT` is set in its pane.** `ps -wwE` on the pane's process showed
  `WARD_AGENT=f1-1@dstar`, the session's id, and `TERM=tmux-256color`.
- **And so was a stranger's identity — the one defect the check found.** The same environment held
  `CLAUDECODE=1`, `CLAUDE_CODE_SESSION_ID`, `CLAUDE_CODE_MESSAGING_SOCKET`, `CLAUDE_PID`, and their
  siblings — all the _invoking_ Claude Code run's, because `ward` had been run from inside one and
  its hygiene preamble had started the tmux server. A tmux server keeps the environment of the
  client that started it as its global environment, and every window it ever creates inherits that.
  Fixed below.
- **Resume and close behave.** `ward session resume` over the live window was refused, naming the
  host and the join command, and recorded nothing. `/exit` typed through an attach left the window
  dead with `remain-on-exit`, and `session show` said `exited 0, window kept`.
  `ward session resume --detach` then recorded `resumed — previous run exited 0`, cleared the dead
  window, and started `claude --resume <id>`, which redrew the earlier conversation. Because the
  dead window was the host's only window, clearing it ended the host, and the resumed run landed in
  a freshly minted one (`created` in the report) — tmux's own lifetime rule, harmless here, and
  noted under Next. `ward session close` ended the window; the `claude` process was gone within half
  a second of the `kill-window` (it exits on the pane's SIGHUP), and the empty server stayed up
  (`exit-empty off`).
- **The reboot path.** With the session open and running, the private server was killed outright
  (`kill-server`, the reboot stand-in): doctor reported the session as information — "not running
  (no tmux window) — attach re-creates it" — and `ward session attach` re-created it from the record
  (`resumed`, then `attached`), with `claude --resume` showing the earlier exchange.
- **Observe.** `ward session observe` (70×20) joined one window read-only: text typed and entered
  through it never reached Claude's input (`capture-pane` showed none of it), and the trail gained
  `observed`.

Cleaned up afterwards: the private server killed and its socket removed, the scratch workspace and
its configuration deleted, and the two transcripts Claude wrote for the scratch path removed from
`~/.claude/projects/`. The check is manual and stays out of the gate; the steps above are the
recipe.

**What building changed in the design.**

- **A detached host is talked to from an environment carrying no run's identity.** The fix for the
  defect above: Ward's tmux client — and so any server it starts — drops `WARD_AGENT` and every
  variable a harness sets to name the run a process stands in. Each harness adapter now lists those
  (`runEnvVars`; Claude's by name, not by a `CLAUDE_CODE_` prefix, because that prefix is also where
  a human's own configuration lives, such as `CLAUDE_CODE_USE_BEDROCK`). A server already started
  dirty (by an older ward, or by a human from inside an agent's shell) cannot be cleaned without
  killing it, so doctor reports it (`host environment`, a warning) with the `set-environment -gu`
  commands that stop new windows inheriting it. A real-tmux case starts a fresh server from a
  Claude-like environment and asserts none of it reaches the server.
- **A view ends itself only once its client is in it.** The design set `destroy-unattached on` when
  the view is created. Against a real tmux that ends the view at once: tmux checks the option as it
  is set, and a view just created has no client yet. So the option rides the join itself —
  `attach-session -t =VIEW ';' set-option -t =VIEW: destroy-unattached on` (or `switch-client …`) —
  and is set the moment the client is in. A view left by a join that never happened is what doctor's
  leftover-view finding names.
- **`ignore-size` is conditional, and the sizing caveat grows a clause.** The design said an
  observer's terminal never resizes the agent's window. tmux honours `ignore-size` only while at
  least one client _without_ the flag is attached: an observer watching alone sizes the window to
  its own terminal (the real-tmux suite saw 60×14), and the next participant sizes it back. With a
  participant attached, the observer leaves the size alone, which the suite now proves. The harness
  reflows either way, so the cost is visual; the manifest says it.
- **An empty server is an empty answer.** `list-panes -a` on a running server holding no session —
  the state `exit-empty off` leaves after the last host ends — fails with "no current target", which
  phase 1 read as could-not-determine. Resume would then refuse to run over a host that holds
  nothing. Both `find` and the inventory now read it as empty; a real-tmux case proves it on a
  server of its own.
- **Attach refuses two cases the design did not name.** A session whose latest launch ran in the
  foreground: Ward cannot see into that terminal, so it cannot tell a running run from a finished
  one, and re-creating could put two processes on one conversation — the refusal names
  `ward session resume ID --detach` for a run the human knows has ended. And a caller with no
  terminal (stdin or stdout not a TTY — an agent's tool call, a pipe): attach hands a terminal over,
  so there must be one; the refusal names `session show` and `resume --detach`. Neither verb has
  `--json` for the same reason, so neither is in `ward schema`.
- **Observe always attaches, even from inside tmux.** Attach inside the same server switches the
  caller's client to the view (`switch-client`), because an attach there would nest. Observe cannot
  switch: `switch-client -r` toggles read-only on the human's own client, which would then stay
  read-only after they leave. So observe attaches a nested client (its `$TMUX` dropped), read-only
  by the server's enforcement; leaving it takes the prefix twice. The same-server test reads the
  caller's `$TMUX` socket against the server's `#{socket_path}`.
- **Attach repairs links into where the human stands.** The missing-link repair adds every live
  floating window to the host being attached, and, when the session attached is the coordinator,
  links it into every floor host of the workspace it is missing from. A failed link is reported on
  stderr and never blocks the attach. Observe repairs nothing: watching changes nothing.
- **The version floor is 3.2**, not 3.0: observe's client flags (`-f read-only,ignore-size`) arrived
  then. One floor for the whole host keeps the capability finding to one sentence.
- **The host interface grew in host terms**: `link`, `view`, `enter`, `inventory`, `inheritedEnv`,
  and the remedy builders (`closeCommand`, `endGroupCommand`, `forgetEnvCommand`) — so every
  finding's remedy names the configured server (`tmux -L NAME …`) and nothing outside `src/host/`
  spells a tmux command. Doctor's findings live in `src/agent/host-findings.ts`, one call from
  doctor's workspace checks.

**Doctor's host findings**, each derived from one inventory (`list-sessions` and `list-panes -a`)
joined against every session record; none ever ends anything, and none is an error:

- `session host` — tmux and its version against the 3.2 floor: ok, or information when unusable (a
  warning when `agent.host: tmux` is configured, since every launch then degrades).
- `host environment` — a run's identity in the server's global environment (warning).
- `host windows` — a stray window: tagged, in this workspace's host, explained by no open record (no
  record, a closed session, an earlier run's epoch), flagged when a client is viewing its host
  (warning, with `kill-window`); two windows of one run (warning); a gone or exited session
  (information: attach re-creates it); a misplaced window (information: attach follows it); a
  coordinator missing from a floor host (information: attach repairs it); could-not-determine
  (warning, worded as "not a clean bill"); and one ok line when there is nothing to say.
- `floor hosts` — two hosts stamped for one floor (warning, the oldest used, `kill-session` named
  for the others); an idle host showing only the coordinator's link (information, `kill-session`
  named as the human's option — it only unlinks); a leftover view with no client (information);
  `ward-` hosts that are another workspace's or unstamped (information, left alone); and version
  skew against `@ward_version` (information).

**The manifest** gained a `Detached sessions — floor hosts` section of its own, after `Sessions`:
`--detach` and `--foreground`, the floor host, the floating coordinator, attach and its view,
observe, the `window-size latest` sizing caveat with the observer clause above, and what close,
show, locate, and doctor say. The outgoing default's hash joined the AGENTS.md lineage (design 0056)
and the current one is repinned.

**What works now — with the exact command that proves it:**

- `bun install --frozen-lockfile && env -u WARD_AGENT mise run check` → exit 0 on this branch, and
  again with `CI=true`.
- `env -u WARD_AGENT bun test test/host test/agent/host.test.ts test/agent/attach.test.ts
  test/agent/host-findings.test.ts`
  → the host suites alone. The real-tmux cases now cover attach through a view (a second client
  keeps its own window; leaving ends only the view), attach re-creating an ended run, the
  coordinator's link repaired, observe's single read-only window, the no-terminal refusal, locate's
  `host` block, doctor naming fabricated strays, duplicates, leftover views, and gone sessions while
  ending nothing, an erroring tmux as could-not-determine, an empty server, and the scrubbed server
  environment. Terminals in the suite are real pseudo-terminals (Bun's `terminal` spawn option).

**Next** (phase 3, against Scope and Acceptance):

1. Clear a dead window only after its replacement is placed, so a host whose only window was the
   dead one survives the resume (and a human sitting in it is not moved).
2. Acceptance 6's concurrent-resume race and Acceptance 9's "a floor host killed by hand leaves the
   coordinator alive in the others", each as a real-tmux case.
3. `detach-on-destroy` behaviour for attached clients beyond what close needs, and the same-server
   `switch-client` path exercised against a real attached client.
4. Status to built — awaiting review once those land.

## 2026-11-15 — Build, phase 3: hosts that outlive what happens in them

**Goal.** Finish the list phase 2 left: a resume that never empties a host, the two acceptance cases
still unproven on a real tmux, what becomes of an attached client when the tmux session under it
ends, and the same-server `switch-client` path against a real client. Each item was first checked
against the code as it stands after designs 0057, 0060, and 0061; what the check found is said under
each.

**1. A dead window is cleared after its replacement is placed.** The list item held as written.
Resume's gate used to end the dead window before the `resumed` event was written, and the placement
came after: a host whose only window was the dead one stood empty in between, tmux ended it, and the
replacement landed in a host minted again. Anyone sitting in the old host was moved out of it, and a
view of it was ended under its client. For the coordinator it was worse than phase 2 noted: its one
window is linked into every floor host, so a dead coordinator that was the only window of several
hosts took all of them with it.

- The gate (`guardResume`) now ends nothing. It answers with how the previous run ended and the
  means to clear its window (`ResumeGate.clearDead`), and the resume calls that once the replacement
  stands, still inside the store write. The window is cleared by the id it was verified under: the
  `resumed` event written in between makes it another launch's, and a lookup after that would read
  it as a stranger.
- It is cleared when the placement fails too. Left standing, it would wear the session's tag under
  an epoch the record has moved past, and the next attach would refuse it as a stranger.
- A foreground resume has no replacement to wait for: it clears the dead window after the event is
  recorded, under the same lock.
- What "not moved" means, exactly: nobody leaves the host, and the host and its views are the same
  tmux sessions before and after. A client whose current window was the dead one is put on whichever
  window tmux picks when that window goes — the replacement, when it is the only one. The
  replacement takes the next free index rather than the dead window's place; nothing reads indexes,
  and keeping the place would mean re-using the window across launches, which the epoch tag is there
  to prevent.

**2. The two acceptance cases, on a real tmux.** Neither needed restating beyond the host names 0061
gave (`<workspace>-f<N>-<floor-slug>`).

- _Acceptance 6, the concurrent resume._ Two `ward session resume ID --detach` started together over
  a dead window: one exits 0 and one exits 1, the loser refused with the join command; the record
  carries one `resumed`, the host one window, and the stand-in harness started once more, not twice.
  The loser can be refused at either of resume's two looks — the early read-only one, or the binding
  one under the lock — and both say the same thing, so the case asserts the refusal and not which
  look made it.
- _Acceptance 9, a floor host killed by hand._ With the coordinator and a session on each of two
  floors, `tmux kill-session` on floor 1's host leaves the coordinator's window — the same window,
  pane, and process — in floor 0's host and floor 2's, reads floor 1's own session as `gone`, and
  the next open on floor 1 mints its host again with the coordinator linked in at its left edge.

**3. What becomes of a client when the tmux session under it ends.** This item needed restating.
"Beyond what close needs" turned out to be a defect in the one promise the design makes here: floor
hosts set `detach-on-destroy off` so that a human in a host tmux ends is moved to another tmux
session, not dropped to the shell. Views never set the option, so they followed the server's default
(`on`). Two consequences, both seen on a real server:

- A human who joined with `ward session attach` from inside tmux has their own client switched into
  the view. When the view ended under them, that client was detached from tmux altogether — thrown
  out of the tmux session they had been working in, not returned to it.
- The host's own promise did not hold while any view of it existed. tmux ends a host and its views
  one after another, and moves each one's clients to the most recently active session left — a view
  that is about to end as readily as any. A human sitting in the host was moved into a view and
  detached with it a moment later.

So every view now sets `detach-on-destroy off` as its client joins, beside `destroy-unattached on`:
whoever is looking at a floor when its last window closes — in the host, through an attach view, or
through an observe view — lands in a tmux session still standing. The costs are named:

- `ward session attach` and `ward session observe` run from a plain terminal no longer return when
  the floor's host ends while another tmux session stands on that server; the terminal moves there,
  and the verb returns when the human detaches. Before, with tmux's default, it returned to the
  shell. With no session left to move to, tmux still detaches the client and the verb returns.
- Which session they land in is tmux's choice (the most recently active), not Ward's: on the default
  server it can be a session of the human's own that has nothing to do with Ward.
- An observer keeps its read-only client flag wherever it lands. It can change nothing there, but it
  is no longer looking at the one window it asked for. Detaching the observer alone was tried first
  and is what exposed the cascade above: one view that detaches its clients can drop anyone tmux has
  just moved into it.

The manifest's section is unchanged: it says a view is gone when you leave, which still holds, and
says nothing yet about where a client lands when a host ends.

The same-server `switch-client` path needed no change. A real-tmux case now runs
`ward session attach` from inside a pane of a tmux session a real client is attached to: that one
client is switched into the view (no second client appears), the verb returns 0 at once, the trail
gains `attached`, and when the floor's last window is closed the client is back in its own session.

**4. Status** is `built — awaiting review`.

**Tests.** Five real-tmux cases joined `test/host/tmux-live.test.ts`, one per behaviour above, each
waiting on what tmux reports and never on a fixed delay. The known intermittent in "attach
re-creates a run that ended" — the open's own report read `live` because the stand-in harness had
not exited yet, a beat after it was placed — is gone: that case, and the new ones that need a dead
window, wait until `session show` reads `exited`. The five new cases and that one were run 36 times
on macOS (tmux 3.7c) with no failure: 12 runs alone, then 24 as three loops side by side to load the
machine. Linux is proven by CI only.

**By hand**, on a private server (`WARD_TMUX_SOCKET`) in a throwaway workspace with a stand-in
harness: a client attached to a host whose only window had died stayed attached through
`ward session resume --detach`; the host kept its tmux session id (`$0`), and held the new window
alone afterwards.

**What works now — with the exact command that proves it:**

- `bun install --frozen-lockfile && env -u WARD_AGENT mise run check` → exit 0 on this branch.
- `env -u WARD_AGENT bun test test/host/tmux-live.test.ts -t 'places its replacement first|racing
  make one window|killed by hand|from inside tmux|ends under them'`
  → the five phase 3 cases alone.

**Left open.**

- The observer that lands, read-only, in another session when its window closes (above). Ending only
  that client needs something to act when the view ends; nothing here does.
- The manifest does not say where a client lands when a host ends.
- Everything under Scope's _Deferred_ stays deferred.

## 2026-11-16 — Follow-up: the observer, the open's report, and the manifest

**Goal.** Close the three things phase 3 left open or reported in passing: the observer that lands,
read-only, in a session it never asked to watch; the real-tmux case that still asserted the open's
own report of a run that had just been started; and the manifest's silence on where a terminal lands
when a host ends.

**1. An observer's terminal returns to the shell when its window goes.** The target was the obvious
one: an observer asked to watch one window, so when that window goes the terminal comes back with a
line saying what happened. The difficulty is the one phase 3 recorded. tmux decides what becomes of
a client per session (`detach-on-destroy`), and when a floor's last window closes it ends the host
and its views one after another, moving each one's clients into the most recently active session
left. An observe view that detaches its clients therefore also detaches whoever tmux moved into it a
moment earlier.

The cascade was reproduced first, on a private server with raw tmux: a host, a grouped attach view,
an observe view with `detach-on-destroy on`, one client in each (the observer joining last), and a
fourth session standing. Killing the host's window dropped all three clients to the shell.

What was built makes the decision per client instead of per view, and makes it while the observer is
still in its own view:

- **The view keeps its placeholder.** An observe view used to replace its placeholder window with
  the link to the watched one (`link-window -k`). It now links the watched window in beside the
  placeholder and selects it (`watchArgv`). The placeholder's entry in the view's window list is
  emptied (`window-status-format` and `window-status-current-format` set to nothing on that one
  window), so the observer's status line names one window. The view no longer ends in the same
  breath as the watched window: it stands, showing the placeholder, until something ends it.
- **A hook on the view does that.** When the watched window goes, the view's current window changes
  to the placeholder, and the view's `session-window-changed` hook runs
  `detach-client -t <the observer's client> ; kill-session`. No client of a read-only view can
  select a window, and the view is created with the watched window current before the hook exists,
  so the hook fires for exactly one reason.
- **The observer's client is named, not inferred.** The hook is set by the observer's own client as
  it joins (the same command sequence that sets `destroy-unattached`), with `set-option -F`, so
  `#{client_name}` is expanded to that client there and then. Detaching by name is what keeps the
  cascade out: a participant tmux has just moved into the observe view is not the named client, and
  when `kill-session` then ends the view its `detach-on-destroy off` — unchanged from phase 3 —
  moves that participant on. By the time a hook runs, the host and its attach views have already
  ended, so "on" can only be a session still standing.
- **Ward says why.** tmux prints only that the client detached. `observeSession` reads the session
  once after the client returns and the verb prints one line: the session `was closed`; it `ended`
  and its window is gone, the record still open; or it `was restarted in a new window`, when a
  resume cleared the dead window being watched (naming `ward session observe ID` to watch again). A
  human who leaves by choice gets no line: the window they were watching still stands. A host that
  cannot answer gets none either — nothing is guessed.

Alternatives weighed. Polling from the `ward session observe` process and detaching its own client
once tmux had moved it loses because the observer does land in the other session first, for as long
as the poll interval, which is the behaviour being removed. A hook on the server (`session-closed`,
`client-session-changed`) would see every case without a placeholder, and loses because a server
hook is global: it would sit on the human's default server and run for their own sessions, against
the rule that Ward sets session options on its own tmux sessions and nothing else. The
`no-detach-on-destroy` client flag is the same per-client decision made by tmux itself, and loses on
two counts: it arrived after the 3.2 floor, and a human sitting in the host with a plain
`tmux attach` does not carry it.

Costs, named. An observe view holds two windows, one of them a `cat` nobody sees; the watched window
sits at the view's second index, which the status line shows (`1:coord` where it was `0:coord`). If
a tmux build did not run the hook, the observer would be left looking at the empty placeholder,
read-only, and would leave with the prefix and `d`; nothing else depends on the hook. The hook is
set as the observer joins, so a view whose client never arrived (the verb killed between making the
view and entering it) no longer ends with the watched window; `ward doctor` already names it as a
leftover view, with the command that ends it. And what phase 3 said of participants still holds:
which session they land in is tmux's choice.

**2. What the open's report promises.** "An exited run is legible" asserted that
`ward session open --detach` of a stand-in harness that exits at once reports `exited 3`. That is
true when the run has ended within the 300 ms beat before the read-back, and on a loaded machine it
sometimes has not: the stub is a shell that walks the workspace before it exits.

Decided: the report is one read, and `live` is an honest answer. Ward is not the hosted run's
parent, so it cannot wait on it, and no fixed wait turns a read into a promise — a harness that
fails after two seconds is as real as one that fails after two hundred milliseconds. The beat stays
as the courtesy it is (a missing program or a bad flag is usually reported by the open itself), and
the promise is stated where the value is declared (`HostedRun.live`): the truth as of that read —
`exited` with how it ended, or `live` — and every later read (`ward session show`) says how the run
ended, from the window kept for it. Making the open poll for longer was weighed and loses: it slows
every healthy open to buy a report that is still only usually right.

The case now asserts exactly that: the open's state is `live` or `exited`, carries exit status 3
when it is `exited`, and names a window; then `session show`, waited on, reads `exited 3` from that
same window. The observe case's refusal of an ended run had the same exposure — it observed straight
after the open — and now waits the same way. That a dead window classifies as `exited` with its
status needs no clock and stays where it was, in `test/agent/host.test.ts`.

**3. The manifest says where a terminal lands.** The "Detached sessions — floor hosts" section gains
one bullet: a terminal sitting in a host or attached through a view is moved to another tmux session
still standing on that server (tmux's choice, possibly one of the human's own) and returns to the
shell only when none is left; a terminal observing returns to the shell as soon as its window goes,
with a line saying what became of the session. The outgoing default's hash joined the `AGENTS.md`
lineage and the pin moved.

**Tests.** `test/host/tmux.test.ts` pins the two argv changes. In `test/host/tmux-live.test.ts`,
phase 3's three-client case (one client in the host, one in an attach view, one in an observe view,
the observer joining last) now asserts both halves: the two participants are in the host still
standing and neither process has exited, no read-only client is left on the server, and the
observer's process has exited 0 having been told the session was closed. Run against a build where
the observe view alone detaches its clients, the same case fails on the participants — it is a test
of the cascade, not only of the observer. A second case walks one observer after another through
closed, gone, restarted, and leaving by choice, with a session of the human's own standing as the
place tmux would otherwise have put them.
