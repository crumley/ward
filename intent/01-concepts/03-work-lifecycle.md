# Work Lifecycle

> **Layer:** intent · concept. The what & why; the _how_ is planned in
> [`../../design/`](../../design/). **Status:** living.

This file describes the life of a **task** — from creation, through execution across worktrees, to
completion via merged pull requests and cleanup. It also covers the **local↔remote boundary**, the
**recurring maintenance toil Ward takes off the human's hands**, the **setup/teardown hooks** that
customize lifecycle transitions, and the **workflow policy** that governs how work is committed and
merged. Several rules here are _opinions_ Ward ships with; the policy section explains how those
opinions are made evolvable rather than baked in.

## The task as the unit of trackable work

A task is the level at which work is started, paused, resumed, and closed (`00-domain-model.md`). It
carries enough recorded intent that an agent arriving cold understands what it is for and what
"done" means: its scope, dependencies, and success criteria. A task can span **multiple worktrees
across multiple repositories**, and may be ad hoc and lightweight or durable and long-running.

### Who is involved — the task's cast

Tracking a task means more than its success criteria: at any moment Ward can answer **who is (or
was) involved** — which resident is working it, which charge nurse is responsible for knowing about
it, which rooms and sessions it spawned. This is **discoverable, and mostly derived rather than
separately stored** (`00-domain-model.md`, status; `../00-foundation/01-principles.md` §17):

- **The resident** that owns the task is the **persona configured at the task scope**
  (`01-scopes-and-personas.md`); its work appears in the task's own **session log**, where each
  entry records its persona and harness handle (`02-sessions-and-lifecycle.md`).
- **The rooms and their sessions** beneath the task (the medical students doing the work) are its
  sub-scopes, nested in its record.
- **The charge nurse and attending** responsible for knowing about it are **derived by containment**
  — they are the owning and status personas of the task's **project** (`01-scopes-and-personas.md`),
  not re-recorded on the task.

**Why derive, not duplicate:** a separately stored roster of "who's on this task" would go stale the
moment a session opens or closes; reading it from the session logs and the containment chain keeps
the answer always correct — the same reason status is derived (§17).

## Local-only vs. remote-linked tasks

A task may begin in either world:

- **Local-only** — started in the workspace with no remote item. For exploration, personal work, or
  anything not yet worth surfacing.
- **Remote-linked** — associated with a remote work item shared with other humans and agents.

A task can **move between these states**: a local-only task can later be **attached** to a remote
item, and a task started from a remote item can be found to duplicate an existing local task and the
two **merged**. Identity stays stable across these changes; the remote link is an attribute of the
task, not its identity.

## The privacy boundary (restated, because it is load-bearing)

The local task and the remote work item are two views with different audiences. The local view is
personal — local paths, private notes, informal framing, and Ward's internal machinery (including
**persona names and roles**). The remote view is shared.

> **Rule.** When Ward reflects progress outward to a remote item, it **translates**: composes
> content for the remote audience and strips everything local, personal, or internal. Nothing
> crosses by accident. The strict direction is **outward**: local context must not leak out
> (`../00-foundation/01-principles.md` §4).

## The cardinal rule: never merge to main directly

> **Work is never committed to a main line directly.** All work happens on a worktree (a branch) and
> reaches the main line **only through a pull request**. The single exception is **explicit human
> permission** — the human, or a senior scope to whom the human has explicitly delegated that
> authority, may approve a direct merge. Absent that explicit approval, the worktree-and-PR path is
> mandatory.

**Why so absolute:** everything downstream (review, refresh, cleanup) assumes it, and a single
careless direct push to main is exactly the kind of irreversible, outward-facing mistake the system
exists to prevent.

## Lifecycle hooks: customizable, idempotent setup and teardown

Lifecycle transitions have **setup and teardown hooks the user can customize** — how to set up a new
worktree, how to set up a new task, how to tear them down. For example, creating a worktree might
run a dev tool to initialize dependencies, or apply the worktree's visual theme; tearing one down
might clean those up.

