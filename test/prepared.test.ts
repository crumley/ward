// The prepared fixtures (design/0072-test-workspace-template/) stand in for
// creation in most of the suite, so what they promise is pinned here: a copy
// is what creation would have made at that path, and it is its own.
import { afterAll, beforeAll, expect, test } from 'bun:test';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { readDocument } from '../src/store/document.ts';
import { workspaceRecordType } from '../src/store/types.ts';
import { createWorkspace } from '../src/workspace/create.ts';
import { runDoctor } from '../src/workspace/doctor.ts';
import { git, gitOrThrow } from '../src/workspace/git.ts';
import { applyGitTestEnv, makeTempDir, removeDir } from './helpers.ts';
import { preparedRemote, preparedWorkspace } from './prepared.ts';

test('a prepared workspace holds exactly the files a real create makes, timestamps and id aside', async () => {
  const real = join(scratch, 'real', 'alpha');
  await createWorkspace(real);
  const copy = await preparedWorkspace(join(scratch, 'copy', 'alpha'));
  expect(tree(copy)).toEqual(tree(real));
  for (const file of tree(real).filter((path) => !path.endsWith('/'))) {
    expect(timeless(join(copy, file))).toBe(timeless(join(real, file)));
  }
  expect(gitOrThrow(copy, 'ls-files').stdout).toBe(gitOrThrow(real, 'ls-files').stdout);
});

test('its record is the one creation would write at that path: name, a fresh id, now', async () => {
  const before = Date.now();
  const ws = await preparedWorkspace(join(scratch, 'named-here'));
  const { data } = await readDocument(ws, workspaceRecordType);
  expect(data.name).toBe('named-here');
  expect(Date.parse(data.createdAt)).toBeGreaterThanOrEqual(before - 1000);
  const other = await preparedWorkspace(join(scratch, 'named-there'));
  expect((await readDocument(other, workspaceRecordType)).data.id).not.toBe(data.id);
});

test('one commit, a clean tree, a sound repository, and the doctor a real create gets', async () => {
  const ws = await preparedWorkspace(join(scratch, 'sound'));
  const real = join(scratch, 'sound-real');
  await createWorkspace(real);
  expect(gitOrThrow(ws, 'rev-list', '--count', 'HEAD').stdout.trim()).toBe('1');
  expect(gitOrThrow(ws, 'log', '-1', '--format=%s').stdout.trim()).toBe(
    'Initialize Ward workspace (ward 0.1.0)',
  );
  expect(gitOrThrow(ws, 'status', '--porcelain', '--ignored=no').stdout).toBe('');
  expect(git(ws, 'fsck', '--strict').exitCode).toBe(0);
  // The same checks at the same severities; machine-level ones (an agent
  // command missing from PATH on a runner) read the same for both.
  const verdicts = async (root: string) =>
    (await runDoctor(root)).workspace.map((finding) => `${finding.check}: ${finding.severity}`);
  expect(await verdicts(ws)).toEqual(await verdicts(real));
  expect((await verdicts(ws)).filter((line) => line.endsWith(': error'))).toEqual([]);
});

test('copies are independent: one test rewriting its copy reaches no other', async () => {
  const one = await preparedWorkspace(join(scratch, 'one'));
  const two = await preparedWorkspace(join(scratch, 'two'));
  const head = gitOrThrow(two, 'rev-parse', 'HEAD').stdout;
  writeFileSync(join(one, 'AGENTS.md'), 'mine\n');
  gitOrThrow(one, 'commit', '-qam', 'diverge');
  gitOrThrow(one, 'gc', '--quiet', '--prune=now');
  expect(gitOrThrow(two, 'rev-parse', 'HEAD').stdout).toBe(head);
  expect(gitOrThrow(two, 'status', '--porcelain').stdout).toBe('');
  expect(readFileSync(join(two, 'AGENTS.md'), 'utf8')).not.toBe('mine\n');
  // No git alternates, and no path into the template or a sibling anywhere in the copy.
  expect(tree(two).filter((path) => path.endsWith('alternates'))).toEqual([]);
  for (const file of tree(two, true).filter((path) => !path.endsWith('/'))) {
    expect(readFileSync(join(two, file)).includes(Buffer.from(scratch))).toBe(false);
  }
});

test('a prepared destination must be new or empty, as creation insists', async () => {
  const ws = await preparedWorkspace(join(scratch, 'taken'));
  expect(preparedWorkspace(ws)).rejects.toThrow('not empty');
});

test('a prepared remote is a bare repository with its seed on the branch it names', () => {
  const seed = { branch: 'trunk', files: { 'seed.txt': 'seed\n', 'src/lib.ts': 'export {};\n' } };
  const remote = preparedRemote(join(scratch, 'remote.git'), seed);
  expect(gitOrThrow(remote, 'rev-parse', '--is-bare-repository').stdout.trim()).toBe('true');
  expect(gitOrThrow(remote, 'symbolic-ref', 'HEAD').stdout.trim()).toBe('refs/heads/trunk');
  expect(gitOrThrow(remote, 'ls-tree', '-r', '--name-only', 'trunk').stdout).toBe(
    'seed.txt\nsrc/lib.ts\n',
  );
  const clone = join(scratch, 'clone');
  gitOrThrow(scratch, 'clone', '--quiet', remote, clone);
  expect(readFileSync(join(clone, 'src/lib.ts'), 'utf8')).toBe('export {};\n');
  // Pushing to one copy leaves its sibling where it was.
  const sibling = preparedRemote(join(scratch, 'sibling.git'), seed);
  writeFileSync(join(clone, 'more.txt'), 'more\n');
  gitOrThrow(clone, 'add', '-A');
  gitOrThrow(clone, 'commit', '-qm', 'more');
  gitOrThrow(clone, 'push', '-q', 'origin', 'trunk');
  expect(gitOrThrow(sibling, 'rev-list', '--count', 'trunk').stdout.trim()).toBe('1');
  expect(gitOrThrow(remote, 'rev-list', '--count', 'trunk').stdout.trim()).toBe('2');
});

// -- setup ---------------------------------------------------------------

let scratch: string;

/** A file's text with what differs between any two creates (when, and the id) blanked. */
function timeless(file: string): string {
  return readFileSync(file, 'utf8')
    .replace(/\d{4}-\d\d-\d\dT[\d:.]+Z/g, '<time>')
    .replace(/^id: .*$/m, 'id: <id>');
}

/** Every path under `root` (relative, sorted); git's own files only on request. */
function tree(root: string, withGit = false): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.name === '.git' && !withGit) continue;
      if (entry.isDirectory()) {
        out.push(`${relative(root, path)}/`);
        walk(path);
      } else out.push(relative(root, path));
    }
  };
  walk(root);
  return out.sort();
}

beforeAll(() => {
  applyGitTestEnv();
  scratch = makeTempDir();
});

afterAll(() => removeDir(scratch));
