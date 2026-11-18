// The task address (design/0036-floor-addressed-tasks/): composing it from
// containment plus the room, parsing what a caller typed, resolving a full
// address and the bare shorthand against the open set — including the
// ambiguity the shorthand must refuse rather than guess at — and the
// per-container room sequence that runs in opening order.
import { afterAll, beforeAll, beforeEach, expect, test } from 'bun:test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { writeDocument } from '../../src/store/document.ts';
import { type TaskRecord, taskRecordType } from '../../src/store/types.ts';
import {
  addressMatches,
  collidingRooms,
  distinctAddress,
  nextRoom,
  parseTaskAddress,
  qualifiedAddress,
  ROOMS_PER_FLOOR,
  type TaskAddress,
  taskAddress,
  taskFloor,
} from '../../src/workspace/address.ts';
import { GROUND_FLOOR, openProject } from '../../src/workspace/projects.ts';
import { resolveOpenTask } from '../../src/workspace/scan.ts';
import { closeTask, openTask } from '../../src/workspace/tasks.ts';
import { applyGitTestEnv, makeTempDir, removeDir } from '../helpers.ts';
import { preparedWorkspace } from '../prepared.ts';

// -- composing: containment answers, the record's field backs it up --------

const addresses: ReadonlyArray<{
  dir: string;
  code: string;
  floor?: number;
  on?: number;
  address: string;
}> = [
  { dir: 'projects/3-toolchain/tasks/t1-a', code: 't1', floor: 3, on: 3, address: 'f3t1' },
  { dir: 'projects/12-big/tasks/t22-a', code: 't22', floor: 12, on: 12, address: 'f12t22' },
  // Containment answers even when the record carries no floor field.
  { dir: 'projects/5-x/tasks/t9-a', code: 't9', on: 5, address: 'f5t9' },
  // A legacy bare task names its pool where a floor would be (0053).
  { dir: 'tasks/t18-a', code: 't18', address: 'legacy-t18' },
  // Read outside its tree, the record's own field still composes one.
  { dir: 'elsewhere/t4-a', code: 't4', floor: 7, on: 7, address: 'f7t4' },
];

for (const { dir, code, floor, on, address } of addresses) {
  test(`address: ${dir} (${code}) is ${address}`, () => {
    const task = { dir, record: { code, ...(floor === undefined ? {} : { floor }) } };
    expect(taskAddress(task)).toBe(address);
    expect(taskFloor(task)).toBe(on as number);
  });
}

// -- parsing: one form, case-folded ---------------------------------------

const parses: ReadonlyArray<{ input: string; parsed: TaskAddress | null }> = [
  { input: 'f3t1', parsed: { floor: 3, room: 1 } },
  { input: 'F3T1', parsed: { floor: 3, room: 1 } }, // case-insensitive, one canonical spelling
  { input: 't18', parsed: { room: 18 } },
  { input: 'T18', parsed: { room: 18 } },
  { input: 'f12t99', parsed: { floor: 12, room: 99 } },
  { input: '3t1', parsed: null }, // never a second spelling of the same address
  { input: '3-1', parsed: null },
  { input: 'f3', parsed: null },
  { input: 't0', parsed: null }, // rooms start at 1
  { input: 't100', parsed: null }, // and stop at the ceiling
  { input: 'f0t1', parsed: { floor: 0, room: 1 } }, // the ground floor (0041)
  { input: 'f-1t1', parsed: null }, // and there is nothing below it
  // The legacy pool's full address (0053): one spelling, case-folded, and
  // no slip of a floor address lands on it.
  { input: 'legacy-t2', parsed: { legacy: true, room: 2 } },
  { input: 'LEGACY-T2', parsed: { legacy: true, room: 2 } },
  { input: 'ft2', parsed: null }, // f3t2 with the digit dropped is nothing, not legacy
  { input: 'legacy:t2', parsed: null },
  { input: 'legacyt2', parsed: null },
  { input: 'legacy-f3t2', parsed: null },
  { input: 'legacy-t0', parsed: null },
  { input: 'legacy-t100', parsed: null },
  { input: 'json-output', parsed: null },
  { input: '', parsed: null },
  // The slug qualifier (0058): the floor plus the record's directory name
  // names one task in a room two machines both handed out.
  { input: 'f5t45-distill-2026-10-18', parsed: { floor: 5, room: 45, slug: 'distill-2026-10-18' } },
  { input: 'F5T45-Week-Start-Job', parsed: { floor: 5, room: 45, slug: 'week-start-job' } },
  { input: 't45-distill', parsed: { room: 45, slug: 'distill' } },
  { input: 'legacy-t2-seam', parsed: { legacy: true, room: 2, slug: 'seam' } },
  { input: 'f5t45-', parsed: null }, // a qualifier is a slug, never empty
  { input: 'f5t45--x', parsed: null }, // and starts with a letter or digit
  { input: 'f5t45:distill', parsed: null }, // no colon: addresses travel into refs
  { input: 'f5t100-x', parsed: null }, // the room ceiling holds under a qualifier
];

