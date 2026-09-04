# 0037 — Repository → floor affinity: a claim is a routing default

> A project may **claim** registered repositories, and a task opened with `--repo NAME` and no
> explicit floor opens on the floor that claims it — recorded on the task, so `ward worktree create`
> can name the repository on its own. A claim is a routing default and never a rule: `--project`
> always wins, a repository is claimed by at most one open floor, and moving a claim changes where
> new work lands without moving work that is already placed.
>
> **Status:** built — awaiting review · **Started:** 2026-09-04

Opening a task under the right floor is a decision the human makes over and over, and it is almost
always the same decision: maintenance on a repository belongs where the last maintenance on that
repository went. Nothing in the record says so, so the answer is re-derived from memory on every
`ward task open` — and getting it wrong is not a typo but a misfiling, discovered later when the
work is on a floor nobody looks at. The workspace already knows which repositories exist
([0003](../0003-repository-set/README.md)) and which floors are open
([0004](../0004-work-spine/README.md)); what it lacks is any recorded association between them.

The association is a **judgment**, and the domain model is precise about where judgments live: a
container records only what cannot be derived from its children. "Work on this repository belongs on
this floor" qualifies twice over — it is not a fact about the floor's tasks, and it has to answer
before the floor holds a single task, which is exactly when a derivation from its tasks would answer
nothing. So it is stored on the project record, as an optional list of repository names.

What matters most is what a claim is **not**. It never constrains what a floor's tasks may touch; it
never moves work already placed; and it is always overridden by an explicit `--project`. A default
that could refuse, or that could quietly relocate a task the human placed by hand, would be a rule
wearing a default's clothes — and the one thing this must not become is a second placement authority
competing with the human's. This entry rests on [0036](../0036-floor-addressed-tasks/README.md): the
tasks a moved claim leaves behind are named by their full addresses, which is what makes that report
readable at all.

## Serves intent

- [`00-domain-model.md`](../../intent/01-concepts/00-domain-model.md) — _Status_: "only judgments
  that **cannot** be derived from children — a priority, a 'waiting on an external decision' note,
  an attention flag — are recorded at the higher scope." A claim is that kind of judgment, and this
  entry records it at the project and nowhere else. The slice does not yet name claims among a
  project's attributes; [`spec-feedback.md`](spec-feedback.md) says so rather than assuming.
- [`00-domain-model.md`](../../intent/01-concepts/00-domain-model.md) — _Repositories and the main
  line_ and _Task_: a task "can span multiple worktrees across multiple repositories", and recording
  which repositories a task touches is what lets `worktree create` stop asking when there is only
  one answer.
- [`07-human-shell.md`](../../intent/02-subsystems/07-human-shell.md) — _spend the human's attention
  only where a real decision is needed_: placing a task on the floor its repository already belongs
  to is not a real decision, and the echo says how the floor was chosen so the derivation is never
  silent. _Supply nouns by recognition_: `project claim` completes floors by their slug and
  repositories by name.
- [`01-principles.md`](../../intent/00-foundation/01-principles.md) — **§20**: a moved claim reports
  what it left behind; an unclaimed repository degrades to a bare task plus the hint that would fix
  it; two claimants refuse rather than guess. **§6**: claiming what is already claimed here, and
  releasing what was never held, both converge. **§17**: nothing about the claim is duplicated — the
  project record is its one home, and every question about it is answered by reading that.
- [`06-workspace-lifecycle.md`](../../intent/01-concepts/06-workspace-lifecycle.md) — the integrity
  check: doctor names a claim on a repository that is not registered, with both remedies.

## Scope

