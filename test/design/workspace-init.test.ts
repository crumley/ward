// DESIGN TEST — `ward init` produces a real, validatable workspace: a version-stamped workspace
// record, the default persona cast, and a derived (empty) status. Exercises the store end to end.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { initWorkspace } from "../../src/domain/workspace.ts";
import { loadWorkspace } from "../../src/store/workspace.ts";
import { workspaceStatus } from "../../src/domain/status.ts";
import { wardDir } from "../../src/store/paths.ts";

test("init creates a version-stamped, git-tracked workspace with the default cast", async () => {
  const root = await mkdtemp(join(tmpdir(), "ward-ws-"));
  try {
    const ws = await initWorkspace(root);
    assert.equal(ws.type, "workspace");
    assert.ok(ws.wardVersion, "carries a version stamp (§14)");
    assert.deepEqual(ws.personaCast, ["Sam", "Avery", "Charlie", "Riley", "Morgan"]);

    // reloads + validates from disk
    const reloaded = await loadWorkspace(root);
    assert.equal(reloaded.wardVersion, ws.wardVersion);

    // tracked as a git repo (§15)
    assert.ok(existsSync(join(root, ".git")), "workspace is a git repo");
    assert.ok(existsSync(join(wardDir(root), "personas", "Riley.md")));

    // status derives to empty with no projects
    const st = await workspaceStatus(root);
    assert.equal(st.status, "empty");
    assert.equal(st.projects.length, 0);

    // init is not silently re-runnable over an existing workspace
    await assert.rejects(() => initWorkspace(root), /already a Ward workspace/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
