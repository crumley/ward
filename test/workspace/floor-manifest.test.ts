// Floor manifests (design/0055-floor-manifests/): every floor that is not
// closed carries AGENTS.md (Ward's part, byte-identical on every floor and
// lineage-tracked), a CLAUDE.md link onto it, and notes.md (the floor's part,
// seeded once, appended only through `ward project note`). Written at project
// open, backfilled by converge, brought forward by upgrade, and named by
// doctor. A session reaches it by reading downward from the root (design 0057):
// a floor session is launched with no variable naming it.
import { afterAll, beforeAll, beforeEach, expect, test } from 'bun:test';
import { existsSync, lstatSync, readFileSync, readlinkSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { projectNoteShape } from '../../src/cli/schema.ts';
import { readDocument, writeDocument } from '../../src/store/document.ts';
import { projectRecordType } from '../../src/store/types.ts';
import { convergeWorkspace } from '../../src/workspace/converge.ts';
import { createWorkspace } from '../../src/workspace/create.ts';
import { runDoctor } from '../../src/workspace/doctor.ts';
import {
  FLOOR_AGENTS_MD_HISTORY,
  floorManifestLineages,
  floorManifestPaths,
  seedNotes,
} from '../../src/workspace/floor-manifest.ts';
import { git, gitOrThrow } from '../../src/workspace/git.ts';
import { classifyArtifact, sha256OfText } from '../../src/workspace/lineage.ts';
import {
  appendFloorNote,
  GROUND_FLOOR,
  openProject,
  readProjects,
} from '../../src/workspace/projects.ts';
import { openTask } from '../../src/workspace/tasks.ts';
import { AGENTS_MD, FLOOR_AGENTS_MD } from '../../src/workspace/templates.ts';
import { upgradeWorkspace } from '../../src/workspace/upgrade.ts';
import { createWorkspaceWorktree } from '../../src/workspace/worktrees.ts';
import { applyGitTestEnv, makeTempDir, removeDir, runWard, writeFakeClaude } from '../helpers.ts';

const TODAY = new Date().toISOString().slice(0, 10);

// -- the template and its lineage -------------------------------------------

test('the floor default is pinned; changing it must move its old hash into the history', () => {
  expect(sha256OfText(FLOOR_AGENTS_MD)).toBe(
    'b86cab9ade1cfa0528d144fe03f5a02a79ba1fdb2fd10b5c4d0f6bfb792b4e59', // since design 0056
  );
  const hashes = [...FLOOR_AGENTS_MD_HISTORY.map((v) => v.sha256), sha256OfText(FLOOR_AGENTS_MD)];
  expect(new Set(hashes).size).toBe(hashes.length);
});

test('the floor default says nothing floor-specific and loads the notes last', () => {
  expect(FLOOR_AGENTS_MD).not.toMatch(/projects\/[1-9]/); // only the ground floor is named
  expect(FLOOR_AGENTS_MD.endsWith('\n\n@notes.md\n')).toBe(true);
  expect(FLOOR_AGENTS_MD).toContain('ward project note FLOOR TEXT');
  expect(AGENTS_MD).not.toContain('WARD_FLOOR_MANIFEST');
  expect(AGENTS_MD).toContain('projects/<N>-<slug>/AGENTS.md');
  expect(AGENTS_MD).toContain('ward project note FLOOR TEXT');
});

test('the lineage expands to one exact path per floor that is not closed', async () => {
  const ws = await workspaceWith(['alpha', 'beta', 'gamma']);
  await closeFloor(ws, 2);
  const lineages = floorManifestLineages(await readProjects(ws));
  expect(lineages.map((lineage) => lineage.path)).toEqual([
    'projects/0-workspace/AGENTS.md',
    'projects/1-alpha/AGENTS.md',
    'projects/3-gamma/AGENTS.md',
  ]);
  for (const lineage of lineages) {
    expect((await classifyArtifact(ws, lineage)).standing).toBe('current');
  }
  // A superseded default is stale (untouched, merely old); anything else is customized.
  const [ground] = lineages;
  if (ground === undefined) throw new Error('no ground floor lineage');
  const old = '# an older floor default\n';
  await Bun.write(join(ws, ground.path), old);
  const withOld = { ...ground, history: [{ sha256: sha256OfText(old), era: 'older' }] };
  expect(await classifyArtifact(ws, withOld)).toEqual({ standing: 'stale', era: 'older' });
  expect((await classifyArtifact(ws, ground)).standing).toBe('customized');
});

// -- project open -----------------------------------------------------------

test('project open writes the record and the three manifest files in one commit', async () => {
  const ws = await workspaceWith([]);
  const before = commitCount(ws);
  await openProject(ws, 'alpha');
  expect(commitCount(ws)).toBe(before + 1);
  expect(committedNames(ws)).toEqual([
    'projects/1-alpha/AGENTS.md',
    'projects/1-alpha/CLAUDE.md',
    'projects/1-alpha/notes.md',
    'projects/1-alpha/project.md',
  ]);
  const paths = floorManifestPaths('projects/1-alpha');
  expect(readFileSync(join(ws, paths.agents), 'utf8')).toBe(FLOOR_AGENTS_MD);
  expect(lstatSync(join(ws, paths.claude)).isSymbolicLink()).toBe(true);
  expect(readlinkSync(join(ws, paths.claude))).toBe('AGENTS.md');
  expect(readFileSync(join(ws, paths.notes), 'utf8')).toBe(seedNotes('alpha', TODAY));
});

test('every floor carries the same AGENTS.md bytes; the notes name their own floor', async () => {
  const ws = await workspaceWith(['alpha', 'beta']);
  const read = (dir: string, file: string) => readFileSync(join(ws, dir, file), 'utf8');
  expect(read('projects/1-alpha', 'AGENTS.md')).toBe(read('projects/2-beta', 'AGENTS.md'));
  expect(read('projects/0-workspace', 'AGENTS.md')).toBe(FLOOR_AGENTS_MD);
  expect(read('projects/1-alpha', 'notes.md')).toStartWith('# Notes — alpha\n');
  expect(read('projects/2-beta', 'notes.md')).toStartWith('# Notes — beta\n');
});

// -- converge: the backfill -------------------------------------------------

test('converge backfills every open floor, skips a closed one, and is idempotent', async () => {
  // A workspace shaped like one from before this entry: five ordinary floors
  // and the ground floor, no manifests, floor 3 closed.
  const ws = await workspaceWith(['one', 'two', 'three', 'four', 'five']);
  await closeFloor(ws, 3);
  stripManifests(ws);

  const report = await convergeWorkspace(ws);
  const step = report.steps.find((s) => s.step === 'floor manifests');
  expect(step).toEqual({
    step: 'floor manifests',
    outcome: 'established',
    detail: '5 open floors; written on floors 0, 1, 2, 4, 5',
  });
  for (const dir of ['0-workspace', '1-one', '2-two', '4-four', '5-five']) {
    for (const file of ['AGENTS.md', 'CLAUDE.md', 'notes.md']) {
      expect(existsSync(join(ws, 'projects', dir, file))).toBe(true);
    }
  }
  expect(existsSync(join(ws, 'projects/3-three/AGENTS.md'))).toBe(false);
  expect(git(ws, 'status', '--porcelain').stdout).toBe('');

  const settled = commitCount(ws);
  const again = await convergeWorkspace(ws);
  expect(again.steps.find((s) => s.step === 'floor manifests')?.outcome).toBe('satisfied');
  expect(commitCount(ws)).toBe(settled);
});

test('converge leaves a floor CLAUDE.md of the floor’s own, and a partial manifest, as found', async () => {
  const ws = await workspaceWith(['alpha']);
  const dir = join(ws, 'projects/1-alpha');
  rmSync(join(dir, 'CLAUDE.md'));
  await Bun.write(join(dir, 'CLAUDE.md'), 'our own claude guidance\n');
  rmSync(join(dir, 'notes.md'));
  commitAll(ws, 'a floor arranged by hand');
  const report = await convergeWorkspace(ws);
  expect(report.steps.find((s) => s.step === 'floor manifests')?.detail).toBe(
    '2 open floors; written on floor 1',
  );
  expect(readFileSync(join(dir, 'CLAUDE.md'), 'utf8')).toBe('our own claude guidance\n');
  expect(committedNames(ws)).toEqual(['projects/1-alpha/notes.md']);
});

// -- upgrade: kept, current, never the notes --------------------------------

test('upgrade keeps a hand-edited floor AGENTS.md byte-identical and names it as residue', async () => {
  const ws = await workspaceWith(['alpha']);
  const edited = `${FLOOR_AGENTS_MD}\n## How alpha works\n\nOur own section.\n`;
  await Bun.write(join(ws, 'projects/1-alpha/AGENTS.md'), edited);
  commitAll(ws, 'the floor sharpened its manifest');
  await openTask(ws, 'adopt-defaults', { floor: GROUND_FLOOR });
  await createWorkspaceWorktree(ws, 'f0t1');

  const report = await upgradeWorkspace(ws, 'f0t1');
  const rows = Object.fromEntries(report.artifacts.map((a) => [a.path, a.action]));
  expect(rows['projects/0-workspace/AGENTS.md']).toBe('current');
  expect(rows['projects/1-alpha/AGENTS.md']).toBe('kept');
  expect(report.residue).toEqual(['projects/1-alpha/AGENTS.md']);
  const copy = join(ws, report.path ?? '');
  expect(readFileSync(join(copy, 'projects/1-alpha/AGENTS.md'), 'utf8')).toBe(edited);
  expect(readFileSync(join(ws, 'projects/1-alpha/AGENTS.md'), 'utf8')).toBe(edited);
});

test('notes.md is never rewritten: project open, converge, upgrade, and doctor leave it be', async () => {
  const ws = await workspaceWith(['alpha']);
  const notes = join(ws, 'projects/1-alpha/notes.md');
  const ours = '# alpha, in our own words\n\n- 2026-01-01 — the gate needs a warm cache\n';
  await Bun.write(notes, ours);
  commitAll(ws, 'the floor wrote its notes');
  await openProject(ws, 'beta');
  await convergeWorkspace(ws);
  await openTask(ws, 'adopt-defaults', { floor: GROUND_FLOOR });
  await createWorkspaceWorktree(ws, 'f0t1');
  const report = await upgradeWorkspace(ws, 'f0t1');
  await runDoctor(ws);
  expect(report.artifacts.some((a) => a.path.endsWith('notes.md'))).toBe(false);
  expect(readFileSync(notes, 'utf8')).toBe(ours);
});

// -- the write path: ward project note --------------------------------------

test('project note appends one dated bullet and commits it, appending only', async () => {
  const ws = await workspaceWith(['alpha']);
  const notes = join(ws, 'projects/1-alpha/notes.md');
  const seeded = readFileSync(notes, 'utf8');
  const report = await appendFloorNote(ws, 1, '  bun test needs WARD_AGENT unset  ');
  expect(report).toEqual({
    floor: 1,
    slug: 'alpha',
    path: 'projects/1-alpha/notes.md',
    date: TODAY,
    text: 'bun test needs WARD_AGENT unset',
    seeded: false,
  });
  expect(readFileSync(notes, 'utf8')).toBe(
    `${seeded}- ${TODAY} — bun test needs WARD_AGENT unset\n`,
  );
  expect(lastSubject(ws)).toBe('Note on floor 1 (ward 0.1.0)');
  expect(committedNames(ws)).toEqual(['projects/1-alpha/notes.md']);
});

test('project note seeds the notes of a floor the backfill has not reached', async () => {
  const ws = await workspaceWith(['alpha']);
  rmSync(join(ws, 'projects/1-alpha/notes.md'));
  commitAll(ws, 'no notes yet');
  const report = await appendFloorNote(ws, 1, 'first fact');
  expect(report.seeded).toBe(true);
  expect(readFileSync(join(ws, 'projects/1-alpha/notes.md'), 'utf8')).toBe(
    `${seedNotes('alpha', TODAY)}- ${TODAY} — first fact\n`,
  );
});

const refusals: ReadonlyArray<readonly [string, number, string, RegExp]> = [
  ['empty text', 1, '   ', /a note needs text/],
  ['two lines', 1, 'one\ntwo', /one fact on one line/],
  ['an unknown floor', 9, 'a fact', /no project on floor 9/],
  ['a closed floor', 2, 'a fact', /floor 2 is closed/],
];

for (const [name, floor, text, refusal] of refusals) {
  test(`project note refuses ${name}, writing nothing`, async () => {
    const ws = await workspaceWith(['alpha', 'beta']);
    await closeFloor(ws, 2);
    const before = commitCount(ws);
    await expect(appendFloorNote(ws, floor, text)).rejects.toThrow(refusal);
    expect(commitCount(ws)).toBe(before);
    expect(git(ws, 'status', '--porcelain').stdout).toBe('');
  });
}

test('ward project note --json: one document matching its shape', async () => {
  const ws = await workspaceWith(['alpha']);
  const result = runWard(['project', 'note', '1', 'a durable fact', '--json'], ws);
  expect(result.exitCode).toBe(0);
  expect(projectNoteShape.parse(JSON.parse(result.stdout))).toMatchObject({
    floor: 1,
    path: 'projects/1-alpha/notes.md',
    text: 'a durable fact',
    seeded: false,
  });
});

// -- doctor -----------------------------------------------------------------

test('doctor: ok when every open floor is manifested; one info per floor naming each gap', async () => {
  const ws = await workspaceWith(['alpha', 'beta', 'gamma']);
  expect(floorFindings(await runDoctor(ws))).toEqual([
    {
      check: 'floor manifests',
      severity: 'ok',
      message: '4 open floors carry AGENTS.md, CLAUDE.md, and notes.md',
    },
  ]);
  rmSync(join(ws, 'projects/1-alpha/AGENTS.md'));
  rmSync(join(ws, 'projects/1-alpha/CLAUDE.md'));
  rmSync(join(ws, 'projects/2-beta/notes.md'));
  await closeFloor(ws, 3);
  rmSync(join(ws, 'projects/3-gamma/AGENTS.md')); // a closed floor is not asked about
  expect(floorFindings(await runDoctor(ws))).toEqual([
    {
      check: 'floor manifests',
      severity: 'info',
      message:
        'floor 1 (projects/1-alpha/): no AGENTS.md, no CLAUDE.md link — backfill it: ' +
        'ward workspace upgrade',
    },
    {
      check: 'floor manifests',
      severity: 'info',
      message: 'floor 2 (projects/2-beta/): no notes.md — backfill it: ward workspace upgrade',
    },
  ]);
});

// -- no load-path variable: scope comes from the record (design 0057) --------

const launches: ReadonlyArray<readonly [string, string[]]> = [
  ['a floor session', ['session', 'open', '--floor', '1']],
  ['a ground-floor session', ['session', 'open', '--floor', '0']],
  ['a workspace session', ['session', 'open']],
];

for (const [name, argv] of launches) {
  test(`${name} is launched with WARD_AGENT and no floor-manifest variable`, async () => {
    const ws = await workspaceWith(['alpha']);
    const result = runWard([...argv, '--on-exit', 'keep'], ws);
    expect(result.exitCode).toBe(0);
    const [run] = runs();
    expect(run?.wardAgent).toMatch(/\S/);
    expect(run?.wardEnv).toContain('WARD_AGENT');
    expect(run?.wardEnv).not.toContain('WARD_FLOOR_MANIFEST');
  });
}

// -- setup ------------------------------------------------------------------

let scratch: string;
let caseId = 0;
let logFile: string;

interface Run {
  readonly wardAgent: string | null;
  readonly wardEnv: readonly string[];
}

beforeAll(() => {
  applyGitTestEnv();
  scratch = makeTempDir();
  process.env.CLAUDE_CONFIG_DIR = join(scratch, 'claude-home');
});

beforeEach(() => {
  caseId += 1;
  logFile = join(scratch, `runs-${caseId}.jsonl`);
  process.env.WARD_CLAUDE_BIN = writeFakeClaude(scratch, `claude-${caseId}`, { logFile });
});

afterAll(() => {
  delete process.env.WARD_CLAUDE_BIN;
  delete process.env.CLAUDE_CONFIG_DIR;
  removeDir(scratch);
});

async function workspaceWith(slugs: readonly string[]): Promise<string> {
  const ws = join(scratch, `ws-${caseId}`);
  await createWorkspace(ws);
  for (const slug of slugs) await openProject(ws, slug);
  return ws;
}

/** Close a floor the only way a test can: no verb closes a project yet. */
async function closeFloor(ws: string, floor: number): Promise<void> {
  const project = (await readProjects(ws)).find((p) => p.record.floor === floor);
  if (project === undefined) throw new Error(`no floor ${floor}`);
  const type = projectRecordType(project.dir);
  const document = await readDocument(ws, type);
  await writeDocument(ws, type, {
    data: { ...document.data, state: 'closed' },
    body: document.body,
  });
  commitAll(ws, `close floor ${floor}`);
}

/** Remove every floor's manifest — the shape of a workspace from before 0055. */
function stripManifests(ws: string): void {
  for (const dir of new Bun.Glob('projects/*').scanSync({ cwd: ws, onlyFiles: false })) {
    for (const file of ['AGENTS.md', 'CLAUDE.md', 'notes.md']) {
      rmSync(join(ws, dir, file), { force: true });
    }
  }
  commitAll(ws, 'a workspace from before floor manifests');
}

function commitAll(ws: string, subject: string): void {
  gitOrThrow(ws, 'add', '-A');
  gitOrThrow(ws, 'commit', '-m', subject);
}

function commitCount(ws: string): number {
  return Number(gitOrThrow(ws, 'rev-list', '--count', 'HEAD').stdout.trim());
}

function committedNames(ws: string): string[] {
  return gitOrThrow(ws, 'show', '--name-only', '--format=', 'HEAD')
    .stdout.trim()
    .split('\n')
    .sort();
}

function lastSubject(ws: string): string {
  return gitOrThrow(ws, 'log', '-1', '--format=%s').stdout.trim();
}

function floorFindings(report: Awaited<ReturnType<typeof runDoctor>>) {
  return report.workspace.filter((finding) => finding.check === 'floor manifests');
}

function runs(): Run[] {
  if (!existsSync(logFile)) return [];
  return readFileSync(logFile, 'utf8')
    .split('\n')
    .filter((line) => line !== '')
    .map((line) => JSON.parse(line) as Run);
}
