# 0011 — Worktree rebase: the freshening toil's other half

> `ward worktree rebase [TASK]` brings a task's worktrees up to date with their repository's main
> line — refresh-first, rebase not merge, never through a dirty tree, aborting cleanly on conflicts,
> and never pushing the rewritten history.
>
> **Status:** accepted · **Started:** 2026-08-09

The motivating incident is in this repository's own record. Entries
[`0006`](../0006-scope-from-cwd/README.md) and [`0008`](../0008-json-shape-home/README.md) were
developed concurrently on their own branches; 0008 merged first, and 0006's worktree had to be
brought up to date by hand — fetch, rebase onto main, the full gate re-run — before it could merge.
The graph still shows it: 0006's commits sit directly atop the 0008 merge commit. With concurrent
task worktrees now the normal delivery mode here, "whichever merges second needs a rebase" recurs on
every pair of entries — exactly the toil
[`work-lifecycle`](../../intent/01-concepts/03-work-lifecycle.md) says Ward absorbs.
[`0003`](../0003-repository-set/README.md) built the toil's first half (`repo refresh`, the
canonical checkout) and [`0004`](../0004-work-spine/README.md) deferred "rebase toil on worktrees"
because nothing existed yet to rebase. Worktrees exist; this entry builds the other half, on demand,
under the arc's standing constraint: Ward records and plumbs git, the human orchestrates.

## Serves intent

- [`work-lifecycle`](../../intent/01-concepts/03-work-lifecycle.md) — "Ward absorbs the recurring
  toil" names this operation verbatim: _rebase existing worktrees onto the refreshed main line_.
  Both fail-safes carried over: **evidence of unrecorded work is occupancy** (a dirty tree is never
  rebased, whatever the record says), and what needs judgment — a conflict — is **surfaced, never
  resolved** by Ward.
