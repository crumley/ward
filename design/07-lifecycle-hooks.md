# Design — Lifecycle hooks

> **Serves intent:** [work-lifecycle](../intent/01-concepts/03-work-lifecycle.md) (idempotent
> setup/teardown), §6 (idempotency). **Supersedes:** nothing.

## Decisions

- **Hooks are idempotent by construction** ([`src/domain/hooks.ts`](../src/domain/hooks.ts)): each
  has `apply` / `satisfied` / `remove`, and every operation checks `satisfied` before acting, so a
  half-run step converges to done no matter how many times it fires.
- **v2's default worktree hooks are checkable markers** under `<checkout>/.ward-setup/`: `deps`
  (dependency init) and `theme` (apply the accent/glyph). "Satisfied?" is "does the marker exist?".
- **Three operations:** `applySetupHooks` (on worktree create), `revalidateSetupHooks` (on
  resume/recovery — re-applies only what vanished), `removeTeardownHooks` (on teardown). Recovery
  runs re-validation for **live worktrees only** — a torn-down worktree's checkout is gone, and
  re-applying into a missing directory is a hard error (sessions-recovery design).

## What `src/` realizes it

`domain/hooks` (the hook framework + defaults) · `domain/worktree` (`createWorktree` /
`teardownWorktree` / `revalidateWorktree`).

## Invariants under test

`test/intent/recovery` (a vanished setup marker is re-applied on attach; torn-down worktree
skipped); acceptance §3 (markers on disk) / §9 (teardown removes the checkout).

## Deferred

User-authored custom hooks per workspace (the extension-point plumbing); hook ordering/dependencies.
