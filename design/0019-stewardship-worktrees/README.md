# 0019 — Stewardship worktrees: the workspace's own repository as a place work happens

> The stewardship rails, four pieces: `ward worktree create --workspace` anchors a task in a
> worktree of the workspace's **own** repository (branched from the root's main line, which the root
> checkout never leaves); mutating verbs **refuse plainly inside a stewardship copy**, naming the
> enclosing workspace; a workspace-anchored task's `delivered` close verifies the branch's tip is
> **reachable from the workspace's own main line** before any teardown; and `ward workspace merge`
> is the human's gated act that lands a stewardship branch — under the store lock, without switching
> the root, aborting cleanly on conflicts, with `--preview` and `--json`.
>
> **Status:** accepted · **Started:** 2026-08-15

The intent merged as PR #36 gave the workspace's main line its two writers — the journal (Ward's
bookkeeping, landing directly) and stewardship (deliberate change to the workspace itself, traveling
as work). The journal has existed since 0002: every lifecycle verb commits the record forward.
Stewardship had intent and no rails: no way to anchor a task in the workspace's own repository,
nothing that recognized the copy such a worktree materializes, no close gate for work with no forge,
and no merge act. This entry builds those rails. Its first real clients are already named by intent:
the first upgrade's reconciliation and the first migration both travel this path.

## Serves intent

