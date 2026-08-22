# 0030 — The self-service workspace upgrade

> `ward workspace upgrade`, typed bare by a human at the workspace root, stops refusing and builds
> its own vehicle: it derives and opens a stewardship task, creates the workspace worktree, runs
> 0020's deterministic upgrade into it, pushes the branch and opens a pull request on the
> workspace's forge, records it on the task — and ends by naming, with the exact commands, the three
> or four acts it deliberately did **not** take: review, merge, publish, close. A declared agent is
> refused the derivation exactly as it is refused every other one. One open upgrade task per
> workspace, detected from what the record says. Nothing to upgrade means no task, no worktree, no
> pull request.
>
> **Status:** built — awaiting review · **Started:** 2026-08-22

The owner's commissioning directive, verbatim:

> "open a subagent to work on the task that we just spoke about, about ward, workspace, upgrade,
> creating the task, doing the upgrade, creating the PR, and then telling the user what they need to
> do in order to complete the upgrade, which is review the PR, merge it, and close the task."

And on idempotency, verbatim:

> "if you run workspace upgrade and there's an open task already existing for an upgrade, maybe you
> should refuse to do it. You either […] need to close that upgrade and create a new one or merge it
> and then create a new one. but that we don't allow to upgrade tasks to exist for the same
> workspace at the same time. I'm also open to other ideas."

And, left open on purpose:

> "That may not be the case for Reflect. […] can you have two open reflect tasks at the same time.
> But we don't need to resolve that to get to work on this."

**The motivating incident.** The owner, standing at the workspace root, ran `ward workspace upgrade`
and was refused: _"no task given and no task worktree encloses this directory — name one"_. Adopting
[0029](../0029-launched-sessions/README.md)'s manifest refresh then took four ceremony commands —
`task open`, `worktree create --workspace`, `upgrade TASK`, and the still-pending merge and close —
in which the human typed **no information the verb could not derive**. The slug, the purpose, the
branch, the worktree path: every one of them is a function of "upgrade this workspace." That refusal
was [0020](../0020-deterministic-upgrade/README.md)'s deliberate choice ("a self-scaffolding verb
was rejected: it would re-implement three verbs' worth of convergence for the convenience of one
command line, and the refusal teaches the flow instead") — and it was right for the entry that had
no rails to lean on yet. It is wrong now: the three verbs it would have re-implemented are all
convergent, all built, and all callable. This entry composes them instead of re-implementing them,
which is the difference 0020 could not have known. The owner then closed that task
(`t5 --outcome abandoned`) specifically to redo the upgrade through this entry's code once it lands;
this feature's first real run is already scheduled.

