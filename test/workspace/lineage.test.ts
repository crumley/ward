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
  // …and the 0029 manifest itself, which design/0035-agent-command/ superseded.
  expect(lineageOf('AGENTS.md').history.map((v) => v.sha256)).toContain(
    'ef5ffe607886ca2fea68c54f7cf72a138c5058316116b49a78d664ffa58ac510', // 7fa9656 (design 0029)
  );
  // …and the 0037 manifest, superseded by design/0041-ground-floor/: every
  // workspace still carrying the affinity-era default upgrades to the one
  // that names the ground floor.
  expect(lineageOf('AGENTS.md').history.map((v) => v.sha256)).toContain(
    'e1a0d2748cb10105e1358ef6809f796fb70e03d48ab84881d3ff4843eb21e528', // design 0037
  );
  // …and the 0041 manifest, superseded by design/0043-task-next-surface/,
  // which added `ward task show` to the verbs the agent section names.
  expect(lineageOf('AGENTS.md').history.map((v) => v.sha256)).toContain(
    'dfc613e4b70a5f2b3c853827c01256615923ca3c245b44f49dcf54589e8c6963', // design 0041
  ); // …and the 0044 manifest, superseded by design/0045-agent-record-reads/,
  // which did not yet say that records change only through `ward`.
  expect(lineageOf('AGENTS.md').history.map((v) => v.sha256)).toContain(
    'e0dea34e469d74915a9e574d69f83b309ef67aaf6142508511e2595511628d94', // design 0044
  );
  // …and the 0045 manifest, superseded by design/0046-task-pr-unlink/.
  expect(lineageOf('AGENTS.md').history.map((v) => v.sha256)).toContain(
    '570f38d66fefd7c380a4538a3690ff061afd801d0529823fba33a5f566c9b6a9', // design 0045
  );
  // …and the 0046 manifest, superseded by design/0049-task-list-filters/.
  expect(lineageOf('AGENTS.md').history.map((v) => v.sha256)).toContain(
    '34842861a740dfc2ffe21e490967759c3cbdd05bf029ae0b6a3caaa26259e8db', // design 0046
  );
  // …and the 0049 manifest, superseded by design/0051-floor-scope-sessions/.
  expect(lineageOf('AGENTS.md').history.map((v) => v.sha256)).toContain(
    '4b3479735c3f694ab658e32a18185863e6d119e4b7a1c1aa3d6dcb4554c30abf', // design 0049
  );
  // …and the 0051 manifest, superseded by the 0051 revert (no-TASK opens
  // record only with --handle).
  expect(lineageOf('AGENTS.md').history.map((v) => v.sha256)).toContain(
    '119a4e28debb359f34ee7873d33c388eee0b82079198ec861cc56a0131ab309c', // design 0051
  );
  // …and the 0051-revert manifest, superseded by design/0052-session-parent-link/.
  expect(lineageOf('AGENTS.md').history.map((v) => v.sha256)).toContain(
    '7fe60b83fd9707011ed538f239ae4def9c5d3877bffe20d41ece06436c2dd616', // 0051 revert
  );
  // …and the 0052 manifest, superseded by design/0053-legacy-task-address/.
  expect(lineageOf('AGENTS.md').history.map((v) => v.sha256)).toContain(
    '1f1d055a78cc30504e9278bfc28baf939649edb2c8c4d37a21307addfa0caa25', // design 0052
  );
  // …and the 0053 manifest, superseded by design/0055-floor-manifests/.
  expect(lineageOf('AGENTS.md').history.map((v) => v.sha256)).toContain(
    '517b99b03e9275eb900bb1ac30dd04ce8ba9f496fcc365ec148fc3bb2486c473', // design 0053
  );
  // …and the 0055 manifest, superseded by design/0056-worktree-context-bridge/.
  expect(lineageOf('AGENTS.md').history.map((v) => v.sha256)).toContain(
    '410ba2ed2bdcbc4f927300efd06c3618b699de5349d42a007540c4112d2d8789', // design 0055
  );
  // …and the 0056 manifest, superseded by design/0057-context-from-root/,
  // which added the downward-reading rule and the `floors/` layout.
  expect(lineageOf('AGENTS.md').history.map((v) => v.sha256)).toContain(
    '5f3ce047d99d5cb5d49d2a2fe5c65e5b788d721cde47ed1ef2c2559fc603f0b8', // design 0056
  );
  // …and the 0057 manifest, superseded by design/0031-detached-session-hosting/'s
  // Detached sessions section.
  expect(lineageOf('AGENTS.md').history.map((v) => v.sha256)).toContain(
    'b942afc03d90c477197b96630f25a8d9ddcfa0984549f3f7bf75b57324bf3242', // design 0057
  );
});

// The maintenance guard-rail: the lineage's history is maintained by hand, so
// the current defaults are pinned here. When templates.ts (or the catalog
// seed) changes, this test fails — the fix is to append the outgoing hash to
// the artifact's history in src/workspace/lineage.ts and repin here, which is
// exactly the bookkeeping that keeps every shipped default recognizable.
test('the current defaults are pinned; changing one must move its old hash into history', () => {
  expect(sha256OfText(AGENTS_MD)).toBe(
    '068603e7e5d88f2e1118c9f466cf99b56ca60877078b8e5ce7b8b584c9d5f6fa', // since 0031 (phase 2)
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
