# 0023 — Refresh: concurrent, watchable, and able to face a dirty checkout

> `ward repo refresh` stops being a sequential wait behind a report. The registered repositories are
> fetched **at once** under a fixed cap and still reported in the registered order, whatever order
> they finish in; while it works, a human at a terminal watches an in-place block of per-repository
> states settle into the final report, and every other caller — agent, pipe, CI log — gets the same
> rows streamed in that same order with not one control character in them. And `--stash` gives the
> human an explicit, opt-in way through the dirty-tree fail-safe: set the work aside, refresh, put
> it back — or, when putting it back needs judgement, report a new **`conflicted`** outcome and
> leave the tree exactly as git left it. `conflicted` is derived off the checkout on every refresh,
> never stored, and is skipped like `dirty` is.
>
> **Status:** accepted · **Started:** 2026-08-21

Three changes to one verb, which is why they are one entry: they are the same verb's speed, its
legibility, and its honesty about a checkout it cannot touch — and each of the three is only worth
building because of the other two. Concurrency is what makes progress worth rendering (a sequential
refresh has nothing interesting to say between rows); the stash cycle is what introduces a state
neither `dirty` nor `failed`, which both the report and the rendering then have to carry.

## Serves intent

- [`work-lifecycle`](../../intent/01-concepts/03-work-lifecycle.md), _Ward absorbs the recurring
  toil_ — refresh is the first-named toil, and this entry serves both halves of its fail-safe rule:
  the default ("a dirty tree is never rebased or refreshed, whatever the record says") is untouched,
  and the **human's explicit, opt-in exception** — set aside, update, put back, report `conflicted`
  where restoring needs judgement — is built exactly as the slice now sanctions it. That sanction
  was not there when this entry started; it is the intent amendment recorded under SF-001 below.
- [`principles`](../../intent/00-foundation/01-principles.md) — **§6**: the report is registration
  order regardless of completion order, so the same set of repositories produces the same document
  and the same rendered lines on every run. **§8**: the in-place block is a human-audience cue, in
  the same class as color, and is offered on exactly the same test — a caller that has not declared
  itself an agent, at a terminal. **§17**: `conflicted` is derived from the checkout's unmerged
  paths at every refresh rather than remembered anywhere, and the set-aside work lives in git's own
  stash, not in a Ward-side copy. **§18**: a conflicted restore is never resolved by Ward — the
  judgement is about the human's own unrecorded work. **§20**: every degradation here is to a lesser
  answer, never a wrong one — a terminal too short falls back to the plain stream, a repository that
  cannot be refreshed never stops the others.
- [`human-shell`](../../intent/02-subsystems/07-human-shell.md) — _All real logic lives in the Ward
  tool_: the refresh knows nothing about terminals and the renderer knows nothing about git; they
  meet at one callback. And the two-audiences contract at its sharpest — the same run, the same
  outcomes, three renderings chosen by who is asking.
- [`json-shape-home`](../0008-json-shape-home/README.md) and
  [`mutation-json`](../0015-mutation-json/README.md) (design) — the `--json` document keeps its
  shape and its exit posture; it gains one enum member, declared in the registry, so the schema the
  binary emits for `repo refresh` stays truthful by construction.
- [`repository-set`](../0003-repository-set/README.md) (design) — the entry this one extends. 0003's
  refresh (fetch + `merge --ff-only`, gated on a clean `status --porcelain`, one report row per
  repository) is intact; it is now awaited rather than blocked on, and it grew a fourth branch.

## Scope