**On the entry number.** 0030 was reserved for this work and verified free before finalizing:
`origin/main`'s `design/` tops out at `0029-launched-sessions/`, and the one open pull request on
the repository (#59, gate hardening) touches no design entry. No collision to record, unlike
[0028](../0028-agent-configuration/README.md)'s.

## Serves intent

- [`human-shell`](../../intent/02-subsystems/07-human-shell.md) — the slice this entry is mostly
  made of. **"Workspace- and scope-aware from any working directory"**: Ward "does not make the
  human restate what the directory already implies," and its _why_ is the prime directive — "making
  someone name the workspace or scope they are standing in is exactly the friction Ward exists to
  remove." Standing at the workspace root and being told to name a task for an act **on that very
  workspace** is that friction in its purest form. The same constraint's **asymmetry** note is why
  the affordance stops at the human: "an **agent** caller may still be **required** to pass scope
  explicitly, since it is cheap for an agent to be precise and explicitness keeps its calls
  deterministic." **"Supply nouns by recognition, never by recall"** is the quality bar this is
  measured against — "the difference between a tool people fight and one they reach for." **"What
  needs me?"** is what the completion message serves inline: the three remaining acts are "gated
  actions awaiting authority (§18)," presented "one glanceable" list with "acting on each one step."
  And **"verbs read true"**: `workspace upgrade` names the whole act — upgrading the workspace —
  which is exactly why it may not stop at the first quarter of it.
- [`workspace-lifecycle`](../../intent/01-concepts/06-workspace-lifecycle.md) — _The workspace's own
  main line_: stewardship "takes the path every deliverable takes: **a task, a branch, a worktree,
  and a merge that is the human's gated act**" — this entry builds the first three for the human and
  leaves the fourth exactly where intent puts it. _The review boundary is the branch, not a forge_:
  "where the workspace does have a forge remote, the same boundary may be reviewed as a pull request
  instead (§19 — one contract, more than one technique)" — the pull request built here is that
  second technique, and "the invariant is only this: **stewardship reaches the workspace's main line
  through a branch the human explicitly merges**" is what fixes the arrangement below. _The standing
  workspace project_ is where the derived task is opened: "the home for stewardship work — upgrades
  and their reconciliation, migrations, reflections." _How a workspace evolves_ is unchanged
  territory: what the upgrade installs is still 0020's.
- [`principles`](../../intent/00-foundation/01-principles.md) — **§8** (two audiences; "the
  **human** is the default audience unless the caller declares itself an agent") is the whole shape
  of the split. **§6** — the derived path converges: an interrupted run finishes rather than
  demanding ceremony, a second run against an in-flight upgrade refuses rather than duplicating, a
  re-run against an existing pull request reuses it. **§16** — "an upgrade is already in flight
  here" is answered by a field on the task record, never by a guess at a slug string. **§18** —
  merging is never Ward's act, on the forge or locally; the verb ends by naming it. **§20** — every
  forge failure is an outcome with its reason, and the task, worktree, and commit stand regardless.
- [`work-lifecycle`](../../intent/01-concepts/03-work-lifecycle.md) — the derived task is an
  ordinary task: recorded, addressable, pausable, closable, and its PR set is linked exactly as
  `ward task pr` links one, so the close gate reads it with no special case.

## Scope

- **In:**
  - **The human self-service path.** `ward workspace upgrade` with **no TASK**, run by a caller not
    declared as an agent, standing outside any task worktree: derive and open a stewardship task
    (slug `workspace-upgrade`, purpose derived, opened in the standing workspace project where the
    workspace has one), create the workspace worktree, run 0020's `upgradeWorkspace` into it
    unchanged, and **echo every derived step** the way 0006 echoes a task derived from the working
    directory — on stdout, or on stderr under `--json`. A **declared agent** running it bare stays
    refused with today's message, word for word.
  - **The pull request.** After the upgrade commit: fast-forward-publish the workspace's main line,
    push the stewardship branch, open a pull request against the main line, and record its URL on
    the task through the same `addTaskPr` linkage `ward task pr` writes. The pull request is a
    **review surface**; landing stays 0019's local gated merge. (The arrangement and its _why_ are
    in Design → Decisions.)
  - **The completion message — "what remains is yours."** The verb ends with the acts it did not
    take, in the order the human does them, each with its exact command: review (the pull request,
    or `workspace merge --preview` where there is no forge), merge (`ward workspace merge BRANCH`),
    publish (`git push origin <mainLine>`, present only with a forge), close
    (`ward task close
    CODE`). Both audiences: a numbered human block and a `remaining` array in
    the JSON.
  - **Idempotency.** One open workspace-upgrade task per workspace. A second bare run while the
    first **holds work** refuses, naming the task, its branch, and the two ways out — land it, or
    discard it. A first run that holds **nothing** (interrupted between `task open` and the commit)
    converges into it instead of demanding ceremony that would produce an identical task.
  - **Structural detection.** The task record gains an optional `stewardship: 'upgrade'` marker,
    written only by Ward's own derivation, and that is what "an upgrade task" means.
  - **The no-op case.** When the upgrade would change nothing, no task, worktree, branch, or pull
    request is manufactured: the verb reports the workspace current and stops.
  - **Explicit TASK unchanged.** `ward workspace upgrade TASK` writes into that task's stewardship
    worktree and stops — no derivation, no push, no pull request. It is also the agent's only path.
  - **CLI plumbing** — the `--json` shape grown and registered (`ward schema workspace upgrade`
    documents it), the completion tree and telemetry already carrying the verb unchanged.
  - **Tests** — a module-level suite for the mechanisms and a spawned-CLI suite for the whole flow
    against a hermetic forge (a canned `gh` plus a bare repository as `origin`'s push target).
- **Deferred / out, named:**
  - **Any automatic merge or close.** _Why safe:_ this is not a cost, it is the point (§18); the
    verb names both acts with their commands, and the delivered close's reachability gate proves the
    landing when the human takes it.
  - **Multiple concurrent upgrade tasks.** Refused, per the directive. _Why safe:_ the refusal names
    both ways out and the empty case converges, so no state is ever unreachable.
  - **Whether the same one-at-a-time rule holds for reflection.** The owner explicitly left this
    open ("That may not be the case for Reflect… we don't need to resolve that to get to work on
    this") and this entry does not resolve it. _Why safe:_ the mechanism is a per-act marker
    (`stewardship: 'upgrade'`), not a global "one stewardship task" rule — a reflection act would be
    a second value with its own multiplicity rule, decided by the entry that builds it, changing
    nothing here.
  - **Pruning an abandoned upgrade's branch.** 0019 and 0020 both defer it and it stays deferred.
    _Why safe:_ the consequence is handled rather than ignored — a fresh derivation takes a branch
    name of its own when the default is already taken (Design → Decisions), so a discarded upgrade
    is never silently adopted.
  - **Guided setup**, and **any change to what the upgrade installs** (0020's territory). The
    workspace `AGENTS.md` template was checked and instructs **no** upgrade ceremony for humans, so
    nothing installed changed and no lineage bookkeeping was needed.
  - **A doctor finding for an upgrade task left in flight.** _Why safe:_ the refusal names it at the
    moment it matters, and status already shows the open task.
- **Acceptance:** from a cold checkout, `mise run check` is green, and `bun test` proves: the bare
  human path end to end (task derived and marked, worktree created, commit landed, echoes emitted,
  completion acts named, `--json` validating under the registered shape); the declared-agent refusal
  with stdout empty and nothing manufactured; the second-open-upgrade refusal naming the first and
  both ways out; the interrupted run converging into the task it finds; the no-op creating nothing;
  forge-absent and forge-failure degradation with the task, worktree, and commit standing; and
  `workspace upgrade TASK` unchanged — no push, no pull request, no marker.

## Design

- **Decisions:** no new ADRs. Entry-local:
  - **The split is at the argument, not at a new verb.** `ward workspace upgrade` with a task is
    0020's act; without one it is this entry's. A separate verb (`ward workspace upgrade --auto`, or
    a `ward upgrade` noun) was rejected: the human-shell's "verbs read true" rule says the verb
    already names the whole act — upgrading the workspace — and the argument is genuinely the only
    thing that differs. The resolution lives in one small CLI function, `impliedUpgradeTask`, whose
    agent refusal and cwd-derivation echo are copied word for word from `resolveTaskTarget`; only
    the ending differs, because for **this one verb** standing at the workspace root is not a
    missing argument, it is where the act belongs.
  - **The affordance is the human's, and the agent's refusal is byte-identical to today's.** 0006
    refuses an agent the cwd derivation, 0024 refuses it the registry fallback, and this refuses it
    the derived vehicle — all three for one reason: an agent's location and a machine's preferences
    are incidental state its harness manages, and a mutation resolved from them stops being
    deterministic. Concretely here the stake is larger than a target: the derived path **opens a
    pull request**, and an agent that acquires an outward act as a side effect of omitting an
    argument is exactly the accident §18 exists to prevent. `ward workspace upgrade TASK` remains
    the agent's path and takes no outward act at all.
  - **The pull request is a review surface; the local gated merge is still the landing act.** This
    is the load-bearing decision, and the workspace it was designed against forced it: the live
    workspace's `origin` is a real GitHub repository, and its **local main line runs dozens of
    commits ahead of `origin/main`** (locally-first stewardship — the journal lands directly and is
    rarely pushed). Three arrangements were weighed.
    1. _Land on the forge (press merge)._ **Rejected outright.** The workspace root **is** its
       main-line checkout; a merge performed on the forge creates a commit the root does not have,
       so the next journal write diverges the record from its own remote. Intent's invariant —
       "stewardship reaches the workspace's main line through a branch the human explicitly merges"
       — is satisfied only by the local merge here, because only the local merge advances the branch
       the root stands on.
    2. _Push only the branch and open the pull request against a stale base._ Honest about §18 (no
       main-line push) but the pull request then diffs the branch against a base dozens of journal
       commits behind, so "Files changed" shows the whole record's recent history and the upgrade is
       buried in it. A review surface nobody can review is not a review surface.
    3. **Chosen: fast-forward-publish the main line first, then the branch, then the pull request —
       and name the post-merge publish as the human's fourth act.** The pull request then diffs the
       upgrade **alone**, because its base is the same commit the branch forked from. The push is
       never forced, so git itself guarantees it can only ever add commits the forge does not have;
       a diverged or refused remote degrades to `unpublished` with git's own reason and the pull
       request is still opened, with the skew named. After the human's local merge,
       `git push origin
       <mainLine>` makes the branch's commits reachable from the base
       branch, and the forge marks the pull request merged — which is why that act is in the
       completion message rather than hidden. The tension with §18's "pushing to a main line" is
       real and is **SF-001**, not papered over. The pull request's **body carries the
       arrangement**, in the body itself: it says the merge button would create a commit the
       workspace root does not have, and prints the three commands that land it properly. A reviewer
       who never reads this entry still cannot land it wrongly by accident.
  - **The forge half never costs the local half.** Publishing runs **after** the upgrade commit and
    every one of its failure modes is an outcome, never a throw: `skipped` (no `origin`, `origin`
    names no forge, or no usable `gh` — nothing outward was attempted at all), `failed` (the push or
    the forge refused), `opened`, `existing`. The verb exits **0** in every one of them, unlike
    `repo refresh`'s failed row: the act this verb performs is the upgrade, and the forge is an
    optional capability §20 says to mark unavailable rather than fail over — with doctor already
    owning the precise diagnosis of `gh`'s absence or auth (0010), which closes §20's loop. When
    there is no pull request the completion message points at
    `ward workspace merge BRANCH
    --preview` instead, so the flow is whole either way.
  - **"An upgrade task" is a fact on the record, not a slug.** `TaskRecord` gains optional
    `stewardship: 'upgrade'`, written **only** by Ward's own derivation. A slug match was rejected
    twice over: a slug is free text, so a renamed upgrade task would be missed, and unrelated work
    ("upgrade-the-api-client") would be seized on — the suite proves both. §16 in miniature: the
    record says what the thing is. The **consequence is named rather than hidden**: a task the human
    opened and passed to `ward workspace upgrade TASK` carries no marker and does not block a later
    bare run. That is the honest reading — Ward did not build that vehicle and does not know what
    else it carries — and §14 says the human who named it owns their arrangement.
  - **Refuse when it holds work; converge when it holds none.** The directive asks for a refusal,
    and §6 asks that re-running be safe. Both are satisfied by asking what the existing task
    actually holds: commits on its branch that the main line has not taken. Zero means the run was
    interrupted before it committed anything, and demanding "close it and create a new one" would
    spend the human's attention producing a byte-identical task. Non-zero means there is a real diff
    awaiting a decision, and a second vehicle would make "the change awaiting you" ambiguous — so it
    refuses, naming the task, the count, and both ways out with their commands.
  - **The no-op is decided by the same code that would do the work.**
    `assessUpgrade(root, dir,
    apply)` decides every artifact, record field, and baseline; the
    self-service path calls it against the **workspace root** with `apply: false` before any vehicle
    exists. A separate "would-anything-change" predicate was rejected as a second mechanism that
    could drift from the first (§6's argument, and one home per idea). The probe reads the root's
    working tree — what the human is looking at — which is the same content the copy would
    materialize.
  - **A derived branch never adopts a discarded one.** An abandoned upgrade's close tears down its
    worktree and leaves its branch behind (0019 defers pruning deliberately). Checking that leftover
    out would silently resurrect work the human explicitly threw away, and would report `current`
    over a workspace that never took the upgrade. So a fresh derivation uses
    `steward/workspace-
    upgrade` when that name is free and `steward/workspace-upgrade-<code>`
    when it is not: deterministic, legible in `git branch`, never anyone else's history. A task that
    already **has** a worktree record keeps the branch that record names — that is its own history,
    and converging on it is the point.
  - **`openTask` learned not to overwrite a closed task's records.** Codes are reused among open
    tasks, but a closed task's records survive at `<code>-<slug>/`. A **derived** slug is the first
    thing in Ward that reliably comes round again, so `t3-workspace-upgrade` could land on a closed
    `t3-workspace-upgrade`'s directory and overwrite its record. The free-code scan now skips a code
    whose directory already exists for the slug being opened. Small, and a real §17 fix for every
    caller, not only this one.
  - **The JSON grows one discriminator and three fields.** `vehicle` (`given` / `derived` / `none`)
    says where the task, branch, and worktree came from and governs which optional fields are
    present — the outcome-conditional convention `workspace merge` already uses. `derived` carries
    the echoed steps, `pullRequest` the forge half (including its absence, with the reason), and
    `remaining` the acts left to the human. `task`/`branch`/`path` leaving the required set is the
    one non-additive evolution, taken now while the only consumers are this repository's own tests,
    with `vehicle` arriving beside them so their presence is always derivable from one field —
    0019's `repo`/`source` precedent, same reasoning.
  - **`remaining` is emitted on both paths, and rendered on both.** The acts are derivable either
    way and an agent reading the explicit path's document deserves them too. The explicit path's
    tail therefore gained the close it always implied — same acts, one more line — while its
    behavior (no derivation, no push, no pull request, same refusals, same exit codes) is untouched.
- **Layout:** `src/workspace/publish.ts` (**new**: `publishStewardshipBranch`, the whole forge half
  behind one call, so nothing about pushing leaks into the upgrade's own logic);
  `src/workspace/upgrade.ts` (`assessUpgrade` factored out of `upgradeInCopy` with an `apply` flag;
  `selfServiceUpgrade`, `findOpenUpgradeTask`, the grown `UpgradeReport`); `src/forge/gh.ts`
  (`forgeRemote`, `ensurePullRequest` — the adapter stays the only place that knows what a forge
  is); `src/store/types.ts` (the task record's optional `stewardship`); `src/workspace/tasks.ts`
  (the `stewardship` option and the closed-directory guard in `openTask`); `src/cli/schema.ts` +
  `src/cli/json.ts` (the shape and its builder); `src/cli/index.ts` (`impliedUpgradeTask`,
  `renderUpgrade`, `renderPublication`); `test/helpers.ts` (the fake `gh` learned `pr create` and
  `pr view <branch>`). Tests: `test/workspace/self-service.test.ts` and
  `test/cli/self-service.test.ts` — **new files**, per the merge-hazard discipline.
- **Mechanisms:** _resolve:_ explicit TASK → 0020's path; else declared agent → refuse; else
  `scopeFromCwd` → the derived task, echoed; else the self-service path. _Self-service:_ resolve the
  main line → find the open marked upgrade task → refuse if its branch is ahead → probe the root
  read-only → nothing to do? report `current` and stop → open (or reuse) the task → create (or
  converge on) the worktree, echoing both → `upgradeWorkspace` → publish → link the URL → assemble
  the remaining acts. _Publish:_ `gh` present and `origin` a forge? no → `skipped` →
  `git push
  origin <mainLine>` (never forced) → `git push origin <branch>` → `gh pr view <branch>`
  (existing?) → `gh pr create --base <mainLine> --head <branch>`.

## Build log

### 2026-08-22 — The whole scope in one iteration

**Goal.** Everything in Scope: the bare-human path, the pull request, the completion message,
idempotency, the no-op, and the tests.

**What was done.** Built everything under Design → Layout. The order that mattered while building:
`assessUpgrade` was factored out **first**, because the no-op case is what decides whether a vehicle
is built at all and it had to be the same code that builds it; the forge half went into its own
module **last**, once the local flow was green, so that "the forge failed" could be proven not to
cost the task, the worktree, or the commit.

**Shared surfaces touched** (other work lands in parallel here): `src/cli/index.ts` (the
`workspace-upgrade` arm and its rendering — the arm no longer calls `resolveTaskTarget`, which is
otherwise untouched and still serves every other verb), `src/cli/schema.ts` and `src/cli/json.ts`
(the `workspace upgrade` shape and builder only), `src/workspace/upgrade.ts` (rewritten around the
assessment split; `upgradeWorkspace`'s signature and behavior unchanged), `src/forge/gh.ts`
(additions only — nothing existing moved), `src/store/types.ts` (one optional field on
`taskSchema`), `src/workspace/tasks.ts` (`OpenTaskOptions` gained `stewardship`; the free-code scan
gained the closed-directory guard), `test/helpers.ts` (`FakeGhBehavior` gained `prs` and `create`;
existing behavior unchanged — `gh pr view <url>` still answers from `responses`).
`src/workspace/steward.ts` was **not** touched, and neither was `src/workspace/templates.ts`: the
installed `AGENTS.md` instructs no upgrade ceremony for humans, so nothing installed changed and no
0020 lineage bookkeeping was needed.

**What works now — with the commands that prove it** (Bun 1.3.14, git 2.54.0, Linux):

- `bun test test/workspace/self-service.test.ts` → `6 pass, 0 fail, 45 expect() calls` — the bare
  path end to end (derived task and worktree, commit in the copy, the root untouched until the gated
  merge, then merge → delivered close with the `reachability` step and the worktree gone); the
  marker on the record and the task in the standing project; the no-op creating nothing (`readTasks`
  empty, one branch); the second-run refusal naming the task, the commit count, and both ways out;
  the interrupted run converging into the task it finds; and an unmarked `upgrade-the-api-client`
  task proving detection is structural rather than a slug match.
- `bun test test/cli/self-service.test.ts` → `7 pass, 0 fail, 86 expect() calls` — the whole flow
  through the spawned CLI against a hermetic forge: the derived vehicle, `origin/<mainLine>`
  published then the branch pushed then the pull request opened and **linked on the task**
  (`task list --json` shows it), the four remaining acts in order, the derivation echoed on stderr
  with stdout carrying one document; the human rendering naming the same acts; the declared agent
  refused (`exit 1`, stdout empty, nothing manufactured); the no-op; forge-absent and forge-failure
  degradation (`exit 0`, commit intact, the branch pushed, nothing linked); and
  `workspace upgrade t1` unchanged with the push target holding **nothing at all**.
- `mise run check` → exit 0, green end to end (Biome + dprint + `tsc --noEmit` + `bun test` +
  lychee): `543 pass, 0 fail, 2313 expect() calls` across 47 files, from `530 / 2182 / 45` at entry
  start — the 0020 and 0019 suites unchanged and still green beside the new ones.

**The hermetic forge, since it is the piece a next builder will wonder about.** No test may reach a
real forge, but "did the push actually happen" is exactly what this entry needs to assert. So the
suite fakes it twice: `WARD_GH` points at the canned `gh` from `test/helpers.ts` (now answering
`pr create` and `pr view <branch>` as well as `pr view <url>`), and the workspace's `origin` is a
**GitHub-shaped URL whose `remote.origin.pushurl` is a bare repository in the scratch tree**. The
URL is what decides whether a pull request is possible at all (`forgeRemote` parses it); the
`pushurl` is where a real `git push` really lands. The assertions then read the bare repository's
own `git branch` — proof that the main line and the stewardship branch arrived, and, in the
explicit-TASK case, proof that nothing did.

**Decisions** (entry-local, all recorded under Design → Decisions). Three were forced by building
rather than chosen on paper: the **abandoned-branch adoption** hazard surfaced as a failing
assertion — after `close --outcome abandoned`, the next bare run checked out the discarded
`steward/workspace-upgrade` branch and reported `current` over a workspace that had taken nothing,
which is what produced the `-<code>` suffix rule; the **`openTask` directory collision** followed
from the same place, since a derived slug is the first slug in Ward that reliably repeats; and the
**exit-0-on-forge-failure** posture was settled by writing the degradation test and asking what the
human should do next — the answer (`workspace merge --preview`, then merge, then close) is a
complete flow, and a nonzero exit would have called a completed upgrade a failure.

**Next.** In dogfood-priority order: run this against the live bootstrap workspace, which is what
the abandoned `t5` was set aside for — the first real run will also be the first real exercise of
the main-line publish against a genuinely divergent `origin`. Then: whether reflection wants the
same one-at-a-time rule (left open by the owner, above); a `needs you` item for an upgrade task left
in flight; and pruning an abandoned stewardship branch, whose absence this entry now works around.

## Spec-feedback

- **SF-001** — [`principles`](../../intent/00-foundation/01-principles.md) §18, with
  [`workspace-lifecycle`](../../intent/01-concepts/06-workspace-lifecycle.md), _The workspace's own
  main line_. _Friction:_ §18 names "**pushing to a main line**" in the gated set that requires the
  human — but the workspace's own main line is the one main line intent gives a **lawful direct
  writer**: "every lifecycle verb records its effect as a commit on the workspace's main line …
  these commits are the record advancing, not work product." A workspace kept locally-first
  therefore accumulates journal commits its remote has never seen, and the forge review surface
  intent itself offers ("the same boundary may be reviewed as a pull request instead") cannot show a
  truthful diff until those commits are published. §18 is written for work crossing the local↔remote
  boundary; publishing the journal is a backup of a record that already exists, and no rule in
  intent distinguishes the two. _Assumption to keep moving:_ fast-forward-publishing the workspace's
  **own** main line is not the gated act §18 means — it delivers no work, decides nothing, and is
  mechanically incapable of anything but adding commits the local main line already has (the push is
  never forced, so git refuses everything else). The verb takes it; the merge that puts work **on**
  the main line stays the human's. _Proposed revision:_ say in §18, or in the workspace-lifecycle
  section that already carves out the journal, whether publishing the workspace's own main line to
  its remote is gated — and if it is, name what a forge-reviewed stewardship branch is supposed to
  diff against instead.
- **SF-002** — [`workspace-lifecycle`](../../intent/01-concepts/06-workspace-lifecycle.md), _The
  review boundary is the branch, not a forge_. _Friction:_ the slice offers the pull request as a
  second **review** technique but says nothing about **landing**, and a pull request is not an inert
  review surface — it ships a merge button. Pressing it lands a merge commit on the forge's copy of
  a main line whose authoritative checkout is the workspace root, which the root then does not have:
  the record diverges from its own remote at the exact moment the human believes they completed the
  upgrade. The invariant the slice does state ("stewardship reaches the workspace's main line
  through a branch the human explicitly merges") is technically satisfied by the button, since a
  human explicitly pressed it — but the outcome is the divergence the invariant exists to prevent.
  _Assumption to keep moving:_ the pull request is review-only, and **landing is always local**;
  this entry writes that into the pull request's own body, so a reviewer who has read no design
  entry is still told the button is the wrong act and given the three commands that are the right
  one. _Proposed revision:_ state in the slice that where the forge technique is used, the forge is
  a review surface only and the landing act remains the local gated merge — or, if forge-landing
  should be supported, say what reconciles the root afterwards (a pull, and what happens when the
  local main line was ahead).

One near-candidate adjudicated rather than filed: 0020's decision that the upgrade "requires the
stewardship worktree to exist … rather than conjuring task, worktree, and branch itself" reads like
a design commitment this entry overturns, but it is design, not intent — and its stated reason ("it
would re-implement three verbs' worth of convergence") is answered rather than contradicted here:
those three verbs are **called**, not re-implemented, and the one place convergence was genuinely
missing (a derived slug landing on a closed task's directory) was fixed in `openTask` where it
belongs. Recorded here so the supersession is visible; 0020's entry stands.
