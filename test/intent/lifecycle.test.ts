// Intent invariant: session lifecycle guarantees (02-sessions-and-lifecycle).
// resume is idempotent; closed stays closed; the record is authoritative; ids are
// unique among OPEN sessions (a bare id addresses) and reusable once freed.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  closeSession,
  listSessions,
  loadSession,
  openSession,
  resumeSession,
} from '../../src/domain/session.ts';
import type { PersonaRef, ScopeRef } from '../../src/store/schemas.ts';
import { freshWorkspace, stepClock } from '../support/workspace.ts';

test('session lifecycle guarantees', async (t) => {
  await t.test(
    'resume is idempotent — no second session, record unchanged, handle stable',
    async () => {
      const clock = stepClock();
      const root = await freshWorkspace(t);
      const opened = await openSession(root, sessionOpts(root, clock));

      const first = await resumeSession(root, opened.id, { now: clock });
      const second = await resumeSession(root, opened.id, { now: clock });

      assert.equal(first.id, opened.id);
      assert.deepEqual(
        second.harness,
        opened.harness,
        'the harness handle is stable across resumes',
      );
      assert.equal((await listSessions(root)).length, 1, 'resuming never mints a second session');
      assert.equal(
        (await loadSession(root, opened.id)).state,
        'open',
        'resume does not mutate durable state',
      );
    },
  );

  await t.test('closed stays closed — a closed session cannot be resumed', async () => {
    const clock = stepClock();
    const root = await freshWorkspace(t);
    const s = await openSession(root, sessionOpts(root, clock));
    await closeSession(root, s.id, { now: clock });
    await assert.rejects(() => resumeSession(root, s.id, { now: clock }), /closed stays closed/);
  });

  await t.test('close is idempotent — a second close is a no-op', async () => {
    const clock = stepClock();
    const root = await freshWorkspace(t);
    const s = await openSession(root, sessionOpts(root, clock));
    const first = await closeSession(root, s.id, { now: clock });
    const second = await closeSession(root, s.id, { now: clock });
    assert.equal(first.state, 'closed');
    assert.equal(second.closedAt, first.closedAt, 'closedAt is unchanged by the repeated close');
  });

  await t.test(
    'ids are unique among open sessions and reused once freed (history retained)',
    async () => {
      const clock = stepClock();
      const root = await freshWorkspace(t);
      const resident: PersonaRef = { name: 'riley', role: 'resident' };

      const a = await openSession(root, { ...sessionOpts(root, clock), persona: resident });
      const b = await openSession(root, { ...sessionOpts(root, clock), persona: resident });
      assert.equal(a.id, 'riley', 'first open session takes the bare slug');
      assert.equal(b.id, 'riley-1', 'a second concurrent open disambiguates');

      await closeSession(root, a.id, { now: clock });
      const c = await openSession(root, { ...sessionOpts(root, clock), persona: resident });
      assert.equal(c.id, 'riley', 'a freed id is reused among open sessions');

      const ids = (await listSessions(root)).map((s) => s.id).sort();
      assert.deepEqual(
        ids,
        ['riley', 'riley', 'riley-1'],
        'the closed record is retained, not clobbered',
      );
    },
  );
});

// ── setup ───────────────────────────────────────────────────────────────────
function sessionOpts(root: string, now: ReturnType<typeof stepClock>) {
  const scope: ScopeRef = { kind: 'workspace', ref: '' };
  const persona: PersonaRef = { name: 'morgan', role: 'house-supervisor' };
  return { scope, persona, workingDir: root, now };
}
