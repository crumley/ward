// Proof of concurrency (design/0013-telemetry-and-serialized-writes/): real
// concurrent writers — spawned CLI processes and in-process promises — racing
// one store, asserting the §17 guarantees: unique allocations, every record
// present, a clean linear history, no lost updates; plus the legible failure
// modes — a crashed writer's lock taken over with the takeover named, a
// contention timeout naming the holder, reads never waiting on the lock —
// and doctor naming the lock's state (§20).
import { afterAll, beforeAll, beforeEach, expect, test } from 'bun:test';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { hostname } from 'node:os';
import { join } from 'node:path';
import { storeLockPath } from '../../src/store/lock.ts';
import { createWorkspace } from '../../src/workspace/create.ts';
import { runDoctor } from '../../src/workspace/doctor.ts';
import { gitOrThrow } from '../../src/workspace/git.ts';
import { readTasks } from '../../src/workspace/scan.ts';
import { openTask } from '../../src/workspace/tasks.ts';
import {
  applyGitTestEnv,
  type CliResult,
  cliPath,
  GIT_ENV,
  makeTempDir,
  NO_GH,
  removeDir,
  runWard,
  runWardEnv,
} from '../helpers.ts';

test('five concurrent task opens through the CLI: unique codes, every record, linear history', async () => {
  const results = await Promise.all(
    ['a', 'b', 'c', 'd', 'e'].map((slug) => spawnWard(['task', 'open', `race-${slug}`], ws)),
  );
  for (const result of results) {
    expect(result.exitCode).toBe(0);
  }

  // Every record present, every code unique — no allocation was lost.
  const tasks = await readTasks(ws);
  expect(tasks.map((task) => task.record.code).sort()).toEqual(['t1', 't2', 't3', 't4', 't5']);
  expect(new Set(tasks.map((task) => task.record.slug)).size).toBe(5);

  // A clean linear history: one commit per open atop the initial commit,
  // no merges, nothing half-written left behind.
  expect(gitOrThrow(ws, 'rev-list', '--count', 'HEAD').stdout.trim()).toBe('6');
  expect(gitOrThrow(ws, 'rev-list', '--merges', 'HEAD').stdout.trim()).toBe('');
  expect(gitOrThrow(ws, 'status', '--porcelain').stdout.trim()).toBe('');
  expect(existsSync(storeLockPath(ws))).toBe(false);

  // No raw git index.lock collision ever surfaced to a caller.
  for (const result of results) {
    expect(result.stderr).not.toContain('index.lock');
  }
}, 30_000);

test('concurrent module-level opens serialize the allocation scan', async () => {
  const opened = await Promise.all([1, 2, 3, 4].map((n) => openTask(ws, `inproc-${n}`, {})));
  expect(opened.map((task) => task.record.code).sort()).toEqual(['t1', 't2', 't3', 't4']);
  expect(gitOrThrow(ws, 'rev-list', '--count', 'HEAD').stdout.trim()).toBe('5');
});

test('a stale lock left by a crashed writer is taken over, legibly', async () => {
  const deadPid = spawnDeadPid();
  writeLockFixture(ws, { pid: deadPid, verb: 'task open crashed' });

  const result = runWard(['task', 'open', 'after-crash'], ws);
  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain('opened task');
  expect(result.stderr).toContain('took over a stale store lock');
  expect(result.stderr).toContain(String(deadPid));
  expect(existsSync(storeLockPath(ws))).toBe(false); // released after the write
});

test('contention past the bound refuses legibly, naming the holder', async () => {
  // Held by this very test process — alive, same host, never stolen.
  writeLockFixture(ws, { pid: process.pid, verb: 'session open demo-1' });
  const result = runWardEnv(['task', 'open', 'blocked'], ws, {
    NO_COLOR: '1',
    WARD_GH: NO_GH,
    WARD_LOCK_TIMEOUT_MS: '300',
  });
  expect(result.exitCode).toBe(1);
  expect(result.stderr).toContain('write-locked');
  expect(result.stderr).toContain(String(process.pid));
  expect(result.stderr).toContain('session open demo-1');
  expect(result.stderr).not.toContain('index.lock');
  const tasks = await readTasks(ws);
  expect(tasks.some((task) => task.record.slug === 'blocked')).toBe(false); // refused = untouched
});

test('read verbs never wait on the store lock', () => {
  runWard(['task', 'open', 'readable'], ws);
  writeLockFixture(ws, { pid: process.pid, verb: 'task open elsewhere' });
  const result = runWardEnv(['task', 'list'], ws, {
    NO_COLOR: '1',
    WARD_GH: NO_GH,
    WARD_LOCK_TIMEOUT_MS: '60000', // a wait would blow the test timeout, not pass it
  });
  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain('readable');
});

test('doctor names the lock state: held is info, stale is warn, neither unhealthy', async () => {
  // Absent: ok.
  expect(lockFinding(await runDoctor(ws))?.severity).toBe('ok');

  // Held by a live writer: info, naming pid and verb.
  writeLockFixture(ws, { pid: process.pid, verb: 'task open busy' });
  const held = await runDoctor(ws);
  const heldFinding = lockFinding(held);
  expect(heldFinding?.severity).toBe('info');
  expect(heldFinding?.message).toContain(`pid ${process.pid}`);
  expect(heldFinding?.message).toContain('task open busy');
  expect(held.healthy).toBe(true);

  // Left by a crashed writer: warn, with the takeover and the safe remedy.
  writeLockFixture(ws, { pid: spawnDeadPid(), verb: 'task open crashed' });
  const stale = await runDoctor(ws);
  const staleFinding = lockFinding(stale);
  expect(staleFinding?.severity).toBe('warn');
  expect(staleFinding?.message).toContain('stale');
  expect(staleFinding?.message).toContain('the next write takes it over');
  expect(stale.healthy).toBe(true); // nothing is blocked — never an error
});

// -- helpers --------------------------------------------------------------

/** Async CLI spawn — the concurrent runs must actually overlap. */
async function spawnWard(argv: string[], cwd: string): Promise<CliResult> {
  const child = Bun.spawn(['bun', cliPath, ...argv], {
    cwd,
    env: { ...process.env, NO_COLOR: '1', WARD_GH: NO_GH, ...GIT_ENV },
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  return { exitCode, stdout, stderr };
}

/** A pid that certainly ran and certainly exited: a short-lived child's. */
function spawnDeadPid(): number {
  const child = Bun.spawnSync(['sh', '-c', 'echo $$']);
  return Number.parseInt(child.stdout.toString().trim(), 10);
}

function writeLockFixture(root: string, fields: Record<string, unknown>): void {
  mkdirSync(join(root, '.ward'), { recursive: true });
  const holder = {
    pid: process.pid,
    host: hostname(),
    verb: 'test fixture',
    caller: 'human',
    startedAt: new Date().toISOString(),
    nonce: crypto.randomUUID(),
    ...fields,
  };
  writeFileSync(storeLockPath(root), `${JSON.stringify(holder)}\n`);
}

function lockFinding(report: Awaited<ReturnType<typeof runDoctor>>) {
  return report.workspace.find((finding) => finding.check === 'store lock');
}

// -- setup ----------------------------------------------------------------

let scratch: string;
let ws: string;
let caseId = 0;

beforeAll(() => {
  applyGitTestEnv();
  scratch = makeTempDir();
});

// A fresh workspace per test, so races and lock fixtures stay independent.
beforeEach(async () => {
  caseId += 1;
  ws = join(scratch, `ws-${caseId}`);
  await createWorkspace(ws);
});

afterAll(() => {
  removeDir(scratch);
});
