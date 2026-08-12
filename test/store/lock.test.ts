// The store write lock's protocol (design/0013-telemetry-and-serialized-writes/):
// mutual exclusion, the bounded wait with a refusal naming the holder, and
// the takeover rules — a same-host holder is judged by its pid (a dead
// writer is taken over immediately, a live one is never aged out), while a
// holder of unknowable liveness (another host, unreadable content) is stale
// only past the age bound.
import { afterAll, afterEach, beforeAll, expect, test } from 'bun:test';
import { existsSync, mkdirSync, utimesSync, writeFileSync } from 'node:fs';
import { hostname } from 'node:os';
import { join } from 'node:path';
import { inspectStoreLock, storeLockPath, withStoreLock } from '../../src/store/lock.ts';
import { makeTempDir, removeDir } from '../helpers.ts';

test('contenders enter the critical section strictly one at a time', async () => {
  let inside = 0;
  let mostInside = 0;
  const order: number[] = [];
  await Promise.all(
    [1, 2, 3, 4, 5].map((n) =>
      withStoreLock(root, `test ${n}`, async () => {
        inside += 1;
        mostInside = Math.max(mostInside, inside);
        await Bun.sleep(5); // yield while holding, inviting the others in
        order.push(n);
        inside -= 1;
      }),
    ),
  );
  expect(mostInside).toBe(1);
  expect(order.length).toBe(5);
  expect(inspectStoreLock(root).present).toBe(false); // released after the last
});

test('the lock names its holder while held, and release removes it', async () => {
  await withStoreLock(root, 'task open probe', async () => {
    const seen = inspectStoreLock(root);
    expect(seen.present).toBe(true);
    expect(seen.verdict).toBe('live'); // our own pid, alive
    expect(seen.holder?.pid).toBe(process.pid);
    expect(seen.holder?.verb).toBe('task open probe');
    expect(seen.holder?.caller).toBe('human'); // WARD_AGENT is not set here
  });
  expect(existsSync(storeLockPath(root))).toBe(false);
});

test('a dead same-host holder is stale immediately — no age wait', async () => {
  writeLock({ pid: deadPid, host: hostname(), startedAt: new Date().toISOString() });
  expect(inspectStoreLock(root).verdict).toBe('stale');
  const started = Date.now();
  await withStoreLock(root, 'test takeover', async () => undefined);
  expect(Date.now() - started).toBeLessThan(5000); // took over, never aged out
  expect(existsSync(storeLockPath(root))).toBe(false);
});

test('a live same-host holder refuses at the bound, naming pid and verb', async () => {
  writeLock({ pid: process.pid, host: hostname(), verb: 'session open demo-1' });
  process.env.WARD_LOCK_TIMEOUT_MS = '300';
  const started = Date.now();
  await expect(withStoreLock(root, 'test blocked', async () => undefined)).rejects.toThrow(
    new RegExp(`write-locked by pid ${process.pid} .*session open demo-1`),
  );
  expect(Date.now() - started).toBeGreaterThanOrEqual(250); // the honest bounded wait
  expect(existsSync(storeLockPath(root))).toBe(true); // never stolen from a live holder
});

test('an unknown-host holder is live until the age bound, stale past it', async () => {
  process.env.WARD_LOCK_TIMEOUT_MS = '300';
  writeLock({ pid: 99999, host: 'somewhere-else', startedAt: new Date().toISOString() });
  expect(inspectStoreLock(root).verdict).toBe('live'); // liveness unknowable, age fresh
  await expect(withStoreLock(root, 'test wait', async () => undefined)).rejects.toThrow(
    /write-locked/,
  );

  const aged = new Date(Date.now() - 120_000).toISOString();
  writeLock({ pid: 99999, host: 'somewhere-else', startedAt: aged });
  expect(inspectStoreLock(root).verdict).toBe('stale');
  await withStoreLock(root, 'test aged-takeover', async () => undefined); // acquires
  expect(existsSync(storeLockPath(root))).toBe(false);
});

test('an unreadable lock ages by mtime: fresh waits, old is taken over', async () => {
  process.env.WARD_LOCK_TIMEOUT_MS = '300';
  const path = storeLockPath(root);
  mkdirSync(join(root, '.ward'), { recursive: true });
  writeFileSync(path, 'not json at all\n');
  expect(inspectStoreLock(root).verdict).toBe('live'); // says nothing, judged by age
  await expect(withStoreLock(root, 'test corrupt', async () => undefined)).rejects.toThrow(
    /unreadable holder/,
  );

  const past = (Date.now() - 120_000) / 1000;
  utimesSync(path, past, past);
  expect(inspectStoreLock(root).verdict).toBe('stale');
  await withStoreLock(root, 'test corrupt-takeover', async () => undefined);
  expect(existsSync(storeLockPath(root))).toBe(false);
});

test('a throwing critical section still releases the lock', async () => {
  await expect(
    withStoreLock(root, 'test thrower', async () => {
      throw new Error('the work failed');
    }),
  ).rejects.toThrow('the work failed');
  expect(inspectStoreLock(root).present).toBe(false);
});

// -- setup ----------------------------------------------------------------

let scratch: string;
let root: string;
let deadPid: number;
let caseId = 0;

function writeLock(fields: Record<string, unknown>): void {
  mkdirSync(join(root, '.ward'), { recursive: true });
  const holder = {
    pid: process.pid,
    host: hostname(),
    verb: 'test fixture',
    caller: 'human',
    startedAt: new Date().toISOString(),
    nonce: crypto.randomUUID(),
    ...fields,
  };
  writeFileSync(storeLockPath(root), `${JSON.stringify(holder)}\n`);
}

beforeAll(() => {
  scratch = makeTempDir();
  // A pid that certainly ran and certainly exited: a short-lived child's.
  const child = Bun.spawnSync(['sh', '-c', 'echo $$']);
  deadPid = Number.parseInt(child.stdout.toString().trim(), 10);
  expect(deadPid).toBeGreaterThan(0);
});

// A fresh "workspace" root per case, so lock states stay independent.
const freshRoot = () => {
  caseId += 1;
  root = join(scratch, `case-${caseId}`);
  mkdirSync(root, { recursive: true });
};
beforeAll(freshRoot);
afterEach(() => {
  delete process.env.WARD_LOCK_TIMEOUT_MS;
  delete process.env.WARD_LOCK_STALE_MS;
  freshRoot();
});

afterAll(() => {
  removeDir(scratch);
});
