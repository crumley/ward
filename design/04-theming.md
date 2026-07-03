# Design — Visual theming & identity

> **Serves intent:** [visual-theming seam](../intent/02-subsystems/05-visual-theming.md), §8 (two
> audiences), §4 (never crosses outward). **Supersedes:** nothing.

## Decisions

- **Two cues, recorded as nameable attributes** ([`src/seams/theming.ts`](../src/seams/theming.ts)):
  a per-**instance** accent (a named color from a small palette) and a per-**type** glyph (emoji).
- **Deterministic + collision-free.** The accent is a stable hash of the work's identity, so a
  reboot never re-colors it; `assignAccent` walks forward from that hash to avoid clashing with an
  accent already visible. A worktree records its chosen accent; a room inherits its worktree's.
- **Nameable for the agent audience** (§8): `accentByName('blue')` resolves a human's "the blue one"
  back to a concrete accent — the recorded-and-nameable half of the two-audiences rule.
- **Applied through an idempotent hook** ([`hooks.ts`](../src/domain/hooks.ts), the `theme` hook),
  so create applies it, teardown removes it, and resume re-validates without duplicating.

## What `src/` realizes it

`seams/theming` (palette, glyphs, `accentFor` / `assignAccent` / `accentByName`) · `domain/worktree`
(assigns + records) · `domain/room` (inherits).

## Deferred

Painting real multiplexer/editor surfaces; the full glyph set per concept type; ambiguous
"blue-across-the-whole-workspace" resolution (the human shell's picker).