for (const { input, parsed } of parses) {
  test(`parse: '${input}' → ${JSON.stringify(parsed)}`, () => {
    expect(parseTaskAddress(input)).toEqual(parsed);
  });
}

// -- naming a task among its neighbours (0058) -----------------------------

const MAC = { dir: 'projects/5-b/tasks/t45-week-start-job', code: 't45', slug: 'week-start-job' };
const VM = { dir: 'projects/5-b/tasks/t45-distill', code: 't45', slug: 'distill' };
const OTHER = { dir: 'projects/6-c/tasks/t45-elsewhere', code: 't45', slug: 'elsewhere' };
const LONE = { dir: 'projects/5-b/tasks/t9-lone', code: 't9', slug: 'lone' };

const naming: ReadonlyArray<{
  name: string;
  task: { dir: string; code: string; slug: string; state: string };
  among: ReadonlyArray<{ dir: string; code: string; slug: string; state: string }>;
  address: string;
}> = [
  {
    name: 'a room only one task holds keeps its short address',
    task: { ...LONE, state: 'active' },
    among: [{ ...MAC, state: 'active' }],
    address: 'f5t9',
  },
  {
    name: 'two open tasks in one room are each qualified by slug',
    task: { ...MAC, state: 'active' },
    among: [{ ...VM, state: 'active' }],
    address: 'f5t45-week-start-job',
  },
  {
    name: 'a paused rival contests the room too — only closed is out of it',
    task: { ...MAC, state: 'active' },
    among: [{ ...VM, state: 'paused' }],
    address: 'f5t45-week-start-job',
  },
  {
    name: 'an open task beside a closed one owns the room address',
    task: { ...MAC, state: 'active' },
    among: [{ ...VM, state: 'closed' }],
    address: 'f5t45',
  },
  {
    name: 'a closed task beside an open one is reached only by its qualified address',
    task: { ...VM, state: 'closed' },
    among: [{ ...MAC, state: 'active' }],
    address: 'f5t45-distill',
  },
  {
    name: 'two closed tasks in one room are each qualified',
    task: { ...VM, state: 'closed' },
    among: [{ ...MAC, state: 'closed' }],
    address: 'f5t45-distill',
  },
  {
    name: 'the same room on another floor is no rival',
    task: { ...MAC, state: 'active' },
    among: [{ ...OTHER, state: 'active' }],
    address: 'f5t45',
  },
];

for (const { name, task, among, address } of naming) {
  test(`naming: ${name}`, () => {
    const shape = (row: typeof task) => ({ dir: row.dir, record: row });
    const everyone = [shape(task), ...among.map(shape)];
    expect(distinctAddress(shape(task), everyone)).toBe(address);
    // Whatever Ward speaks resolves to this task and no other.
    const parsed = parseTaskAddress(address);
    expect(parsed).not.toBeNull();
    const live = everyone.filter((row) => row.record.state !== 'closed');
    const pool = task.state === 'closed' ? everyone.filter((row) => !live.includes(row)) : live;
    expect(pool.filter((row) => addressMatches(row, parsed as TaskAddress))).toEqual([shape(task)]);
  });
}

