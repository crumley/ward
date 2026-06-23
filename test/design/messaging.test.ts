// DESIGN TEST — the dispatch/report/wake realization: recorded-first, inspectable, and idempotent
// (a satisfied wake FIRES ONCE), with satisfied wakes excluded from the recovery re-arm set. Backs
// the messaging seam (intent/02-subsystems/02-messaging-coordination.md).

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  armWake,
  wakeState,
  satisfyCondition,
  pendingWakes,
  dispatch,
  listMessages,
} from "../../src/seams/messaging.ts";

test("a wake fires once; satisfied wakes drop out of the recovery re-arm set", async () => {
  const root = await mkdtemp(join(tmpdir(), "ward-msg-"));
  try {
    await mkdir(join(root, ".ward"), { recursive: true });

    const { id } = await armWake(root, { condition: "1A1:done", armer: "Riley" });
    assert.equal(await wakeState(root, id), "armed");
    assert.equal((await pendingWakes(root)).length, 1, "armed wake is pending (recovery re-arms it)");

    const first = await satisfyCondition(root, "1A1:done");
    assert.deepEqual(first.fired, [id]);
    assert.equal(first.alreadySatisfied.length, 0);

    // Reporting done again must NOT double-fire — idempotent where it touches lifecycle.
    const second = await satisfyCondition(root, "1A1:done");
    assert.equal(second.fired.length, 0, "must not fire a second time");
    assert.deepEqual(second.alreadySatisfied, [id]);

    assert.equal(await wakeState(root, id), "satisfied");
    assert.equal((await pendingWakes(root)).length, 0, "satisfied wake is no longer pending");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("messages are recorded-first and inspectable by endpoint", async () => {
  const root = await mkdtemp(join(tmpdir(), "ward-msg2-"));
  try {
    await mkdir(join(root, ".ward"), { recursive: true });
    await dispatch(root, { from: "Riley", to: "1A1", body: "build it", ref: "brief" });
    const toRoom = await listMessages(root, { to: "1A1" });
    assert.equal(toRoom.length, 1);
    assert.equal(toRoom[0]!.kind, "dispatch");
    assert.equal(toRoom[0]!.from, "Riley");
    assert.equal((await listMessages(root, { to: "nobody" })).length, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
