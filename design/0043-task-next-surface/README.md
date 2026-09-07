# 0043 — The task's next step

> Pull requests become visible objects on the attention surface — one line each, carrying the live
> review and check state — and `ward task show ADDRESS` puts one task on one screen, ending in a
> single derived line that says what to do next.
>
> **Status:** built — awaiting review · **Started:** 2026-09-06

A task's pull requests are the one part of its state that lives somewhere else, and the surfaces
have been treating them as a quantity. `ward status` prints `prs: 1 open (changes requested)` — a
count that says something happened without saying where, so the human who wants to open the PR goes
to the task record for a URL the shell already read. The links are in the record and in the `--json`
`forge` block ([0009](../0009-live-forge-state/README.md)); only the glance withholds them.

The larger gap is that "what do I do next for this task?" has no home. The pieces of the answer are
scattered across surfaces built one at a time: `needs you` covers three purely derivable conditions
([0009](../0009-live-forge-state/README.md), [0014](../0014-stale-base-warning/README.md)), a
worktree that is behind carries its own remedy on its own line
([0016](../0016-worktree-freshness/README.md)), and everything else — no worktree yet, a dirty tree,
no pull request yet, checks failing — is left for the reader to assemble. Each surface is right
about its own fragment and none of them answers the question, which means the human answers it, from
memory, every time.

The intent already promises the answer: the lifecycle's Completion sequence says that at any moment
Ward answers what is left to complete this task, and the shell's job is to route the human's
attention rather than to inventory state. So this entry does two things that are one thing. It makes
the pull request a **line** rather than a count, wherever the PR set is shown; and it adds one read
verb that gathers a task's whole standing — header, pull requests, worktrees, sessions — and ends
with the derived **next step**: one imperative line, first match down a stated ladder. The
derivation lives in a single module both surfaces call, so the glance and the detail can never
recommend different things.

## Serves intent

- [`03-work-lifecycle.md`](../../intent/01-concepts/03-work-lifecycle.md) — _Completion_, **Track
  PRs** and **Guide to merge**: the PR set becomes the visible object it is described as, per-PR
  state and all, and "what is left to complete this task" becomes a line Ward prints rather than a
  promise. What the slice does not name among the tracked facts is the forge's check verdict;
  [`spec-feedback.md`](spec-feedback.md) says so rather than assuming.
- [`03-work-lifecycle.md`](../../intent/01-concepts/03-work-lifecycle.md) — _Task states_, the
  derived `in-review` rule: the ladder reads the same PR set the overlay is computed from, so
  "in-review" and "what next" are two readings of one source and cannot disagree.
- [`07-human-shell.md`](../../intent/02-subsystems/07-human-shell.md) — _"What needs me?" is a
  first-class query_: the same derivable conditions the workspace-wide surface presents, narrowed to
  one task and extended to the conditions it never covered. The one case the surface's rule does not
  reach — a PR awaiting review by someone the record cannot name — is raised in
  [`spec-feedback.md`](spec-feedback.md).
- [`07-human-shell.md`](../../intent/02-subsystems/07-human-shell.md) — _Settled work leaves the
  glanceable surface, and stays retrievable_: a closed task is addressable by `task show` under the
  same window every listing obeys, and a settled one is refused with `--all` named, never silently
  absent.
- [`07-human-shell.md`](../../intent/02-subsystems/07-human-shell.md) — _Workspace- and scope-aware
  from any working directory_ and the agent asymmetry: standing in a task's worktree, a human gets
  the address derived and echoed; a declared agent passes it and gets the identical text, without
  colour.
- [`01-principles.md`](../../intent/00-foundation/01-principles.md) — **§17**: every fact the new
  surface adds — review, checks, freshness, the next step itself — is derived at read time and
  stored nowhere. **§20**: an unreadable forge prints the link with `state unknown` and a next step
  that says the state is unknown, rather than a verdict or a blank. **§18**: the ladder names the
  gated acts (the merge, the close) and never performs one.

## Scope

