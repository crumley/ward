// INTENT TEST — no local/personal/persona content crosses to a remote artifact (§4; remote-provider
// seam). The gate actually strips persona names, local paths, and glyphs, is FAIL-CLOSED (throws if
// it cannot), and every outward path (the PR opener) routes through it. Survives a design swap: any
// translation that keeps these guarantees passes.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { translate, assertClean } from "../../src/seams/privacy.ts";
import { initWorkspace } from "../../src/domain/workspace.ts";
import { openProject } from "../../src/domain/project.ts";
import { openTask } from "../../src/domain/task.ts";
import { attachRemote, openPr } from "../../src/domain/remote.ts";

const CTX = { personaNames: ["Riley", "Avery", "Morgan"], workspaceRoot: "/Users/dev/ward-ws" };

test("the gate strips persona names, roles, local paths and glyphs", () => {
  const local =
    "---\npersona: Riley\n---\n" +
    "🚪 The resident Riley reviewed this in /Users/dev/ward-ws/worktrees/x. " +
    "Morgan wrote the endpoint.";
  const { text } = translate(local, CTX);
  for (const forbidden of ["Riley", "Morgan", "resident", "/Users/dev/ward-ws", "🚪"]) {
    assert.ok(!text.includes(forbidden), `must not leak ${forbidden}; got: ${text}`);
  }
  // front matter is gone entirely
  assert.ok(!text.includes("persona:"));
});

test("the gate is fail-closed: it throws rather than emit a residual leak", () => {
  // assertClean is the independent verifier the gate runs last; prove it rejects a leak.
  assert.throws(() => assertClean("posted by Riley", CTX), /would leak/);
  assert.doesNotThrow(() => assertClean("posted by the team", CTX));
});

test("every outward path routes through the gate (openPr sanitizes its body)", async () => {
  const root = await mkdtemp(join(tmpdir(), "ward-priv-"));
  try {
    await initWorkspace(root);
    const { floor } = await openProject(root, "exports");
    await openTask(root, floor, "csv export");
    await attachRemote(root, floor, "csv-export", {
      provider: "github",
      id: "42",
      url: "https://example/42",
    });
    // Body deliberately carries a persona name and the workspace path.
    const r = await openPr(root, floor, "csv-export", {
      title: "Add CSV export",
      body: `Riley directed this; files under ${root}.`,
      authorized: true,
    });
    assert.ok(!r.sanitized.includes("Riley"), "PR body must not name a persona");
    assert.ok(!r.sanitized.includes(root), "PR body must not leak the local path");
    assert.ok(r.stripped.includes("persona:Riley"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("opening a PR without authority is refused (gated action, §18)", async () => {
  const root = await mkdtemp(join(tmpdir(), "ward-priv2-"));
  try {
    await initWorkspace(root);
    const { floor } = await openProject(root, "exports");
    await openTask(root, floor, "csv export");
    await attachRemote(root, floor, "csv-export", { provider: "github", id: "7", url: "u" });
    await assert.rejects(
      () => openPr(root, floor, "csv-export", { title: "t", body: "b", authorized: false }),
      /gated action/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
