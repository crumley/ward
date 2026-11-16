// The floor palette (design/0060-floor-identity/, design/0064-floor-identity-palette/;
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

/**
 * Every name a record may carry: the ten of the pool, in the order assignment
 * hands them out, then the one color held back for the ground floor
 * (design/0064-floor-identity-palette/).
 */
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
  'silver',
] as const;

export type FloorColor = (typeof FLOOR_COLORS)[number];

/**
 * What the ground floor wears, in every workspace
 * (design/0064-floor-identity-palette/): a neutral metal and a tool, for the
 * floor whose work is the workspace's own upkeep. Neither half is in the pool
 * the other floors draw from, so floor 0 looks the same wherever a human or
 * an agent meets it, and no other floor is mistaken for it.
 */
export const GROUND_IDENTITY = { color: 'silver', emoji: '🔧' } as const;

/** The colors an ordinary floor is assigned from — every one but the ground floor's. */
export const POOL_COLORS: readonly FloorColor[] = FLOOR_COLORS.filter(
  (color) => color !== GROUND_IDENTITY.color,
);

export interface Swatch {
  /** The background: an index into the xterm 256-color table. */
  readonly xterm: number;
  /** The ink that reads on it: `light` is white (231), `dark` is black (16). */
  readonly ink: 'light' | 'dark';
  /**
   * The emoji assignment reaches for with this color, first choice first.
   * Floors that share a color are told apart by these, so the ones in a row
   * differ in SHAPE, never only in hue.
   */
  readonly emojis: readonly [string, ...string[]];
}

/** The xterm indices of the two inks. */
export const INK = { light: 231, dark: 16 } as const;

/**
 * Every pair here holds a WCAG contrast ratio of at least 4.5:1 between its
 * background and its ink (test/theme/palette.test.ts computes it).
 *
 * The emoji are the FALLBACK (design/0064-floor-identity-palette/): whoever
 * opens a floor is asked to name one that fits it, and these are what a floor
 * is handed when nobody did. So the set is not meant to be chosen from, only
 * to be large enough that a fallback never repeats among the open floors —
 * four to a pool color, forty in all, and the ground floor's one. Each:
 *
 * - is one code point from Unicode 6.0 with default emoji presentation (see
 *   {@link isPlainEmoji}), so every terminal font carries it;
 * - is a thing with a plain name ("the frog one"), never a face, a hand, or a
 *   mark Ward or a terminal uses to mean a state (a check, a cross, a
 *   warning);
 * - differs from the others in outline, since the emoji is the cue left to a
 *   reader who cannot tell two colors apart: one book or heart in several
 *   colors would be the same glyph to them;
 * - is no tool — the ground floor's is the only one.
 *
 * A color's row leans toward its hue, so a floor's two cues agree.
 */
export const PALETTE: Readonly<Record<FloorColor, Swatch>> = {
  blue: { xterm: 26, ink: 'light', emojis: ['🌊', '🐳', '💎', '🌐'] },
  green: { xterm: 28, ink: 'light', emojis: ['🌲', '🐸', '🍀', '🌵'] },
  orange: { xterm: 208, ink: 'dark', emojis: ['🍊', '🐯', '🍁', '🎃'] },
  purple: { xterm: 92, ink: 'light', emojis: ['🍇', '👾', '🌂', '🔮'] },
  yellow: { xterm: 220, ink: 'dark', emojis: ['🌻', '🐝', '🌙', '🍋'] },
  teal: { xterm: 37, ink: 'dark', emojis: ['🐬', '🐢', '🍵', '🐟'] },
  red: { xterm: 160, ink: 'light', emojis: ['🍎', '🐞', '🌹', '🚗'] },
  pink: { xterm: 205, ink: 'dark', emojis: ['🌸', '🐷', '🎀', '🐙'] },
  brown: { xterm: 130, ink: 'light', emojis: ['🐻', '🎻', '🍪', '🐌'] },
  gray: { xterm: 240, ink: 'light', emojis: ['🐘', '🐺', '🗿', '🐧'] },
  silver: { xterm: 250, ink: 'dark', emojis: [GROUND_IDENTITY.emoji] },
};

/**
 * The emoji an ordinary floor is assigned from, in the order assignment falls
 * back through them once a color's own row is worn: the LAST of each row
 * first, so a color's first choice is the last thing another color borrows.
 */
export const POOL_EMOJI: readonly string[] = [3, 2, 1, 0].flatMap((rank) =>
  POOL_COLORS.flatMap((color) => PALETTE[color].emojis[rank] ?? []),
);

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

/**
 * Whether an emoji is one a terminal and a multiplexer agree about: a single
 * code point that presents as an emoji by default, which every one of them
 * draws two cells wide (design/0064-floor-identity-palette/). An emoji
 * needing a variation selector (⚙️), a joined sequence (👩‍💻), a skin tone
 * or a flag is one grapheme to a reader and one, two or four cells to tmux,
 * depending on the sequence — and a status line is measured in cells.
 */
export function isPlainEmoji(value: string): boolean {
  return [...value].length === 1 && /^\p{Emoji_Presentation}$/u.test(value);
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