- [`human-shell`](../../intent/02-subsystems/07-human-shell.md) — the `worktree` noun grows a verb
  that reads true to the operation; the scope-from-cwd affordance and its agent asymmetry apply
  exactly as the contract states them (via [`0006`](../0006-scope-from-cwd/README.md)'s resolver).
- [`principles`](../../intent/00-foundation/01-principles.md) §6 — already up to date is a stated
  no-op; a repeat run changes nothing. §16 — the branch the **record** names is the only thing
  rebased; anything else checked out is drift the verb refuses to compound. §17/§18 — the verb
  cannot lose work (dirty → untouched; conflict → aborted to exactly-as-found; success replays every
  commit), and publishing rewritten history stays the worker's deliberate act.
- [`domain-model`](../../intent/01-concepts/00-domain-model.md) — the canonical checkout stays the
  one local place the current main line is read: the verb refreshes it first and rebases onto what
  it learned.

## Scope

- **In:**
  - **`ward worktree rebase [TASK]`** — for each of the task's worktrees, in record order: refresh
    the repository's canonical checkout (once per repo per run), then rebase the recorded branch
    onto `origin/<mainLine>`. Per-worktree outcome `rebased | current | dirty | conflict | failed`,
    rendered in the `repo refresh` report style; exit 1 only when an outcome is `conflict` or
    `failed`.
  - **The safety postures**, house rules extended rather than invented: a dirty worktree is refused
    with the fail-safe's own wording; a conflict is aborted (`git rebase --abort`) with the
    conflicted paths named and the worktree left exactly as found; a worktree with the wrong branch
    checked out, or missing from disk, is a legible `failed` naming the fix; a canonical checkout
    that cannot refresh (dirty or failed) fails the rebase rather than rebasing onto a stale tip.
  - **No push, ever** — a successful rebase of a branch already published reports that
    `origin/<branch>` now differs and names `git push --force-with-lease`; running it stays the
    worker's act.
  - **Scope inference per 0006:** TASK optional for a human inside a claimed worktree (inferred and
    echoed); a declared agent is refused the inference and told to pass TASK.
  - **No workspace-record mutation.** The worktree record — path, branch, disposition — describes
    identity, not git position; a rebase changes none of it, so the verb writes no record and
    commits nothing to the workspace's git.
  - **The workspace `AGENTS.md` teaches the verb** — the human line (rebase when main moves; dirty
    refused, conflicts aborted) and the agent line (rebase with an explicit code; publishing the
    rewritten branch is yours, with `--force-with-lease`).
- **Deferred:**
  - **Rebase on a cadence / triggered by merges** — nothing exists yet that can watch (0004's
    deferral, still true). _Why safe:_ on-demand exercises exactly the code path a cadence would
    call, the posture 0003 set for refresh.
  - **Yielding to recorded occupancy.** Intent says an occupied anchor is never mutated beneath its
    occupant — but no occupancy record exists yet (rooms and dispatch are unbuilt), and in this
    human-driven arc the caller _is_ the occupant or speaks for them. _Why safe:_ the dirty-tree
    fail-safe already honors the strongest available evidence of occupancy, and the occupancy check
    slots into the same per-worktree gate when the record exists.
  - **Resolving conflicts.** _Why safe:_ git already auto-resolves non-overlapping changes during
    the rebase itself; what git reports as a conflict is precisely the "needs judgment" case intent
    routes to a human, and richer techniques (§19) can grow behind the same verb.
  - **`--json` on the report.** _Why safe:_ no mutation report has `--json` (deferred since
    [`0005`](../0005-agent-audience/README.md)); when the write verbs gain it, this report joins the
    [`0008`](../0008-json-shape-home/README.md) registry like every other shape. A declared agent
    already gets ANSI-free, deterministic output through the existing caller predicate.
  - **A workspace-wide sweep** (every open task's worktrees at once). _Why safe:_ it composes from
    this verb plus `task list`, and belongs with the cadence when one arrives.
  - **The `sandbox` exemption.** Only `deliverable` worktrees exist; the delivery toil serves them
    by construction. _Why safe:_ disposition has been recorded since 0004, so exempting `sandbox`
    later is a filter on a field already present, not a migration.
- **Acceptance:** from a cold checkout, `mise run check` is green, and `bun test` proves:
  1. a clean rebase onto a moved main line — the canonical checkout refreshed first, the branch's
     own commits replayed atop the new tip, and no workspace record or commit touched;
  2. already up to date is a stated no-op that repeats cleanly;
  3. a dirty worktree is refused with its uncommitted content untouched;
  4. a conflicted rebase aborts and leaves the worktree exactly as found — same HEAD, same branch,
     same file content, clean status, no rebase in flight — naming what conflicted;
  5. through the spawned CLI: inference with the echo inside a claimed worktree, the declared
     agent's refusal, explicit codes from anywhere, exit 1 on conflict, exit 0 on a dirty refusal.

## Design

- **Decisions:** no new ADRs — the existing stack carries this entry. Entry-local:
  - **The verb lives at `ward worktree rebase [TASK]`, not inside `repo refresh`.** The two
    operations have different subjects and different addresses: refresh freshens the _repository
    set's_ canonical checkouts and takes a repo NAME; rebase freshens a _task's worktrees_ and takes
    a TASK — which is what makes 0006's location inference apply at all. Folding both into one verb
    would make one word mean two operations on two record kinds and would break "verbs read true to
    the operation" (the human-shell contract's own discoverability rule). The surface grows by one
    verb under a noun that already exists (`worktree create|rebase|list`), the smaller of the two
    costs.
  - **Rebase, not merge.** Intent names the toil "rebase existing worktrees onto the refreshed main
    line", and the repository's own history discipline confirms it: task branches stay linear atop
    main and reach it only through a PR's merge commit — the post-incident 0006 branch in the graph
    is the worked example. Merging main _into_ the branch would bury the branch's own story under
    merge commits and make "what does this PR add" unreadable at review time, which is exactly when
    it matters.
  - **Refresh first, through the repository set's own machinery.** The verb calls the same
    `refreshRepositories` that `worktree create` runs, once per repository per invocation. Why not
    fetch directly in the worktree: the canonical checkout is intent's "one local place the current
    main line is read", and refresh-first keeps that true — after a rebase, the checkout and the
    worktree agree on the tip. Worktrees are worktrees _of_ the canonical checkout (0004), sharing
    its object store and refs, so a refreshed `origin/<mainLine>` is current in the worktree by
    construction. A refresh that refuses (dirty — the canonical checkout is never worked in
    directly) or fails refuses the rebase legibly: the verb's promise is "up to date with the main
    line", not "up to date with whatever was fetched last".
  - **The fail-safe order: dirty is checked before anything else runs.** Evidence of unrecorded work
    stops the toil before the toil does any work at all — even the (harmless) canonical refresh — so
    a refused worktree's report means "nothing happened", not "nothing happened to you".
  - **A conflict aborts, names its files, and restores exactly-as-found.** Ward never resolves
    conflicts and never leaves a worktree mid-rebase: a half-applied rebase is the mid-mutation
    state §6 forbids (a retry would see different ground than the first attempt). The conflicted
    paths are read (`git diff --name-only --diff-filter=U`) before `git rebase --abort`; if the
    abort itself ever failed the verb throws loudly rather than reporting a tree it cannot vouch
    for.
  - **The verb never pushes.** A rebase rewrites history, so publishing it needs
    `--force-with-lease` — and an ill-timed force push is a lost update of the remote branch (§17)
    and an outward act (§18's bias: outward is deliberate, not ambient). Pushing is the worker's
    decision at the moment they choose; the verb's report says honestly when `origin/<branch>` now
    differs and names the exact command. Surfaced, not performed.
  - **Exit posture matches `repo refresh`:** a dirty refusal exits 0 — the fail-safe honored is the
    verb working as designed — while `conflict` and `failed` exit 1, because the verb could not keep
    its promise and something needs a human.
  - **Only the recorded branch is rebased.** A worktree with some other branch (or a detached HEAD)
    checked out is drift; rebasing whatever happens to be there would compound it (§16 — the record
    claims the branch, and the record is what this verb serves).
- **Layout:** `src/workspace/worktrees.ts` grows the rebase section (`rebaseTaskWorktrees`,
  outcome/report types, the per-run refresh cache, the push hint) beside `createWorktree`, which it
  mirrors; `src/cli/index.ts` grows one command under the `worktree` noun, one switch case through
  the existing `resolveTaskTarget`, and one renderer in the `repo refresh` style;
  `src/workspace/templates.ts` grows the two lessons. Tests: `test/workspace/rebase.test.ts` (the
  mechanism, direct module calls against local bare remotes) and `test/cli/rebase.test.ts`
  (inference, refusal, exit codes, through the spawned CLI).
- **Mechanisms:** per worktree, in order — exists on disk → clean (`status --porcelain`) → the
  recorded branch is checked out → canonical checkout refreshed (cached per repo per run) → already
  atop `origin/<mainLine>` (`merge-base --is-ancestor`) → `git rebase origin/<mainLine>` → on
  failure, read conflicted paths, abort, report; on success, report `before → after` plus the
  force-with-lease hint when a published `origin/<branch>` now differs.

## Build log

### 2026-08-09 — The verb built end to end

**Goal.** Everything in Scope in one iteration. **What was done.** Grew `src/workspace/worktrees.ts`
with the rebase section: `rebaseTaskWorktrees` (per-worktree sequence as in Mechanisms), the
`RebaseOutcome`/`RebaseReport` types, a per-run refresh cache so a multi-worktree task fetches each
repository once, and the push hint comparing a published `origin/<branch>` to the rebased HEAD.
Wired `ward worktree rebase [TASK]` in `src/cli/index.ts` through the existing `resolveTaskTarget`
(inference, echo, agent refusal — 0006's resolver, untouched) with a `repo refresh`-style
per-worktree report. Grew the workspace `AGENTS.md` template with the human and agent lessons
(content-only change; fresh workspaces baseline the new bytes). Tests:
`test/workspace/rebase.test.ts` (six mechanism cases) and `test/cli/rebase.test.ts` (six spawned-CLI
cases).

**What works now — with the commands that prove it** (Bun 1.3.14, git 2.54.0, macOS):

- `bun test` → `116 pass, 0 fail, 360 expect() calls` across 15 files (from 104/300/13) — all five
  acceptance scenarios: the clean rebase with refresh-first and the workspace's git untouched (same
  HEAD, nothing staged); the idempotent `current` repeat; the dirty refusal with the uncommitted
  content intact; the conflict abort asserted file-by-file (same HEAD, branch `feature` still
  checked out, content as committed, `status --porcelain` empty, no `REBASE_HEAD`); and the CLI
  surface — inference echoed, `WARD_AGENT` refused with the fix named, explicit codes from anywhere,
  exit 1 on conflict, exit 0 on dirty.
- `mise run check` → green end to end (Biome + dprint + `tsc --noEmit` + `bun test` + lychee).
- Dogfood smoke in a scratch workspace: after advancing the bare remote's main, from inside
  `worktrees/t1-feature` — `ward worktree rebase` echoes `task t1 — from the working directory` then
  `rebased … (9abf791 → 2b04d06 onto origin/main)`; a second run reports
  `current (already atop origin/main)`; with an uncommitted edit,
  `dirty (uncommitted changes — refusing to touch it)`; `WARD_AGENT=1 ward worktree rebase` exits 1
  telling the agent to pass TASK.

**Decisions** (entry-local, found while building): the fail-safe order above (dirty checked before
even the canonical refresh) was settled while writing the refusal test — a refused worktree's report
should mean nothing ran at all; and the push hint checks `origin/<branch>` (has the branch itself
been published?) rather than git's upstream, because a worktree created off `origin/<mainLine>` gets
_that_ as its upstream and the hint would otherwise fire on every rebase of a never-pushed branch.

**Next.** The deferred set, in dogfood-priority order: the cadence (when something can watch), the
workspace-wide sweep, `--json` on mutation reports (joins the 0008 registry), and the occupancy
yield when occupancy is recorded.

## Spec-feedback

None this entry. Two near-candidates were adjudicated as deferrals rather than frictions:
[`work-lifecycle`](../../intent/01-concepts/03-work-lifecycle.md)'s occupancy yield presumes an
occupancy record the spine has not built yet — a build-order fact, not an intent gap, and the slice
already scopes the yield to Ward-initiated toil while this verb is caller-initiated; and its
"resolving (or, where it needs judgment, surfacing) rebase conflicts" is honored on the surfacing
side, since everything git itself cannot auto-resolve during a rebase is precisely the
needs-judgment case, with richer resolution techniques left as §19 room behind the same verb.
