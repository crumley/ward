// INTENT TEST — session/event logs are append-only; concurrent writers cause NO lost updates
// (principles §17; sessions: per-scope append-only log). Survives a design swap: any store that
// keeps this guarantee passes. See intent/02-subsystems/00-metadata-store.md.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { appendEvent, readEvents } from "../../src/store/log.ts";
import type { SessionEventDoc } from "../../src/store/schemas.ts";

test("append-only log: no lost updates under concurrent writers", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ward-log-"));
  try {
    const log = join(dir, "log");
    const N = 64;
    const ts = new Date().toISOString();
    // Fire N appends concurrently. Each lands in its own file (one-file-per-entry), so even if two
    // racing writers compute the same sequence number, the unique suffix keeps paths distinct and
    // nothing is clobbered.
    await Promise.all(
      Array.from({ length: N }, (_, i) =>
        appendEvent(log, {
          type: "session-event",
          session: `s${i}`,
          verb: "open",
          ts,
          cwd: "/x",
        }),
      ),
    );
    const events = await readEvents(log);
    assert.equal(events.length, N, "every concurrent append must be present");
    const sessions = new Set(events.map((e) => (e as SessionEventDoc).session));
    assert.equal(sessions.size, N, "no append clobbered another writer's entry");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
