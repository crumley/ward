# Design: Workflow Policy

> **Serves intent:** [work-lifecycle](../intent/01-concepts/03-work-lifecycle.md) (workflow policy:
> opinionated-but-evolvable); the general
> [opinionated-default → workspace-owned → reconciled-on-upgrade](../intent/01-concepts/04-reflection-and-evolution.md)
> pattern.

## v1 status: partially realized (rules enforced; not yet an evolvable artifact)

The **cardinal rule — never merge to main directly** — is enforced in v1: work happens only on a
worktree branch (`domain/worktree.ts`), and reaching main is gated behind `pr merge` with explicit
authority and prior approval (`domain/remote.ts`, §18). So the _opinion_ holds and is tested
(acceptance §8: merge refused without approval and without authority).

What v1 does **not** yet do is encode the policy as a **workspace-owned, evolvable artifact** (the
intent's working assumption: a **skill** the workspace owns, installed at creation, evolvable by the
workspace's agents, and **reconciled** — not clobbered — on Ward upgrade). v1 hard-codes the rules
in the tool.

## The realization when built

Install a default workflow-policy artifact into the workspace at `ward init` (alongside the persona
cast, which v1 _does_ install as living `persona` documents — the same pattern). On a Ward
update/migration (§14), compare the workspace's policy to the shipped default: if unchanged, update
in place; if **diverged**, flag it and run the **reconciliation** process (an agent that folds new
defaults into the customized policy). This is the same opinionated-but-evolvable shape Ward applies
to personas, lifecycle hooks, and scaffolding.

## Open / deferred

- The policy **encoding home** (skill vs. dedicated config) and the reconciliation UX
  ([work-lifecycle open questions](../intent/01-concepts/03-work-lifecycle.md)).
- **Delegated authority** for gated actions — how the human empowers a scope to merge, represented
  so it cannot be silently assumed (§18).
