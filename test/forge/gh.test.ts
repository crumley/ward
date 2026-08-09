// The forge probe (design/0009-live-forge-state/): live PR state translated
// into Ward's vocabulary, one parallel deadline-bounded pass, and one honest
// availability bit — absent, erroring, and hung forges all degrade to
// `live: false` instead of failing or hanging, and a partially readable set
// stays live with the unreadable PRs marked unknown, never guessed.
import { afterAll, afterEach, beforeAll, expect, test } from 'bun:test';
import { join } from 'node:path';
import { probeForge } from '../../src/forge/gh.ts';
import { applyGitTestEnv, makeTempDir, NO_GH, removeDir, writeFakeGh } from '../helpers.ts';

// gh's vocabulary in, Ward's out: state plus review decision from one answer.
const translations = [
  { gh: { state: 'OPEN' }, state: 'open', reviewDecision: undefined },
  { gh: { state: 'OPEN', reviewDecision: 'APPROVED' }, state: 'open', reviewDecision: 'approved' },
  {
    gh: { state: 'OPEN', reviewDecision: 'CHANGES_REQUESTED' },
    state: 'open',
    reviewDecision: 'changes-requested',
  },
  {
    gh: { state: 'OPEN', reviewDecision: 'REVIEW_REQUIRED' },
    state: 'open',
    reviewDecision: 'review-required',
  },
  { gh: { state: 'MERGED' }, state: 'merged', reviewDecision: undefined },
  {
    gh: { state: 'MERGED', reviewDecision: 'APPROVED' },
    state: 'merged',
    reviewDecision: 'approved',
  },
  { gh: { state: 'CLOSED' }, state: 'closed', reviewDecision: undefined },
  { gh: { state: 'SOMETHING_NEW' }, state: 'unknown', reviewDecision: undefined },
] as const;

test('one parallel probe translates every state into Ward vocabulary', async () => {
  const urls = translations.map((_, i) => `https://example.com/pr/${i + 1}`);
  const responses: Record<string, { state: string; reviewDecision?: string }> = {};
  for (const [i, row] of translations.entries()) {
    responses[urls[i] ?? ''] = { ...row.gh };
  }
  process.env.WARD_GH = writeFakeGh(scratch, 'gh-translate', { responses });
  const probe = await probeForge(urls);
  expect(probe.live).toBe(true);
  for (const [i, row] of translations.entries()) {
    const state = probe.states.get(urls[i] ?? '');
    expect(state?.state).toBe(row.state);
    expect(state?.reviewDecision).toBe(row.reviewDecision);
  }
});

test('an absent executable is live:false, instantly and silently', async () => {
  process.env.WARD_GH = NO_GH;
  const started = Date.now();
  const probe = await probeForge(['https://example.com/pr/1']);
  expect(probe.live).toBe(false);
  expect(probe.states.size).toBe(0);
  expect(Date.now() - started).toBeLessThan(1000);
});

test('a forge that errors on every PR is live:false — unauth and offline look like this', async () => {
  process.env.WARD_GH = writeFakeGh(scratch, 'gh-broken', { responses: {} });
  const probe = await probeForge(['https://example.com/pr/1', 'https://example.com/pr/2']);
  expect(probe.live).toBe(false);
  expect(probe.states.size).toBe(0);
});

test('a partially readable set stays live; the unreadable PR is unknown, not guessed', async () => {
  process.env.WARD_GH = writeFakeGh(scratch, 'gh-partial', {
    responses: { 'https://example.com/pr/1': { state: 'MERGED' } },
  });
  const probe = await probeForge(['https://example.com/pr/1', 'https://example.com/pr/404']);
  expect(probe.live).toBe(true);
  expect(probe.states.get('https://example.com/pr/1')?.state).toBe('merged');
  expect(probe.states.get('https://example.com/pr/404')?.state).toBe('unknown');
});

test('nothing to ask counts as live — no PRs means nothing can be stale', async () => {
  process.env.WARD_GH = NO_GH;
  const probe = await probeForge([]);
  expect(probe.live).toBe(true);
  expect(probe.states.size).toBe(0);
});

test('duplicate URLs are asked once', async () => {
  const log = join(scratch, 'calls.log');
  process.env.WARD_GH = writeFakeGh(scratch, 'gh-logged', {
    responses: { 'https://example.com/pr/1': { state: 'OPEN' } },
    logFile: log,
  });
  const url = 'https://example.com/pr/1';
  const probe = await probeForge([url, url, url]);
  expect(probe.live).toBe(true);
  expect((await Bun.file(log).text()).trim().split('\n')).toEqual([url]);
});

test('a hung forge is cut at the deadline and degrades to live:false', async () => {
  process.env.WARD_GH = writeFakeGh(scratch, 'gh-hung', {
    responses: { 'https://example.com/pr/1': { state: 'OPEN' } },
    delayMs: 10_000,
  });
  process.env.WARD_GH_TIMEOUT_MS = '250';
  const started = Date.now();
  const probe = await probeForge(['https://example.com/pr/1']);
  expect(probe.live).toBe(false);
  expect(Date.now() - started).toBeLessThan(5000); // the deadline, not the hang
});

// -- setup ----------------------------------------------------------------
// Each test points WARD_GH at its own fake; afterEach restores the hermetic
// pin so no later test inherits a fake (or reaches the machine's real gh).

let scratch: string;

beforeAll(() => {
  applyGitTestEnv();
  scratch = makeTempDir();
});

afterEach(() => {
  process.env.WARD_GH = NO_GH;
  delete process.env.WARD_GH_TIMEOUT_MS;
});

afterAll(() => {
  removeDir(scratch);
});
