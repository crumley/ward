// The store's document layer: typed markdown documents round-trip through
// write/read, serialization is deterministic, invalid documents fail with a
// legible error naming the file and the issue, and writes leave no debris
// (design/0002-store-and-workspace/).
import { afterAll, beforeAll, expect, test } from 'bun:test';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { WardError } from '../../src/errors.ts';
import { readDocument, writeDocument } from '../../src/store/document.ts';
import { workspaceRecordType } from '../../src/store/types.ts';
import { makeTempDir, removeDir } from '../helpers.ts';

test('a written document reads back identically (round-trip)', async () => {
  await writeDocument(root, workspaceRecordType, sample);
  const readBack = await readDocument(root, workspaceRecordType);
  expect(readBack.data).toEqual(sample.data);
  expect(readBack.body).toBe(`${sample.body}\n`);
});

test('serialization is deterministic — writing twice produces identical bytes', async () => {
  await writeDocument(root, workspaceRecordType, sample);
  const first = await recordText();
  await writeDocument(root, workspaceRecordType, sample);
  expect(await recordText()).toBe(first);
});

test('a document without a front-matter fence fails legibly', async () => {
  await Bun.write(recordPath(), 'no front matter here\n');
  expect(readDocument(root, workspaceRecordType)).rejects.toThrow(/workspace\.md.*fence/);
});

test('a document violating its schema names the offending field', async () => {
  await Bun.write(recordPath(), '---\ntype: workspace\nname: x\ncreatedAt: now\n---\n');
  expect(readDocument(root, workspaceRecordType)).rejects.toThrow(/wardVersion/);
});

test('schema failures are WardErrors — complete, presentable messages', async () => {
  await Bun.write(recordPath(), '---\ntype: nonsense\n---\n');
  expect(readDocument(root, workspaceRecordType)).rejects.toBeInstanceOf(WardError);
});

test('writes stage in .ward/tmp and leave nothing behind', async () => {
  await writeDocument(root, workspaceRecordType, sample);
  expect(readdirSync(join(root, '.ward', 'tmp'))).toEqual([]);
});

// -- setup ----------------------------------------------------------------

let root: string;

const sample = {
  data: {
    type: 'workspace' as const,
    name: 'sample',
    wardVersion: '0.1.0',
    createdAt: '2026-08-02T00:00:00.000Z',
  },
  body: 'A body of prose.',
};

function recordPath(): string {
  return join(root, workspaceRecordType.relPath);
}

async function recordText(): Promise<string> {
  return await Bun.file(recordPath()).text();
}

beforeAll(() => {
  root = makeTempDir();
});

afterAll(() => {
  removeDir(root);
});
