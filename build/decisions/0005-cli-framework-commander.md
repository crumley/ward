# 0005 — CLI framework: Commander

> **Status:** accepted · **Date:** 2026-06-22

## Context

The [human-shell seam](../../intent/02-subsystems/07-human-shell.md) fixes the shape of the CLI:
"organized around **nouns and verbs** — nouns are the domain concepts (workspace, project, task,
worktree, room, session, repo), verbs are the operations (create, list, open, close, resume,
dispatch…)." It must keep "all real logic in the Ward tool" (the framework is plumbing only), serve
**two audiences** (`--json` for agents, themed text for humans, §8), and leave room for the
human-only **interactive resolution / autocomplete** affordance later. Importantly, the seam also
says the human is the **default** caller and agents **declare** themselves via an ambient signal —
so the framework must not _force_ interactivity into the core.

## Options considered

- **Commander.** Mature, tiny, dependency-light; subcommands model noun→verb cleanly
  (`ward project open …`); easy custom output (we own rendering, so two-audience formatting is ours,
  not the framework's). Tradeoff: no built-in prompt/autocomplete UX — but that is correct here: the
  seam wants interactivity as a _separable human affordance_, not baked into argument parsing, so
  keeping it out of the framework is a feature.
- **oclif.** Batteries-included (plugins, generators, help, autocomplete). Tradeoff: heavier,
  opinion- ated project structure and a plugin runtime we don't need for a single local binary; more
  to hold in context.
- **yargs.** Powerful, flexible. Tradeoff: middleware/config surface is larger than a noun/verb tree
  needs; ergonomics for deeply nested subcommands are clunkier than Commander's.
- **Hand-rolled `process.argv` parser.** Zero deps, total control. Tradeoff: re-implements help,
  error reporting, option parsing, and nested subcommand dispatch — plumbing the seam explicitly
  says should be thin, not absent.

## Decision

**Commander**, structured as one top-level program with a subcommand per **noun**, each noun owning
its **verbs**. The framework does parsing/help/dispatch only; **all behavior lives in `src/domain`
and `src/store`**, and **all rendering** goes through a single `cli/output` module that branches on
the caller audience (human text vs. `--json`).

## Why

- It matches the seam's mandated structure (noun/verb) with the least framework surface, honoring
  "this layer only plumbs to [the core]." The domain logic stays free of CLI concerns and therefore
  testable without the CLI (the intent tests call the domain directly).
- Keeping prompts/autocomplete _out_ of the parser is the right factoring for the seam's asymmetry
  (§8): a declared **agent** caller must get deterministic results with **no blocking prompt**,
  while the **human** interactive picker is a separable layer we can add over the same domain calls.
  A framework that interleaves prompting with parsing would fight that asymmetry.
- Small and stable means little to re-learn on cold resume across loop iterations (context economy
  for the builder).

## Consequences

- **Easy:** add a verb = add a subcommand that calls one domain function and renders via `output`;
  the noun/verb tree stays legible as it grows.
- **Hard / committed-to:** we own the two-audience rendering and (later) the interactive resolution
  UX rather than getting them from the framework — deliberate, per the seam.
- **Reversibility:** high. Commander touches only `src/cli`; the domain/store know nothing about it,
  so swapping to oclif/yargs (or adding a TUI) is a `src/cli` rewrite against an unchanged core.
