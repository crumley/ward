# 0031 — Detached session hosting

> The multiplexer seam's added technique, designed ahead of its build: `ward session open --detach`
> hosts the agent as one window in its floor's **floor host** — one tmux session per floor, with
> floor 0's windows linked into every one — that outlives the terminal, while the durable record
> stays the only source of truth and the live half is a disposable, verified cache that `attach`
> re-joins or re-creates, `observe` watches read-only, `close` tears down, and `locate`/`doctor`
> report honestly.
>
> **Status:** proposed · **Started:** 2026-08-24 · **Regrouped:** 2026-10-16 (floor hosts)

[0029](../0029-launched-sessions/README.md) made Ward launch agents — foreground, in the caller's
terminal, dying with it — and its SF-002, since adjudicated into the
[multiplexer seam](../../intent/02-subsystems/01-session-multiplexer.md)'s baseline/added split,
names what remains unpaid: the capability the seam **adds** over that baseline,
keep-alive-when-detached. A session must be able to outlive the human walking away, be re-attached,
be watched without being disturbed, and be found again from nothing but its durable record.

The first version of this design hosted each Ward session in a tmux session of its own and deferred
grouping. The work it would host has since taken a shape that makes grouping the point rather than a
tidiness: a few long-lived **floor-scope** sessions (the project-scope launch designed in 0051
floor-scope-sessions, in flight beside this entry) each coordinate all work on one floor, and decide
per task whether to do it themselves, hand it to a harness subagent, or start a separate Ward
session — whose **parent** is recorded at open (0052 session-parent-link, likewise in flight). A
floor is the unit a human attends to, and the seam already asks that sessions be **grouped by the
work they belong to**; a host per Ward session made every floor a scatter of N unrelated rows. This
revision groups by floor: one **floor host** per floor, one **window** per Ward session, and the
ground floor's windows **linked into every floor host** so the workspace coordinator is in view
wherever a human stands. The record learns nothing about hosts or windows in the process — the
regrouping changed only what the adapter does with a record, which is the seam's cache-over-record
promise holding under its first real change.

This entry is **design-only**, resting on [ADR 0006](../decisions/0006-tmux-detached-host.md)'s
choice of tmux. It was tested against a survey of eleven comparable systems, kept under
[`prior-art/`](prior-art/); [`build-log.md`](build-log.md) records what the survey and then the
regrouping moved, and the intent frictions the design surfaced are in
[`spec-feedback.md`](spec-feedback.md).

**Vocabulary.** A _session_ is always a Ward agent session. The tmux object that holds a floor's
windows is the **host** (the **floor host**); "tmux session" is tmux's word for it and appears only
where this entry describes tmux's own mechanics — never in a Ward surface, message, or flag.

## Serves intent

- [`session-multiplexer`](../../intent/02-subsystems/01-session-multiplexer.md) — the seam realized,
  constraint by constraint: the hosted open keeps a session alive detached, attach/observe/re-create
  map the record back to a **verified** live window, the live half stays a cache over the record,
  and grouping-by-work becomes literal — a host per floor, a window per session — beside 0029's
  foreground baseline, per design rule 4.
- [`sessions-and-lifecycle`](../../intent/01-concepts/02-sessions-and-lifecycle.md) — open ≠ running
  gains an honest derived overlay (live / exited / gone / could-not-determine, never stored), the
  trail grows `attached` and `observed`, and attaching to a live process stays a different act —
  with a different verb — from resuming a stopped one.
- [`scopes-and-personas`](../../intent/01-concepts/01-scopes-and-personas.md) — the floor is the
  grouping key, so a floor's coordinating session and the sessions it starts share one host; and
  routing's "the command to attach" becomes literally `ward session attach ID`, instead of 0029's
  resume-as-restart standing in for it.
- [`agent-harness`](../../intent/02-subsystems/03-agent-harness.md) — consumed, not changed: the
  hosted open runs the same start/resume argv the foreground open runs, with the
  handle-assigned-before-start ordering intact (the handle's drift across `/clear` and compaction is
  named and deferred under Scope).
- [`visual-theming`](../../intent/02-subsystems/05-visual-theming.md) — designed-for, not built: the
  floor host and its per-session windows are the stable hooks the theming arc will decorate (a
  host's status line, a window's label and accent), so nothing here moves when that seam is
  realized.
- [`human-shell`](../../intent/02-subsystems/07-human-shell.md) — verbs read true — `attach`
  attaches, `observe` observes, `resume` resumes — and every refusal names its remedy with the exact
  command.
- [`principles`](../../intent/00-foundation/01-principles.md) — §16 record-then-launch and
  host-as-cache, §17 derive placement and identity rather than store them, §18 teardown only on the
  deliberate close, §19 two techniques behind one contract, §20 honest degrade and "could not
  determine", §6 idempotent attach/observe/close.

## Scope