test('qualified: the floor plus the record directory, for every task', () => {
  expect(qualifiedAddress({ dir: MAC.dir, record: MAC })).toBe('f5t45-week-start-job');
  expect(qualifiedAddress({ dir: 'tasks/t2-seam', record: { code: 't2', slug: 'seam' } })).toBe(
    'legacy-t2-seam',
  );
});

test('colliding rooms: open holders only, per floor, in address order', () => {
  const rows = [
    { ...MAC, state: 'active' },
    { ...VM, state: 'paused' },
    { ...OTHER, state: 'active' },
    { ...LONE, state: 'active' },
    { dir: 'projects/5-b/tasks/t9-gone', code: 't9', slug: 'gone', state: 'closed' },
  ].map((row) => ({ dir: row.dir, record: row }));
  expect(
    collidingRooms(rows).map(({ address, holders }) => [
      address,
      holders.map((task) => task.record.slug),
    ]),
  ).toEqual([['f5t45', ['week-start-job', 'distill']]]);
});

// -- the room sequence: opening order, round the floor ---------------------

const sequences: ReadonlyArray<{
  name: string;
  cursor?: number;
  occupied: number[];
  next: number;
}> = [
  { name: 'an empty container starts at room 1', occupied: [], next: 1 },
  { name: 'the room after the most recently opened', cursor: 21, occupied: [], next: 22 },
  { name: 'a closed room is not handed back', cursor: 3, occupied: [2], next: 4 },
  { name: 'an open task in the way is skipped', cursor: 3, occupied: [4, 5], next: 6 },
  { name: 'the ceiling wraps back to 1', cursor: ROOMS_PER_FLOOR, occupied: [], next: 1 },
  {
    name: 'wrapping skips what is still held',
    cursor: ROOMS_PER_FLOOR,
    occupied: [1, 2],
    next: 3,
  },
  {
    name: 'every room held refuses (0, never a valid room)',
    cursor: 4,
    occupied: Array.from({ length: ROOMS_PER_FLOOR }, (_, i) => i + 1),
    next: 0,
  },
];

for (const { name, cursor, occupied, next } of sequences) {
  test(`rooms: ${name}`, () => {
    expect(
      nextRoom({ ...(cursor === undefined ? {} : { mostRecentRoom: cursor }), occupied }),
    ).toBe(next);
  });
}

test('a blocked room is skipped too — a closed task’s directory is never overwritten', () => {
  expect(nextRoom({ mostRecentRoom: 1, occupied: [] }, (room) => room === 2)).toBe(3);
});

// -- allocation against a workspace shaped like a real one ----------------

test('each container keeps its own sequence, continuing from its most recent task', async () => {
  // A floor whose rooms ran to t21, a legacy bare pool that ran to t4, and a
  // ground floor that has handed out nothing — the shape this scheme has to
  // continue from without renumbering anything.
  await openProject(ws, 'toolchain'); // floor 1
  await openProject(ws, 'delivery'); // floor 2
  await seedTask(ws, 'projects/2-delivery/tasks', 21, 'old-work', '2026-08-30T00:00:00.000Z');
  await seedTask(ws, 'tasks', 4, 'old-bare', '2026-09-01T00:00:00.000Z');

  const onFloor = await openTask(ws, 'next-up', { floor: 2 });
  expect(taskAddress(onFloor)).toBe('f2t22');
  // The ground floor's sequence is its own, and the legacy pool's t4 is no
  // part of it (design/0041-ground-floor/).
  expect(taskAddress(await openTask(ws, 'next-here', { floor: GROUND_FLOOR }))).toBe('f0t1');
  // A floor that has handed out nothing starts its own sequence at 1.
  expect(taskAddress(await openTask(ws, 'fresh-floor', { floor: 1 }))).toBe('f1t1');
});

test('the same room on two floors is two tasks, each addressable', async () => {
  await openProject(ws, 'a'); // floor 1
  await openProject(ws, 'b'); // floor 2
  await openTask(ws, 'left', { floor: 1 });
  await openTask(ws, 'right', { floor: 2 });

  expect((await resolveOpenTask(ws, 'f1t1')).record.slug).toBe('left');
  expect((await resolveOpenTask(ws, 'F2T1')).record.slug).toBe('right'); // case-folded
});

