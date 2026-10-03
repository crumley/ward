# 0047 — A stewardship worktree starts from the current main tip

> `ward worktree create ADDRESS --workspace` never adopts a leftover branch behind the main line: an
> unnamed branch is chosen fresh, and a named branch that does not hold the main tip is refused,
> naming the ways forward.
>
> **Status:** built — awaiting review · **Started:** 2026-10-03

A stewardship worktree ([`0019`](../0019-stewardship-worktrees/README.md)) defaults to the branch
`steward/<slug>`, and when a branch of that name already existed, the verb checked it out where it
stood. That rule was written for convergence — re-establishing a task's own hand-deleted worktree
from its surviving branch. It also fired for a brand-new task. Teardown deliberately leaves merged
stewardship branches behind (0019 defers pruning), and slugs repeat: every upgrade task is
`workspace-upgrade`. So a new upgrade task opened by hand and given a worktree landed on the
previous upgrade's merged branch, hundreds of commits behind the main line. The upgrade then
classified the installed manifest against a stale copy of the record, and its branch could not merge
cleanly.

The self-service upgrade ([`0030`](../0030-upgrade-self-service/README.md)) had already met this
hazard for abandoned upgrades and dodged it with a private name-picker of its own, which only that
path used. This entry moves the rule into the worktree verb, so every stewardship worktree gets it.
The repository path ([`0004`](../0004-work-spine/README.md)) never adopted an existing branch,
because `git worktree add -b` refuses one. Its refusal now says what to do.

## Serves intent

- [`work-lifecycle`](../../intent/01-concepts/03-work-lifecycle.md) — _Refresh_ exists so that new
  worktrees branch from current code: a new stewardship worktree now always does.
- [`workspace-lifecycle`](../../intent/01-concepts/06-workspace-lifecycle.md) — _the workspace's own
  main line_: stewardship travels as a branch landed by the gated merge, and a branch cut from the
  current tip is one that merge can take.
- [`principles`](../../intent/00-foundation/01-principles.md) — §6 (re-running the verb converges on
  the worktree the task already holds), §20 (a refusal names the way forward).

## Scope

- **In:**
  - **The unnamed branch is never someone else's.** Without `--branch`, a task that already holds a
    workspace worktree converges on that worktree's branch. Otherwise the verb takes
    `steward/<slug>` if it is free, then `steward/<slug>-<address>`, then that name with `-2`, `-3`,
    and so on. A suffix keeps going because rooms are reused once a task closes. The chosen branch
    is cut from the main-line tip.
  - **A named branch is adopted only at or after the tip.** With `--branch NAME`, a new worktree on
    a branch that already exists checks it out only if the main-line tip is its ancestor. Otherwise
    the verb refuses before any record is written. The refusal says how far behind the branch is and
    offers three ways forward: delete it if it has landed, rebase it if it holds work, or name or
    derive a fresh branch. A name that does not exist yet is created from the tip, as before.
  - **The self-service upgrade uses the verb's rule.** Its private name-picker is removed. It passes
    only the branch of an upgrade task it is resuming, and the verb chooses the name for a fresh
    one. The names it produces do not change.
  - **The repository path refuses legibly.** `ward worktree create --repo` checks for an existing
    branch in the canonical checkout before git does. It names the branch and the cleanup command,
    or suggests `--branch` with a fresh name.
- **Deferred:**
  - **Pruning landed stewardship branches at a delivered close.** Safe to defer because the verb no
    longer reads a leftover as a starting point. A leftover branch is now inert history that costs
    one name in `git branch`. 0019's reasons for keeping it still apply.
  - **Re-establishing a deleted repository worktree from its surviving branch.** The workspace path
    converges this way, but the repository path refuses, now with a message that names the branch.
    Safe to defer because the failure is loud, and the remedy (delete or rename) is in the message.
- **Acceptance:**
  1. `bun test test/workspace/steward.test.ts`: a default-named leftover behind the main line yields
     `steward/<slug>-<address>`, zero commits behind, leaving the leftover untouched. A re-run
     converges on the same record. A taken addressed name gets `-2`. A named branch behind the tip
     is refused, with no record, commit, or directory left behind. A named branch at the tip is
     adopted, and a fresh name is cut from the tip.
  2. `bun test test/workspace/rebase.test.ts`: the repository path refuses an existing branch,
     naming `repos/<name>` and the delete command, and a fresh `--branch` still works.
  3. `bun test test/workspace/self-service.test.ts`: an upgrade after an abandoned one still rides
     `steward/workspace-upgrade-<address>`.
  4. `env -u WARD_AGENT mise run check` is clean.

## Design

- **Decisions:**
  - **Choose a fresh name for an unnamed branch, and refuse a stale named one.** _Alternative:_
    refuse in both cases and make the human pick a name. _Attractive_ because it is one rule. _Lost_
    because an unnamed branch is the verb's own choice. Refusing would make the human resolve a
    collision the verb created, on the path the upgrade walks every time. A name the human typed is
    different: the human asked for that branch, so swapping in another would be a silent guess.
    _Cost:_ two behaviors, and each is explained where it happens.
  - **"At or after the tip" is the line for adoption.** _Alternative:_ never adopt an existing named
    branch. _Attractive_ because it is simpler. _Lost_ because a branch prepared at the tip, or
    ahead of it, is a legitimate starting point, and it does not have the stale-copy problem. Only a
    branch that lacks the tip has a stale view of the record. _Cost:_ one ancestry probe.
  - **Converge on the task's own workspace worktree before deriving a name.** Without this step, a
    task whose first worktree took a suffixed name would get a second worktree on a re-run, because
    the bare name is still taken. Reading the task's own records answers the re-run question.
- **Layout:** the name derivation and the stale-branch refusal sit beside `createWorkspaceWorktree`
  in `src/workspace/worktrees.ts`, the one place that branches stewardship worktrees. `upgrade.ts`
  no longer derives branch names.
- **Mechanisms:** existence is `rev-parse --verify refs/heads/<branch>`; "holds the tip" is
  `merge-base --is-ancestor <main> <branch>`; the distance in the refusal is `rev-list --count`. The
  convergent path still skips the check when the task's own worktree record already exists, so a
  task's surviving branch is checked out wherever it stands, and `ward worktree rebase` freshens it.
