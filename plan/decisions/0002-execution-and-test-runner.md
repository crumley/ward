# 0002 — Execution & test runner: `node --test`, `tsc` as a separate type gate

> **Status:** accepted · **Date:** 2026-07-03

## Context

CONTRIBUTING.md makes **fast write→fail→fix→pass** a selection criterion, not an afterthought, for
both unit and integration tests, and wants **high-assertion-density, table-driven** tests. Given
TypeScript-on-Node with no build step ([0001](0001-language-and-runtime.md)), we need a runner that
runs `.ts` directly and a way to still get real type checking (which type-stripping skips).

## Options considered

- **`node --test` (built in) + `tsc --noEmit` as a separate gate.** Zero dependencies, runs `.ts`
  natively, watch mode, TAP output, parallel files; `node:assert/strict` is enough for table-driven
  assertions. Types are checked out-of-band by `tsc`. Cost: assertion sugar is spartan next to
  Jest's matchers; type errors surface in `tsc`, not the test run.
- **Vitest.** Rich matchers, great watch UX, TS-native. Cost: a heavy dependency tree and a
  framework in the loop — friction the fast-feedback bar warns against, for sugar we do not need.
- **Jest.** Ubiquitous, but the slowest cold start and the most config for ESM + TS; the wrong
  direction for "no heavy harness in the way."

## Decision

**`node --test` with `node:test` + `node:assert/strict`** for unit and integration tests, and
**`tsc --noEmit`** as a **separate** strict type gate. Both are `make check` steps; both run in
seconds.

## Why

The fastest feedback loop is the one with nothing between the file and the run — no framework, no
build, no install. Keeping the **type** check separate from the **behavior** check is a feature: a
test failure means behavior is wrong, a `tsc` failure means the types are wrong, and the two are
never conflated. Zero dependencies also means zero supply-chain surface for the runner — one less
thing the `doctor` command and CI must reason about.

## Consequences

- **Easy:** `node --test`, `node --test --watch`, and running a single file are all one command;
  table-driven tests are plain arrays over `node:assert`.
- **Hard / committed:** no rich matcher library — assertions are hand-written (acceptable, and keeps
  tests legible); a type error will not fail a test run, so `make check` must run `tsc` too (it
  does).
- **Reversible?** Cheaply — tests are plain functions; adopting Vitest later would be mechanical.
