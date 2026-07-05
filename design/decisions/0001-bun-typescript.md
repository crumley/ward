# 0001 — Runtime, language, test runner: Bun running strict TypeScript, `bun test`

> **Status:** accepted · **Date:** 2026-07-05

One ADR for three entangled choices: the runtime is picked largely for how it runs the language and
tests, so deciding them separately would manufacture rationale. Made for
[`design/0001-dev-foundation/`](../0001-dev-foundation/README.md).

## Context

Ward is a CLI that will be spawned **many times per iteration** — by humans, by agents, and by its
own test suite ([`human-shell`](../../intent/02-subsystems/07-human-shell.md) makes the CLI the
product's front door, and [`CONTRIBUTING.md`](../../CONTRIBUTING.md) makes the
write→fail-fast→fix→pass loop a stated quality bar). Process startup latency is therefore a
first-order cost, not a nicety. The intent is language-agnostic; the build must pick a runtime, a
language, and a test runner.

## Options considered

- **Bun + TypeScript.** Fastest process startup of the three by a wide margin (a few ms of runtime
  overhead vs tens for Node); runs `.ts` directly with no build step; ships a native, fast test
  runner (`bun test`, Jest-style API) so testing needs no extra dependency; single binary to
  provision. Honest costs: **less ubiquitous than Node** — Node is the default assumption of the
  ecosystem, of CI images, and of coding agents, so contributors and tools will occasionally trip on
  the difference; one commercial steward (Oven); occasional Node-API compatibility edges in
  third-party packages; `bun test` couples the suite to Bun's runner.
- **Node + TypeScript (type-stripping).** The ecosystem/agent/CI default — the boring, safest
  choice, and what the prior build experiments used. Node ≥24 runs erasable TS natively and ships a
  built-in test runner. Costs: slower startup (the cost multiplied by every spawn in the loop); the
  TS story has more sharp edges (erasable-only syntax is mandatory, `--experimental` flags moved
  recently); test runner is serviceable but slower and sparser than `bun test`.
- **Deno + TypeScript.** First-class TS, strong stdlib, good test runner, sandbox permissions.
  Costs: startup between Bun and Node; the permission model adds ceremony to a tool whose whole job
  is touching the filesystem and spawning processes; npm interop is good but still the third-best
  ecosystem fit; no adoption advantage over Node to offset it.
- **Go / Rust.** Real single-binary distribution and `gofmt`-class tooling, but a compile step in
  the inner loop and a much larger rewrite distance for an I/O-bound orchestration tool; rejected
  for the same reasons the prior experiments recorded.

## Decision

**Bun (pinned via mise, [0002](0002-mise-tasks-and-pinning.md)) executing strict TypeScript directly
— no build step — with `bun test` as the test runner.** TypeScript is configured strict with
`verbatimModuleSyntax` + `erasableSyntaxOnly` ([`tsconfig.json`](../../tsconfig.json)), so the code
stays within the erasable subset and a port back to Node type-stripping remains mechanical.
`tsc --noEmit` stays the type gate (Bun does not type-check).

## Why

The feedback loop is the product of this foundation, and Bun removes latency from every single
iteration of it: no build step, the fastest spawn, and a test runner that starts as fast as the
runtime. The ubiquity tradeoff is real but bounded — we pay it mostly at provisioning time, and
[0002](0002-mise-tasks-and-pinning.md) makes provisioning a single pinned command everywhere.
Staying inside erasable TS keeps the exit cheap if the tradeoff sours.

## Consequences

- **Easy:** `bun src/cli/index.ts` runs the tool as-is; `bun test` is sub-second; one `[tools]` line
  provisions the runtime; JSON imports give a single source of truth for the version.
- **Hard / committed:** contributors and agents must think "bun", not "node/npm" (`bun install`,
  `bun x`); packages with Node-API edge cases need vetting; the test suite uses `bun:test` imports
  and would need mechanical rewriting to leave.
- **Reversible?** Moderately: erasable-only TS and the thin CLI keep a Node port mechanical
  (runtime + test-runner swap, no redesign). The store format and design entries are
  runtime-neutral.
- Forces [0002](0002-mise-tasks-and-pinning.md) (something must pin and provision `bun` itself) and
  [0003](0003-biome-code-dprint-markdown.md) (TS ships no formatter/linter).
