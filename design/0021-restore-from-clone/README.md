# 0021 — Restore from a fresh clone: the record re-materializes the world

> `ward workspace restore` — the converse of every other verb: it changes the **world** to match the
> record and writes no record at all. On a fresh clone of the workspace repository (complete record,
> empty machine state) it re-clones every canonical checkout from its recorded remote onto its
> recorded main line, re-creates every non-closed task's worktree at its recorded path from a
> **surviving** branch — local, or origin remote-tracking — and names a branch reachable nowhere
> **lost**, loudly, record kept, never fabricated. Doctor learns to name each missing
> materialization with this verb as its remedy. Idempotent: on an intact workspace every row reads
> satisfied and nothing changes.
>
> **Status:** accepted · **Started:** 2026-08-16

The owner's question, verbatim: "say I've cloned the workspace repository from scratch, how does it
get back into the state of having all the repos + worktrees checked out in the appropriate spot. not
sure if this is a doctor thing, a refresh thing, or something new." The workspace's git tracks the
record (workspace.md, catalog.md, projects/, tasks/, repositories/, `.ward/baselines.md`) and
ignores the world the record describes (`repos/`, `worktrees/`, `workdirs/`) — so a fresh clone is a
complete record standing over nothing. The workspace calls itself "a structured, self-sufficient
record of work in progress"; this entry is where **self-sufficient is proven**: the record alone
must be enough to re-materialize the working state. The verb-shape question — doctor, refresh, or
something new — is adjudicated under Design → Decisions: something new, and why.

## Serves intent

