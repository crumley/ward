// The installed-artifact lineage (design/0020-deterministic-upgrade/): the
// binary knows every default it ever shipped, so an artifact whose bytes
// match ANY of them is untouched (merely old) and one matching none is
// customized — decidable even on a workspace whose baselines document is
// empty, which is exactly the live bootstrap workspace's state. The pinned
// hashes below are the ground truth recovered from this repository's own git
// history; the legacy fixture texts must hash to the live workspace's exact
// artifacts, so the fixtures used by the upgrade tests cannot drift from the
// state they claim to reproduce.
import { afterAll, beforeAll, expect, test } from 'bun:test';
import { join } from 'node:path';
import { createWorkspace } from '../../src/workspace/create.ts';
import {
  classifyArtifact,
  INSTALLED_ARTIFACT_LINEAGE,
  sha256OfText,
} from '../../src/workspace/lineage.ts';
import { AGENTS_MD, WARD_INTERNAL_README } from '../../src/workspace/templates.ts';
import { LEGACY_AGENTS_MD, LEGACY_WARD_README } from '../fixtures/legacy.ts';
import { applyGitTestEnv, makeTempDir, removeDir } from '../helpers.ts';

// The live bootstrap workspace's untouched artifacts — created 2026-08-05 by
// a c7962cc-era ward — hash to exactly these values (verified against the
// live files themselves when this entry was built).
const LIVE_AGENTS_SHA = '05eaa2760ce0320e7eca739dd9a497a9a86f10346023451186113ab1ce71750f';
const LIVE_WARD_README_SHA = '7304394516ae3f013223a7e6daa986c8f15d2141e051be4aa4dfba8ede790bd4';

function lineageOf(path: string) {
  const lineage = INSTALLED_ARTIFACT_LINEAGE.find((artifact) => artifact.path === path);
  if (lineage === undefined) throw new Error(`no lineage for ${path}`);
  return lineage;
}

test('the legacy fixtures are byte-identical to the live workspace originals', () => {
  expect(sha256OfText(LEGACY_AGENTS_MD)).toBe(LIVE_AGENTS_SHA);
  expect(sha256OfText(LEGACY_WARD_README)).toBe(LIVE_WARD_README_SHA);
});

test('the lineage covers the live workspace: both stale originals are known defaults', () => {
  expect(lineageOf('AGENTS.md').history.map((v) => v.sha256)).toContain(LIVE_AGENTS_SHA);
  expect(lineageOf('.ward/README.md').history.map((v) => v.sha256)).toContain(LIVE_WARD_README_SHA);
});

test('the AGENTS.md 0029 supersedes is in history — every workspace still on it upgrades', () => {
  // design/0029-launched-sessions/ rewrote the manifest's session guidance.
  // The outgoing default must be a KNOWN default, or a workspace carrying it
  // untouched would read as customized and never be brought forward.
  expect(lineageOf('AGENTS.md').history.map((v) => v.sha256)).toContain(
    'de4ee8439b3a8eab3851e7109b22a2542d41337b46efb0d0e16be7a36fc7b24b', // 94e6890 (design 0018)
  );
});

// The maintenance guard-rail: the lineage's history is maintained by hand, so
// the current defaults are pinned here. When templates.ts (or the catalog
// seed) changes, this test fails — the fix is to append the outgoing hash to
// the artifact's history in src/workspace/lineage.ts and repin here, which is
// exactly the bookkeeping that keeps every shipped default recognizable.
test('the current defaults are pinned; changing one must move its old hash into history', () => {
  expect(sha256OfText(AGENTS_MD)).toBe(
    '2a2fdc448ac6ee2bd765f4056c90f47c15aa175662e55a568430bf08de84cb63', // since design 0034
  );
  expect(sha256OfText(WARD_INTERNAL_README)).toBe(
    '6f10845611635508f006727f83bdc2222d840a9da972393781662c9f6ff04ac4', // since 65f1e8b (0013)
  );
  expect(sha256OfText(lineageOf('catalog.md').current())).toBe(
    '0487e4b2d1136c28c1138e45bca3ff4411d7ebfa70ab959751b3cfa0a9b135dd', // since a71b091 (0002)
  );
});

test('every hash in a lineage is distinct, and no history entry equals the current default', () => {
  for (const lineage of INSTALLED_ARTIFACT_LINEAGE) {
    const hashes = [...lineage.history.map((v) => v.sha256), sha256OfText(lineage.current())];
    expect(new Set(hashes).size).toBe(hashes.length);
  }
});

test('the catalog lineage derives its current default through the installing serializer', async () => {
  const ws = join(scratch, 'ws-catalog');
  await createWorkspace(ws);
  const installed = await Bun.file(join(ws, 'catalog.md')).text();
  expect(installed).toBe(lineageOf('catalog.md').current());
});

test('classification: a fresh workspace is current throughout', async () => {
  const ws = join(scratch, 'ws-current');
  await createWorkspace(ws);
  for (const lineage of INSTALLED_ARTIFACT_LINEAGE) {
    expect((await classifyArtifact(ws, lineage)).standing).toBe('current');
  }
});

test('classification: a historical default is stale — untouched, merely old — with its era named', async () => {
  const ws = join(scratch, 'ws-stale');
  await createWorkspace(ws);
  await Bun.write(join(ws, 'AGENTS.md'), LEGACY_AGENTS_MD);
  await Bun.write(join(ws, '.ward/README.md'), LEGACY_WARD_README);
  expect(await classifyArtifact(ws, lineageOf('AGENTS.md'))).toEqual({
    standing: 'stale',
    era: 'c7962cc (design 0004)',
  });
  expect(await classifyArtifact(ws, lineageOf('.ward/README.md'))).toEqual({
    standing: 'stale',
    era: 'a71b091 (design 0002)',
  });
});

test('classification: bytes matching no shipped default are customized; absence is missing', async () => {
  const ws = join(scratch, 'ws-custom');
  await createWorkspace(ws);
  await Bun.write(join(ws, 'AGENTS.md'), `${LEGACY_AGENTS_MD}\n## My own section\n`);
  expect((await classifyArtifact(ws, lineageOf('AGENTS.md'))).standing).toBe('customized');
  removeDir(join(ws, '.ward')); // takes README with it
  expect((await classifyArtifact(ws, lineageOf('.ward/README.md'))).standing).toBe('missing');
});

test('classification: the install-time baseline fingerprint also proves untouched', async () => {
  const ws = join(scratch, 'ws-baseline-sha');
  await createWorkspace(ws);
  const content = 'a default no lineage entry knows\n';
  await Bun.write(join(ws, 'AGENTS.md'), content);
  const withBaseline = await classifyArtifact(ws, lineageOf('AGENTS.md'), sha256OfText(content));
  expect(withBaseline).toEqual({ standing: 'stale', era: 'the default recorded at install' });
  const without = await classifyArtifact(ws, lineageOf('AGENTS.md'));
  expect(without.standing).toBe('customized');
});

// -- setup ------------------------------------------------------------------

let scratch: string;

beforeAll(() => {
  applyGitTestEnv();
  scratch = makeTempDir();
});

afterAll(() => {
  removeDir(scratch);
});
