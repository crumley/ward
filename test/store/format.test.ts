// The workspace format guard (design/0066-workspace-format-guard/): the marker
// is read on its own terms, a workspace above this Ward's level is refused by
// the document layer itself, a shape a level introduces waits for the
// workspace to reach that level — and the record shapes are pinned against the
// level, so a schema that widens without the level moving fails here.
//
// RE-PINNING. When the last test in this file fails because a record schema
// changed, decide first whether the format level moves (the test's message
// says how), then rewrite the pin:
//
//   WARD_PIN_SHAPES=1 bun test test/store/format.test.ts
import { afterAll, beforeAll, expect, test } from 'bun:test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { WardError } from '../../src/errors.ts';
import { readDocument, readDocumentSync, writeDocument } from '../../src/store/document.ts';
import {
  checkFormat,
  FORMAT_LEVEL,
  FORMAT_LEVELS,
  type FormatLevel,
  formatOf,
  levelNeededBy,
  levelsCrossed,
  requireFormatFor,
  WorkspaceTooNewError,
} from '../../src/store/format.ts';
import {
  baselinesSchema,
  briefSchema,
  catalogSchema,
  catalogType,
  dispatchSchema,
  projectSchema,
  repositoryRecordType,
  repositorySchema,
  sessionSchema,
  taskSchema,
  workspaceRecordSchema,
  workspaceRecordType,
  worktreeSchema,
} from '../../src/store/types.ts';
import { makeTempDir, removeDir } from '../helpers.ts';

// -- the marker -------------------------------------------------------------

test.each([
  ['no marker: every record before the guard', record(''), { state: 'level', level: 0 }],
  ['a level', record('format: 1\n'), { state: 'level', level: 1 }],
  ['a level far above this ward', record('format: 412\n'), { state: 'level', level: 412 }],
  [
    'trailing space is not a different marker',
    record('format: 2  \n'),
    { state: 'level', level: 2 },
  ],
  ['a marker that is not a level', record('format: 2.1\n'), { state: 'unreadable', raw: '2.1' }],
  ['a marker that became a map', record('format:\n  level: 3\n'), { state: 'unreadable', raw: '' }],
  [
    'a quoted level is a spelling this ward does not write',
    record('format: "2"\n'),
    { state: 'unreadable', raw: '"2"' },
  ],
  ['a negative level', record('format: -1\n'), { state: 'unreadable', raw: '-1' }],
  [
    'the body may say format: 9 about anything',
    `${record('')}\nformat: 9\n`,
    { state: 'level', level: 0 },
  ],
  [
    'a nested key named format is not the marker',
    record('agent:\n  format: 7\n'),
    { state: 'level', level: 0 },
  ],
  ['no fences at all: the text is asked whole', 'format: 5\n', { state: 'level', level: 5 }],
] as const)('formatOf — %s', (_name, text, expected) => {
  expect(formatOf(text)).toEqual(expected);
});

test('the levels run 1, 2, 3 … with no gap, and this ward reads the last', () => {
  expect(FORMAT_LEVELS.map((entry) => entry.level)).toEqual(
    FORMAT_LEVELS.map((_entry, index) => index + 1),
  );
  expect(FORMAT_LEVEL).toBe(FORMAT_LEVELS.length);
  for (const entry of FORMAT_LEVELS) {
    expect(entry.older.length).toBeGreaterThan(20); // the upgrade prints it: never empty
    expect(entry.introduces.length).toBeGreaterThan(20);
  }
});

// -- the guard, at the document layer ---------------------------------------

test('a root with no workspace record has no level: a global directory, a root being created', async () => {
  const root = fresh('bare');
  expect(checkFormat(root)).toEqual({ readable: true, level: 0 });
  await writeDocument(root, catalogType, catalog); // and the store works there
  expect((await readDocument(root, catalogType)).data).toEqual(catalog.data);
});