- [`workspace-lifecycle`](../../intent/01-concepts/06-workspace-lifecycle.md) — three sections
  converge here. _Preconditions_: §3's self-sufficiency is about the **record, not the machine** —
  restore is the operation that makes the record's sufficiency mechanical rather than aspirational.
  _Workspace integrity_: the **record↔disk** drift class ("an anchor the record knows that is no
  longer there") and the **repair posture** — report everything, repair autonomously only what is
  **local and reversible**; restore only creates, never destroys, and reads remotes without writing
  them (the same §18 argument that makes registration autonomous). _The repository set_: "the
  workspace records enough to **resolve** it — its identity, its remote, and the name of its main
  line" — recorded at registration exactly so this moment needs nothing else.
- [`domain-model`](../../intent/01-concepts/00-domain-model.md) — the canonical checkout as the
  contained, per-repository main-line checkout restore re-establishes; a worktree's identity as the
  natural key (repository + branch) the record carries; the workspace's own repository as the
  stewardship worktree source (the root IS its main-line checkout — restore's workspace arm speaks
  to the root, per 0019's mechanics).
- [`work-lifecycle`](../../intent/01-concepts/03-work-lifecycle.md) — closed tasks' worktrees were
  settled at the gated close and are **not asked** (re-materializing one would undo a correct
  teardown); the toil's fail-safe posture carried over: restore touches nothing that exists.
- [`principles`](../../intent/00-foundation/01-principles.md) — §6: restore converges (all
  satisfied, zero changes on an intact workspace — the workspace-create pattern); §16: the record is
  the source of truth the world is rebuilt from; §17: a branch reachable nowhere is **named lost,
  never fabricated** — inventing it from the main line would be silent corruption wearing a healthy
  outcome's name; §18: everything restore does is local and reversible, so the verb is autonomous
  once invoked; §20: every unrestorable item degrades to a named outcome carrying its remedy, and
  per-item failures are contained (one dead remote blocks nothing else).
- [`human-shell`](../../intent/02-subsystems/07-human-shell.md) — verbs read true: `restore` is the
  plain word for re-materializing what the record describes; the verb serves both audiences per 0015
  (`--json`, registered schema, document-plus-exit-code posture).

## Scope

- **In:**
  - **The verb: `ward workspace restore`** (module: `restoreWorkspace` in
    `src/workspace/restore.ts`). One sweep, three groups, per-item outcomes: **repositories**
    (`restored | satisfied | failed`), **worktrees** (`restored | satisfied | lost | failed`),
    **sessions** (a count and an honest note — named, never restored). Writes **no record**: no
    document, no journal commit, no store lock (nothing in the record advances — restore is the
    converse of every other verb). Refuses inside a stewardship copy (0019's guard). Exit 1 when any
    row is `lost` or `failed`, with the report still rendered/emitted — the repo-refresh posture:
    the verb completed and reported; the verdict lives in `$?`.
  - **Canonical checkouts restored from the record alone**: for each `repositories/<name>.md` whose
    `repos/<name>/` is absent, re-clone from the recorded remote and land on the recorded main line
    — via 0003's own converge path (`addRepository` with the recorded remote), so restore cannot
    drift from what registration means.
  - **Worktrees restored, never fabricated**: for each non-closed task's worktree record whose path
    is absent — after `git worktree prune` clears any stale registration — the recorded branch is
    resolved **honestly, in order**: surviving locally → checked out where it stands; surviving as
    `origin/<branch>` (the fresh-clone case: pushed work outlives the machine) → re-created from
    that ref; before naming it lost, origin is asked once (a targeted fetch, so a stale mirror
    cannot manufacture a false loss). A branch reachable nowhere is **lost**: the outcome says so,
    the detail names the adjudication (recover it by other means, or
    `ward task close CODE --outcome abandoned`), and the record is left intact.
  - **Workspace-source worktrees** (0019's `source: 'workspace'`): same resolution against the
    workspace's own repository — in a fresh clone the stewardship branch typically survives as an
    origin remote-tracking ref, and the worktree materializes at the root exactly as 0019's
    mechanics do. The origin is whatever the clone has — a local path in every test; nothing here
    requires a forge.
  - **Fresh-clone legibility in doctor**: a new per-worktree materialization finding for every
    worktree record of a non-closed task (`ok` on disk; `warn` naming task, branch, source, and the
    remedy `ward workspace restore`), and the existing missing-checkout finding now names restore
    first (the `ward repo add` spelling kept beside it). All restore-class findings are `warn` —
    named drift with remedies, not a wall of errors.
  - **Sessions in the record, named**: the report counts open session records and says plainly that
    a session is not restorable state (its run lived in a harness on the machine that recorded it),
    naming `ward session close ID` for what died there. Never silently ignored, never touched.
  - **Both audiences**: `--json` emits the typed report under `workspaceRestoreShape`, registered in
    the schema registry (so `ward schema workspace restore` documents it) and in telemetry's
    `VERB_TREE`.
- **Deferred:**
  - **The recorded workspace main-line name — the 0020 interaction.** The concurrent entry 0020
    records the workspace's own main-line name in the record. Restore was deliberately shaped not to
    need it: the worktree arm resolves **branch refs only** and never consults the workspace's main
    line, so nothing here depends on, anticipates, or duplicates 0020. What the recorded name would
    add later: verifying that a fresh clone's checked-out branch IS the recorded main line before
    materializing against it (today a clone parks on the origin's HEAD, honestly), and the
    root-off-main doctor finding — both additive follow-ons once 0020's field exists. _Why safe:_
    restore's outputs are branch-exact either way; only the verification nicety waits.
  - **Auto-closing or migrating stale sessions from another machine.** Intent's operation map
    assigns re-establishing live work to **recovery** (`attach`), which does not exist yet; restore
    closing them would be Ward guessing (§17). _Why safe:_ the records stay honest and named, and
    `ward session close` is the human's per-session remedy today (SF-002).
  - **Restoring uncommitted or unpushed work no record can reach — impossible by construction, and
    said so.** Uncommitted tree state was never in any git object store; an unpushed branch's only
    copy died with the old machine's clone. No record, no surviving ref — nothing honest can
    re-materialize it. Restore's `lost` outcome is this impossibility named per item, not a gap.
  - **Forge-dependent verification.** Restore is pure git against recorded remotes — clones, refs,
    worktree adds. _Why safe:_ nothing in the fresh-clone problem needs a forge, and the workspace
    repository's origin may be a local path (proven throughout the tests).
  - **A `needs you` item for lost work.** The attention list is forge-derived today (0009/0014); a
    lost row already exits 1 and names its adjudication inline. _Why safe:_ additive derivation
    later, the 0019 awaiting-close precedent.
  - **Workdirs.** No workdir records exist yet (0004 deferred the anchor kind). _Why safe:_ when
    they exist, they join the same sweep as a third group.
  - **Repairing drift inside things that exist.** A checkout with the wrong origin, a dirty tree, a
    drifted branch: doctor names these (0003, 0016) and restore leaves them alone — restoring is the
    remedy for **absence**; overwriting a present thing could destroy work (§17). _Why safe:_ the
    division is doctor's own (report vs. repair), and refresh/rebase remain the maintenance verbs
    for what exists.
- **Acceptance:** from a cold checkout, `mise run check` is green, and `bun test` proves:
  1. **the fresh-clone flow end to end**: a workspace with a registered repository (bare origin,
     branch `trunk` — recorded, never assumed), an open task with a worktree on a pushed branch, and
     a workspace-source worktree → `git clone` by local path → restore → `repos/demo` back on
     `trunk`, both worktrees re-created at the recorded paths on the recorded branches **at the
     surviving tips**, doctor healthy and clean of restore-class findings;
  2. **the lost branch**: a worktree record whose branch was never pushed → restore names it `lost`
     (detail: "reachable nowhere", the abandoned-close remedy), leaves the record on disk,
     materializes nothing at the path, exits 1 — and a re-run names the same loss (converge-stable,
     resolving nothing by fiat);
  3. **a workspace-source worktree restored from an origin remote-tracking branch**: the local
     branch re-created from `origin/steward/<slug>` at the surviving tip, materialized as a linked
     worktree of the workspace's own repository;
  4. **idempotence**: restore on an intact workspace reports every row satisfied and a before/after
     snapshot (root HEAD, porcelain, both `git worktree list`s, canonical HEAD) is identical;
     partial states (worktree dir deleted; whole checkout deleted) restore only what is absent;
  5. **doctor on a fresh clone**: one warn per missing materialization — repository and worktree —
     each naming what is missing, whose branch it anchors, and `ward workspace restore` as the
     remedy; plus, through the spawned CLI: the `--json` document validating under the registered
     shape (absent-not-null optionals per 0019's XOR), the lost-branch exit posture, the
     all-satisfied re-run, and the stewardship-copy refusal.

## Design

- **Decisions:** no new ADRs — the existing stack carries this entry. Entry-local:
  - **The verb shape: something new — `ward workspace restore` — and neither doctor nor refresh.**
    The owner's three candidates, adjudicated against intent: **doctor** is report-only ("it names,
    it never heals" — the repair posture separates diagnosis from remedy, and folding the remedy in
    would put a world-mutating act inside the verb that is "safe to run at any time");
    **`repo refresh`** maintains checkouts that exist (fetch + fast-forward), carries the wrong noun
    for worktrees, and its outcomes (dirty, diverged) are about drift within present things — a
    different question from absence; **`workspace create`** converges the **record and installed
    artifacts** and may legitimately fabricate what is missing (that is what creation is), while
    restore converges the **world to the record** and must never fabricate — one verb doing both
    would blur the exact line that keeps restore safe. So: one new verb, sweeping the whole
    workspace, per-item convergent — doctor recommends it finding by finding, mirroring intent's
    "doctor diagnoses and recommends the other two". The workspace noun reads true: the thing
    restored is the workspace's materialized state. (The map's missing row is SF-001.)
  - **One sweep, not per-thing remedies.** The fresh-clone moment is the motivating case, and it
    wants one act, not N invocations of `repo add`/`worktree create` with arguments the human must
    copy out of records Ward can read itself — the toil intent says Ward absorbs. Per-thing
    granularity costs nothing to keep: the sweep restores only what is absent, so any subset can be
    converged by running the whole verb.
  - **Restore never fabricates — the create/restore line.** `worktree create`'s convergence
    re-creates a missing branch from the main line (0019): correct for creation, where the branch is
    new by definition. Restore's contract is the converse: the record proves the worktree _existed_,
    so its branch must **survive** somewhere — locally, or on origin — or the honest outcome is
    `lost`. Re-branching from main would fabricate an empty worktree wearing the record's name,
    silently converting "work lost" into "work never happened" (§17's exact hazard). This is why
    restore does not call `createWorkspaceWorktree` even where it would almost fit.
  - **Checkouts ride 0003's converge path.** `restoreRepository` calls `addRepository` with the
    **recorded** remote: record present and matching → clone → land on the **recorded** main line
    (`ensureOnMainLine` with `existing.mainLine` — recorded, not re-detected). One mechanism for
    "make the checkout match the registration", whichever verb asks — restore cannot drift from what
    registration means, and the 0003 tests keep carrying it.
  - **No record writes → no store lock, no journal commit.** Every other lifecycle verb commits the
    record forward; restore's effect on the record is nil by design, so there is nothing to
    serialize (0013's lock protects record write-and-commit spans) and nothing to journal (a journal
    entry records the record advancing — here it does not). Concurrent restores collide only inside
    git, whose errors are legible — the same argument 0004 made for keeping `git worktree add`
    outside the lock.
  - **Satisfied means present, not healthy.** A checkout with the wrong origin or a worktree on a
    drifted branch reads `satisfied` here: restore restores **absence**, and "repairing" a present
    thing means overwriting state that may be the human's work. Doctor names those drifts (0003's
    origin check, 0016's freshness) and their remedies stay their own verbs. One verb, one question:
    is the world the record describes on disk?
  - **`lost` and `failed` exit 1, document still emitted.** `failed` is transient (a dead remote —
    retry when it is back); `lost` is a standing adjudication the human must make. Both mean the
    record and the world still disagree after the verb did all it honestly could — exit 0 would
    claim a convergence that did not happen. The document/report always renders (the repo-refresh
    posture): outcomes are data, the verdict is `$?`, and the two never disagree.
  - **The targeted fetch before `lost`.** "Reachable nowhere" must be proven against origin itself,
    not against a possibly-stale mirror — a branch pushed after the canonical's last refresh is
    _not_ lost. One targeted fetch (`git fetch origin +refs/heads/<b>:refs/remotes/origin/<b>`) asks
    exactly that question; a repository with no origin fails the fetch and the local absence stands.
    Restore is the low-frequency materialization verb whose whole nature is network (clones), so the
    fetch costs what the verb already costs — the inverse of 0016's zero-network glance argument,
    §20's cost decision cutting the other way.
  - **Closed tasks are not asked** — their worktrees settled at the gated close (torn down
    deliberately), and re-materializing one would undo a correct teardown and manufacture drift out
    of history. The 0016 posture, applied to a mutation.
  - **Sessions are named, never restored, never touched.** A session record's run lived in a harness
    on the machine that recorded it; nothing here can resume it, and closing it en masse would be
    Ward guessing at the human's threads (§17). The report carries the count and the honest sentence
    — silent ignoring is the one thing intent forbids (SF-002 for where the adjudication should
    eventually live).
  - **Doctor's worktree findings are `warn`, per-worktree, in the repository idiom.** One finding
    per missing materialization, each naming the task, branch, source, and remedy — a fresh clone
    reads as a legible list of named drifts, not undifferentiated errors (nothing is _broken_: the
    record is intact and the remedy is one verb). `ok` rows keep the "which are clean" half
    explicit, exactly as the repository checks do.
- **Layout:** `src/workspace/restore.ts` (new, self-contained: `restoreWorkspace`,
  `restoreConverged`, the per-repository and per-worktree mechanisms) — the restore seam in one
  module; `src/workspace/doctor.ts` (`worktreeChecks` added beside `repositoryChecks`; the
  missing-checkout message now names restore, keeping the `ward repo add` spelling);
  `src/cli/schema.ts` (`workspaceRestoreShape` + registry row `'workspace restore'`);
  `src/cli/json.ts` (`workspaceRestoreJson`); `src/cli/index.ts` (the `restore` command under the
  `workspace` noun, `cmdWorkspaceRestore` + `renderRestore`); `src/cli/telemetry.ts` (`VERB_TREE`
  workspace: `restore`). Tests: `test/workspace/restore.test.ts` (8 mechanism cases, module calls),
  `test/cli/restore.test.ts` (4 spawned-CLI cases) — new files only, plus the one auto-derived
  `ward schema workspace restore` case the 0015 registry loop adds by itself.
- **Mechanisms:** _sweep:_ refuse-in-copy → per repository record: checkout present → satisfied |
  absent → 0003 converge (clone from recorded remote, land on recorded main line) → restored |
  WardError → failed → per non-closed task (counting open sessions along the way), per worktree
  record: path present → satisfied | repo row failed → failed | prune → branch resolution (local ref
  → check out; origin ref → re-create; targeted fetch, re-check; else lost) → sessions note.
  _Doctor:_ per non-closed task's worktree record, one present/missing finding beside the repository
  integrity rows. _CLI:_ report rendered in three groups (lost/failed rows loud, not dimmed),
  `--json` document + exit-code verdict.

## Build log

### 2026-08-16 — The verb, the doctor findings, and the acceptance suite in one iteration

**Goal.** Everything in Scope. **What was done.** Built `src/workspace/restore.ts` (the sweep, the
honest branch resolution, the lost outcome, the sessions note); grew doctor with `worktreeChecks`
and the restore-first missing-checkout remedy; registered `workspace restore` in the CLI
(`workspace` noun), the schema registry (`workspaceRestoreShape`), json builders, and telemetry's
`VERB_TREE`. Tests: `test/workspace/restore.test.ts` (8 mechanism cases: fresh-clone end to end,
workspace-source from origin, lost with converge-stable re-run, intact-workspace snapshot
idempotence, partial states, sessions named, doctor legibility, dead-remote containment) and
`test/cli/restore.test.ts` (4 spawned-CLI cases: the flow with doctor before/after and the
all-satisfied re-run, the `--json` document under the registered shape, the lost exit posture, the
stewardship-copy refusal) — new files only.

**What works now — with the commands that prove it** (Bun 1.3.14, git 2.54.0, macOS):

- `bun test` → `288 pass, 0 fail, 1154 expect() calls` across 30 files (from 275/1056/28 at entry
  start on main a777068 — measured by stashing this entry's changes: +8 module cases, +4 CLI cases,
  +1 auto-derived `ward schema workspace restore` case from the registry row). All five acceptance
  scenarios, including the surviving-tip assertions (restored worktrees stand at the original
  commits, proven by rev-parse equality), the `trunk` main line proving recorded-not- assumed, and
  the before/after snapshot equality on the intact workspace.
- `mise run check >/dev/null 2>&1; echo exit=$?` → `exit=0` (Biome + dprint + `tsc --noEmit` +
  `bun test` + lychee).
- Dogfood smoke in a scratch directory (`bun src/cli/index.ts`, never the live workspace): built a
  workspace with a registered repo (bare origin on `trunk`), a pushed t1 worktree, and a t2
  stewardship worktree; `git clone` of the workspace; `ward doctor` in the clone names three warns
  (`repository demo … re-materialize it: ward workspace restore`, one per missing worktree, each
  naming its branch and source); `ward workspace restore` renders
  `restored demo (cloned from … on trunk)`, both worktree rows re-created from their origin refs,
  `no open session records`, `Workspace restored — 3 restored, 0 already satisfied.`;
  `ward
  doctor` after: `healthy — nothing needs attention`.

**Decisions** (entry-local, found while building): all recorded under Design → Decisions; two worth
naming — the fresh-clone doctor stays `healthy` (warns, not errors), which the smoke made visible
and the legibility scope item blesses: named drift with remedies is exactly what "not a wall of
undifferentiated errors" asks for; and the spawned-CLI assertions compare against the clone's **real
path** (macOS `/var` → `/private/var`), the same wrinkle 0019's enclosure tests hit.

**Shared-surface accounting** (for the rebase against the concurrent 0020): `doctor.ts` — one new
function + one call site + two imports + one reworded message (the `ward repo add` substring kept,
so 0003's test pin holds); `cli/index.ts` — one command, one dispatch arm, two functions, two
imports, `or(workspaceCreate, workspaceMerge, workspaceRestore)`; `schema.ts` — one shape + one
appended registry row; `telemetry.ts` — `'restore'` appended to the workspace verb array (0020
appends `'upgrade'` to the same array — a trivial textual conflict); `json.ts` — one builder + two
imports. No pinned count changed: `mutation-json.test.ts`'s workspace-create step count (12) is
untouched, and the +1 schema test derives from the registry row without editing that file.

**Next.** When 0020 lands: teach restore's workspace arm and doctor the recorded main-line name
(verify the clone stands on it; name the drift when it does not). Then, in dogfood-priority order: a
`needs you` derivation for lost rows; workdirs joining the sweep when 0004's deferred anchor kind
exists; recovery (`attach`) taking over the session adjudication restore currently only names.

## Spec-feedback

- **SF-001** — [`workspace-lifecycle`](../../intent/01-concepts/06-workspace-lifecycle.md), _Putting
  a workspace right: three operations, one map_. _Friction:_ the map has no row that owns
  **re-materializing the world from the record**. A fresh clone's condition — record complete,
  machine state empty — falls between the rows: doctor is read-only ("changes little"), recovery
  re-establishes **live work** and explicitly "assumes the environment is already sound", and
  update/migrate aligns generations. Yet the same slice's integrity section names record↔disk drift
  and a repair posture that _permits_ the repair (local, reversible → autonomous) — intent
  authorizes the act but no operation is chartered to perform it. _Assumption to keep moving:_ a
  fourth operation, `workspace restore`, governed by the repair posture, recommended by doctor
  finding-by-finding (extending "doctor diagnoses and recommends the other two" to three), and
  running **before** recovery in the cold-start ordering (recovery's "environment already sound"
  presumes the anchors exist). _Proposed revision:_ add a **Restore** row to the map — asks: "is the
  world the record describes still on disk, and can it be honestly rebuilt from the record?"; owns:
  re-materializing canonical checkouts and anchors from recorded state, naming what cannot be (lost
  work is adjudicated, never fabricated) — and note the composition: doctor recommends restore;
  recovery assumes restore has run.
- **SF-002** — [`workspace-lifecycle`](../../intent/01-concepts/06-workspace-lifecycle.md),
  _Workspace integrity_ (record↔harness), with
  [`sessions-and-lifecycle`](../../intent/01-concepts/02-sessions-and-lifecycle.md). _Friction:_ the
  drift class names "a session whose harness handle no longer resolves", but a **relocated**
  workspace makes that true of _every_ open session at once — the handles reference another
  machine's harness state — and no slice assigns the adjudication: closing them wholesale would be
  Ward guessing which threads the human considers dead (§17), while leaving them reading `open`
  forever quietly misreports the workspace's live state. _Assumption to keep moving:_ restore counts
  and names open session records (never touches them), and the human adjudicates per-session with
  `ward session close` until recovery exists. _Proposed revision:_ state in the sessions slice that
  a session record is **never machine-portable live state** (the handle is meaningful only where it
  was recorded), and charter **recovery** (`attach`) as the operation that adjudicates relocated
  sessions — re-attach where the harness resolves, surface the rest — with restore and doctor
  limited to naming the condition.

One near-candidate adjudicated rather than filed: _Ward does not defend its own presence_ says
"there is no operation that restores a workspace to Ward's shape", which a reader could hear this
verb contradicting. It does not: that sentence is about Ward's **installed artifacts** a human
deliberately stripped (guidance, skills — deliberate departure, reported once then left alone); this
verb re-materializes the **world the record describes** (checkouts, worktrees) for a human who wants
it back, on their own invocation. The two operations answer different losses, and the non-goal
stands untouched.
