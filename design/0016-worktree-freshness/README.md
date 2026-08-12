# 0016 — Worktree freshness: the glance that tells you the rebase is needed

> `ward status` grows per-worktree freshness on every non-closed task — behind `origin/<mainLine>`
> by N commits (with the rebase remedy named), current, dirty, drifted, or unreadable — derived at
> read time from local git alone, zero network, never stored, honest about being exactly as fresh as
> the last `repo refresh`.
>
> **Status:** accepted · **Started:** 2026-08-12

[`0011`](../0011-worktree-rebase/README.md) built the freshening toil's rebase half; nothing tells
you it is needed. Today "is this worktree behind main?" is answered by running
`ward worktree rebase` and seeing what happens — the question held exactly where intent says Ward
holds it instead: "**which worktrees are behind**, which are clean, which are blocked should be
readable at a glance, not held in the human's head"
([`work-lifecycle`](../../intent/01-concepts/03-work-lifecycle.md)). The answer is cheap by
construction: worktrees are worktrees _of_ the canonical checkout
([`0004`](../0004-work-spine/README.md)), sharing its object store and refs, so `origin/<mainLine>`
is readable in any worktree with no network at all — 0011's object-store-sharing argument, spent
this time on a read instead of a mutation. This entry puts that answer where the eye already goes:
the status surface, per worktree, with the 0011 verb named as the remedy.

## Serves intent

- [`work-lifecycle`](../../intent/01-concepts/03-work-lifecycle.md) — _Ward absorbs the recurring
  toil_: "which worktrees are behind, which are clean … readable at a glance, not held in the
  human's head" — this entry is that sentence, built. Both of the toil's fail-safes shape the read:
  **evidence of unrecorded work is occupancy** (a dirty tree is reported as the occupancy fact it
  is, never as a behind-count inviting the rebase the fail-safe would refuse), and what the glance
  surfaces carries its remedy (`ward worktree rebase TASK`) rather than performing it — status is a
  read verb, and the rebase stays the caller's act.
- [`principles`](../../intent/00-foundation/01-principles.md) §17 — freshness is **derived at read
  time, never stored**: a recorded "behind" would go stale on every fetch and every rebase, the
  exact stale cache the principle warns about. §20 — precision is a **cost decision**: status is the
  high-frequency glance, so the answer comes from **local reads only** — zero network, bounded by a
  handful of local git invocations per worktree — and is honest about its vintage (as fresh as the
  last `repo refresh`); every link that cannot answer degrades to a named state or an absent field,
  never a guess. §16 — the **record claims the branch**: a worktree with something else checked out
  is `drifted`, named in the record's own terms, not silently measured as if the drift were the
  work. §6 — the same records plus the same git state produce the same bytes. §8 — both audiences
  get the same content: sub-lines for the human, `worktrees` rows in `--json` for the agent.
- [`human-shell`](../../intent/02-subsystems/07-human-shell.md) — status stays the one glanceable
  answer; the freshness rides it as per-worktree sub-lines rather than a new surface, and the
  attention list (`needs you`) is deliberately **not** grown — the adjudication is under Design →
  Decisions.
- [`domain-model`](../../intent/01-concepts/00-domain-model.md) — the canonical checkout stays the
  one local place the current main line is read: freshness compares against the `origin/<mainLine>`
  ref that checkout's refreshes maintain, which is what makes "as fresh as the last refresh" the
  true and honest statement of the answer's vintage.

## Scope