test.each([
  ['this ward’s own level', `format: ${FORMAT_LEVEL}\n`, FORMAT_LEVEL],
  ['a workspace from before the marker', '', 0],
])('readable — %s', async (_name, marker, level) => {
  const root = workspaceAt(fresh('ok'), marker);
  expect(checkFormat(root)).toEqual({ readable: true, level });
  expect((await readDocument(root, workspaceRecordType)).data.name).toBe('fixture');
});

test.each([
  ['one level up', `format: ${FORMAT_LEVEL + 1}\n`, `reads workspace format ${FORMAT_LEVEL + 1}`],
  ['a marker this ward cannot interpret', 'format: v2\n', 'cannot interpret (format: v2)'],
])('too new — %s: every read and write is refused, before parsing', async (_name, marker, says) => {
  const root = workspaceAt(fresh('new'), marker);
  // A record that would not even parse: the refusal must come first, or the
  // reader would be told about a schema error instead of its own age.
  mkdirSync(join(root, 'repositories'));
  writeFileSync(join(root, 'repositories', 'x.md'), '---\ntype: repository\nshape: unknown\n---\n');

  const verdict = checkFormat(root);
  expect(verdict.readable).toBe(false);
  const message = verdict.readable ? '' : verdict.message;
  expect(message).toContain(`this ward is too old for the workspace at ${root}`);
  expect(message).toContain(says);
  expect(message).toContain(`reads up to format ${FORMAT_LEVEL}`);
  expect(message).toContain('Update ward on this machine');

  expect(readDocument(root, repositoryRecordType('x'))).rejects.toThrow(message);
  expect(readDocument(root, workspaceRecordType)).rejects.toBeInstanceOf(WorkspaceTooNewError);
  expect(() => readDocumentSync(root, workspaceRecordType)).toThrow(WorkspaceTooNewError);
  const before = readFileSync(join(root, 'workspace.md'), 'utf8');
  expect(writeDocument(root, catalogType, catalog)).rejects.toBeInstanceOf(WorkspaceTooNewError);
  expect(writeDocument(root, workspaceRecordType, sample)).rejects.toBeInstanceOf(WardError);
  expect(readFileSync(join(root, 'workspace.md'), 'utf8')).toBe(before);
});

test('the verdict follows the record: raised underfoot, the next read refuses', async () => {
  const root = workspaceAt(fresh('moves'), `format: ${FORMAT_LEVEL}\n`);
  expect(checkFormat(root).readable).toBe(true);
  workspaceAt(root, `format: ${FORMAT_LEVEL + 3}\n`); // a pull brought a newer record
  expect(checkFormat(root).readable).toBe(false);
  expect(readDocument(root, workspaceRecordType)).rejects.toBeInstanceOf(WorkspaceTooNewError);
});

// -- a newer Ward on an older workspace ---------------------------------------

test.each([
  ['a document no level distinguishes', 'repository', { checkout: undefined }, 0],
  ['the shape level 2 introduced', 'repository', { checkout: 'elsewhere' }, 2],
  ['the same field on another record type', 'project', { checkout: 'elsewhere' }, 0],
  ['the highest level that recognizes it wins', 'project', { color: 'ultraviolet' }, 3],
] as const)('levelNeededBy — %s', (_name, type, data, level) => {
  expect(levelNeededBy(type, data, FUTURE)).toBe(level);
});

test('a shape waits for its level: refused below it with the remedy, written at it', () => {
  const below = workspaceAt(fresh('below'), 'format: 1\n');
  expect(() => requireFormatFor(below, 'repository', { checkout: 'elsewhere' }, FUTURE)).toThrow(
    `this repository record needs workspace format 2 (checkouts that stand elsewhere), and the ` +
      `workspace at ${below} is at format 1 — raise it first, with: ward workspace upgrade`,
  );
  // Everything else a newer Ward writes there proceeds.
  expect(() =>
    requireFormatFor(below, 'repository', { checkout: undefined }, FUTURE),
  ).not.toThrow();
  const at = workspaceAt(fresh('at'), 'format: 2\n');
  expect(() => requireFormatFor(at, 'repository', { checkout: 'elsewhere' }, FUTURE)).not.toThrow();
  const unmarked = workspaceAt(fresh('unmarked'), '');
  expect(() => requireFormatFor(unmarked, 'project', { color: 'ultraviolet' }, FUTURE)).toThrow(
    /needs workspace format 3 .* is at format 0/,
  );
});

