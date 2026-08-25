# 0031 — Detached session hosting

> The multiplexer seam, realized: `ward session open --purpose TEXT --detach` starts the agent
> inside a tmux session whose name is minted from workspace and session identity, **recorded on the
> session**, and treated as opaque thereafter — the run survives the human walking away.
> `ward session attach ID` maps the record back to the live session — confirming the live half is
> actually Ward's before trusting it — or re-creates it from the record when the host has lost it;
> `ward session observe ID` watches read-only; `resume` learns to point at a still-live run instead
> of starting a competing one; `close` tears the live half down, dead panes included; `locate` and
> `doctor` learn to tell the live cache from the durable record, and to say "could not determine"
> when they cannot tell. The record stays the only source of truth throughout — a reboot loses
> panes, never threads.
>
> **Status:** proposed · **Started:** 2026-08-24

This entry is **design-only**: the complete, reviewable plan for the next arc, written before the
build so the plan can be judged as its own unit. The build that realizes it will journal into this
entry's build log (or into a successor that links back here) once this design is accepted.

The commissioning directive, restated in the entry's own words:
[0029](../0029-launched-sessions/README.md) made Ward launch agents — foreground, in the caller's
terminal, dying with it — and its SF-002 named the debt precisely: that start satisfies the
multiplexer seam's **baseline** and not the capability the seam **adds**, keep-alive-when-detached.
This arc pays that debt. A Ward-launched session must be able to outlive the human walking away, be
re-attached, be watched without being disturbed, and be found again from nothing but its durable
record — and the design must be concrete enough that a builder who was not in the room can start
from it.

The first draft of this design was then tested against a systematic survey of eleven comparable
systems, committed beside this entry under [`prior-art/`](prior-art/), and rewritten where the
evidence changed the answer (the build log records what moved). The survey is indexed under Design
and cited, file by file, at the point of each decision it justified.

## Serves intent

- [`session-multiplexer`](../../intent/02-subsystems/01-session-multiplexer.md) — the seam this
  entry exists to realize, constraint by constraint: **keep it alive when detached** is the hosted
  open; **(re-)attach** and **observe read-only** are `session attach` and `session observe`; **map
  a recorded reference back to a live session, and re-create it when not running** is the recorded
  host-name mapping plus attach's re-create path — with the mapped-to session **verified as Ward's
  own** before it is trusted (SF-006 asks the seam to require this); **the live host is a cache over
  the record** (§16) governs every flow below — nothing essential ever lives only in a pane; **group
  by scope, label by identity** falls out of the naming scheme; the **theming coordination** is
  designed-for and deferred (below). The seam's baseline/added split, adjudicated out of 0029's
  SF-002, is what makes this entry an _addition_ beside the foreground technique rather than a
  replacement of it — design rule 4, plural techniques behind one contract.
- [`sessions-and-lifecycle`](../../intent/01-concepts/02-sessions-and-lifecycle.md) — **open ≠
  running** finally gets a live overlay worth the name: with a host that can be asked `has-session`,
  _running_ is derivable on demand and still never stored — and the overlay is honest about its own
  limits, answering _live_, _exited (with the status the host retained)_, _gone_, or _could not
  determine_, never conflating the last two. The lifecycle events grow `attached` and `observed`
  beside `opened`/`resumed`, so the trail keeps telling the truth about attention paid to a thread.
  The slice's "a different act deserves a different word" is taken seriously: attaching to a live
  process and resuming a stopped conversation are different acts here, with different verbs (and
  SF-001 asks the seam to say so).
- [`scopes-and-personas`](../../intent/01-concepts/01-scopes-and-personas.md) — _routing resolves to
  a session_, and for the human that means "the command to attach." 0029 could only offer `resume` —
  a restart wearing attach's name. With a live host, `ward session attach ID` is literally that
  command, which is the routing story the status personas are specified against.
- [`agent-harness`](../../intent/02-subsystems/03-agent-harness.md) — consumed, not changed: the
  hosted open runs the same `startArgv`/`resumeArgv` the foreground open runs, inside a host instead
  of the caller's terminal. The handle-assigned-before-start ordering survives intact, because the
  host wraps the spawn, not the id. The one place the seam's ground shifts under a long-lived host —
  the harness's native id **moves** across `/clear`, compaction, and forking — is named below and
  deferred with its consequence (Deferred, handle freshness).
- [`visual-theming`](../../intent/02-subsystems/05-visual-theming.md) — designed-for, not built: the
  recorded session name is the stable hook the theming entry will hang accents and glyphs on (tmux
  per-session status/border options), so nothing here has to move when that seam is realized.
- [`human-shell`](../../intent/02-subsystems/07-human-shell.md) — verbs read true: `attach`
  attaches, `observe` observes, `resume` resumes, and none of them wears another's meaning. Every
  refusal names its remedy with the exact command.
- [`principles`](../../intent/00-foundation/01-principles.md) — §16 (record then launch, host as
  cache), §17 (derive what is derivable; where a derivation's input is mutable, record the value
  actually used as launch provenance — the naming decision below), §19 (two techniques, one
  contract, convergence judged in use), §20 (a missing host degrades or refuses honestly, a probe
  that fails answers "could not determine", and doctor can name the break and its remedy), §18
  (teardown of live state rides on the deliberate close, never on a sweep), §6 (attach, observe, and
  close are idempotent against the live layer), and the prime directive
  ([vision](../../intent/00-foundation/00-vision.md)): a dozen detached sessions a human can find by
  name at a glance is context management on the human's side of the table.

## Scope

