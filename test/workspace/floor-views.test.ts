// Floor views (design/0057-context-from-root/): every open floor has
// `floors/<N>-<slug>/`, three relative links onto its record directory and
// nothing else Ward writes — `AGENTS.md` and `notes.md` onto the floor's own
// files, `CLAUDE.md` onto the view's `AGENTS.md`. The tree is ignored, so a
// view journals nothing. `project open`, converge, and restore each establish
// what is missing and never replace what is there; doctor names a missing or
// dangling view, and `ward workspace upgrade` puts it right.
import { afterAll, beforeAll, beforeEach, expect, test } from 'bun:test';
import {
  existsSync,
  lstatSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { readDocument, writeDocument } from '../../src/store/document.ts';
import { projectRecordType } from '../../src/store/types.ts';
import { convergeWorkspace } from '../../src/workspace/converge.ts';
import { createWorkspace } from '../../src/workspace/create.ts';
import { runDoctor } from '../../src/workspace/doctor.ts';
import { git, gitOrThrow } from '../../src/workspace/git.ts';
import { openProject, readProjects } from '../../src/workspace/projects.ts';
import { applyGitTestEnv, makeTempDir, removeDir, runWardEnv } from '../helpers.ts';

// -- project open --------------------------------------------------------------

test('project open writes the three links, each resolving to the record, journaling nothing', async () => {
  await openProject(ws, 'alpha');
  const view = join(ws, 'floors/1-alpha');
  expect(links(view)).toEqual({
    'AGENTS.md': '../../projects/1-alpha/AGENTS.md',
    'CLAUDE.md': 'AGENTS.md',
    'notes.md': '../../projects/1-alpha/notes.md',
  });
  for (const [name, record] of [
    ['AGENTS.md', 'AGENTS.md'],
    ['CLAUDE.md', 'AGENTS.md'],
    ['notes.md', 'notes.md'],
  ] as const) {
    expect(realpathSync(join(view, name))).toBe(realpathSync(join(ws, 'projects/1-alpha', record)));
  }
  expect(git(ws, 'status', '--porcelain').stdout).toBe('');
});

// -- converge --------------------------------------------------------------------

test('converge on six floors, one closed, establishes five views and is idempotent', async () => {
  for (const slug of ['alpha', 'beta', 'gamma', 'delta', 'epsilon']) await openProject(ws, slug);
  await closeFloor(3);
  rmSync(join(ws, 'floors'), { recursive: true }); // the fresh-clone shape: no views at all

  const first = await convergeWorkspace(ws);
  expect(step(first.steps)).toMatchObject({ outcome: 'established' });
  expect(step(first.steps)?.detail).toBe('5 open floors under floors/; 15 links written');
  expect(listing(join(ws, 'floors'))).toEqual([
    '0-workspace',
    '1-alpha',
    '2-beta',
    '4-delta',
    '5-epsilon',
  ]);
  expect(existsSync(join(ws, 'floors/3-gamma'))).toBe(false); // a closed floor has no view

  const second = await convergeWorkspace(ws);
  expect(step(second.steps)).toMatchObject({ outcome: 'satisfied' });
  expect(git(ws, 'status', '--porcelain').stdout).toBe('');
});

test('a file a human put in a view is never replaced, and the rest is filled in', async () => {
  await openProject(ws, 'alpha');
  const view = join(ws, 'floors/1-alpha');
  rmSync(join(view, 'AGENTS.md'));
  rmSync(join(view, 'notes.md'));
  writeFileSync(join(view, 'AGENTS.md'), 'my own floor guidance\n');

  const report = await convergeWorkspace(ws);
  expect(step(report.steps)?.detail).toContain('1 link written');
  expect(readFileSync(join(view, 'AGENTS.md'), 'utf8')).toBe('my own floor guidance\n');
  expect(lstatSync(join(view, 'AGENTS.md')).isSymbolicLink()).toBe(false);
  expect(readlinkSync(join(view, 'notes.md'))).toBe('../../projects/1-alpha/notes.md');
});

// -- doctor and the upgrade --------------------------------------------------------

test('doctor names a missing and a dangling view; ward workspace upgrade clears both', async () => {
  await openProject(ws, 'alpha');
  await openProject(ws, 'beta');
  expect(viewFindings(await runDoctor(ws))).toEqual([
    { severity: 'ok', message: '3 open floors viewed under floors/' },
  ]);

  rmSync(join(ws, 'floors/1-alpha'), { recursive: true }); // the view missing outright
  rmSync(join(ws, 'floors/2-beta/notes.md')); // one link gone…
  rmSync(join(ws, 'projects/2-beta/AGENTS.md')); // …and two dangling: the manifest they name is gone
  gitOrThrow(ws, 'commit', '-qam', 'the floor manifest removed by hand');

  const findings = viewFindings(await runDoctor(ws));
  expect(findings).toEqual([
    {
      severity: 'info',
      message:
        'floor 1 (floors/1-alpha/): no view at floors/1-alpha/ — establish it: ward workspace upgrade',
    },
    {
      severity: 'info',
      message:
        'floor 2 (floors/2-beta/): AGENTS.md does not resolve (projects/2-beta/AGENTS.md is ' +
        'missing), CLAUDE.md does not resolve (projects/2-beta/AGENTS.md is missing), no ' +
        'notes.md link — establish it: ward workspace upgrade',
    },
  ]);

  const upgrade = runWardEnv(['workspace', 'upgrade', '--json'], ws, { NO_COLOR: '1' });
  expect(upgrade.exitCode).toBe(0);
  expect(viewFindings(await runDoctor(ws))).toEqual([
    { severity: 'ok', message: '3 open floors viewed under floors/' },
  ]);
});

// -- scaffolding --------------------------------------------------------------------

let scratch: string;
let ws: string;
let caseId = 0;

function links(dir: string): Record<string, string> {
  return Object.fromEntries(
    listing(dir).map((name) => [name, readlinkSync(join(dir, name))] as const),
  );
}

function listing(dir: string): string[] {
  return [...new Bun.Glob('*').scanSync({ cwd: dir, onlyFiles: false })].sort();
}

function step(steps: readonly { step: string; outcome: string; detail: string }[]) {
  return steps.find((candidate) => candidate.step === 'floor views');
}

function viewFindings(report: Awaited<ReturnType<typeof runDoctor>>) {
  return report.workspace
    .filter((finding) => finding.check === 'floor views')
    .map(({ severity, message }) => ({ severity, message }));
}

/** Close a floor the only way a test can: no verb closes a project yet. */
async function closeFloor(floor: number): Promise<void> {
  const project = (await readProjects(ws)).find((p) => p.record.floor === floor);
  if (project === undefined) throw new Error(`no floor ${floor}`);
  const type = projectRecordType(project.dir);
  const document = await readDocument(ws, type);
  await writeDocument(ws, type, {
    data: { ...document.data, state: 'closed' },
    body: document.body,
  });
  gitOrThrow(ws, 'add', '-A');
  gitOrThrow(ws, 'commit', '-m', `close floor ${floor}`);
}

beforeAll(() => {
  applyGitTestEnv();
  scratch = makeTempDir();
});

beforeEach(async () => {
  caseId += 1;
  ws = join(scratch, `ws-${caseId}`);
  await createWorkspace(ws);
});

afterAll(() => removeDir(scratch));
