// Floor identity at the CLI (design/0060-floor-identity/): the identity shown
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
    'floor 0 — 🌊 workspace (ground floor) [active] · blue\nfloor 1 — 🌲 alpha [active] · green\n',
  );
  expect(ward(['project', 'list']).stdout).toBe(
    '  floor 0 — 🌊 workspace (ground floor) [active] (0 tasks) · blue\n' +
      '  floor 1 — 🌲 alpha [active] (0 tasks) · green\n',
  );
});

test('--json carries the identity as recorded: a palette name and an emoji', () => {
  const opened = projectOpenShape.parse(
    JSON.parse(ward(['project', 'open', 'alpha', '--json']).stdout),
  );
  expect(opened).toMatchObject({ floor: 1, color: 'green', emoji: '🌲' });
  const wears = [
    { floor: 0, color: 'blue', emoji: '🌊' },
    { floor: 1, color: 'green', emoji: '🌲' },
  ];
  const status = statusShape.parse(JSON.parse(ward(['status', '--json']).stdout));
  expect(status.projects).toMatchObject(wears);
  const list = projectListShape.parse(JSON.parse(ward(['project', 'list', '--json']).stdout));
  expect(list.projects).toMatchObject(wears);
});

test('a terminal that takes color is shown the swatch as the host paints it', () => {
  const listed = ward(['project', 'list'], { FORCE_COLOR: '1' });
  expect(listed.stdout).toContain('\x1b[48;5;26;38;5;231m blue \x1b[0m');
  // A declared agent is given the word alone.
  expect(ward(['project', 'list'], { FORCE_COLOR: '1', WARD_AGENT: '1' }).stdout).toContain(
    '(0 tasks) · blue\n',
  );
});

test('project identity: changes what is named, says who shares the color, and reports the host', () => {
  ward(['project', 'open', 'alpha']);
  const changed = ward(['project', 'identity', '1', '--color', 'blue', '--emoji', '🚀']);
  expect(changed.stdout).toBe(
    'identified floor 1 — alpha as 🚀 blue\n' +
      'blue is also worn by floor 0\n' +
      'no host is standing for this floor — the next one opens wearing it\n',
  );
  expect(ward(['status']).stdout).toContain('floor 1 — 🚀 alpha [active] · blue');

  const again = ward(['project', 'identity', '1', '--json']);
  expect(projectIdentityShape.parse(JSON.parse(again.stdout))).toEqual({
    floor: 1,
    slug: 'alpha',
    color: 'blue',
    emoji: '🚀',
    outcome: 'satisfied',
    sharedColorWith: [0],
    host: { outcome: 'absent', groups: [] },
  });
});

test.each<[string, string[], string]>([
  ['a color outside the palette', ['--color', 'mauve'], 'Expected one of "blue"'],
  ['more than one emoji', ['--emoji', '🌊🌊'], 'is not one emoji'],
])('project identity refuses %s', (_, flags, says) => {
  const refused = ward(['project', 'identity', '0', ...flags, '--json']);
  expect(refused.exitCode).not.toBe(0);
  expect(refused.stdout).toBe('');
  expect(refused.stderr).toContain(says);
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