test('a bare room is a shorthand: unique resolves, ambiguous refuses by name', async () => {
  await openProject(ws, 'a'); // floor 1
  await openTask(ws, 'only-one', { floor: 1 });
  expect((await resolveOpenTask(ws, 't1')).record.slug).toBe('only-one');

  await openProject(ws, 'b'); // floor 2
  await openTask(ws, 'the-other', { floor: 2 });
  expect(resolveOpenTask(ws, 't1')).rejects.toThrow(
    /t1 is ambiguous — f1t1 \(only-one\), f2t1 \(the-other\); name one/,
  );
  // The full address still resolves, which is the point of refusing.
  expect((await resolveOpenTask(ws, 'f2t1')).record.slug).toBe('the-other');
});

test('closing one candidate makes the shorthand unique again', async () => {
  await openProject(ws, 'a'); // floor 1
  await openProject(ws, 'b'); // floor 2
  await openTask(ws, 'left', { floor: 1 });
  await openTask(ws, 'right', { floor: 2 });
  await closeTask(ws, 'f1t1', 'abandoned');
  expect((await resolveOpenTask(ws, 't1')).record.slug).toBe('right');
});

test('the refusals name the two forms and the listing', async () => {
  expect(resolveOpenTask(ws, 'nonsense')).rejects.toThrow(/is not a task address/);
  expect(resolveOpenTask(ws, 'f9t1')).rejects.toThrow(
    /no open task at f9t1 — floor 9 holds no open task in room 1/,
  );
  expect(resolveOpenTask(ws, 't7')).rejects.toThrow(/no open task has code 't7'/);
});

test('a legacy task sharing a floor task’s room is named by its own full address', async () => {
  await openProject(ws, 'a'); // floor 1
  await openTask(ws, 'on-a-floor', { floor: 1 });
  await seedTask(ws, 'tasks', 1, 'from-before', '2026-08-01T00:00:00.000Z', 'active');

  expect((await resolveOpenTask(ws, 'legacy-t1')).record.slug).toBe('from-before');
  expect((await resolveOpenTask(ws, 'f1t1')).record.slug).toBe('on-a-floor');
  expect(resolveOpenTask(ws, 't1')).rejects.toThrow(
    't1 is ambiguous — f1t1 (on-a-floor), legacy-t1 (from-before); name one',
  );
  // Closed, it answers to neither form (Identity: closed rooms belong to whoever is next).
  await closeTask(ws, 'legacy-t1', 'abandoned');
  expect(resolveOpenTask(ws, 'legacy-t1')).rejects.toThrow(/no open task at legacy-t1/);
  expect((await resolveOpenTask(ws, 't1')).record.slug).toBe('on-a-floor');
});

// -- setup ----------------------------------------------------------------
// A fresh workspace per case: allocation is about what a container already
// holds, so no case may inherit another's rooms.

let scratch: string;
let ws: string;

beforeAll(() => {
  applyGitTestEnv();
  scratch = makeTempDir();
});

afterAll(() => removeDir(scratch));

let counter = 0;
beforeEach(async () => {
  counter += 1;
  ws = join(scratch, `case-${counter}`);
  await preparedWorkspace(ws);
});

/**
 * A task record written straight into a container — the shape a workspace
 * that has been running for weeks already holds, without replaying every open
 * that produced it.
 */
async function seedTask(
  root: string,
  container: string,
  room: number,
  slug: string,
  openedAt: string,
  state: 'active' | 'closed' = 'closed',
): Promise<void> {
  const dir = `${container}/t${room}-${slug}`;
  mkdirSync(join(root, dir), { recursive: true });
  const record: TaskRecord = {
    type: 'task',
    code: `t${room}`,
    slug,
    state,
    prs: [],
    openedAt,
    ...(state === 'closed' ? { outcome: 'delivered' as const, closedAt: openedAt } : {}),
  };
  await writeDocument(root, taskRecordType(dir), { data: record, body: 'seeded' });
}