- **In:**
  - **`repositories` on the project record** (optional `string[]`): the floor's claims. Additive —
    every record written before this entry stays valid unchanged.
  - **`repositories` on the task record** (optional `string[]`): what the task touches, recorded at
    open from `--repo NAME` (repeatable). Not derivable from the worktrees, which may not exist yet
    and may never exist.
  - **The verbs** (`src/workspace/affinity.ts`, wired in `src/cli/index.ts`):
    `ward project open SLUG [--repo NAME]…` claims at open; `ward project claim FLOOR NAME` and
    `ward project release FLOOR NAME` change claims later. Both are mutations with `--json`, journal
    commits, and completion over open floors (cued by slug) and registered repository names.
  - **One claimant per repository, among open floors.** Claiming from a second floor **moves** the
    claim; the report names the open tasks touching the repository that stay where they are
    (`ward now routes to floor 3; 1 open task touching it remains where it was opened: f2t1
    (in-flight)`).
    A closed floor's claims are inert. Claiming an unregistered name refuses with `ward repo list`;
    claiming for a closed floor refuses.
  - **Placement at `ward task open SLUG --repo NAME`:** one claimant opens the task on that floor
    and the echo says so (`opened f3t22 — slug (floor 3 by affinity: ward)`); no claimant leaves it
    bare with a dim hint; two claimants refuse, naming both floors. `--project` always wins, and
    when it disagrees with the affinity the echo says that too.
  - **`ward worktree create ADDRESS`** with no `--repo` uses the task's single recorded repository;
    with none or several recorded, today's refusal naming `--repo` stands unchanged.
  - **Surfaces**: `project list` shows claims (`(4 tasks · repos: ward, b3)`) and carries them in
    `--json`; `status`'s project rows carry them; the task shapes carry `repositories`; two new
    registry rows document `project claim` and `project release` in `ward schema`.
  - **Doctor**: a claimed repository that is not registered is a `warn` finding naming both remedies
    (release the claim, or register the repository). Additive in `--json`.
  - **The manifest** says what a claim is and is not, with the outgoing default's fingerprint
    appended to the lineage so existing workspaces upgrade
    ([0020](../0020-deterministic-upgrade/README.md)).
  - **Tests**: `test/workspace/affinity.test.ts` (recording, the move and what it leaves behind,
    convergence, the refusals, placement in all three shapes, inert closed-floor claims, the doctor
    finding) and `test/cli/affinity.test.ts` (both renderings of every verb, the routing echoes,
    `--project` winning, the worktree the record names, and the schema rows).
- **Deferred:**
  - **`project close` propagating claims.** _Why safe:_ there is no `project close` verb yet, and a
    closed floor's claims are already inert by construction — they route nothing and cannot be
    re-claimed onto that floor. When the verb exists it can decide whether to drop the claims or
    leave them as history; nothing is lost meanwhile, because the routing question already has the
    right answer.
  - **Claims by pattern or by directory** (`--repo 'ward-*'`). _Why safe:_ the registered set is a
    handful of names a human can list, and an exact name is the only form that can be validated
    against it — a pattern that matches nothing would be a claim that silently routes nothing, which
    is the failure the registration check exists to prevent.
  - **Affinity for anything but repositories** (a floor claiming a persona, a model, a schedule).
    _Why safe:_ each would be its own judgment with its own resolution rules, and bundling them
    behind one `repositories` key would fix an association none of them has yet earned.
  - **Re-placing existing tasks when a claim moves.** _Why safe:_ this is the entry's central
    promise, not an omission — a routing default that relocated work in flight would break every
    recorded worktree path and PR link for the sake of tidiness. The report names what stayed, and
    moving a task deliberately is [0036](../0036-floor-addressed-tasks/README.md)'s own deferral.
  - **A floor picker or any mechanism behind the floor tiers** (low floors for recurring
    maintenance, high for transient work). _Why safe:_ see Design — it is a naming practice affinity
    supports, and there is nothing to enforce.
- **Acceptance:**
  1. `mise run check` green.
  2. `bun test test/workspace/affinity.test.ts` — a claim is recorded and read back; a second claim
     moves it and names the open tasks staying behind; re-claiming and re-releasing converge; an
     unregistered name and a closed floor refuse without writing; one claimant routes, none hints,
     two refuse; a closed floor's claim routes nothing; a task records what it touches and a single
     record answers for `worktree create`; doctor warns on a dangling claim with both remedies.
  3. `bun test test/cli/affinity.test.ts` — both renderings of `project open --repo`,
     `project claim`, and `project release`; the three placement echoes; `--project` winning with
     the disagreement said out loud; `worktree create f2t1` with no `--repo`;
     `ward schema project
     claim`.
  4. In a throwaway workspace: `ward project open toolchain --repo ward` then
     `ward task open a-feature --repo ward` opens on that floor and says why; `ward project list`
     shows `repos: ward`; `ward doctor` is silent about claims while the repository is registered.

## Design

