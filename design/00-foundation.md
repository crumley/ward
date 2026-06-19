# Design: Foundation (global architecture)

> **Layer:** design — one realization. Names tools/structures; may change; moves with `../src/`
>
> - `../test/`. **Status:** placeholder — to be filled during implementation.

## Governed by

`../intent/00-foundation/` (vision + principles) — the global constraints every design choice here
must satisfy.

## Realization (to fill)

The cross-cutting architecture decisions that aren't owned by a single subsystem:

- **Language & schema approach** — working assumption: a typed language with a runtime-validating
  schema layer (e.g. TypeScript + a Zod-style layer), so one definition yields compile-time types
  and runtime validation. _(Constraint — "strongly typed and runtime-validated" — is intent; the
  language is design.)_
- **The four-leg repo layout** — `intent` / `design` / `src` / `test`, and the module layout under
  `src/` (mirror the subsystems + concept mechanisms).
- **Cross-cutting conventions** — naming, error handling, logging, config-as-typed-interface.

## Blanks to settle

- See `blanks-register.md` (language/schema library; `src/` module layout).
