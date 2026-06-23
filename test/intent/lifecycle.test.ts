// INTENT TEST — resume is IDEMPOTENT and CLOSED STAYS CLOSED (sessions seam guarantees). Operates
// on the real session lifecycle (events folded to state + the stub harness). Survives a design swap:
// any harness/store keeping these guarantees passes.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  openSession,
  closeSession,
  resumeSession,
  sessionStates,
} from "../../src/domain/session.ts";

test("resume is idempotent; closed stays closed", async () => {
  const root = await mkdtemp(join(tmpdir(), "ward-life-"));
  try {
    await mkdir(join(root, ".ward"), { recursive: true });
    const scopeDir = join(root, ".ward", "scope");

    const { session, handle } = await openSession(root, scopeDir, {
      scope: "room:1A1",
      persona: "Morgan",
      model: "deep",
      cwd: root,
    });

    // Resume twice — idempotent: state stays open, the recorded handle is unchanged, no second run.
    await resumeSession(root, scopeDir, session);
    await resumeSession(root, scopeDir, session);
    let st = (await sessionStates(scopeDir)).get(session)!;
    assert.equal(st.state, "open");
    assert.equal(st.handle, handle, "resume must not mint a new conflicting handle");

    // Close → terminal.
    await closeSession(scopeDir, session);
    st = (await sessionStates(scopeDir)).get(session)!;
    assert.equal(st.state, "closed");

    // Resume after close is refused (closed stays closed) — the rule that stops a reboot reviving
    // finished work.
    await assert.rejects(() => resumeSession(root, scopeDir, session), /closed stays closed/);

    // Closing again is an idempotent no-op, and re-folding (as recovery would) still reads closed.
    const again = await closeSession(scopeDir, session);
    assert.equal(again.idempotent, true);
    assert.equal((await sessionStates(scopeDir)).get(session)!.state, "closed");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
