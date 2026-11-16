// Floor identity at the CLI (design/0060-floor-identity/,
// design/0064-floor-identity-palette/): the identity shown
// wherever floors are listed, for both audiences, and the verb that changes
// it. No tmux here — the host is pinned absent; the real one is
// test/host/tmux-live.test.ts's.
import { afterAll, beforeAll, beforeEach, expect, test } from 'bun:test';
import { join } from 'node:path';
import {
  projectIdentityShape,
  projectListShape,
  projectOpenShape,
  statusShape,
} from '../../src/cli/schema.ts';
import { createWorkspace } from '../../src/workspace/create.ts';
import { applyGitTestEnv, makeTempDir, NO_GH, removeDir, runWardEnv } from '../helpers.ts';

test('status and project list name each floor by its emoji and its color', () => {
  ward(['project', 'open', 'alpha']);
  expect(ward(['status']).stdout).toContain(
    'floor 0 — 🔧 workspace (ground floor) [active] · silver\nfloor 1 — 🌊 alpha [active] · blue\n',
  );
  expect(ward(['project', 'list']).stdout).toBe(
    '  floor 0 — 🔧 workspace (ground floor) [active] (0 tasks) · silver\n' +
      '  floor 1 — 🌊 alpha [active] (0 tasks) · blue\n',
  );
});

test('--json carries the identity as recorded: a palette name and an emoji', () => {
  const opened = projectOpenShape.parse(
    JSON.parse(ward(['project', 'open', 'alpha', '--json']).stdout),
  );
  expect(opened).toMatchObject({ floor: 1, color: 'blue', emoji: '🌊' });
  const wears = [
    { floor: 0, color: 'silver', emoji: '🔧' },
    { floor: 1, color: 'blue', emoji: '🌊' },
  ];
  const status = statusShape.parse(JSON.parse(ward(['status', '--json']).stdout));
  expect(status.projects).toMatchObject(wears);
  const list = projectListShape.parse(JSON.parse(ward(['project', 'list', '--json']).stdout));
  expect(list.projects).toMatchObject(wears);
});

test('a terminal that takes color is shown the swatch as the host paints it', () => {
  const listed = ward(['project', 'list'], { FORCE_COLOR: '1' });
  expect(listed.stdout).toContain('\x1b[48;5;250;38;5;16m silver \x1b[0m');
  // A declared agent is given the word alone.
  expect(ward(['project', 'list'], { FORCE_COLOR: '1', WARD_AGENT: '1' }).stdout).toContain(
    '(0 tasks) · silver\n',
  );
});

test('project identity: changes what is named, says who shares the color, and reports the host', () => {
  ward(['project', 'open', 'alpha']);
  ward(['project', 'open', 'beta']);
  const changed = ward(['project', 'identity', '1', '--color', 'green', '--emoji', '🚀']);
  expect(changed.stdout).toBe(
    'identified floor 1 — alpha as 🚀 green\n' +
      'green is also worn by floor 2\n' +
      'no host is standing for this floor — the next one opens wearing it\n',
  );
  expect(ward(['status']).stdout).toContain('floor 1 — 🚀 alpha [active] · green');

  const again = ward(['project', 'identity', '1', '--json']);
  expect(projectIdentityShape.parse(JSON.parse(again.stdout))).toEqual({
    floor: 1,
    slug: 'alpha',
    color: 'green',
    emoji: '🚀',
    outcome: 'satisfied',
    sharedColorWith: [2],
    host: { outcome: 'absent', groups: [] },
  });
});

test.each<[string, string[], string]>([
  ['a color outside the palette', ['--color', 'mauve'], 'Expected one of "blue"'],
  ['more than one emoji', ['--emoji', '🌊🌊'], 'is not one emoji'],
  [
    'an emoji with a variation selector',
    ['--emoji', '⚙️'],
    'is not an emoji every terminal draws two cells wide',
  ],
  ['a joined emoji', ['--emoji', '👩‍💻'], 'a status line is measured in cells'],
  ['a flag', ['--emoji', '🇺🇸'], 'is not one emoji'],
  ["the ground floor's emoji", ['--emoji', '🔧'], "🔧 is the ground floor's"],
  ["the ground floor's color", ['--color', 'silver'], "silver is the ground floor's"],
  ['an emoji another open floor wears', ['--emoji', '🌲'], '🌲 is worn by floor 2 — beta'],
])('project identity refuses %s', (_, flags, says) => {
  ward(['project', 'open', 'alpha']);
  ward(['project', 'open', 'beta']); // green 🌲
  const refused = ward(['project', 'identity', '1', ...flags, '--json']);
  expect(refused.exitCode).not.toBe(0);
  expect(refused.stdout).toBe('');
  expect(refused.stderr).toContain(says);
});

