# 0044 — Spec-feedback

> Intent frictions found while adding the pi coding agent as a second harness.

This file is the entry's adjudication surface and is read on its own — an adjudication session loads
it without the entry's README, so each SF carries enough context to be ruled on directly.

## SF-001 — a thinking-depth value is not portable across harnesses

- **Slice:**
  [`intent/02-subsystems/04-model-selection.md`](../../intent/02-subsystems/04-model-selection.md),
  "Constraints any design must honor" (_Model identifiers are configuration … passed through_) and
  "Left to implementation" (_how thinking depth is expressed_).
- **Friction:** the model-selection slice makes both the model identifier and the thinking depth
  pass-through configuration the harness owns, and leaves "how thinking depth is expressed" to
  implementation — which reads as one axis (spelling) but is two. Adding a second harness showed the
  VALUES differ, not only the flag name: Claude Code and pi accept different sets of thinking levels
  (pi's are `off, minimal, low, medium, high, xhigh, max`), and a single `agent.effort` resolved for
  a workspace is validated by neither at write time (0028 deliberately does not gate the vocabulary
  it does not own). So a workspace that sets `effort: medium` and then switches `harness` between
  two harnesses that do not share that level will pass a value one of them rejects — at launch, from
  inside the run, rather than as anything the configuration could have caught. The slice's
  pass-through posture is right; what it does not say is that a passed-through value is bound to the
  harness it was written for, and that switching harness may invalidate it.
- **Assumption made to keep moving:** `agent.effort` (and `agent.model`) are values written for the
  harness in force, passed through verbatim; when the harness changes, the human re-checks them, and
  an invalid value surfaces as the harness's own launch error — the same place an unknown model id
  would. Ward adds no cross-harness validation and no translation table, exactly as 0028 reasoned
  for model ids.
- **Proposed revision:** one clause under _Model identifiers are configuration_ (extended to
  thinking depth): "a passed-through model or thinking-depth value is **bound to the harness it was
  written for**; changing the harness may make a previously valid value invalid, surfaced by the
  harness at launch, and Ward neither translates nor gates it." No behaviour change is implied —
  only that the intent name the binding it already relies on.
- **Status:** pending.

## SF-002 — harness selection is named "per scope" but resolves only at the workspace axis

- **Slice:**
  [`intent/02-subsystems/03-agent-harness.md`](../../intent/02-subsystems/03-agent-harness.md),
  "Constraints any design must honor" (_Be selectable per scope (default per workspace, overridable
  per scope)_).
- **Friction:** the seam says the harness is "selectable per scope … overridable per scope", echoing
  the model-selection ladder that reaches user/machine → workspace → project → task → room/session.
  In practice `agent.harness` resolves only on the two axes 0028 built — global and workspace — as
  `model` and `effort` do; there is no project-, task-, or room-level override for any of them. This
  entry does not change that (it is a pre-existing bound of the configuration, not of the harness
  seam), but adding a second harness makes the gap concrete: "run this one task on pi" is exactly
  the per-scope selection the seam's words promise and the resolution does not yet offer.
- **Assumption made to keep moving:** "selectable per scope" is satisfied, for now, at the two axes
  the configuration resolves on; extending harness (and model, and effort) selection down the scope
  ladder is a separate change to the resolution mechanism, not to any adapter, and nothing regresses
  by deferring it.
- **Proposed revision:** none to the harness slice itself — the constraint is correct as an
  aspiration. If anything, a one-line note where the two axes are defined
  ([`07-human-shell.md`](../../intent/02-subsystems/07-human-shell.md)) that the per-scope ladder
  below the workspace is not yet built would keep the promise honest. Raised for the record; likely
  resolved by a future entry that widens resolution rather than by an intent edit here.
- **Status:** pending.
