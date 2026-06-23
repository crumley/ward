# Design: Visual Theming & Identity Coordination

> **Serves intent:** [visual-theming seam](../intent/02-subsystems/05-visual-theming.md); supports
> [human-shell](../intent/02-subsystems/07-human-shell.md) (resolving "the blue one") and
> [work-lifecycle](../intent/01-concepts/03-work-lifecycle.md) (theming is an idempotent hook).

## Realization (`src/seams/theming.ts`)

- **Accent (which one)** — a named color from a fixed `PALETTE` of 12, assigned by **FNV-1a hash of
  the work's identity** modulo the palette size, then **linear-probed** past any accent already
  taken by the things visible together. Deterministic (same identity → same accent across
  reboots/machines, the muscle-memory requirement) and collision-free within the visible set.
- **Glyph (what kind)** — a categorical per-type emoji (`project 🏢`, `task 🗂️`, `worktree 🌳`,
  `room 🚪`, `session 👤`). Shared by all instances of a type; carries no distinguishing burden.
- **Recorded + nameable** — both are stored as `theme {accent, glyph}` front matter on the work's
  record, so an agent can read the mapping and resolve a human's "the blue one" to a concrete
  identity (§8). The accent is an English color word, not a hex code, precisely so it is sayable.

## Collision scope and the overflow signal

"Visible together" is realized per surface: **project accents** are unique across the workspace's
projects; **room accents** are unique across a floor; **worktree accents** are unique within a task
(`domain/resolve.ts` collects the sibling accents). When a visible set exceeds the palette, a true
collision is **flagged** (`{collision: true}`) rather than hidden — a collision the human can see is
a collision they can work around; a silent one defeats the cue. (Surfacing it in the CLI is a
follow-on.)

## Theming is an idempotent hook

Applying a worktree's theme is one of the worktree **setup hooks** (`design/lifecycle-hooks.md`): it
writes `.ward-theme.json` into the worktree, validated **by value** (re-theming converges), torn
down on teardown. So a resume re-applies nothing if the theme already matches.

## Open / deferred

- **Ambiguous visual reference across the whole workspace** (two things sharing a color when not
  visible together) — resolution leans on the visible context; the human-shell picker is the
  disambiguation path. Deferred with the interactive picker
  ([seam open question](../intent/02-subsystems/05-visual-theming.md)).
- **Real surfaces** (multiplexer borders, editor windows) consume `.ward-theme.json`; v1 writes it
  but wires no live surface (multiplexer deferred).
- Palette/glyph sets are values, expected to evolve via reflection.
