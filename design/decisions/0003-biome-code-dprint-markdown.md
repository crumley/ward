# 0003 — Code format + lint: Biome (as a bun devDependency); Markdown stays dprint + lychee

> **Status:** accepted · **Date:** 2026-07-05

Made for [`design/0001-dev-foundation/`](../0001-dev-foundation/README.md).

## Context

[`CONTRIBUTING.md`](../../CONTRIBUTING.md) mandates opinionated, automated formatting and linting on
**everything**, and explicitly required the first code-introducing work to wire a TS formatter +
linter into the gate _before significant code_. Markdown is already well served by dprint + lychee
(single-binary Rust tools, already configured); Biome does not format Markdown, so this decision is
about **code**, plus where the code tools live.

## Options considered

- **Biome.** One binary that is an opinionated formatter **and** a strong linter (plus import
  ordering); near-zero config; very fast; `biome ci` is a single no-writes gate. Costs: younger rule
  ecosystem than ESLint's (fewer plugins, some rules still in `nursery`); it is not a type checker,
  so `tsc --noEmit` remains a separate gate; its formatter's opinions are less negotiable — which is
  the point, but it is a commitment.
- **ESLint + Prettier.** The incumbent pair with the largest ecosystem. Costs: two tools with a
  known boundary conflict (needs `eslint-config-prettier`), slower, and config-sprawling — friction
  against the fast-feedback bar with no payoff at this repo's size.
- **dprint (TS plugin) + oxlint.** Two fast Rust binaries, dprint already present. Costs: format and
  lint split across two configs to keep aligned; oxlint is younger than Biome's linter; no
  single-command story.

**Where Biome lives** — bun devDependency vs `mise.toml` pin: as a **devDependency**, its version is
locked in `bun.lock` beside TypeScript's, `bun x biome` resolves it, and editor Biome extensions
find the project-local binary; and since `bun install` is already mandatory (runtime deps, tests),
it adds **zero** provisioning steps. Pinning it in mise would split the JS toolchain's versions
across two files to save a step that does not exist. The rule this sets: **binaries that run _on_
the repo (bun, dprint, lychee) are pinned in `mise.toml`; packages that live _in_ the JS ecosystem
are pinned in `bun.lock`.**

## Decision

**Biome** for TypeScript formatting + linting + import ordering, configured opinionated in
[`biome.json`](../../biome.json) (recommended rules plus stricter correctness/suspicious/style,
`noExplicitAny`, unused-variables/imports as errors), installed as a **bun devDependency**.
**Markdown stays dprint** ([`dprint.json`](../../dprint.json)) **and lychee**
([`lychee.toml`](../../lychee.toml)). All wired as mise tasks
([0002](0002-mise-tasks-and-pinning.md)): `fmt` writes fixes; `lint` (Biome `ci` + dprint `check`)
verifies; `check` runs the whole gate.

## Why

One binary doing format + lint is the tightest realization of "opinionated on everything": one
config, nothing to keep in sync, feedback in milliseconds. It also matches the repo's existing
single-binary Rust tool aesthetic. The younger-ecosystem cost is acceptable because the repo needs
strong defaults, not plugin breadth — and the type dimension is covered separately by `tsc`, so each
red check names exactly one class of problem.

## Consequences

- **Easy:** `mise run fmt` fixes code and Markdown in place; adding a rule is a one-line
  `biome.json` edit; editors and the gate agree by construction.
- **Hard / committed:** the codebase must live with Biome's opinions; `nursery` rules may move under
  version bumps (the lockfile makes bumps deliberate).
- **Reversible?** Config-local: swapping to ESLint/Prettier later is a config change plus two lines
  of `mise.toml`, touching no `src/`.
