// Affinity at the CLI (design/0037-repo-floor-affinity/): claiming and
// releasing, the routing a claim performs at `task open`, the explicit floor
// that always wins, the worktree the task record can name on its own, and the
// documents both audiences read.
import { afterAll, beforeAll, beforeEach, expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { projectClaimShape, taskMutationShape } from '../../src/cli/schema.ts';
import { createWorkspace } from '../../src/workspace/create.ts';
import { gitOrThrow } from '../../src/workspace/git.ts';
import { addRepository } from '../../src/workspace/repos.ts';
import { applyGitTestEnv, makeTempDir, removeDir, runWard } from '../helpers.ts';

test('project open --repo claims at open; project list shows the claims', () => {
  expect(runWard(['project', 'open', 'toolchain', '--repo', 'demo'], ws).exitCode).toBe(0);
  const listed = runWard(['project', 'list'], ws);
  expect(listed.stdout).toContain('floor 2 — toolchain [active] (0 tasks · repos: demo)');

  const json = JSON.parse(runWard(['project', 'list', '--json'], ws).stdout);
  expect(json.projects[1]).toMatchObject({ floor: 2, repositories: ['demo'] });
});

test('project claim --json: the floor, the claims, and what stays behind', () => {
  runWard(['project', 'open', 'first'], ws); // floor 2
  runWard(['project', 'open', 'second'], ws); // floor 3
  expect(runWard(['project', 'claim', '2', 'demo'], ws).stdout).toContain(
    'claimed demo for floor 2 — first',
  );
  runWard(['task', 'open', 'in-flight', '--project', '2', '--repo', 'demo'], ws);

  const moved = runWard(['project', 'claim', '3', 'demo'], ws);
  expect(moved.exitCode).toBe(0);
  expect(moved.stdout).toContain('moved demo from floor 2 to floor 3 — second');
  expect(moved.stdout).toContain(
    'ward now routes to floor 3; 1 open task touching it remains where it was opened: ' +
      'f2t1 (in-flight)',
  );

  const json = runWard(['project', 'claim', '3', 'demo', '--json'], ws);
  expect(projectClaimShape.parse(JSON.parse(json.stdout))).toEqual({
    floor: 3,
    slug: 'second',
    repository: 'demo',
    outcome: 'satisfied',
    repositories: ['demo'],
    staying: [{ address: 'f2t1', slug: 'in-flight', floor: 2 }],
  });
});

test('project release drops the claim, and releasing what is not held converges', () => {
  runWard(['project', 'open', 'first', '--repo', 'demo'], ws);
  expect(runWard(['project', 'release', '2', 'demo'], ws).stdout).toContain(
    'released demo from floor 2 — first',
  );
  const again = runWard(['project', 'release', '2', 'demo', '--json'], ws);
  expect(again.exitCode).toBe(0);
  expect(projectClaimShape.parse(JSON.parse(again.stdout))).toMatchObject({
    outcome: 'absent',
    repositories: [],
  });
});

test('a claim on an unregistered name is refused and writes nothing', () => {
  runWard(['project', 'open', 'first'], ws);
  const refused = runWard(['project', 'claim', '2', 'nonesuch'], ws);
  expect(refused.exitCode).toBe(1);
  expect(refused.stdout).toBe('');
  expect(refused.stderr).toContain("no repository named 'nonesuch' is registered");
});

test('task open --repo routes to the claiming floor and says why', () => {
  runWard(['project', 'open', 'toolchain', '--repo', 'demo'], ws);
  const opened = runWard(['task', 'open', 'a-feature', '--repo', 'demo'], ws);
  expect(opened.exitCode).toBe(0);
  expect(opened.stdout).toContain('opened f2t1 — a-feature (floor 2 by affinity: demo)');

  const json = runWard(['task', 'open', 'another', '--repo', 'demo', '--json'], ws);
  expect(taskMutationShape.parse(JSON.parse(json.stdout))).toMatchObject({
    address: 'f2t2',
    floor: 2,
    repositories: ['demo'],
  });
});

test('with no claimant the task stays bare, and the hint names the fix', () => {
  const opened = runWard(['task', 'open', 'unrouted', '--repo', 'demo'], ws);
  expect(opened.exitCode).toBe(0);
  expect(opened.stdout).toContain(
    'opened t1 — unrouted (no floor claims demo — ward project claim FLOOR demo)',
  );
});

test('--project always wins, and the echo says the affinity disagreed', () => {
  runWard(['project', 'open', 'claiming', '--repo', 'demo'], ws); // floor 2
  runWard(['project', 'open', 'elsewhere'], ws); // floor 3
  const opened = runWard(['task', 'open', 'placed', '--project', '3', '--repo', 'demo'], ws);
  expect(opened.stdout).toContain(
    'opened f3t1 — placed (floor 3 as named — affinity would have said floor 2)',
  );
});

test('two repositories claimed by different floors refuse, naming both', () => {
  runWard(['project', 'open', 'first', '--repo', 'demo'], ws);
  runWard(['project', 'open', 'second', '--repo', 'other'], ws);
  const refused = runWard(['task', 'open', 'crosses', '--repo', 'demo', '--repo', 'other'], ws);
  expect(refused.exitCode).toBe(1);
  expect(refused.stderr).toContain('claimed by different floors');
  expect(refused.stderr).toContain('ward task open SLUG --project FLOOR');
  // Named explicitly, the same open proceeds.
  const placed = runWard(
    ['task', 'open', 'crosses', '--project', '2', '--repo', 'demo', '--repo', 'other'],
    ws,
  );
  expect(placed.exitCode).toBe(0);
});

test("worktree create with no --repo uses the task's single recorded repository", () => {
  runWard(['project', 'open', 'toolchain', '--repo', 'demo'], ws);
  runWard(['task', 'open', 'a-feature', '--repo', 'demo'], ws);
  const created = runWard(['worktree', 'create', 'f2t1'], ws);
  expect(created.exitCode).toBe(0);
  expect(created.stdout).toContain('created worktrees/f2t1-a-feature');
  expect(existsSync(join(ws, 'worktrees', 'f2t1-a-feature'))).toBe(true);

  // Two recorded, and Ward does not choose: the refusal that always stood.
  runWard(['task', 'open', 'crosses', '--project', '2', '--repo', 'demo', '--repo', 'other'], ws);
  const refused = runWard(['worktree', 'create', 'f2t2'], ws);
  expect(refused.exitCode).toBe(1);
  expect(refused.stderr).toContain('name the worktree source');
});

test('ward schema documents the two new verbs', () => {
  const shape = JSON.parse(runWard(['schema', 'project', 'claim'], ws).stdout);
  expect(shape.required).toEqual([
    'floor',
    'slug',
    'repository',
    'outcome',
    'repositories',
    'staying',
  ]);
  expect(Object.keys(shape.properties)).toContain('from');
  expect(runWard(['schema', 'project', 'release'], ws).exitCode).toBe(0);
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
  await createWorkspace(ws);
  for (const name of ['demo', 'other']) {
    await addRepository(ws, makeRemote(join(scratch, `remote-${counter}-${name}`)), name);
  }
});

/** A bare repository with one commit — the source `repo add` clones from. */
function makeRemote(path: string): string {
  const seed = `${path}-seed`;
  gitOrThrow(scratch, 'init', '--bare', '--initial-branch=main', path);
  gitOrThrow(scratch, 'clone', path, seed);
  Bun.write(join(seed, 'README.md'), '# seed\n');
  gitOrThrow(seed, 'add', '-A');
  gitOrThrow(seed, 'commit', '-m', 'seed');
  gitOrThrow(seed, 'push', 'origin', 'main');
  return path;
}
