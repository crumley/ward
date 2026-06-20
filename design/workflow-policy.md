# Design: Workflow Policy as an Evolvable Skill

> **Layer:** design — implementation plan. The *how*; may change. **Status:** draft.

The build behind workflow policy — how the opinionated-but-evolvable rules are encoded and
reconciled.

## Serves intent

- [`../intent/01-concepts/03-work-lifecycle.md`](../intent/01-concepts/03-work-lifecycle.md) —
  opinionated defaults, workspace-owned and evolvable, reconciled (not clobbered) on upgrade;
  never-merge-to-main is a hard invariant the policy works *within*.

## Plan (draft)

- **Encoding.** Working assumption: a **workspace-owned skill** (agent-readable, versionable,
  loaded into session context so it governs behavior). *Bound:* "workspace-owned, evolvable,
  reconciled" is durable; skill-vs-config is the open choice.
- **The default policy content** Ward injects at workspace creation.
- **Divergence detection** — hashes, version stamps, or semantic diff against the installed
  default.
- **The reconciliation UX** — the agent-guided flow that folds new defaults into a customized
  policy. This pattern generalizes to anything Ward ships (hooks, personas, scaffolding,
  reflection routines).