- **In:**
  - **Per-worktree freshness, derived at read time** (`worktreeStatuses` in
    `src/workspace/worktrees.ts`): for each worktree of each **non-closed** task, one of — `behind`
    `origin/<mainLine>` by N commits (`git rev-list --count HEAD..origin/<mainLine>`), `current`
    (atop it), `dirty` (uncommitted changes — the occupancy fact, checked first), `drifted` (not on
    its recorded branch — the checked-out branch named, or a detached HEAD), or `unreadable`
    (missing on disk, no repository record, or a git read that failed — honest absence). **Local git
    reads only; zero network at status time.** Nothing stored anywhere.
  - **Surfaced in `ward status`**: one indented sub-line per worktree under its task line — the
    worktree's path, the verdict, and, where behind, the remedy:
    `worktrees/t1-feature — behind origin/main by 2 commits — rebase with: ward worktree rebase t1`.
    The task line itself is untouched.
  - **In `status --json`**: the status task rows gain an optional `worktrees` array — per row
    `repo`, `branch`, `path` (record identity, always), `freshness` (absent when local git could not
    be asked — the availability convention), `behindBy` (present exactly when behind), `checkedOut`
    (present exactly when drifted onto another branch). Absent on closed tasks; `[]` when a
    non-closed task has none. Registered in the 0008 schema, so `ward schema status` documents it
    with no new surface.
  - **The `needs you` adjudication** — a behind worktree is **status-line-only**, argued under
    Design → Decisions.
  - **Tests, hermetic throughout:** the mechanism table over scratch workspaces with local bare
    remotes (current, behind-by-N only after the canonical refresh, dirty-over-behind, drifted on a
    branch and detached, missing, closed-not-asked, no-git-on-PATH); the spawned-CLI suite proving
    the behind case end to end — remote advances → `repo refresh` → the remote **renamed away** →
    status still names behind-by-N with the remedy (the zero-network proof) → `worktree rebase` →
    status reads current — plus both renderings and the JSON rows for every state.
- **Deferred:**
  - **Auto-rebasing at status time, or on a cadence.** Status is a read verb; a mutation under a
    read breaks its purity (§6 — repeating a read must change nothing) and would rebase under
    whoever is mid-thought in that worktree. The cadence is 0004's and 0011's standing deferral —
    nothing exists yet that can watch. _Why safe:_ the glance now names exactly what a cadence would
    act on, and the remedy verb already exists; a watcher later reads the same `worktreeStatuses`
    and calls the same rebase.
  - **Any fetch or network at status time.** §20: the high-frequency glance cannot afford it, and
    the canonical refresh (0003) already owns the network with a verb whose frequency matches its
    cost. _Why safe:_ the vintage is stated, not hidden — the answer is as fresh as the last
    refresh, and a refresh-then-status is two commands today, one cadence tomorrow.
  - **CI / checks state on the worktree lines.** That data rides the forge probe (deferred since
    [`0009`](../0009-live-forge-state/README.md)) — a different data source with a real per-call
    cost, nothing local git can answer. _Why safe:_ additive on `prForgeShape` when something reads
    it, exactly as 0009 left it.
  - **Freshness on `worktree list` (and `task list`).** Status is the glance surface; the roster
    verbs answer identity. _Why safe:_ `worktreeStatuses` is a pure read a sibling verb can call —
    additive when dogfooding wants it there.
  - **An ahead-count / divergence detail** (commits the branch carries beyond main). It routes no
    decision the behind-count doesn't already route — the rebase remedy is identical — and the PR
    set already tells the delivery story. _Why safe:_ one more `rev-list --count` behind the same
    row shape, additive.
  - **Yielding to recorded occupancy.** As in 0011: no occupancy record exists yet; the dirty-tree
    check honors the strongest available evidence. _Why safe:_ same gate, same slot, when the record
    exists — and a read verb mutates nothing regardless.
- **Acceptance:** from a cold checkout, `mise run check` is green, and `bun test` proves:
  1. **the behind case end to end through the spawned CLI**: the remote advances by two commits →
     `repo refresh` → the remote is made unreachable (renamed away) → `ward status` exits 0 and
     renders `behind origin/main by 2 commits — rebase with: ward worktree rebase t1` on the
     worktree's sub-line, with the JSON row carrying `freshness: 'behind', behindBy: 2` — proving
     the answer comes from local reads alone; after `ward worktree rebase t1` the same glance reads
     `current (atop origin/main)` with no `behindBy`;
  2. the derivation is honest about its vintage: a moved remote reads `current` until the canonical
     checkout refreshes, and `behind` immediately after;
  3. dirty, drifted (named branch and detached HEAD), and missing-on-disk each render their own
     state — dirty **before** behind is even asked, with no count;
  4. the JSON: rows validate under the registry schema, optional fields are absent (never null)
     exactly per their conditions, closed tasks carry no `worktrees`, a worktree-less open task
     carries `[]`, and without git on PATH the rows keep record identity while `freshness` vanishes;
  5. a behind worktree adds nothing to `needs you`.

