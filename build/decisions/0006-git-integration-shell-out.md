# 0006 — Git integration: shell out to the `git` binary

> **Status:** accepted · **Date:** 2026-06-22

## Context

Ward orchestrates real repositories: it keeps **canonical main checkouts**, creates **worktrees**
off them ([domain-model](../../intent/01-concepts/00-domain-model.md),
[work-lifecycle](../../intent/01-concepts/03-work-lifecycle.md)), and the workspace itself is **a
git repository** ([§15](../../intent/00-foundation/01-principles.md)). A hard non-goal: Ward is
**"not a replacement for git, the forge, or the agent harness. Ward orchestrates these; it does not
reimplement them"** ([vision](../../intent/00-foundation/00-vision.md)). Git worktrees in particular
are a native git feature with subtle plumbing.

## Options considered

- **Shell out to the `git` binary** (`child_process.execFile`, no shell). Tradeoff: depends on a
  `git` being installed (universally true on a developer machine running coding agents) and on
  parsing/strict-checking CLI output; but it uses the _exact same_ git the human uses, including
  `git worktree`, with no behavioral surprises.
- **`simple-git`.** A thin promise wrapper over the same binary. Tradeoff: adds a dependency that is
  ultimately still shelling out — it buys ergonomics, not capability, and its worktree coverage is
  partial; we'd shell out for the gaps anyway.
- **`isomorphic-git`.** Pure-JS git, no binary needed. Tradeoff: does **not** support worktrees (a
  core Ward primitive), and reimplementing-git-in-JS is precisely the non-goal — it would diverge
  from the user's real git in edge cases.
- **`nodegit`** (libgit2 bindings). Tradeoff: native build/install pain, heavyweight, and still
  incomplete worktree support; far too much for v1.

## Decision

**Shell out to the installed `git` binary** via a thin `execFile`-based wrapper (`seams/git`), no
shell interpolation (args passed as an array — no injection surface), output parsed with explicit
checks. The wrapper exposes only the operations Ward needs (init, clone-or-init canonical checkout,
worktree add/remove, branch, commit, status, rev-parse).

## Why

- It is the literal expression of the non-goal: **orchestrate git, don't reimplement it.** Ward's
  worktrees _are_ git worktrees the human can `cd` into and inspect; nothing is simulated, so there
  is no second, divergent notion of repository state to keep consistent
  ([§16, recorded state is truth](../../intent/00-foundation/01-principles.md) applies to the store,
  not to re-deriving git).
- Worktrees — the one git feature Ward most depends on — are first-class in the binary and absent or
  partial in every pure-library option. Choosing the binary is choosing the only option that
  actually supports the primitive the domain model is built on.
- `execFile` with an argument array keeps it safe (no shell), and a thin command-scoped wrapper
  keeps the dependency on git's CLI surface in one swappable place.

## Consequences

- **Easy:** full, correct worktree support; behavior identical to the human's own git; trivial to
  inspect what Ward did (`git worktree list`, `git log`).
- **Hard / committed-to:** a runtime dependency on `git` being on `PATH` (acceptable for the target
  user); we parse CLI output, so we pin to porcelain/`-z`/`--format` stable outputs where possible
  and assert exit codes.
- **Reversibility:** high. All git access is behind `seams/git`; if a binding library ever covers
  worktrees well, swapping is contained. The on-disk repos/worktrees are plain git, owned by no
  Ward-specific format.
