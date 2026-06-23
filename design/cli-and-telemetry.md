# Design: CLI Shape, Caller Identity, Aliases & Telemetry

> **Layer:** design — implementation plan. The *how*; may change. **Status:** draft.

The build behind the human-shell seam — the command tree, the caller-identity signal, and
telemetry.

## Serves intent

- [`../intent/02-subsystems/07-human-shell.md`](../intent/02-subsystems/07-human-shell.md) — a
  thin noun/verb CLI, human-default caller identity (agents declare context), and local usage
  telemetry feeding optimization.

## Plan (draft)

- **The exact command tree and naming** — the noun/verb surface (workspace, project, task,
  worktree, room, session, repo × create/list/open/close/resume/dispatch…).
- **The interactive resolution & autocomplete UX (delight bar).** How a verb missing a required
  noun (or given an ambiguous one) prompts a **quick picker** instead of erroring, how
  partially-typed nouns/verbs/identities **autocomplete**, and how candidates are **sourced,
  scoped, ranked, and rendered with their accent + glyph** ([`theming.md`](theming.md)) so "the
  blue one" is selectable. *Bound:* human-only — a declared agent gets deterministic handling,
  never a blocking prompt.
- **The caller-identity signal (settle-early).** The specific **environment-variable name** and
  the **set of context fields** it carries (persona, scope, working directory — which required vs.
  inferred), set when Ward starts an agent and **propagated to subprocesses**. *Bound:* absence =
  human (no ceremony); presence = agent (context required).
- **The initial alias bindings** — a thin shell-alias layer (working assumption: a fish alias
  file) of mnemonic shorthands, expected to churn as telemetry reveals real usage.
- **Telemetry storage format and fields**, and the **analysis loop** — likely a reflection type
  ([`reflection.md`](reflection.md)). *Bound:* telemetry is local and never leaves the workspace.
