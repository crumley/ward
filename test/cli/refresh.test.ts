// `ward repo refresh` at the CLI (design/0023-refresh-concurrency-ux/): the
// set refreshes concurrently, and what the caller sees depends only on who
// they are. A human at a terminal gets an in-place block; everyone else gets
// the same rows streamed in the registered order with no control sequences in
// them; `--json` is untouched — exactly one document, now carrying the
// `conflicted` outcome, with `dirty` and `conflicted` on the exit-0 side of
// the posture and only `failed` on the exit-1 side. Local bare remotes, no
// network.
import { afterAll, beforeAll, beforeEach, expect, test } from 'bun:test';
import { mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import picocolors from 'picocolors';
import { refreshDisplay } from '../../src/cli/progress.ts';
import { repoRefreshShape } from '../../src/cli/schema.ts';
import { createWorkspace } from '../../src/workspace/create.ts';
import { git, gitOrThrow } from '../../src/workspace/git.ts';
import {
  addRepository,
  checkoutPath,
  type RefreshRow,
  refreshRepositories,
} from '../../src/workspace/repos.ts';
import { applyGitTestEnv, makeTempDir, removeDir, runWard } from '../helpers.ts';

// -- the streamed report (not a terminal) ---------------------------------

test('the rows stream in the registered order, plain, and the same way every run', () => {
  advance('alpha', 'moved.txt');
  const first = runWard(['repo', 'refresh'], ws);
  expect(first.exitCode).toBe(0);
  expect(verbsAndNames(first.stdout)).toEqual([
    ['refreshed', 'alpha'],
    ['current', 'beta'],
    ['current', 'gamma'],
  ]);
  expect(first.stdout).not.toContain(ESC); // no cursor moves in a pipe or a log

  const second = runWard(['repo', 'refresh'], ws);
  expect(verbsAndNames(second.stdout)).toEqual([
    ['current', 'alpha'],
    ['current', 'beta'],
    ['current', 'gamma'],
  ]);
});

test('a conflicted repository is reported and skipped; the rest of the set still refreshes', async () => {
  await conflict('alpha');
  advance('beta', 'moved.txt');
  const result = runWard(['repo', 'refresh'], ws);
  expect(verbsAndNames(result.stdout)).toEqual([
    ['conflicted', 'alpha'],
    ['refreshed', 'beta'],
    ['current', 'gamma'],
  ]);
  // Informational, exactly like dirty: the fail-safe worked, so the verb did
  // not fail. Only `failed` carries the exit-1 verdict.
  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain('unresolved conflicts in repos/alpha');
});

test('dirty and conflicted exit 0; a failed row exits 1 with every row still rendered', async () => {
  await conflict('alpha');
  writeFileSync(join(checkoutPath(ws, 'beta'), 'seed.txt'), 'unrecorded work\n');
  expect(verbsOf(runWard(['repo', 'refresh'], ws))).toEqual({
    exit: 0,
    verbs: ['conflicted', 'dirty', 'current'],
  });

  const gamma = remotes.gamma ?? '';
  renameSync(gamma, `${gamma}.offline`); // fetch cannot answer
  expect(verbsOf(runWard(['repo', 'refresh'], ws))).toEqual({
    exit: 1,
    verbs: ['conflicted', 'dirty', 'failed'],
  });
});

// -- --json, unchanged in shape and posture --------------------------------

test('--json: one document alone on stdout, carrying conflicted, and no display bleeds into it', async () => {
  await conflict('alpha');
  const result = runWard(['repo', 'refresh', '--json'], ws);
  expect(result.exitCode).toBe(0);
  const rows = repoRefreshShape.parse(JSON.parse(result.stdout));
  expect(rows.map((row) => [row.name, row.outcome])).toEqual([
    ['alpha', 'conflicted'],
    ['beta', 'current'],
    ['gamma', 'current'],
  ]);
  expect(result.stdout.trimEnd().endsWith(']')).toBe(true); // one document, nothing after it
  expect(result.stdout).not.toContain(ESC);
});

test('ward schema stays truthful about the new outcome', () => {
  const schema = JSON.parse(runWard(['schema', 'repo', 'refresh'], ws).stdout);
  expect(schema.items.properties.outcome.enum).toEqual([
    'refreshed',
    'current',
    'dirty',
    'conflicted',
    'failed',
  ]);
});

// -- --stash, the explicit exception ---------------------------------------

test('--stash refreshes a dirty checkout end to end; without it the checkout is untouched', () => {
  const checkout = checkoutPath(ws, 'alpha');
  writeFileSync(join(checkout, 'notes.txt'), 'unrecorded work\n');
  advance('alpha', 'moved.txt');

  const refused = runWard(['repo', 'refresh', 'alpha'], ws);
  expect(verbsAndNames(refused.stdout)).toEqual([['dirty', 'alpha']]);

  const stashed = runWard(['repo', 'refresh', 'alpha', '--stash'], ws);
  expect(verbsAndNames(stashed.stdout)).toEqual([['refreshed', 'alpha']]);
  expect(stashed.stdout).toContain('stashed and restored');
  expect(git(checkout, 'stash', 'list').stdout.trim()).toBe('');
  expect(runWard(['status'], ws).exitCode).toBe(0);
});

// -- the display seam ------------------------------------------------------

const displayCases = [
  { caller: 'human', tty: true, live: true },
  { caller: 'human', tty: false, live: false },
  { caller: 'agent', tty: true, live: false },
  { caller: 'agent', tty: false, live: false },
] as const;

for (const row of displayCases) {
  test(`a ${row.caller} at a ${row.tty ? 'terminal' : 'pipe'} gets the ${row.live ? 'live' : 'plain'} display`, () => {
    const stream = fakeStream(row.tty);
    const display = refreshDisplay(plain, stream, row.caller === 'agent');
    display.observe([pending('alpha')]);
    display.observe([settled('alpha', 'current')]);
    display.settle();
    const written = stream.written.join('');
    expect(written.includes(ESC)).toBe(row.live);
    expect(written).toContain('current  alpha');
  });
}

test('the plain display holds a row until every row before it has settled', () => {
  const stream = fakeStream(false);
  const display = refreshDisplay(plain, stream, false);
  display.observe([pending('alpha'), pending('beta')]);
  display.observe([pending('alpha'), settled('beta', 'current')]);
  expect(stream.written.join('')).toBe(''); // beta finished first; alpha goes first anyway
  display.observe([settled('alpha', 'refreshed'), settled('beta', 'current')]);
  expect(namesIn(stream.written.join(''))).toEqual(['alpha', 'beta']);
});

test('the live display repaints in place and settles into the plain report, cursor restored', () => {
  const stream = fakeStream(true);
  const display = refreshDisplay(plain, stream, false);
  display.observe([pending('alpha'), pending('beta')]);
  display.observe([settled('alpha', 'refreshed'), pending('beta')]);
  display.observe([settled('alpha', 'refreshed'), settled('beta', 'current')]);
  display.settle();
  const written = stream.written.join('');
  expect(written).toContain(`${ESC}[2A`); // moved back over its own two lines
  expect(written).toContain(`${ESC}[?25l`);
  expect(written).toContain(`${ESC}[?25h`); // and always gives the cursor back
  // What is left standing is exactly the plain report — the block settles
  // into it rather than being followed by a second copy.
  expect(lastFrame(written)).toEqual(['   refreshed  alpha (moved)', '     current  beta (moved)']);
});

test('a block taller than the terminal degrades to the plain stream, never a mispainted screen', () => {
  const stream = fakeStream(true, 4);
  const display = refreshDisplay(plain, stream, false);
  const names = ['a', 'b', 'c', 'd', 'e'];
  display.observe(names.map(pending));
  display.observe(names.map((name) => settled(name, 'current')));
  display.settle();
  const written = stream.written.join('');
  expect(written).not.toContain(ESC);
  expect(namesIn(written)).toEqual(names);
});

// -- setup ----------------------------------------------------------------
// A fresh workspace per test with three registered repositories — alpha,
// beta, gamma — each a local bare remote seeded with one commit on `main`.

const ESC = String.fromCharCode(27);
const plain = picocolors.createColors(false);

let scratch: string;
let ws: string;
let remotes: Record<string, string>;
let caseId = 0;
let stageId = 0;

/** The verb and the repository name of each rendered row, in order. */
function verbsAndNames(stdout: string): string[][] {
  return stdout
    .trimEnd()
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => line.trim().split(/\s+/).slice(0, 2));
}

