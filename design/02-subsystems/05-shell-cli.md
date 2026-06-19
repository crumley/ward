# Design: Human Shell / CLI & Telemetry

> **Layer:** design — one realization. Names tools/structures; may change. **Status:** placeholder —
> to be filled during implementation.

## Governed by

`../../intent/02-subsystems/05-shell-cli.md` — a thin shell over the Ward core, noun/verb structure,
human-default caller identity, usage telemetry.

## Realization (to fill)

- The exact **command tree** and naming (nouns/verbs); the initial **alias bindings** (mnemonic
  shorthands).
- The **caller-identity signal** — the env-var name and the context fields it carries (which
  required vs. inferred), propagated to subprocesses (🔴 spine).
- The **telemetry** storage format/fields and the analysis loop (is it a reflection type?).

## Blanks to settle

- See `../blanks-register.md` (command tree; aliases; caller-identity signal; telemetry
  format/analysis).