- **In:**
  - **Concurrent refresh.** `gitAsync` in `src/workspace/git.ts` — the awaited twin of `git()`,
    spawn-shaped after the forge probe (`src/forge/gh.ts`). `refreshRepositories` runs the set
    through a fixed pool of **8** lanes, writing each report **into its index**, so the returned
    array and every progress snapshot are in the registered order whatever the network did. Refresh
    still takes **no store lock** — it writes no record.
  - **A progress seam.** `refreshRepositories(root, name?, { stash, observe })`. The observer is
    handed a **complete ordered snapshot** of every repository's state (`pending` → `fetching` → its
    outcome) on every transition.
  - **Two renderings** (`src/cli/progress.ts`), chosen by caller and stream, never by a flag:
    - **live** — human caller, stdout a TTY, no `--json`: one line per repository, repainted in
      place with plain ANSI (cursor up, erase line, hide/show cursor), settling into exactly the
      lines the plain form prints;
    - **plain** — everyone else: each row written once, **in registered order**, no control
      characters.
  - **`--stash`.** Opt-in on `ward repo refresh`. A dirty checkout is `git stash push -u` → fetch +
    ff-merge → `git stash pop`. A clean pop reports the normal `refreshed`/`current` with
    `; stashed and restored` on the detail; a conflicted pop reports `conflicted` and leaves the
    tree, the markers, and the kept stash entry exactly as git left them.
  - **The `conflicted` outcome**, derived: a checkout whose `git status --porcelain` shows unmerged
    paths is `conflicted` on any later refresh and **skipped**, with or without `--stash`. It shares
    `dirty`'s exit posture (informational, exit 0); only `failed` exits 1. Added to
    `repoRefreshShape`, so `--json` and `ward schema` carry it. `worktree rebase` refuses a rebase
    onto a conflicted canonical checkout for the same reason it refuses a dirty one.
  - **The intent amendment** to [`work-lifecycle`](../../intent/01-concepts/03-work-lifecycle.md)
    sanctioning the exception — see SF-001.
- **Deferred:**
  - **Reading a configured default for `--stash`** (`repo.refresh.stash`). A parallel task is
    building global configuration; nothing here reads any. The flag is plumbed as a plain boolean
    from the parser to the workspace module, so substituting a configured value where the flag is
    absent is a change to one expression in `src/cli/index.ts`. _Why safe:_ the seam is a boolean at
    the CLI edge — the smallest possible surface for the later PR to land on, and no other module
    would change at all.
  - **A concurrency flag.** _Why safe:_ 8 is a cap on network-bound work against (usually) one
    forge; a knob would be a question asked of every caller to which almost none has an answer, and
    the fixed number is one edit away if evidence ever says otherwise.
  - **Concurrency anywhere else** — `worktree rebase` still rebases worktrees one at a time, and
    `git()` stays synchronous for every other call site. _Why safe:_ rebase mutates trees the human
    may be standing in and its cost is local, not network; converting call sites that gain nothing
    would be churn against ADR 0005's "git is plumbing" posture.
  - **Spinners, frames, timers, progress bars.** The live form repaints on state changes alone. _Why
    safe:_ there is nothing to animate between transitions, and a timer is a thing to leak, to
    flush, and to make a test wait on. The information a human wants — which repository is in flight
    — is in the states themselves.
  - **Stashing during `worktree rebase` or the close-gate refresh.** _Why safe:_ `--stash` is a
    thing the human asks for on the invocation in front of them; a stash cycle inside a verb they
    did not point at that repository is precisely the inferred exception the amended intent forbids.
- **Acceptance:** `mise run check` green, and the new cases in
  [`test/workspace/repos.test.ts`](../../test/workspace/repos.test.ts) +
  [`test/cli/refresh.test.ts`](../../test/cli/refresh.test.ts) proving: the set is in flight
  together yet reported in the registered order; a clean stash cycle refreshes and restores; a
  conflicting pop leaves the tree unmerged with the entry kept; a conflicted checkout is skipped on
  every later refresh and needs nothing cleared in Ward once git is clean again; one conflicted
  repository never stops the rest; the non-TTY rendering is byte-stable across runs and free of
  control characters; `--json` is one document carrying the new outcome at exit 0; and a `failed`
  row still exits 1 with every row rendered.

## Design

