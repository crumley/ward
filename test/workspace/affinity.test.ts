// Repository → floor affinity (design/0037-repo-floor-affinity/): the claim as
// a routing default — recorded at a floor, honoured when a task names a
// repository and no floor, overridden by an explicit floor, moved rather than
// split, and never moving work that is already placed.
import { afterAll, beforeAll, beforeEach, expect, test } from 'bun:test';
import { join } from 'node:path';
import {
  claimRepository,
  claimsOf,
  placeByAffinity,
  recordedRepository,
  releaseRepository,
  requireRegistered,
} from '../../src/workspace/affinity.ts';
import { createWorkspace } from '../../src/workspace/create.ts';
import { runDoctor } from '../../src/workspace/doctor.ts';
import { gitOrThrow } from '../../src/workspace/git.ts';
import { openProject, readProjects, resolveProject } from '../../src/workspace/projects.ts';
import { addRepository } from '../../src/workspace/repos.ts';
import { closeTask, openTask } from '../../src/workspace/tasks.ts';
import { applyGitTestEnv, makeTempDir, removeDir } from '../helpers.ts';

// -- the claim ------------------------------------------------------------

test('a claim is recorded on the floor and read back from the record', async () => {
  await openProject(ws, 'toolchain'); // floor 2
  const report = await claimRepository(ws, 2, 'demo');
  expect(report.outcome).toBe('claimed');
  expect(claimsOf((await resolveProject(ws, 2)).record)).toEqual(['demo']);
  expect(report.staying).toEqual([]);
});

test('claiming at open records the claim with the floor', async () => {
  const record = await openProject(ws, 'toolchain', { repositories: ['other', 'demo'] });
  expect(record.repositories).toEqual(['demo', 'other']); // sorted: one spelling per set
});

test('a repository is claimed by at most one open floor: the second claim MOVES it', async () => {
  await openProject(ws, 'first'); // floor 2
  await openProject(ws, 'second'); // floor 3
  await claimRepository(ws, 2, 'demo');
  const moved = await claimRepository(ws, 3, 'demo');

  expect(moved.outcome).toBe('moved');
  expect(moved.from).toBe(2);
  expect(claimsOf((await resolveProject(ws, 2)).record)).toEqual([]);
  expect(claimsOf((await resolveProject(ws, 3)).record)).toEqual(['demo']);
});

test('a moved claim names the open tasks that stay where they were opened', async () => {
  await openProject(ws, 'first'); // floor 2
  await openProject(ws, 'second'); // floor 3
  await claimRepository(ws, 2, 'demo');
  await openTask(ws, 'in-flight', { floor: 2, repositories: ['demo'] });
  await openTask(ws, 'also-here', { floor: 2, repositories: ['demo'] });
  await closeTask(ws, 'f2t1', 'abandoned'); // a closed task is not still in flight

  const moved = await claimRepository(ws, 3, 'demo');
  expect(moved.staying.map((task) => task.address)).toEqual(['f2t2']);
  expect(moved.staying[0]).toMatchObject({ slug: 'also-here', floor: 2 });
});

test('re-claiming where it already is converges and says so', async () => {
  await openProject(ws, 'first'); // floor 2
  await claimRepository(ws, 2, 'demo');
  expect((await claimRepository(ws, 2, 'demo')).outcome).toBe('satisfied');
  expect(claimsOf((await resolveProject(ws, 2)).record)).toEqual(['demo']);
});

test('an unregistered name is refused before anything is written', async () => {
  await openProject(ws, 'first'); // floor 2
  expect(claimRepository(ws, 2, 'nonesuch')).rejects.toThrow(
    /no repository named 'nonesuch' is registered — see: ward repo list/,
  );
  expect(claimsOf((await resolveProject(ws, 2)).record)).toEqual([]);
  expect(() => requireRegistered(ws, 'demo')).not.toThrow();
});

test('release drops the claim; releasing what was never held converges', async () => {
  await openProject(ws, 'first'); // floor 2
  await claimRepository(ws, 2, 'demo');
  expect((await releaseRepository(ws, 2, 'demo')).outcome).toBe('released');
  expect(claimsOf((await resolveProject(ws, 2)).record)).toEqual([]);
  expect((await releaseRepository(ws, 2, 'demo')).outcome).toBe('absent');
});

