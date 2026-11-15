// The floor palette (design/0060-floor-identity/): every color legible as a
// background under its own ink, every emoji one glyph that every terminal
// measures the same, and nothing in the set repeated.
import { expect, test } from 'bun:test';
import {
  FLOOR_COLORS,
  INK,
  isFloorColor,
  isSingleEmoji,
  PALETTE,
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
  '%s is a fixed color no terminal theme redefines, and its emoji is one plain code point',
  (color) => {
    const swatch = PALETTE[color];
    // 0–15 are the ANSI colors a theme repaints; 16–255 are the same everywhere.
    expect(swatch.xterm).toBeGreaterThanOrEqual(16);
    expect(swatch.xterm).toBeLessThanOrEqual(255);
    expect([...swatch.emoji]).toHaveLength(1); // no variation selector, no joiner
    expect(isSingleEmoji(swatch.emoji)).toBe(true);
  },
);

test('no two colors share a swatch or an emoji', () => {
  const swatches = FLOOR_COLORS.map((color) => PALETTE[color]);
  expect(new Set(swatches.map((s) => s.xterm)).size).toBe(FLOOR_COLORS.length);
  expect(new Set(swatches.map((s) => s.emoji)).size).toBe(FLOOR_COLORS.length);
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
