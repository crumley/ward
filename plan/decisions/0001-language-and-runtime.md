# 0001 — Language & runtime: TypeScript on Node, run by type-stripping

> **Status:** accepted · **Date:** 2026-07-03

## Context

Ward is a **CLI** that must be delightful for humans and deterministic for agents
([`human-shell`](../../intent/02-subsystems/07-human-shell.md)), orchestrate git and agent harnesses
([`agent-harness`](../../intent/02-subsystems/03-agent-harness.md)), and treat its store as typed,
runtime-validated documents ([`metadata-store`](../../intent/02-subsystems/00-metadata-store.md)).
The intent is language-agnostic; the build must pick one. v1 (`build/v1`) shipped on TypeScript/Node
and the choice held up — this ADR re-decides it on its merits for v2, not by inheritance.

## Options considered

- **TypeScript on Node (type-stripping, no build step).** Best-in-class libraries for CLIs, YAML,
  and schema validation; static types serve the "two audiences" bar directly; Node ≥24 runs `.ts`
  natively (strip types, no emit), so there is no compile step between edit and run — the tight
  write→run→fix loop CONTRIBUTING.md demands. Cost: types are erased, not enforced at runtime (we
  buy runtime safety back with Zod, [0003](0003-zod-schemas.md)); must stay within erasable syntax.
- **Go.** Single static binary, `gofmt` settles formatting for free, excellent for a CLI. Cost:
  heavier schema-validation story, more ceremony for the document/front-matter modeling, and a
  compile step in the loop; a larger rewrite distance from v1's validated shape with no new
  capability for _this_ build.
- **Rust.** Strongest correctness and the single-binary ideal (our Markdown tools are Rust). Cost:
  compile times and borrow-checker friction tax the fast-iteration bar hardest, for a program that
  is I/O-bound orchestration, not compute.

## Decision

**TypeScript on Node ≥24 (dev on 26), executed by native type-stripping — no build step.** Erasable
syntax only: no `enum`, no parameter properties, no `namespace`; explicit `.ts` import extensions.

## Why

Ward's hot path is orchestration and document I/O, where the ecosystem (Commander, `yaml`, Zod) is
strongest and the edit→run loop is shortest. The prime directive is context management, and the tool
that removes a build step removes latency from every iteration a contributor (human or agent) spends
— the fast-feedback quality bar is itself a form of attention economy. Static types make the store
and CLI legible to the agent audience (§8) while Zod ([0003](0003-zod-schemas.md)) enforces them at
the one place types are erased: the filesystem boundary.

## Consequences

- **Easy:** no compile step; run any file with `node file.ts`; rich CLI/YAML/schema libraries; a
  short rewrite distance from v1's validated layout.
- **Hard / committed:** must stay within erasable syntax — enforced mechanically by
  `verbatimModuleSyntax` + `erasableSyntaxOnly` in [`tsconfig.json`](../../tsconfig.json), so a
  non-erasable construct fails `make check` rather than at runtime. Type erasure means runtime
  validation is non-optional (Zod).
- **Reversible?** Moderately. The seam boundaries ([`design/`](../../design/)) are language-neutral
  contracts; a port would rewrite `src/` but not the intent or the on-disk store format.
- Forces [0002](0002-execution-and-test-runner.md) (runner), [0003](0003-zod-schemas.md) (schemas),
  and [0007](0007-biome-format-and-lint.md) (a formatter+linter, since TS — unlike `gofmt` — ships
  none).