- [`workspace-lifecycle`](../../intent/01-concepts/06-workspace-lifecycle.md) — _The workspace's own
  main line: journal and stewardship_, the section this entry exists to realize: stewardship
  "anchors in a worktree of the workspace's own repository … contained under the workspace like any
  other anchor and ignored by the record's git"; "the workspace's root checkout **never leaves its
  main line**"; "the review boundary is the branch, not a forge" — Ward provides the preview and the
  **gated merge**; the **stewardship copy** rule ("reads serve preview … the journal never writes
  there … a journal entry recorded on a stewardship branch would merge back into the main line as
  false history"); and "**completion is verified on the workspace's own main line**."
- [`domain-model`](../../intent/01-concepts/00-domain-model.md) — _Anchor_: a worktree's repository
  is "possibly the **workspace's own**, the stewardship case"; _Repositories and the main line_: the
  workspace's own repository "is registered nowhere, needs no remote and no separate canonical
  checkout — the workspace root **is** its main-line checkout" — which is why this entry adds no
  fake registration and reads the main line from the root itself.
- [`work-lifecycle`](../../intent/01-concepts/03-work-lifecycle.md) — the cardinal rule's scoping
  paragraph ("one main line has a second lawful writer … stewardship enjoys no such standing and
  takes the same path as all other work"), and _Completion_'s verification duty pointed inward: the
  delivered close proves main-line arrival on the history it can read, before the teardown that
  destroys the only other copy.
- [`human-shell`](../../intent/02-subsystems/07-human-shell.md) — verbs read true: the merge verb is
  named for what it does and where (`workspace merge` — the workspace's own main line is the thing
  merged into); the guard's refusal is a deterministic error naming the fix for both audiences (§8);
  the new verb serves both audiences per 0015's conventions.
- [`principles`](../../intent/00-foundation/01-principles.md) §18 — the merge is the gated act, the
  human's authority made mechanical; §17 — the guard exists because a record corrupted by its own
  machinery is the silent-corruption case, and the close gate derives reachability at the moment of
  asking, never stores it; §6 — creation, merge, and close all converge on re-run (`already-merged`
  is an outcome, not an error); §20 — every refusal names the situation and the remedy (0012's
  spirit), and the merge aborts to a provably clean tree rather than resolving anything.

## Scope

- **In:**
  - **The workspace's own repository as a worktree source.**
    `ward worktree create TASK
    --workspace` (module: `createWorkspaceWorktree`) anchors a task
    in a worktree of the workspace repository: branch defaulting to `steward/<slug>`, created off
    the root's current main line (read from the root's `HEAD` — the root checkout IS that checkout
    and is never switched), the worktree at `worktrees/<code>-<branch>` like any other. The record
    encodes the workspace-source case durably: `source: 'workspace'` present and `repo` **absent** —
    exactly one of the two, enforced by the schema. Record-first creation: the record commits to the
    journal, then the branch materializes — so the candidate copy includes its own worktree record
    and starts zero commits behind. Convergent re-run, including re-establishing a hand-deleted
    worktree from its surviving branch.
  - **The stewardship-copy guard.** Detection (`stewardshipEnclosure`): a discovered root whose
    `.git` is a **file** and whose `git rev-parse --git-common-dir` differs from its `--git-dir` is
    a stewardship copy; the enclosing workspace is the common dir's parent. Every mutating verb
    resolves its workspace through `requireMutableWorkspace()` and **refuses plainly** — exit 1,
    empty stdout, the enclosing workspace named with the `cd` remedy. Reads proceed against the
    candidate copy: that preview is the copy's purpose.
  - **The local delivered-close gate.** For each workspace-anchored worktree of a task closing
    `delivered`, `verifyWorkspaceReachability` requires the branch's tip reachable from the
    workspace's main line (`git merge-base --is-ancestor`), **before any teardown** — refusing with
    the branch, the tip, the stake (teardown would strand the work), and the remedy
    (`ward workspace merge <branch>`, or `--outcome abandoned`). A verified close carries a
    `reachability` step — 0012's step name, the same question pointed inward. Teardown itself speaks
    to the workspace root as the worktree's repository; the abandoned close is unchanged.
  - **The gated merge.** `ward workspace merge BRANCH` (module: `mergeWorkspaceBranch`): runs at the
    workspace root (the guard refuses it inside a copy), wrapped in `withStoreLock` (the merge races
    the journal for the same main line), merges `--no-ff` **without switching the root's branch** —
    the root is already on the main line, so merging advances the branch it stands on. Refuses
    honestly on a dirty root; on conflict names the conflicted files, runs `git merge --abort`, and
    proves the tree clean — no resolution ever attempted. Convergent: an already-landed branch
    reports `already-merged`, exit 0. `--preview` is the smallest honest look — commit count and
    `diff --stat`, mutating nothing. `--json` per 0015: one document for the three outcomes
    (`merged` / `already-merged` / `previewed`), refusals emit no document (stderr + exit 1 + empty
    stdout).
  - **The surrounding machinery keeps up:** `worktree rebase` and status freshness read the
    workspace main line as the target for workspace-anchored worktrees (no refresh needed — the root
    is the current tip, one shared object store away); `worktree list` names the source plainly in
    both renderings; the `--json` shapes carry optional `source`/`repo`; `workspace
    merge` joins
    the schema registry and telemetry's `VERB_TREE`; and 0006's `scopeFromCwd` is confirmed (and
    tested) to resolve a cwd inside a stewardship worktree to the claiming task in the **enclosing**
    workspace.
- **Deferred:**
  - **The standing workspace project at creation** — the concurrent entry 0018's; this entry's rails
    carry any task, bare or projected, so nothing here depends on it. _Why safe:_ the stewardship
    path is anchored at the task level; the standing project only gives such tasks their durable
    home.
  - **Upgrade orchestration and reconciliation** — the rails' first big client, not the rails. _Why
    safe:_ intent's reconciliation section already describes its ride on exactly the pieces built
    here (a branch in a workspace worktree, decisions committed as made, the gated merge as the
    adjudication act).
  - **Forge-backed PR review of a workspace with a remote** — intent's §19 second technique. _Why
    safe:_ the invariant is the branch-and-merge boundary, which this entry builds; a forge review
    is another way to look at the same branch before the same landing.
  - **The fuller preview UX** — a rendered diff, doctor run against the candidate copy, per-change
    recaps. `--preview` deliberately ships the smallest honest surface (count + diff stat); the
    candidate copy is already readable in place by any read verb. _Why safe:_ additive on the same
    branch boundary; the upgrade entry owns the presentation.
  - **Conflict prediction in `--preview`.** A preview that says "1 commit" may still conflict at
    merge time. _Why safe:_ the merge aborts to a clean tree with the files named and the rebase
    remedy — the failure costs a retry, never state.
  - **Doctor findings for stewardship state** (a copy on disk, a stale stewardship branch, a record
    whose worktree is a copy) and **teaching the installed `AGENTS.md` the stewardship lessons**.
    Both live in files the concurrent 0018 is changing (`doctor.ts`, the creation templates), a
    known merge hazard this round. _Why safe:_ nothing degrades silently today — the guard refuses
    loudly at the moment of harm, and every refusal teaches its remedy inline; both additions are
    additive follow-ons.
  - **Deleting the merged stewardship branch after a delivered close.** Teardown removes the
    worktree; the branch survives in the workspace repository. _Why safe:_ a merged branch holds
    nothing unmerged — it is history, not risk; pruning is cosmetic and reversible.
  - **A `needs you` item for a landed-but-unclosed stewardship task.** The forge-derived
    `awaiting-close` has no local analog yet. _Why safe:_ the close gate itself answers correctly
    whenever asked; the attention item is additive derivation over local git.
- **Acceptance:** from a cold checkout, `mise run check` is green, and `bun test` proves:
  1. `worktree create --workspace` records `source: 'workspace'` with `repo` absent, branches
     `steward/<slug>` from the root's main line, materializes only tracked files (no `repos/`, no
     `worktrees/` recursion), leaves the root's branch and porcelain untouched, and converges on
     re-run — including re-establishing a deleted worktree from its surviving branch;
  2. inside the copy, mutating verbs (task open, inferred pause, session open, repo refresh, the
     merge itself) exit 1 with **nothing on stdout** and the enclosing workspace named; reads
     (`task list`, `status`) exit 0 against the candidate copy; and `scopeFromCwd(enclosing, cwd)`
     resolves a cwd in the copy to the claiming task;
  3. an unmerged stewardship branch refuses the delivered close before any teardown (worktree on
     disk, task still active, the merge verb named as remedy); after the gated merge the same close
     verifies (`reachability` step), tears down, and records; the abandoned close discards without
     the gate;
  4. the merge: preview mutates nothing and reports count + diff stat; the merge lands with the root
     still on its main line and a clean tree; re-merge converges to `already-merged`; a dirty root
     and an unknown branch refuse; a conflict aborts to a byte-identical HEAD and clean porcelain
     with the files named — and through the CLI the refusals are stderr + exit 1 + empty stdout even
     under `--json`;
  5. freshness and rebase read the workspace main line (behind-by-N → rebased → current), the status
     sub-line names the 0011 remedy, `worktree list`/`status --json` rows carry `source`/omit `repo`
     per the record, and `ward schema workspace merge` documents the new verb (required
     `branch`/`mainLine`/`outcome`/`commits`).

