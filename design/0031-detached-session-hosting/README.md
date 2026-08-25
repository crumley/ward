# 0031 — Detached session hosting

> The multiplexer seam's added technique, designed ahead of its build: `ward session open --detach`
> hosts the agent in a tmux session that outlives the terminal — the durable record stays the only
> source of truth, and the live host is a disposable, verified cache that `attach` re-joins or
> re-creates, `observe` watches read-only, `close` tears down, and `locate`/`doctor` report
> honestly. Hardened against a prior-art survey of eleven comparable systems.
>
> **Status:** proposed · **Started:** 2026-08-24

[0029](../0029-launched-sessions/README.md) made Ward launch agents — foreground, in the caller's
terminal, dying with it — and its SF-002, since adjudicated into the
[multiplexer seam](../../intent/02-subsystems/01-session-multiplexer.md)'s baseline/added split,
names what remains unpaid: the capability the seam **adds** over that baseline,
keep-alive-when-detached. A session must be able to outlive the human walking away, be re-attached,
be watched without being disturbed, and be found again from nothing but its durable record.

This entry is **design-only**: the complete plan for that arc — verbs, naming, failure semantics,
and the acceptance the build will be measured against — written before any implementation so the
plan can be reviewed as its own unit, resting on
[ADR 0006](../decisions/0006-tmux-detached-host.md)'s choice of tmux. Once the design is accepted,
the build journals into [`build-log.md`](build-log.md).

The first draft was then tested against a survey of eleven comparable systems, kept under
[`prior-art/`](prior-art/) and indexed under Design; where the evidence changed an answer, the
design was rewritten, with each decision citing the file that justified it.
[`build-log.md`](build-log.md) records what the sweep moved; the intent frictions the design
surfaced are in [`spec-feedback.md`](spec-feedback.md).

## Serves intent

- [`session-multiplexer`](../../intent/02-subsystems/01-session-multiplexer.md) — the seam realized,
  constraint by constraint: the hosted open keeps a session alive detached, attach/observe/re-create
  map the record back to a **verified** live session, and the live host stays a cache over the
  record — an addition beside 0029's foreground baseline, per design rule 4.
- [`sessions-and-lifecycle`](../../intent/01-concepts/02-sessions-and-lifecycle.md) — open ≠ running
  gains an honest derived overlay (live / exited / gone / could-not-determine, never stored), the
  trail grows `attached` and `observed`, and attaching to a live process stays a different act —
  with a different verb — from resuming a stopped one.
- [`scopes-and-personas`](../../intent/01-concepts/01-scopes-and-personas.md) — routing's "the
  command to attach" becomes literally `ward session attach ID`, instead of 0029's resume-as-restart
  standing in for it.
- [`agent-harness`](../../intent/02-subsystems/03-agent-harness.md) — consumed, not changed: the
  hosted open runs the same start/resume argv the foreground open runs, with the
  handle-assigned-before-start ordering intact (the handle's drift across `/clear` and compaction is
  named and deferred under Scope).
- [`visual-theming`](../../intent/02-subsystems/05-visual-theming.md) — designed-for, not built: the
  recorded session name is the stable hook the theming arc will decorate, so nothing here moves when
  that seam is realized.
- [`human-shell`](../../intent/02-subsystems/07-human-shell.md) — verbs read true — `attach`
  attaches, `observe` observes, `resume` resumes — and every refusal names its remedy with the exact
  command.
- [`principles`](../../intent/00-foundation/01-principles.md) — §16 record-then-launch and
  host-as-cache, §17 provenance recorded where a derivation's input is mutable, §18 teardown only on
  the deliberate close, §19 two techniques behind one contract, §20 honest degrade and "could not
  determine", §6 idempotent attach/observe/close.

## Scope