test('levelsCrossed names each level a raise passes, lowest first', () => {
  expect(levelsCrossed(0, 3, FUTURE).map((entry) => entry.level)).toEqual([1, 2, 3]);
  expect(levelsCrossed(2, 3, FUTURE).map((entry) => entry.level)).toEqual([3]);
  expect(levelsCrossed(3, 3, FUTURE)).toEqual([]);
});

// -- the pin ------------------------------------------------------------------

test.each([
  [
    'an enum gains a value (the color `silver`)',
    { color: { type: 'string', enum: ['a'] } },
    { color: { type: 'string', enum: ['a', 'b'] } },
    ['x.color: gains the value "b"'],
  ],
  [
    'an enum loses a value: an older reader still reads everything written',
    { color: { type: 'string', enum: ['a', 'b'] } },
    { color: { type: 'string', enum: ['a'] } },
    [],
  ],
  [
    'a closed set opens',
    { color: { type: 'string', enum: ['a'] } },
    { color: { type: 'string' } },
    ['x.color: was one of a closed set, now any string'],
  ],
  [
    'a constant changes',
    { type: { type: 'string', const: 'a' } },
    { type: { type: 'string', const: 'b' } },
    ['x.type: gains the value "b"'],
  ],
  [
    'a type changes',
    { n: { type: 'integer' } },
    { n: { type: 'string' } },
    ['x.n: type integer → string'],
  ],
  [
    'a floor is lowered',
    { n: { type: 'integer', minimum: 1 } },
    { n: { type: 'integer', minimum: 0 } },
    ['x.n: minimum loosened (1 → 0)'],
  ],
  [
    'a floor is raised: tighter, still readable',
    { n: { type: 'integer', minimum: 0 } },
    { n: { type: 'integer', minimum: 1 } },
    [],
  ],
  [
    'a pattern changes',
    { id: { type: 'string', pattern: '^a$' } },
    { id: { type: 'string', pattern: '^b$' } },
    ['x.id: pattern changed'],
  ],
  [
    'inside an array',
    { l: { type: 'array', items: { type: 'string', enum: ['a'] } } },
    { l: { type: 'array', items: { type: 'string', enum: ['a', 'z'] } } },
    ['x.l[]: gains the value "z"'],
  ],
  [
    'a NEW field is not seen: an older reader drops it, and whether that is safe is judgement (`checkout: external`)',
    {},
    { checkout: { type: 'string', const: 'external' } },
    [],
  ],
] as const)('widenings — %s', (_name, before, after, expected) => {
  expect(widenings({ x: object(before) }, { x: object(after) })).toEqual([...expected]);
});

test('a field an older reader requires may not become optional or vanish', () => {
  const before = { x: object({ name: { type: 'string' } }, ['name']) };
  expect(widenings(before, { x: object({ name: { type: 'string' } }, []) })).toEqual([
    'x.name: was required, now optional — an older reader rejects a record without it',
  ]);
  expect(widenings(before, { x: object({}, []) })).toEqual([
    'x.name: was required, now gone — an older reader rejects a record without it',
  ]);
  expect(widenings(before, {})).toEqual(['x: the record type is gone']);
});