The defining constraint: **hooks must be idempotent.** On resume, each hook can be **validated as
already-done-or-not** and become a **no-op** if already satisfied
(`../00-foundation/01-principles.md` §6). **Why idempotent:** because work is paused and resumed
constantly, a setup step may have half-run, fully run, or not run before an interruption; the only
safe hook is one that checks state and converges to "done" no matter how many times it fires.

These hooks are **Ward-provided extension points, customized per workspace** and evolvable the same
way the workflow policy is (see below; mechanism: `design/`).

## Execution

Once underway, work happens in the task's anchors — its worktrees and workdirs
(`00-domain-model.md`) — directed through the scope model (`01-scopes-and-personas.md`): a resident
owns the task, briefs and directs rooms that do the deep work, evaluates results, and presents to
the attending for approval. The task's recorded state tracks which anchors exist, which rooms are
active, and where each stands — so the task is resumable at any time.

## Ward absorbs the recurring toil

A pile of **recurring, tedious maintenance** surrounds live work, and Ward's intent is to **take it
on so the human does not have to track or remember it** — spending the human's attention only where
a real decision is needed (the prime directive, `../00-foundation/00-vision.md`). These are
**examples, not an exhaustive list** — the specific operations will grow and change over time:

- **Refresh** — pull the workspace's canonical main checkouts from origin on a cadence, so new
  worktrees branch from current code.
- **Rebase** — rebase existing worktrees onto the refreshed main line so work in progress stays
  current and merge surprises shrink — **including the sub-work that follows**, such as resolving
  (or, where it needs judgment, surfacing) rebase conflicts.
- **Watch PR and CI status** — follow each PR's review state and its checks, and know what is
  blocking a merge (driving the PR set to a merged close is _Completion_, below).
- **…and more** as it emerges.

**The toil yields to occupancy, and the delivery toil serves `deliverable` worktrees only.** Refresh
and rebase operate on **free** anchors; an **occupied** anchor is never mutated underneath its
occupant — Ward waits for it to free, or dispatches the request to the occupant to apply at a safe
point (`00-domain-model.md`: _an occupied anchor is written only through its occupant_). A `sandbox`
worktree is exempt altogether: its base is pinned and it opens no PRs, so there is nothing for the
delivery toil to serve (`00-domain-model.md`, Anchor). **Why:** a rebase landing under a working
agent is a lost update by Ward's own machinery (§17) — the ground shifting beneath the very work the
room boundary exists to protect.

**And the toil yields to evidence of unrecorded work.** Occupancy is the recorded claim, but the
record can lag reality — a human editing in their editor, an agent run outside Ward. So before
mutating any anchor, the toil independently checks the anchor itself and treats **uncommitted
changes as occupancy**: a dirty tree is never rebased or refreshed, whatever the record says.
**Why:** §16 prefers recorded state, but a fail-safe read of reality is what keeps "prefer the
record" from becoming "trust the record over the work in front of you" — a lost update is silent
corruption (§17) whether or not the writer announced itself.

**What is durable here is the intent, not the catalog.** Ward **owns the toil**: it performs what it
safely can autonomously (local, reversible work — §18) and **surfaces only what needs a human** —
what is behind, what is conflicted, what is blocked, what is ready. **Why:** which worktrees are
behind, which are clean, which are blocked should be readable at a glance, not held in the human's
head; and anything gated or outward (the merge itself) still requires authority (§18). The evolving
set of operations is a _how_ — `../../design/`.

## Completion: pull requests, merge, and cleanup

A unit of work is delivered through one or more **pull requests** — potentially several, across the
repositories a task touches. Ward treats the PR set as part of the task's state and drives it to
done:

1. **Track PRs.** For each: identity, status (open / changes requested / approved / merged), and
   what remains before it can merge.
