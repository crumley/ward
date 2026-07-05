# 0004 — CLI surface: optique for argument parsing, picocolors for terminal color

> **Status:** accepted · **Date:** 2026-07-05

One ADR for the two libraries that together shape every `ward` invocation's first and last
milliseconds. Made for [`design/0001-dev-foundation/`](../0001-dev-foundation/README.md).

## Context

The [human-shell seam](../../intent/02-subsystems/07-human-shell.md) requires a noun/verb CLI that
serves two audiences — delightful for humans, deterministic for agents — and the
[theming seam](../../intent/02-subsystems/05-visual-theming.md) will eventually paint identity cues
into terminal output. The foundation entry needs only `--version`, but the parser chosen here is the
one the real command tree will grow inside, so it is decided deliberately now.

## Options considered

**Parsing:**

- **optique** (<https://github.com/dahlia/optique>; `@optique/core` + `@optique/run`). Type-safe
  **parser combinators**: the CLI's shape is a value composed of `object`/`or`/`option`, and the
  result type is **inferred** — an impossible flag combination is a type error, not a runtime
  surprise ("parse, don't validate"). Runtime-agnostic core, Bun-native runner, built-in
  help/version machinery. Honest costs: **young** (1.x, one primary author, small community); a
  combinator style agents and humans know less well than commander's imperative API; fewer worked
  examples to crib from; the help/error formatting conventions are optique's, not ours.
- **commander.** The incumbent (both prior build experiments used it): ubiquitous, every agent knows
  it, battle-tested. Costs: stringly-typed results (`opts()` returns `any`-shaped data needing hand
  validation — the exact class of bug types should kill); action-callback style scatters behavior;
  the two-audiences contract would be enforced by discipline, not by types.
- **yargs / citty / clipanion.** Respectively: powerful but heavyweight and `any`-prone; light but
  young _and_ less type-safe than optique; type-safe but class-based and Yarn-flavored. None beats
  optique on the type-safety axis that matters here or commander on ubiquity.

**Color:**

- **picocolors.** ~7 KB, zero dependencies, the fastest to load of the family, `NO_COLOR`/TTY
  detection built in. Costs: minimal API — no nested styling niceties, no 256-color/truecolor
  helpers (the theming seam may eventually outgrow it).
- **chalk.** Richest API, huge adoption. Costs: heavier and slower to load for features the
  foundation does not use; chalk v5 is ESM-only-with-history that has bitten the ecosystem before.
- **ansis / kleur.** Same niche as picocolors; neither offers enough over it to justify not taking
  the smallest one.
- **None (raw escapes).** Zero deps, but hand-rolling `NO_COLOR`/TTY handling is exactly the
  boilerplate a 7 KB dependency erases.

## Decision

**optique** (`@optique/core` + `@optique/run`) parses; **picocolors** colors. The version is read
from `package.json` (single source of truth) and rendered through picocolors in
[`src/cli/index.ts`](../../src/cli/index.ts).

## Why

The human-shell contract is a _typed_ interface between two audiences, and optique is the only
candidate that makes the CLI's shape a checked type rather than a convention — on a greenfield
foundation, that compounds; commander's ubiquity mattered more when agents had to guess, less now
that the pattern is established in-repo by working code. picocolors is the smallest tool that fully
solves today's color need in a process whose startup time we optimize for
([0001](0001-bun-typescript.md)).

## Consequences

- **Easy:** adding a flag/subcommand is composing a value and the result type follows; help text is
  generated; color respects `NO_COLOR` and pipes for free.
- **Hard / committed:** contributors (and agents) learn combinator style from the in-repo example;
  we track a young library's releases — pinned via `bun.lock`, upgraded deliberately.
- **Reversible?** The CLI layer is deliberately thin (all real logic must live below it, per the
  human-shell contract), so swapping either library is contained to `src/cli/`; picocolors in
  particular is a drop-in swap. If optique stalls as the command tree grows, a later ADR supersedes
  this one with the exit documented.
