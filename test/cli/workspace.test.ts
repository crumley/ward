// The acceptance scenarios of design/0002-store-and-workspace/, end to end
// through the spawned CLI: create produces a valid workspace, re-run
// converges without changes, and doctor reports machine checks outside a
// workspace, health inside one, and corruption loudly.
import { afterAll, beforeAll, expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { git } from '../../src/workspace/git.ts';
import { applyGitTestEnv, makeTempDir, removeDir, runWard } from '../helpers.ts';

test('workspace create produces a valid workspace with a first commit', () => {
  const result = runWard(['workspace', 'create', ws], outside);
  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain('established');
  expect(result.stdout).toContain('Workspace ready');
  for (const file of ['workspace.md', 'catalog.md', 'AGENTS.md', 'CLAUDE.md', '.gitignore']) {
    expect(existsSync(join(ws, file))).toBe(true);
  }
  expect(git(ws, 'rev-list', '--count', 'HEAD').stdout.trim()).toBe('1');
});

test('re-running create converges: exit 0, all satisfied, clean tree', () => {
  const result = runWard(['workspace', 'create', ws], outside);
  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain('0 established, 11 already satisfied');
  expect(git(ws, 'status', '--porcelain').stdout).toBe('');
});

test('doctor outside any workspace runs machine checks only', () => {
  const result = runWard(['doctor'], outside);
  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain('Machine');
  expect(result.stdout).toContain('git');
  expect(result.stdout).toContain('No workspace found');
});

test('doctor inside the workspace reports it healthy', () => {
  const result = runWard(['doctor'], ws);
  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain('Workspace');
  expect(result.stdout).toContain('stamped by ward');
  expect(result.stdout).toContain('healthy');
});

test('doctor reports a corrupted record loudly and exits non-zero', async () => {
  await Bun.write(join(ws, 'workspace.md'), '---\ntype: garbage\n---\n');
  const result = runWard(['doctor'], ws);
  expect(result.exitCode).toBe(1);
  expect(result.stdout).toContain('workspace.md');
  expect(result.stdout).toContain('unhealthy');
});

// -- setup ----------------------------------------------------------------
// Cases run in order and share one workspace: create, converge, then doctor
// against it — the acceptance scenarios are a single arc, not independent.

let outside: string;
let ws: string;

beforeAll(() => {
  applyGitTestEnv();
  outside = makeTempDir();
  ws = join(outside, 'workspace');
});

afterAll(() => {
  removeDir(outside);
});
