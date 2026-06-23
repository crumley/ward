# Design: Human Shell — CLI & Telemetry

> **Serves intent:** [human-shell seam](../intent/02-subsystems/07-human-shell.md); two audiences
> [§8](../intent/00-foundation/01-principles.md).

## Realization (`src/cli/`)

- **Noun/verb tree** (`cli/index.ts`, Commander —
  [ADR 0005](../build/decisions/0005-cli-framework-commander.md)): nouns are domain concepts
  (`workspace`/`init`, `repo`, `project`, `task`, `worktree`, `room`, `session`, `pr`, `wake`) and
  verbs are operations (`open`, `close`, `resume`, `create`, `dispatch`, `report`, `merge`,
  `recover`…). **All behavior lives in `domain/` + `seams/`**; the CLI only resolves a workspace,
  calls one function, and renders — so the core is testable without the CLI (the intent tests call
  `domain/` directly).
- **Two audiences** (`cli/output.ts`): every command renders themed human text by default or
  deterministic JSON. One in-memory result, two renderings (§8).
- **Caller identity** (`cli/context.ts`): the **human is the default** caller and declares nothing;
  an **agent** caller is detected by an ambient env signal (`WARD_AGENT` / `WARD_PERSONA` +
  `WARD_SCOPE` / `WARD_CWD`) Ward would set when it starts an agent, and gets **deterministic JSON**
  with no interactive prompt.

## What is deferred (v1 scope)

- **Interactive resolution & autocomplete** of missing/ambiguous nouns (the delightful human picker,
  with accent+glyph cues). v1 resolves explicit arguments and errors helpfully; the picker is a
  human-audience layer over the same domain calls — deferred per v1-scope. The theming attributes it
  would use (`theme.accent`, `theme.glyph`) are already recorded and nameable, so an agent can
  already resolve "the blue one" from the record.
- **Usage telemetry** (per-invocation persona/scope/cwd/human-or-agent, local-only, analyzed by a
  reflection type). Not recorded in v1; the caller-identity plumbing that would feed it exists.
- **Mnemonic alias set** — deferred (expected to churn from telemetry).

## Open / deferred

- Caller-identity enforcement: pin exactly which agent-context fields are _required_ vs. inferred.
- Telemetry storage format + whether its analysis is a dedicated reflection type
  ([human-shell open questions](../intent/02-subsystems/07-human-shell.md)).