- **In** (what the build this design commissions will deliver):
  - **The premise validation, first.** Before anything else is built: a smoke check against a
    **real** tmux proving Claude Code initializes healthy in a detached session at the design's
    explicit size — because the field reports interactive TUI agents crashing when initialized
    detached ([muxel](prior-art/muxel.md), which deliberately omits `-d`;
    [herdr](prior-art/herdr.md), which defers resume until a client supplies real size and theme).
    The pivot is named now: if the premise fails, the hosted open becomes attach-then-launch inside
    tmux (create attached, launch, detach), the rest of this design standing unchanged on top.
  - **The host adapter** — `src/host/tmux.ts`, a new `src/host/` tree mirroring `src/harness/`: the
    name-minting function and its munge, argv builders for new/attach/observe/kill/has/list plus the
    inspection reads (probe, `#{pane_dead}` status, `show-environment`, the `@ward_*` options), a
    runner, and **probe-outcome classification** (live / not running / could not determine). Every
    `-t` target is **exact-match** (`=`-prefixed) and every destructive verb refuses a target
    outside the `ward-` namespace ([amux-survey](prior-art/amux-survey.md)). The **server-hygiene
    preamble** (below) runs before any first session. `WARD_TMUX_BIN` selects the binary — the
    hermeticity seam, `WARD_CLAUDE_BIN`'s exact pattern, so no test ever needs a real tmux server.
  - **The hosted open** — `ward session open --purpose TEXT --detach`: record first (the minted host
    name **written onto the record**), then — strictly after the store lock is released —
    `tmux new-session -d` at an explicit size, running the same harness argv the foreground path
    builds, with the ownership stamps set and `remain-on-exit on`; verify the host holds the run;
    print the attach affordance and return. `--foreground` forces the baseline; bare `open` follows
    the resolved `agent.host` (below).
  - **Attach** — `ward session attach ID`: live and verified ours → attach (or `switch-client` when
    the caller is already inside tmux); dead pane → the discovered exit recorded, the dead host
    cleared, then re-create; gone-but-open → **re-create from the record** (a hosted resume) and
    attach; ours-in-name-only → refused naming the foreign holder; could-not-determine → refused
    with the diagnosis; closed → refused by name.
  - **Observe** — `ward session observe ID`: read-only attach to a live hosted session.
  - **Resume, host-aware** — `ward session resume ID` refuses while the host holds the run **live**
    (a dead pane is not a live run), pointing at attach; otherwise behaves as today, with `--detach`
    hosting the resumed run.
  - **Close tears down the cache** — `ward session close ID` (and the task-close cascade) kills the
    session's live host session when one exists — running or dead-pane alike — idempotently, and
    only after verifying the name is Ward's own.
  - **Locate's live half** — `ward session locate ID` reports, beside the transcript answer, what
    the host says right now: the recorded name and a classified state — `live`, `exited` (with the
    status and signal the host retained), `gone`, or `unknown`.
  - **Doctor** — host present (binary + version); **strays** (live `ward-…` sessions no record
    explains — joined by whole-name equality against every record's stored name, attributed via the
    `@ward_workspace` stamp, flagged when a client is attached right now, and named with the exact
    `tmux kill-session` remedy, never swept); the informational converse (open sessions opened
    detached whose live half is gone or dead — ordinary after a reboot, reported as fact with the
    retained exit status where there is one, not failure); an unreachable or erroring tmux reported
    as **could not determine**, never as "no strays"; and **version skew** (live sessions stamped by
    an older ward) as information.
  - **Configuration** — `agent.host: foreground | tmux` on 0028's two-layer, per-key ladder
    ([0028](../0028-agent-configuration/README.md)); unset resolves to `foreground`.
  - **CLI plumbing** — `--json` shapes for the new and changed verbs, `ward schema` coverage,
    completion, telemetry's verb tree, and the manifest's Sessions section extended to teach
    detach/attach/observe.
  - **Tests** — the adapter's name-minting, munging, and argv tables (every target exact-match);
    end-to-end suites through the spawned CLI against a **stub tmux** (records its argv, simulates
    has/new/attach/kill/show-environment), including the record-written-before-`new-session`
    ordering, the store lock **not** inherited by the spawned host ([pond](prior-art/pond.md)'s
    inherited-descriptor hazard), the ownership-mismatch refusals, the could-not-determine paths,
    the dead-pane flows, the degrade and refusal paths, and doctor's findings against fabricated
    stray lists.
- **Deferred:**
  - **Handle freshness — a refresh channel for the recorded harness handle.** The harness's native
    id is a moving target: `/clear`, compaction, and forking each mint a new one
    ([herdr](prior-art/herdr.md), whose Claude integration hook-feeds the changing id back), so a
    long-lived detached session will outrun the handle recorded at open. In scope now is the honest
    floor: attach's re-create is gated on `locate` (probe before resume,
    [muxel](prior-art/muxel.md), [background-agents](prior-art/background-agents.md)), and a
    re-created host found dead at its verification beat is read as a bad handle and recorded. The
    channel itself is deferred: its natural shape is 0029's already-designed SessionStart hook
    (zero-token, `WARD_AGENT`-gated) feeding the new id back over a `ward` verb, with
    [dmux](prior-art/dmux.md)'s read-the-process's-open-transcript-fd technique as the
    zero-cooperation fallback for doctor's attribution. _Why safe — and the named consequence:_ the
    live pane is unaffected (attach never needs the handle), and nothing fails silently — but until
    the refresh arc lands, a detached session that `/clear`s or compacts strands its recorded handle
    on the older conversation, so a re-create after that life ends resumes the pre-`/clear` thread
    and `locate` reports the older transcript. Named here so the arc that fixes it starts from the
    consequence, not from a mystery.
  - **`release` — deliberately parking a live half while the record stays resumable**
    ([bb](prior-art/bb.md) names it as its own act, distinct from interrupt and close). _Why safe:_
    the act is already possible honestly — a human killing the pane by hand leaves the ordinary
    open-and-gone state that attach re-creates, which doctor reports as information — and this
    entry's teardown and findings are exactly the machinery a later `release` verb composes.
  - **Fleet visibility — "which of my N detached sessions needs me."** The recurring gap across the
    field ([herdr](prior-art/herdr.md)'s blocked-state roll-up,
    [prime-agent](prior-art/prime-agent.md)'s Running/Idle/Inactive roster,
    [amux-survey](prior-art/amux-survey.md)'s observation-dashboard tier). _Why safe:_ this entry
    ships the primitives — the `attached`/`observed` events, locate's host block, doctor's
    whole-record join — and a roll-up is a read over them, belonging to the status and theming
    surfaces ([prime-agent](prior-art/prime-agent.md)'s Herdr integration is the proven mechanism
    the theming arc can start from).
  - **Messaging, dispatch, and wake riding on the host.** _Why safe:_ that is the messaging seam's
    own arc, and its contract is already **recorded-first** — live delivery is an optimization it
    may later hang on this host, and nothing built here closes that door (SF-002 records the line
    this entry draws).
  - **Fork (`--fork-session`) in any mode.** _Why safe:_ forking is the harness seam's open
    question, orthogonal to hosting — a fork, whenever it lands, is a **new session** with its own
    identity and handle, and this design hosts any session it is handed (SF-003).
  - **Task- and project-scope launches.** _Why safe:_ 0029's deferral stands and nothing here
    narrows it — attach, observe, locate, and close are **id-addressed** and scope-blind, and the
    name minting already carries any session id, so the scoped launches arrive as data plus a verb,
    not a migration of this entry's work.
  - **Theming the host surface** (accents, glyphs, status lines). _Why safe:_ the theming seam owns
    it, and the recorded name is the stable hook it needs; painting on top of a name changes no
    mapping.
  - **Grouping several Ward sessions into one tmux session per floor** (windows-per-scope). _Why
    safe:_ today's one-host-session-per-Ward-session mapping keeps attach and read-only semantics
    exact (both are per-tmux-session); prefix grouping serves the at-a-glance need now, and a
    regrouping later changes only the adapter's mapping — the record knows nothing of panes. The
    prior art also prices the change honestly: window ids are not derivable, so per-thread windows
    would need a stored secondary key with its own rebinding rules ([dmux](prior-art/dmux.md) built
    exactly that — an encoded pane title, a rebinder, and rules for when a renamed title must not
    rebind).
  - **A dedicated tmux server** (`tmux -L ward`). _Why safe:_ an isolation lever kept in reserve;
    the default server is where the human's own eyes and muscle memory already are (below, the
    naming decision), and moving later orphans only cache.
  - **Observing a session that is not live** (transcript tailing). _Why safe:_ the record and
    `locate` already answer "what happened"; observe is defined against liveness, and an honest
    refusal names `locate` as the reader for the rest. The prior art suggests the fuller shape — a
    view served from the record with no producer alive ([isolade](prior-art/isolade.md)) — and that
    is the deferred entry's starting point, not a change to this one.
