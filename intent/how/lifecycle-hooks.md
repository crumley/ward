# How-Intent: Lifecycle Setup/Teardown Hooks

Durable choice for *how* Ward lets a workspace **customize what happens at lifecycle
transitions** — setting up and tearing down worktrees, tasks, and other scopes — without baking
those actions into the tooling. The *what* (that these hooks exist and must be idempotent) is in
`../what/05-work-lifecycle.md`.

## Choice: transitions expose customizable hooks

Lifecycle transitions — create a worktree, create a task, tear either down, and similar — expose
**hooks the workspace can customize**. Ward defines *when* a hook runs (the transition points);
the workspace supplies *what* it does.

Examples: on worktree creation, run the project's dev tool to install dependencies, or apply the
worktree's visual theme (`../what/07-subsystem-seams.md`, theming); on teardown, remove generated
state.

**Why hooks rather than hard-coded steps.** Setup needs differ per repository, per project, and
over time. Hard-coding "install deps" into Ward would be wrong for half of workspaces and stale
for the rest. Hooks put the workspace in control of its own environment.

## Choice: hooks must be idempotent and validate-on-resume

Every hook is required to be **idempotent**: running it when its effect is already present must
**check the state and become a no-op**, not repeat or damage the work
(`../what/01-principles.md` §6).

**Why this is the defining constraint.** Work is paused and resumed constantly. Before an
interruption a setup hook may have not run, half-run, or fully run. On resume, Ward (or the
hook itself) must be able to ask "is this already satisfied?" and converge to "done" no matter
how many times it fires. A hook that is not idempotent makes resume unsafe — which would break
the system's core promise.

## Choice: hooks are workspace-owned and evolvable, reconciled on upgrade

Hooks are encoded **in the workspace** (the same opinionated-but-evolvable pattern as workflow
policy, `workflow-policy.md`): Ward installs sensible defaults at creation, the workspace evolves
them, and on a Ward update/migration divergence is **reconciled, not clobbered**
(`../what/06-reflection-and-evolution.md`).

**Why.** Setup/teardown is exactly the kind of thing a team tunes constantly; it must evolve in
place and survive upgrades.

## Guardrails — what this is, and what it is not

- **Is:** customizable, workspace-owned, **idempotent** actions at Ward-defined transition
  points, validated as done-or-not on resume.
- **Is not:** a general event system or arbitrary plugin runtime — only the defined lifecycle
  transitions get hooks.
- **Is not:** a place for non-idempotent, fire-once side effects. If an action cannot be made
  safely repeatable, it does not belong in a hook.
- **Is not:** hard-coded into the CLI. Defaults ship, but the workspace owns and evolves them.

## For the implementation plan — where to fill in the blanks

Within the guardrails: the exact set of transition points; how a hook **declares its
satisfied-check** (exit code, marker artifact, declared probe — `../what/08-open-questions.md`);
the hook definition format and where it lives in the workspace; ordering when multiple hooks
attach to one transition; and how failures are surfaced.
