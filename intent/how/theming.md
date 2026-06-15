# How-Intent: Visual Theming & Identity Coordination

Durable choices behind the **visual theming / identity coordination** seam
(`../what/07-subsystem-seams.md`); the *what* lives in the seam contract there. This records how
that visual identity is assigned and applied.

## Choice: a deterministic, collision-free accent identity per unit of work

Each unit of work is given a **stable visual identity** — the working assumption is an **accent
color** — assigned **deterministically** from the work's identity (`../what/02-domain-model.md`)
and **without collisions** among the things a human sees at once.

**Why deterministic.** The same work should always look the same, across reboots and across
machines-of-the-moment, so the human builds muscle memory ("the blue one is `A3`"). A random or
session-order assignment would re-color work on every restart and defeat that memory — the same
reasoning as deterministic context (`../what/01-principles.md` §12), applied to perception.

**Why collision-free.** The identity exists to **distinguish**; two concurrent rooms sharing a
color is the one failure that makes it useless. Collisions need only be avoided among what is
visible together (real cardinality, `../what/02-domain-model.md`), not globally.

## Choice: the identity is applied across *every* surface, coordinated

The accent is applied **consistently across all of a human's surfaces** for that work — the
multiplexer's status/borders (`multiplexer.md`), an editor window opened on the same worktree,
and any other window the human touches for it.

**Why coordinated.** A visual cue that holds in one surface but not another re-introduces exactly
the "which window is this?" friction it exists to remove. The value is realized only when the cue
is the same everywhere the human looks.

## Choice: theming a worktree is an idempotent setup hook

Applying a work item's theme is one of the **idempotent lifecycle setup hooks**
(`lifecycle-hooks.md`): creating a worktree applies its accent; tearing it down removes generated
theme state; re-running on resume converges without duplicating.

**Why a hook.** Theming is per-workspace taste and toolchain-specific (which editor, which
multiplexer), so it belongs in the workspace's evolvable hooks, not hard-coded — and it inherits
the idempotency every hook requires.

## Guardrails — what this is, and what it is not

- **Is:** a deterministic, collision-free, per-work visual identity, applied and torn down through
  idempotent hooks, coordinated across every surface the human uses.
- **Is not:** decoration. The accent is a **functional** navigation aid, not a cosmetic
  preference; it serves the human audience (`../what/01-principles.md` §8).
- **Is not:** a commitment to color specifically, or to particular surfaces. The contract is a
  *stable, distinguishable, coordinated* identity; the medium (color, glyph, label) and the set of
  surfaces may change.
- **Is not:** relevant to the agent audience or to remote artifacts — it is a local, human-facing
  cue and never crosses the privacy boundary.

## For the implementation plan — where to fill in the blanks

Within the guardrails: the palette and the deterministic assignment function (and its
collision-avoidance scope); which surfaces are themed and how each is driven; the exact setup and
teardown hook steps; and how the accent is recorded so it stays stable across resumes.
