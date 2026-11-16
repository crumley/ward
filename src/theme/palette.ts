// The floor palette (design/0060-floor-identity/;
// intent/02-subsystems/05-visual-theming.md): the small, named set of colors a
// floor's identity is drawn from, and the emoji Ward reaches for first. A leaf
// module on purpose — the record's schema reads the names, assignment reads
// the order, and a host reads the swatch — so the one list cannot drift
// between what is recorded and what is painted.
//
// A color is spelled in a record by its NAME (`color: blue`), never a hex
// value: a name is what a human says ("the blue one") and what an agent can
// resolve, and a closed set is what lets every member be checked for
// legibility once, here, rather than at every surface that paints it.
//
// Each swatch is a FIXED entry of the xterm 256-color table (16–255), with the
// ink that reads on it. The sixteen ANSI colors are the ones a terminal theme
// redefines — "blue" is unreadable navy in one scheme and pastel in the next —
// while the upper table is the same color under a light theme and a dark one.
// A surface always paints the swatch as a BACKGROUND with its own ink over
// it, so the pair carries its contrast with it and never depends on the
// terminal's own foreground or background.

/** The palette's names, in the order assignment hands them out. */
export const FLOOR_COLORS = [
  'blue',
  'green',
  'orange',
  'purple',
  'yellow',
  'teal',
  'red',
  'pink',
  'brown',
  'gray',
] as const;

export type FloorColor = (typeof FLOOR_COLORS)[number];

export interface Swatch {
  /** The background: an index into the xterm 256-color table. */
  readonly xterm: number;
  /** The ink that reads on it: `light` is white (231), `dark` is black (16). */
  readonly ink: 'light' | 'dark';
  /** The emoji assignment reaches for first with this color. */
  readonly emoji: string;
}

/** The xterm indices of the two inks. */
export const INK = { light: 231, dark: 16 } as const;

/**
 * Every pair here holds a WCAG contrast ratio of at least 4.5:1 between its
 * background and its ink (test/theme/palette.test.ts computes it). The emoji
 * are single code points from Unicode 6 — no variation selector, no joiner —
 * so every terminal font carries them and every multiplexer measures them two
 * cells wide.
 */
export const PALETTE: Readonly<Record<FloorColor, Swatch>> = {
  blue: { xterm: 26, ink: 'light', emoji: '🌊' },
  green: { xterm: 28, ink: 'light', emoji: '🌲' },
  orange: { xterm: 208, ink: 'dark', emoji: '🍊' },
  purple: { xterm: 92, ink: 'light', emoji: '🍇' },
  yellow: { xterm: 220, ink: 'dark', emoji: '🌻' },
  teal: { xterm: 37, ink: 'dark', emoji: '🐬' },
  red: { xterm: 160, ink: 'light', emoji: '🍎' },
  pink: { xterm: 205, ink: 'dark', emoji: '🌸' },
  brown: { xterm: 130, ink: 'light', emoji: '🐻' },
  gray: { xterm: 240, ink: 'light', emoji: '🐘' },
};

export function isFloorColor(value: string): value is FloorColor {
  return (FLOOR_COLORS as readonly string[]).includes(value);
}

const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

/**
 * Whether a string is ONE emoji: a single grapheme carrying a pictographic
 * code point. One, because it is a glyph standing beside a name in a status
 * line a few cells wide; pictographic, so a letter or a digit is not taken
 * for one.
 */
export function isSingleEmoji(value: string): boolean {
  if (!/\p{Extended_Pictographic}/u.test(value)) return false;
  return [...graphemes.segment(value)].length === 1;
}

/** An xterm 256-color index as red, green, blue (0–255) — indices 16–255 only. */
export function xtermRgb(index: number): readonly [number, number, number] {
  if (index >= 232) {
    const level = 8 + 10 * (index - 232);
    return [level, level, level];
  }
  const cube = index - 16;
  const level = (step: number) => (step === 0 ? 0 : 55 + 40 * step);
  return [level(Math.floor(cube / 36)), level(Math.floor(cube / 6) % 6), level(cube % 6)];
}