2. **Guide to merge.** At any moment Ward answers "what is left to complete this task?"
3. **Decide what artifacts to keep elsewhere.** Closing a task includes deciding whether any of its
   **artifacts** should also be captured beyond the workspace — committed into the worktree's files,
   posted to a remote issue, or promoted to a project-level artifact (`00-domain-model.md`).
   Anything crossing outward is **re-authored for its destination, not copied verbatim** — composed
   for that audience and stripped of local, personal, or internal content (including provenance and
   persona). **Why at close:** this is the moment the task's durable output is complete and its
   value to others (and to the remote record) can be judged — and moved across the privacy boundary
   deliberately.
4. **Close the task.** A task is complete only when its **PR set is resolved**: every PR **merged**
   — the **delivered** close — or, when the work is deliberately set aside, **closed unmerged** —
   the **abandoned** close (Task states, below). A `sandbox` worktree opens no PRs, so it never
   gates completion. Then the task is closed (and, per the session lifecycle, closed stays closed).
5. **Refresh and clean up.** After the close, the affected main checkouts are refreshed and anchors
   no longer needed — worktrees of either disposition, and workdirs — are torn down (via the
   teardown hooks). Neither teardown is gated on a delivered close: a merged `deliverable` worktree
   holds nothing unmerged, and a `sandbox`'s scratch was declared disposable at creation
   (`00-domain-model.md`, Anchor). Tearing down a worktree that still holds unmerged _deliverable_
   work — the abandoned close — is the §18 case and takes explicit authority (Task states, below).

This whole sequence is something Ward **manages**, not something the human is left to remember.

## Workflow policy: opinionated but evolvable

Much of the above — branch from main, commit granularity, when to amend, PR-before-merge, the
never-merge-to-main rule — is **opinion**. Ward ships **specific, opinionated defaults** and
**injects them into a workspace at creation**, so a new workspace is immediately productive with a
sensible workflow.

But workflows evolve with the human and the kind of work, so the policy must be **modifiable, not
baked into the tooling**:

- The workflow policy lives in a **specific, encoded place inside the workspace** — the current
  intent is a **skill** the workspace owns (mechanism: `design/`).
- Ward installs the default at creation; thereafter the workspace's own agents and sessions may
  **evolve** it.
- On a Ward **update**, a policy the workspace has diverged from is **reconciled, never clobbered**
  — the general mechanism, including that reconciliation runs as a **task** whose completion is what
  advances the workspace's version, is `06-workspace-lifecycle.md`'s.

**Why this shape:** it keeps the human in control of their own workflow while still offering Ward's
improvements. Workflow policy is one instance of the **general shape for any opinion Ward ships** —
opinionated default, installed as a workspace-owned artifact, evolvable by the workspace, reconciled
on upgrade — which is stated once in `06-workspace-lifecycle.md` and applied here.

## Task states

Ward's task status is **just enough to route attention**, not a full project-management state
machine (`00-domain-model.md`, status) — so the set is deliberately small. A task carries one
**stored** state; one further state is **derived**, never stored.

**Stored on the task — one of three:**

| Stored state | Meaning                                                                                                                                          |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `active`     | Work underway. Opening a task makes it active (no separate "drafted").                                                                           |
| `paused`     | Deliberately set down, resumable, removed from the active list.                                                                                  |
| `closed`     | Work concluded — **delivered or abandoned** (the recorded outcome, below) — artifacts dispositioned, cleaned up. Terminal — closed stays closed. |

The only transitions are `active ⇄ paused` and `active → closed`; `active → closed` is allowed only
when completion holds — the PR set **resolved**: every PR merged, or deliberately closed unmerged
(Completion, above) — and `closed` is terminal (`02-sessions-and-lifecycle.md`: closed stays
closed).

