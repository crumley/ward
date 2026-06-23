# Design: Context Loading & Token Economy

> **Serves intent:** [context-loading concept](../intent/01-concepts/05-context-loading.md);
> [§3/§5/§9/§12](../intent/00-foundation/01-principles.md).

## v1 status: deferred (foundations in place)

Context loading assembles a session's context from a **harness-neutral `AGENTS.md` hierarchy keyed
to the working directory**, built **deterministically** and **append-biased** so sessions at the
same scope share token caches. v1 does not yet generate the per-scope `AGENTS.md` manifests, but the
load-bearing foundations the seam depends on are already built and proven:

- **Two axes recorded.** Every session records its **scope** and its **working directory**
  (`session-event`: `scope`, `cwd`), so "where you start determines what you load" is already
  expressible (`domain/session.ts`; room sessions get the worktree path as cwd).
- **Deterministic, append-biased store.** Front matter is serialized canonically
  (`store/frontmatter.ts`, [ADR 0004](../build/decisions/0004-frontmatter-determinism.md)) and logs
  are append-only (`store/log.ts`) — the exact properties §12 needs for a cacheable, accreting
  prefix.
- **Harness handle per session** (`seams/harness.ts`) — recorded so the run is locatable for resume
  and reflection, the other thing this slice requires.

## The realization when built

Generate an `AGENTS.md` at each scope level (workspace root, repo, worktree) that **manifests** the
artifacts/skills/records to load for that scope, ordered deterministically with the stable,
cacheable prefix first and any evolving tail last. The room/worktree `AGENTS.md` stays specialized
to its directory; the workspace `AGENTS.md` carries workspace-wide context. (This repo already
dogfoods the `AGENTS.md` convention at its root.)

## Open / deferred

- The exact `AGENTS.md` field conventions and skill resolution; the precise ordering algorithm for
  the cacheable prefix and where the mutable tail begins (the cross-cutting **append-vs-rewrite**
  open question, [open-questions](../intent/00-foundation/open-questions.md)).
