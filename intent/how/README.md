# How-Intent

This directory holds the **how-intent**: the durable, cross-cutting choices about *how*
Ward's concepts are modeled and *which kinds of technology* realize them — **and why** each
choice was made.

## Where this sits

```
what-intent   →   how-intent   →   implementation plan   →   tests + code
(../what + why)   (this dir + why)  (sequenced work)         (the system)
```

- **Above** the implementation plan: it does not sequence work or write code.
- **Below** the what-intent: it may name *kinds* of technology and modeling patterns, which
  the what-intent never does.

A how-intent doc records a **choice that should outlive any single implementation**, and the
reasoning that justifies it — so that when the implementation is rewritten, the choice and
its rationale are not lost, and a reader can tell a deliberate decision from an incidental
one.

## Conventions every how-doc follows

These conventions exist so the docs are useful to the agent (or human) who later implements
against them:

1. **Why, always.** Every choice states its reasoning. *How* without *why* is just an
   assertion, and an implementer cannot weigh a trade-off they do not understand.
2. **Guardrails with counterfactuals — what it *is*, and what it is *not*.** A constraint is
   defined more sharply by its boundary than by its center. Each doc says not only what the
   choice requires but what it explicitly does **not** require or forbid, so the implementer
   knows the room they have to move in.
3. **Mark the blanks for the implementation plan.** These docs set guardrails; they do **not**
   fill in every detail. Each doc ends by naming, explicitly, **where the implementer must
   fill in the blanks** within the guardrails — the spots where downstream design attention
   should concentrate. (`context-loading.md` is the canonical example: it fixes the
   *constraints* on context assembly and deliberately leaves the *exact ordering algorithm*
   to the implementation.)

## Relationship to the seams

`../what/07-subsystem-seams.md` names each of the eight seams as a contract, and **every seam
now has a how-doc behind it** (metadata store, session multiplexer, messaging & coordination,
agent harness, model selection, visual theming, remote work-item provider, human shell). Some
how-intent cuts across several seams and stands on its own — context loading, lifecycle hooks,
and reflection (a major mechanism, though not itself a seam).

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

*What*-statements (concepts, invariants) — those live in `../what/`. And exact libraries,
file paths, field names, CLI flags, and wire formats — those live in the implementation plan
and the code. A how-doc may *illustrate* with an example, but the example is never the
contract.
