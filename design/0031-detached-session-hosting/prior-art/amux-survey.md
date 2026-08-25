# The amux multiplexer survey — <https://amux.io/guides/best-ai-agent-multiplexers-2026/>

**Landscape in four sentences.** The survey ranks twelve tools across three tiers — seven dedicated
multiplexers, two multi-agent features built into coding tools, three cloud platforms — and the
dedicated tier is uniform underneath: almost all are tmux plus git worktrees, differing mainly in
how thick a control plane sits on top. What the field competes on is not hosting but _observation
and orchestration_: dashboards, mobile access, REST APIs, cost tracking, kanban boards,
agent-to-agent messaging. Detached, survivable hosting is so assumed that it is not a column in the
survey's own feature matrix — it surfaces only in prose, and only as a deficiency, when a tool lacks
it. No surveyed tool holds a durable record that outranks its live host, yet the surveyor's own code
turns out much closer to Ward's posture than its marketing is.

**Everything from the survey is secondhand** — a vendor's comparison of its own category, read once,
per-tool claims unverified against those tools' code. The amux section is the exception: it
separates site claims from what was read in `github.com/mixpeek/amux` at HEAD, and the divergence is
itself a finding.

## Vitals

Published by **amux** the organization — no human byline in the page or its `schema.org` `Article`
block — `datePublished` 2026-07-16, `dateModified` 2026-08-13. amux is the first-ranked tool in its
own survey, built by Mixpeek; every entry terminates in an "amux vs X" link and the page ends in an
install call to action — a comparison funnel. The site is also stale about its own product, calling
amux "a single Rust binary" on one page and "Python server + tmux" on another, while its repository
is 199 Rust files whose README says the Python install channels the guide still advertises are
retired. One point in its favor: the matrix scores amux's own git isolation as merely "Manual", an
unflattering entry a pure advertisement would have omitted.

## The axes the field compares on

The matrix columns are: parallel sessions, git isolation, self-healing, web dashboard, mobile
access, REST API, cost tracking, task board, agent comms, cross-platform, open source, free.
**Parallel sessions is the only universal** — every tool scores "Yes"; running N agents at once is
the price of admission. **Git isolation is the settled answer to a settled problem:** the FAQ names
worktrees, directory-per-agent, and cloud sandboxes, treating per-agent worktrees as the default
correct one — Ward is already on the winning side, so 0031 need spend no budget there.

**Hosting technique is invisible.** There is no "survives terminal close", "detach/attach",
"persistence", or "recovery" column, despite five of seven dedicated multiplexers being tmux
wrappers. The concept appears twice on the whole page: the FAQ's claim that a dedicated multiplexer
"adds session persistence, crash recovery, cost tracking, mobile monitoring, and inter-agent
coordination" over Claude Code's Agent Teams, whose "sub-agents can't survive beyond the parent
process"; and the `amux vs cmux` row where a tool _loses_ — "Session restore — amux: Full (tmux
sessions persist); cmux: Layout only". Detachment is table stakes, free with tmux, and noticed only
in its absence.

**Where the tools cluster.** The complexity spectrum runs ittybitty → dmux → workmux → Agent Teams →
Superset → cmux → amux → Devin: a thin tier over tmux + worktrees with no server and no record, a
GUI/native tier that renders its own terminals and therefore _gives up_ persistence (cmux), and a
platform tier holding state in a long-lived server. Its gloss is the page's most useful sentence
here: "A bash script has nothing to break. A platform server has many things that could break."

## amux's own approach, read in source rather than taken from the site

The marketing claims a "self-healing watchdog" that auto-restarts crashed agents, auto-compacts
context overflows, and waits out rate limits "without human involvement". **The code contains no
agent watchdog** — a crashed agent is reported, not auto-restarted. What is there is closer to Ward
than to the advertisement:

- **One tmux session per agent**, one window, one pane, named `amux-<name>` — and in the newer
  orchestrator `amux-<worker-ulid>`, keyed to an immutable id rather than the display name, under a
  stated invariant that renames must never orphan processes.
- **A durable record beside the live host, not inside it:** `~/.amux/sessions/<name>.env` plus a
  `.meta.json` holding the provider conversation id and restart counters, with SQLite for workers,
  sessions, and conversations. Killing tmux loses the process, not the registration.
- **Harness-native resume:** `claude --resume <conv_id> --name <n>`, the id read from that meta
  file; gemini `--resume`; codex `exec resume`. Refs are provider-filtered so a runtime swap never
  replays a foreign id, and the fresh-start fallback fires only on _positive_ evidence the agent is
  gone (a shell prompt **and** a childless pane).
- **Reconcile that never kills.** Startup reconciliation joins `amux-`-prefixed tmux sessions
  against the DB: a live row with no backend is closed as crashed; a backend with no row is only
  _reported_ stale, with the in-code reason "it may be someone's live work — never auto-kill on
  sight." The pass is guarded so a failed probe marks nothing, and destructive verbs refuse any
  target outside `amux-`.
- **A separate observe path:** `capture-pane -p -e` for peek plus a continuously armed `pipe-pane`
  writing a redacted log to disk; attach is plain `tmux attach-session`. Peek returns 409 with no
  live session because "absence of a session and absence of output are different facts."
- **Exit status made readable** — `set-option remain-on-exit on` before the command runs, then
  `#{pane_dead}:#{pane_dead_status}:#{pane_dead_signal}` — and **exact-match targets**:
  `-t
  '=amux-<name>'` for session verbs, `-t '=amux-<name>:'` for pane verbs, the `=` documented
  as the fix after tmux prefix matching once killed the wrong session.

