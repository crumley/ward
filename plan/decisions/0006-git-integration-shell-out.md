# 0006 — Git integration: shell out to the `git` binary behind a thin wrapper

> **Status:** accepted · **Date:** 2026-07-03

## Context

Ward orchestrates real git — canonical main checkouts kept fresh, per-task **worktrees**, branches,
rebases ([`work-lifecycle`](../../intent/01-concepts/03-work-lifecycle.md)) — but is explicitly
**not a reimplementation of git** ([`vision`](../../intent/00-foundation/00-vision.md), non-goals).
It needs a small, reliable surface: create/list/remove worktrees, read the current branch/main,
refresh, and enough status to drive the walkthrough.

## Options considered

- **Shell out to the installed `git` binary** behind a thin async wrapper. Uses the exact git the
  user and their tools already use — worktrees, hooks, credentials, config all behave identically;
  nothing to keep in sync with git's evolution. `doctor` can check for it. Cost: parsing
  porcelain/`--porcelain` output, and a `git` dependency on the machine (which any real workflow
  already has).
- **libgit2 bindings (e.g. `nodegit`).** In-process, structured results. Cost: native build/install
  fragility (the opposite of the fast, low-ceremony setup bar), and libgit2's **worktree** support
  has historically lagged the CLI — worktrees are load-bearing here.
- **A pure-JS git (`isomorphic-git`).** No native deps. Cost: incomplete worktree/rebase fidelity
  and subtly different behavior from the user's real git — unacceptable when Ward's job is to
  orchestrate the user's actual repositories.

## Decision

**Shell out to the system `git` binary** through one thin wrapper module (`seams/git`) that runs
commands, checks exit codes, and parses the minimal machine output (`--porcelain` where available).
The wrapper is the single place git is invoked.

## Why

The non-goal is explicit: orchestrate git, do not become it. The binary is the only implementation
guaranteed to behave exactly like the user's own git across worktrees, hooks, and credentials — so
Ward's actions on a repo are indistinguishable from the user's, which is the whole point of a tool
that touches real, shared repositories. A thin wrapper keeps that dependency inspectable and
mockable: the intent tests stub the wrapper, and `doctor` verifies the binary and version.

## Consequences

- **Easy:** exact git fidelity (worktrees included); trivial to mock behind the wrapper for hermetic
  tests; `doctor` can diagnose a missing/old git.
- **Hard / committed:** parsing text output (contained to the one wrapper); a hard runtime
  dependency on `git` (reasonable, and surfaced by `doctor`).
- **Reversible?** The wrapper is a seam
  ([`agent-harness`](../../intent/02-subsystems/03-agent-harness.md) sits beside it); a future
  libgit2 swap is confined to `seams/git` and its stub.
