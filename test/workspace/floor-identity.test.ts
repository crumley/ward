// A floor's identity (design/0060-floor-identity/): assigned at open, clear
// of what the other open floors wear; changed only through the verb; and
// backfilled by convergence for a floor from before identities — without
// ever touching one a human chose.
import { afterAll, beforeEach, expect, test } from 'bun:test';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { readDocument, writeDocument } from '../../src/store/document.ts';
import { projectRecordType } from '../../src/store/types.ts';
import { FLOOR_COLORS, PALETTE } from '../../src/theme/palette.ts';
import { convergeWorkspace } from '../../src/workspace/converge.ts';
import { createWorkspace } from '../../src/workspace/create.ts';
import {
  assignIdentity,
  type FloorLook,
  identityOf,
  setFloorIdentity,
} from '../../src/workspace/floor-identity.ts';
import { git } from '../../src/workspace/git.ts';
import { openProject, resolveProject } from '../../src/workspace/projects.ts';
import { applyGitTestEnv, makeTempDir, removeDir } from '../helpers.ts';

// -- assignment -----------------------------------------------------------------

const ALL = FLOOR_COLORS.map((color) => ({ color, emoji: PALETTE[color].emoji }));

test.each<[string, Partial<FloorLook>[], Partial<FloorLook>, FloorLook]>([
  ['nothing worn: the first color and its emoji', [], {}, { color: 'blue', emoji: '🌊' }],
  [
    'the first free color, in palette order',
    [
      { color: 'blue', emoji: '🌊' },
      { color: 'orange', emoji: '🍊' },
    ],
    {},
    { color: 'green', emoji: '🌲' },
  ],
  [
    "a color's own emoji already worn: the first emoji no floor wears",
    [{ color: 'blue', emoji: '🌲' }],
    {},
    { color: 'green', emoji: '🌊' },
  ],
  [
    'every color worn once: share the first, never pile onto one',
    ALL,
    {},
    { color: 'blue', emoji: '🌊' },
  ],
  [
    'every color worn, blue twice: the next least worn',
    [...ALL, { color: 'blue', emoji: '🚀' }],
    {},
    { color: 'green', emoji: '🌲' },
  ],
  ['a held color is kept, its emoji picked', [], { color: 'teal' }, { color: 'teal', emoji: '🐬' }],
  [
    'a held emoji is kept, its color picked',
    [{ color: 'blue', emoji: '🌊' }],
    { emoji: '🚀' },
    { color: 'green', emoji: '🚀' },
  ],
  [
    'a whole held identity is returned as it is, collision or not',
    [{ color: 'red', emoji: '🍎' }],
    { color: 'red', emoji: '🍎' },
    { color: 'red', emoji: '🍎' },
  ],
])('assign — %s', (_, taken, held, expected) => {
  expect(assignIdentity(taken, held)).toEqual(expected);
});

// -- at open ----------------------------------------------------------------------

test('the ground floor and each floor opened after it wear distinct identities, recorded', async () => {
  const opened = [await openProject(ws, 'alpha'), await openProject(ws, 'beta')];
  const ground = (await resolveProject(ws, 0)).record;
  expect([ground, ...opened].map(identityOf)).toEqual([
    { color: 'blue', emoji: '🌊' },
    { color: 'green', emoji: '🌲' },
    { color: 'orange', emoji: '🍊' },
  ]);
  // On disk, at the end of the record's front matter.
  expect(readFileSync(join(ws, 'projects/1-alpha/project.md'), 'utf8')).toContain(
    'color: green\nemoji: 🌲\n---\n',
  );
});

test("a closed floor's color is free again for the next floor opened", async () => {
  await openProject(ws, 'alpha'); // green
  await closeProject(1);
  expect(identityOf(await openProject(ws, 'beta'))).toEqual({ color: 'green', emoji: '🌲' });
});

// -- the verb -----------------------------------------------------------------------

test('identity: a named half is written and committed; the other half is kept', async () => {
  await openProject(ws, 'alpha'); // green 🌲
  const report = await setFloorIdentity(ws, 1, { color: 'teal' });
  expect(report).toMatchObject({
    outcome: 'changed',
    identity: { color: 'teal', emoji: '🌲' },
    sharedColorWith: [],
  });
  expect(identityOf((await resolveProject(ws, 1)).record)).toEqual({ color: 'teal', emoji: '🌲' });
  expect(git(ws, 'log', '-1', '--format=%s').stdout.trim()).toStartWith(
    'Identify floor 1 as 🌲 teal',
  );
  expect(git(ws, 'status', '--porcelain').stdout).toBe('');
});

test('identity: naming nothing, or what it already wears, changes and commits nothing', async () => {
  await openProject(ws, 'alpha');
  const head = git(ws, 'rev-parse', 'HEAD').stdout;
  expect((await setFloorIdentity(ws, 1)).outcome).toBe('satisfied');
  expect((await setFloorIdentity(ws, 1, { color: 'green', emoji: '🌲' })).outcome).toBe(
    'satisfied',
  );
  expect(git(ws, 'rev-parse', 'HEAD').stdout).toBe(head);
});

