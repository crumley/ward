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
- **The caller-identity signal (settle-early).** The specific **environment-variable name** and
  the **set of context fields** it carries (persona, scope, working directory — which required vs.
  inferred), set when Ward starts an agent and **propagated to subprocesses**. *Bound:* absence =
  human (no ceremony); presence = agent (context required).
- **The initial alias bindings** — a thin shell-alias layer (working assumption: a fish alias
  file) of mnemonic shorthands, expected to churn as telemetry reveals real usage.
- **Telemetry storage format and fields**, and the **analysis loop** — likely a reflection type
  ([`reflection.md`](reflection.md)). *Bound:* telemetry is local and never leaves the workspace.
