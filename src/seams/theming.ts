// Seam: visual theming & identity coordination (05-visual-theming). Two cues:
// a per-INSTANCE accent (deterministic from the work's identity, collision-free
// among what's visible together) and a per-TYPE glyph (categorical). Both are
// recorded as NAMEABLE attributes so an agent can resolve a human's "the blue
// one" back to a concrete identity (§8) — the accent name is the resolution key.
//
// Not decoration, and never crosses the privacy boundary (§4): accents/glyphs are
// workspace-internal, like persona names.

export interface Accent {
  name: string;
  hex: string;
}

// A small, distinguishable palette. Sized to realistic concurrent cardinality —
// collisions need only be avoided among what a human sees at once.
const PALETTE: readonly Accent[] = [
  { name: 'blue', hex: '#3b82f6' },
  { name: 'green', hex: '#22c55e' },
  { name: 'amber', hex: '#f59e0b' },
  { name: 'violet', hex: '#8b5cf6' },
  { name: 'teal', hex: '#14b8a6' },
  { name: 'rose', hex: '#f43f5e' },
  { name: 'indigo', hex: '#6366f1' },
  { name: 'lime', hex: '#84cc16' },
  { name: 'orange', hex: '#f97316' },
  { name: 'cyan', hex: '#06b6d4' },
];

// Per-type glyph: reads "what kind of thing is this?" — categorical, shared by
// every instance of a type. The accent carries the "which one?" burden.
export const GLYPHS = {
  project: '🗂️',
  task: '📋',
  worktree: '🌳',
  room: '🚪',
  session: '💬',
} as const;

export type GlyphKind = keyof typeof GLYPHS;

export function glyphFor(kind: GlyphKind): string {
  return GLYPHS[kind];
}

function paletteAt(index: number): Accent {
  const accent = PALETTE[((index % PALETTE.length) + PALETTE.length) % PALETTE.length];
  if (accent === undefined) {
    throw new Error('empty palette');
  }
  return accent;
}

// A stable, deterministic hash of an identity string → a palette index. The same
// work always hashes to the same accent, so the human builds muscle memory and a
// reboot never re-colors it.
function hashIndex(identity: string): number {
  let h = 0;
  for (let i = 0; i < identity.length; i += 1) {
    h = (h * 31 + (identity.codePointAt(i) ?? 0)) >>> 0;
  }
  return h % PALETTE.length;
}

/** The deterministic accent for an identity (ignoring collisions). */
export function accentFor(identity: string): Accent {
  return paletteAt(hashIndex(identity));
}

/**
 * Assign an accent: start from the deterministic choice and, if it clashes with
 * an accent already visible, walk forward to the next free one — so the result is
 * stable when uncontended and collision-free among the visible set either way.
 * The chosen accent is recorded on the work, so it stays fixed across resumes.
 */
export function assignAccent(identity: string, takenNames: Iterable<string>): Accent {
  const used = new Set(takenNames);
  const start = hashIndex(identity);
  for (let i = 0; i < PALETTE.length; i += 1) {
    const accent = paletteAt(start + i);
    if (!used.has(accent.name)) {
      return accent;
    }
  }
  return paletteAt(start); // more things visible than colors — reuse the deterministic one
}

/** Resolve a color name ("blue") back to its accent — the agent-audience half of §8. */
export function accentByName(name: string): Accent | undefined {
  return PALETTE.find((a) => a.name === name.toLowerCase());
}