- **Decisions:** no new ADRs. The live form is plain ANSI over
  [ADR 0004](../decisions/0004-optique-picocolors.md)'s picocolors, and git stays shelled out
  ([ADR 0005](../decisions/0005-store-stack.md)). Entry-local:
  - **A second git helper, not a rewritten one.** `gitAsync` sits beside `git` rather than replacing
    it. Converting every call site would touch a dozen modules to make them all `async` for no gain:
    the overwhelming majority of Ward's git calls are one fast local read on a path where nothing
    else could overlap anyway, and a synchronous call is the simpler thing to read. The async twin
    exists where processes should genuinely overlap. It follows the forge probe's shape exactly —
    pipe both streams and **drain them before awaiting exit**, because a pipe left unread deadlocks
    on output bigger than its buffer, which a `git fetch` on a large repository will produce.
  - **The report is built by index, not appended.** The lane loop writes `reports[index]`; nothing
    ever pushes. Determinism is then structural rather than something a sort has to restore, and the
    same indexing gives the progress snapshot its order for free.
  - **The observer gets a whole snapshot, not a delta.** The alternative — "repository X moved to
    state Y" — makes every renderer keep its own copy of the roster and stay in sync with it, and
    the first renderer to get that wrong paints a stale row. A snapshot makes a renderer a pure
    function of what it was handed: the live form paints it, the plain form scans it. That is what
    makes this seam swappable in the sense §7 means — a status line or a TUI pane is one function,
    not a state machine.
  - **The plain form streams in registered order, not completion order.** The brief asked for rows
    "as they complete" **and** for deterministic output; under concurrency those pull apart. Ordered
    streaming keeps both: a row is written as soon as it and every row before it has settled, so the
    first repositories appear while the rest are still fetching, and the transcript is identical on
    every run. Completion-order streaming would have been simpler and would have made the same
    workspace print in a different order every time — unusable to an agent, a diff, or a test, which
    is most of who reads that stream.
  - **The settled block _is_ the report.** The live form's last repaint renders exactly the lines
    the plain form writes, so nothing prints the report a second time after the block. This is why
    both forms share one `refreshLine`: it is not code reuse for its own sake, it is what makes
    "settles into the final report" true rather than approximate.
  - **The live form is offered on `!agent && isTTY`, and gives up early.** Same predicate as color
    (§8), plus one honest capability check: a roster taller than the terminal would scroll, and
    scrolled lines cannot be moved back to, so the first snapshot that does not fit hands the whole
    run to the plain form (§20). A TTY reporting **zero** rows — which is what a pty opened without
    a size, as `script` and many CI harnesses do, actually reports — is read as _unknown_ and falls
    back to the conventional 24, not as "zero lines tall".
  - **One row is one line, enforced at both ends.** git's stderr is several paragraphs; a detail
    carrying a newline would make the live form's cursor arithmetic paint over the human's
    scrollback. So stderr is folded to one line where it enters a report (`oneLine`), and the
    renderer folds again defensively — the two have different jobs: the first keeps the `--json`
    detail tidy for an agent, the second keeps the renderer correct no matter what it is handed.
  - **`conflicted` is derived from `git status --porcelain`, and that is the whole mechanism.**
    Unmerged codes are the pairs with a `U` on either side, plus `AA` and `DD`. Nothing is stored,
    so a checkout conflicted by something that was never Ward — a human's own interrupted merge — is
    recognized just the same, and resolving it in git is all it takes for the next refresh to
    proceed. A stored flag would have needed a clearing verb, and would have been wrong the moment
    somebody fixed the conflict without telling Ward (§17's stale cache, at the checkout boundary).
  - **The stash comes back whatever the fast-forward did.** If the fetch fails while the work is
    stashed, the pop still runs before the failure is reported. A fail-safe that leaves the human's
    work parked on the stack because the network blinked is the fail-safe inverted.
  - **A push that saved nothing is never popped.** Whether an entry was actually created is read
    from `refs/stash` before and after, not from git's prose — so a `stash push` that finds nothing
    to save (git says so, and exits 0) can never be followed by a pop that would take somebody
    else's entry off the stack.
  - **`conflicted` refuses a rebase, exactly as `dirty` does.** A conflicted canonical checkout
    skipped its own refresh, so its tip may be stale; rebasing a worktree onto it would be rebasing
    onto yesterday. `worktree rebase` reports the repository and what to fix.
- **Layout:** `src/workspace/git.ts` (+`gitAsync`); `src/workspace/repos.ts` (the lane pool, the
  `RefreshOptions`/`RefreshRow`/`RefreshObserver` seam, the stash cycle, `conflicted` and its
  derivation, `oneLine`); `src/cli/progress.ts` (**new** — the two renderings and the shared row
  format, the whole ANSI surface of this entry in one file); `src/cli/index.ts` (`--stash` on the
  command, the display wired to `observe`, the old inline renderer removed); `src/cli/schema.ts`
  (one enum member); `src/workspace/worktrees.ts` (the rebase gate). Tests:
  `test/workspace/repos.test.ts` (+6 cases) and `test/cli/refresh.test.ts` (**new**, 13 cases —
  spawned-CLI behavior and the display seam driven directly through a fake stream). No record
  change, no store change, no new dependency.
- **Mechanisms:** _a refresh:_ the names are read in record order → a `pending` snapshot goes out
  for the whole roster → up to 8 lanes each take the next index, mark it `fetching`, snapshot, run
  `refreshOne`, write the report at its index, snapshot again → the array is returned in index
  order. _`refreshOne`:_ `status --porcelain` first — unmerged paths ⇒ `conflicted`, dirty without
  `--stash` ⇒ `dirty`, otherwise fetch + `merge --ff-only origin/<mainLine>`; with `--stash` on a
  dirty tree, `stash push -u` wraps that, then `stash pop` decides between the normal outcome (with
  the cycle noted), `conflicted` (unmerged paths after the failed pop), and `failed` (a pop that
  failed for any other reason, which says plainly that the work is still on the stack). _rendering:_
  the CLI builds a display unless `--json`, hands its `observe` to the refresh, and calls `settle()`
  after — which restores the cursor for the live form and does nothing for the plain one.

## Build log

### 2026-08-21 — The whole entry in one iteration

**Goal.** Everything in Scope. **What was done.** In order: `gitAsync` beside `git`; the lane pool
and the snapshot seam in `refreshRepositories`; the stash cycle and derived `conflicted` in
`refreshOne`; `src/cli/progress.ts` with both renderings behind one `refreshDisplay`; `--stash` on
the command and the display wired through `cmdRepoRefresh` (the inline `renderRefresh` moved into
the renderer, which is what lets the settled block be the report); the schema's enum; the rebase
gate; then the tests, then the intent amendment.

**What works now — with the exact commands that prove it** (Bun 1.3.14, git 2.54.0, Linux):

- **The live form, measured in a real pty**, not asserted about in the abstract. Four repositories
  in a scratch workspace, `script -qec "bun src/cli/index.ts repo refresh" /dev/null | cat -v`:
  `^[[?25l` then the four-row `pending` block, then eight repaints each opening with `^[[4A` and
  erasing each line with `^[[2K`, the states walking `pending` → `fetching` (all four at once) →
  `current`, ending with `^[[?25h`. The last frame is exactly the four report lines.
- **The same run is plain for everyone else.** `WARD_AGENT=1` under the same pty → one line, no
  escape sequences at all. Piped, human, no `--json` → same.
- **A pty with no size no longer degrades wrongly.** The first pty probe printed
  `{"tty":true,"rows":0,"cols":0}`, and the live form had silently fallen back to the plain stream;
  reading `0` as _unknown_ rather than as a height is what fixed it, and it is the reason the check
  is a named helper with that sentence in its comment.
- **The stash cycle end to end**, scratch workspace, `alpha` with a local edit to a file the remote
  also moved and `beta` with an untracked file plus a moved remote:
  `bun src/cli/index.ts repo refresh --stash` →
  `conflicted alpha (unresolved conflicts in repos/alpha — …)` /
  `refreshed beta (cd65ae8 → 36807e4 on main; stashed and restored)` / `current delta` /
  `current gamma`, **exit 0**. In `repos/alpha`: `git status --porcelain` → `UU f.txt`,
  `git stash list` → `stash@{0}: On main: ward repo refresh --stash`, and `f.txt` carries
  `<<<<<<< Updated upstream` / `>>>>>>> Stashed changes`. Re-running plain reports
  `conflicted alpha` and `dirty beta` (beta's untracked file came back, so it is dirty again —
  correct), still exit 0, and `--json` emits the same four rows as one document.
- `bun test test/workspace/repos.test.ts` → `15 pass, 0 fail`; `bun test test/cli/refresh.test.ts` →
  `13 pass, 0 fail`.
- `bun test` → `351 pass, 0 fail, 1469 expect() calls` across 36 files (from `332 / 1403 / 35`
  before this entry — 19 new cases, **no existing case changed**, including the whole mutation-json
  suite that pins `repo refresh --json`).
- `mise run check` → exit 0 (Biome + dprint + `tsc --noEmit` + `bun test` + lychee).

**Decisions** (all recorded under Design → Decisions). Three were found by building rather than
planned:

1. **Ordered streaming.** Writing rows in completion order was the first implementation and it was
   obviously wrong the moment two repositories were registered: the transcript changed run to run.
   Holding a row until its predecessors settle costs nothing real and makes the plain form's output
   a function of the workspace alone.
2. **Multi-line details break the live form, not just the layout.** A `failed` row whose detail
   carried git's multi-paragraph stderr printed three lines where the renderer had counted one — so
   the next `^[[NA` moved too far up. Caught by the CLI exit-code test, which is the case that first
   produced a real `failed` row. Folded at both ends.
3. **A zero-row TTY is a real thing.** See above; it would have made the live form dead in CI and in
   any harness that opens a pty without a size, while every unit test passed.

Two false starts worth recording so the next builder does not repeat them: making the renderer
mutate its own `observe` to hand off to the plain form (a `readonly` interface member, and a worse
shape than a plain delegate variable), and trusting `git stash push`'s output to know whether
anything was saved — `refs/stash` before and after is the only locale-independent answer.

**Next.** In dogfood order: substitute the configured `repo.refresh.stash` default at the CLI edge
once the configuration entry lands (one expression); consider the same snapshot seam for
`worktree rebase`, whose rows have the same shape but whose work is local and must stay serial; and
revisit the fixed cap of 8 only if telemetry on real workspaces says the client is the limit.

## Spec-feedback

- **SF-001** — [`work-lifecycle`](../../intent/01-concepts/03-work-lifecycle.md), _Ward absorbs the
  recurring toil_ → "the toil yields to evidence of unrecorded work". _Friction:_ the slice stated
  the fail-safe as absolute — "a dirty tree is never rebased or refreshed, whatever the record says"
  — with a _why_ (a lost update is silent corruption, §17) that argues for protecting work **whose
  owner has not been asked**. The common case it also forbids is the opposite: the owner is the one
  standing there asking, with a small local edit, wanting current code underneath it. Refusing them
  does not prevent a lost update; it makes them run stash / pull / pop by hand, which is the toil
  this very concept exists to absorb. Read literally, the slice made `--stash` an intent violation
  rather than a feature. _Assumption to keep moving:_ built the exception as **explicit, opt-in, and
  preserving** — never a default, never inferred, the work kept in git's own stash and restored even
  when the update fails, and a restore that needs judgement stopping at a reported `conflicted`
  state that Ward never resolves and thereafter skips. _Proposed revision:_ state the exception in
  the slice beside the fail-safe, with the three conditions that keep it one (asked for in the
  invocation or configured as a standing answer; preserve-and-restore, never discard; stop at
  judgement and report where), and say that **conflicted is a state of the anchor, derived when the
  toil looks, not a record Ward keeps** — so an anchor conflicted by anything at all is recognized
  and skipped. _Adjudicated:_ the task brief carried the human's decision to make this amendment
  rather than leave it for review, so the revision above is **applied** to the slice in this PR, as
  its own commit citing this id — the convention [0022](../0022-shell-completion/README.md) set. The
  build did not decide it; it proposed it and was answered.
