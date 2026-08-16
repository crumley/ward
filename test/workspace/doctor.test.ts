// Doctor's gh findings (design/0010-doctor-forge-auth/): presence and health
// are separate findings, both read through the WARD_GH seam the probe spawns
// — the motivating incident was a broken token that `status` reported
// honestly while doctor green-lit the installed binary. Installed but
// unauthenticated is warn with the remedy (a misconfiguration doctor exists
// to catch); a hung check is info (cannot-verify is not broken); absence
// stays info (optional tool) — and none of them flip doctor's exit code:
// report-only.
import { afterAll, afterEach, beforeAll, expect, test } from 'bun:test';
import { rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createWorkspace } from '../../src/workspace/create.ts';
import { type Finding, runDoctor } from '../../src/workspace/doctor.ts';
import {
  applyGitTestEnv,
  makeTempDir,
  NO_GH,
  removeDir,
  runWardEnv,
  writeFakeGh,
} from '../helpers.ts';

const rows: ReadonlyArray<{
  name: string;
  gh: () => string;
  expected: ReadonlyArray<Record<string, unknown>>;
}> = [
  {
    name: 'absent: one info finding, no auth row — nothing to verify',
    gh: () => NO_GH,
    expected: [{ check: 'gh', severity: 'info' }],
  },
  {
    name: 'authenticated: presence ok, auth ok',
    gh: () => writeFakeGh(scratch, 'gh-auth-ok', { responses: {}, auth: 'ok' }),
    expected: [
      { check: 'gh', severity: 'ok' },
      { check: 'gh auth', severity: 'ok' },
    ],
  },
  {
    name: 'unauthenticated: installed-but-broken is warn, with the remedy',
    gh: () => writeFakeGh(scratch, 'gh-auth-broken', { responses: {}, auth: 'error' }),
    expected: [
      { check: 'gh', severity: 'ok' },
      { check: 'gh auth', severity: 'warn', message: expect.stringContaining('gh auth login') },
    ],
  },
];

for (const row of rows) {
  test(`gh findings — ${row.name}`, async () => {
    process.env.WARD_GH = row.gh();
    const report = await runDoctor(scratch);
    expect(ghFindings(report.machine)).toMatchObject([...row.expected]);
    expect(report.healthy).toBe(true); // report-only: no gh state is ever an error
  });
}

test('a hung auth check is cut at the deadline and reads cannot-verify, never broken', async () => {
  process.env.WARD_GH = writeFakeGh(scratch, 'gh-auth-hung', {
    responses: {},
    auth: 'ok',
    delayMs: 30_000,
  });
  process.env.WARD_GH_TIMEOUT_MS = '250';
  const started = Date.now();
  const report = await runDoctor(scratch);
  expect(Date.now() - started).toBeLessThan(5000); // the deadline, not the hang
  expect(ghFindings(report.machine)).toMatchObject([
    { check: 'gh', severity: 'ok' },
    { check: 'gh auth', severity: 'info', message: expect.stringContaining('cannot verify') },
  ]);
  expect(report.healthy).toBe(true);
});

test('the human rendering carries the warn mark and the remedy', () => {
  const fake = writeFakeGh(scratch, 'gh-auth-broken-cli', { responses: {}, auth: 'error' });
  const result = runWardEnv(['doctor'], scratch, { WARD_GH: fake, NO_COLOR: '1' });
  expect(result.exitCode).toBe(0); // warn reports; it never fails the run
  expect(result.stdout).toContain('✓ gh — GitHub CLI available');
  expect(result.stdout).toContain('! gh auth — installed but cannot reach the forge');
  expect(result.stdout).toContain('gh auth login');
});

// -- claude guidance (design/0017-claude-md-symlink/) ----------------------
// Creation bridges Claude Code's expected filename onto the harness-neutral
// AGENTS.md with a relative symlink; doctor names the states without ever
// failing the run: linked is ok; absent is the pre-0017 workspace — the
// first workspace-migration target — info carrying the one-line remedy a
// future upgrade will automate; a regular file or a link aimed elsewhere is
// the human's own arrangement — info, never an instruction to delete it.

