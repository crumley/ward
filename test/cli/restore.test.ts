// `ward workspace restore` through the spawned CLI
// (design/0021-restore-from-clone/): the fresh-clone flow end to end — clone,
// restore, doctor clean — the --json document validating under its registered
// shape, the lost-branch exit posture (document emitted, verdict in $?), the
// all-satisfied re-run, and the stewardship-copy guard refusing the verb
// inside a candidate copy. Fixtures synthetic throughout: bare remotes,
// local-path clones, no network, no forge.
import { afterAll, beforeAll, expect, test } from 'bun:test';
import { existsSync, mkdirSync, realpathSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { mutationVerbShapes, workspaceRestoreShape } from '../../src/cli/schema.ts';
import { createWorkspace } from '../../src/workspace/create.ts';
import { gitOrThrow } from '../../src/workspace/git.ts';
import { addRepository } from '../../src/workspace/repos.ts';
import { openTask } from '../../src/workspace/tasks.ts';
import { createWorkspaceWorktree, createWorktree } from '../../src/workspace/worktrees.ts';
import { applyGitTestEnv, makeTempDir, removeDir, runWard } from '../helpers.ts';

test('the fresh-clone flow: restore re-materializes, doctor reads clean', () => {
  const clone = join(scratch, 'clone-flow');
  gitOrThrow('.', 'clone', ws, clone);

  const before = runWard(['doctor'], clone);
  expect(before.stdout).toContain('ward workspace restore'); // the named remedy

  const result = runWard(['workspace', 'restore'], clone);
  expect(result.exitCode).toBe(0);
  // The spawned CLI stands at the clone's real path (macOS /var → /private/var).
  expect(result.stdout).toContain(`Restoring workspace at ${realpathSync(clone)}`);
  expect(result.stdout).toContain('restored  demo (cloned from');
  expect(result.stdout).toContain('worktrees/t1-feature-work');
  expect(result.stdout).toContain('worktrees/t2-steward-steward-work');
  expect(result.stdout).toContain('no open session records');
  expect(result.stdout).toContain('Workspace restored — 3 restored, 0 already satisfied.');
  expect(existsSync(join(clone, 'repos/demo/seed.txt'))).toBe(true);

  const after = runWard(['doctor'], clone);
  expect(after.exitCode).toBe(0);
  expect(after.stdout).toContain('healthy');
  expect(after.stdout).not.toContain('missing');

  // Idempotence through the CLI: the re-run is all satisfied.
  const again = runWard(['workspace', 'restore'], clone);
  expect(again.exitCode).toBe(0);
  expect(again.stdout).toContain('Workspace restored — 0 restored, 3 already satisfied.');
});

test('restore --json: one document alone on stdout, valid under the registered shape', () => {
  const clone = join(scratch, 'clone-json');
  gitOrThrow('.', 'clone', ws, clone);

  const result = runWard(['workspace', 'restore', '--json'], clone);
  expect(result.exitCode).toBe(0);
  expect(mutationVerbShapes['workspace restore']).toBe(workspaceRestoreShape);
  const report = workspaceRestoreShape.parse(JSON.parse(result.stdout));
  expect(report.root).toBe(realpathSync(clone)); // the cwd's real path (macOS /var)
  expect(report.repositories).toMatchObject([{ name: 'demo', outcome: 'restored' }]);
  expect(report.worktrees).toMatchObject([
    { task: 't1', repo: 'demo', branch: 'feature-work', outcome: 'restored' },
    { task: 't2', source: 'workspace', branch: 'steward/steward-work', outcome: 'restored' },
  ]);
  expect(report.worktrees[0]?.source).toBeUndefined(); // absent, never null (0019's XOR)
  expect(report.worktrees[1]?.repo).toBeUndefined();
  expect(report.sessions).toEqual({ open: 0, detail: 'no open session records' });
});

test('a lost branch: the document names it, the record survives, the exit is 1', () => {
  const clone = join(scratch, 'clone-lost');
  gitOrThrow('.', 'clone', lostWs, clone);

  const result = runWard(['workspace', 'restore', '--json'], clone);
  expect(result.exitCode).toBe(1); // the verb completed and reported; the verdict is $?
  const report = workspaceRestoreShape.parse(JSON.parse(result.stdout));
  expect(report.worktrees).toMatchObject([{ task: 't1', branch: 'unpushed', outcome: 'lost' }]);
  expect(report.worktrees[0]?.detail).toContain('reachable nowhere');
  expect(existsSync(join(clone, 'tasks/t1-doomed-work/worktrees/demo--unpushed.md'))).toBe(true);

  const human = runWard(['workspace', 'restore'], clone);
  expect(human.exitCode).toBe(1);
  expect(human.stdout).toContain('lost');
  expect(human.stdout).toContain('Restore incomplete');
  expect(human.stdout).toContain('--outcome abandoned');
});

test('restore refuses inside a stewardship copy, naming the enclosing workspace', () => {
  const copy = join(ws, 'worktrees/t2-steward-steward-work');
  const result = runWard(['workspace', 'restore'], copy);
  expect(result.exitCode).toBe(1);
  expect(result.stdout).toBe('');
  expect(result.stderr).toContain('stewardship copy');
});

// -- setup ------------------------------------------------------------------
// Two originals, built once: `ws` with a registered repository (bare remote,
// branch trunk), a t1 worktree on a pushed branch, and a t2 workspace-source
// worktree with one commit; `lostWs` whose only worktree branch was never
// pushed. Clones are per-test.

let scratch: string;
let ws: string;
let lostWs: string;

function makeRemote(name: string): string {
  const remote = join(scratch, `${name}.git`);
  mkdirSync(remote, { recursive: true });
  gitOrThrow('.', 'init', '--bare', '--initial-branch=trunk', remote);
  const seed = join(scratch, `seed-${name}`);
  gitOrThrow('.', 'clone', remote, seed);
  writeFileSync(join(seed, 'seed.txt'), 'seed\n');
  gitOrThrow(seed, 'checkout', '-b', 'trunk');
  gitOrThrow(seed, 'add', '-A');
  gitOrThrow(seed, 'commit', '-m', 'seed');
  gitOrThrow(seed, 'push', '-u', 'origin', 'trunk');
  return remote;
}

beforeAll(async () => {
  applyGitTestEnv();
  scratch = makeTempDir();

  ws = join(scratch, 'original');
  await createWorkspace(ws);
  await addRepository(ws, makeRemote('remote-main'), 'demo');
  await openTask(ws, 'feature-work', {});
  await createWorktree(ws, 't1', 'demo');
  const worktree = join(ws, 'worktrees/t1-feature-work');
  writeFileSync(join(worktree, 'work.txt'), 'the work\n');
  gitOrThrow(worktree, 'add', '-A');
  gitOrThrow(worktree, 'commit', '-m', 'the work');
  gitOrThrow(worktree, 'push', '-u', 'origin', 'feature-work');
  await openTask(ws, 'steward-work', {});
  const { record } = await createWorkspaceWorktree(ws, 't2');
  const copy = join(ws, record.path);
  writeFileSync(join(copy, 'stewardship-note.md'), 'a deliberate change\n');
  gitOrThrow(copy, 'add', '-A', '--', 'stewardship-note.md');
  gitOrThrow(copy, 'commit', '-m', 'Stewardship note');

  lostWs = join(scratch, 'original-lost');
  await createWorkspace(lostWs);
  await addRepository(lostWs, makeRemote('remote-lost'), 'demo');
  await openTask(lostWs, 'doomed-work', {});
  await createWorktree(lostWs, 't1', 'demo', 'unpushed');
  const doomed = join(lostWs, 'worktrees/t1-unpushed');
  writeFileSync(join(doomed, 'doomed.txt'), 'never pushed\n');
  gitOrThrow(doomed, 'add', '-A');
  gitOrThrow(doomed, 'commit', '-m', 'doomed');
});

afterAll(() => {
  removeDir(scratch);
});
