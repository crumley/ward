// Intent invariant: the privacy gate is fail-closed and exhaustive (§4,
// 06-remote-provider). Design-independent: it asserts that NO local/internal
// token crosses outward, that the gate refuses rather than emits when unsure, and
// that the remote provider structurally cannot receive un-sanitized content.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assertClean, humanAuthority, translateOutward } from '../../src/seams/privacy.ts';
import { makeStubRemote } from '../../src/seams/remote.ts';

const PERSONAS = ['morgan', 'avery', 'casey', 'riley', 'quinn'];

test('privacy gate — exhaustive outward redaction', async (t) => {
  await t.test('strips persona names, role words, and local paths (case-insensitive)', () => {
    const local =
      'Riley (the RESIDENT) asked the Charge Nurse and attending to review; notes at /Users/ryan/wardv2/.ward/x';
    assert.ok(
      local.toLowerCase().includes('riley'),
      'precondition: the local text carries the tokens',
    );

    const { clean, redactions } = translateOutward(local, {
      personaNames: PERSONAS,
      localPaths: ['/Users/ryan/wardv2'],
    });
    const out = clean.toLowerCase();
    for (const forbidden of ['riley', 'resident', 'charge nurse', 'attending', '/users/ryan']) {
      assert.ok(!out.includes(forbidden), `leaked: ${forbidden}`);
    }
    assert.ok(redactions.length >= 4, 'each removal is accounted for');
  });

  await t.test('strips a provenance front-matter block', () => {
    const local =
      '---\npersona: riley\nrole: resident\nworkingDir: /Users/ryan\n---\nAdd a CSV endpoint.';
    const { clean } = translateOutward(local, { personaNames: PERSONAS });
    assert.equal(clean.trim(), 'Add a CSV endpoint.');
  });
});

test('privacy gate — the CLOSED role vocabulary is caught in every prose form', async (t) => {
  const forms = [
    'house supervisor',
    'supervisor',
    'attending',
    'attending physician',
    'charge nurse',
    'resident',
    'medical student',
    'med student',
  ];
  for (const form of forms) {
    await t.test(`"${form}" never survives`, () => {
      const { clean } = translateOutward(`please ping the ${form} right away`, {
        personaNames: PERSONAS,
      });
      assert.ok(!clean.toLowerCase().includes(form), `leaked role form: ${form}`);
    });
  }
});

test('privacy gate — fail-closed', async (t) => {
  await t.test('assertClean throws when a role word is present (refuse, do not emit)', () => {
    assert.throws(
      () => assertClean('the resident did this', { personaNames: PERSONAS }),
      /privacy gate refused/,
    );
  });

  await t.test('assertClean throws on a persona name', () => {
    assert.throws(
      () => assertClean('thanks casey', { personaNames: PERSONAS }),
      /privacy gate refused/,
    );
  });

  await t.test('translateOutward output always passes assertClean', () => {
    const { clean } = translateOutward('riley the resident touched /Users/x', {
      personaNames: PERSONAS,
    });
    assert.doesNotThrow(() => assertClean(clean, { personaNames: PERSONAS }));
  });
});

test('privacy gate — the remote provider only receives sanitized, authorized content', async () => {
  const remote = makeStubRemote();
  const title = translateOutward('CSV export endpoint', { personaNames: PERSONAS }).clean;
  const body = translateOutward('Add a CSV endpoint. (riley, the resident, drafted this.)', {
    personaNames: PERSONAS,
  }).clean;

  // createWorkItem/openPr will not compile without a Sanitized value AND an Authority.
  const ref = await remote.createWorkItem(title, body, humanAuthority());
  await remote.openPr('meal-planner', title, body, humanAuthority());

  assert.ok(ref.id.length > 0);
  for (const crossed of remote.received) {
    const lower = crossed.toLowerCase();
    assert.ok(
      !lower.includes('riley') && !lower.includes('resident'),
      `forge received a leak: ${crossed}`,
    );
  }
});
