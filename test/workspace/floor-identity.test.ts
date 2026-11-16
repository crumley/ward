// A floor's identity (design/0060-floor-identity/,
// design/0064-floor-identity-palette/): assigned at open, with an emoji no
// open floor wears; the ground floor's the same in every workspace; changed
// only through the verb; and converged by the upgrade — the ground floor to
// its own, a floor from before identities to one, a repeated emoji to a
// distinct one — without ever touching an identity that is already distinct.
import { afterAll, beforeEach, expect, test } from 'bun:test';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { readDocument, writeDocument } from '../../src/store/document.ts';
import { projectRecordType } from '../../src/store/types.ts';
import { PALETTE, POOL_COLORS, POOL_EMOJI } from '../../src/theme/palette.ts';
import { convergeWorkspace } from '../../src/workspace/converge.ts';
import { createWorkspace } from '../../src/workspace/create.ts';
import {
  assignIdentity,
  type FloorLook,
  identityOf,
  setFloorIdentity,
} from '../../src/workspace/floor-identity.ts';
import { git } from '../../src/workspace/git.ts';
import { openProject, readProjects, resolveProject } from '../../src/workspace/projects.ts';
import { applyGitTestEnv, makeTempDir, removeDir } from '../helpers.ts';

// -- assignment -----------------------------------------------------------------

const GROUND = { color: 'silver', emoji: '🔧' } as const;
const ALL = POOL_COLORS.map((color) => ({ color, emoji: PALETTE[color].emojis[0] }));