function verbsOf(result: { exitCode: number; stdout: string }): {
  exit: number;
  verbs: string[];
} {
  return {
    exit: result.exitCode,
    verbs: verbsAndNames(result.stdout).map((row) => row[0] ?? ''),
  };
}

function namesIn(written: string): string[] {
  return verbsAndNames(written).map((row) => row[1] ?? '');
}

/** The lines the live display leaves standing: its last repaint, stripped of ANSI. */
function lastFrame(written: string): string[] {
  const frames = written.split(new RegExp(`${ESC}\\[\\d+A`));
  return (frames.at(-1) ?? '')
    .split('\n')
    .map((line) => line.replaceAll(new RegExp(`${ESC}\\[[0-9?]*[A-Za-z]`, 'g'), ''))
    .filter((line) => line.trim() !== '');
}

function pending(name: string): RefreshRow {
  return { name, state: 'pending' };
}

function settled(name: string, state: 'current' | 'refreshed'): RefreshRow {
  return { name, state, detail: 'moved' };
}

interface FakeStream {
  write(chunk: string): boolean;
  readonly isTTY: boolean;
  readonly rows: number;
  readonly written: string[];
}

function fakeStream(isTTY: boolean, rows = 40): FakeStream {
  const written: string[] = [];
  return {
    write(chunk) {
      written.push(chunk);
      return true;
    },
    isTTY,
    rows,
    written,
  };
}

