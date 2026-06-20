# Subsystem: Visual Theming & Identity Coordination

> **Layer:** intent · subsystem (seam). The contract any design must honor; the *how* is planned in [`../../design/`](../../design/). **Status:** living.

## Responsibility

Give each unit of work a **consistent visual identity** so a human can tell at a glance which
task/room a window belongs to — coordinated across *all* surfaces.

## Constraints any design must honor

- **Assign a stable, distinguishable visual identity** (working assumption: an **accent color**)
  **deterministically** from the work's identity
  ([`../01-concepts/00-domain-model.md`](../01-concepts/00-domain-model.md)), and **without
  collisions** among the things a human sees at once. *Why deterministic:* the same work should
  always look the same across reboots and machines, so the human builds muscle memory ("the blue
  one is `4A12`"); a random or session-order assignment would re-color on every restart. *Why
  collision-free:* the identity exists to **distinguish** — two concurrent rooms sharing a color
  is the one failure that makes it useless; collisions need only be avoided among what is visible
  together.
- **Apply it consistently across every surface** the human uses for that work — the multiplexer's
  status/borders ([`01-session-multiplexer.md`](01-session-multiplexer.md)), an editor window on
  the same worktree, any other window. *Why coordinated:* a cue that holds in one surface but not
  another re-introduces the "which window is this?" friction it exists to remove.
- **Applying/removing a theme is one of the idempotent lifecycle hooks**
  ([`../01-concepts/03-work-lifecycle.md`](../01-concepts/03-work-lifecycle.md)): creating a
  worktree applies its accent, teardown removes generated theme state, re-running on resume
  converges without duplicating.

## What this is NOT

- **Not decoration.** The accent is a **functional** navigation aid for the human audience (§8),
  not a cosmetic preference.
- **Not a commitment to color specifically, or to particular surfaces.** The contract is a
  *stable, distinguishable, coordinated* identity; the medium (color, glyph, label) and the set
  of surfaces may change.
- **Not relevant to the agent audience or to remote artifacts** — a local, human-facing cue that
  never crosses the privacy boundary.

## Canonical home for

- The **theming contract**: a deterministic, collision-free, per-work visual identity, applied
  and torn down through idempotent hooks, coordinated across every surface.

## Left to implementation

- The palette and the deterministic assignment function (and its collision-avoidance scope);
  which surfaces are themed and how each is driven; the exact setup/teardown hook steps; how the
  accent is recorded so it stays stable across resumes. Planned in
  [`../../design/theming.md`](../../design/theming.md).

## Open questions

- None specific to the seam.
