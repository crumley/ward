# 0002 — Task runner + toolchain pinning: mise (replaces the Makefile), direnv optional

> **Status:** accepted · **Date:** 2026-07-05

Made for [`design/0001-dev-foundation/`](../0001-dev-foundation/README.md).

## Context

[`CONTRIBUTING.md`](../../CONTRIBUTING.md) demands one opinionated gate, identical locally and in
CI. The Makefile this replaces defined the tasks but **not the tool versions** — `make install`
meant "whatever Homebrew ships today", CI installed tools its own way, and nothing pinned `bun` at
all. Two machines could disagree about what "green" means. We need one file that pins the toolchain
**and** names the commands, so "provision" and "run the gate" are the same two commands everywhere.

## Options considered

- **mise.** One `mise.toml` holds `[tools]` (exact versions of bun, dprint, lychee — installed by
  `mise install`, identically on macOS and CI) and `[tasks]` (with dependencies, so `check` is one
  DAG). First-class GitHub Action. Honest costs: a **meta-tool bootstrap** — something still has to
  install mise itself (Homebrew locally, `jdx/mise-action` in CI), it just moves the unpinned edge
  one level up; younger and faster-moving than make; task output is multiplexed when run in
  parallel; per-directory config requires a one-time `mise trust`.
- **Makefile + Homebrew (status quo).** Ubiquitous, zero new concepts. Costs: pins nothing — version
  skew between laptop and CI is structural, exactly the disease; make's strengths (file-level
  incremental builds) are wasted on a no-build repo; portability warts (BSD vs GNU).
- **npm/bun scripts.** Already present via `package.json`. Costs: cannot pin or provision the non-JS
  binaries (dprint, lychee) or bun itself; multi-step tasks degenerate into `&&` chains; no task
  dependencies.
- **just.** A cleaner make for tasks. Costs: tasks only — solves none of the version-pinning
  problem, so we would still need mise (or asdf, or brew-pinning) beside it; two tools where one
  covers both jobs.

## Decision

**mise, via [`mise.toml`](../../mise.toml), replacing the Makefile (deleted).** `[tools]` pins
`bun`, `dprint`, `lychee`. `[tasks]` defines `fmt`, `lint`, `typecheck`, `test`, `links`, and the
aggregate no-writes gate **`check`**; JS-ecosystem tasks depend on a `deps` task
(`bun install --frozen-lockfile`), so `mise install && mise run check` is a complete cold start. CI
([`.github/workflows/check.yml`](../../.github/workflows/check.yml)) runs `jdx/mise-action` then
**the same `mise run check`**. **direnv is adopted as optional sugar:** [`.envrc`](../../.envrc)
evals plain `mise env`, putting the pinned toolchain on PATH on `cd`. mise's docs discourage their
(deprecated) deep direnv integration, so we deliberately use only the stable `mise env` output —
nothing anywhere depends on direnv; CI and all documented commands go through mise directly.

## Why

The gate only means something if both sides run the same bits: pinning versions and defining tasks
in one file removes the "works on my machine, not in CI" class of drift by construction. The
bootstrap tradeoff is acceptable because mise is the _only_ thing left to install by hand, and its
own version matters far less than the versions it pins. direnv earns its place by making the pinned
toolchain ambient (no `mise run` prefix for ad-hoc `bun`/`dprint` calls) without becoming a
dependency.

## Consequences

- **Easy:** cold start is `mise install` (+ `direnv allow` if you use direnv); the gate is
  `mise run check`, byte-for-byte what CI runs; bumping a tool is a one-line, reviewable diff.
- **Hard / committed:** contributors install mise (and are told to — the README/CONTRIBUTING say
  so); the repo carries two pinning homes on purpose (binaries in `mise.toml`, JS packages in
  `bun.lock` — see [0003](0003-biome-code-dprint-markdown.md) for why that split is principled).
- **Reversible?** Cheaply — the tasks are plain shell one-liners; porting them back to make (or
  just) is transcription, and the pins would just be lost, not broken.
