// Intent invariant: append-only / no lost updates (principles §17).
// This must survive a design swap — it asserts the GUARANTEE (every concurrent
// writer's entry survives, ordered, and state is derived by folding), not the
// filesystem mechanism behind it.

import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { appendEvent, type Clock, fold, readEvents } from '../../src/store/log.ts';

test('append-only log — no lost updates', async (t) => {
  await t.test('concurrent appends lose none and get unique, gap-free sequences', async () => {
    const dir = await scratch(t);
    const n = 50;

    await Promise.all(
      Array.from({ length: n }, (_, i) =>
        appendEvent(dir, { kind: 'note', data: { i } }, fixedClock),
      ),
    );

    const events = await readEvents(dir);
    assert.equal(events.length, n, 'every concurrent append survived');
    assert.deepEqual(
      events.map((e) => e.seq),
      [...Array(n).keys()],
      'sequences are unique and gap-free 0..n-1',
    );
    assert.equal(
      new Set(events.map((e) => e.data.i)).size,
      n,
      'every distinct payload is present exactly once — nothing clobbered',
    );
  });

  await t.test('sequential appends preserve insertion order', async () => {
    const dir = await scratch(t);
    for (const kind of ['opened', 'briefed', 'reported', 'closed']) {
      await appendEvent(dir, { kind }, fixedClock);
    }
    assert.deepEqual(
      (await readEvents(dir)).map((e) => e.kind),
      ['opened', 'briefed', 'reported', 'closed'],
    );
  });

  await t.test('state is DERIVED by folding events, never stored', async () => {
    const dir = await scratch(t);
    await appendEvent(dir, { kind: 'open' }, fixedClock);
    await appendEvent(dir, { kind: 'close' }, fixedClock);
    await appendEvent(dir, { kind: 'open' }, fixedClock); // a room reopened after being freed

    const occupied = fold(await readEvents(dir), false, (state, e) =>
      e.kind === 'open' ? true : e.kind === 'close' ? false : state,
    );
    assert.equal(occupied, true, 'folding the log yields current state without a stored field');
  });

  await t.test('reading an empty / absent log is empty, not an error', async () => {
    const dir = await scratch(t);
    assert.deepEqual(await readEvents(join(dir, 'never-written')), []);
  });
});

// ── setup ───────────────────────────────────────────────────────────────────
const fixedClock: Clock = () => '2026-07-03T00:00:00.000Z';

async function scratch(t: { after: (fn: () => void | Promise<void>) => void }): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'ward-log-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}