// -- placement ------------------------------------------------------------

test('one claimant routes, and the note says why', async () => {
  await openProject(ws, 'first'); // floor 2
  await claimRepository(ws, 2, 'demo');
  expect(await placeByAffinity(ws, ['demo'])).toEqual({
    floor: 2,
    note: 'floor 2 by affinity: demo',
  });
});

test('no claimant leaves the task bare, with the hint that would fix it', async () => {
  expect(await placeByAffinity(ws, ['demo'])).toEqual({
    note: 'no floor claims demo — ward project claim FLOOR demo',
  });
  expect(await placeByAffinity(ws, [])).toEqual({}); // nothing named, nothing to say
});

test('two claimants refuse and name both floors — --project resolves it', async () => {
  await openProject(ws, 'first'); // floor 2
  await openProject(ws, 'second'); // floor 3
  await claimRepository(ws, 2, 'demo');
  await claimRepository(ws, 3, 'other');
  expect(placeByAffinity(ws, ['demo', 'other'])).rejects.toThrow(
    /claimed by different floors — floor 2 claims demo \(first\); floor 3 claims other \(second\)/,
  );
});

test("a closed floor's claims are inert — they route nothing", async () => {
  await openProject(ws, 'first'); // floor 2
  await claimRepository(ws, 2, 'demo');
  await closeProject(ws, 2);
  expect(await placeByAffinity(ws, ['demo'])).toEqual({
    note: 'no floor claims demo — ward project claim FLOOR demo',
  });
  expect(claimRepository(ws, 2, 'demo')).rejects.toThrow(/floor 2 is closed/);
});

test('a task records what it touches, and a single record answers for worktree create', async () => {
  await openProject(ws, 'first'); // floor 2
  await claimRepository(ws, 2, 'demo');
  const one = await openTask(ws, 'single', { floor: 2, repositories: ['demo'] });
  expect(one.record.repositories).toEqual(['demo']);
  expect(recordedRepository(one)).toBe('demo');

  const several = await openTask(ws, 'several', { floor: 2, repositories: ['demo', 'other'] });
  expect(recordedRepository(several)).toBeUndefined(); // the caller names it
  const none = await openTask(ws, 'none', { floor: 2 });
  expect(recordedRepository(none)).toBeUndefined();
});

// -- doctor ---------------------------------------------------------------

test('doctor names a claim on an unregistered repository, with both remedies', async () => {
  await openProject(ws, 'first'); // floor 2
  await claimRepository(ws, 2, 'demo');
  // The repository leaves the set; the claim survives, pointing at nothing.
  const project = (await readProjects(ws))[0];
  expect(project).toBeDefined();
  await removeRepositoryRecord(ws, 'demo');

  const report = await runDoctor(ws);
  const finding = report.workspace.find((item) => item.check === 'floor claims');
  expect(finding?.severity).toBe('warn');
  expect(finding?.message).toContain("floor 2 (first) claims 'demo', which is not registered");
  expect(finding?.message).toContain('ward project release 2 demo');
  expect(report.healthy).toBe(true); // a dangling claim routes nothing; it breaks nothing
});

// -- setup ----------------------------------------------------------------
// A fresh workspace per case with two registered repositories, `demo` and
// `other`, whose remotes are local bare repositories: a claim is about the
// registered set, so every case needs one it can point at.

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

/** Close a floor by writing its record — `project close` is not a verb yet. */
async function closeProject(root: string, floor: number): Promise<void> {
  const { writeDocument, readDocument } = await import('../../src/store/document.ts');
  const { projectRecordType } = await import('../../src/store/types.ts');
  const found = await resolveProject(root, floor);
  const existing = await readDocument(root, projectRecordType(found.dir));
  await writeDocument(root, projectRecordType(found.dir), {
    data: { ...found.record, state: 'closed', closedAt: new Date().toISOString() },
    body: existing.body,
  });
}

/** Unregister a repository by removing its record, leaving the claim dangling. */
async function removeRepositoryRecord(root: string, name: string): Promise<void> {
  const { rmSync } = await import('node:fs');
  rmSync(join(root, 'repositories', `${name}.md`));
}