const claudeRows: ReadonlyArray<{
  name: string;
  arrange: (ws: string) => void;
  expected: Record<string, unknown>;
}> = [
  {
    name: 'fresh workspace: the link reads ok',
    arrange: () => {},
    expected: { severity: 'ok', message: expect.stringContaining('CLAUDE.md → AGENTS.md') },
  },
  {
    name: 'absent (the pre-0017 shape): info carrying the symlink remedy',
    arrange: (ws) => rmSync(join(ws, 'CLAUDE.md')),
    expected: {
      severity: 'info',
      message: expect.stringContaining('ln -s AGENTS.md CLAUDE.md'),
    },
  },
  {
    name: 'a divergent regular file: the arrangement is theirs, info',
    arrange: (ws) => {
      rmSync(join(ws, 'CLAUDE.md'));
      writeFileSync(join(ws, 'CLAUDE.md'), 'my own claude guidance\n');
    },
    expected: { severity: 'info', message: expect.stringContaining('your own arrangement') },
  },
  {
    name: 'a symlink aimed elsewhere: the arrangement is theirs, info',
    arrange: (ws) => {
      rmSync(join(ws, 'CLAUDE.md'));
      symlinkSync('somewhere/else.md', join(ws, 'CLAUDE.md'));
    },
    expected: { severity: 'info', message: expect.stringContaining('your own arrangement') },
  },
];

let claudeCase = 0;
for (const row of claudeRows) {
  test(`claude guidance — ${row.name}`, async () => {
    claudeCase += 1;
    const ws = join(scratch, `ws-claude-${claudeCase}`);
    await createWorkspace(ws);
    row.arrange(ws);
    const report = await runDoctor(ws);
    const finding = report.workspace.find((f) => f.check === 'claude guidance');
    expect(finding?.message).not.toContain('delete'); // report, never a removal instruction
    expect(finding).toMatchObject(row.expected);
    expect(report.healthy).toBe(true); // report-only: no CLAUDE.md state is ever an error
  });
}

// -- standing project (design/0018-standing-workspace-project/) ------------
// Creation establishes the workspace's own project; a pre-0018 workspace
// lacks it — the same migration-target shape as the missing CLAUDE.md above:
// info carrying the converge remedy, doctor never creating it itself, and no
// state ever failing the run.

test('standing project — fresh workspace: ok, naming its floor', async () => {
  const ws = join(scratch, 'ws-standing-ok');
  await createWorkspace(ws);
  const report = await runDoctor(ws);
  const finding = report.workspace.find((f) => f.check === 'standing project');
  expect(finding).toMatchObject({
    severity: 'ok',
    message: expect.stringContaining('floor 1 (projects/1-workspace/)'),
  });
  expect(report.healthy).toBe(true);
});

test('standing project — absent (the pre-0018 shape): info carrying the converge remedy', async () => {
  const ws = join(scratch, 'ws-standing-absent');
  await createWorkspace(ws);
  rmSync(join(ws, 'projects', '1-workspace'), { recursive: true });
  const report = await runDoctor(ws);
  const finding = report.workspace.find((f) => f.check === 'standing project');
  expect(finding).toMatchObject({
    severity: 'info',
    message: expect.stringContaining(`ward workspace create ${ws}`),
  });
  expect(report.healthy).toBe(true); // report-only: absence is a bridge, not a failure
});

// -- setup ----------------------------------------------------------------
// Each test points WARD_GH at its own fake; afterEach restores the hermetic
// pin so no later test inherits a fake (or reaches the machine's real gh).

let scratch: string;

function ghFindings(findings: readonly Finding[]): Finding[] {
  return findings.filter((f) => f.check === 'gh' || f.check === 'gh auth');
}

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
