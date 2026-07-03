# Design — Agent harness & model selection

> **Serves intent:** [agent-harness seam](../intent/02-subsystems/03-agent-harness.md),
> [model-selection seam](../intent/02-subsystems/04-model-selection.md), §5
> (harness/model-agnostic). **Supersedes:** nothing.

## Decisions

- **Harness = a thin adapter over `start / handle / resume / locate`**
  ([`src/seams/harness.ts`](../src/seams/harness.ts)). v2 ships a **stub** runtime whose native run
  id is derived deterministically from the session id, and whose `resume` is idempotent (returns the
  same handle). The handle (harness type + run id) is a recorded **attribute**, not a second
  identity; the session addresses by its own id and _uses_ the handle to re-attach.
- **Model selection is the fast-vs-deep intent + an override hierarchy**
  ([`src/seams/model.ts`](../src/seams/model.ts)): `tierForRole` encodes defaults-follow-persona
  (status roles fast; depth roles deep); `resolveTier(role, overridesNarrowestFirst)` lets a
  narrower scope override a broader one. Concrete model **ids are config** in the workspace record
  (`models: { fast, deep }`), never in the concepts.

## What `src/` realizes it

`seams/harness` (stub adapter) · `seams/model` (tier resolution) · `domain/session` (records the
handle + resolved tier at open).

## Invariants under test

`test/intent/lifecycle` (handle recorded + stable across resume; resume idempotent).

## Deferred

A real harness adapter (Claude Code, etc.) and its handle format; exact-clone forks; thinking-depth
expression; per-scope model overrides surfaced in the CLI/config.