test('the ground floor wears its own identity, and the verb will not change it', () => {
  const refused = ward(['project', 'identity', '0', '--emoji', '🚀']);
  expect(refused.exitCode).not.toBe(0);
  expect(refused.stderr).toContain(
    'floor 0 is the ground floor — it wears 🔧 silver in every workspace',
  );
  // With nothing named it still dresses the host, as for any floor.
  expect(ward(['project', 'identity', '0']).stdout).toBe(
    'floor 0 — workspace is 🔧 silver\n' +
      'no host is standing for this floor — the next one opens wearing it\n',
  );
});

// -- chosen at open (design/0064-floor-identity-palette/) ----------------------

test('project open takes the emoji the opener chose, and Ward picks the color', () => {
  const opened = ward(['project', 'open', 'fantasy-football', '--emoji', '🏈']);
  expect(opened.stdout).toBe('opened floor 1 — 🏈 fantasy-football · blue\n');
  // Named, the color is the opener's too; the emoji is then Ward's pick for it.
  const second = ward(['project', 'open', 'garden', '--color', 'teal', '--json']);
  expect(projectOpenShape.parse(JSON.parse(second.stdout))).toMatchObject({
    floor: 2,
    color: 'teal',
    emoji: '🐬',
  });
  // Both, and a color an open floor already wears is the opener's to share.
  const third = ward(['project', 'open', 'ocean', '--color', 'blue', '--emoji', '🚀', '--json']);
  expect(JSON.parse(third.stdout)).toMatchObject({ floor: 3, color: 'blue', emoji: '🚀' });
});

test.each<[string, string[], string]>([
  ['an emoji another open floor wears', ['--emoji', '🌊'], '🌊 is worn by floor 1 — alpha'],
  ["the ground floor's emoji", ['--emoji', '🔧'], "🔧 is the ground floor's"],
  ["the ground floor's color", ['--color', 'silver'], 'Expected one of "blue"'],
  [
    'an emoji with a variation selector',
    ['--emoji', '⚙️'],
    'is not an emoji every terminal draws two cells wide',
  ],
  ['a word', ['--emoji', 'football'], 'is not one emoji'],
])('project open refuses %s, and opens nothing', (_, flags, says) => {
  ward(['project', 'open', 'alpha']); // blue 🌊
  const refused = ward(['project', 'open', 'beta', ...flags, '--json']);
  expect(refused.exitCode).not.toBe(0);
  expect(refused.stdout).toBe('');
  expect(refused.stderr).toContain(says);
  expect(ward(['project', 'list']).stdout).not.toContain('beta');
});

test('ward schema documents the verb', () => {
  const schema = JSON.parse(ward(['schema', 'project', 'identity']).stdout);
  expect(schema.properties.color.enum).toContain('teal');
  expect(Object.keys(schema.properties)).toEqual([
    'floor',
    'slug',
    'color',
    'emoji',
    'outcome',
    'sharedColorWith',
    'host',
  ]);
});

// -- setup ----------------------------------------------------------------

let scratch: string;
let ws: string;
let counter = 0;

/** The CLI with no color, no forge, and no tmux — unless the row says otherwise. */
function ward(argv: string[], env: Record<string, string> = {}) {
  return runWardEnv(argv, ws, {
    ...(env.FORCE_COLOR === undefined ? { NO_COLOR: '1' } : {}),
    WARD_GH: NO_GH,
    WARD_TMUX_BIN: '/nonexistent/tmux',
    ...env,
  });
}

beforeAll(() => {
  applyGitTestEnv();
  scratch = makeTempDir();
});

afterAll(() => removeDir(scratch));

beforeEach(async () => {
  counter += 1;
  ws = join(scratch, `case-${counter}`);
  await createWorkspace(ws);
});