- **In:**
  - **PR lines instead of a count, in `status`.** Under each non-closed task, after the identity
    line and before its worktrees, one line per linked PR: the URL plain, then its live state dim
    beside it. An open PR reads `open · review: … · checks: …`, where the review is `approved`,
    `changes requested` or `none yet` and the checks are `passing`, `failing`, `pending` or `none`;
    a resolved one reads `merged` or `closed unmerged`; and a PR the forge could not answer for
    reads `state unknown`. The `prs: N open` summary leaves the identity line; `task list`, which
    has no sub-lines, keeps it. Closed tasks keep their one-line form.
  - **The check verdict rides the existing probe, separably.** `PrForgeState` gains `checks`,
    collapsed to `passing | failing | pending | none` from `statusCheckRollup` in the same single
    `gh pr view` call, at zero added forge cost on a healthy read — absent whenever the forge
    reports no rollup at all, and absent rather than fatal when the caller's token may read the pull
    request but not its checks (a failed full read is retried once for the fields that were always
    asked for, inside the same absolute deadline). It reaches `--json` additively as
    `forge[].checks`, everywhere the forge block already appears.
  - **`ward task show [ADDRESS]`** — a read verb (no lock, no writes) in five blocks: header
    (address, slug, state with the `in-review` overlay and the close outcome, floor and its slug,
    purpose, repositories, opened/closed), pull requests as above, worktrees with their freshness
    and inline remedies, open sessions with the machine note `status` gives them, and **next**. With
    no ADDRESS a human standing in a task worktree gets it derived and echoed, exactly as `task pr`
    and `task pause` do; a declared agent passes it. `--all` lifts the settled-work window on
    address resolution, and `--json` emits a registered shape (`ward schema task show`).
  - **The next-step ladder**, one module (`src/workspace/next.ts`), first match wins: closed →
    nothing; paused → resume; no worktree → create it (naming the repository when the record names
    exactly one); a worktree missing on disk → restore; a dirty worktree → commit or stash; a behind
    or drifted worktree → rebase; no PR → open one from the worktree, then link it; then, per open
    PR worst first, changes requested → address the review; checks failing → fix them; otherwise →
    `review or wait`; approved and green → merge; a resolved PR set → the gated close
    (`--outcome abandoned` when nothing merged); and last, PRs linked with no readable state →
    `state unknown — check <url>`.
  - **One home for the derivation.** `next.ts` owns the ladder, the per-PR attention classification
    `status`'s `needs you` reads for its changes-requested item, and the remedy strings both
    surfaces print (`ward worktree rebase ADDRESS`, `ward task close ADDRESS`). `status --json` is
    otherwise unchanged.
  - **The manifest.** The installed `AGENTS.md` names `ward task show` among the read verbs and in a
    bullet of its own; the outgoing default's fingerprint is appended to the artifact lineage
    ([0020](../0020-deterministic-upgrade/README.md)) so every workspace still carrying it upgrades.
  - **Tests**: `test/workspace/next.test.ts` (the ladder, one row per rung, forge state injected)
    and `test/cli/task-show.test.ts` (the verb's two renderings, the address derivation and the
    agent refusal, the paused/worktree-less/closed/settled cases, the degraded forge, and status's
    PR lines); the forge-state suite asserts the count is gone and the links remain.
- **Deferred:**
  - **Acting on the next step** (a `--do` that runs the command it names). _Why safe:_ every rung
    either names a command the caller can run verbatim or names a gated act that is the human's by
    §18 — and the two are not distinguishable to a flag that runs things, which is exactly why the
    flag would have to be argued for separately. Nothing rots: the text is the command, so acting on
    it costs a copy.
  - **Batching the forge probe per repository.** _Why safe:_ `checks` rides the call
    [0009](../0009-live-forge-state/README.md) already makes, so this entry adds no forge cost at
    all, and the probe is already parallel and deadline-bounded — a slow forge costs the deadline,
    not the PR count. The change is a probe-shaped change (URL→repository grouping, pagination,
    partial answers) that belongs to whoever measures the pass as too slow.
  - **CI log fetching** — naming which job failed, or why. _Why safe:_ the rung's job is to route,
    and it routes to the PR page where the forge already renders the logs better than a terminal
    can. A collapsed verdict cannot be wrong about which job broke, because it never claims one.
  - **A workspace-wide `ward next`.** _Why safe:_ `status`'s `needs you` already answers "what needs
    me?" across the workspace, and this entry makes each task's own answer one command away. A verb
    that ranked every task's next step against every other's would need a cross-task priority rule
    that nothing in intent states — the honest place to settle that is an entry that has a reason
    to.
  - **Caching review or check state.** _Why safe:_ storing it is the stale copy §17 forbids, and the
    probe's cost is already bounded. The degraded path is built and tested, so a forge that cannot
    answer costs a legible `state unknown`, not a wrong answer from a cache.
  - **Offering closed addresses to shell completion.** _Why safe:_ completion deliberately offers
    only non-closed tasks ([0036](../0036-floor-addressed-tasks/README.md)) because a closed room
    either addresses nothing or addresses somebody else's task; `task show` accepts what completion
    does not offer, which costs a reader nothing and keeps the menu from filling in a misleading
    identity.