**The close records an outcome — `delivered | abandoned` — not a fourth state.** Not all work
deserves delivery: a task can be superseded, disproven, or simply not worth finishing, and the
lifecycle must let it **close** rather than sit `paused` forever, polluting the very attention
router status exists to be. Closing such a task is an **abandoned** close: its open PRs are closed
unmerged, its artifacts are dispositioned exactly as in a delivered close (an abandoned arc often
yields the most valuable notes), and the scope-boundary reflection fires either way
(`04-reflection-and-evolution.md`) — a task that failed is concentrated evidence, not an
embarrassment to bury. The outcome is an **attribute recorded at close**, not a stored state: to
every rollup, `closed` is `closed`, and "did it land?" is answered from the record rather than by a
second terminal state every derivation rule would have to learn. **Abandoning is gated where it
destroys work:** tearing down a worktree that still holds unmerged **deliverable** work is exactly
the §18 case, so an abandoned close takes the human's (or explicitly delegated) authority; a
`sandbox`'s scratch was declared disposable at creation and gates nothing (`00-domain-model.md`,
Anchor).

**Derived, not stored — `in-review`:** a task is _in review_ exactly when it has **≥1 open PR** and
is not closed. It is computed from the PR set (Completion, above), not written on the task. **Why
derived:** the PR set is already the source of truth for review state; storing `in-review` as well
would be a second source that goes stale the instant a PR opens or merges
(`../00-foundation/01-principles.md` §17). It surfaces as a presentation overlay on an
otherwise-`active` task — and rolls up to a container as `active` (`00-domain-model.md`, derivation
rule).

**Why no `blocked` (and no `drafted`):** an attention-router asks "where can I make progress?", and
"blocked" is better carried as the higher scope's recorded attention flag (`00-domain-model.md`,
status) or as `paused` with a note — a stored `blocked` leaf state earns its complexity only in the
tracker Ward is explicitly _not_ trying to be. `drafted` collapses into `active` for the same reason
(open = active).

Local↔remote linkage is an **orthogonal attribute** that can change in any non-closed state.

## Canonical home for

- **The task lifecycle** — creation → execution → PR-set → merge → close → cleanup — and the
  **normative task states** (stored `active | paused | closed`; `in-review` derived from the open-PR
  set; the close **outcome** `delivered | abandoned`, an attribute recorded at close, not a fourth
  state).
- **The task's discoverable cast** — who is involved (resident, charge nurse, rooms, sessions),
  derived from its session logs and containment rather than stored.
- **Local-only vs. remote-linked tasks** and the attach/merge transitions (identity stays stable).
- **The never-merge-to-main cardinal rule.**
- **Ward absorbing the recurring maintenance toil** (refresh, rebase + conflict handling, PR/CI
  status-watching, …) and surfacing only what needs a human — the durable intent, not the catalog —
  including that the **toil yields to occupancy** and to **evidence of unrecorded work** (a dirty
  tree is treated as occupied, whatever the record says), and the delivery toil serves `deliverable`
  worktrees only.
- **Lifecycle hooks** — that they exist and must be **idempotent / validate-on-resume** (build
  planned in [`design/`](../../design/)).
- **Workflow policy** — opinionated-but-evolvable, as the worked instance of the general default →
  workspace-owned artifact → reconciled-on-upgrade pattern, which is
  [`06-workspace-lifecycle.md`](06-workspace-lifecycle.md)'s.

The privacy boundary itself is owned by
[`../00-foundation/01-principles.md`](../00-foundation/01-principles.md) §4 and the remote seam
[`../02-subsystems/06-remote-provider.md`](../02-subsystems/06-remote-provider.md); this slice
applies it to task completion and links there.

## Open questions

- **Delegated authority for gated actions** (§18) — how it is represented and bounded so it cannot
  be silently assumed.
- **Hook validation**, the **maintenance cadence** (and how conflicts/blocks are auto-resolved vs.
  surfaced for a human), and the **policy encoding home** (skill vs. dedicated config) — each
  deferred to the matching design draft.
- **Workdir hooks.** Whether workdirs need their own setup/teardown hook set or are a degenerate
  case of the worktree hooks (no dependency install, no theme — possibly just create/remove).