test('identity: a color another open floor wears is the human’s to choose, and is named', async () => {
  await openProject(ws, 'alpha');
  await openProject(ws, 'beta');
  const report = await setFloorIdentity(ws, 2, { color: 'blue', emoji: '🚀' });
  expect(report).toMatchObject({ outcome: 'changed', sharedColorWith: [0] });
  expect(report.identity).toEqual({ color: 'blue', emoji: '🚀' });
});

test.each<[string, number, { color?: string; emoji?: string }, string]>([
  ['a color outside the palette', 1, { color: 'mauve' }, "'mauve' is not a floor color"],
  ['a hex value', 1, { color: '#0087ff' }, 'choose one of: blue, green'],
  ['two emoji', 1, { emoji: '🌊🌊' }, 'is not one emoji'],
  ['a word', 1, { emoji: 'wave' }, 'is not one emoji'],
  ['a floor that does not exist', 9, { color: 'red' }, 'no project on floor 9'],
])('identity refuses %s, writing nothing', async (_, floor, change, says) => {
  await openProject(ws, 'alpha');
  const head = git(ws, 'rev-parse', 'HEAD').stdout;
  await expect(setFloorIdentity(ws, floor, change)).rejects.toThrow(says);
  expect(git(ws, 'rev-parse', 'HEAD').stdout).toBe(head);
});

test('identity refuses a closed floor: it has no host to wear one', async () => {
  await openProject(ws, 'alpha');
  await closeProject(1);
  await expect(setFloorIdentity(ws, 1, { color: 'red' })).rejects.toThrow('floor 1 is closed');
});

test('a record whose color or emoji is not one the schema knows is refused on read', async () => {
  await openProject(ws, 'alpha');
  const file = join(ws, 'projects/1-alpha/project.md');
  writeFileSync(file, readFileSync(file, 'utf8').replace('color: green', 'color: mauve'));
  await expect(resolveProject(ws, 1)).rejects.toThrow();
});

// -- the backfill -------------------------------------------------------------------

test('convergence gives every open floor from before identities one, in floor order', async () => {
  await openProject(ws, 'alpha');
  await openProject(ws, 'beta');
  await openProject(ws, 'gone');
  await closeProject(3);
  for (const dir of ['0-workspace', '1-alpha', '2-beta', '3-gone']) strip(dir);
  git(ws, 'commit', '-am', 'as an older ward left it');

  const step = (await convergeWorkspace(ws)).steps.find((s) => s.step === 'floor identities');
  expect(step).toEqual({
    step: 'floor identities',
    outcome: 'established',
    detail: 'floor 0 🌊 blue, floor 1 🌲 green, floor 2 🍊 orange',
  });
  expect(identityOf((await resolveProject(ws, 2)).record)).toEqual({
    color: 'orange',
    emoji: '🍊',
  });
  // A closed floor is on no listing and has no host: it is left as it was.
  expect(identityOf((await resolveProject(ws, 3)).record)).toBeUndefined();
  // One convergence commit, and nothing left uncommitted.
  expect(git(ws, 'log', '-1', '--format=%s').stdout).toStartWith('Converge Ward workspace');
  expect(git(ws, 'status', '--porcelain').stdout).toBe('');
});

test('convergence never touches an identity a floor already has, and picks around it', async () => {
  await openProject(ws, 'alpha');
  await openProject(ws, 'beta');
  await setFloorIdentity(ws, 2, { color: 'blue', emoji: '🚀' }); // a human's choice
  strip('0-workspace');
  strip('1-alpha');
  git(ws, 'commit', '-am', 'as an older ward left it');

  await convergeWorkspace(ws);
  expect(identityOf((await resolveProject(ws, 2)).record)).toEqual({ color: 'blue', emoji: '🚀' });
  expect(identityOf((await resolveProject(ws, 0)).record)).toEqual({ color: 'green', emoji: '🌲' });
  expect(identityOf((await resolveProject(ws, 1)).record)).toEqual({
    color: 'orange',
    emoji: '🍊',
  });

  const again = (await convergeWorkspace(ws)).steps.find((s) => s.step === 'floor identities');
  expect(again?.outcome).toBe('satisfied');
});

// -- scaffolding ----------------------------------------------------------------

let scratch: string;
let ws: string;
let caseId = 0;

/** Take the identity off a floor's record on disk — the record an older ward wrote. */
function strip(dir: string): void {
  const file = join(ws, 'projects', dir, 'project.md');
  writeFileSync(file, readFileSync(file, 'utf8').replace(/^(color|emoji): .*\n/gm, ''));
}

/** Close a floor by writing its record — `project close` is not a verb yet. */
async function closeProject(floor: number): Promise<void> {
  const found = await resolveProject(ws, floor);
  const existing = await readDocument(ws, projectRecordType(found.dir));
  await writeDocument(ws, projectRecordType(found.dir), {
    data: { ...found.record, state: 'closed', closedAt: new Date().toISOString() },
    body: existing.body,
  });
  git(ws, 'commit', '-am', `close floor ${floor}`);
}

beforeEach(async () => {
  applyGitTestEnv();
  caseId += 1;
  scratch ??= makeTempDir();
  ws = join(scratch, `ws-${caseId}`);
  await createWorkspace(ws);
});

afterAll(() => {
  if (scratch !== undefined) removeDir(scratch);
});
