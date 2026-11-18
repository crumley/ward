// Affinity at the CLI (design/0037-repo-floor-affinity/): claiming and
// releasing, the routing a claim performs at `task open`, the explicit floor
// that always wins, the worktree the task record can name on its own, and the
// documents both audiences read.
import { afterAll, beforeAll, beforeEach, expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { projectClaimShape, taskMutationShape } from '../../src/cli/schema.ts';
import { addRepository } from '../../src/workspace/repos.ts';
import { applyGitTestEnv, callWard, makeTempDir, removeDir } from '../helpers.ts';
import { preparedRemote, preparedWorkspace } from '../prepared.ts';

test('project open --repo claims at open; project list shows the claims', async () => {
  expect((await callWard(['project', 'open', 'toolchain', '--repo', 'demo'], ws)).exitCode).toBe(0);
  const listed = await callWard(['project', 'list'], ws);
  expect(listed.stdout).toContain('floor 1 — 🌊 toolchain [active] (0 tasks · repos: demo) · blue');

  const json = JSON.parse((await callWard(['project', 'list', '--json'], ws)).stdout);
  expect(json.projects[1]).toMatchObject({ floor: 1, repositories: ['demo'] });
});

test('project claim --json: the floor, the claims, and what stays behind', async () => {
  await callWard(['project', 'open', 'first'], ws); // floor 1
  await callWard(['project', 'open', 'second'], ws); // floor 2
  expect((await callWard(['project', 'claim', '1', 'demo'], ws)).stdout).toContain(
    'claimed demo for floor 1 — first',
  );
  await callWard(['task', 'open', 'in-flight', '--project', '1', '--repo', 'demo'], ws);

  const moved = await callWard(['project', 'claim', '2', 'demo'], ws);
  expect(moved.exitCode).toBe(0);
  expect(moved.stdout).toContain('moved demo from floor 1 to floor 2 — second');
  expect(moved.stdout).toContain(
    'ward now routes to floor 2; 1 open task touching it remains where it was opened: ' +
      'f1t1 (in-flight)',
  );

  const json = await callWard(['project', 'claim', '2', 'demo', '--json'], ws);
  expect(projectClaimShape.parse(JSON.parse(json.stdout))).toEqual({
    floor: 2,
    slug: 'second',
    repository: 'demo',
    outcome: 'satisfied',
    repositories: ['demo'],
    staying: [{ address: 'f1t1', slug: 'in-flight', floor: 1 }],
  });
});

test('project release drops the claim, and releasing what is not held converges', async () => {
  await callWard(['project', 'open', 'first', '--repo', 'demo'], ws);
  expect((await callWard(['project', 'release', '1', 'demo'], ws)).stdout).toContain(
    'released demo from floor 1 — first',
  );
  const again = await callWard(['project', 'release', '1', 'demo', '--json'], ws);
  expect(again.exitCode).toBe(0);
  expect(projectClaimShape.parse(JSON.parse(again.stdout))).toMatchObject({
    outcome: 'absent',
    repositories: [],
  });
});

test('a claim on an unregistered name is refused and writes nothing', async () => {
  await callWard(['project', 'open', 'first'], ws);
  const refused = await callWard(['project', 'claim', '1', 'nonesuch'], ws);
  expect(refused.exitCode).toBe(1);
  expect(refused.stdout).toBe('');
  expect(refused.stderr).toContain("no repository named 'nonesuch' is registered");
});

test('task open --repo routes to the claiming floor and says why', async () => {
  await callWard(['project', 'open', 'toolchain', '--repo', 'demo'], ws);
  const opened = await callWard(['task', 'open', 'a-feature', '--repo', 'demo'], ws);
  expect(opened.exitCode).toBe(0);
  expect(opened.stdout).toContain('opened f1t1 — a-feature (floor 1 by affinity: demo)');

  const json = await callWard(['task', 'open', 'another', '--repo', 'demo', '--json'], ws);
  expect(taskMutationShape.parse(JSON.parse(json.stdout))).toMatchObject({
    address: 'f1t2',
    floor: 1,
    repositories: ['demo'],
  });
});

test('with no claimant the task lands on the ground floor, and the hint names the fix', async () => {
  const opened = await callWard(['task', 'open', 'unrouted', '--repo', 'demo'], ws);
  expect(opened.exitCode).toBe(0);
  // Both halves are said (design/0041-ground-floor/): where it went, and what
  // would have routed it somewhere deliberate.
  expect(opened.stdout).toContain(
    'opened f0t1 — unrouted (floor 0 — the ground floor; ' +
      'no floor claims demo — ward project claim FLOOR demo)',
  );
});

test('--project always wins, and the echo says the affinity disagreed', async () => {
  await callWard(['project', 'open', 'claiming', '--repo', 'demo'], ws); // floor 1
  await callWard(['project', 'open', 'elsewhere'], ws); // floor 2
  const opened = await callWard(['task', 'open', 'placed', '--project', '2', '--repo', 'demo'], ws);
  expect(opened.stdout).toContain(
    'opened f2t1 — placed (floor 2 as named — affinity would have said floor 1)',
  );
});

test('two repositories claimed by different floors refuse, naming both', async () => {
  await callWard(['project', 'open', 'first', '--repo', 'demo'], ws);
  await callWard(['project', 'open', 'second', '--repo', 'other'], ws);
  const refused = await callWard(
    ['task', 'open', 'crosses', '--repo', 'demo', '--repo', 'other'],
    ws,
  );
  expect(refused.exitCode).toBe(1);
  expect(refused.stderr).toContain('claimed by different floors');
  expect(refused.stderr).toContain('ward task open SLUG --project FLOOR');
  // Named explicitly, the same open proceeds.
  const placed = await callWard(
    ['task', 'open', 'crosses', '--project', '1', '--repo', 'demo', '--repo', 'other'],
    ws,
  );
  expect(placed.exitCode).toBe(0);
});

test("worktree create with no --repo uses the task's single recorded repository", async () => {
  await callWard(['project', 'open', 'toolchain', '--repo', 'demo'], ws);
  await callWard(['task', 'open', 'a-feature', '--repo', 'demo'], ws);
  const created = await callWard(['worktree', 'create', 'f1t1'], ws);
  expect(created.exitCode).toBe(0);
  expect(created.stdout).toContain('created floors/1-toolchain/f1t1-a-feature');
  expect(existsSync(join(ws, 'floors/1-toolchain/f1t1-a-feature'))).toBe(true);

  // Two recorded, and Ward does not choose: the refusal that always stood.
  await callWard(
    ['task', 'open', 'crosses', '--project', '1', '--repo', 'demo', '--repo', 'other'],
    ws,
  );
  const refused = await callWard(['worktree', 'create', 'f1t2'], ws);
  expect(refused.exitCode).toBe(1);
  expect(refused.stderr).toContain('name the worktree source');
});

test('ward schema documents the two new verbs', async () => {
  const shape = JSON.parse((await callWard(['schema', 'project', 'claim'], ws)).stdout);
  expect(shape.required).toEqual([
    'floor',
    'slug',
    'repository',
    'outcome',
    'repositories',
    'staying',
  ]);
  expect(Object.keys(shape.properties)).toContain('from');
  expect((await callWard(['schema', 'project', 'release'], ws)).exitCode).toBe(0);
});

// -- setup ----------------------------------------------------------------
// A fresh workspace per case with two registered repositories, `demo` and
// `other`: a claim is about the registered set, and each case rearranges it.

let scratch: string;
let ws: string;

beforeAll(() => {
  applyGitTestEnv();
  scratch = makeTempDir();
});

afterAll(() => removeDir(scratch));

let counter = 0;
beforeEach(async () => {
  counter += 1;
  ws = join(scratch, `case-${counter}`);
  await preparedWorkspace(ws);
  for (const name of ['demo', 'other']) {
    await addRepository(ws, makeRemote(join(scratch, `remote-${counter}-${name}`)), name);
  }
});

/** A bare repository with one commit — the source `repo add` clones from. */
function makeRemote(path: string): string {
  preparedRemote(path, { branch: 'main', files: { 'README.md': '# seed\n' } });
  return path;
}
