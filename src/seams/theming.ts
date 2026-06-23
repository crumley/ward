// Theming seam: a per-work visual identity carrying a per-instance ACCENT (deterministic,
// collision-free among what's visible together) and a per-type GLYPH (categorical). Recorded as a
// nameable attribute so an agent can resolve "the blue one" back to a concrete identity (§8). Local
// only — never crosses the privacy boundary (§4). See intent/02-subsystems/05-visual-theming.md.

import type { ThemeVal } from "../store/schemas.ts";

// A small named palette sized to the handful of things visible together (intent: size to in-flight
// cardinality, not entropy). Names are the words a human says ("the blue one") and an agent reads.
export const PALETTE = [
  "red",
  "orange",
  "amber",
  "yellow",
  "lime",
  "green",
  "teal",
  "cyan",
  "blue",
  "indigo",
  "violet",
  "magenta",
] as const;

// Per-type glyph (categorical — answers "what kind"). The accent answers "which one".
const GLYPHS: Record<string, string> = {
  project: "🏢",
  task: "🗂️",
  worktree: "🌳",
  room: "🚪",
  session: "👤",
};

export function glyphFor(conceptType: string): string {
  return GLYPHS[conceptType] ?? "•";
}

// FNV-1a, kept tiny and dependency-free. Deterministic across machines/reboots so the same work
// always looks the same (the muscle-memory requirement).
function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

// Deterministic accent from the work's identity, collision-free among `used` (the accents already
// taken by things visible together — e.g. rooms on a floor). Linear-probe from the hashed start so
// the assignment is stable AND distinct. If the visible set exceeds the palette, collisions become
// unavoidable; the caller is told so it can surface it rather than silently colliding.
export function assignAccent(
  identity: string,
  used: readonly string[] = [],
): { accent: string; collision: boolean } {
  const start = fnv1a(identity) % PALETTE.length;
  for (let i = 0; i < PALETTE.length; i++) {
    const cand = PALETTE[(start + i) % PALETTE.length]!;
    if (!used.includes(cand)) return { accent: cand, collision: false };
  }
  return { accent: PALETTE[start]!, collision: true };
}

export function themeFor(
  conceptType: string,
  identity: string,
  usedAccents: readonly string[] = [],
): ThemeVal & { collision: boolean } {
  const { accent, collision } = assignAccent(identity, usedAccents);
  return { accent, glyph: glyphFor(conceptType), collision };
}