- **Acceptance** (the exit test of the build, stated now so review can judge it): `mise run check`
  green, and suites proving — **the premise validated first** (Claude Code healthy in a detached
  session against a real tmux, or the named pivot taken and recorded); the name minted, munged, and
  **recorded at open, with every later consumer reading the recorded name** (a record whose stored
  name differs from a fresh derivation still attaches, observes, and closes correctly — the
  workspace-rename case); every scripted target exact-match; the record on disk before the stub tmux
  sees `new-session`, and the spawn issued only after the store lock is released; ownership verified
  before attach/kill/report, with the foreign-holder refusal naming the remedy; `remain-on-exit` set
  at create, the dead-pane state read with its exit status, and close killing live and dead sessions
  alike while staying idempotent when none exists; attach choosing attach vs `switch-client` vs
  clear-dead-then-re-create vs re-create by classified probe answer, and refusing — never
  re-creating — on could-not-determine; observe passing `-r`; resume refusing on a **live** pane
  with the attach command in the message and proceeding over a dead one; the explicit-flag refusal
  and the configured-default degrade, each naming its consequence; locate's `host` block in `--json`
  with its four-way state; doctor naming a stray with its remedy, attribution, and attached-client
  flag, and reporting an erroring tmux as could-not-determine; and every pre-0031 record parsing
  unchanged. For **this design-only unit**, acceptance is the gate green over the documents and this
  plan surviving review.

## Design

### Prior art

The design was rewritten against a survey of eleven comparable systems — each file carries verified
mechanics, takeaways for Ward, and conflicts with Ward's posture — committed beside this entry so
the evidence is reviewable where it is cited:

- [herdr](prior-art/herdr.md) — the inverted posture (live server as truth) at 32k stars; hook-fed
  handle freshness, terminal sizing, the attach/observe/takeover triad, the environment-at-open
  trap, version skew.
- [bb](prior-art/bb.md) — record-as-truth independently validated in production; typed interruption
  reasons, `release`, anti-flap, resume-capability honesty, stale-event tolerance.
- [dmux](prior-art/dmux.md) — pure-function naming validated at a year of use; fd-based handle
  recovery; publishing identity into the live host; what automatic healing costs; kill-order
  asymmetry.
- [pond](prior-art/pond.md) — the record↔live seam's disciplines: re-derive every run, whole-name
  joins, ownership checks before trust, the inherited-flock hazard.
- [isolade](prior-art/isolade.md) — one ensure path for open and re-attach; stale-live as a third
  state; persistence-before-fan-out as an ordering rule.
- [agent-term](prior-art/agent-term.md) — generation stamps that invalidate all live pointers at
  once; live-vs-reapable as different predicates; the price of never storing the handle.
- [muxel](prior-art/muxel.md) — recorded-name-wins mapping; the detached-init crash report;
  transcript pre-flight before resume; tmux server hygiene, verbatim.
- [cmux](prior-art/cmux.md) — binding by injected token, never by name or title; process-generation
  identity; the two-gate resume race; mutable workspace keys as a named failure.
- [prime-agent](prior-art/prime-agent.md) — the daemon alternative, and why Ward declines it;
  observe-as-protocol vs `-r`; the stray predicate; visible recovery markers.
- [background-agents](prior-art/background-agents.md) — two status vocabularies that share no words;
  fencing orphans out instead of hunting them; probe-then-fallback resume.
- [amux-survey](prior-art/amux-survey.md) — the field at large: detachment is table stakes;
  exact-match targets, `remain-on-exit`, the mutable-name hazard, and probe honesty from the
  surveyor's own source.

