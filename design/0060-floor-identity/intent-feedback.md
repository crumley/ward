# 0060 — Intent feedback

> Intent frictions found while building floor identity.

## IF-001 — The glyph is categorical in intent, and per-floor here

- **Slice:** [`visual-theming`](../../intent/02-subsystems/05-visual-theming.md), _Constraints any
  design must honor_, the second bullet (_Mark the kind of thing with a typed glyph_).
- **Friction:** the slice gives identity two cues with separate jobs: a per-instance accent that
  says which one, and a glyph shared by every thing of a type that says what kind. A floor host
  shows several floors side by side, all of one kind, so a categorical glyph would be the same emoji
  on every status line and distinguish nothing. What tells floors apart at a glance, and what a
  human names them by, is a different emoji on each, reinforcing the color (which a color-blind
  reader, or a monochrome surface such as a tmux session name, cannot use).
- **Assumption made to keep moving:** a floor's emoji is per-instance, recorded beside its color,
  and assigned distinct among open floors like the color. No categorical glyph is assigned to any
  concept type by this entry.
- **Proposed revision:** let the slice say that a container a human sees several of at once (a
  floor) may carry a per-instance glyph as a second "which one" cue, and keep the categorical glyph
  for marking kind where kinds are mixed in one view (a task beside a session). State whether a
  thing may carry both.
- **Status:** adjudicated — [#139](https://github.com/crumley/ward/pull/139) (Ryan's ruling,
  2026-11-15: a thing seen several at a time may carry a per-instance glyph as a second "which one"
  cue, the categorical glyph stays for views that mix kinds, and a thing wears one glyph)
