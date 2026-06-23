# Design: Lifecycle Hooks

> **Serves intent:** [work-lifecycle](../intent/01-concepts/03-work-lifecycle.md) (setup/teardown
> hooks must be idempotent / validate-on-resume); [§6](../intent/00-foundation/01-principles.md)
> (idempotency); coordinates with [theming](theming.md).

## Realization (`src/domain/hooks.ts`)

A hook is `{ name, satisfied(ctx), apply(ctx), teardown(ctx) }`. The defining constraint is
**idempotency**: every hook is `validate → apply-if-not → mark satisfied`, so on resume a half-run
or fully-run hook converges to "satisfied" without repeating work, and `runSetupHooks` records each
as `satisfied` on the worktree record.

v1 ships two **worktree setup hooks**:

- **deps** — stands in for "run a dev tool to initialize dependencies": writes a `.ward-setup-deps`
  marker; `satisfied` = marker present. Idempotent by existence.
- **theme** — applies the worktree's accent+glyph by writing `.ward-theme.json`; `satisfied` = the
  file's value **equals** the current theme. Idempotent by value, so a re-theme converges and a
  no-change resume applies nothing.

Teardown removes both markers; `teardownWorktree` then `git worktree remove`s the tree (best-effort,
itself idempotent — a missing worktree is fine).

## Where this is exercised

- `createWorktree` runs the setup hooks after `git worktree add`; the result (`applied[]`) shows
  whether anything ran — empty on a satisfied re-create.
- `revalidateWorktree` re-runs the same hooks (used by recovery / resume); on an intact worktree it
  applies nothing — the no-op-on-resume the intent requires.
- `teardownWorktree` runs teardown on task close.

This is the general **opinionated-but-evolvable** shape: hooks are Ward-provided extension points,
customized per workspace, reconciled on upgrade (same pattern as workflow policy) — v1 hard-codes
the two; making the hook set a workspace-owned, reflection-evolvable artifact is a follow-on.

## Open / deferred

- **Hook validation depth** and the **maintenance cadence** (refresh/rebase as hooks vs. toil ops) —
  deferred ([work-lifecycle open questions](../intent/01-concepts/03-work-lifecycle.md)).
- Making hooks user-customizable artifacts (not hard-coded) and their reconciliation on upgrade.