## Named tools ward has not yet examined

- **amux** — Rust server over per-agent tmux sessions. <https://github.com/mixpeek/amux>
- **workmux** — worktrees + tmux windows from YAML tasks; kitty, WezTerm, Zellij backends too.
  <https://github.com/raine/workmux>
- **ittybitty** — ~200-line bash script, Claude Code into tmux, one worktree each.
  <https://github.com/adamwulf/ittybitty>
- **Superset** — "agentic IDE", 100+ agents in parallel worktrees. <https://superset.sh>
- **Termdock** — cross-platform AI-aware multiplexer, per-session CPU/memory monitoring, web session
  viewer. <https://termdock.com>
- **Claude Code Agent Teams** — `--agent-teams`; sub-agents in worktrees, none outliving the parent.
  <https://github.com/anthropics/claude-code>
- **OpenHands** — Docker-sandboxed self-hostable agent platform.
  <https://github.com/All-Hands-AI/OpenHands>

Two further surveys surfaced while checking these, worth a later read as independent cross-checks:
`morphllm.com/parallel-coding-agents`, and implicator.ai's "Tmux Keeps AI Coding Agents Alive After
You Disconnect", which argues this entry's thesis directly.

## Takeaways for ward

1. **Detached hosting is table stakes; stop framing it as the achievement.** Five of seven dedicated
   multiplexers are tmux wrappers and none advertise persistence, because tmux gives it away. 0031's
   differentiator is record-before-launch, the pure-function host name, and attach-as-re-create —
   not `--detach`.
2. **Use exact-match tmux targets, and scope destructive verbs to the namespace.** amux writes
   `-t
   '=amux-<name>'` after prefix matching once killed the wrong session, and refuses to
   terminate any ref outside `amux-`. Every 0031 mechanism (`has-session`, `attach-session`,
   `kill-session`, `switch-client`) currently reads `-t <name>`. Both fixes fit in
   `src/host/tmux.ts` and close a class of mistake no caller can otherwise guard against.
3. **The host name must not be derived from a mutable field.** amux keys its backend ref to an
   immutable ULID under an explicit invariant that renames must not orphan processes.
   `ward-<workspace-name>-<session-id>` embeds the workspace _name_, editable in `workspace.md`;
   rename a workspace and every derived name stops resolving, converting live sessions into strays
   no record can name. Derive from an immutable identifier, or say that renaming orphans hosted
   sessions and let doctor report it.
4. **Set `remain-on-exit on` and read `#{pane_dead}`.** 0031 rightly accepts that a hosted run's
   exit is "discovered, not observed" and refuses a shim to report it back — but tmux hands over
   exit code and signal for free if `remain-on-exit` is set before launching, turning "the session
   is gone" into "exited 0" or "killed by SIGKILL". It does change teardown: dead panes linger, so
   `close` must kill them regardless.
5. **A failed probe must not be read as absence.** amux marks nothing crashed when any backend probe
   fails. Doctor's gone finding and attach's re-create branch both turn on `has-session`; if tmux is
   installed but its server is unreachable or the call errors, Ward must say "could not determine",
   not "not running" — the latter sends `attach` to re-create a live conversation.
6. **Harness-native resume and degrade-don't-guess are both validated.** amux resumes with
   `claude
   --resume <conv_id>` from a durable meta file and clears that id only on positive
   evidence the agent is gone — a second independent implementation (after herdr) of 0031's
   re-create path, and backing for its refusal to open an empty conversation when the transcript is
   gone.
7. **Size the session at creation, and tag events by run generation.** amux passes `-x`/`-y` to
   `new-session`, confirming herdr's finding that a hosted TUI created at 80×24 misrenders on first
   attach. Its status arbiter also stamps each report `from_this_life` so one predating the last
   restart is discarded — Ward's `attached`/`observed`/`resumed` stream spans re-creates and needs
   that distinction, or a post-reboot record reads as one life.
8. **The visible gap is fleet-level roll-up.** Every differentiator above the hosting layer —
   dashboards, mobile push, notification rings, status inference — answers "which of my N agents
   needs me". 0031 ships per-session `observe` and doctor findings; nothing rolls N sessions into
   one answer. `ward status --json` is the natural home and the new events are the start of it.

## Conflicts with ward's posture

**Marketing consensus versus built consensus.** The survey sells eager, unattended self-healing —
the watchdog restarts the crashed agent at 3am — while 0031 is deliberately lazy: records stay
`open` after a reboot, doctor reports gone live halves as information, and each thread returns only
when someone runs `attach`, explicitly "no mass restart burning tokens on threads nobody is ready to
look at". A reader arriving from this category will read laziness as a missing feature, so the entry
should say out loud that Ward's unit of work is a reviewed pull request, not an overnight backlog
burn. In the code the conflict mostly evaporates: the field's flagship self-healing tool has no
agent watchdog, and its reconciler declines to kill strays for exactly Ward's reason. On the posture
that looked most contrarian — doctor surfaces and never acts — the best-resourced tool here
independently arrived at the same rule and the same justification.

**Observation surface.** The field's answer is a web dashboard and a REST API; Ward has neither,
which reads as a gap only if Ward is a fleet console rather than a record of work with a CLI over
it. The piece worth borrowing is not the dashboard but the endpoint semantics: amux returns 409 on
peek with no live session because "absence of a session and absence of output are different facts",
the distinction 0031 draws when `observe` refuses on a dead host rather than showing an empty pane.