## Design

- **Decisions:** no new ADRs — the existing stack carries this entry. Entry-local:
  - **The surface is a flag on the existing verb, not a new noun.** `worktree create --workspace`
    beside `--repo NAME`, exactly one of the two. The operation is the same operation — create a
    deliverable worktree for a task — so the verb reads true unchanged; only the _source_ differs,
    and the workspace's own repository has no name in the repository set to pass to `--repo`
    (registering one would fake exactly the membership intent denies it). A separate verb
    (`ward steward …`) was rejected as a second spelling of the same act.
  - **The record encodes the source by absence, not a fabricated name.** `repo` becomes optional;
    `source: 'workspace'` is present exactly when `repo` is absent (schema-enforced XOR). A reserved
    pseudo-name (`repo: 'workspace'`) was rejected: it collides with a legitimately registered
    repository of that name and fakes an identity — absence over fabrication is the codebase-wide
    convention (`reviewDecision`, `mergeCommit`, persona). The cost carried openly: `repo` leaves
    the `required` list of the four worktree row shapes (list, create, rebase, status) — the one
    non-additive contract evolution in this entry, taken now while the only consumers are this
    repository's own tests, with `source` arriving beside it so a row's repository is always exactly
    one field.
  - **Record first, worktree second — the reverse of the repository path, on purpose.** The
    repository path runs `git worktree add` then commits the record; here the record commits to the
    journal first and the branch materializes after. Two payoffs: the candidate copy includes **its
    own worktree record** (the copy describes itself — a cold reader inside it can see why it
    exists), and the branch starts **zero commits behind** the main line instead of one (the record
    commit would otherwise land just past the branch point). The failure mode traded for it — a
    record whose worktree add failed — is legible (`worktree list` shows it missing) and converges
    on re-run (§6), now including checkout-not-recreation of a surviving branch.
  - **Stewardship branches default to `steward/<slug>`.** The workspace repository's `git branch` is
    where the journal and stewardship meet; the namespace makes stewardship branches self-announcing
    there, and the merge commit (`Merge stewardship branch '…'`) reads as the act it was. Intent
    left branch naming to design; the record carries the branch either way, so the default
    constrains nothing.
  - **The guard refuses plainly — it does not redirect.** Intent offers both ("addresses the
    enclosing workspace, or refuses plainly"); this entry takes the refusal as the smaller honest
    start. Redirecting a mutation to the enclosing workspace would make a command mean something
    different from where it was typed — precisely the silent retargeting the human-shell's
    browse-location boundary warns about — and the refusal already names the exact `cd`. All
    mutating verbs refuse uniformly (the task-addressed resolver, the direct-root verbs, and the
    merge itself); reads proceed, because checking the candidate copy is the preview payoff.
    Redirect-by-design can supersede this once a real flow (reconciliation) shows the refusal is
    friction rather than safety.
  - **Detection is the linked-worktree fact, not a marker file.** A stewardship copy is a root whose
    `.git` is a file and whose `--git-common-dir` differs from `--git-dir`; the enclosing workspace
    is the common dir's parent. This derives from what the thing _is_ (a linked worktree of the
    enclosing repository) rather than from a written marker that could drift from it (§16 in
    miniature). Cost profile: one lstat on the hot path (a real root's `.git` is a directory); git
    spawns only in the rare `.git`-file case. Git answers in real paths, so the named enclosure is
    the root's real path (macOS `/var` → `/private/var`).
  - **The local close gate never degrades — because it never has to.** 0012's forge gate carries
    named trusts for every unanswerable case; this gate's repository is the workspace itself, always
    local, so the question is always answerable and a trust path would be dishonest latitude. The
    one absence case (branch ref gone _and_ worktree gone) reports "nothing left to verify" — there
    is nothing teardown could strand. The step reuses 0012's `reachability` key: same question, same
    stable key for an agent to locate, the detail naming the workspace's own history as the
    authority.
  - **The merge verb is `workspace merge`, `--no-ff`, under the store lock.** Noun: the thing merged
    into is the workspace's own main line, so the workspace is the noun that reads true
    (`worktree merge` would name the wrong actor — the worktree is the source, not the acted-on).
    `--no-ff` makes the human's gated act one visible commit naming the branch it landed — the
    adjudication made mechanical _and_ legible in history. The lock: the merge is a
    mutate-and-commit span racing every journal writer for the same ref (0013's exact load), and
    re-checking under the lock makes a concurrent double-merge converge to `already-merged`.
    Conflicts are refusals, not reports: the verb aborted and nothing happened, so per 0015 no
    document is emitted — the stderr names the files and the rebase-in-worktree remedy, and the tree
    is proven clean. One shape serves all three outcomes with outcome-conditional optional fields,
    keeping one registry row per verb.
  - **Preview is the same verb with `--preview`.** The smallest honest surface: commit count and
    `git diff --stat` against the merge base, mutating nothing. A separate read verb was rejected
    for this round — the preview's audience is the person about to run the merge, and the flag keeps
    discovery adjacent; the fuller preview UX (rendered diff, candidate-copy doctor) is the upgrade
    entry's, deferred above.
  - **Rebase and freshness target the workspace main line directly, with no refresh step.** For
    registered repositories those paths refresh the canonical checkout first; the workspace's own
    tip is the root's branch ref, current by construction, shared through the same object store — so
    the target is the branch name itself and the refresh machinery is honestly skipped, not faked. A
    consequence named rather than hidden: every journal commit advances the main line, so an
    in-flight stewardship worktree is routinely behind-by-N at the glance — true, and remedied by
    the same 0011 verb the sub-line already names.
  - **The workspace's main line is read from the root's `HEAD`, never assumed and never recorded.**
    Intent: the root checkout IS the main-line checkout. `workspaceMainLine` reads
    `symbolic-ref --short HEAD` and refuses a detached root. Nothing pins the _name_ (no record
    field, no `main` assumption — the hermetic tests run on `master` to prove it); the residue —
    Ward cannot detect a root moved to some other branch by hand — is SF-001.
- **Layout:** `src/workspace/steward.ts` (new, self-contained: `workspaceMainLine`,
  `stewardshipEnclosure`, `refuseStewardshipCopy`, `mergeWorkspaceBranch`) — the stewardship seam in
  one module, imported by worktrees/tasks/CLI; `src/workspace/worktrees.ts`
  (`createWorkspaceWorktree` beside `createWorktree`; rebase and freshness learn the workspace
  target); `src/workspace/tasks.ts` (`verifyWorkspaceReachability` in the close gates; teardown and
  post-close refresh branch on the source); `src/store/types.ts` (the worktree record's
  `repo`/`source` XOR); `src/cli/schema.ts` (optional `source`/`repo` on the four worktree row
  shapes; `workspaceMergeShape` + registry row); `src/cli/json.ts` (builders follow;
  `workspaceMergeJson`); `src/cli/index.ts` (`--workspace` flag, the `workspace merge` command,
  `requireMutableWorkspace` on every mutating arm); `src/cli/telemetry.ts` (`VERB_TREE`). Tests:
  `test/workspace/steward.test.ts` (the mechanisms, module calls), `test/cli/steward.test.ts` (the
  spawned-CLI acceptance suite) — new files only, per this round's merge-hazard discipline.
- **Mechanisms:** _create:_ resolve task → derive branch/path → converge if record+path exist → read
  main line from root HEAD → write record + journal commit (locked) → `worktree add` (existing
  branch checked out, else `-b` from the main line). _Guard:_ every mutating arm's workspace
  resolution runs the lstat / common-dir check and throws with the enclosure named. _Close
  (delivered):_ after the PR-set and teardown gates, per workspace worktree: tip = branch ref (else
  worktree HEAD) → `merge-base --is-ancestor tip mainLine` → verified step | refusal — all before
  the first write. _Merge:_ validate branch → count `mainLine..branch` (0 → already-merged) →
  preview? stat and return → dirty-root refusal → lock { recount → `merge --no-ff` → conflict? name
  files, abort, refuse : report merge commit }.

## Build log

### 2026-08-15 — The four rails built end to end

**Goal.** Everything in Scope in one iteration. **What was done.** Built `src/workspace/steward.ts`
(main-line read, copy detection, guard, gated merge with preview); grew `createWorkspaceWorktree`
plus the workspace-target arms of rebase and freshness in `src/workspace/worktrees.ts`;
`verifyWorkspaceReachability` and the source-aware teardown in `src/workspace/tasks.ts`; the
worktree record's `repo`/`source` XOR in `src/store/types.ts`; the shape evolutions,
`workspaceMergeShape`, and its registry row in `src/cli/schema.ts` with builders in
`src/cli/json.ts`; the `--workspace` flag, the `workspace merge` command, and
`requireMutableWorkspace` on every mutating arm in `src/cli/index.ts`;
`workspace: ['create',
'merge']` in telemetry's `VERB_TREE`. Tests: `test/workspace/steward.test.ts`
(14 mechanism cases) and `test/cli/steward.test.ts` (10 spawned-CLI cases) — new files only.

**What works now — with the commands that prove it** (Bun 1.3.14, git 2.54.0, macOS):

- `bun test` → `270 pass, 0 fail, 1038 expect() calls` across 28 files (from 245/866/26 at entry
  start; +14 module cases, +10 CLI cases, +1 row the mutation-json schema table auto-derived from
  the new registry entry) — all five acceptance scenarios, including the record encoding with the
  root's branch and porcelain asserted untouched, the guard refusing five mutating verbs from inside
  the copy with stdout empty while `task list`/`status` read the candidate, the
  close-refused-then-merge-then-close-delivered flow, the conflict abort to a byte-identical HEAD,
  and the behind→rebase→current glance against the workspace main line. The hermetic workspaces run
  on `master` (a bare `git init` under the pinned env), proving nothing assumes a main-line name.
- `mise run check` → exit 0, green end to end (Biome + dprint + `tsc --noEmit` + `bun test` +
  lychee).
- Dogfood smoke in a scratch workspace (`bun src/cli/index.ts`, never the live workspace):
  `worktree create t1 --workspace` →
  `created worktrees/t1-steward-catalog-tune (the workspace's
  own repository, branch steward/catalog-tune, deliverable)`;
  a `task open` from inside the copy exits 1 with
  `this directory is a stewardship copy — a worktree of the workspace at …`;
  `workspace merge steward/catalog-tune --preview` renders the 1-commit diff stat; the merge lands
  as `merge commit dc62087`; `task close t1` renders
  `✓ reachability (branch
  'steward/catalog-tune' (tip afbe34e) reaches main in the workspace's own history)`
  and tears down; the root ends on its main line with clean porcelain.

**Decisions** (entry-local, found while building): all recorded under Design → Decisions; two worth
naming — the record-first creation order was chosen when the write-up of the repository path's order
made the branch start one commit behind its own record (the reversed order gives the candidate its
self-description and a zero-behind start); and `stewardshipEnclosure` returns git's real-path answer
(macOS `/var` → `/private/var`), surfaced by the module tests comparing against the tmpdir spelling.

**Next.** In dogfood-priority order: run this entry's own successor stewardship work through these
rails (the first real client); the deferred doctor findings and `AGENTS.md` lessons once 0018 has
landed and the shared files are quiet; the upgrade entry's fuller preview; a local `awaiting-close`
derivation for landed-but-unclosed stewardship tasks.

## Spec-feedback

- **SF-001** — [`workspace-lifecycle`](../../intent/01-concepts/06-workspace-lifecycle.md), _The
  workspace's own main line_, with [`domain-model`](../../intent/01-concepts/00-domain-model.md),
  _Repositories and the main line_. _Friction:_ the workspace's own main line has no recorded name
  anywhere — for registered repositories intent insists "the main line is recorded from the
  repository, not assumed," but for the workspace's own the record holds nothing, and the only
  operational definition is "the branch the root checkout is on." A faithful build therefore cannot
  distinguish "the main line" from "whatever branch the root currently stands on": if a human moves
  the root to another branch by hand, every rail here (branching, the close gate, the merge) follows
  that branch honestly, and no integrity check can even name the drift — the "record ↔ disk" drift
  class has nothing recorded to compare against. _Assumption to keep moving:_ the root's checked-out
  branch IS the workspace's main line, definitionally (the invariant "the root never leaves its main
  line" read as defining, not merely describing); `workspaceMainLine` reads it live and refuses only
  a detached root. _Proposed revision:_ either bless the definitional reading in the domain model
  ("the workspace's main line is, by definition, the branch its root checkout is on — moving the
  root moves the main line") or, if drift should be detectable, name where the workspace records its
  own main-line name (the workspace document is the natural home) so doctor can check the root
  against it.

Two near-candidates adjudicated rather than filed: the stewardship-copy rule's "addresses the
enclosing workspace, or refuses plainly" is stated latitude, and this entry's uniform refuse-plainly
is a design choice under it (argued in Decisions), not a friction; and work-lifecycle's _Completion_
is written in PR-set vocabulary while a stewardship task commonly has no PRs — read with 06's "the
same verification duty, pointed inward," the empty set resolves trivially and the inward
verification carries the duty, so no revision is needed.
