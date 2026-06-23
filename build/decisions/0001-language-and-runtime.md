# 0001 — Language & runtime: TypeScript on Node.js (native type-stripping)

> **Status:** accepted · **Date:** 2026-06-22

## Context

Ward must produce a **real, runnable CLI** (build constraint) whose store is **markdown + typed,
runtime-validated front matter** ([metadata-store](../../intent/02-subsystems/00-metadata-store.md))
and that is **model- and harness-agnostic by construction**
([principles §5](../../intent/00-foundation/01-principles.md)). The toolchain is deliberately
unconstrained — choosing it is part of the exercise.

The dominant forces:

1. **Runtime-validated typed documents.** The store contract demands documents that are "strongly
   typed and runtime-validated." Whatever language we pick must make _one_ schema definition yield
   _both_ a static type and a runtime validator, or the two drift.
2. **Harness ecosystem.** Ward orchestrates agent harnesses (Claude Code, etc.), which are
   overwhelmingly Node CLIs. The harness adapter
   ([agent-harness](../../intent/02-subsystems/03-agent-harness.md)) spawns and resumes these;
   living in their ecosystem keeps the adapter thin.
3. **Two audiences.** Every output serves a human (pretty text) and an agent (deterministic,
   parseable) ([§8](../../intent/00-foundation/01-principles.md)). Trivial JSON ⇄ object mapping
   matters.
4. **Speed to a first working version.** The prime directive of this build is the smallest thing
   that truly works end-to-end; a fast iteration loop beats raw runtime performance for a personal,
   local CLI.

## Options considered

- **TypeScript on Node.js.** Best-in-class runtime-validation story (Zod, see
  [0003](0003-zod-schemas.md)), native to the harness ecosystem, frictionless JSON for the agent
  audience, huge CLI library surface. Tradeoff: historically needed a build step and a runner
  (`tsc`/`tsx`/`ts-node`) — but Node ≥23 strips type annotations natively (verified here on Node
  26.0.0: `node file.ts` runs, `node --test file.test.ts` tests), erasing that cost. Per-invocation
  startup is ~tens of ms (acceptable for a human-driven CLI), not microseconds.
- **Python with Pydantic.** Pydantic is an equally strong runtime-validation story (the type _is_
  the validator), Typer/Click are excellent CLIs, mature front-matter libs. Tradeoff: further from
  the harness ecosystem (more subprocess/marshalling friction wrapping Node-based harnesses);
  dependency/venv management is heavier than `npm`; the human/agent JSON duality is slightly less
  ergonomic than TS objects.
- **Go.** Single static binary (great distribution), fast, Cobra is a superb noun/verb CLI.
  Tradeoff: runtime schema validation is manual and verbose (struct tags + a validator lib, no
  single-source type⇄validator); markdown/front-matter manipulation for "two audiences" is more
  boilerplate; slower to reach a working MVP.
- **Rust.** Single binary, fast, `serde` + `clap` are excellent. Tradeoff: highest time-to-MVP;
  overkill for a personal, local, I/O-bound CLI whose bottleneck is human attention, not CPU.

## Decision

**TypeScript, run on Node.js (≥24; developed on 26) using the runtime's native type-stripping** — no
separate compile/bundle step for execution.

## Why

- The store's central constraint — _typed **and** runtime-validated_ documents — is satisfied most
  directly in TS via Zod ([0003](0003-zod-schemas.md)): a single `z.object({...})` is _both_ the
  runtime validator and (via `z.infer`) the static type. One definition, both guarantees — exactly
  what [the metadata-store seam](../../intent/02-subsystems/00-metadata-store.md) asks for, with no
  drift between "what the type says" and "what is checked at the boundary."
- **Harness-agnosticism is easiest to honor from inside the harness ecosystem** (§5). The agents
  Ward coordinates are Node processes; a Node Ward spawns, env-propagates to, and resumes them with
  the least impedance, keeping the adapter "thin" as the seam requires.
- **Two audiences** (§8) is nearly free: the same in-memory object serializes to `--json` for agents
  and to themed text for humans.
- Native type-stripping removes the one historic reason _not_ to pick TS for a CLI (build/runner
  ceremony), which serves the prime directive of this build: fast iteration, less machinery. It also
  serves context economy ([§12](../../intent/00-foundation/01-principles.md)) for _us_, the builders
  — fewer moving parts to hold in context across loop iterations.

## Consequences

- **Easy:** runtime-validated documents; JSON for agents; wrapping Node harnesses; rapid iteration
  with zero build step (`node src/cli/index.ts …`).
- **Hard / committed-to:** we must write **erasable-only** TypeScript (no `enum`, no parameter
  properties, no `namespace` runtime constructs), enforced by `erasableSyntaxOnly` +
  `verbatimModuleSyntax` in `tsconfig` ([0002](0002-execution-and-test-runner.md)). Imports carry
  explicit `.ts` extensions. Type _checking_ is a separate gate (`tsc --noEmit`), since stripping
  does not type-check.
- **Distribution:** shipping later as a single binary (`node --experimental-sea`, `bun build`, or a
  `pkg`-style tool) is a deferred, reversible follow-on; v1 runs from source, which is fine for a
  local personal tool and for dogfooding.
- **Reversibility:** medium. The store format (markdown + YAML front matter) is language-neutral by
  design, so a future re-host in another language reads the same workspace. The CLI surface and seam
  adapters would be rewritten, but the durable artifact — the on-disk workspace — ports.
