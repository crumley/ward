# 0007 — Code formatting + linting: Biome, wired into `make check` and CI

> **Status:** accepted · **Date:** 2026-07-03

## Context

CONTRIBUTING.md is emphatic: **opinionated, automated formatting and linting on _everything_** — and
names the exact debt this ADR pays: "**only Markdown is covered, because no code exists yet. The
first build exercise that introduces code must wire its formatter + linter into the Makefile and CI
as part of its design foundation — before writing significant code.**" v1 introduced code but left
`make
check` running only `dprint` + `lychee`; that is the one gap v2 must close. TypeScript, unlike
Go's `gofmt`, ships no formatter or linter, so one must be chosen deliberately.

## Options considered

- **Biome.** A **single Rust binary** that is **both** an opinionated formatter and a strong linter
  (plus import sorting), near-zero config, very fast, one config file (`biome.json`). Matches the
  repo's existing single-binary Rust aesthetic (dprint, lychee). Cost: a younger rule ecosystem than
  ESLint's, and it is not the type checker — `tsc` remains the type gate.
- **ESLint + Prettier.** The incumbent, largest rule/plugin ecosystem. Cost: **two** tools with a
  known boundary war (needs `eslint-config-prettier` to stop fighting), slower, and a sprawling
  config — friction against the fast-feedback bar, and two moving parts where one will do.
- **Prettier + `typescript-eslint` only.** Formatting + type-aware lint. Cost: still two tools, and
  type-aware ESLint is the slowest option — wrong for a loop the intent wants tight.
- **dprint (TS plugin) + oxlint.** Two fast Rust binaries; dprint already present. Cost: two tools
  and two configs to keep aligned, versus Biome's one; oxlint is also young. No advantage over
  Biome's single binary.

## Decision

**Biome** for TypeScript **formatting + linting + import ordering**, configured in
[`biome.json`](../../biome.json) (opinionated: 2-space, width 100, single quotes, semicolons,
trailing commas; `recommended` rules plus stricter correctness/suspicious/style rules —
`noExplicitAny`, `noUnusedVariables`/`noUnusedImports`, `useExhaustiveSwitchCases`). **dprint**
keeps **Markdown**; **lychee** keeps **links**; **`tsc --noEmit`** keeps **types**. `make format`
writes fixes (`biome check --write` + `dprint fmt`); `make check` verifies without writing
(`biome ci` + `dprint
check` + `tsc` + `node --test` + `lychee`); CI runs `make check`
([`.github/workflows/check.yml`](../../.github/workflows/check.yml)).

## Why

One opinionated binary doing format **and** lint is the tightest realization of "opinionated on
everything" — fewer tools, one config, nothing to keep in sync, and it matches the single-binary
Rust tools already in the repo. The prime directive frames it: an automated check is feedback in
seconds on every iteration; the fewer, faster, and more opinionated those checks are, the faster
every artifact reaches the right form and the less attention formatting debates cost. Keeping Biome
(correctness/style) separate from `tsc` (types) mirrors [0002](0002-execution-and-test-runner.md)'s
split — each failure names exactly one class of problem.

## Consequences

- **Easy:** `make format` fixes an entire tree; `make check` is one green/red gate for Markdown
  **and** code, identical locally and in CI; adding a rule is a one-line `biome.json` edit.
- **Hard / committed:** the whole codebase must satisfy Biome's opinions (the intent) and stay
  within its rule set; Biome is a devDependency (installed by `npm`, run from `node_modules/.bin`),
  so CI installs npm deps before `make check`.
- **Reversible?** Config-local — swapping to ESLint/Prettier later is a `biome.json` → new-config
  change plus a Makefile line, touching no `src/`.