// The developer's check. Two failures, in the order they are met:
//
// 1. A schema WIDENED — it now accepts, in a field an older Ward knows, a value
//    that Ward rejects — and FORMAT_LEVEL has not moved since the pin. That is
//    mechanical, and it is the `silver` incident: append a level to
//    FORMAT_LEVELS in src/store/format.ts, then re-pin.
// 2. The shapes changed in any other way. That is the judgement half, and it
//    is the `checkout: external` incident: a NEW field is dropped by an older
//    Ward, never rejected, so no check can tell a harmless addition from one
//    an older Ward will act wrongly without. Ask: "would a Ward one level back,
//    reading a record that carries this, do the wrong thing?" Yes — append a
//    level (and give it a `needs` that recognizes the shape). Then re-pin.
//    What no pin sees at all: a refinement's rule, and a field whose meaning
//    changed while its type did not.
test('the record shapes are the ones pinned for this format level', () => {
  const current = { format: FORMAT_LEVEL, shapes: recordShapes() };
  const widened = widenings(pinned.shapes, current.shapes);
  if (widened.length > 0 && FORMAT_LEVEL <= pinned.format) {
    throw new Error(
      `a record schema now accepts what a ward at format ${pinned.format} rejects, and the ` +
        `format level has not moved:\n  ${widened.join('\n  ')}\n` +
        'append a level to FORMAT_LEVELS (src/store/format.ts), then re-pin: ' +
        'WARD_PIN_SHAPES=1 bun test test/store/format.test.ts',
    );
  }
  if (process.env.WARD_PIN_SHAPES === '1') {
    writeFileSync(PIN_FILE, `${JSON.stringify(current, null, 2)}\n`);
    return;
  }
  expect(
    current,
    'a record schema changed since the shapes were pinned — read the comment above this test, ' +
      'decide whether the format level moves, then re-pin: ' +
      'WARD_PIN_SHAPES=1 bun test test/store/format.test.ts',
  ).toEqual(pinned);
});

// -- setup ------------------------------------------------------------------

type Shape = { readonly [key: string]: unknown };
type Shapes = { readonly [type: string]: Shape };

const PIN_FILE = new URL('../fixtures/record-shapes.json', import.meta.url).pathname;
const pinned = JSON.parse(readFileSync(PIN_FILE, 'utf8')) as { format: number; shapes: Shapes };

/** Every Ward-owned record type's shape, as JSON Schema — what a reader accepts. */
function recordShapes(): Shapes {
  const schemas = {
    baselines: baselinesSchema,
    brief: briefSchema,
    catalog: catalogSchema,
    dispatch: dispatchSchema,
    project: projectSchema,
    repository: repositorySchema,
    session: sessionSchema,
    task: taskSchema,
    workspace: workspaceRecordSchema,
    worktree: worktreeSchema,
  };
  return Object.fromEntries(
    Object.entries(schemas).map(([name, schema]) => {
      const { $schema: _dialect, ...shape } = z.toJSONSchema(schema, { unrepresentable: 'any' });
      return [name, shape as Shape];
    }),
  );
}

/**
 * Where `after` accepts, in a place `before` already describes, something
 * `before` rejects: what a reader holding `before` would refuse in a record
 * written under `after`. New properties are deliberately not reported — a
 * reader drops a field it does not know.
 */
function widenings(before: Shapes, after: Shapes): string[] {
  const found: string[] = [];
  for (const [name, shape] of Object.entries(before)) {
    const now = after[name];
    if (now === undefined) found.push(`${name}: the record type is gone`);
    else compare(name, shape, now, found);
  }
  return found;
}