- **In** (what the build realizing this design will deliver):
  - **The premise validation, first** — a smoke check against a real tmux proving Claude Code
    initializes healthy in a detached session, with the pivot named in advance (the premise
    decision, under Design, carries the evidence and the pivot).
  - **The host adapter** — `src/host/tmux.ts` behind `WARD_TMUX_BIN` (the hermeticity seam,
    `WARD_CLAUDE_BIN`'s exact pattern, so no test ever needs a real tmux server): name minting, argv
    builders, probe classification, exact-match targeting, namespace-scoped destruction, and the
    server-hygiene preamble — each specified under Design.
  - **The hosted open** — `ward session open --purpose TEXT --detach`: record first (the minted host
    name written onto it), then the run hosted detached and the attach affordance printed.
    `--foreground` forces the baseline; bare `open` follows the resolved `agent.host`.
  - **Attach** — `ward session attach ID`: re-join the live session, or re-create it from the record
    when the host has lost it — always verifying the live half is Ward's own first, and refusing
    (with the diagnosis) on a foreign holder, a gone transcript, or an unanswerable probe.
  - **Observe** — `ward session observe ID`: read-only attach to a live hosted session.
  - **Resume, host-aware** — `ward session resume ID` refuses while the pane is live, pointing at
    attach; otherwise behaves as today, with `--detach` hosting the resumed run.
  - **Close tears down the cache** — `ward session close ID` (and the task-close cascade) kills the
    session's live host session — running or dead-pane alike — idempotently.
  - **Locate's live half** — `ward session locate ID` reports, beside the transcript answer, the
    recorded name and a classified live state.
  - **Doctor** — host capability, strays (surfaced, never swept), gone-as-information,
    could-not-determine, and version skew (the finding set is under Mechanisms).
  - **Configuration** — `agent.host: foreground | tmux` on 0028's two-layer, per-key ladder
    ([0028](../0028-agent-configuration/README.md)); unset resolves to `foreground`.
  - **CLI plumbing** — `--json` shapes for the new and changed verbs, `ward schema` coverage,
    completion, telemetry's verb tree, and the manifest's Sessions section extended to teach
    detach/attach/observe.
  - **Tests** — the adapter's minting/munging/argv tables and end-to-end suites through the spawned
    CLI against a stub tmux; Acceptance below enumerates what they must prove.
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
    zero-cooperation fallback for doctor's attribution. Safe to defer because the failure is
    visible, not silent — the live pane is unaffected (attach never needs the handle), and the named
    consequence is bounded: until the refresh arc lands, a detached session that `/clear`s or
    compacts strands its recorded handle on the older conversation, so a re-create after that life
    ends resumes the pre-`/clear` thread and `locate` reports the older transcript.
  - **`release` — deliberately parking a live half while the record stays resumable**
    ([bb](prior-art/bb.md) names it as its own act, distinct from interrupt and close). Safe to
    defer because the act is already possible honestly — a human killing the pane by hand leaves the
    ordinary open-and-gone state that attach re-creates, which doctor reports as information — and
    this entry's teardown and findings are exactly the machinery a later `release` verb composes.
  - **Fleet visibility — "which of my N detached sessions needs me."** The recurring gap across the
    field ([herdr](prior-art/herdr.md)'s blocked-state roll-up,
    [prime-agent](prior-art/prime-agent.md)'s Running/Idle/Inactive roster,
    [amux-survey](prior-art/amux-survey.md)'s observation-dashboard tier). Safe to defer because
    this entry ships the primitives — the `attached`/`observed` events, locate's host block,
    doctor's whole-record join — and a roll-up is a read over them, belonging to the status and
    theming surfaces ([prime-agent](prior-art/prime-agent.md)'s Herdr integration is the proven
    mechanism the theming arc can start from).
  - **Messaging, dispatch, and wake riding on the host.** Safe to defer because that is the
    messaging seam's own arc, and its contract is already recorded-first — live delivery is an
    optimization it may later hang on this host, and nothing built here closes that door (SF-002 in
    [`spec-feedback.md`](spec-feedback.md) records the line this entry draws).
  - **Fork (`--fork-session`) in any mode.** Safe to defer because forking is the harness seam's
    open question, orthogonal to hosting — a fork, whenever it lands, is a new session with its own
    identity and handle, and this design hosts any session it is handed (SF-003).
  - **Task- and project-scope launches.** Safe to defer because 0029's deferral stands and nothing
    here narrows it — attach, observe, locate, and close are id-addressed and scope-blind, and the
    name minting already carries any session id, so the scoped launches arrive as data plus a verb,
    not a migration of this entry's work.
  - **Theming the host surface** (accents, glyphs, status lines). Safe to defer because the theming
    seam owns it, and the recorded name is the stable hook it needs; painting on top of a name
    changes no mapping.
  - **Grouping several Ward sessions into one tmux session per floor** (windows-per-scope). Safe to
    defer because today's one-host-session-per-Ward-session mapping keeps attach and read-only
    semantics exact (both are per-tmux-session); prefix grouping serves the at-a-glance need now,
    and a regrouping later changes only the adapter's mapping — the record knows nothing of panes.
    The prior art also prices the change honestly: window ids are not derivable, so per-thread
    windows would need a stored secondary key with its own rebinding rules
    ([dmux](prior-art/dmux.md) built exactly that — an encoded pane title, a rebinder, and rules for
    when a renamed title must not rebind).
  - **A dedicated tmux server** (`tmux -L ward`). Safe to defer because it is an isolation lever
    kept in reserve; the default server is where the human's own eyes and muscle memory already are
    (the server decision, under Design), and moving later orphans only cache.
  - **Observing a session that is not live** (transcript tailing). Safe to defer because the record
    and `locate` already answer "what happened"; observe is defined against liveness, and an honest
    refusal names `locate` as the reader for the rest. The prior art suggests the fuller shape — a
    view served from the record with no producer alive ([isolade](prior-art/isolade.md)) — and that
    is the deferred entry's starting point, not a change to this one.
- **Acceptance** (the build's exit test, stated now so review can judge it; for this design-only
  unit, acceptance is the gate green over the entry's documents and the plan surviving review):
  1. `mise run check` → exit 0.
  2. The premise smoke, against a **real** tmux: `claude` started via `new-session -d -x 120 -y 40`
     renders healthy on first attach — or the attach-then-launch pivot is taken and recorded in
     [`build-log.md`](build-log.md).
  3. Adapter tables: the name minted and munged per the table; every `-t` target `=`-prefixed;
     destructive verbs refusing any target outside `ward-`.
  4. The rename scenario: a record whose stored `hostName` differs from a fresh derivation still
     attaches, observes, and closes correctly.
  5. Ordering: the record on disk before the stub tmux sees `new-session`, the spawn issued only
     after the store lock is released, and a spawned host holding no file description of
     `.ward/store.lock`.
  6. Ownership: attach, close, and doctor verify `WARD_AGENT` before acting; the foreign-holder
     refusal names the remedy.
  7. Dead panes: `remain-on-exit` set at create; the retained exit status read; close killing live
     and dead sessions alike and a no-op when none exists.
  8. Attach branching by classified probe: attach vs `switch-client` vs clear-dead-then-re-create vs
     re-create vs refuse — with could-not-determine refusing, never re-creating.
  9. Observe passing `-r`, and refusing when the session is not live.
  10. Resume refusing on a live pane with the attach command in the message, proceeding over a dead
      or gone one, and hosting the resumed run under `--detach`.
  11. `--detach` with no usable tmux refused; `agent.host: tmux` degraded to foreground — each
      naming its consequence.
  12. Locate's `--json` `host` block carrying the four-way state, covered by `ward schema`.
  13. Doctor: a fabricated stray named with remedy, attribution, and attached-client flag; an
      erroring tmux reported as could-not-determine, never as a clean bill.
  14. Every pre-0031 session record parsing, locating, and closing unchanged.

## Design

### Prior art

The design was rewritten against a survey of eleven comparable systems — each file carries verified
mechanics, takeaways for Ward, and conflicts with Ward's posture — kept beside this entry so the
evidence is reviewable where it is cited:

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
  Entry-local decisions, each with the alternative it beat and the cost it accepts:

  - **Two techniques, one contract — and how convergence will be judged.** The alternative — one
    technique, tmux replacing the foreground start — is attractive for its single code path, and
    loses because the foreground start is the seam's universal, dependency-free baseline and
    choosing a winner on paper is weak evidence (§19). Both ship: `agent.host` and the flags pick
    per use, the telemetry verb tree counts real invocations, and convergence is recorded per design
    rule 4 as one technique kept or an explicit technique→situation rule (the expected outcome —
    foreground for sit-with-it work, detached for walk-away work — is a hypothesis for use to
    confirm). The cost is carried openly: two launch paths to keep correct and to test until
    convergence retires one or writes the rule. The field's own matrix says detached hosting is
    table stakes once tmux is in hand ([amux-survey](prior-art/amux-survey.md)); what this entry
    contributes is the record-before-launch ordering, the recorded-name mapping, and
    attach-as-re-create.
  - **The premise is validated before it is built on.** This design's hosted open initializes an
    interactive TUI agent with no client attached — and the prior art reports exactly that crashing:
    [muxel](prior-art/muxel.md) abandoned a detached viewer because Claude crashed initializing
    detached and its desktop deliberately omits `-d`; [herdr](prior-art/herdr.md) defers resume
    until an attached client supplies real size and theme, and raised its headless default terminal
    to 120×40 because TUIs rendered garbage. The alternative — build everything and let the first
    dogfood run test the premise — loses because everything else here survives the pivot, and
    stacking on an unverified floor risks rework of exactly the create flow. So the hosted open
    sizes the session explicitly (`-x 120 -y 40`, herdr's field-tested floor;
    [amux](prior-art/amux-survey.md) sizes the same way), and the build's first act is the smoke
    check in Acceptance, with the pivot (attach-then-launch) stated in advance. The cost: one
    non-hermetic check the gate cannot run, kept runnable beside the suites and invoked by hand.
  - **Record, then launch — unchanged by the host, and now with the lock ordering stated.** The
    alternative — launch first, record what started — is attractive because it never leaves a record
    pointing at nothing, and loses because its failure mode is worse: a running agent the record has
    never heard of, the one state the record cannot describe afterwards (§16). The session document
    is written and committed before `tmux new-session` runs, exactly as 0029 ordered the foreground
    spawn — the ordering rule two independent record-as-truth systems converged on
    ([bb](prior-art/bb.md); [isolade](prior-art/isolade.md), which aborts the producer if the
    persist fails). The accepted cost is the crash window's residue: an open record whose handle and
    host name resolve to nothing — a named, honest state ([prime-agent](prior-art/prime-agent.md)
    calls its equivalent _uncertain_ and never replays it), which `locate` and doctor report as
    such. One constraint the survey added: the spawn happens **strictly after the store lock is
    released**, because a subprocess spawned while a lock is held inherits the open file description
    — and the tmux _server_ the first hosted open may fork outlives the CLI, which would leave
    `.ward/store.lock` held by a process that never returns it ([pond](prior-art/pond.md) hit
    exactly this class). The build carries the test.
  - **Detach means Ward is no longer the run's parent — and the host, not a shim, keeps the exit
    legible.** The foreground open waits and propagates the run's exit code; a hosted open cannot,
    and does not pretend to: it returns once the host holds the run. The alternative — a shim
    wrapped around the harness to report its exit — is attractive for the exit code it captures, and
    loses because it puts Ward machinery inside the run's process tree for the sake of a fact the
    record does not need (open ≠ running; an exit was never a close). But giving the exit up
    entirely concedes more than the technique demands: with `remain-on-exit on` set at create, the
    **host itself retains the exit fact** — the pane stays, dead, with `#{pane_dead}`,
    `#{pane_dead_status}`, and `#{pane_dead_signal}` readable — so "the live half is gone" becomes
    "exited 0" or "killed by SIGKILL" ([amux](prior-art/amux-survey.md) sets exactly this before the
    command runs). The cost is structural and owned: a session name now outlives its process, so
    liveness is layered (next decision), every create path clears a dead predecessor after recording
    what it found, and close kills dead sessions as readily as live ones.
  - **Liveness is layered, and a probe that fails answers "could not determine" — never "not
    running."** The alternative — a boolean from `has-session` — is attractive for its simplicity
    and loses twice: `remain-on-exit` makes name-present ≠ process-alive, and a probe can fail
    outright (a missing binary, an unreadable socket, an erroring `list-sessions`), where reading
    failure as absence sends attach to fork a second process over a possibly-live conversation.
    Three facts, each derived fresh at read time and never stored: the host session exists
    (`has-session`, exact-match), its pane process is alive (`#{pane_dead}`), and the conversation
    is resumable (`locate`'s transcript answer) — [isolade](prior-art/isolade.md) wedged sessions
    into an error state until it separated "host up" from "conversation resumable". A failed probe
    is its own honest answer ([amux](prior-art/amux-survey.md) marks nothing crashed on a failed
    probe; [pond](prior-art/pond.md) forbids even caching a proof of emptiness); one determinate
    case is named — "no server running" on the default server _is_ absence. The cost: a four-way
    vocabulary every consumer must render honestly, where a boolean would have been cheaper and
    wrong.
  - **One tmux session per Ward session.** The alternative — one session per floor with a window per
    thread — is attractive for a tidier `tmux ls`, and loses because attach and read-only are
    per-tmux-session in tmux: only the one-to-one mapping keeps `attach ID` and `observe ID` exact,
    never showing a neighbor's pane. Grouping is served by the name prefix (and tmux's own
    `choose-tree`); regrouping later is an adapter-only change (deferred, with its price named under
    Scope). The cost: N Ward sessions are N rows in the human's session list, mitigated by the
    shared prefix. Structured identity carrying both grouping and addressing is the pattern the
    record↔live seam's best prior art also lands on ([pond](prior-art/pond.md)'s derived session
    roots).
  - **The default tmux server, not a private socket — started hygienically.** The alternative — a
    private `-L ward` server — is attractive for isolation from name collisions and from a stray
    `kill-server`, and loses because it hides every session from the surface humans actually check:
    Ward's sessions should appear in the human's own `tmux ls`, prefix-grouped, which is the seam's
    at-a-glance requirement met with zero new surface. If collisions bite in practice, the socket is
    a one-line adapter change and a superseding note here. The cost of sharing is the exposure just
    named plus an obligation: the tmux server inherits the argv of whichever client first forks it,
    so a create run naked would leave the workspace path in the server's command line — and an agent
    clearing its own dev server with `pkill -f <workspace>` would SIGKILL the shared server and
    every session on the machine ([muxel](prior-art/muxel.md) documents the incident and the fix).
    Ward's worktree paths embed the workspace name, so it is squarely in that blast radius: the
    adapter runs `tmux start-server ';' set -s exit-empty off` — no workspace path in the argv, and
    `exit-empty off` because a session-less server otherwise exits before the first `new-session` —
    ahead of any create.
  - **The host name is minted by a pure function, recorded on the session, and opaque thereafter.**
    The minting rule is `ward-<workspace-name>-<session-id>`, munged to tmux's safe alphabet (every
    character outside `[A-Za-z0-9_-]` replaced by `-`; tmux rejects `.` and `:` in names). The
    alternative — a pure derivation everywhere, nothing stored — is attractive under §17's
    derive-don't-store, and loses because the workspace name is a **mutable input** (editable in
    `workspace.md`): a pure function over a mutable input orphans every live session the moment the
    input changes — [cmux](prior-art/cmux.md) forbids workspace-derived binding keys for exactly
    this, [amux](prior-art/amux-survey.md) keys its backend to an immutable id under an invariant
    that renames never orphan processes, and [muxel](prior-art/muxel.md)'s recorded-name-wins
    resolver documents the failure the alternative produces (duplicate sessions on every launch,
    teardown reaping the wrong name). So the name is minted **once, at the hosted create**, written
    onto the session record (`hostName`), and every later consumer reads the recorded name — attach,
    observe, resume's gate, close, locate, doctor. Nothing re-derives, and nothing ever parses a
    name back apart (a workspace name containing `-` makes the name un-splittable, so joins are by
    whole-name equality only — [pond](prior-art/pond.md)'s rule). This is not a §17 violation: a
    value derived from a mutable input is not derivable truth, and recording the name actually used
    is launch provenance in the exact sense of the recorded `model`/`effort`
    ([isolade](prior-art/isolade.md) stores the identity used and derives nothing from names). The
    cost: one more recorded field, and a name that no longer tracks a later rename — the record
    keeps saying `ward-<old-name>-…` while the workspace says otherwise, a visible but harmless
    drift. [dmux](prior-art/dmux.md)'s path-hash suffix was considered for the
    two-workspaces-one-name collision and declined: the recorded name already survives renames, and
    the residual mint-time collision is detected at create (a live session under the minted name
    that is not ours) and refused with its remedy — rare enough to be a refusal, not a suffix every
    human reads forever.
  - **Found by name is never "ours" — ownership is a token inside the live half, plus a generation
    stamp.** The alternative — trusting the derived name, zero stamps — is attractive for its
    simplicity, and loses because a name in a shared namespace can be satisfied by a stranger: a
    hand-made session, a rename, another tool. "Found by name" and "belongs to this record" are
    different facts ([pond](prior-art/pond.md)'s no-overwrite bug is the cautionary tale of the two
    being indistinguishable; [cmux](prior-art/cmux.md)'s principles ban name- and title-matching
    outright and bind by a spawn-injected token). The hosted create therefore stamps the live half
    with what the record can later verify: `WARD_AGENT=<session id>` in the **tmux session
    environment** (readable from outside the pane via `show-environment`),
    `WARD_HOST_EPOCH=<the creating lifecycle event's timestamp>` beside it, and `@ward_workspace` /
    `@ward_version` as session options for doctor's attribution and skew findings
    ([dmux](prior-art/dmux.md) publishes identity into the live host the same way). Attach, close,
    and doctor **verify before trusting**: a session wearing the right name whose `WARD_AGENT` does
    not match is refused (attach) or reported as foreign (doctor), never acted on. The epoch — the
    `at` of the `opened`/`resumed` event whose launch created this live half — is the generation
    marker that tells "my host" from "a host with my name from another life"
    ([agent-term](prior-art/agent-term.md)'s boot stamp, [cmux](prior-art/cmux.md)'s pid-start-time,
    [background-agents](prior-art/background-agents.md)'s credential rotation, all fencing the same
    ghost), and it costs no new record field: the event trail already carries the timestamp. The
    residual cost: a tmux version floor (`new-session -e`), which doctor's capability finding names,
    and one extra read on every verb that touches the live half.
  - **The record gains `host` and `hostName` — how the run was started and the name it was started
    under, never whether it is running.** The alternative — storing the live state too — is
    attractive for cheap list rendering, and loses because a persisted "running" is stale the
    instant the machine reboots (the lifecycle slice's hard rule; the two-vocabulary discipline
    [background-agents](prior-art/background-agents.md) states as a type-level warning — the durable
    lifecycle and the live incarnation's state share no words, and rendering one as the other is how
    two surfaces disagree about one session). Optional `host: 'tmux'` (absent = foreground, so every
    pre-0031 record reads unchanged) and, present exactly when `host` is, the minted `hostName` —
    both set at open/resume when the run is hosted, both launch provenance in the exact sense of the
    recorded `model`/`effort`. The cost: every read verb derives the live overlay per call — the
    price of never rendering a stale claim.
  - **Explicit flag refuses; configured default degrades — both honestly (§20).** The alternative —
    one uniform behavior for both — is attractive for its predictability, and loses each way: a
    foreground session silently substituted for `--detach` hides the seam's named consequence
    (detachment was the point of the invocation), and a refusal on `agent.host: tmux` makes a
    preference the reason an agent cannot start (0029's own §20 argument, extended from config to
    capability). So `--detach` with no usable tmux is refused with the diagnosis and remedy, and the
    configured default degrades to foreground and says so — "host tmux unavailable — running in the
    foreground; this session ends with this terminal" ([pond](prior-art/pond.md) draws the same line
    — degrade where correctness lives elsewhere, and here the record, not the host, carries
    correctness). Doctor names the precise break either way. The cost: two behaviors to teach,
    carried by the manifest and doctor.
  - **Resume refuses over a live host — a detection, not a lock.** `claude --resume` on a
    conversation still running in a pane would race two processes over one thread's state. The gate
    asks the layered probe — a **live pane**, not a merely-present name (a dead pane is not a live
    run) — and the refusal names the true verb: attach. The alternative — a real exclusion gate, a
    TTL'd claim table ([cmux](prior-art/cmux.md) built one for exactly this race) — is attractive
    for the stronger guarantee, and loses because the host itself already arbitrates: tmux refuses a
    duplicate session name, so of two resumes racing past the check, the loser's create fails
    cleanly and it re-probes and points at attach. The cost is the weaker up-front promise, stated
    honestly: the race is refused late, at the host's uniqueness constraint, rather than prevented
    early — and the failure mode is a clean refusal, never two processes on one thread.
  - **Attach re-creates when the live half is gone — through the same path that opened it — and
    inherits locate's honesty when the transcript is gone too.** Re-create is a hosted resume: same
    handle, same recorded directory, the conversation continuing where it left off — the seam's
    "re-create it when not running" realized as composition, not new machinery. Internally the
    hosted open, attach's re-create, and `resume --detach` are **one ensure function** differing
    only in argv (start vs resume) and in whether the record already existed —
    [isolade](prior-art/isolade.md)'s "no separate first-attach path", so the rare path runs on
    every launch. Two create-or-attach shortcuts were considered and declined: `new-session -A`
    ([muxel](prior-art/muxel.md)'s idiom, attractive as one idempotent command) cannot choose
    between `startArgv` and `resumeArgv` — the decision needs the record — and the hosted open must
    _return_, not attach; a `--continue` rung under the resume ladder (what
    [dmux](prior-art/dmux.md) and most of the field do when the exact id fails, attractive as a
    recovery of last resort) is refused because latest-for-this-directory can steal a sibling
    session's conversation ([muxel](prior-art/muxel.md) documents precisely that hazard), and Ward
    runs several sessions over shared directories as a matter of course. When `locate` says the
    transcript is gone as well, attach refuses with that answer rather than silently opening an
    empty conversation under an old name — the lifecycle slice's fresh-run-is-a-different-act rule,
    enforced at the door. The cost of the declines: a caller expecting the field's continue-latest
    recovery gets a refusal naming `locate` instead.
  - **Close kills the cache; nothing else ever does.** The alternative — automatic healing, doctor
    reaping strays and recovery restarting the gone — is attractive as hands-off hygiene, and loses
    on §18: a sweep spends teardown authority on a heuristic (SF-004 in
    [`spec-feedback.md`](spec-feedback.md) proposes the seam say this outright), and the
    counterexample is priced in the survey — the one tool that auto-heals in both directions needed
    a lifecycle lock, a stale-operation sweep, a paused watcher, and kill-verification retries just
    to stop its own healer ([dmux](prior-art/dmux.md)). Teardown of live state rides on the
    deliberate close (the same shape as task close tearing down worktrees), is idempotent when the
    live half is already gone, covers dead panes (which `remain-on-exit` makes linger), and is the
    **only** automatic kill in the design; it kills only a name it verified as Ward's own, and the
    adapter's destructive verbs refuse any target outside the `ward-` namespace
    ([amux](prior-art/amux-survey.md)). One dependency is stated because dmux shows its inverse:
    Ward's record-first, kill-second order is safe precisely _because_ nothing here auto-recreates —
    dmux must kill before mutating its record or its own healer resurrects the pane mid-close. The
    cost: strays accumulate until a human runs the printed remedy — refusals a human must read are
    the price of a record that is never silently wrong.
- **Layout:** two boundaries, mirroring the harness seam's. `src/host/` knows tmux — argv shapes,
  probe classification, the hygiene preamble — and nothing about Ward (a second host would be a
  second file here), while `src/agent/host.ts` is the Ward-shaped half: the ensure function, the
  attach/observe/re-create flows, ownership verification, and close teardown, consuming
  `src/agent/run.ts`'s argv building rather than duplicating it. The record grows its two provenance
  fields and two events; the session verbs, doctor, configuration (`agent.host`, enum-validated
  exactly as `harness` is — the host roster is Ward's own adapter list), and the manifest extend in
  place. Tests mirror the boundary: a stub tmux beside the stub harness drives the suites
  hermetically, and the real-tmux premise smoke lives beside them, outside the hermetic gate.
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