test.each<[string, Partial<FloorLook>[], Partial<FloorLook>, FloorLook]>([
  ['nothing worn: the first color and its emoji', [], {}, { color: 'blue', emoji: '🌊' }],
  [
    'the ground floor alone: the first pool color, never silver',
    [GROUND],
    {},
    { color: 'blue', emoji: '🌊' },
  ],
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
    "a color's first emoji already worn: the next of its own row",
    [{ color: 'blue', emoji: '🌲' }],
    {},
    { color: 'green', emoji: '🐸' },
  ],
  [
    'every color worn once: share the first color, with an emoji of its own',
    ALL,
    {},
    { color: 'blue', emoji: '🐳' },
  ],
  [
    'every color worn, blue twice: the next least worn',
    [...ALL, { color: 'blue', emoji: '🚀' }],
    {},
    { color: 'green', emoji: '🐸' },
  ],
  [
    "a color's whole row worn: the first free emoji of the pool",
    PALETTE.blue.emojis.map((emoji) => ({ color: 'red' as const, emoji })),
    { color: 'blue' },
    { color: 'blue', emoji: '🌵' },
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

test('forty floors opened one after another wear forty emoji, and four of each color', () => {
  const floors: FloorLook[] = [GROUND];
  for (let n = 1; n <= 40; n += 1) floors.push(assignIdentity(floors));
  const opened = floors.slice(1);
  expect(new Set(opened.map((f) => f.emoji)).size).toBe(40);
  expect(opened.map((f) => f.emoji)).not.toContain(GROUND.emoji);
  for (const color of POOL_COLORS) {
    // Each color's floors wear that color's own row, in its order.
    expect(opened.filter((f) => f.color === color).map((f) => f.emoji)).toEqual([
      ...PALETTE[color].emojis,
    ]);
  }
});

test('past the pool an emoji repeats, but never beside its own color', () => {
  const floors: FloorLook[] = [GROUND];
  for (let n = 1; n <= 80; n += 1) floors.push(assignIdentity(floors));
  const pairs = floors.map((f) => `${f.color} ${f.emoji}`);
  expect(new Set(pairs).size).toBe(81);
  expect(floors.slice(41).every((f) => POOL_EMOJI.includes(f.emoji))).toBe(true);
});

// -- at open ----------------------------------------------------------------------

test('the ground floor wears its own identity, and each floor opened after it a pool one', async () => {
  const opened = [await openProject(ws, 'alpha'), await openProject(ws, 'beta')];
  const ground = (await resolveProject(ws, 0)).record;
  expect([ground, ...opened].map(identityOf)).toEqual([
    { color: 'silver', emoji: '🔧' },
    { color: 'blue', emoji: '🌊' },
    { color: 'green', emoji: '🌲' },
  ]);
  // On disk, at the end of the record's front matter.
  expect(readFileSync(join(ws, 'projects/1-alpha/project.md'), 'utf8')).toContain(
    'color: blue\nemoji: 🌊\n---\n',
  );
});

test("a closed floor's color and emoji are free again for the next floor opened", async () => {
  await openProject(ws, 'alpha'); // blue 🌊
  await closeProject(1);
  expect(identityOf(await openProject(ws, 'beta'))).toEqual({ color: 'blue', emoji: '🌊' });
});

test('thirteen open floors, as many as outrun the colors, share no emoji', async () => {
  for (let n = 1; n <= 12; n += 1) await openProject(ws, `floor-${n}`);
  const open = (await readProjects(ws))
    .map(({ record }) => record)
    .sort((a, b) => a.floor - b.floor);
  expect(new Set(open.map((r) => r.emoji)).size).toBe(13);
  // The eleventh and twelfth share a color with the first and second, and
  // differ from them by the next emoji of that color's row.
  expect(open.filter((r) => r.color === 'blue').map((r) => r.emoji)).toEqual(['🌊', '🐳']);
  expect(open.filter((r) => r.color === 'green').map((r) => r.emoji)).toEqual(['🌲', '🐸']);
});

// -- the verb -----------------------------------------------------------------------

test('identity: a named half is written and committed; the other half is kept', async () => {
  await openProject(ws, 'alpha'); // blue 🌊
  const report = await setFloorIdentity(ws, 1, { color: 'teal' });
  expect(report).toMatchObject({
    outcome: 'changed',
    identity: { color: 'teal', emoji: '🌊' },
    sharedColorWith: [],
  });
  expect(identityOf((await resolveProject(ws, 1)).record)).toEqual({ color: 'teal', emoji: '🌊' });
  expect(git(ws, 'log', '-1', '--format=%s').stdout.trim()).toStartWith(
    'Identify floor 1 as 🌊 teal',
  );
  expect(git(ws, 'status', '--porcelain').stdout).toBe('');
});

test('identity: naming nothing, or what it already wears, changes and commits nothing', async () => {
  await openProject(ws, 'alpha');
  const head = git(ws, 'rev-parse', 'HEAD').stdout;
  expect((await setFloorIdentity(ws, 1)).outcome).toBe('satisfied');
  expect((await setFloorIdentity(ws, 1, { color: 'blue', emoji: '🌊' })).outcome).toBe('satisfied');
  expect(git(ws, 'rev-parse', 'HEAD').stdout).toBe(head);
});

test('identity: a color another open floor wears is the human’s to choose, and is named', async () => {
  await openProject(ws, 'alpha');
  await openProject(ws, 'beta');
  const report = await setFloorIdentity(ws, 2, { color: 'blue', emoji: '🚀' });
  expect(report).toMatchObject({ outcome: 'changed', sharedColorWith: [1] });
  expect(report.identity).toEqual({ color: 'blue', emoji: '🚀' });
});

test('identity: the ground floor is satisfied by its own identity, named or not', async () => {
  const head = git(ws, 'rev-parse', 'HEAD').stdout;
  expect(await setFloorIdentity(ws, 0)).toMatchObject({ outcome: 'satisfied', identity: GROUND });
  expect((await setFloorIdentity(ws, 0, GROUND)).outcome).toBe('satisfied');
  expect(git(ws, 'rev-parse', 'HEAD').stdout).toBe(head);
});

test.each<[string, number, { color?: string; emoji?: string }, string]>([
  ['a color outside the palette', 1, { color: 'mauve' }, "'mauve' is not a floor color"],
  ['a hex value', 1, { color: '#0087ff' }, 'choose one of: blue, green'],
  ['two emoji', 1, { emoji: '🌊🌊' }, 'is not one emoji'],
  ['a word', 1, { emoji: 'wave' }, 'is not one emoji'],
  ['a floor that does not exist', 9, { color: 'red' }, 'no project on floor 9'],
  ['another color for the ground floor', 0, { color: 'red' }, 'its identity is not changed'],
  ['another emoji for the ground floor', 0, { emoji: '🚀' }, 'it wears 🔧 silver in every'],
  ["the ground floor's color on another floor", 1, { color: 'silver' }, "is the ground floor's"],
  ["the ground floor's emoji on another floor", 1, { emoji: '🔧' }, "🔧 is the ground floor's"],
  ['an emoji another open floor wears', 1, { emoji: '🌲' }, '🌲 is worn by floor 2 — beta'],
])('identity refuses %s, writing nothing', async (_, floor, change, says) => {
  await openProject(ws, 'alpha');
  await openProject(ws, 'beta'); // green 🌲
  const head = git(ws, 'rev-parse', 'HEAD').stdout;
  await expect(setFloorIdentity(ws, floor, change)).rejects.toThrow(says);
  expect(git(ws, 'rev-parse', 'HEAD').stdout).toBe(head);
});

test("identity: a closed floor's emoji is free to take", async () => {
  await openProject(ws, 'alpha'); // blue 🌊
  await openProject(ws, 'beta');
  await closeProject(1);
  expect((await setFloorIdentity(ws, 2, { emoji: '🌊' })).identity.emoji).toBe('🌊');
});

test('identity refuses a closed floor: it has no host to wear one', async () => {
  await openProject(ws, 'alpha');
  await closeProject(1);
  await expect(setFloorIdentity(ws, 1, { color: 'red' })).rejects.toThrow('floor 1 is closed');
});

test('a record whose color or emoji is not one the schema knows is refused on read', async () => {
  await openProject(ws, 'alpha');
  const file = join(ws, 'projects/1-alpha/project.md');
  writeFileSync(file, readFileSync(file, 'utf8').replace('color: blue', 'color: mauve'));
  await expect(resolveProject(ws, 1)).rejects.toThrow();
});

// -- convergence --------------------------------------------------------------------

test('convergence gives every open floor from before identities one, in floor order', async () => {
  await openProject(ws, 'alpha');
  await openProject(ws, 'beta');
  await openProject(ws, 'gone');
  await closeProject(3);
  for (const dir of ['0-workspace', '1-alpha', '2-beta', '3-gone']) strip(dir);
  git(ws, 'commit', '-am', 'as an older ward left it');

  expect(await identitiesStep()).toEqual({
    step: 'floor identities',
    outcome: 'established',
    detail: 'floor 0 🔧 silver, floor 1 🌊 blue, floor 2 🌲 green',
  });
  expect(identityOf((await resolveProject(ws, 2)).record)).toEqual({
    color: 'green',
    emoji: '🌲',
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
  expect(identityOf((await resolveProject(ws, 0)).record)).toEqual(GROUND);
  expect(identityOf((await resolveProject(ws, 1)).record)).toEqual({ color: 'green', emoji: '🌲' });

  expect((await identitiesStep())?.outcome).toBe('satisfied');
});

test('convergence moves the ground floor to its own identity, whatever it wore', async () => {
  await openProject(ws, 'alpha'); // blue 🌊
  wear('0-workspace', { color: 'blue', emoji: '🌊' }); // as design 0060 assigned it
  wear('1-alpha', { color: 'green', emoji: '🌲' });
  git(ws, 'commit', '-am', 'as design 0060 left it');

  expect(await identitiesStep()).toEqual({
    step: 'floor identities',
    outcome: 'established',
    detail: "floor 0 🌊 blue → 🔧 silver (the ground floor's own)",
  });
  expect(identityOf((await resolveProject(ws, 0)).record)).toEqual(GROUND);
  expect(identityOf((await resolveProject(ws, 1)).record)).toEqual({ color: 'green', emoji: '🌲' });
  expect(git(ws, 'log', '-1', '--format=%s').stdout).toStartWith('Converge Ward workspace');
  expect(git(ws, 'status', '--porcelain').stdout).toBe('');
  expect((await identitiesStep())?.outcome).toBe('satisfied');
});

test('convergence gives a floor repeating a lower floor’s emoji another, and keeps its color', async () => {
  // Thirteen open floors as design 0060 left them: the ground floor blue 🌊,
  // floors 11 and 12 repeating floors 1 and 2, and floor 10 set by hand.
  const before: FloorLook[] = [
    { color: 'blue', emoji: '🌊' },
    { color: 'green', emoji: '🌲' },
    { color: 'orange', emoji: '🍊' },
    { color: 'purple', emoji: '🍇' },
    { color: 'yellow', emoji: '🌻' },
    { color: 'teal', emoji: '🐬' },
    { color: 'red', emoji: '🍎' },
    { color: 'pink', emoji: '🌸' },
    { color: 'brown', emoji: '🐻' },
    { color: 'gray', emoji: '🐘' },
    { color: 'purple', emoji: '🌙' },
    { color: 'green', emoji: '🌲' },
    { color: 'orange', emoji: '🍊' },
  ];
  for (let n = 1; n <= 12; n += 1) await openProject(ws, `floor-${n}`);
  for (const [n, look] of before.entries()) wear(n === 0 ? '0-workspace' : `${n}-floor-${n}`, look);
  git(ws, 'commit', '-am', 'as design 0060 left it');

  expect((await identitiesStep())?.detail).toBe(
    "floor 0 🌊 blue → 🔧 silver (the ground floor's own), " +
      'floor 11 🌲 → 🐸 green (floor 1 wears 🌲), ' +
      'floor 12 🍊 → 🐯 orange (floor 2 wears 🍊)',
  );
  const after = (await readProjects(ws))
    .map(({ record }) => record)
    .sort((a, b) => a.floor - b.floor)
    .map(identityOf);
  expect(after).toEqual([
    GROUND,
    ...before.slice(1, 11), // floors 1–10 exactly as they were, floor 10's 🌙 included
    { color: 'green', emoji: '🐸' },
    { color: 'orange', emoji: '🐯' },
  ]);
  expect((await identitiesStep())?.outcome).toBe('satisfied');
});

test("convergence takes the ground floor's emoji off any other floor", async () => {
  await openProject(ws, 'alpha');
  wear('1-alpha', { color: 'red', emoji: '🔧' }); // written by hand, past the verb
  git(ws, 'commit', '-am', 'a hand edit');
  expect((await identitiesStep())?.detail).toBe('floor 1 🔧 → 🍎 red (floor 0 wears 🔧)');
});

test('convergence picks clear of a higher floor it has not reached, so that one is not touched', async () => {
  await openProject(ws, 'alpha');
  await openProject(ws, 'beta');
  await openProject(ws, 'gamma');
  wear('1-alpha', { color: 'green', emoji: '🌲' });
  wear('2-beta', { color: 'green', emoji: '🌲' }); // repeats floor 1
  wear('3-gamma', { color: 'pink', emoji: '🐸' }); // wears what floor 2 would be handed first
  git(ws, 'commit', '-am', 'a hand edit');
  expect((await identitiesStep())?.detail).toBe('floor 2 🌲 → 🍀 green (floor 1 wears 🌲)');
  expect(identityOf((await resolveProject(ws, 3)).record)).toEqual({ color: 'pink', emoji: '🐸' });
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

/** Put an identity on a floor's record on disk — what an earlier ward, or a hand, wrote. */
function wear(dir: string, look: FloorLook): void {
  strip(dir);
  const file = join(ws, 'projects', dir, 'project.md');
  const text = readFileSync(file, 'utf8');
  const end = text.indexOf('\n---\n', 4);
  writeFileSync(
    file,
    `${text.slice(0, end)}\ncolor: ${look.color}\nemoji: ${look.emoji}${text.slice(end)}`,
  );
}

async function identitiesStep() {
  return (await convergeWorkspace(ws)).steps.find((s) => s.step === 'floor identities');
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