## Design

- **Decisions:** no new ADRs — the existing stack carries this entry. Entry-local:
  - **Local reads only, and the honesty that buys.** The freshness question could be answered more
    freshly by fetching — and §20 says the glance cannot afford that: status is the highest-
    frequency verb in the workspace, and a network call per repository per invocation is the cost
    profile of `repo refresh`, not of a glance. Worktrees share the canonical checkout's object
    store and refs (0004; the 0011 argument), so `origin/<mainLine>` is present locally by
    construction and `rev-list --count HEAD..origin/<mainLine>` answers in milliseconds with zero
    network. The price is vintage: the answer is exactly as fresh as the last refresh — stated in
    the contract and pinned by a test (a moved remote reads `current` until the refresh) rather than
    papered over. A wrong "current" against an unfetched remote is not a lie; it is the true state
    of everything this workspace can locally know, and the refresh that changes the answer is a
    named, cheap verb.
  - **A behind worktree is status-line-only, not a `needs you` item.** The attention list's two
    springs (0009, [`0014`](../0014-stale-base-warning/README.md)) are recorded requests and
    derivable conditions **waiting on the human** — moments where only the human's judgment or
    authority moves the work: the gated close (§18), a reviewer's changes, a PR aimed where merging
    destroys work. A behind worktree is neither: it arises mechanically after **every** merge to
    main anywhere in the repository — the normal mid-flight state of any concurrent pair of tasks —
    waits on nobody's judgment, and its remedy is a local, reversible, already-built verb that
    intent ultimately assigns to **Ward itself** (the toil, on a cadence, when something can watch).
    Routing it through `needs you` would fire the attention list on every merge and train the human
    to skim past the items that genuinely need them — the cry-wolf failure the deduplicated-answer
    contract exists to prevent. The sub-line with its named remedy is the whole surface; if
    dogfooding proves a long-ignored behind worktree is a real risk, an entry can add a threshold
    condition additively. (The friction with work-lifecycle's own wording is SF-001.)
  - **One sub-line per worktree, always — not a task-line summary, not aberrant-only.** Three
    candidates were weighed. A task-line count (`— worktrees: 1 behind · 1 current`, the `prs:`
    precedent) keeps lines compact but buries **which** worktree is behind — the actionable datum —
    and leaves no room for the remedy; a count that needs a second lookup fails "readable at a
    glance". Rendering only aberrant states keeps quiet workspaces quiet but makes silence ambiguous
    — "no line" would mean either _current_ or _no worktree at all_, and intent asks for "which are
    clean" as explicitly as "which are behind". So every worktree of a non-closed task gets one
    indented sub-line: dim path, verdict, remedy where behind. The noise cost is one short line per
    live worktree — bounded by the same in-flight cardinality that bounds the task list itself — and
    the line pays for its space by carrying the worktree's **path**, orientation status never showed
    before ("where is this task's work on disk" was previously `worktree list`'s answer alone).
    Current lines render fully dim, so color carries the glance: a healthy workspace's worktree
    block is visually silent.
  - **Dirty is checked first and reported without a count.** The mandate order mirrors 0011's
    fail-safe order: uncommitted changes are evidence of unrecorded work — occupancy, whatever the
    record says (work-lifecycle) — and a behind-count printed under a dirty verdict would invite
    exactly the rebase the fail-safe refuses to run. One state per worktree, the strongest fact
    wins: occupancy over arithmetic. The count resumes the moment the tree is clean.
  - **Only the recorded branch is measured.** A worktree checked out on some other branch (or a
    detached HEAD) is `drifted`, in §16's language — the record claims the branch, and measuring
    whatever happens to be there would report the drift as if it were the work. Same posture as
    0011's refusal to rebase it; the read names it instead of compounding it.
  - **Closed tasks are not asked.** Their worktrees were settled at the gated close (torn down, or
    surviving only as records); spending git reads on settled work is the same waste 0009 declined
    at the forge — and rendering freshness for a torn-down worktree would manufacture `unreadable`
    noise out of a correct teardown. Absence of the `worktrees` field on a closed task means "not
    asked", exactly as absent `forge` does.
  - **The rows live on the status task shape, not the shared task shape.** `status` is the glance;
    `task list` is the roster and `worktree list` the worktree roster — the 0009 precedent
    (`openSessions` is status-only) and the smaller contract change. An agent wanting freshness
    without status has `worktreeStatuses` a pure call away (Deferred).
  - **Identity always, derivation under the availability convention.** A row's `repo`/`branch`/
    `path` come from the record — file reads that cannot fail while the workspace exists — so they
    are always present. `freshness` is derived through spawned git, so it follows 0009's convention:
    absent exactly when the capability could not be asked (no git on PATH), an enum verdict —
    including `unreadable`, which is an **answer** ("this worktree cannot be read"), not an
    unavailability — whenever it could. One wrinkle made the guard its own decision: `Bun.which`
    reads the process's original environment while `git()` spawns with the runtime env, so the guard
    passes `PATH` explicitly to stay in agreement with the spawn it guards (and to be testable the
    same way the hermetic git pins are).
  - **`rev-list --count HEAD..origin/<mainLine>` is the one measurement.** It answers both questions
    at once — zero means current, N means behind by N — counting only what main has that the branch
    lacks, unaffected by the branch's own commits atop an old tip. A `merge-base
    --is-ancestor`
    pre-check (0011's idiom, built for a yes/no) would be a second spawn for no added truth on a
    read that wants a number anyway. `NaN` or a failed read degrades to `unreadable`, never to a
    guess.
- **Layout:** `src/workspace/worktrees.ts` grows the freshness section (`WorktreeFreshness`,
  `WorktreeStatus`, `worktreeStatuses`, `freshnessOf`, the `gitOnPath` guard) beside the records it
  reads and the rebase machinery it glances toward — a read helper, no mutation;
  `src/workspace/status.ts` wires it into `TaskStatus.worktrees` (absent on closed tasks);
  `src/cli/index.ts` grows `renderWorktreeFreshness` under `renderTaskStatus` — the status render
  arm only; `src/cli/schema.ts` adds `statusWorktreeShape` and the `worktrees` field on
  `statusTaskShape`; `src/cli/json.ts` the matching type-pinned builder. Tests:
  `test/workspace/freshness.test.ts` (the mechanism, direct module calls against local bare remotes)
  and `test/cli/freshness.test.ts` (the end-to-end acceptance flow, both renderings, the JSON rows,
  the needs-you silence, through the spawned CLI).
- **Mechanisms:** per worktree of a non-closed task, in record order — exists on disk → tree
  readable and clean (`status --porcelain`; dirty short-circuits, occupancy first) → the recorded
  branch is checked out (`symbolic-ref --short HEAD`; else drifted, the §16 refusal to measure
  drift) → the repository record supplies `mainLine` → `rev-list --count HEAD..origin/<mainLine>` (0
  → current; N → behind by N; unreadable on any failed link). `statusReport` attaches the rows to
  each non-closed task; the renderer emits one sub-line per row; `statusJson` emits the `worktrees`
  array through the schema-pinned builder. No network anywhere on the path; nothing written
  anywhere.

## Build log

### 2026-08-12 — The glance built end to end

**Goal.** Everything in Scope in one iteration. **What was done.** Grew `src/workspace/worktrees.ts`
with the freshness section: `WorktreeFreshness` /`WorktreeStatus`, `worktreeStatuses` (per-worktree,
record order, a pure read), `freshnessOf` (the mechanism chain above), and the `gitOnPath` guard
(PATH passed explicitly so the guard and the guarded spawn agree). Wired `TaskStatus.worktrees` in
`src/workspace/status.ts` (absent on closed tasks — not asked, like `forge`). Added the status
sub-line rendering (`renderWorktreeFreshness`) in `src/cli/index.ts` — the status render arm only,
mutation verbs untouched. Added `statusWorktreeShape` + the `worktrees` row on `statusTaskShape` in
`src/cli/schema.ts` with the matching builder in `src/cli/json.ts`. Tests:
`test/workspace/freshness.test.ts` (seven mechanism cases) and `test/cli/freshness.test.ts` (five
spawned-CLI cases).

**What works now — with the commands that prove it** (Bun 1.3.14, git 2.54.0, macOS):

- `bun test` → `207 pass, 0 fail, 720 expect() calls` across 25 files (from 195/668/23 at entry
  start) — all five acceptance scenarios: the end-to-end behind flow with the remote renamed away
  before status answers (zero network, proven, not asserted); the honest-vintage case (moved remote
  reads current until `repo refresh`); dirty-before-behind with no count and the uncommitted content
  untouched; drifted on a named branch and on a detached HEAD; missing-on-disk as `unreadable` with
  status still exiting 0; the JSON rows under the registry schema with every optional field absent
  exactly per its condition; closed tasks not asked; the no-git-on-PATH degradation; and `needs you`
  staying silent over a behind worktree.
- `mise run check` → green end to end (Biome + dprint + `tsc --noEmit` + `bun test` + lychee).
- Dogfood smoke in a scratch workspace (`bun src/cli/index.ts`, local bare remote): after advancing
  the remote twice and `ward repo refresh`, `ward status` renders the task line and beneath it
  `worktrees/t1-feature — behind origin/main by 2 commits — rebase with: ward worktree rebase t1`;
  after `ward worktree rebase t1` the same glance renders
  `worktrees/t1-feature — current (atop origin/main)`; `status --json` carries
  `{"repo":"demo","branch":"feature","path":"worktrees/t1-feature","freshness":"behind","behindBy":2}`
  before and `{"…","freshness":"current"}` after.
- `bun src/cli/index.ts schema status` emits the grown contract: `worktrees` rows with required
  `repo`/`branch`/`path`, optional `freshness` (enum `current|behind|dirty|drifted|unreadable`),
  `behindBy` (positive integer), `checkedOut` — self-describing, no new documentation surface.

**Decisions** (entry-local, found while building): all recorded under Design → Decisions; two worth
naming — the `Bun.which`/runtime-env disagreement surfaced only when the no-git test failed against
a guard that consulted the original environment while the spawn it guarded used the runtime one; and
the render switch was rewritten as an if-chain because the undefined-freshness guard narrows for
`tsc` but not for Biome's exhaustive-switch rule — same behavior, both gates green.

**Next.** The deferred set, in dogfood-priority order: freshness on `worktree list`; the cadence
(when something can watch, it reads `worktreeStatuses` and calls the 0011 verb); the occupancy yield
when occupancy is recorded; checks state when the forge probe grows it.

## Spec-feedback

- **SF-001** — [`work-lifecycle`](../../intent/01-concepts/03-work-lifecycle.md), "Ward absorbs the
  recurring toil" → the surfacing sentence. _Friction:_ the slice says Ward "surfaces **only what
  needs a human** — what is behind, what is conflicted, what is blocked, what is ready", reading
  "behind" as an instance of "needs a human" — while the same paragraph's own _why_ frames the goal
  as "readable at a glance". Those point at two different surfaces: the glance (status, where this
  entry puts freshness) and the attention router (`needs you`, 0009/0014's waiting-on-the-human
  list), and a behind worktree belongs to the first — it recurs mechanically on every merge, waits
  on no judgment, and its remedy is the local, reversible toil intent assigns to Ward itself. Under
  a literal reading, this entry under-delivers the sentence by keeping `needs you` silent.
  _Assumption to keep moving:_ "surfaces what needs a human" governs the toil's escalation posture
  (perform what is safe autonomously; put the rest where the human will see it) rather than
  mandating the attention list for every named condition; "behind" surfaced on the glance satisfies
  it, and "conflicted" — which genuinely needs judgment — is already a loud, exit-1 report on the
  0011 verb. _Proposed revision:_ split the sentence's examples by the surface they earn — e.g.
  "…and **surfaces the rest where its weight belongs**: what is behind or clean readable at a
  glance; what is conflicted or blocked routed to the human's attention" — so the glance/attention
  distinction the design record has now argued twice (0009's two springs, this entry's adjudication)
  is intent's own language. One near-candidate not filed: the freshness answer's vintage ("as fresh
  as the last refresh") presumes the refresh cadence that does not exist yet — a build-order fact
  exactly parallel to 0011's occupancy deferral, not an intent gap.
