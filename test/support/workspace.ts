// Shared test setup: a throwaway on-disk workspace and a deterministic clock, so
// intent tests exercise the real store hermetically. Not a *.test.ts file, so the
// runner never executes it directly.

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { initWorkspace } from '../../src/domain/workspace.ts';
import type { Clock } from '../../src/store/log.ts';

export interface TestCtx {
  after: (fn: () => void | Promise<void>) => void;
}

/** Create + init a fresh workspace in a temp dir; auto-removed when the test ends. */
export async function freshWorkspace(t: TestCtx): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'ward-ws-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await initWorkspace(root);
  return root;
}

/** A monotonic, deterministic clock for hermetic assertions. */
export function stepClock(): Clock {
  let n = 0;
  return () => {
    const s = String(n).padStart(2, '0');
    n += 1;
    return `2026-07-03T00:00:${s}.000Z`;
  };
}
