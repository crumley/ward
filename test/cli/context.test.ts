// `ward context PATH` (design/0057-context-from-root/): the reading rule as one
// command — every AGENTS.md from the workspace root down to PATH, root first
// and nearest last. For a file in a floor task's worktree that is the root's,
// the floor's (through its view's link), and the repository's own. Through
// the spawned CLI; a read verb, so it writes nothing.
import { afterAll, beforeAll, expect, test } from 'bun:test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { contextShape } from '../../src/cli/schema.ts';
import { gitOrThrow } from '../../src/workspace/git.ts';
import { applyGitTestEnv, makeTempDir, removeDir, runWard } from '../helpers.ts';

const WORKTREE = 'floors/1-alpha/f1t1-feature';

test('for a file in a floor task worktree: the root, the floor, then the repository', () => {
  const result = runWard(['context', `${WORKTREE}/src/main.ts`], ws);
  expect(result.exitCode).toBe(0);
  expect(result.stdout).toBe(
    `Read these before working in ${WORKTREE}/src/main.ts (root first, nearest last)\n\n` +
      '  1. AGENTS.md  CLAUDE.md → AGENTS.md\n' +
      '  2. floors/1-alpha/AGENTS.md → ../../projects/1-alpha/AGENTS.md  CLAUDE.md → AGENTS.md\n' +
      `  3. ${WORKTREE}/AGENTS.md  no CLAUDE.md\n`,
  );
});

test('--json parses as contextShape, and PATH defaults to where the caller stands', () => {
  const result = runWard(['context', '--json'], join(ws, WORKTREE, 'src'));
  expect(result.exitCode).toBe(0);
  expect(contextShape.parse(JSON.parse(result.stdout))).toEqual({
    root: ws,
    path: `${WORKTREE}/src`,
    chain: [
      { dir: '.', agents: 'AGENTS.md', resolves: true, claude: 'linked' },
      {
        dir: 'floors/1-alpha',
        agents: 'floors/1-alpha/AGENTS.md',
        link: '../../projects/1-alpha/AGENTS.md',
        resolves: true,
        claude: 'linked',
      },
      { dir: WORKTREE, agents: `${WORKTREE}/AGENTS.md`, resolves: true, claude: 'absent' },
    ],
  });
});

test('the root alone has the root alone', () => {
  const result = runWard(['context', '.', '--json'], ws);
  expect(contextShape.parse(JSON.parse(result.stdout)).chain.map((level) => level.agents)).toEqual([
    'AGENTS.md',
  ]);
});

test('a path outside the workspace is refused, with nothing on stdout', () => {
  const result = runWard(['context', scratch], ws);
  expect(result.exitCode).toBe(1);
  expect(result.stdout).toBe('');
  expect(result.stderr).toContain('is outside the workspace');
});

// -- scaffolding ----------------------------------------------------------------
// One workspace, one floor, one task with a worktree of a repository that
// carries its own AGENTS.md and no CLAUDE.md, as Ward's own does.

let scratch: string;
let ws: string;

beforeAll(() => {
  applyGitTestEnv();
  scratch = makeTempDir();
  ws = join(scratch, 'ws');
  const remote = join(scratch, 'demo.git');
  gitOrThrow('.', 'init', '-q', '--bare', '--initial-branch=trunk', remote);
  const seed = join(scratch, 'seed');
  gitOrThrow('.', 'clone', '-q', remote, seed);
  gitOrThrow(seed, 'checkout', '-q', '-b', 'trunk');
  writeFileSync(join(seed, 'AGENTS.md'), '# demo\n');
  mkdirSync(join(seed, 'src'));
  writeFileSync(join(seed, 'src', 'main.ts'), '\n');
  gitOrThrow(seed, 'add', '-A');
  gitOrThrow(seed, 'commit', '-qm', 'seed');
  gitOrThrow(seed, 'push', '-q', '-u', 'origin', 'trunk');
  for (const argv of [
    ['workspace', 'create', ws],
    ['repo', 'add', remote, '--name', 'demo'],
    ['project', 'open', 'alpha'],
    ['task', 'open', 'feature', '--project', '1', '--repo', 'demo'],
    ['worktree', 'create', 'f1t1'],
  ]) {
    const result = runWard(argv, argv[1] === 'create' && argv[0] === 'workspace' ? scratch : ws);
    if (result.exitCode !== 0) throw new Error(`${argv.join(' ')}: ${result.stderr}`);
  }
});

afterAll(() => removeDir(scratch));
