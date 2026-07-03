# Design — Human shell (the CLI)

> **Serves intent:** [human-shell seam](../intent/02-subsystems/07-human-shell.md), §8 (two
> audiences). **Supersedes:** nothing.

## Decisions

- **Thin plumbing over the core** ([`src/cli/`](../src/cli/)). The CLI parses, resolves context,
  calls `domain/`, and renders — no business logic. Dependency arrows point inward (cli → domain →
  store/seams), so the core is testable without the CLI.
- **Noun → verb tree** ([`index.ts`](../src/cli/index.ts), ADR 0005, Commander): the nouns are
  project, task, worktree, room, session, pr, remote, and wake (each with verbs), plus
  workspace-level verbs `init`, `doctor`, `status`, `attach`, `reflect`, `dispatch`, `report`, and
  `messages`.
- **Two audiences** ([`output.ts`](../src/cli/output.ts)): human text by default, `--json` for a
  parseable agent view — both rendered from the same result.
- **Delightful, directory-aware DX** ([`context.ts`](../src/cli/context.ts)): the workspace is
  discovered by walking up from any cwd; scope is derived from the cwd when it sits in a worktree;
  the human declares nothing while an agent identifies itself via an ambient `WARD_*` signal;
  long-text args accept inline / `@file` / `-` (stdin).
- **`doctor`** ([`doctor.ts`](../src/cli/doctor.ts)) inspects node / git / workspace. **Verbs read
  true:** per-thread `session resume`, workspace-wide `attach` (not `recover`).

## What `src/` realizes it

`cli/index` (command tree) · `cli/output` (two-audience render) · `cli/context` (caller + cwd +
file-args) · `cli/doctor`.

## Proven by

`test/acceptance/walkthrough.sh` drives §0–§10 entirely through this CLI.

## Deferred

The interactive picker + autocomplete for missing/ambiguous nouns; the mnemonic alias set + usage
telemetry; global (`~`) config (v2 has workspace-local config in the workspace record).
