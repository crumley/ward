# Work Lifecycle

This file describes the life of a **task** — from creation, through execution across
worktrees, to completion via merged pull requests and cleanup. It also covers the
**local↔remote boundary**, the **setup/teardown hooks** that customize lifecycle
transitions, and the **workflow policy** that governs how work is committed and merged.
Several rules here are *opinions* Ward ships with; the policy section explains how those
opinions are made evolvable rather than baked in.

## The task as the unit of trackable work

A task is the level at which work is started, paused, resumed, and closed
(`02-domain-model.md`). It carries enough recorded intent that an agent arriving cold
understands what it is for and what "done" means: its scope, dependencies, and success
criteria. A task can span **multiple worktrees across multiple repositories**, and may be
ad hoc and lightweight or durable and long-running.

## Local-only vs. remote-linked tasks

A task may begin in either world:

- **Local-only** — started in the workspace with no remote item. For exploration, personal
  work, or anything not yet worth surfacing.
- **Remote-linked** — associated with a remote work item shared with other humans and
  agents.

A task can **move between these states**: a local-only task can later be **attached** to a
remote item, and a task started from a remote item can be found to duplicate an existing
local task and the two **merged**. Identity stays stable across these changes; the remote
link is an attribute of the task, not its identity.

## The privacy boundary

The local task and the remote work item are two views with different audiences: the local view
is personal (paths, private notes, internal machinery including **persona names**), the remote
view is shared. When Ward reflects progress outward it **translates** — composing for the remote
audience and stripping everything local; nothing crosses by accident, and the boundary guards
strictly **outward** (`01-principles.md` §4).

## The cardinal rule: never merge to main directly

> **Work is never committed to a main line directly.** All work happens on a worktree (a
> branch) and reaches the main line **only through a pull request**. The single exception
> is **explicit human permission** — the human, or a senior scope to whom the human has
> explicitly delegated that authority, may approve a direct merge. Absent that explicit
> approval, the worktree-and-PR path is mandatory.

**Why so absolute:** everything downstream (review, refresh, cleanup) assumes it, and a
single careless direct push to main is exactly the kind of irreversible, outward-facing
mistake the system exists to prevent.

## Lifecycle hooks: customizable, idempotent setup and teardown

Lifecycle transitions have **setup and teardown hooks the user can customize** — how to set
up a new worktree, how to set up a new task, how to tear them down. For example, creating a
worktree might run a dev tool to initialize dependencies, or apply the worktree's visual
theme; tearing one down might clean those up.

The defining constraint: **hooks must be idempotent.** On resume, each hook can be
**validated as already-done-or-not** and become a **no-op** if already satisfied
(`01-principles.md` §6). **Why idempotent:** because work is paused and resumed constantly,
a setup step may have half-run, fully run, or not run before an interruption; the only safe
hook is one that checks state and converges to "done" no matter how many times it fires.

These hooks are **Ward-provided extension points, customized per workspace** and evolvable
the same way the workflow policy is (see below; mechanism: `../how/lifecycle-hooks.md`).

## Execution

Once underway, work happens in the task's worktrees, directed through the scope model
(`03-scopes-and-personas.md`): a resident owns the task, briefs and directs rooms that do
the deep work, evaluates results, and presents to the attending for approval. The task's
recorded state tracks which worktrees exist, which rooms are active, and where each stands —
so the task is resumable at any time.

## Keeping worktrees current: refresh and rebase

Two related maintenance operations must be **automated and made easily visible through
Ward's CLI tooling**:

- **Refresh** — the workspace's canonical main checkouts are pulled from origin on a
  cadence, so new worktrees branch from current code.
- **Rebase** — existing worktrees are rebased onto the refreshed main line, so work in
  progress stays current and merge surprises shrink.

**Why visible and easy:** which worktrees are behind and which are clean should be readable
at a glance and easy to act on, rather than relying on the human to remember.

## Completion: pull requests, merge, and cleanup

A unit of work is delivered through one or more **pull requests** — potentially several,
across the repositories a task touches. Ward treats the PR set as part of the task's state
and drives it to done:

1. **Track PRs.** For each: identity, status (open / changes requested / approved /
   merged), and what remains before it can merge.
2. **Guide to merge.** At any moment Ward answers "what is left to complete this task?"
3. **Decide what artifacts to keep elsewhere.** Closing a task includes deciding whether any
   of its **artifacts** should also be captured beyond the workspace — committed into the
   worktree's files, posted to a remote issue, or promoted to a project-level artifact
   (`02-domain-model.md`). Anything crossing outward is **re-authored for its destination,
   not copied verbatim** — composed for that audience and stripped of local, personal, or
   internal content (including provenance and persona). **Why at close:** this is the moment
   the task's durable output is complete and its value to others (and to the remote record)
   can be judged — and moved across the privacy boundary deliberately.
4. **Close the task.** A task is complete only when **all its PRs are merged**. Then it is
   closed (and, per the session lifecycle, closed stays closed).
5. **Refresh and clean up.** After merge, the affected main checkouts are refreshed and
   worktrees no longer needed are torn down (via the teardown hooks).

This whole sequence is something Ward **manages**, not something the human is left to
remember.

## Workflow policy: opinionated but evolvable

Much of the above — branch from main, commit granularity, when to amend, PR-before-merge,
never-merge-to-main — is **opinion**. Ward ships opinionated defaults and injects them into a
workspace at creation, so a new workspace is immediately productive; thereafter the workspace
owns and evolves them, and a Ward upgrade reconciles rather than clobbers any divergence. This
is the **opinionated-but-evolvable** pattern Ward uses for everything it ships into a workspace
(policy, lifecycle hooks, personas, scaffolding) — defined in `../how/workflow-policy.md`.

## Summary of task states (conceptual)

The precise state machine is to be settled as we build (`08-open-questions.md`), but the
intent spans at least: *drafted* (intent captured), *active* (work underway), *in review*
(PRs open), *blocked* (waiting), *paused* (set down, resumable), and *closed* (all PRs
merged, artifacts dispositioned, cleaned up). Local↔remote linkage is an orthogonal
attribute that can change in any non-closed state.
