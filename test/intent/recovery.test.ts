// INTENT-ADJACENT TEST — cold-start recovery restores exactly the in-flight threads and nothing
// else: open sessions are re-attached via their harness handle, pending wakes are re-armed, and
// CLOSED sessions are left alone (closed stays closed across a reboot). Sessions seam: Recovery.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { initWorkspace } from "../../src/domain/workspace.ts";
import { openProject } from "../../src/domain/project.ts";
import { openTask } from "../../src/domain/task.ts";
import { closeSession } from "../../src/domain/session.ts";
import { findTask } from "../../src/domain/resolve.ts";
import { armWake } from "../../src/seams/messaging.ts";
import { recover } from "../../src/domain/recovery.ts";

test("recovery re-attaches open threads, re-arms wakes, leaves closed alone", async () => {
  const root = await mkdtemp(join(tmpdir(), "ward-recover-"));
  try {
    await initWorkspace(root);
    const { floor } = await openProject(root, "exports"); // open project session
    const t1 = await openTask(root, floor, "task one"); // open task session
    const t2 = await openTask(root, floor, "task two"); // will be closed
    await armWake(root, { condition: "1A1:done", armer: "Riley" });

    // Simulate finishing one thread before the "reboot".
    const loc = await findTask(root, floor, "task-two");
    await closeSession(loc!.tDir, t2.session);

    const r = await recover(root);

    // Session ids are scope-relative (intent: "slug + code, scope-relative"), so both task scopes
    // hold a "riley-1" — recovery disambiguates by SCOPE, which is why the report carries it.
    void t1;
    void t2;

    // open threads come back...
    assert.ok(r.reattached.length >= 2, "project + task-one sessions re-attached");
    assert.ok(r.reattached.some((x) => x.scope.includes("task-one")), "open task session re-attached");
    // ...the closed one's scope does not (its only session is closed)
    assert.ok(!r.reattached.some((x) => x.scope.includes("task-two")), "closed session NOT revived");
    assert.ok(r.closedSkipped >= 1, "closed session counted as skipped");
    // pending wake re-armed
    assert.ok(r.wakesRearmed.some((w) => w.condition === "1A1:done"), "wake re-armed");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