function compare(path: string, before: Shape, after: Shape, found: string[]): void {
  if (before.type !== after.type) {
    found.push(`${path}: type ${String(before.type)} → ${String(after.type)}`);
    return;
  }
  const accepted = (shape: Shape): unknown[] | undefined =>
    Array.isArray(shape.enum) ? shape.enum : 'const' in shape ? [shape.const] : undefined;
  const was = accepted(before);
  const is = accepted(after);
  if (was !== undefined && is === undefined) {
    found.push(`${path}: was one of a closed set, now any ${String(after.type)}`);
  } else if (was !== undefined && is !== undefined) {
    for (const value of is) {
      if (!was.includes(value)) found.push(`${path}: gains the value ${JSON.stringify(value)}`);
    }
  }
  for (const [bound, looser] of [
    ['minimum', (a: number, b: number) => b < a],
    ['exclusiveMinimum', (a: number, b: number) => b < a],
    ['minLength', (a: number, b: number) => b < a],
    ['minItems', (a: number, b: number) => b < a],
    ['maximum', (a: number, b: number) => b > a],
    ['maxLength', (a: number, b: number) => b > a],
    ['maxItems', (a: number, b: number) => b > a],
  ] as const) {
    const a = before[bound];
    const b = after[bound];
    if (typeof a !== 'number') continue;
    if (typeof b !== 'number' || looser(a, b)) {
      found.push(`${path}: ${bound} loosened (${a} → ${typeof b === 'number' ? b : 'none'})`);
    }
  }
  if (before.pattern !== undefined && before.pattern !== after.pattern) {
    found.push(`${path}: pattern changed`);
  }
  if (isShape(before.items) && isShape(after.items)) {
    compare(`${path}[]`, before.items, after.items, found);
  }
  const fields = isShape(before.properties) ? before.properties : {};
  const fieldsNow = isShape(after.properties) ? after.properties : {};
  const required = Array.isArray(before.required) ? before.required : [];
  const requiredNow = Array.isArray(after.required) ? after.required : [];
  for (const [field, shape] of Object.entries(fields)) {
    const now = fieldsNow[field];
    const missing = 'an older reader rejects a record without it';
    if (!isShape(now)) {
      if (required.includes(field))
        found.push(`${path}.${field}: was required, now gone — ${missing}`);
      continue;
    }
    if (required.includes(field) && !requiredNow.includes(field)) {
      found.push(`${path}.${field}: was required, now optional — ${missing}`);
    }
    if (isShape(shape)) compare(`${path}.${field}`, shape, now, found);
  }
}

function isShape(value: unknown): value is Shape {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function object(properties: Shape, required: readonly string[] = []): Shape {
  return { type: 'object', properties, required };
}

/** Two levels that do not exist yet, each with a shape only it can read. */
const FUTURE: readonly FormatLevel[] = [
  ...FORMAT_LEVELS.filter((entry) => entry.level === 1),
  {
    level: 2,
    entry: 'test',
    introduces: 'checkouts that stand elsewhere',
    older: 'would clone them',
    needs: (type, data) => type === 'repository' && field(data, 'checkout') === 'elsewhere',
  },
  {
    level: 3,
    entry: 'test',
    introduces: 'a color outside the visible palette',
    older: 'would refuse the floor',
    needs: (type, data) => type === 'project' && field(data, 'color') === 'ultraviolet',
  },
];

function field(data: unknown, name: string): unknown {
  return isShape(data) ? data[name] : undefined;
}

function record(marker: string): string {
  return `---\ntype: workspace\nname: fixture\nwardVersion: 0.1.0\ncreatedAt: 2026-11-16T00:00:00.000Z\n${marker}---\n\nThe body.\n`;
}

/** Write a workspace record carrying `marker` at `root`, as a store write does: by rename. */
function workspaceAt(root: string, marker: string): string {
  writeFileSync(join(root, 'workspace.md.next'), record(marker));
  Bun.spawnSync(['mv', join(root, 'workspace.md.next'), join(root, 'workspace.md')]);
  return root;
}

const sample = {
  data: {
    type: 'workspace' as const,
    name: 'fixture',
    wardVersion: '0.1.0',
    createdAt: '2026-11-16T00:00:00.000Z',
  },
  body: 'A body.',
};

const catalog = { data: { type: 'catalog' as const, artifactTypes: [] }, body: 'A catalog.' };

let scratch: string;
let count = 0;

function fresh(name: string): string {
  const dir = join(scratch, `${name}-${count++}`);
  mkdirSync(dir);
  return dir;
}

beforeAll(() => {
  scratch = makeTempDir();
});

afterAll(() => {
  removeDir(scratch);
});