- **Acceptance:**
  1. `mise run check` green.
  2. `bun test test/workspace/next.test.ts` — one case per rung, in precedence order, with forge
     state injected: a dirty worktree outranks a behind one, changes requested outranks failing
     checks, approved-and-green is the merge rung and approved-but-building is not, a resolved set
     closes (`--outcome abandoned` only when nothing merged), and PRs with no readable state yield
     `state unknown` naming a URL.
  3. `bun test test/cli/task-show.test.ts` — the human rendering carries header, PR lines with live
     review and check state, worktrees, sessions and `next`; `--json` validates under
     `taskShowShape` and its `next` carries `reason` plus the PR it names; two runs are
     byte-identical; a declared agent gets the human's exact bytes without ANSI; inside a worktree a
     human gets the address derived and echoed while an agent is refused, naming
     `ward task show ADDRESS`; paused, worktree-less, and recently closed tasks each produce their
     rung; a settled close is refused naming `--all` and shown under it; with no forge the links
     print `state unknown`.
  4. `bun test test/cli/forge-state.test.ts` — `status` prints one line per PR and no `prs:` count;
     without a forge the URLs still print, marked `state unknown`.
  5. `bun test test/cli/schema.test.ts` — `ward schema task show` emits `taskShowShape`, and the
     whole-contract document covers it like every other registered verb.
  6. `bun test test/forge/gh.test.ts` — the rollup collapses worst-first over both shapes gh
     returns, an absent rollup stays absent and an empty one is `none`, a healthy read makes one
     call carrying the rollup field, and a token that cannot read checks yields state and review
     from a second call that asks for neither.
  7. `bun test test/workspace/lineage.test.ts` — the outgoing `AGENTS.md` default is in history and
     the new one is pinned, so a workspace carrying the 0041 manifest upgrades rather than reading
     as customized.
  8. Against a live workspace, read-only: `ward task show ADDRESS` prints the five blocks and one
     `next` line for an active, a paused, and a closed task, and `ward status` shows a line per PR
     under each task that has one.

## Design

