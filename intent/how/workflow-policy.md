# How-Intent: Workflow Policy as an Evolvable Skill

Durable choice for *how* Ward's opinionated workflow rules (`../what/05-work-lifecycle.md`) are
encoded so they are **opinionated at creation yet evolvable over time**, rather than baked into
the tooling.

## The problem this solves

Ward has opinions about how work should flow: branch from main, commit at a certain
granularity, when to amend, submit a PR, **never merge to main directly**. A new workspace
should get these for free. But the right workflow drifts with the human and the kind of work,
so the opinions must be **changeable by the workspace without changing Ward**. Hard-coding the
rules in the CLI would mean every customization requires forking Ward.

## Choice: the workflow policy is a workspace-owned skill

The workflow policy is encoded as a **skill that lives inside the workspace** — a durable,
agent-readable artifact (`metadata-and-schemas.md`), not logic compiled into the binary.

- **Injected at creation.** Ward installs its default workflow-policy skill when it creates a
  workspace, so the workspace is immediately productive with sensible, opinionated rules.
- **Owned by the workspace thereafter.** The workspace's own agents and sessions may **evolve**
  the skill as the team learns what fits (the teaching/reflection loop applied to process,
  `../what/06-reflection-and-evolution.md`).
- **Read by working sessions.** Sessions load the policy as part of their context
  (`context-loading.md`), so the rules actually govern behavior rather than sitting as
  documentation.

**Why a skill (vs. a config file or hard-coded logic).** A skill is agent-facing,
human-readable, versionable, and evolvable in place — exactly the properties a living policy
needs. It also unifies the mechanism: policy is "just another skill," so the same evolution and
reconciliation machinery applies.

## Choice: reconcile on upgrade rather than clobber

Because the workspace may have customized the policy, Ward's update/migration cycle
(`../what/06-reflection-and-evolution.md`) treats it carefully:

1. **Detect.** Compare the workspace's workflow-policy skill against the version Ward originally
   installed.
2. **If unchanged**, update it directly to the new default.
3. **If diverged**, **do not clobber.** Flag the divergence and offer a **reconciliation
   process**: an agent that walks the human through what changed in Ward's defaults and asks
   whether and how those changes should fold into the customized policy.

**Why.** An evolvable policy is pointless if an upgrade silently overwrites local changes.
Reconciliation keeps the human in control of their own workflow while still offering Ward's
improvements.

## This pattern generalizes

"Opinionated default → encoded in the workspace as an evolvable artifact → reconciled on
upgrade" is the **general shape for anything Ward ships into a workspace** — skills, personas,
lifecycle hooks (`lifecycle-hooks.md`), scaffolding — not just commit policy. Workflow policy is
the canonical example; reuse the mechanism rather than reinventing it per artifact.

## Guardrails — what this is, and what it is not

- **Is:** an injected, workspace-owned, evolvable, reconciled-on-upgrade encoding of the
  workflow opinions, loaded into session context so it actually governs behavior.
- **Is not:** a relaxation of the cardinal rule. The **never-merge-to-main** rule
  (`../what/05-work-lifecycle.md`) is a hard invariant; the policy skill expresses *how* the
  team works within it, not whether the rule applies.
- **Is not:** necessarily *only* a skill — confirming skill vs. a dedicated config document is
  open (`../what/08-open-questions.md`). What is durable is "workspace-owned, evolvable,
  reconciled," not the exact artifact kind.

## For the implementation plan — where to fill in the blanks

Within the guardrails: the exact content of the default policy; the skill's format and location;
how divergence is detected (hashes, version stamps, semantic diff); and the reconciliation UX.
These are the focus areas.
