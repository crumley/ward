# 0002 — Execution & test runner: native `node`, built-in `node:test` (no build step)

> **Status:** accepted · **Date:** 2026-06-22

## Context

Given TypeScript on Node ([0001](0001-language-and-runtime.md)), we still choose _how_ to run and
test it. The intent leg [`test/README.md`](../../test/README.md) distinguishes **intent tests**
(durable invariants) from **design tests** (this build's choices); both need a runner. Context
economy ([§12](../../intent/00-foundation/01-principles.md)) and reversibility argue for the fewest
moving parts that still give a good iteration loop.

## Options considered

- **`tsx` / `ts-node` + Vitest (or Jest).** The conventional 2025 stack. Vitest has excellent DX
  (watch, rich matchers, parallelism), Jest is ubiquitous. Tradeoff: each adds a substantial
  dependency tree and a transform pipeline that re-implements what Node 26 now does natively; more
  to install, pin, and keep in context.
- **Native `node` execution + built-in `node:test` + `node:assert`.** Node ≥23 strips types; Node's
  built-in test runner discovers and runs `*.test.ts` directly. Verified here: `node --test` runs a
  TS test green on Node 26.0.0. Tradeoff: fewer batteries (no built-in mocking framework, leaner
  matchers, no watch-mode niceties), and the runner is younger than Jest/Vitest.

## Decision

Run with **`node <file>.ts`** directly and test with **`node --test`** over `*.test.ts`, using
`node:test` + `node:assert/strict`. **No bundler, no separate test framework.** Add `typescript` as
a dev-dependency solely for `tsc --noEmit` type-checking (a separate gate, since stripping does not
type-check).

## Why

- **Zero-dependency execution and testing** is the strongest possible expression of context economy
  for the build itself: nothing to install before `node src/cli/index.ts` or `node --test` works,
  and almost nothing to hold in context when resuming cold across loop iterations.
- The features Vitest/Jest add over `node:test` (mocking, snapshotting, watch) are **not** what the
  load-bearing tests need. The invariant tests are filesystem-and-behavior tests — create a real
  workspace in a temp dir, run real operations, assert on real recorded state. `node:assert` is
  sufficient and keeps intent tests honest (they exercise real I/O, not mocks).
- One fewer transform pipeline means the thing we test is the thing we ship — no chance a bundler
  masks a native-execution incompatibility.

## Consequences

- **Easy:** instant start; trivial cold resume; intent tests run against the real store.
- **Hard:** no watch mode or rich mocking out of the box; if a future seam genuinely needs heavy
  mocking we revisit. Erasable-only TS constraints ([0001](0001-language-and-runtime.md)) apply to
  test files too.
- **Type-checking is a distinct CI gate** (`tsc --noEmit`), not coupled to test execution. A test
  can run green while types are wrong, so both gates must pass.
- **Reversibility:** high. Adopting Vitest later is additive (point it at the same `*.test.ts`); no
  test would need rewriting because they use only `node:test`/`node:assert`, which Vitest also
  supports.
