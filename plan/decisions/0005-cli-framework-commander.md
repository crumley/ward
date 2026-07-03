# 0005 — CLI framework: Commander, a noun→verb command tree

> **Status:** accepted · **Date:** 2026-07-03

## Context

The human shell must be a **noun/verb CLI** — nouns are the domain concepts (workspace, project,
task, worktree, room, session, repo), verbs the operations — discoverable and predictable for both
audiences, staying coherent as it grows
([`human-shell`](../../intent/02-subsystems/07-human-shell.md)). It must also support **two-audience
output** (human text vs. `--json`), **file inputs for long-text args**, **caller-identity**
detection, and stay **thin** — all real logic lives in the Ward core, not the shell.

## Options considered

- **Commander.** Mature, tiny, first-class nested subcommands (the noun→verb tree maps directly),
  per-command options, help generation, custom argument processors (for `@file`/`-` inputs). Cost:
  help/error output is plain — the _delightful_ interactive picker/autocomplete is ours to build on
  top (deferred for v2, [`scope`](../v2/scope.md)).
- **yargs.** Comparable power. Cost: heavier, a more sprawling API, weaker nested-command ergonomics
  for a strict noun→verb tree.
- **oclif.** Batteries-included (plugins, generators). Cost: a heavy framework with its own project
  structure — it would own the CLI rather than plumb to a thin core, violating "all real logic lives
  in the Ward tool."
- **Hand-rolled `process.argv` parser.** Zero deps, total control. Cost: re-implementing help,
  subcommands, and option parsing is exactly the undifferentiated work a small library removes.

## Decision

**Commander**, structuring the program as a **noun→verb tree** (`ward <noun> <verb>`). The shell
only parses, resolves ambient caller-identity + cwd scope, calls into the core, and renders the
result in the requested audience format. Long-text arguments accept an inline string, `@file`, or
`-` (stdin).

## Why

Commander's nested subcommands are a near-literal encoding of the seam's noun/verb requirement, at
the lowest dependency cost that still hands us help and parsing for free. Keeping the framework thin
protects the core's testability (the intent tests exercise `domain/`, not the CLI) and keeps the
shell swappable — the seam calls the interactive niceties "evolvable," which a thin layer over a
solid core makes cheap.

## Consequences

- **Easy:** the command tree reads like the domain; adding a verb is local; help is generated; the
  core stays CLI-free and unit-testable.
- **Hard / committed:** the delightful interactive layer (pickers, autocomplete) is **our** code
  above Commander, not a freebie — scoped out of v2 deliberately.
- **Reversible?** Yes — the shell is the thinnest leg; the command tree could move to another parser
  without touching `domain/` or the store.