- **Decisions:** rests on
  [ADR 0006 — tmux as the detached session host](../decisions/0006-tmux-detached-host.md) (proposed
  with this entry, and amended against the survey): the candidates surveyed against the seam's
  constraints, tmux recommended as the **added technique** beside the foreground baseline.
  Entry-local decisions:

  - **Two techniques, one contract — and how convergence will be judged.** Foreground stays the
    universal, dependency-free technique; tmux hosting is the technique for work that must outlive
    the terminal. Neither replaces the other on paper: both ship, `agent.host` and the flags pick
    per use, and the evidence that decides is real usage — the telemetry verb tree already counts
    invocations per verb and flag, and frictions land in the build log of whichever entry observes
    them. Convergence is recorded, per design rule 4, as either one technique kept or an explicit
    technique→situation rule (the expected outcome: foreground for sit-with-it work, detached for
    walk-away work — but that is a hypothesis for use to confirm, not a conclusion). The field's own
    matrix says detached hosting is table stakes once tmux is in hand
    ([amux-survey](prior-art/amux-survey.md)); what this entry actually contributes is the
    record-before-launch ordering, the recorded-name mapping, and attach-as-re-create.
  - **The premise is validated before it is built on.** This design's hosted open initializes an
    interactive TUI agent with no client attached — and the prior art reports exactly that crashing:
    [muxel](prior-art/muxel.md) abandoned a detached viewer because Claude crashed initializing
    detached and its desktop deliberately omits `-d`; [herdr](prior-art/herdr.md) defers resume
    until an attached client supplies real size and theme, and raised its headless default terminal
    to 120×40 because TUIs rendered garbage. So the hosted open sizes the session explicitly
    (`-x 120 -y 40`, herdr's field-tested floor; [amux](prior-art/amux-survey.md) sizes the same
    way), and the build's **first act** is the smoke check named under Scope, with the pivot
    (attach-then-launch) stated in advance. _Why first:_ everything else in this entry survives the
    pivot; building the rest before checking the premise would be stacking on an unverified floor.
  - **Record, then launch — unchanged by the host, and now with the lock ordering stated.** The
    session document is written and committed before `tmux new-session` runs, exactly as 0029
    ordered the foreground spawn — the ordering rule two independent record-as-truth systems
    converged on ([bb](prior-art/bb.md); [isolade](prior-art/isolade.md), which aborts the producer
    if the persist fails). The host adds no new window between record and process: a crash between
    the two leaves an open record whose handle and host name resolve to nothing — a named, honest
    state ([prime-agent](prior-art/prime-agent.md) calls its equivalent _uncertain_ and never
    replays it), which `locate` and doctor report as such. One new constraint the survey added: the
    spawn happens **strictly after the store lock is released**, because a subprocess spawned while
    a lock is held inherits the open file description — and the tmux _server_ the first hosted open
    may fork outlives the CLI, which would leave `.ward/store.lock` held by a process that never
    returns it ([pond](prior-art/pond.md) hit exactly this class). The build carries the test.
  - **Detach means Ward is no longer the run's parent — and the host, not a shim, keeps the exit
    legible.** The foreground open waits and propagates the run's exit code; a hosted open cannot,
    and does not pretend to: it returns once the host holds the run. No shim is wrapped around the
    harness — a shim would put Ward machinery inside the run's process tree for the sake of an exit
    code the record does not need (open ≠ running; an exit was never a close). But the first draft's
    "the exit is discovered, not observed" gave away more than the technique demands: with
    `remain-on-exit on` set at create, the **host itself retains the exit fact** — the pane stays,
    dead, with `#{pane_dead}`, `#{pane_dead_status}`, and `#{pane_dead_signal}` readable — so "the
    live half is gone" becomes "exited 0" or "killed by SIGKILL" ([amux](prior-art/amux-survey.md)
    sets exactly this before the command runs). The consequence is owned rather than hidden: a
    session name now outlives its process, so liveness is layered (next decision), every create path
    clears a dead predecessor after recording what it found, and close kills dead sessions as
    readily as live ones.
  - **Liveness is layered, and a probe that fails answers "could not determine" — never "not
    running."** Three facts, each derived fresh at read time and never stored: the host session
    exists (`has-session`, exact-match), its pane process is alive (`#{pane_dead}`), and the
    conversation is resumable (`locate`'s transcript answer) — [isolade](prior-art/isolade.md)
    wedged sessions into an error state until it separated "host up" from "conversation resumable",
    and `remain-on-exit` adds the middle layer here. And the probe itself can fail: a missing
    binary, an unreadable socket, an erroring `list-sessions`. That outcome is its own honest answer
    ([amux](prior-art/amux-survey.md) marks nothing crashed on a failed probe;
    [pond](prior-art/pond.md) forbids even caching a proof of emptiness) — attach must not re-create
    over it (that path forks a second process over a possibly-live conversation), and doctor reports
    it as a capability finding rather than a clean bill. One determinate case is named: "no server
    running" on the default server _is_ absence — no server, no sessions.
  - **One tmux session per Ward session.** Attach and read-only are per-tmux-session in tmux;
    mapping one-to-one keeps `attach ID` and `observe ID` exact — attaching to a thread never shows
    a neighbor's pane. Grouping is served by the name prefix (and tmux's own `choose-tree`);
    regrouping into per-floor sessions with per-thread windows stays open as a later adapter-only
    change (deferred, above, with its price named). Structured identity carrying both grouping and
    addressing is the pattern the record↔live seam's best prior art also lands on
    ([pond](prior-art/pond.md)'s derived session roots).
  - **The default tmux server, not a private socket — started hygienically.** Ward's sessions appear
    in the human's own `tmux ls`, prefix-grouped — discoverable exactly where a tmux user already
    looks, which is the seam's at-a-glance requirement met with zero new surface. A private
    `-L ward` server would isolate Ward from name collisions and from a stray `kill-server`, at the
    price of hiding every session from the surface humans actually check; if collisions bite in
    practice, the socket is a one-line adapter change and a superseding note here. Sharing the
    server obliges Ward to start it cleanly: the tmux server inherits the argv of whichever client
    first forks it, so a hosted open run naked would leave the workspace path sitting in the
    server's command line — and an agent clearing its own dev server with `pkill -f <workspace>`
    would SIGKILL the shared server and every session on the machine ([muxel](prior-art/muxel.md)
    documents the incident and the fix). Ward's worktree paths embed the workspace name, so it is
    squarely in that blast radius: the adapter runs `tmux start-server ';' set -s exit-empty off` —
    no workspace path in the argv, and `exit-empty off` because a session-less server otherwise
    exits before the first `new-session` — ahead of any create.
  - **The host name is minted by a pure function, recorded on the session, and opaque thereafter.**
    The minting rule is `ward-<workspace-name>-<session-id>`, munged to tmux's safe alphabet (every
    character outside `[A-Za-z0-9_-]` replaced by `-`; tmux rejects `.` and `:` in names). The first
    draft stopped there — a pure mapping, nothing stored — and the survey showed the flaw: the
    workspace name is a **mutable input** (editable in `workspace.md`), and a pure function over a
    mutable input orphans every live session the moment the input changes —
    [cmux](prior-art/cmux.md) forbids workspace-derived binding keys for exactly this,
    [amux](prior-art/amux-survey.md) keys its backend to an immutable id under an invariant that
    renames never orphan processes, and [muxel](prior-art/muxel.md)'s recorded-name-wins resolver
    documents the failure the alternative produces (duplicate sessions on every launch, teardown
    reaping the wrong name). So: the name is minted **once, at the hosted create**, written onto the
    session record (`hostName`), and **every later consumer reads the recorded name** — attach,
    observe, resume's gate, close, locate, doctor. Nothing re-derives, and nothing ever parses a
    name back apart (a workspace name containing `-` makes the name un-splittable, so joins are by
    whole-name equality only — [pond](prior-art/pond.md)'s rule). _Why this is not a §17 violation:_
    derive-don't-store forbids a second copy of derivable truth, and a value derived from a mutable
    input is not derivable truth — recording the name actually used is launch provenance in the
    exact sense of the recorded `model`/`effort` ([isolade](prior-art/isolade.md) stores the
    identity used and derives nothing from names). [dmux](prior-art/dmux.md)'s path-hash suffix was
    considered for the two-workspaces-one-name collision and declined: the recorded name already
    survives renames, and the residual mint-time collision is detected at create (a live session
    under the minted name that is not ours) and refused with its remedy — rare enough to be a
    refusal, not a suffix every human reads forever.
  - **Found by name is never "ours" — ownership is a token inside the live half, plus a generation
    stamp.** A name in a shared namespace can be satisfied by a stranger: a hand-made session, a
    rename, another tool. "Found by name" and "belongs to this record" are different facts
    ([pond](prior-art/pond.md)'s no-overwrite bug is the cautionary tale of the two being
    indistinguishable; [cmux](prior-art/cmux.md)'s principles ban name- and title-matching outright
    and bind by a spawn-injected token). The hosted create therefore stamps the live half with what
    the record can later verify: `WARD_AGENT=<session id>` in the **tmux session environment**
    (readable from outside the pane via `show-environment`),
    `WARD_HOST_EPOCH=<the creating
    lifecycle event's timestamp>` beside it, and
    `@ward_workspace` / `@ward_version` as session options for doctor's attribution and skew
    findings ([dmux](prior-art/dmux.md) publishes identity into the live host the same way). Attach,
    close, and doctor **verify before trusting**: a session wearing the right name whose
    `WARD_AGENT` does not match is refused (attach) or reported as foreign (doctor), never acted on.
    The epoch — the `at` of the `opened`/`resumed` event whose launch created this live half — is
    the generation marker that tells "my host" from "a host with my name from another life"
    ([agent-term](prior-art/agent-term.md)'s boot stamp, [cmux](prior-art/cmux.md)'s pid-start-time,
    [background-agents](prior-art/background-agents.md)'s credential rotation, all fencing the same
    ghost), and it costs no new record field: the event trail already carries the timestamp.
  - **The record gains `host` and `hostName` — how the run was started and the name it was started
    under, never whether it is running.** Optional `host: 'tmux'` (absent = foreground, so every
    pre-0031 record reads unchanged) and, present exactly when `host` is, the minted `hostName` —
    both set at open/resume when the run is hosted, both launch provenance in the exact sense of the
    recorded `model`/`effort`. They are what let resume, attach, and doctor reason about the live
    half without ever persisting _running_ (the lifecycle slice's hard rule; the two-vocabulary
    discipline [background-agents](prior-art/background-agents.md) states as a type-level warning —
    the durable lifecycle and the live incarnation's state share no words, and rendering one as the
    other is how two surfaces disagree about one session).
  - **Explicit flag refuses; configured default degrades — both honestly (§20).** `--detach` with no
    usable tmux is refused with the diagnosis and remedy: detachment was the point of the
    invocation, and a foreground session silently substituted would be the seam's named consequence
    hidden. `agent.host: tmux` with no usable tmux degrades to foreground and **says so** — "host
    tmux unavailable — running in the foreground; this session ends with this terminal" — because a
    preference must never be the reason an agent cannot start (0029's own §20 argument, extended
    from config to capability; [pond](prior-art/pond.md) draws the same line — degrade where
    correctness lives elsewhere, and here the record, not the host, carries correctness). Doctor
    names the precise break either way.
  - **Resume refuses over a live host — a detection, not a lock.** `claude --resume` on a
    conversation still running in a pane would race two processes over one thread's state. The gate
    asks the layered probe — a **live pane**, not a merely-present name (a dead pane is not a live
    run) — and the refusal names the true verb: attach. The guarantee is stated honestly: this is
    detection, and two resumes racing before either host exists both pass it
    ([cmux](prior-art/cmux.md) needed a second, TTL'd claim gate for the same race). Ward does not
    build a claim table, because the host itself arbitrates — tmux refuses a duplicate session name,
    so the losing racer's create fails, and it re-probes and points at attach. _Why safe:_ the name
    is the serialization point both racers funnel through, and the failure mode is a clean refusal,
    never two processes on one thread.
  - **Attach re-creates when the live half is gone — through the same path that opened it — and
    inherits locate's honesty when the transcript is gone too.** Re-create is a hosted resume: same
    handle, same recorded directory, the conversation continuing where it left off — the seam's
    "re-create it when not running" realized as composition, not new machinery. Internally the
    hosted open, attach's re-create, and `resume --detach` are **one ensure function** differing
    only in argv (start vs resume) and in whether the record already existed —
    [isolade](prior-art/isolade.md)'s "no separate first-attach path", so the rare path runs on
    every launch. Two create-or-attach shortcuts are declined by name: `new-session -A`
    ([muxel](prior-art/muxel.md)'s idiom) cannot choose between `startArgv` and `resumeArgv` — the
    decision needs the record — and the hosted open must _return_, not attach; and a `--continue`
    rung under the resume ladder (what [dmux](prior-art/dmux.md) and most of the field do when the
    exact id fails) is refused because latest-for-this-directory can steal a sibling session's
    conversation ([muxel](prior-art/muxel.md) documents precisely that hazard), and Ward runs
    several sessions over shared directories as a matter of course. When `locate` says the
    transcript is gone as well, attach refuses with that answer rather than silently opening an
    empty conversation under an old name — the lifecycle slice's fresh-run-is-a-different-act rule,
    enforced at the door.
  - **Close kills the cache; nothing else ever does.** Teardown of live state rides on the
    deliberate close (the same shape as task close tearing down worktrees), is idempotent when the
    live half is already gone, covers dead panes (which `remain-on-exit` makes linger), and is the
    **only** automatic kill in the design. It kills only a name it verified as Ward's own, and the
    adapter's destructive verbs refuse any target outside the `ward-` namespace
    ([amux](prior-art/amux-survey.md)). Doctor surfaces strays with the exact remedy and never acts
    on them — a sweep would spend §18's authority on a heuristic (SF-004 proposes the seam say this
    outright), and the counterexample is instructive: the one surveyed tool that auto-heals in both
    directions needed a lifecycle lock, a stale-operation sweep, a paused watcher, and
    kill-verification retries just to stop its own healer ([dmux](prior-art/dmux.md)) — and its
    healer is also why it must kill **before** mutating its record, where Ward's record-first order
    is safe precisely _because_ nothing here auto-recreates. That dependency is now stated, not
    incidental.
- **Layout:** new `src/host/tmux.ts` (adapter: minting, munging, argv builders — exact-match targets
  throughout — probe classification, dead-pane and environment readers, the hygiene preamble,
  runner, list parser) and `src/agent/host.ts` (the Ward-shaped half: the ensure function, hosted
  open/resume orchestration, attach/observe/re-create flows, ownership verification, close teardown
  — consuming `src/agent/run.ts`'s argv building rather than duplicating it). Changed:
  `src/agent/run.ts` (the launch grows a hosted variant), `src/agent/settings.ts` (the `host` key,
  enum-validated like `harness` — the host roster is Ward's own adapter list, exactly the reasoning
  that enum-validates `harness` and refuses to enum-validate `model`), `src/store/types.ts` (the
  optional `host` and `hostName` fields; `attached`/`observed` events), `src/workspace/sessions.ts`
  (event appends), `src/workspace/tasks.ts` (close cascade teardown), `src/workspace/doctor.ts`
  (host checks, stray/gone/could-not-determine/skew findings), `src/cli/index.ts` + `json.ts` +
  `schema.ts` + `suggest.ts` + `telemetry.ts` (verbs and shapes), `src/workspace/templates.ts` +
  `lineage.ts` (the manifest teaching detach/attach/observe). Tests: `test/host/tmux.test.ts`,
  `test/agent/hosted.test.ts`, a stub tmux beside the stub harness in `test/helpers.ts`, and the
  real-tmux premise smoke kept runnable but outside the hermetic gate.
- **Mechanisms:**
  - _Minting and mapping._ `mintHostName(workspaceName, sessionId)` =
    `ward-<workspace>-<session-id>` munged to `[A-Za-z0-9_-]` — a **minting rule, not a lookup**: it
    runs once per hosted create, its output is written to the record, and every consumer thereafter
    reads `hostName` and treats it as an opaque whole (joins by equality, never by parsing). The
    `ward-` prefix is the namespace: doctor's scan key, and the boundary the adapter's destructive
    verbs refuse to cross. The workspace-name component exists for the human reading `tmux ls`, not
    for any machine join.
  - _Hosted open._ Resolve configuration (host, model, effort, args) → mint the UUID and the host
    name → write and commit the record (state `open`, handle, `host: tmux`, `hostName`, directory,
    purpose, model/effort) under the store lock → **release the lock** → report (`--json` emits
    here, before any process) → hygiene preamble (`start-server ';' set -s exit-empty off`) → one
    chained tmux invocation:
    `new-session -d -s <name> -x 120 -y 40 -c <dir> -e WARD_AGENT=<id> -e WARD_HOST_EPOCH=<at>
    <claude argv> ';' set-option -t '=<name>' remain-on-exit on ';' set-option -t '=<name>'
    @ward_workspace <root> ';' set-option -t '=<name>' @ward_version <version>`
    → verify: exact-match `has-session`, then the pane not already dead a beat later (an instant
    death is reported now, with the retained exit status, instead of being left for later discovery
    — [muxel](prior-art/muxel.md) reads an immediate exit as a bad launch) → print the affordances:
    `ward session attach <id>` and the raw `tmux attach -t '=<name>'` beside it (the routing story
    hands humans a command that works even where `ward` is not on PATH). One inherited consequence
    is named rather than solved: a pane's environment descends from the **tmux server's** creation
    environment, not the invoker's — so credentials or agent sockets exported after the server first
    started are not in hosted runs ([herdr](prior-art/herdr.md)'s issue trail). Ward sets what it
    owns explicitly via `-e`; the rest is a documented property of the technique, and doctor's
    capability finding is where a confused human is pointed.
  - _Attach._ Resolve the session (open only) → read the **recorded** name → classified probe:
    **live and ours** (exact-match `has-session`, pane alive, `WARD_AGENT` matches) → attach —
    `tmux attach-session -t '=<name>'`, or `tmux switch-client -t '=<name>'` when `$TMUX` says the
    caller is already inside a client (attaching a nested client is tmux's own refusal; switch is
    the honest verb there). **Ours in name only** → refuse, naming the foreign holder and the remedy
    (never attach a human to a stranger's pane). **Dead pane** → read the retained exit, clear the
    dead session, and fall through to re-create — the discovered exit rides into the record as the
    `resumed` event's cause ("previous run exited 0", "killed by SIGKILL"), which is
    [bb](prior-art/bb.md)'s typed interruption reason realized without new schema. **Gone** →
    re-create: locate first; transcript found → the ensure path with `resumeArgv` (stamps, size,
    `remain-on-exit`, epoch = this `resumed` event's `at`), then attach; transcript gone → refuse
    with locate's path-and-retention answer. **Could not determine** → refuse with the diagnosis,
    never re-create. Append `attached` before handing the terminal over. Idempotent by construction:
    attaching twice is two clients on one session, tmux's ordinary case — and two attaches racing to
    re-create resolve at the host, where the duplicate-name refusal turns the loser's create into a
    re-probe and an attach.
  - _Observe._ Live and ours only: `tmux attach-session -r -t '=<name>'` — read-only enforced by the
    tmux server, not by politeness ([prime-agent](prior-art/prime-agent.md) needed a protocol verb
    pair and wrapped envelopes for the same guarantee; the enforcement coming free is the strongest
    argument for the technique). Appends `observed`. Dead or gone → refusal naming `attach` (which
    would re-create) and `locate` (which reads the history).
  - _Resume._ Unchanged flow from 0029, with one new gate at the top: read the recorded name, ask
    the layered probe, and refuse over a **live pane** with the attach command in the message. A
    dead pane does not block — its exit is recorded and the dead session cleared, since the name
    must be free for the create. `--detach` routes the resume through the ensure path (new host
    session, `resumed` appended, affordances printed, no wait).
  - _Close._ After the record mutation: read the recorded name, verify ownership, and
    `kill-session -t '=<name>'` if present — live or dead-pane alike; report the teardown in the
    mutation's steps. A kill that finds nothing is a no-op, not an error; a name that answers but is
    not ours is left standing and reported, never killed.
  - _Locate._ The existing transcript answer, plus a `host` block when the record says the session
    was hosted: `{kind, name, state, exit?}` — `name` the recorded name, `state` one of
    `live | exited | gone | unknown`, `exit` the retained status and signal when the pane is dead —
    and `null` for foreground sessions. Every field of the block is derived fresh at read time
    ([pond](prior-art/pond.md)'s re-derive-every-run rule); `kind` and `name` are the only stored
    halves, and they are provenance, not status. One read then answers both halves of "where is this
    session?" — durable history and live cache — with the cache clearly labeled as the half that may
    honestly say nothing, or say "cannot tell."
  - _Doctor._ Five findings. **Capability:** the tmux binary and version (a finding, not an error —
    foreground is a complete technique), including the version floor the stamps need. **Strays:**
    `list-sessions` filtered to the `ward-` prefix, joined by **whole-name equality** against every
    record's `hostName` (open and closed); a live name no open record explains is a stray — named
    with `tmux kill-session -t '=<name>'` as the remedy, attributed via its `@ward_workspace` stamp
    (useful precisely when the record is the thing that went missing), and flagged when
    `#{session_attached}` says a client is sitting in it right now
    ([prime-agent](prior-art/prime-agent.md)'s predicate — doctor should not nag about a session a
    human currently holds) — and never swept. **Gone:** open records with `host` set whose live half
    is absent or dead — reported as information ("not running — attach re-creates it", with the
    retained exit status where the pane lingered), because after any reboot this is the _normal_
    state of every detached session, and §20 forbids dressing the ordinary up as failure. **Could
    not determine:** an unreachable or erroring tmux reported as exactly that — never as "no strays
    found" ([amux](prior-art/amux-survey.md)'s guarded reconcile), and never memoized between runs.
    **Version skew:** live sessions whose `@ward_version` predates the running ward — information,
    because an old ward's sessions under a new ward is the ordinary result of upgrading with work in
    flight ([herdr](prior-art/herdr.md) grew detection and refusal text for the same meeting).
  - _Reboot, end to end (the scenario the seam exists for)._ The tmux server dies with the machine;
    every pane is gone; every record survives. Nothing needs sweeping: the records still say `open`,
    doctor reports the gone live halves as information, and each thread comes back through `attach`
    (re-create) exactly when someone wants it — no mass restart burning tokens on threads nobody is
    ready to look at. That laziness is a posture, stated deliberately: the field's marketing sells
    eager overnight self-healing, and Ward's unit of work is a reviewed pull request, not an
    unattended backlog burn ([amux-survey](prior-art/amux-survey.md) — whose own code, notably,
    declines to auto-restart agents too; [dmux](prior-art/dmux.md)'s restart-everything-on-load is
    the alternative, built, and priced). The future recovery arc orchestrates mass re-attachment per
    the lifecycle slice; this entry supplies the per-session mechanics it will call, and hands it
    one rule found in the survey so it is not re-derived there: anything that ever auto-recreates
    needs an anti-flap guard — a thread whose last interruption was itself caused by the recreation
    trigger is not auto-revived again ([bb](prior-art/bb.md)).

## Build log

### 2026-08-24 — The design, as its own reviewable unit

**Goal.** Design the multiplexer-seam arc completely enough that a builder can start from it, and
ship the design for review before any implementation exists. **What was done.** Read the governing
intent (the multiplexer seam and its neighbors: messaging, harness, theming, sessions-and-
lifecycle, scopes-and-personas, vision, principles), 0029 in full (the machinery this stacks on, and
the SF-002 that names the debt), and the current code read-only (`src/agent/run.ts`,
`src/harness/claude.ts`, the session record schema, the session verbs). Surveyed the host candidates
and recorded the choice as [ADR 0006](../decisions/0006-tmux-detached-host.md) (proposed); wrote
this entry — verb surface, naming, failure semantics, scope boundaries, and the acceptance the build
will be measured against. No `src/`, `test/`, or `intent/` files were touched: this is a design-only
unit, and the frictions it surfaced went to Spec-feedback below. **What works now — with the exact
command that proves it:** the two documents pass the repo's full gate — `mise run check` (Biome +
dprint + `tsc --noEmit` + `bun test` + lychee + actionlint) → exit 0 on this branch. **Decisions.**
All recorded under Design, above. **Next.** Human review of this entry and ADR 0006; on acceptance,
the build proceeds against the Scope and Acceptance stated here.

### 2026-08-25 — The prior-art sweep, absorbed

**Goal.** Test the proposed design against comparable systems before the human reviews it, and
rewrite it wherever the evidence changed the answer. **What was done.** Eleven systems were surveyed
in source and committed under [`prior-art/`](prior-art/) (the previous commit on this branch); this
entry and ADR 0006 were then rewritten against them. The load-bearing changes: the host name is now
**minted and recorded** rather than re-derived everywhere — a pure function over the mutable
workspace name would orphan every live session on a rename — and consumers treat it as an opaque
whole; every tmux target became **exact-match** and destructive verbs are scoped to the `ward-`
namespace; found-by-name is now **verified as ours** by a token and generation stamp the create
places inside the live half; `remain-on-exit` keeps the run's **exit legible** without a shim, which
layered liveness into host-present / process-alive / transcript-resumable and taught every create
and close path about dead panes; the **detached-init premise** — the field reports interactive TUI
agents crashing when initialized detached — became the build's named first validation step, with its
pivot stated in advance and the hosted session explicitly sized; probe failures became **"could not
determine"**, never "not running"; the hosted spawn moved **strictly after the store-lock release**;
and the `--continue` fallback and `new-session -A` were recorded as considered and declined. Newly
deferred, each with its why and named consequence: the handle-freshness refresh channel, `release`,
and fleet roll-up. Two new frictions went to Spec-feedback (SF-005, SF-006), and ADR 0006 was
amended in place — still proposed — with the caveats the survey added to the tmux choice. **What
works now — with the exact command that proves it:** the rewritten documents pass the repo's full
gate — `mise run check` → exit 0 on this branch. **Decisions.** All recorded under Design, above,
cited to the prior-art file that justified each. **Next.** Human review of the rewritten entry and
amended ADR; on acceptance, the build starts with the premise validation.

## Spec-feedback

- **SF-001** — [`session-multiplexer`](../../intent/02-subsystems/01-session-multiplexer.md),
  _Constraints_ ("map a recorded session reference … back to a live session **for resume**, and
  re-create it when not running"). _Friction:_ with a real host, the constraint's wording conflates
  two acts the lifecycle slice itself insists on keeping distinct: **attaching** to a run that is
  alive (joining a process, costing nothing) and **resuming** one that is not (re-establishing a
  live attachment). The seam's "for resume" reads as though mapping exists to serve resume, when in
  the hosted world the mapped-to live session is precisely the case where resume must _refuse_ (this
  design's resume gate) and attach is the true verb — the same different-act-different-word rule the
  lifecycle slice already applies to fresh-run-vs-resume. _Assumption to keep moving:_ the
  constraint means "map the record to the live session so a caller can reach it — attach when live,
  re-create (resume) when not," and this design builds that reading. _Proposed revision:_ reword the
  constraint to name both acts: "Map a recorded session reference back to a live session — to
  **attach** when it is running, and to **re-create it** (a resume into the host) when it is not."
  _Why it belongs in intent:_ the two-verb distinction holds for any host technique, and a design
  following the current wording literally could build resume-as-attach — the exact conflation 0029's
  routing note already had to apologize for.
- **SF-002** — [`session-multiplexer`](../../intent/02-subsystems/01-session-multiplexer.md) /
  [`messaging-coordination`](../../intent/02-subsystems/02-messaging-coordination.md), the shared
  open question (_multiplexer-vs-store split_). _Friction:_ both slices track "how much of
  dispatch/wake rides on the multiplexer" as open, and this design had to take a position to draw
  its own boundary: a live host makes injecting into a pane trivially available, and nothing in
  either slice says whether the hosting arc may start using it. _Assumption to keep moving:_ the
  host carries **hosting only** — no delivery, no wake, no nudge rides on it in this arc; every
  coordination flow stays recorded-first in the store, and live delivery over the host remains the
  messaging arc's optimization to design against its own contract (idempotent, recorded-first,
  re-armed on recovery — properties a raw pane injection has none of). _Proposed revision:_ note
  under both slices' open question that the split has a provisional floor: the multiplexer's
  responsibility ends at hosting; anything message-shaped that later rides on it is the messaging
  seam's design, built on the record. _Why it belongs in intent:_ it keeps a future hosting change
  from quietly becoming an unrecorded delivery channel — the leak the messaging seam calls out as
  the reason it is opinionated.
- **SF-003** — [`agent-harness`](../../intent/02-subsystems/03-agent-harness.md), _Open questions_
  (fork mode first) with
  [`scopes-and-personas`](../../intent/01-concepts/01-scopes-and-personas.md). _Friction:_ the
  fork-mode-first question is tracked as if some arc must resolve it before adjacent work can
  proceed, and this arc sits adjacent (the harness's `--fork-session` is the exact-clone mechanism,
  and a fork of a hosted session must live somewhere). Nothing says whether hosting may land first.
  _Assumption to keep moving:_ hosting is **neutral** to fork mode and lands first — an exact-clone
  fork, whenever it ships, produces a _new session_ with its own identity and handle (the harness
  seam already says so), and a new session is hosted by this design like any other open; the
  distilled-brief fork is just an open with a brief for a purpose. Neither mode needs anything from
  the host beyond what every session gets. _Proposed revision:_ one sentence under the open question
  recording that hosting does not gate on it: a fork in either mode arrives at the multiplexer as an
  ordinary new session, so the question stays open without blocking (or being reopened by) hosting
  work. _Why it belongs in intent:_ the question's answer will come from fork-arc evidence, and
  marking its non-dependency keeps a future builder from re-deriving this entry's neutrality
  argument — or worse, assuming hosting prejudged the mode.
- **SF-004** — [`session-multiplexer`](../../intent/02-subsystems/01-session-multiplexer.md),
  _Constraints_ (cache-over-record) with
  [`../../intent/00-foundation/01-principles.md`](../../intent/00-foundation/01-principles.md) §18.
  _Friction:_ the seam says the live host is a cache and never the truth, but is silent on **who may
  destroy live state and when** — and a cache full of processes is not a cache of bytes: killing a
  live pane discards an agent's un-recorded working state even though the durable record survives.
  This design needed the rule three times (close's teardown, doctor's strays, the temptation to
  sweep) and found it nowhere. _Assumption to keep moving:_ teardown of a session's live half rides
  on that session's **deliberate close** (the actor closing has the authority the close itself
  required); stray live sessions — cache entries whose record is closed or missing — are **surfaced
  with a remedy and never swept**, the same never-on-the-session's-behalf shape as the
  unresumable-thread rule. _Proposed revision:_ a clause in the seam: "**Live state is torn down by
  the lifecycle, not by hygiene.** Closing a session tears down its live hosting; anything live that
  no open record explains is surfaced to the human with its remedy, never reaped automatically."
  _Why it belongs in intent:_ it holds for any host, and without it every future design re-litigates
  whether doctor may kill — with §18 arguing one way and "just a cache" arguing the other.
- **SF-005** — [`session-multiplexer`](../../intent/02-subsystems/01-session-multiplexer.md),
  _Constraints_ ("Let a human or agent **(re-)attach**, and **observe read-only**"). _Friction:_ the
  seam names two grains of access and is silent on **multiplicity and write ownership**: whether
  attach implies a single writer, what a second attacher gets, and whether reclaiming input from a
  client that went away is a distinct act. The prior art treats this as designed surface —
  [herdr](prior-art/herdr.md)'s complete triad is attach (one writable client) / observe (many
  readers) / takeover (an explicit steal), and [prime-agent](prior-art/prime-agent.md) separates
  observation from steering at the protocol — while tmux's native attach is **shared-write**: two
  attachers mirror keystrokes into one conversation, which is less safe than either of that triad's
  poles. This design had to take a position with no constraint to lean on. _Assumption to keep
  moving:_ shared-write attach is admissible in this arc — attach is idempotent (two clients on one
  session is tmux's ordinary case), observe is the enforced read-only grain, and the common local
  case is one human on two terminals; no single-writer machinery is built, and the manifest says
  plainly that two attachers share one keyboard. _Proposed revision:_ one sentence in the seam
  settling the stance: either "concurrent attach is shared by design; observe is the protected
  grain" or "a design must keep attach single-writer, with takeover an explicit act" — whichever the
  intent means. _Why it belongs in intent:_ the answer holds for any host technique and changes what
  every design builds; a daemon-shaped technique would face the same question and could silently
  answer it the other way.
- **SF-006** — [`session-multiplexer`](../../intent/02-subsystems/01-session-multiplexer.md),
  _Constraints_ ("Map a recorded session reference … back to a live session"). _Friction:_ the
  constraint speaks of **mapping** and is silent on **verification** — whether the live session the
  mapping reaches may be trusted on its address alone. The prior art is unanimous that found-by-name
  and belongs-to-the-record are different facts: [cmux](prior-art/cmux.md) bans name- and
  title-matching as binding outright, [pond](prior-art/pond.md) confirms a found session by an
  environment probe before trusting it, [agent-term](prior-art/agent-term.md) stamps generations so
  stale pointers invalidate at once, and [background-agents](prior-art/background-agents.md) rotates
  credentials so an orphan fences itself out. Any mapping through a shared namespace can be
  satisfied by a stranger. _Assumption to keep moving:_ the mapped-to live session is **confirmed to
  belong to the record** before it is attached to, killed, or reported as this session's — by
  evidence the launch placed inside it, never by its name alone — and this design builds that (the
  ownership token and epoch stamp). _Proposed revision:_ extend the constraint: "…and confirm the
  mapped-to live session belongs to the record — by evidence the launch placed in it, never by its
  name or address alone." _Why it belongs in intent:_ it holds for any host technique (a socket
  path, a pid, a container id are all recyclable addresses), and a design following the current
  wording literally would attach a human to a stranger's pane wearing the right name.
