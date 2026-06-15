# How-Intent

The **how-intent**: durable, cross-cutting choices about *which kinds of technology* realize
Ward's concepts, and *why* — recorded so a rewrite of the implementation never loses the
decision or its rationale. It sits above the implementation plan (no sequence, no code) and
below the what-intent (it may name *kinds* of technology, which `../what/` never does). For the
layering and the separation rule, see `../README.md`.

## Conventions every how-doc follows

1. **Why, always** (`../README.md`). A *how* without its *why* is an assertion an implementer
   cannot weigh.
2. **Guardrails with counterfactuals.** Each doc says what the choice requires **and** what it
   explicitly does *not* — a constraint is defined by its boundary, not just its center.
3. **Mark the blanks.** These docs set constraints, not every detail. Each ends with **where
   the implementer fills in the blanks** within the guardrails — that section fixes the focus
   areas, not the answers, so it lists the blanks and stops. (`context-loading.md` is the
   canonical example: it fixes the constraints on context assembly and leaves the exact
   ordering algorithm open.)

## Relationship to the seams

`../what/07-subsystem-seams.md` names eight seams as contracts, and **every seam has a how-doc
behind it**. Some how-intent cuts across seams and stands alone — context loading, lifecycle
hooks, and reflection (a major mechanism, though not itself a seam).

## Contents

| File | Durable choice it records | Seam(s) |
|------|---------------------------|---------|
| `metadata-and-schemas.md` | Filesystem store; markdown + typed front matter; document types; runtime-validated schemas; code-as-config-shape; concurrency by append/single-writer/atomic | Metadata store |
| `context-loading.md` | Harness-/model-neutral context via `AGENTS.md` hierarchy; per-scope working directory; deterministic, append-oriented context for token-cache sharing; harness-handle tracking | Harness, multiplexer, store |
| `multiplexer.md` | Terminal multiplexer hosts running sessions as a cache over the record; grouped, labeled, themeable | Session multiplexer |
| `harness.md` | Pluggable harness behind a thin adapter; harness handle; optional session fork; model passed through | Agent harness |
| `model-selection.md` | Per-scope override hierarchy; persona-driven fast-vs-deep defaults; model ids as configuration | Model selection |
| `messaging-dispatch-wake.md` | Opinionated dispatch / report / wake; idempotent, identity-addressed, recorded-not-live; wakes re-armed on recovery | Messaging & coordination, multiplexer |
| `remote-provider.md` | Hosted git forge behind a thin adapter; remote link as attribute; privacy translation enforced upstream; outward posts gated | Remote work-item provider |
| `theming.md` | Deterministic, collision-free per-work accent identity; coordinated across surfaces; applied via idempotent hooks | Visual theming |
| `lifecycle-hooks.md` | Customizable, idempotent setup/teardown hooks validated on resume; workspace-owned and evolvable | Theming, workflow |
| `workflow-policy.md` | Opinionated-but-evolvable workflow encoded as a workspace-owned skill; reconciliation on upgrade | (workflow) |
| `cli-and-telemetry.md` | Noun/verb CLI; thin mnemonic shell layer; human-default caller identity; local usage telemetry | Human shell |
| `reflection.md` | Evolvable, goal-directed, map-reduce reflection with per-goal cursors; asynchronous proposals | Cross-cutting (store, harness, workflow) |

## What does *not* belong here

*What*-statements (concepts, invariants) live in `../what/`; exact libraries, paths, field
names, CLI flags, and wire formats live in the plan and the code. A how-doc may *illustrate*
with an example, but the example is never the contract.
