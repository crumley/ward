# Work Hierarchy

> **Layer:** intent · concept — design-independent. Names no tool; realizations live in
> `../../design/`. **Status:** placeholder skeleton. Obeys the two rules in `../README.md`.

## Purpose

The structural backbone: how work is organized as nested scopes, and how status is known across
them.

## Planned sections

- **The containment hierarchy** — `Workspace → Project → Task → Worktree → Room`; each level's
  meaning.
- **Levels are elided, not faked** — scales down to one-off work; add a level only when it earns its
  keep.
- **"Mission" is not a containment level** — if it returns, it is an attribute of a project.
- **Repositories and the main line** — the workspace's canonical checkouts, kept current, distinct
  from per-task worktrees.
- **Status: recorded at the leaves, derived above** — a containing scope's status is a _query_ over
  its children, never a stored roll-up; only non-derivable judgments are recorded higher.

## Canonical home for

The five containment levels and their definitions; the **status-derivation** rule (recorded at
leaves, derived above). Other slices link here rather than redefining a level. _(The_ task _as a
unit of deliverable work and its lifecycle live in `delivery.md`, which links back to the Task
definition here.)_

## Open questions

- **When does each level exist?** Rules for a task directly under the workspace vs. inside a
  project; when a project is warranted; the cheapest possible one-off task.
