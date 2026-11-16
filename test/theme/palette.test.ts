// The floor palette (design/0060-floor-identity/,
// design/0064-floor-identity-palette/): every color legible as a background
// under its own ink, every emoji one glyph that every terminal measures the
// same, nothing in the set repeated, and the ground floor's pair held out of
// the pool the other floors draw from.
import { expect, test } from 'bun:test';
import {
  FLOOR_COLORS,
  GROUND_IDENTITY,
  INK,
  isFloorColor,
  isPlainEmoji,
  isSingleEmoji,
  PALETTE,
  POOL_COLORS,
  POOL_EMOJI,
  xtermRgb,
} from '../../src/theme/palette.ts';

test.each(FLOOR_COLORS.map((color) => [color] as const))(
  '%s reads under its ink: WCAG contrast of at least 4.5:1',
  (color) => {
    const swatch = PALETTE[color];
    expect(contrast(xtermRgb(swatch.xterm), xtermRgb(INK[swatch.ink]))).toBeGreaterThanOrEqual(4.5);
  },
);

test.each(FLOOR_COLORS.map((color) => [color] as const))(
  '%s is a fixed color no terminal theme redefines',
  (color) => {
    // 0–15 are the ANSI colors a theme repaints; 16–255 are the same everywhere.
    expect(PALETTE[color].xterm).toBeGreaterThanOrEqual(16);
    expect(PALETTE[color].xterm).toBeLessThanOrEqual(255);
  },
);

const EVERY_EMOJI = FLOOR_COLORS.flatMap((color) => PALETTE[color].emojis);

test.each(EVERY_EMOJI.map((emoji) => [emoji] as const))(
  '%s is one plain code point that presents as an emoji, two cells wide',
  (emoji) => {
    expect([...emoji]).toHaveLength(1); // no variation selector, no joiner, no skin tone
    expect(isSingleEmoji(emoji)).toBe(true);
    // Emoji presentation by default is what makes a terminal draw it wide
    // without a variation selector; the Unicode 6.0 pictograph blocks are the
    // ones every terminal font carries.
    expect(emoji).toMatch(/^\p{Emoji_Presentation}$/u);
    const point = emoji.codePointAt(0) ?? 0;
    expect(UNICODE_6_PICTOGRAPHS.some(([from, to]) => point >= from && point <= to)).toBe(true);
  },
);

test('no two colors share a swatch, and no emoji appears twice in the whole set', () => {
  expect(new Set(FLOOR_COLORS.map((color) => PALETTE[color].xterm)).size).toBe(FLOOR_COLORS.length);
  expect(new Set(EVERY_EMOJI).size).toBe(EVERY_EMOJI.length);
});

test('the pool is large enough that a few dozen open floors each wear their own emoji', () => {
  expect(POOL_COLORS).toHaveLength(10);
  expect(POOL_EMOJI).toHaveLength(40);
  expect(new Set(POOL_EMOJI).size).toBe(40);
  for (const color of POOL_COLORS) expect(PALETTE[color].emojis).toHaveLength(4);
});

test("the ground floor's color and emoji are in the palette and out of the pool", () => {
  expect(GROUND_IDENTITY).toEqual({ color: 'silver', emoji: '🔧' });
  expect(isFloorColor(GROUND_IDENTITY.color)).toBe(true);
  expect(PALETTE[GROUND_IDENTITY.color].emojis).toEqual([GROUND_IDENTITY.emoji]);
  expect(POOL_COLORS).not.toContain(GROUND_IDENTITY.color);
  expect(POOL_EMOJI).not.toContain(GROUND_IDENTITY.emoji);
});

test("the pool falls back through the last of each color's row first", () => {
  // A color's first choice is the last thing another color borrows.
  expect(POOL_EMOJI.slice(0, 3)).toEqual(['🌐', '🌵', '🎃']);
  expect(POOL_EMOJI.slice(-10)).toEqual(POOL_COLORS.map((color) => PALETTE[color].emojis[0]));
});

test.each([
  ['🌊', true],
  ['🚀', true],
  ['❤️', true], // one grapheme, with its variation selector
  ['👩‍💻', true], // one grapheme, joined
  ['🌊🌊', false],
  ['a', false],
  ['7', false],
  ['', false],
  ['🌊 ', false],
  ['blue', false],
])('isSingleEmoji(%p) is %p', (value, expected) => {
  expect(isSingleEmoji(value)).toBe(expected);
});

// What a floor may be given (design/0064-floor-identity-palette/): any emoji
// a terminal and a multiplexer measure alike. tmux 3.7 counts ⚙️ as one cell
// where a terminal draws two, and a joined or toned emoji as four.
test.each([
  ['🏈', true], // any emoji that fits the floor, not one of a list
  ['🌙', true],
  ['🦊', true], // later than Unicode 6: the opener's trade, and still one wide glyph
  ['☔', true], // outside the pictograph blocks, emoji by default
  ['⚙️', false], // needs its variation selector
  ['⚙', false], // text by default
  ['❤️', false],
  ['👩‍💻', false], // joined
  ['👍🏽', false], // toned
  ['🇺🇸', false], // two code points
  ['1️⃣', false],
  ['🌊🌊', false],
  ['a', false],
  ['', false],
])('isPlainEmoji(%p) is %p', (value, expected) => {
  expect(isPlainEmoji(value)).toBe(expected);
});

test.each([
  [16, [0, 0, 0]],
  [231, [255, 255, 255]],
  [26, [0, 95, 215]],
  [208, [255, 135, 0]],
  [240, [88, 88, 88]],
  [255, [238, 238, 238]],
])('xterm color %p is rgb %p', (index, rgb) => {
  expect([...xtermRgb(index)]).toEqual(rgb);
});

test('a color is named from the palette or not at all', () => {
  expect(isFloorColor('teal')).toBe(true);
  expect(isFloorColor('mauve')).toBe(false);
  expect(isFloorColor('#0087ff')).toBe(false);
});

// -- scaffolding ----------------------------------------------------------------

/** The blocks Unicode 6.0 added its pictographs in: symbols, emoticons, transport. */
const UNICODE_6_PICTOGRAPHS: readonly (readonly [number, number])[] = [
  [0x1f300, 0x1f5ff],
  [0x1f600, 0x1f64f],
  [0x1f680, 0x1f6ff],
];

/** WCAG 2 relative luminance of an sRGB color. */
function luminance([r, g, b]: readonly [number, number, number]): number {
  const linear = (channel: number) => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

function contrast(
  a: readonly [number, number, number],
  b: readonly [number, number, number],
): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (light + 0.05) / (dark + 0.05);
}
