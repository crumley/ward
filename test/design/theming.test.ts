// DESIGN TEST — the visual identity is deterministic (same work → same accent across reboots) and
// collision-free among what's visible together; the glyph is categorical by type. Backs the theming
// seam (intent/02-subsystems/05-visual-theming.md).

import { test } from "node:test";
import assert from "node:assert/strict";
import { assignAccent, glyphFor, themeFor, PALETTE } from "../../src/seams/theming.ts";

test("accent is deterministic from identity", () => {
  assert.equal(assignAccent("1A1").accent, assignAccent("1A1").accent);
  assert.equal(themeFor("room", "1A7").accent, themeFor("room", "1A7").accent);
});

test("accent is collision-free among the visible set", () => {
  const a = assignAccent("1A1").accent;
  const b = assignAccent("1A2", [a]).accent;
  const c = assignAccent("1A3", [a, b]).accent;
  assert.equal(new Set([a, b, c]).size, 3, "three concurrent rooms must look distinct");
});

test("glyph is categorical by concept type", () => {
  assert.equal(glyphFor("room"), "🚪");
  assert.notEqual(glyphFor("project"), glyphFor("room"));
  assert.notEqual(glyphFor("task"), glyphFor("worktree"));
});

test("collision is flagged (not hidden) when the visible set exceeds the palette", () => {
  const r = assignAccent("overflow", [...PALETTE]);
  assert.equal(r.collision, true, "an unavoidable collision must be surfaced, not silent");
});