- **Decisions:** no new ADRs. Entry-local:
  - **Lines, not counts — and only where there is room for lines.** Keeping `prs: 2 open` and
    appending the URLs to it was the additive option: no line moves, and the rollup stays readable
    at a glance for a task with six PRs. It lost on what the count is _for_. A count answers "how
    many are outstanding", which is a question nobody asks about their own task; what they ask is
    "which one, and what is it waiting on", and that answer needs the URL either way. Once the lines
    are there the count restates them, which is the one-home rule broken inside a single block — and
    the count is the half that says less. It stays in `task list`, which is a flat listing with no
    room for sub-lines and a different job: scanning many tasks, not working one. The cost is
    vertical space in `status` proportional to the PR set; the settled-work window
    ([0036](../0036-floor-addressed-tasks/README.md)) already bounds how many tasks are on screen,
    and a workspace where that hurts has more open PRs than a glance was ever going to summarize.
  - **One verb, `task show`, rather than a `task next`.** A verb that printed only the next line was
    the tempting minimum — one line, no layout, nothing to skim past. It lost because the line is
    only trustworthy beside its evidence: a human told to rebase wants to see which worktree is
    behind, and one told to fix checks wants the PR it means. Splitting them into two verbs makes
    the useful invocation two commands, and makes the terse one a claim the reader cannot check.
    `show` also reads true to the operation (the shell's own naming rule): it shows a task, and the
    next step is the last thing it shows. The cost is that the answer is a screen rather than a
    line, paid back by `--json`'s `next` block, which is exactly the terse form for the caller that
    wants it.
  - **The ladder is ordered by what blocks what, not by urgency.** Ranking rungs by how much
    attention each condition deserves was the first shape, and it produces arguments nobody can
    settle: is a red build worse than an unrebased branch? Ordering by blocking has an answer that
    is checkable instead of arguable — a dirty tree cannot be rebased, an unrebased branch should
    not be reviewed, no review state exists before a PR does — so each rung is the cheapest act that
    unblocks the one below it, and clearing it reveals the next answer. Within the open-PR rungs the
    order is worst-first for the same structural reason: a requested change makes the build and the
    review moot, and a red build makes the review moot. The cost is that the single line sometimes
    names a small chore (commit or stash) while something louder waits below it, which is the
    correct advice precisely because the louder thing cannot be acted on until the chore is done.
  - **`review or wait`, because Ward cannot tell whose turn it is.** The two honest alternatives
    were to always say "waiting on review" (wrong for the human who _is_ the reviewer — the majority
    case in a one-human workspace) or to ask the forge who was requested (a second call, whose two
    answers route to the same page). Naming both acts in one line lets the reader take the half that
    is theirs, and costs a word. The cost is a line that is imperative about two things where every
    other rung is imperative about one, which is the honest shape of a fact the record does not
    hold; [`spec-feedback.md`](spec-feedback.md) raises it as the gap in the attention surface's
    rule that it is.
  - **An unreadable forge prints the link and says so.** Suppressing the PR lines when the probe is
    dead — the way `needs you` disappears — would have kept the "no forge state means no forge
    surface" symmetry. It lost because the URL is not forge state: it is in the task record, read
    from disk, and it is the thing the human came for. A surface that had it and showed nothing
    would return less than the record it just read, and the next step degrades the same way, naming
    the PR to go look at rather than a verdict it does not have (§20).
  - **`checks` is one verdict, and it rides the call that already runs.** Carrying the rollup
    through — job names, per-check conclusions — would let a surface name what broke. It lost twice
    over: at this surface the answer is a line, not a table, and the forge's own page renders the
    detail better than any terminal will; and the collapse can be wrong only in the direction it is
    built to be wrong in — anything unrecognized is `pending`, never `passing`, so a green claim is
    never a guess. `none` stays distinct from absent, because "this PR has no checks" and "nobody
    asked the forge" are different facts and only one of them is about the PR.
  - **Asking for the checks is retried without them, rather than asked separately or asked
    unconditionally.** Bundling the rollup into the one call is what makes it free, and it was the
    obvious shape until it turned out that a token may be allowed to read a pull request and not its
    checks — in which case the forge fails the entire query and the probe loses the state and review
    it used to get ([`build-log.md`](build-log.md)). Two alternatives lost. A dedicated second call
    for checks pays a spawn per PR on every healthy read, to buy a field that is usually free.
    Dropping checks from the bundle altogether gives up the entry's premise on every token that
    _can_ read them. The retry keeps the healthy path at one call and spends a second only where the
    first already failed — which is a case that was returning nothing anyway. The cost is that an
    unreadable PR now costs two spawns instead of one; the deadline is made absolute across both, so
    the probe's "never hangs past the deadline" promise is unchanged, and the answer for a
    checks-blind token goes from nothing to everything but checks.
  - **A closed task is addressable, behind the same window.** Refusing closed tasks outright — the
    rule every task-addressed _mutation_ follows, since a closed room may belong to somebody else —
    would have been the smallest resolver. It lost because reading is not operating: "what happened
    to that task?" is a question worth answering, and the reuse hazard is handled by precedence
    rather than by refusal (an open task always wins the address). The settled-work window then
    applies as it applies everywhere, with `--all` to lift it and a refusal that names the flag —
    which keeps one convention across every surface instead of making this verb the exception. The
    cost is one extra word to type for genuinely old work, in exchange for never answering a live
    address with a long-dead task.
- **Boundaries:** `src/workspace/next.ts` is the one home of "what should happen next" — the ladder,
  the per-PR attention classification, and the remedy strings. It imports records and freshness and
  nothing else: it is a pure function of what it is handed, which is what lets one test row per rung
  stand for the rung. `status.ts` keeps owning **derivation over the record** and gains the one-task
  narrowing (`taskDetail`) beside the whole-workspace one, because they are the same derivation at
  two scopes and a second module would be a second place for the rules to drift; the read-side
  address resolution lives there too, next to the settled-work window it obeys. `src/cli/index.ts`
  keeps owning rendering alone, and the PR line is written once and called by both surfaces.
  **Relationship to the entries this changes:** [0009](../0009-live-forge-state/README.md) is not
  superseded — the probe, the degradation bit, and the in-review rule are unchanged; one field joins
  its per-PR state and one rendering (the count) is replaced by lines, here.
  [0016](../0016-worktree-freshness/README.md) is untouched: its freshness lines and remedies are
  reused verbatim, and the ladder reads the same verdicts.
- **Mechanisms:** `nextStep(input)` takes the record, the address, the worktree statuses, and the
  live forge states, and returns `{ reason, text, pr?, path? }` — `reason` is the rung, for the
  agent audience to route on, and `text` is the same answer in words, identical for both audiences.
  Its inputs are exactly what a `status` row already derives, which is why `taskDetail` can build it
  by calling the status machinery for one task and handing the result over. `checks` is derived in
  the forge adapter, where the vocabulary translation belongs: `statusCheckRollup` collapses
  worst-first over both shapes gh returns (a check run's `conclusion`, a status context's `state`),
  with anything unfinished or unrecognized reading as `pending`. Address resolution for reads
  (`resolveTaskForRead`) tries open tasks first — a room addresses whoever holds it now — then
  closed ones inside the window, then refuses with the flag that lifts it; several matches at either
  level is a refusal naming each by address and slug, the same shape `resolveOpenTask` uses.
