// The ground floor at the command line (design/0041-ground-floor/): `task
// open` with nothing named lands on floor 0 and says so, `--project 0` is an
// ordinary floor argument, and both listings lead with the ground floor —
// named as such for a reader who has never seen this workspace before.
import { afterAll, beforeAll, expect, test } from 'bun:test';
import { join } from 'node:path';
import { applyGitTestEnv, makeTempDir, removeDir, runWard } from '../helpers.ts';

test('task open with no floor named opens on the ground floor, and the echo says why', () => {
  const ws = workspace('echo');
  const opened = runWard(['task', 'open', 'a-thing'], ws);
  expect(opened.exitCode).toBe(0);
  expect(opened.stdout).toBe('opened f0t1 — a-thing (floor 0 — the ground floor)\n');
  expect(taskJson(ws, 'a-thing')).toMatchObject({ address: 'f0t1', floor: 0, code: 't1' });
});

test('--project 0 is an ordinary floor argument; an explicit floor still wins', () => {
  const ws = workspace('explicit');
  expect(runWard(['project', 'open', 'toolchain'], ws).stdout).toContain('floor 1');
  const named = runWard(['task', 'open', 'on-the-ground', '--project', '0'], ws);
  expect(named.exitCode).toBe(0);
  expect(named.stdout).toBe('opened f0t1 — on-the-ground\n'); // no note: the floor was named
  const elsewhere = runWard(['task', 'open', 'upstairs', '--project', '1'], ws);
  expect(elsewhere.stdout).toBe('opened f1t1 — upstairs\n');
});

test('status and project list lead with the ground floor, named as one', () => {
  const ws = workspace('listings');
  runWard(['project', 'open', 'toolchain'], ws);
  const status = runWard(['status'], ws).stdout;
  expect(status).toContain('floor 0 — workspace (ground floor) [active]');
  expect(status.indexOf('floor 0')).toBeLessThan(status.indexOf('floor 1'));
  expect(runWard(['project', 'list'], ws).stdout).toContain(
    'floor 0 — workspace (ground floor) [active]',
  );
  const projects = JSON.parse(runWard(['project', 'list', '--json'], ws).stdout).projects;
  expect(projects.map((project: { floor: number }) => project.floor)).toEqual([0, 1]);
});

test('a workspace with no ground floor refuses the open, with the update remedy', () => {
  const ws = workspace('no-ground-floor');
  removeDir(join(ws, 'projects', '0-workspace'));
  const refused = runWard(['task', 'open', 'nowhere-to-go'], ws);
  expect(refused.exitCode).not.toBe(0);
  expect(refused.stdout).toBe(''); // a refusal emits no document, on either rendering
  expect(refused.stderr).toContain('no ground floor — establish it: ward workspace upgrade');
  // Doctor names the same state with the same remedy — one answer, two surfaces.
  const doctor = JSON.parse(runWard(['doctor', '--json'], ws).stdout);
  const finding = doctor.workspace.find((f: { check: string }) => f.check === 'standing project');
  expect(finding.severity).toBe('info');
  expect(finding.message).toContain('ward workspace upgrade');
});

// -- setup ------------------------------------------------------------------

let scratch: string;
let counter = 0;

beforeAll(() => {
  applyGitTestEnv();
  scratch = makeTempDir();
});

afterAll(() => removeDir(scratch));

function workspace(name: string): string {
  counter += 1;
  const ws = join(scratch, `${name}-${counter}`);
  runWard(['workspace', 'create', ws], scratch);
  return ws;
}

function taskJson(ws: string, slug: string): unknown {
  const listing = JSON.parse(runWard(['task', 'list', '--json'], ws).stdout);
  return listing.tasks.find((task: { slug: string }) => task.slug === slug);
}