- **In** (what the build realizing this design will deliver):
  - **The premise validation, first** — a smoke check against a real tmux proving Claude Code
    initializes healthy in a detached window, with the pivot named in advance (the premise decision,
    under Design, carries the evidence and the pivot).
  - **The host adapter** — `src/host/tmux.ts` behind `WARD_TMUX_BIN` (the hermeticity seam,
    `WARD_CLAUDE_BIN`'s exact pattern, so no test ever needs a real tmux server): host-name minting,
    host lookup by stamp, window tagging and lookup, argv builders, probe classification,
    exact-match targeting, namespace-scoped destruction, view sessions, and the server-hygiene
    preamble — each specified under Design.
  - **Placement** — a pure function from records to the floor whose host a session's window belongs
    in: its own floor, or its recorded parent's (the placement decision, under Design).
  - **The hosted open** — `ward session open … --detach`: record first, then the session's window
    created in its floor host (the host created, and floor 0 linked in, when the floor has none
    yet), and the attach affordance printed. `--foreground` forces the baseline; bare `open` follows
    the resolved `agent.host`. Scope-blind: it hosts whatever scope the open was for — workspace
    scope today, project scope when 0051 lands, task scope when that launch arrives.
  - **Floor-0 linking** — every live floor-0 window linked into every floor host: when a floor host
    is created, and when a floor-0 window is created; repaired on attach; never killed by anything
    but its own session's close.
  - **Attach** — `ward session attach ID`: re-join the session's live window through a per-client
    view of its floor host, or re-create the window from the record when the host has lost it —
    always verifying the window is Ward's own and current first, and refusing (with the diagnosis)
    on a foreign holder, a gone transcript, or an unanswerable probe.
  - **Observe** — `ward session observe ID`: a read-only, single-window view of a live session.
  - **Resume, host-aware** — `ward session resume ID` refuses while the session's window is live,
    pointing at attach; otherwise behaves as today, with `--detach` hosting the resumed run.
  - **Close tears down the cache** — `ward session close ID` (and the task-close cascade) kills the
    session's window — running or dead-pane alike — idempotently, and the floor host with it when
    nothing of the floor's own remains in it.
  - **Locate's live half** — `ward session locate ID` reports, beside the transcript answer, the
    host and window found and a classified live state.
  - **Doctor** — host capability, stray windows and hosts (surfaced, never swept), gone-as-
    information, misplaced windows and missing floor-0 links as information, could-not-determine,
    and version skew (the finding set is under Mechanisms).
  - **Configuration** — `agent.host: foreground | tmux` on 0028's two-layer, per-key ladder
    ([0028](../0028-agent-configuration/README.md)); unset resolves to `foreground`.
  - **CLI plumbing** — `--json` shapes for the new and changed verbs, `ward schema` coverage,
    completion, telemetry's verb tree, and the manifest's Sessions section extended to teach
    detach/attach/observe and the floor host.
  - **Tests** — the adapter's minting/munging/argv tables and end-to-end suites through the spawned
    CLI against a stub tmux; Acceptance below enumerates what they must prove.
- **Deferred:**
  - **Handle freshness — a refresh channel for the recorded harness handle.** The harness's native
    id is a moving target: `/clear`, compaction, and forking each mint a new one
    ([herdr](prior-art/herdr.md), whose Claude integration hook-feeds the changing id back), so a
    long-lived detached session — a floor's coordinating session above all — will outrun the handle
    recorded at open. In scope now is the honest floor: attach's re-create is gated on `locate`
    (probe before resume, [muxel](prior-art/muxel.md),
    [background-agents](prior-art/background-agents.md)), and a re-created window found dead at its
    verification beat is read as a bad handle and recorded. The channel itself is deferred: its
    natural shape is 0029's already-designed SessionStart hook (zero-token, `WARD_AGENT`-gated)
    feeding the new id back over a `ward` verb, with [dmux](prior-art/dmux.md)'s
    read-the-process's-open-transcript-fd technique as the zero-cooperation fallback for doctor's
    attribution. Safe to defer because the failure is visible, not silent — the live window is
    unaffected (attach never needs the handle), and the named consequence is bounded: until the
    refresh arc lands, a detached session that `/clear`s or compacts strands its recorded handle on
    the older conversation, so a re-create after that life ends resumes the pre-`/clear` thread and
    `locate` reports the older transcript.
  - **`release` — deliberately parking a live window while the record stays resumable**
    ([bb](prior-art/bb.md) names it as its own act, distinct from interrupt and close). Safe to
    defer because the act is already possible honestly — a human killing the window by hand leaves
    the ordinary open-and-gone state that attach re-creates, which doctor reports as information —
    and this entry's teardown and findings are exactly the machinery a later `release` verb
    composes.
  - **Re-placement — moving a live window to another floor host.** Placement is derived from facts
    that do not change over a session's life (its floor, its recorded parent), so a session never
    _needs_ to move; a human who moves a window by hand (`move-window`) is followed, not corrected —
    the window is found by its tag wherever it stands, and doctor reports the misplacement as
    information. Safe to defer because nothing reads a window's position as truth, and a re-create
    lands in the derived host regardless.
  - **Fleet visibility — "which of my N detached sessions needs me."** The recurring gap across the
    field ([herdr](prior-art/herdr.md)'s blocked-state roll-up,
    [prime-agent](prior-art/prime-agent.md)'s Running/Idle/Inactive roster,
    [amux-survey](prior-art/amux-survey.md)'s observation-dashboard tier). Floor hosts make the
    natural surface obvious — a host's status line summarizing its windows — and that surface is the
    theming arc's. Safe to defer because this entry ships the primitives — the `attached`/`observed`
    events, locate's host block, doctor's whole-record join — and a roll-up is a read over them
    ([prime-agent](prior-art/prime-agent.md)'s Herdr integration is the proven mechanism the theming
    arc can start from).
  - **Messaging, dispatch, and wake riding on the host.** A floor host puts every session of a floor
    one `send-keys` away from its coordinator, which makes the temptation sharper, not weaker. Safe
    to defer because that is the messaging seam's own arc, and its contract is already
    recorded-first — live delivery is an optimization it may later hang on this host, and nothing
    built here closes that door (SF-002 in [`spec-feedback.md`](spec-feedback.md) records the line
    this entry draws).
  - **Fork (`--fork-session`) in any mode.** Safe to defer because forking is the harness seam's
    open question, orthogonal to hosting — a fork, whenever it lands, is a new session with its own
    identity and handle (and, under 0052, a parent), and this design places and hosts any session it
    is handed (SF-003).
  - **The scoped launches themselves.** Project-scope launch is 0051's; task-scope launch remains
    deferred as 0029 left it. Safe to defer here because attach, observe, locate, and close are
    id-addressed and scope-blind, and placement already maps every scope to a floor (workspace scope
    to 0, project scope to its floor, task scope to its task's floor), so each scoped launch arrives
    as data plus a verb, not a migration of this entry's work.
  - **Theming the host surface** (accents, glyphs, status lines, window labels beyond the default).
    Safe to defer because the theming seam owns it, and the floor host and its tagged windows are
    the stable hooks it needs; painting on top of them changes no mapping.
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
  2. The premise smoke, against a **real** tmux: `claude` started in a detached window of a host
     created at `-x 120 -y 40` renders healthy on first attach — or the attach-then-launch pivot is
     taken and recorded in [`build-log.md`](build-log.md).
  3. Adapter tables: the host name minted and munged per the table; every `-t` target exact (`=`-
     prefixed names, `@`/`%` ids); destructive verbs refusing any host outside the `ward-` namespace
     and any window not carrying `@ward_session`.
  4. Placement: workspace scope → floor 0, a task → its task's floor, a project-scope session → its
     floor; a recorded parent on floor N ≠ 0 overrides the child's own floor; a floor-0 parent does
     not; a missing parent record falls back to the child's own floor.
  5. Host lookup by stamp: after the workspace is renamed, a new session on floor N lands in the
     floor host minted under the old name; a host wearing the minted name but another workspace's
     stamp is refused as foreign, never joined.
  6. Ordering and serialization: the launch event on disk before the stub tmux sees `new-window`;
     two concurrent opens on an empty floor produce one floor host; two concurrent resumes of one
     session produce one window, the loser refused toward attach.
  7. Environment isolation: `WARD_AGENT` set on the window's pane only — the floor host's own
     environment carries no session id, so a second window and a human's shell in the same host
     inherit none.
  8. Ownership: attach, close, and doctor verify the window's `@ward_session`, its `@ward_epoch`
     against the record's latest launch event, and the host's `@ward_workspace` before acting; the
     foreign-holder refusal names the remedy.
  9. Floor 0: a floor-0 window is linked into every floor host at its creation and at each floor
     host's creation; closing a floor-0 session removes its window from every host; killing a floor
     host leaves every floor-0 window alive in the others.
  10. Close and host lifetime: `remain-on-exit` set on the window at create; the retained exit
      status read; close killing live and dead windows alike, a no-op when none exists, killing the
      floor host only when no window of its own (Ward's or a human's) remains in it.
  11. Attach branching by classified probe: view-and-select vs `switch-client` vs
      clear-dead-then-re-create vs re-create vs refuse — with could-not-determine refusing, never
      re-creating; a second attached client on the same floor host keeps its own current window.
  12. Observe creating a single-window view and attaching it `-f read-only,ignore-size`, showing no
      neighbor; refusing when the session is not live.
  13. Resume refusing on a live window with the attach command in the message, proceeding over a
      dead or gone one, and hosting the resumed run under `--detach`.
  14. `--detach` with no usable tmux refused; `agent.host: tmux` degraded to foreground — each
      naming its consequence.
  15. Locate's `--json` `host` block carrying the four-way state, covered by `ward schema`.
  16. Doctor: a fabricated stray window and an emptied floor host each named with remedy and
      attribution; a misplaced window and a missing floor-0 link reported as information; an
      erroring tmux reported as could-not-determine, never as a clean bill.
  17. Every pre-0031 session record parsing, locating, and closing unchanged.

## Design

### Prior art

The design was rewritten against a survey of eleven comparable systems — each file carries verified
mechanics, takeaways for Ward, and conflicts with Ward's posture — kept beside this entry so the
evidence is reviewable where it is cited. The survey predates the regrouping; where a file's
takeaways speak of one-host-per-session (dmux's naming takeaway, for instance), the decisions below
say what changed.

- [herdr](prior-art/herdr.md) — the inverted posture (live server as truth) at 32k stars; hook-fed
  handle freshness, terminal sizing, the attach/observe/takeover triad, the environment-at-open
  trap, version skew.
- [bb](prior-art/bb.md) — record-as-truth independently validated in production; typed interruption
  reasons, `release`, anti-flap, resume-capability honesty, stale-event tolerance.
- [dmux](prior-art/dmux.md) — the closest structural precedent for floor hosts: **one tmux session
  per project with each agent in a pane**, identity published into the live host as user options,
  and — the price this revision had to answer — a stored pane id repaired by an encoded pane title,
  a rebinder, and rules for when a renamed title must not rebind; also fd-based handle recovery and
  what automatic healing costs.
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
  with this entry, and amended against the survey and the regrouping): the candidates surveyed
  against the seam's constraints, tmux recommended as the **added technique** beside the foreground
  baseline. Entry-local decisions, each with the alternative it beat and the cost it accepts:

  - **Two techniques, one contract — and how convergence will be judged.** The alternative — one
    technique, tmux replacing the foreground start — is attractive for its single code path, and
    loses because the foreground start is the seam's universal, dependency-free baseline and
    choosing a winner on paper is weak evidence (§19). Both ship: `agent.host` and the flags pick
    per use, the telemetry verb tree counts real invocations, and convergence is recorded per design
    rule 4 as one technique kept or an explicit technique→situation rule (the expected outcome —
    foreground for sit-with-it work, detached for walk-away work and for every floor's coordinating
    session — is a hypothesis for use to confirm). The cost is carried openly: two launch paths to
    keep correct and to test until convergence retires one or writes the rule. The field's own
    matrix says detached hosting is table stakes once tmux is in hand
    ([amux-survey](prior-art/amux-survey.md)); what this entry contributes is the
    record-before-launch ordering, the floor grouping derived from the record, and
    attach-as-re-create.
  - **One host per floor, one window per session — superseding one host per session.** This entry
    first chose a tmux session per Ward session, and the reasons were real: attach and read-only
    attach are per-tmux-session in tmux, so the one-to-one mapping made `attach ID` and `observe ID`
    exact for free, a name derived from the session id was the whole binding (no secondary key, no
    rebinder), close was a single `kill-session`, and nothing was shared, so nothing could leak
    between sessions. It deferred grouping on the argument that a regrouping would touch only the
    adapter. What changed is the work: a floor is now coordinated by a long-lived floor-scope
    session that starts further sessions for that floor's tasks, and a human tends a floor, not a
    session. Under one-host-per-session, a floor of five sessions is five unrelated rows in
    `tmux ls`, the coordinator and the sessions it started are reachable only by detaching and
    re-attaching, and nothing shows the floor as a unit — the seam's own group-by-the-work
    constraint met only by a name prefix. A floor host makes the floor the thing you attach to: the
    coordinator's window and every session it or a human started for the floor sit side by side,
    navigable with tmux's own window keys, and the ground floor's coordinator is linked into each so
    it is never more than a keystroke away. The costs are the ones the first version avoided, and
    each is paid by a decision below rather than waved off: window ids are not derivable, so
    identity becomes a **tag** set at create (dmux's rebinder is the price of getting this wrong);
    per-session attach and read-only observe are no longer exact by construction and need **views**;
    ownership evidence can no longer live in the tmux session's environment, which is now shared;
    close must decide **when the host dies**; and floor 0's windows are **shared objects** across
    hosts, with the sizing caveat that brings. A middle path — tmux session groups, one Ward session
    per tmux session but grouped per floor — was considered and declined: grouped tmux sessions
    share one window list, so it is floor hosts with N names for the same windows rather than an
    alternative to them. The regrouping honored the first version's promise: the record schema did
    not grow for it — it shrank (the decision on `host` below).
  - **Placement is derived from the record: a session's own floor, or its recorded parent's.** A
    session's window belongs in the host of its **placement floor**: workspace scope → 0, project
    scope → its floor (0051), task scope → its task's floor, legacy bare tasks → 0 — unless the
    session has a recorded **parent** (0052) whose placement floor is not 0, in which case it is the
    parent's. So a session a floor-3 coordinator starts for floor-5 work lands beside its parent in
    floor 3's host, where the coordinator that started it is watching; a session the ground-floor
    coordinator starts for floor 5 lands in floor 5's host, because a floor-0 parent is linked into
    every host and "its parent's host" names no one host — the child's own floor breaks the tie. The
    alternative — placement by co-location (the window lands wherever the caller's `$TMUX` pane
    happens to be) — is attractive because it needs no record at all and does the right thing for
    the common case, and loses because it is a fact about a process, not about the work: a re-create
    after a reboot has no caller pane to read, and a session started from a foreground terminal, a
    script, or another machine would land somewhere arbitrary. The parent link is recorded, so
    placement is a pure function of records and survives a reboot exactly. The cost: placement is
    recursive over parents (bounded by the chain's length, and computed from records already read),
    and a child grouped by lineage sits in a host that is not its scope's — the grouping constraint
    reads "by scope", and SF-007 in [`spec-feedback.md`](spec-feedback.md) asks whether lineage is
    an admissible reading of "the work they belong to".
  - **Floor 0 floats: its windows are linked into every floor host, never copied and never killed by
    another floor.** A floor-0 window lives in the floor-0 host and is `link-window`ed into every
    floor host — the same window, the same pane, the same process, visible as the first window of
    each. The alternative — floor 0 in its own host only — is attractive for its simplicity and its
    lack of shared objects, and loses because the ground floor's coordinator is the session a human
    on any floor most often needs to reach, and a separate host means detaching from the floor to
    talk to it. Links are made when a floor host is created (every live floor-0 window) and when a
    floor-0 window is created (into every live floor host); attach's ensure path repairs a missing
    link (additive, never destructive), and doctor reports one as information. Tear-down follows
    tmux's own semantics: `kill-window` removes a window from every session it is linked into (so
    closing a floor-0 session clears it everywhere), and `kill-session` destroys only the windows
    linked nowhere else (so killing a floor host merely unlinks floor 0 from it) — the acceptance
    test proves both rather than trusting the manual. The cost is the sizing caveat, owned: a linked
    window has one size, and tmux sizes it to the most recently active client (`window-size latest`)
    — two humans viewing the coordinator from two differently sized terminals in two floor hosts
    take turns resizing it, and the other sees it padded or clipped until they act. The harness
    reflows on resize, so the cost is visual, not a corruption; it is named in the manifest rather
    than engineered around.
  - **The host is found by its stamps; its name is minted only when the floor has none, and recorded
    nowhere.** A floor host carries `@ward_workspace` (the workspace root) and `@ward_floor` as tmux
    session options, and every lookup is one `list-sessions -F` filtered on those stamps — never a
    lookup by name. The name exists for humans and for tmux's uniqueness rule: minted as
    `ward-<workspace-name>-f<N>`, munged to tmux's safe alphabet (every character outside
    `[A-Za-z0-9_-]` replaced by `-`), only when the lookup finds no host for the floor. This answers
    the problem the first version solved by recording the name — the workspace name is a **mutable
    input**, and a binding derived from it orphans every live host on a rename
    ([cmux](prior-art/cmux.md), [amux](prior-art/amux-survey.md), [muxel](prior-art/muxel.md)) —
    without recording anything: after a rename the stamp still finds the host minted under the old
    name, and new windows join it. Recording the name was considered and declined: with a host per
    floor, the name is a fact about the floor, and writing it onto each session record would copy
    one fact into N records that could disagree (a host re-created under a new name after a reboot
    and a rename, older records still naming the old one) — while the binding key would still not be
    the name but the window tag. The residual cases are refusals, not guesses: a host wearing the
    minted name but another workspace's stamp (two workspaces sharing a name, or a workspace moved
    on disk while its hosts lived) is refused at create with the foreign holder named and its remedy
    ([dmux](prior-art/dmux.md)'s path-hash suffix was weighed for this and declined, as before: a
    rare refusal beats a suffix every human reads forever); two hosts stamped for one floor are
    reported by doctor, and placement uses the older until a human resolves it. The cost: the
    workspace root is the stamp's identity, because a workspace record carries no immutable id —
    moving a workspace on disk strands its live hosts as foreign, which doctor attributes.
  - **A window is identified by a tag set at create, never by its name, index, or title.** Window
    ids (`@12`) are minted by tmux, not derivable from anything Ward holds, and window names and
    titles are rewritten by the harness's terminal escapes, by `automatic-rename`, and by humans —
    so the first version's derive-the-name binding has no window-grain equivalent. Each window Ward
    creates is tagged with tmux **window options**: `@ward_session` (the session id), `@ward_epoch`
    (the generation, below), and `@ward_pane` (the pane id of the agent's pane, so a human splitting
    the window never confuses which pane's liveness is the session's). Lookup is one
    `list-windows -a -F` filtered on `@ward_session`, deduplicated by window id (a floor-0 window
    answers once per host it is linked into). The alternative — dmux's shape, a stored pane id
    repaired by an encoded title and a rebinder ([dmux](prior-art/dmux.md)) — is attractive as
    proven at scale, and loses because it stores volatile state in the record and then needs rules
    for when a renamed title must not rebind; a user option is invisible to `rename-window`, to
    `automatic-rename`, and to terminal title escapes, so there is nothing to rebind and nothing
    volatile to store. The window's _name_ is set at create to the session's label (its id by
    default; the theming arc owns anything richer) with `automatic-rename off` and
    `allow-rename off` on that window, so the harness cannot retitle it — but the name is
    presentation, and nothing ever reads it back. The cost: a tmux version floor for per-window user
    options, named by doctor's capability finding, and a scan rather than a direct `has-session` per
    lookup.
  - **Found by tag is still not "ours": ownership moves from the session environment to window
    options, plus a generation stamp.** A tag in a shared namespace can be satisfied by a stranger
    as easily as a name can ([cmux](prior-art/cmux.md) bans name- and title-matching and binds by a
    spawn-injected token; [pond](prior-art/pond.md)'s no-overwrite bug is what indistinguishable
    found-by-address and belongs-to-record look like). The first version put `WARD_AGENT` into the
    **tmux session environment** and read it with `show-environment`; under a floor host that is
    wrong twice over: the environment is shared by every window, so it cannot say which session a
    window is, and anything put there is **inherited by every later window** — the next agent
    window, or a human's shell opened in the host, would declare itself as the first session. So the
    session's own `WARD_AGENT` (which 0029's agent contract requires the run to carry) is set on the
    **pane** only, with `new-window -e`, and the floor host's environment carries no session id.
    Verification reads window and host options instead: a window is this session's live half when
    its `@ward_session` matches, its host's `@ward_workspace` is this workspace, and its
    `@ward_epoch` equals the `at` of the record's latest launch event (`opened` or `resumed`, hosted
    by tmux). The epoch is the generation marker that tells "my window" from "a window tagged with
    my id from another life" ([agent-term](prior-art/agent-term.md)'s boot stamp,
    [cmux](prior-art/cmux.md)'s pid-start-time,
    [background-agents](prior-art/background-agents.md)'s credential rotation), and it costs no new
    record field. A window that fails verification is refused (attach), left standing and reported
    (close), or reported as stray (doctor) — never acted on. The floor host also carries
    `@ward_version` for doctor's skew finding ([dmux](prior-art/dmux.md) publishes identity into the
    live host the same way). The residual cost: one extra read on every verb that touches the live
    half.
  - **The record gains `host` only — how the run was started, never where or whether it is
    running.** The alternative — storing the live state (a window id, a host name, "running") — is
    attractive for cheap list rendering, and loses because a persisted live fact is stale the
    instant the machine reboots (the lifecycle slice's hard rule; the two-vocabulary discipline
    [background-agents](prior-art/background-agents.md) states as a type-level warning). Optional
    `host: 'tmux'` (absent = foreground, so every pre-0031 record reads unchanged), set at open or
    resume when the run is hosted — launch provenance in the exact sense of the recorded
    `model`/`effort`. Everything else is derived per read: the placement floor from scope, task, and
    parent; the host from its stamps; the window from its tag; liveness from the probe. The first
    version's `hostName` is gone, for the reason the host decision gives. The cost: every read verb
    derives the live overlay per call — the price of never rendering a stale claim.
  - **The premise is validated before it is built on.** This design's hosted open initializes an
    interactive TUI agent with no client attached — and the prior art reports exactly that crashing:
    [muxel](prior-art/muxel.md) abandoned a detached viewer because Claude crashed initializing
    detached and its desktop deliberately omits `-d`; [herdr](prior-art/herdr.md) defers resume
    until an attached client supplies real size and theme, and raised its headless default terminal
    to 120×40 because TUIs rendered garbage. The alternative — build everything and let the first
    dogfood run test the premise — loses because everything else here survives the pivot, and
    stacking on an unverified floor risks rework of exactly the create flow. So a floor host is
    created at an explicit size (`-x 120 -y 40`, herdr's field-tested floor;
    [amux](prior-art/amux-survey.md) sizes the same way) and windows created in it inherit it while
    no client is attached; the build's first act is the smoke check in Acceptance, with the pivot
    (attach-then-launch) stated in advance. Floor hosts change the premise slightly in Ward's favor:
    once a human is attached to a floor host, new windows are born into a host that has a real
    client size. The cost: one non-hermetic check the gate cannot run, kept runnable beside the
    suites and invoked by hand.
  - **Record, then launch — and the probe-and-create serialized inside the same store write.** The
    alternative — launch first, record what started — is attractive because it never leaves a record
    pointing at nothing, and loses because its failure mode is worse: a running agent the record has
    never heard of (§16). The launch event is written before `new-window` runs, as 0029 ordered the
    foreground spawn and as two independent record-as-truth systems converged on
    ([bb](prior-art/bb.md); [isolade](prior-art/isolade.md)). The first version relied on tmux
    refusing a duplicate session name to arbitrate racing launches; windows have no unique names, so
    under floor hosts two racing resumes of one session would each create a tagged window, and two
    racing opens on an empty floor would each mint a host. So the probe, the host lookup-or-mint,
    and the window create run **inside the store write that appends the launch event**: Ward's store
    lock is a link(2) lockfile that names its holder and holds no open descriptor (0013), so a tmux
    client or server spawned under it inherits nothing — the inherited-flock hazard
    [pond](prior-art/pond.md) hit, which shaped the first version's spawn-after-release rule, does
    not apply to this lock. The server-hygiene preamble still runs before the lock is taken, so the
    critical section spends one or two short tmux client calls, each under a timeout that classifies
    as could-not-determine. The accepted costs: the lock held across a tmux round-trip, and the
    crash window's residue — an open record whose latest launch event has no window — a named,
    honest state ([prime-agent](prior-art/prime-agent.md) calls its equivalent _uncertain_), which
    `locate` and doctor report as gone.
  - **Detach means Ward is no longer the run's parent — and the host, not a shim, keeps the exit
    legible.** The foreground open waits and propagates the run's exit code; a hosted open cannot,
    and does not pretend to: it returns once the host holds the run. The alternative — a shim
    wrapped around the harness to report its exit — loses because it puts Ward machinery inside the
    run's process tree for a fact the record does not need (open ≠ running). With
    `remain-on-exit
    on` set **on the session's window** at create — a window option, so a
    human's own windows in the host behave as they always have — the host retains the exit fact: the
    pane stays, dead, with `#{pane_dead}`, `#{pane_dead_status}`, and `#{pane_dead_signal}` readable
    ([amux](prior-art/amux-survey.md)). The cost is structural and owned: a dead window lingers in
    its floor host (and, for floor 0, in every floor host) until a re-create or a close clears it,
    so liveness is layered (next decision) and close kills dead windows as readily as live ones.
  - **Liveness is layered, and a probe that fails answers "could not determine" — never "not
    running."** Three facts, each derived fresh at read time and never stored: the tagged window
    exists and verifies, its agent pane is alive (`#{pane_dead}` of `@ward_pane`), and the
    conversation is resumable (`locate`'s transcript answer) — [isolade](prior-art/isolade.md)
    wedged sessions until it separated "host up" from "conversation resumable". A failed probe is
    its own answer ([amux](prior-art/amux-survey.md) marks nothing crashed on a failed probe;
    [pond](prior-art/pond.md) forbids caching a proof of emptiness); "no server running" on the
    default server _is_ absence. The alternative — a boolean — loses twice: `remain-on-exit` makes
    present ≠ alive, and reading failure as absence sends attach to fork a second process over a
    possibly-live conversation. The cost: a four-way vocabulary every consumer must render honestly.
  - **Attach goes through a per-client view of the floor host, so attaching never moves anyone
    else.** In tmux the current window belongs to the tmux session, not to the client: attaching the
    floor host and selecting the session's window would yank every other client on that floor host
    to the same window — exactly the multi-terminal way a floor is tended. So attach creates a
    **view**: a tmux session grouped with the floor host (`new-session -t`), sharing its windows but
    holding its own current window, stamped `@ward_view` and set `destroy-unattached on` so it
    vanishes when its client leaves; the session's window is selected in the view and the caller
    attaches it (or, inside tmux, `switch-client`s to it). The human lands on the session's window
    with the whole floor — and floor 0 — a keystroke away. The alternative — attach the floor host
    directly and `select-window` — is attractive for leaving no extra tmux session behind, and loses
    to the yank. The cost: while a human is attached, a view appears in `tmux ls` beside its host
    (named `<host>-v<n>`), and doctor must tell views from strays (it does, by `@ward_view`). Two
    attaches to one session still share one window — and one keyboard — which is SF-005's question,
    unchanged by the regrouping.
  - **Observe is a read-only, single-window view — the grain the first version got for free, rebuilt
    with a link.** Under one host per session, `attach -r` showed exactly one session. Against a
    floor host it would show the whole floor: neighbors visible, and the observer able to wander
    between them. Three alternatives were weighed. `attach -r` of the floor host (or of a grouped
    view) is the cheapest and has the wrong grain — observe is addressed to a session. Sampling with
    `capture-pane` (what [dmux](prior-art/dmux.md) does for its cards) needs no tmux session at all,
    and loses because it is a poll of a TUI's screen, not a live view — fine for a dashboard, wrong
    for watching an agent work. Tee-ing the pane with `pipe-pane` gives a live byte stream, and
    loses because replaying a TUI's raw output into a terminal of a different size garbles it, and a
    pane has only one pipe. So observe builds an **ephemeral single-window view**: a new tmux
    session whose placeholder window is replaced by a link to the session's window
    (`link-window -k`), stamped `@ward_view`, `destroy-unattached on`, attached with
    `-f read-only,ignore-size` — read-only enforced by the tmux server, and `ignore-size` so the
    observer's terminal never resizes the agent's window. No neighbor is in the view, and destroying
    the view only unlinks the window. The cost: the client-flags version floor, and one more
    transient entry in `tmux ls` while someone watches.
  - **Close kills the session's window — and the floor host only when nothing of its own remains.
    Nothing else ever kills.** The alternative — automatic healing, doctor reaping strays and
    recovery restarting the gone — loses on §18: a sweep spends teardown authority on a heuristic
    (SF-004 proposes the seam say this outright), and the one tool in the survey that auto-heals in
    both directions needed a lifecycle lock, a stale-operation sweep, a paused watcher, and
    kill-verification retries just to stop its own healer ([dmux](prior-art/dmux.md)). Teardown
    rides on the deliberate close: verify the window, `kill-window` it (live or dead-pane alike; for
    floor 0 that removes it from every host), and then, if the floor host it lived in holds no
    window other than floor-0 links — no Ward window of the floor and no window a human made there —
    `kill-session` the host, which unlinks floor 0 rather than killing it. Floor 0's own host needs
    no rule: it ends when its last window does. Floor hosts set `detach-on-destroy off`, so a human
    attached to a host that empties is moved to another tmux session rather than dropped to the
    shell. The alternatives for the host — keep empty hosts forever, or kill a host the moment its
    coordinating session closes — lose respectively to clutter that doctor would have to explain and
    to killing sessions that coordinator started and that are still working. The kill is idempotent
    when the window is already gone, touches only windows it verified as Ward's own, and the
    adapter's destructive verbs refuse any host outside the `ward-` namespace. Ward's record-first,
    kill-second order is safe precisely _because_ nothing here auto-recreates — dmux must kill
    before mutating its record or its healer resurrects the pane mid-close. The cost: strays
    accumulate until a human runs the printed remedy, and a human's own window keeps a floor host
    alive after its floor's sessions are gone, by design.
  - **The default tmux server, not a private socket — started hygienically.** The alternative — a
    private `-L ward` server — is attractive for isolation from name collisions and from a stray
    `kill-server`, and loses because it hides every floor host from the surface humans actually
    check: they should appear in the human's own `tmux ls`, which is the seam's at-a-glance
    requirement met with zero new surface. If collisions bite in practice, the socket is a one-line
    adapter change and a superseding note here. The cost of sharing is that exposure plus an
    obligation: the tmux server inherits the argv of whichever client first forks it, so a create
    run naked would leave the workspace path in the server's command line — and an agent clearing
    its own dev server with `pkill -f <workspace>` would SIGKILL the shared server and every host on
    the machine ([muxel](prior-art/muxel.md) documents the incident and the fix). The adapter runs
    `tmux start-server ';' set -s exit-empty off` — no workspace path in the argv — ahead of any
    create, and before the store lock is taken.
  - **Explicit flag refuses; configured default degrades — both honestly (§20).** `--detach` with no
    usable tmux is refused with the diagnosis and remedy (detachment was the point of the
    invocation); `agent.host: tmux` with no usable tmux degrades to foreground and says so — "host
    tmux unavailable — running in the foreground; this session ends with this terminal"
    ([pond](prior-art/pond.md) draws the same line). The alternative — one uniform behavior for both
    — loses each way: a silent substitution hides the seam's named consequence, and a refusal on a
    preference makes configuration the reason an agent cannot start (0029's own argument). Doctor
    names the precise break either way. The cost: two behaviors to teach.
  - **Resume refuses over a live window — a detection the store lock makes exact.**
    `claude
    --resume` on a conversation still running in a window would race two processes over
    one thread's state. The gate asks the layered probe — a **live pane**, not a merely-present
    window — and the refusal names the true verb: attach. Because the probe and the create run
    inside the store write (above), two resumes racing past each other are serialized: the second
    sees the first's verified live window and is refused toward attach. The first version's
    alternative — a TTL'd claim table ([cmux](prior-art/cmux.md) built one for this race) — is
    unnecessary once the store lock covers the create. The cost is the lock's cost, already named.
  - **Attach re-creates when the live window is gone — through the same path that opened it — and
    inherits locate's honesty when the transcript is gone too.** Re-create is a hosted resume: same
    handle, same recorded directory, the window placed in the host its placement floor names
    (created, with floor 0 linked in, if the floor has none). Internally the hosted open, attach's
    re-create, and `resume --detach` are **one ensure function** differing only in argv (start vs
    resume) and in whether the record already existed — [isolade](prior-art/isolade.md)'s "no
    separate first-attach path". Two shortcuts were declined, as before: `new-session -A`
    ([muxel](prior-art/muxel.md)) cannot choose between start and resume argv and has no window
    grain, and a `--continue` rung under the resume ladder ([dmux](prior-art/dmux.md) and most of
    the field) can steal a sibling session's conversation in a shared directory
    ([muxel](prior-art/muxel.md)) — and a floor host is precisely many sessions over shared
    directories. When `locate` says the transcript is gone as well, attach refuses with that answer
    rather than opening an empty conversation under an old id. The cost: a caller expecting the
    field's continue-latest recovery gets a refusal naming `locate` instead.
- **Layout:** two boundaries, mirroring the harness seam's. `src/host/` knows tmux — argv shapes,
  host and window stamps, view construction, probe classification, the hygiene preamble — and
  nothing about Ward's records (a second host would be a second file here), while
  `src/agent/host.ts` is the Ward-shaped half: placement, the ensure function, the
  attach/observe/re-create flows, ownership verification, floor-0 linking, and close teardown,
  consuming `src/agent/run.ts`'s argv building rather than duplicating it. Placement lives on the
  Ward side because it reads records (scope, task floor, parent); the adapter receives a floor
  number and never learns why. The record grows one provenance field and two events; the session
  verbs, doctor, configuration (`agent.host`, enum-validated exactly as `harness` is), and the
  manifest extend in place. Tests mirror the boundary: a stub tmux beside the stub harness drives
  the suites hermetically, and the real-tmux premise smoke lives beside them, outside the hermetic
  gate.
- **Mechanisms:**
  - _Placement._ `placementFloor(session)` = `placementFloor(parent)` when the session records a
    parent whose record exists and whose placement floor is not 0; otherwise the session's own floor
    (workspace scope and legacy bare tasks → 0, project scope → its floor, task scope → its task's
    floor). Pure over records, recomputed on every launch and every read that needs it; never
    stored.
  - _Finding and minting hosts._ `findHost(root, floor)` = one `list-sessions -F` over
    `#{session_name} #{@ward_workspace} #{@ward_floor} #{@ward_view} #{session_created}`, keeping
    non-view entries whose stamps equal `(root, floor)` — the oldest when several. When none:
    `mintHostName(workspaceName, floor)` = `ward-<workspace>-f<floor>` munged to `[A-Za-z0-9_-]`; a
    live tmux session already wearing that name (it was not found by stamp, so it is not ours) is
    the foreign-holder refusal. The `ward-` prefix is the namespace: doctor's scan key, and the
    boundary destructive verbs refuse to cross.
  - _Creating a floor host._ One chained invocation: `new-session -d -s <name> -x 120 -y 40` (a
    placeholder window, no `-e`, so the host's environment carries nothing session-specific)
    `';' set-option -t '=<name>' @ward_workspace
    <root>`, `@ward_floor <N>`,
    `@ward_version <v>`, `detach-on-destroy off`. The placeholder is then replaced: for a floor
    other than 0, by a link to the first live floor-0 window
    (`link-window -k -s <f0-window> -t '=<name>':<placeholder>`), the rest linked after it; for
    floor 0, or when no floor-0 window exists, it is killed once the session's own window exists.
    Floor 0 therefore sits at the left edge of every floor host, and nothing reads indexes.
  - _Hosted open._ Resolve configuration (host, model, effort, args) → mint the session id → hygiene
    preamble (`start-server ';' set -s exit-empty off`) → **under the store lock**: write and commit
    the record (state `open`, handle, `host: tmux`, directory, purpose, model/effort, parent) with
    its `opened` event, compute the placement floor, find or create its floor host, then one chained
    invocation:
    `new-window -d -P -F '#{window_id} #{pane_id}' -t '=<host>:' -n <label> -c <dir>
    -e WARD_AGENT=<id> <claude argv>`
    followed by `set-option -w -t <window_id>` for `@ward_session <id>`, `@ward_epoch <opened.at>`,
    `@ward_pane <pane_id>`, `remain-on-exit on`, `automatic-rename off`, `allow-rename off`; then,
    for a floor-0 window, `link-window` into every live floor host → **release the lock** → report
    (`--json` emits here) → verify: the window verifies, and its pane is not dead a beat later (an
    instant death is reported now with the retained exit status — [muxel](prior-art/muxel.md) reads
    an immediate exit as a bad launch) → print the affordances: `ward session attach <id>` and the
    raw `tmux attach -t '=<host>'` beside it (a command that works even where `ward` is not on PATH,
    landing on the floor rather than the window). One inherited consequence is named rather than
    solved: a pane's environment descends from the **tmux server's** creation environment, not the
    invoker's — so credentials or agent sockets exported after the server first started are not in
    hosted runs ([herdr](prior-art/herdr.md)'s issue trail). Ward sets what it owns explicitly via
    `-e`; doctor's capability finding is where a confused human is pointed.
  - _Attach._ Resolve the session (open only) → classified probe: **live and ours** → ensure the
    floor-0 links of the window's host → create a view
    (`new-session -d -t '=<host>' -s
    <host>-v<n>`, stamped `@ward_view`,
    `destroy-unattached on`), `select-window` the session's window in it, and
    `attach-session -t '=<view>'` — or `switch-client -t '=<view>'` when `$TMUX` says the caller is
    already a client. The window is attached wherever it stands, even if a human moved it out of its
    placement host. **Tagged but not ours** (stamp or epoch mismatch) → refuse, naming the holder
    and the remedy. **Dead pane** → read the retained exit, and fall through to re-create, which
    kills the dead window under the lock first — the discovered exit rides into the record as the
    `resumed` event's cause ("previous run exited 0", "killed by SIGKILL"), [bb](prior-art/bb.md)'s
    typed interruption reason realized without new schema. **Gone** → re-create: locate first;
    transcript found → the ensure path with resume argv (epoch = this `resumed` event's `at`), then
    attach as above; transcript gone → refuse with locate's answer. **Could not determine** → refuse
    with the diagnosis, never re-create. Append `attached` before handing the terminal over.
    Idempotent by construction: attaching twice is two views on one window.
  - _Observe._ Live and ours only: `new-session -d -s <host>-o<n>` (stamped `@ward_view`,
    `destroy-unattached on`), `link-window -k -s <window_id> -t '=<view>':<placeholder>`, then
    `attach-session -f read-only,ignore-size -t '=<view>'` — a view of one window, read-only
    enforced by the tmux server ([prime-agent](prior-art/prime-agent.md) needed a protocol verb pair
    and wrapped envelopes for the same guarantee). Appends `observed`. Dead or gone → refusal naming
    `attach` (which would re-create) and `locate` (which reads the history).
  - _Resume._ Unchanged flow from 0029, with one new gate at the top, inside the store write: probe,
    and refuse over a **live pane** with the attach command in the message. A dead window does not
    block — its exit is recorded and the window cleared. `--detach` routes the resume through the
    ensure path (new window in the placement host, `resumed` appended, affordances printed, no
    wait).
  - _Close._ After the record mutation: find and verify the window, `kill-window -t <window_id>` if
    present — live or dead-pane alike; then, for a floor host left holding only floor-0 links,
    `kill-session -t '=<host>'`. Each teardown is reported in the mutation's steps. A kill that
    finds nothing is a no-op, not an error; a window that answers but is not ours is left standing
    and reported, never killed.
  - _Locate._ The existing transcript answer, plus a `host` block when the record says the session
    was hosted: `{kind, host, window, floor, state, exit?}` — `host` the floor host found (by stamp)
    holding the window, `window` its id, `floor` the derived placement floor, `state` one of
    `live | exited | gone | unknown`, `exit` the retained status and signal when the pane is dead —
    and `null` for foreground sessions. Every field except `kind` is derived fresh at read time
    ([pond](prior-art/pond.md)'s re-derive-every-run rule).
  - _Doctor._ Findings, each derived from one `list-sessions` and one `list-windows -a` joined
    against every session record: **Capability** — the tmux binary and its version against the floor
    the build pins (per-window user options, `new-window -e`, client flags); a finding, not an
    error, since foreground is a complete technique. **Stray windows** — a window carrying
    `@ward_session`, in a host stamped with this workspace, that verifies against no open record
    (closed, missing, or an older epoch): named with `tmux kill-window -t <window_id>` as the
    remedy, attributed by its session id, flagged when a client is viewing it — never swept. **Stray
    hosts** — a floor host of this workspace holding only floor-0 links (a close interrupted between
    its two kills), or a duplicate host for one floor; and leftover views with no client. **Foreign
    hosts** — `ward-` hosts stamped with another workspace root, attributed and left alone
    (information: another workspace's, or this one before a move). **Gone** — open hosted records
    whose window is absent or dead — information ("not running — attach re-creates it", with the
    retained exit status where the pane lingered), because after any reboot this is the _normal_
    state of every detached session (§20). **Misplaced** — a verified window living in a host other
    than its placement floor's: information; attach follows it. **Missing floor-0 links** —
    information; attach repairs. **Could not determine** — an unreachable or erroring tmux reported
    as exactly that, never as "no strays found" ([amux](prior-art/amux-survey.md)'s guarded
    reconcile), and never memoized between runs. **Version skew** — floor hosts whose
    `@ward_version` predates the running ward: information ([herdr](prior-art/herdr.md)).
  - _Reboot, end to end (the scenario the seam exists for)._ The tmux server dies with the machine;
    every floor host and window is gone; every record survives. Nothing needs sweeping: the records
    still say `open`, doctor reports the gone windows as information, and each thread comes back
    through `attach` exactly when someone wants it — re-created into the host its placement floor
    names, the host created on that first attach and floor 0 linked in as its floor-0 sessions come
    back. Because placement is derived from records, the floors reassemble exactly as they were,
    without anything having remembered a window. No mass restart burns tokens on threads nobody is
    ready to look at ([amux-survey](prior-art/amux-survey.md)'s own code declines to auto-restart
    too; [dmux](prior-art/dmux.md)'s restart-everything-on-load is the alternative, built, and
    priced). The future recovery arc orchestrates mass re-attachment per the lifecycle slice — most
    naturally floor by floor, coordinator first; this entry supplies the per-session mechanics it
    will call, and hands it one rule from the survey: anything that ever auto-recreates needs an
    anti-flap guard ([bb](prior-art/bb.md)).
