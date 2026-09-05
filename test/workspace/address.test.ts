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
  nextRoom,
  parseTaskAddress,
  ROOMS_PER_FLOOR,
  taskAddress,
  taskFloor,
} from '../../src/workspace/address.ts';
import { createWorkspace } from '../../src/workspace/create.ts';
import { openProject } from '../../src/workspace/projects.ts';
import { resolveOpenTask } from '../../src/workspace/scan.ts';
import { closeTask, openTask } from '../../src/workspace/tasks.ts';
import { applyGitTestEnv, makeTempDir, removeDir } from '../helpers.ts';

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
  // A bare task's room IS its full address.
  { dir: 'tasks/t18-a', code: 't18', address: 't18' },
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

const parses: ReadonlyArray<{ input: string; parsed: { floor?: number; room: number } | null }> = [
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
  { input: 'f0t1', parsed: null }, // floors start at 1
  { input: 'json-output', parsed: null },
  { input: '', parsed: null },
];

for (const { input, parsed } of parses) {
  test(`parse: '${input}' → ${JSON.stringify(parsed)}`, () => {
    expect(parseTaskAddress(input)).toEqual(parsed);
  });
}

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
  // A floor whose rooms ran to t21 and a bare pool that ran to t4 — the shape
  // this scheme has to continue from without renumbering anything.
  await openProject(ws, 'toolchain'); // floor 2
  await openProject(ws, 'delivery'); // floor 3
  await seedTask(ws, 'projects/3-delivery/tasks', 21, 'old-work', '2026-08-30T00:00:00.000Z');
  await seedTask(ws, 'tasks', 4, 'old-bare', '2026-09-01T00:00:00.000Z');

  const onFloor = await openTask(ws, 'next-up', { floor: 3 });
  expect(taskAddress(onFloor)).toBe('f3t22');
  const bare = await openTask(ws, 'next-bare', {});
  expect(taskAddress(bare)).toBe('t5');
  // A floor that has handed out nothing starts its own sequence at 1.
  expect(taskAddress(await openTask(ws, 'fresh-floor', { floor: 2 }))).toBe('f2t1');
});

test('the same room on two floors is two tasks, each addressable', async () => {
  await openProject(ws, 'a'); // floor 2
  await openProject(ws, 'b'); // floor 3
  await openTask(ws, 'left', { floor: 2 });
  await openTask(ws, 'right', { floor: 3 });

  expect((await resolveOpenTask(ws, 'f2t1')).record.slug).toBe('left');
  expect((await resolveOpenTask(ws, 'F3T1')).record.slug).toBe('right'); // case-folded
});

test('a bare room is a shorthand: unique resolves, ambiguous refuses by name', async () => {
  await openProject(ws, 'a'); // floor 2
  await openTask(ws, 'only-one', { floor: 2 });
  expect((await resolveOpenTask(ws, 't1')).record.slug).toBe('only-one');

  await openProject(ws, 'b'); // floor 3
  await openTask(ws, 'the-other', { floor: 3 });
  expect(resolveOpenTask(ws, 't1')).rejects.toThrow(
    /t1 is ambiguous — f2t1 \(only-one\), f3t1 \(the-other\); name one/,
  );
  // The full address still resolves, which is the point of refusing.
  expect((await resolveOpenTask(ws, 'f3t1')).record.slug).toBe('the-other');
});

test('closing one candidate makes the shorthand unique again', async () => {
  await openProject(ws, 'a'); // floor 2
  await openProject(ws, 'b'); // floor 3
  await openTask(ws, 'left', { floor: 2 });
  await openTask(ws, 'right', { floor: 3 });
  await closeTask(ws, 'f2t1', 'abandoned');
  expect((await resolveOpenTask(ws, 't1')).record.slug).toBe('right');
});

test('the refusals name the two forms and the listing', async () => {
  expect(resolveOpenTask(ws, 'nonsense')).rejects.toThrow(/is not a task address/);
  expect(resolveOpenTask(ws, 'f9t1')).rejects.toThrow(
    /no open task at f9t1 — floor 9 holds no open task in room 1/,
  );
  expect(resolveOpenTask(ws, 't7')).rejects.toThrow(/no open task has code 't7'/);
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
  await createWorkspace(ws);
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
): Promise<void> {
  const dir = `${container}/t${room}-${slug}`;
  mkdirSync(join(root, dir), { recursive: true });
  const record: TaskRecord = {
    type: 'task',
    code: `t${room}`,
    slug,
    state: 'closed',
    outcome: 'delivered',
    prs: [],
    openedAt,
    closedAt: openedAt,
  };
  await writeDocument(root, taskRecordType(dir), { data: record, body: 'seeded' });
}
