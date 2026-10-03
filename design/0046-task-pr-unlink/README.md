# 0046 — A withdrawn pull request leaves the task's PR set

> `ward task pr --unlink ADDRESS URL` takes a pull request out of a task's PR set, so a task that
> delivered through its other PRs can close as delivered instead of being forced to close as
> abandoned.
>
> **Status:** built — awaiting review · **Started:** 2026-10-03

The close reads a task's PR set to decide its outcome
([`intent/01-concepts/03-work-lifecycle.md`](../../intent/01-concepts/03-work-lifecycle.md),
_Completion_). A delivered close needs every PR in the set merged and on the main line
([`0012`](../0012-close-gate-reachability/README.md)). An abandoned close needs every PR closed
unmerged. Until now the set could only grow. `ward task pr` linked a URL, and nothing took one out.

That left one honest situation unrecordable. A PR opened for a task and then withdrawn from it —
closed on purpose, or superseded by another PR — stays in the set, while the task's other PRs merge
and deliver the work. The set then holds a merged PR and a closed-unmerged one. The delivered close
refuses that set, and the only close left is `--outcome abandoned`, which records a terminal, false
outcome for work that shipped. The record goes wrong only because the set cannot be corrected, not
because any rule is wrong.

## Serves intent

- [`work-lifecycle`](../../intent/01-concepts/03-work-lifecycle.md) — _Ward treats the PR set as
  part of the task's state_: state that can be corrected when a PR leaves the work. _A task is
  complete only when its PR set is resolved_: the gate stays exactly as strict, applied to the set
  that actually carries the work.
- [`human-shell`](../../intent/02-subsystems/07-human-shell.md) — _Organized around nouns and
  verbs_: the inverse of `task pr` is a flag on the same verb, as `--outcome` is on `task close`.
- [`principles`](../../intent/00-foundation/01-principles.md) — §11 (provenance: the journal commit
  records the unlink, so the set's history survives the correction), §18 (the merge stays the
  human's act; unlinking changes only the workspace's own record).

## Scope

- **In:**
  - **`ward task pr --unlink [ADDRESS] URL [--json]`.** It removes URL from an open task's PR set
    under the store lock and commits the record as `Unlink PR from task <address>`. Both arities
    take the flag, and ADDRESS is inferred inside a worktree exactly as for linking. The JSON
    document is the task mutation shape `task pr` already emits. A URL the task does not carry is
    refused, naming the set as it stands.
  - **The manifest** names the flag under _Link your pull request_. The outgoing default's hash
    joins the lineage ([`0020`](../0020-deterministic-upgrade/README.md)).
- **Deferred:**
  - **Refusing to unlink a merged PR.** Safe to defer because unlinking is a deliberate, single-URL
    act on the workspace's own record, its commit is in the journal, and the delivered close still
    verifies every PR that remains. A guard would need a live forge probe on a verb that today never
    touches the network.
  - **A recorded reason for the unlink.** Safe to defer because the PR itself, closed on the forge
    with its own conversation, is where the reason lives, and the journal commit says when.
- **Acceptance:**
  1. `bun test test/cli/task-pr-unlink.test.ts`: unlink shrinks the set and commits, `--json` parses
     as `taskMutationShape`, an unknown URL is refused naming the set, and a withdrawn PR gates a
     delivered close until it is unlinked, after which the close succeeds.
  2. `env -u WARD_AGENT mise run check` is clean.

## Design

- **Decisions:**
  - **A flag on `task pr`, not a new verb.** _Alternative:_ `ward task unpr` or
    `ward task pr remove`. _Attractive_ because it would be its own entry in help. _Lost_ because
    unlinking is the same operation on the same set run backwards. One verb keeps the two arities,
    the address inference, and the JSON shape shared, and `--help` on `task pr` shows both
    directions. _Cost:_ the flag is less visible than a verb, which the manifest line offsets.
  - **Correct the set; do not relax the gate.** _Alternative:_ let a delivered close accept a
    closed-unmerged PR whenever at least one PR merged. _Attractive_ because it would need no new
    surface. _Lost_ because it would make every closed-unmerged PR silently ignorable at close,
    including one closed by accident whose work never landed. An explicit unlink is a deliberate,
    journaled claim that this PR is not part of the delivery. _Cost:_ one extra command in the rare
    case.
- **Layout:** `removeTaskPr` sits beside `addTaskPr` in `src/workspace/tasks.ts`: same lock, same
  open-task resolution, same commit-as-journal.
- **Mechanisms:** none beyond the set filter. The close is untouched and reads the corrected set.