/** Push one new commit onto a repository's remote main line. */
function advance(name: string, file: string, content = 'moved\n'): void {
  stageId += 1;
  const stage = join(scratch, `stage-${caseId}-${stageId}`);
  gitOrThrow('.', 'clone', remotes[name] ?? '', stage);
  writeFileSync(join(stage, file), content);
  gitOrThrow(stage, 'add', '-A');
  gitOrThrow(stage, 'commit', '-m', `advance ${name}`);
  gitOrThrow(stage, 'push', 'origin', 'main');
}

/** Drive a repository into the conflicted state through a real failed stash pop. */
async function conflict(name: string): Promise<void> {
  writeFileSync(join(checkoutPath(ws, name), 'seed.txt'), 'my local edit\n');
  advance(name, 'seed.txt', 'the remote edit\n');
  const [report] = await refreshRepositories(ws, name, { stash: true });
  expect(report?.outcome).toBe('conflicted'); // the premise of the cases that call this
}

beforeAll(() => {
  applyGitTestEnv();
  scratch = makeTempDir();
});

beforeEach(async () => {
  caseId += 1;
  ws = join(scratch, `ws-${caseId}`);
  await createWorkspace(ws);
  remotes = {};
  for (const name of ['alpha', 'beta', 'gamma']) {
    const remote = join(scratch, `remote-${caseId}`, `${name}.git`);
    mkdirSync(remote, { recursive: true });
    gitOrThrow('.', 'init', '--bare', '--initial-branch=main', remote);
    const seed = join(scratch, `seed-${caseId}-${name}`);
    gitOrThrow('.', 'clone', remote, seed);
    writeFileSync(join(seed, 'seed.txt'), '');
    gitOrThrow(seed, 'checkout', '-b', 'main');
    gitOrThrow(seed, 'add', '-A');
    gitOrThrow(seed, 'commit', '-m', 'seed');
    gitOrThrow(seed, 'push', '-u', 'origin', 'main');
    remotes[name] = remote;
    await addRepository(ws, remote, name);
  }
});

afterAll(() => {
  removeDir(scratch);
});
