# Design: Lifecycle Setup/Teardown Hooks

> **Layer:** design — implementation plan. The _how_; may change. **Status:** draft.

The build behind lifecycle hooks — the transition points, the satisfied-check, and the format.

## Serves intent

- [`../intent/01-concepts/03-work-lifecycle.md`](../intent/01-concepts/03-work-lifecycle.md) —
  customizable, **idempotent**, validate-on-resume setup/teardown at Ward-defined transitions;
  workspace-owned and evolvable.

## Plan (draft)

- **The set of transition points** that expose hooks (create/tear-down worktree, create/tear-down
  task, …).
- **How a hook declares its satisfied-check** — exit code, marker artifact, or declared probe — so
  resume is a no-op. _Bound:_ every hook is idempotent; an action that cannot be made safely
  repeatable does not belong in a hook.
- **The hook definition format and where it lives** in the workspace; **ordering** when several
  attach to one transition; and **how failures are surfaced**.
- Reuses the opinionated-but-evolvable, reconciled-on-upgrade pattern
  ([`workflow-policy.md`](workflow-policy.md)).
