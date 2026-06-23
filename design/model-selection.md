# Design: Model Selection

> **Serves intent:** [model-selection seam](../intent/02-subsystems/04-model-selection.md);
> [scopes-and-personas](../intent/01-concepts/01-scopes-and-personas.md) (defaults follow the
> persona's job).

## Realization (v1, partial)

- **Tiers, not model ids, in the concepts.** Personas carry a `modelTier` (`fast` | `deep`,
  `domain/personas.ts`); the **concrete ids** live in `workspace.modelDefaults` (a value that tracks
  the best models over time), never in the concepts (§5). v1 seeds placeholder ids (`fast-default` /
  `deep-default`) meant to be edited.
- **Defaults follow the persona's job** — status/routing personas (house supervisor, charge nurse)
  default to `fast`; reasoning/hands-on personas (attending, resident, medical student) to `deep`.
  When a session opens, its persona's tier resolves to the id via `modelDefaults`, recorded on the
  session-open event and passed to the harness (`seams/harness.start`), which only **honors** the
  choice.

## What is deferred (v1 scope)

- **The per-scope override hierarchy** (workspace → project → task → room, narrower wins). v1
  resolves the tier from the persona only; explicit per-scope overrides are not yet read. The
  durable part — the fast-vs-deep intent and tier-from-persona — is in place; layering overrides is
  additive.
- **Thinking-depth** as a separate knob from model id.

## Open / deferred

- The exact config shape for overrides and how an override at one scope resolves against broader
  defaults; how thinking depth is expressed (design decisions, not unsettled intent).