- **Decisions:** no new ADRs. Entry-local:
  - **Store the claim at the project, not derive it from its tasks.** Deriving — "the floor that
    holds the most open tasks touching this repository wins" — needs no new field and no new verb,
    and it was rejected on two counts. It cannot answer for an empty floor, which is exactly when
    the routing is most useful (the floor was opened _for_ that repository), and it makes routing
    drift silently as tasks open and close, so the same command means different things on different
    days for reasons nobody stated. A recorded judgment is stable, inspectable, and changeable by a
    verb that says what it changed. The cost is a field that can go stale relative to the registered
    set, which is why doctor checks it.
  - **One claimant per repository, and a second claim moves it.** Allowing several claimants was the
    alternative and is genuinely tempting — a repository can legitimately be worked on from two
    floors. It lost because the claim's whole job is to answer "which floor?" with one floor: two
    claimants turn every affinity placement into the ambiguity refusal, which is a default that
    never defaults. Moving is the honest interpretation of a second claim ("routing goes here now"),
    and the cost — that the previous floor silently loses its claim — is paid by the report naming
    the move, the floor it came from, and every open task it leaves behind.
  - **A moved claim moves nothing else.** The alternative, re-placing open tasks on the new floor,
    was rejected outright: the task's address, its worktree paths, and its branch names are all
    recorded under the old placement, and rewriting them to follow a routing preference would break
    live work to tidy a listing. Naming what stayed is the whole remedy — the human is told, and
    decides.
  - **Two claimants refuse; no claimant hints.** These look like the same case and are not. Two
    claimants is a genuine ambiguity with a one-word fix, so it refuses and names both floors. No
    claimant is not an error at all — a bare task is a legitimate placement (levels are elided, not
    faked) — so it proceeds and prints the dim hint that would set the affinity up for next time.
  - **`--project` always wins, and says so when it disagrees.** A default that could override an
    explicit instruction is not a default. Silently obeying `--project` was the simpler option and
    was rejected for §20's reason: when the human's floor and the recorded affinity disagree, one of
    the two is stale, and the only cheap moment to notice is the echo. The cost is one extra clause
    on a line that is already read.
  - **The claim is validated at the boundary, not stored optimistically.** `project open --repo` and
    `project claim` both check the name against the registered set before anything is written, so a
    claim on nothing cannot be created by the verbs — a dangling claim can only arise by removing a
    repository afterwards ([0033](../0033-repo-remove/README.md)), which is precisely the case
    doctor names. `release` deliberately does **not** validate: dropping a claim on a repository
    that has since been removed is the remedy doctor offers, and a validating release would refuse
    to perform its own remedy.
  - **The task records `repositories`, and `worktree create` reads it only when it is unambiguous.**
    Defaulting to the first of several was considered and rejected on the same ground as the
    ambiguous shorthand in [0036](../0036-floor-addressed-tasks/README.md): a verb that picks
    between two plausible referents is a verb whose behaviour cannot be predicted from the command
    line. One recorded repository is not a guess; several is, and the refusal already existed.
  - **`project claim` and `project release` share one `--json` shape.** They answer the same
    question — which floor claims this repository now, and what did the change leave behind — and a
    caller that has to branch on the verb to parse the answer would be reading two shapes for one
    fact. `staying` is empty on a release, which never moves routing away from work in flight.
  - **The floor tiers stay a convention.** Low floor numbers for the work that recurs (workspace
    administration, per-repository maintenance) and high ones for feature work that arrives and
    leaves is a useful habit, and affinity **supports** it: claim the repositories a low floor
    maintains, and their tasks land there. It is deliberately not a mechanism. Floor numbers are
    monotonic and never reused — the intent's rule, and the root of every historical room address —
    so a "tier" cannot be a range Ward allocates within without breaking that; and a floor picker
    would spend the human's attention on a choice the claim has already made. There is nothing to
    enforce and nothing to configure.
- **Layout:** `src/workspace/affinity.ts` is the one home for claims — reading them, changing them,
  and answering "where does this task go?" — so no caller re-implements the one-claimant rule.
  `projects.ts` gains only the ability to record claims at open; `tasks.ts` only the ability to
  record what a task touches. The CLI holds the two rendering functions and `placeTask`, which is
  where the `--project`-wins rule lives, because it is a rule about the command line rather than
  about the record. Doctor's check sits with the other record↔world integrity checks.
- **Mechanisms:** _Claiming:_ under the store lock, resolve the floor, find the current claimant,
  rewrite both project records (front matter only — the body is kept byte-for-byte), and commit both
  in one journal commit. _Placing:_ `placeByAffinity` maps each named repository to its claimant and
  branches on how many distinct floors came back — zero, one, or more. _Worktree source:_
  `recordedRepository` returns the task's single recorded repository or undefined, and the CLI's
  existing exactly-one-of check does the rest, so the refusal path is unchanged. _Upgrade:_ the
  manifest's outgoing bytes are a known default, so a workspace still carrying them untouched reads
  as `stale` and is brought forward by `ward workspace upgrade`.
