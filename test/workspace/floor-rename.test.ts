// Renaming a floor (design/0080-floor-rename/): `ward project rename FLOOR SLUG`
// moves the record directory in one journal commit — the project record's
// slug, the open tasks' worktree paths and the reflection cursor rewritten with
// it — then moves this machine's checkouts and outside links under the new
// view, retires the old view, and renames the floor's hosts. It is refused,
// with nothing written, while anything would be moved out from under work in
// flight. A machine that pulled the commit, and a write made under the old
// name before the two met, both converge through `ward workspace upgrade`.
// All fixtures synthetic: bare repositories as remotes, a fake session host.
import { afterAll, beforeAll, beforeEach, expect, test } from 'bun:test';
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readlinkSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { type ProjectRenameShape, projectRenameShape } from '../../src/cli/schema.ts';
import type { FoundWindow } from '../../src/host/host.ts';
import { readDocument, writeDocument } from '../../src/store/document.ts';
import {
  type ProjectRecord,
  projectRecordType,
  reflectionRecordType,
  taskRecordType,
  worktreeRecordType,
} from '../../src/store/types.ts';
import { convergeWorkspace } from '../../src/workspace/converge.ts';
import { runDoctor } from '../../src/workspace/doctor.ts';
import { renameFloor } from '../../src/workspace/floor-move.ts';
import { floorViewLinks } from '../../src/workspace/floor-views.ts';
import { git, gitOrThrow } from '../../src/workspace/git.ts';
import { workspaceId } from '../../src/workspace/identity.ts';
import { GROUND_FLOOR, openProject, readProjects } from '../../src/workspace/projects.ts';
import { unreflectedCount } from '../../src/workspace/reflection.ts';
import { addRepository, checkoutPath } from '../../src/workspace/repos.ts';
import { readTasks, resolveOpenTask } from '../../src/workspace/scan.ts';
import { openFloorSession, openSession } from '../../src/workspace/sessions.ts';
import { openTask } from '../../src/workspace/tasks.ts';
import { createWorktree, readTaskWorktreeEntries } from '../../src/workspace/worktrees.ts';
import { fakeHost } from '../agent/fake-host.ts';
import { applyGitTestEnv, callWardEnv, makeTempDir, removeDir } from '../helpers.ts';
import { preparedRemote, preparedWorkspace } from '../prepared.ts';

// -- the move ------------------------------------------------------------------------

test('a rename moves the record, the checkout, the view, the cursor and the host in one commit', async () => {
  await openTask(ws, 'feature', { floor: 1 });
  const { record } = await createWorktree(ws, 'f1t1', 'demo');
  const work = join(ws, record.path);
  writeFileSync(join(work, 'work.txt'), 'committed work\n');
  gitOrThrow(work, 'add', '-A');
  gitOrThrow(work, 'commit', '-qm', 'the work');
  const head = tip(work);
  await seedClosedTask('projects/1-alpha', 2, 'done', 'floors/1-alpha/f1t2-done');
  await seedReflection('projects/1-alpha', ['projects/1-alpha/tasks/t2-done']);
  expect(await unreflected()).toBe(0);
  const id = await workspaceId(ws);
  const host = fakeHost({
    groups: [
      {
        name: `${name()}-f1-alpha`,
        stamp: { workspace: id, floor: 1 },
        clients: 0,
        windows: 0,
        created: 0,
      },
    ],
  });
  const before = commitCount();

  const report = await renameFloor(ws, 1, 'beta', { host });

  expect(report).toMatchObject({
    floor: 1,
    from: { slug: 'alpha', dir: 'projects/1-alpha' },
    to: { slug: 'beta', dir: 'projects/1-beta' },
    outcome: 'moved',
    worktrees: [
      {
        address: 'f1t1',
        branch: 'feature',
        path: 'floors/1-beta/f1t1-feature',
        outcome: 'moved',
        from: 'floors/1-alpha/f1t1-feature',
      },
    ],
    view: { dir: 'floors/1-beta', retired: ['floors/1-alpha'], residue: [] },
    hosts: { renamed: [`${name()}-f1-alpha is now ${name()}-f1-beta`], failed: [] },
  });
  expect(report.records).toEqual([
    'projects/1-beta/project.md',
    'projects/1-beta/tasks/t1-feature/worktrees/demo--feature.md',
    'projects/1-beta/reflections/1.md',
  ]);
  // One journal commit, read by git as a rename of the directory.
  expect(subjectsSince(before)).toEqual(['Rename floor 1 from alpha to beta (ward 0.1.0)']);
  expect(gitOrThrow(ws, 'show', '--stat', '--format=', '-M', 'HEAD').stdout).toContain('=>');
  expect(git(ws, 'status', '--porcelain').stdout).toBe('');

  // The record: the slug, and the body line that spells it.
  const project = await readDocument(ws, projectRecordType('projects/1-beta'));
  expect(project.data.slug).toBe('beta');
  expect(project.body).toContain('the `beta` project');
  expect(existsSync(join(ws, 'projects/1-alpha'))).toBe(false);
  // The address is unchanged; the old slug resolves nothing.
  expect((await resolveOpenTask(ws, 'f1t1')).dir).toBe('projects/1-beta/tasks/t1-feature');
  // The open task's worktree moved, record and checkout, work intact; the
  // closed task's record keeps the path it had.
  expect(await worktreePaths()).toEqual({
    'projects/1-beta/tasks/t1-feature': ['floors/1-beta/f1t1-feature'],
    'projects/1-beta/tasks/t2-done': ['floors/1-alpha/f1t2-done'],
  });
  const moved = join(ws, 'floors/1-beta/f1t1-feature');
  expect(tip(moved)).toBe(head);
  expect(registered()).toEqual([moved]);
  // The new view resolves onto the moved record; the old one is gone.
  for (const link of floorViewLinks('projects/1-beta')) {
    expect(readFileSync(join(ws, link.path), 'utf8')).toBe(
      readFileSync(join(ws, link.resolvesTo), 'utf8'),
    );
  }
  expect(existsSync(join(ws, 'floors/1-alpha'))).toBe(false);
  // The cursor followed: the covered task still reads as reflected on.
  expect(await unreflected()).toBe(0);
  // The notes are the floor's, and Ward leaves their heading as written.
  expect(readFileSync(join(ws, 'projects/1-beta/notes.md'), 'utf8')).toContain('# Notes — alpha');

  // Asked again: nothing to commit, nothing to move.
  const again = await renameFloor(ws, 1, 'beta', { host });
  expect(again).toMatchObject({ outcome: 'satisfied', records: [] });
  expect(again.worktrees.map((worktree) => worktree.outcome)).toEqual(['placed']);
  expect(subjectsSince(before)).toHaveLength(1);
});

// -- refusals -------------------------------------------------------------------------

test.each<[string, () => Promise<{ caller?: string; host?: ReturnType<typeof fakeHost> }>, RegExp]>(
  [
    [
      'a dirty checkout',
      async () => {
        writeFileSync(join(ws, 'floors/1-alpha/f1t1-feature/scratch.txt'), 'unrecorded\n');
        return {};
      },
      /f1t1's worktree floors\/1-alpha\/f1t1-feature: uncommitted changes/,
    ],
    [
      'a session working inside the checkout',
      async () => {
        await openSession(ws, 'f1t1', 'working there', {
          workingDirectory: 'floors/1-alpha/f1t1-feature/src',
        });
        return {};
      },
      /open session feature-1@test works in floors\/1-alpha\/f1t1-feature\/src/,
    ],
    [
      'a session working in the view',
      async () => {
        await openFloorSession(ws, 1, 'tending', { workingDirectory: 'floors/1-alpha' });
        return {};
      },
      /open session f1-1@\S+ works in floors\/1-alpha/,
    ],
    [
      'an open reflection of the floor',
      async () => {
        const task = await openTask(ws, 'reflect', { floor: GROUND_FLOOR });
        const type = taskRecordType(task.dir);
        const current = await readDocument(ws, type);
        await writeDocument(ws, type, {
          data: { ...current.data, stewardship: 'reflection', reflects: 1 },
          body: current.body,
        });
        gitOrThrow(ws, 'commit', '-qam', 'a reflection in flight');
        return {};
      },
      /reflection f0t1 of this floor is open/,
    ],
    [
      "a live hosted run of the floor's session",
      async () => {
        const session = await openFloorSession(ws, 1, 'hosted', {
          handle: 'claude:f',
          host: 'tmux',
        });
        const id = await workspaceId(ws);
        const window: FoundWindow = {
          window: '@1',
          groups: [{ name: `${name()}-f1-alpha`, stamp: { workspace: id, floor: 1 } }],
          tags: { session: session.id, epoch: session.events?.at(-1)?.at ?? '' },
          dead: false,
        };
        return { host: fakeHost({ windows: [window] }) };
      },
      /session f1-1@\S+ is running in ws-\d+-f1-alpha .*renamed from the coordinator/,
    ],
    [
      "the caller being the floor's own session",
      async () => {
        const session = await openFloorSession(ws, 1, 'here', {});
        return { caller: session.id };
      },
      /this is session f1-1@\S+, one of the floor's own — a floor is renamed from the coordinator/,
    ],
    [
      'a view already standing at the new name',
      async () => {
        mkdirSync(join(ws, 'floors/1-beta'));
        return {};
      },
      /floors\/1-beta\/ already exists/,
    ],
  ],
)('a rename is refused for %s, and nothing is written', async (_, arrange, says) => {
  await openTask(ws, 'feature', { floor: 1 });
  await createWorktree(ws, 'f1t1', 'demo');
  const options = await arrange();
  const before = commitCount();
  const host = options.host ?? fakeHost();
  await expect(
    renameFloor(ws, 1, 'beta', {
      host,
      ...(options.caller === undefined ? {} : { caller: options.caller }),
    }),
  ).rejects.toThrow(says);
  expect(commitCount()).toBe(before);
  expect(existsSync(join(ws, 'projects/1-alpha/project.md'))).toBe(true);
  expect(existsSync(join(ws, 'floors/1-alpha/f1t1-feature'))).toBe(true);
});

test.each<[string, number, string, RegExp]>([
  [
    'the ground floor',
    GROUND_FLOOR,
    'home',
    /floor 0 is the ground floor, .* its name is not changed/,
  ],
  ['a slug that is not one', 1, 'Not A Slug', /'Not A Slug' is not a valid slug/],
  ['a floor that does not exist', 9, 'nine', /no project on floor 9/],
])('a rename refuses %s', async (_, floor, slug, says) => {
  await expect(renameFloor(ws, floor, slug, { host: fakeHost() })).rejects.toThrow(says);
});

test('a host that is not usable here is not asked, and the rename goes ahead', async () => {
  await openFloorSession(ws, 1, 'hosted', { handle: 'claude:f', host: 'tmux' });
  const report = await renameFloor(ws, 1, 'beta', { host: fakeHost({ unusable: 'no tmux' }) });
  expect(report.outcome).toBe('moved');
  expect(report.hosts).toBeUndefined();
});

// -- an outside worktree ------------------------------------------------------------------

test("an outside worktree stays where its command made it; only the floor's link onto it moves", async () => {
  const elsewhere = join(scratch, `trees-${caseId}`);
  configure({
    demo: { worktree: { create: [script('wt', OUTSIDE_SCRIPT), elsewhere, '{branch}', '{base}'] } },
  });
  await openTask(ws, 'feature', { floor: 1 });
  const { record } = await createWorktree(ws, 'f1t1', 'demo');
  expect(record.path).toBe(join(elsewhere, 'feature'));
  expect(readlinkSync(join(ws, 'floors/1-alpha/f1t1-feature'))).toBe(record.path);

  const report = await renameFloor(ws, 1, 'beta', { host: fakeHost() });

  expect(report.worktrees).toEqual([
    { address: 'f1t1', branch: 'feature', path: record.path, outcome: 'linked' },
  ]);
  expect(report.records).toEqual(['projects/1-beta/project.md']); // the record names no view
  expect(readlinkSync(join(ws, 'floors/1-beta/f1t1-feature'))).toBe(record.path);
  expect(existsSync(join(ws, 'floors/1-alpha'))).toBe(false); // the old link went with its view
  expect(existsSync(join(record.path, 'seed.txt'))).toBe(true);
});

// -- the stale view -----------------------------------------------------------------------

test('a stale view holding only Ward links is retired; one holding more is kept and named', async () => {
  await openProject(ws, 'gamma');
  // Floor 2's view as a rename on another machine leaves it: links only.
  await moveFloorDirectoryByHand('projects/2-gamma', 'projects/2-delta');
  // Floor 1's old view with something of somebody's in it.
  await moveFloorDirectoryByHand('projects/1-alpha', 'projects/1-beta');
  writeFileSync(join(ws, 'floors/1-alpha/todo.txt'), 'mine\n');

  expect(await findings('stale floor views')).toEqual([
    {
      severity: 'warn',
      message: expect.stringContaining(
        "floors/1-alpha/ matches no open floor, and holds what is not Ward's: floors/1-alpha/todo.txt",
      ),
    },
    {
      severity: 'info',
      message:
        "floors/2-gamma/ matches no open floor and holds only Ward's links — retire it: ward workspace upgrade",
    },
  ]);

  const step = (await convergeWorkspace(ws)).steps.find(
    (s) => s.step === 'retire stale floor views',
  );
  expect(step).toEqual({
    step: 'retire stale floor views',
    outcome: 'established',
    detail: 'floors/2-gamma/ retired, 1 thing kept',
    residue: [
      {
        path: 'floors/1-alpha/todo.txt',
        reason:
          "floors/1-alpha/ matches no open floor, and this is not one of Ward's links — move or remove it",
      },
    ],
  });
  expect(existsSync(join(ws, 'floors/2-gamma'))).toBe(false);
  expect(existsSync(join(ws, 'floors/2-delta/AGENTS.md'))).toBe(true);
  // Kept whole: the dangling links stay beside what is not Ward's.
  expect(lstatSync(join(ws, 'floors/1-alpha/AGENTS.md')).isSymbolicLink()).toBe(true);
  expect(readFileSync(join(ws, 'floors/1-alpha/todo.txt'), 'utf8')).toBe('mine\n');
});

// -- a second machine -------------------------------------------------------------------

test('a machine that pulled the rename converges: checkout moved, view established, old view retired', async () => {
  await openTask(ws, 'feature', { floor: 1 });
  await createWorktree(ws, 'f1t1', 'demo');
  await renameFloor(ws, 1, 'beta', { host: fakeHost() });
  // This machine's disk as it was before the pull: the checkout and the view
  // still under the old name, the record already under the new one.
  rmSync(join(ws, 'floors/1-beta/AGENTS.md'));
  rmSync(join(ws, 'floors/1-beta/CLAUDE.md'));
  rmSync(join(ws, 'floors/1-beta/notes.md'));
  mkdirSync(join(ws, 'floors/1-alpha'));
  gitOrThrow(
    checkoutPath(ws, 'demo'),
    'worktree',
    'move',
    join(ws, 'floors/1-beta/f1t1-feature'),
    join(ws, 'floors/1-alpha/f1t1-feature'),
  );
  rmSync(join(ws, 'floors/1-beta'), { recursive: true });
  for (const link of floorViewLinks('projects/1-alpha'))
    symlinkSync(link.target, join(ws, link.path));
  expect((await findings('worktree placement')).map((f) => f.message)).toEqual([
    'task f1t1: floors/1-alpha/f1t1-feature belongs at floors/1-beta/f1t1-feature — move it: ward workspace upgrade',
  ]);
  const before = commitCount();

  const steps = (await convergeWorkspace(ws)).steps;

  expect(steps.find((s) => s.step === 'worktree placement')?.detail).toStartWith('1 moved');
  expect(steps.find((s) => s.step === 'retire stale floor views')?.detail).toBe(
    'floors/1-alpha/ retired',
  );
  expect(registered()).toEqual([join(ws, 'floors/1-beta/f1t1-feature')]);
  expect(existsSync(join(ws, 'floors/1-beta/AGENTS.md'))).toBe(true);
  expect(existsSync(join(ws, 'floors/1-alpha'))).toBe(false);
  expect(commitCount()).toBe(before); // the record had already moved
  expect(await findings('worktree placement')).toEqual([]);
  expect(await findings('stale floor views')).toEqual([]);
});

// -- a write under the old name -------------------------------------------------------------

test('a task written under the old name after the rename is named by doctor and folded by upgrade', async () => {
  await renameFloor(ws, 1, 'beta', { host: fakeHost() });
  // What another machine opened before the two synced, met by the rename.
  await writeDocument(ws, taskRecordType('projects/1-alpha/tasks/t4-late'), {
    data: {
      type: 'task',
      code: 't4',
      slug: 'late',
      floor: 1,
      state: 'active',
      prs: [],
      openedAt: 'then',
    },
    body: 'opened elsewhere',
  });
  writeFileSync(
    join(ws, 'projects/1-alpha/notes.md'),
    readFileSync(join(ws, 'projects/1-beta/notes.md')),
  );
  writeFileSync(join(ws, 'projects/1-alpha/AGENTS.md'), 'not the same\n');
  gitOrThrow(ws, 'add', '-A');
  gitOrThrow(ws, 'commit', '-qm', 'the other machine');
  await expect(readProjects(ws)).rejects.toThrow(
    "projects/1-alpha/ holds no project.md — a write under a floor's old name",
  );
  expect(await findings('floor records')).toEqual([
    {
      severity: 'warn',
      message:
        "projects/1-alpha/ holds no project.md — a write under floor 1's old name; fold it into projects/1-beta/: ward workspace upgrade",
    },
  ]);

  await expect(convergeWorkspace(ws)).rejects.toThrow(
    /could not be folded whole[\s\S]*projects\/1-alpha\/AGENTS.md: differs from projects\/1-beta\/AGENTS.md/,
  );

  // What could be folded was, and journaled: the task moved in, the identical
  // notes dropped; the differing file stays where it was.
  expect((await resolveOpenTask(ws, 'f1t4')).dir).toBe('projects/1-beta/tasks/t4-late');
  expect(existsSync(join(ws, 'projects/1-alpha/notes.md'))).toBe(false);
  expect(readFileSync(join(ws, 'projects/1-alpha/AGENTS.md'), 'utf8')).toBe('not the same\n');
  expect(git(ws, 'status', '--porcelain').stdout).toBe('');
  // With the differing file cleared, the next run folds what is left away.
  rmSync(join(ws, 'projects/1-alpha/AGENTS.md'));
  gitOrThrow(ws, 'commit', '-qam', 'cleared by hand');
  const step = (await convergeWorkspace(ws)).steps.find(
    (s) => s.step === 'orphaned floor directories',
  );
  expect(step).toEqual({
    step: 'orphaned floor directories',
    outcome: 'established',
    detail: 'projects/1-alpha/ folded into projects/1-beta/',
  });
  expect(existsSync(join(ws, 'projects/1-alpha'))).toBe(false);
  expect((await readProjects(ws)).map((p) => p.dir)).toEqual([
    'projects/0-workspace',
    'projects/1-beta',
  ]);
});

// -- the verb ---------------------------------------------------------------------------------

test('ward project rename reports under --json, and refuses with no document', async () => {
  const result = await callWardEnv(['project', 'rename', '1', 'beta', '--json'], ws, env());
  expect(result.exitCode).toBe(0);
  const report: ProjectRenameShape = projectRenameShape.parse(JSON.parse(result.stdout));
  expect(report).toMatchObject({ floor: 1, to: { slug: 'beta' }, outcome: 'moved', worktrees: [] });

  const human = await callWardEnv(['project', 'rename', '1', 'beta'], ws, env());
  expect(human.stdout).toContain('floor 1 is already beta (projects/1-beta/)');

  const refused = await callWardEnv(['project', 'rename', '0', 'home', '--json'], ws, env());
  expect(refused.exitCode).not.toBe(0);
  expect(refused.stdout).toBe('');
  expect(refused.stderr).toContain('floor 0 is the ground floor');
});

// -- scaffolding ----------------------------------------------------------------------
// Each case: a fresh workspace with one registered repository, `demo` (main
// line `trunk`), and floor 1 `alpha`. Each case is its own machine: its own
// configuration and state directories, and no tmux the verb may reach.

/** A worktree tool that makes the worktree at ROOT/<branch>, outside the workspace. */
const OUTSIDE_SCRIPT = 'mkdir -p "$1"\ngit worktree add -q -b "$2" "$1/$2" "$3"';

let scratch: string;
let ws: string;
let caseId = 0;

function name(): string {
  return `ws-${caseId}`;
}

function env(): Record<string, string> {
  return { NO_COLOR: '1', WARD_TMUX_SOCKET: join(scratch, `no-tmux-${caseId}`) };
}

function configure(repositories: Record<string, { worktree?: { create?: string[] } }>): void {
  const dir = process.env.WARD_CONFIG_DIR ?? '';
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, 'config.md'),
    `---\n${JSON.stringify({ type: 'ward-config', repositories })}\n---\n`,
  );
}

function script(label: string, body: string): string {
  const path = join(scratch, `${label}-${caseId}`);
  writeFileSync(path, `#!/bin/sh\n${body}\n`);
  chmodSync(path, 0o755);
  return path;
}

/** A closed task with one worktree record, as a close leaves it: the record kept, nothing on disk. */
async function seedClosedTask(
  projectDir: string,
  room: number,
  slug: string,
  path: string,
): Promise<void> {
  const dir = `${projectDir}/tasks/t${room}-${slug}`;
  await writeDocument(ws, taskRecordType(dir), {
    data: {
      type: 'task',
      code: `t${room}`,
      slug,
      floor: 1,
      state: 'closed',
      outcome: 'delivered',
      prs: [],
      openedAt: '2026-11-01T00:00:00.000Z',
      closedAt: '2026-11-02T00:00:00.000Z',
    },
    body: 'done',
  });
  await writeDocument(ws, worktreeRecordType(dir, slug), {
    data: {
      type: 'worktree',
      repo: 'demo',
      branch: slug,
      path,
      disposition: 'deliverable',
      createdAt: 'then',
    },
    body: 'torn down at close',
  });
  gitOrThrow(ws, 'add', '-A');
  gitOrThrow(ws, 'commit', '-qm', 'a closed task');
}

async function seedReflection(projectDir: string, tasks: string[]): Promise<void> {
  await writeDocument(ws, reflectionRecordType(projectDir, 1), {
    data: {
      type: 'reflection',
      floor: 1,
      number: 1,
      task: 'projects/0-workspace/tasks/t9-reflect',
      machine: 'test',
      through: '2026-11-03T00:00:00.000Z',
      tasks: tasks.map((dir) => ({ dir, outcome: 'delivered' as const })),
      sessions: [],
    },
    body: 'what was learned',
  });
  gitOrThrow(ws, 'add', '-A');
  gitOrThrow(ws, 'commit', '-qm', 'a reflection');
}

/** Move a floor's directory as a rename on another machine would, leaving this machine's view behind. */
async function moveFloorDirectoryByHand(from: string, to: string): Promise<void> {
  gitOrThrow(ws, 'mv', from, to);
  const type = projectRecordType(to);
  const current = await readDocument(ws, type);
  const slug = to.split('-').slice(1).join('-');
  const data: ProjectRecord = { ...current.data, slug };
  await writeDocument(ws, type, { data, body: current.body });
  gitOrThrow(ws, 'add', '-A');
  gitOrThrow(ws, 'commit', '-qm', `renamed elsewhere to ${slug}`);
}

async function unreflected(): Promise<number> {
  const project = (await readProjects(ws)).find((p) => p.record.floor === 1);
  if (project === undefined) throw new Error('no floor 1');
  return unreflectedCount(ws, project, await readTasks(ws));
}

async function worktreePaths(): Promise<Record<string, string[]>> {
  const paths: Record<string, string[]> = {};
  for (const task of await readTasks(ws)) {
    const entries = await readTaskWorktreeEntries(ws, task.dir);
    if (entries.length > 0) paths[task.dir] = entries.map((entry) => entry.record.path);
  }
  return paths;
}

async function findings(check: string): Promise<{ severity: string; message: string }[]> {
  return (await runDoctor(ws)).workspace
    .filter((finding) => finding.check === check)
    .map(({ severity, message }) => ({ severity, message }));
}

function registered(): string[] {
  return gitOrThrow(checkoutPath(ws, 'demo'), 'worktree', 'list', '--porcelain')
    .stdout.split('\n')
    .filter((line) => line.startsWith('worktree '))
    .map((line) => line.slice('worktree '.length))
    .slice(1)
    .sort();
}

function tip(dir: string): string {
  return gitOrThrow(dir, 'rev-parse', 'HEAD').stdout.trim();
}

function commitCount(): number {
  return Number.parseInt(gitOrThrow(ws, 'rev-list', '--count', 'HEAD').stdout.trim(), 10);
}

function subjectsSince(count: number): string[] {
  const total = commitCount();
  if (total === count) return [];
  return gitOrThrow(ws, 'log', '--format=%s', '--reverse', `-${total - count}`)
    .stdout.trim()
    .split('\n');
}

beforeAll(() => {
  applyGitTestEnv();
  scratch = makeTempDir();
});

beforeEach(async () => {
  caseId += 1;
  applyGitTestEnv();
  process.env.WARD_CONFIG_DIR = join(scratch, `config-${caseId}`);
  process.env.WARD_STATE_DIR = join(scratch, `state-${caseId}`);
  process.env.WARD_MACHINE = 'test';
  ws = join(scratch, `ws-${caseId}`);
  await preparedWorkspace(ws);
  const remote = join(scratch, `remote-${caseId}.git`);
  preparedRemote(remote, { branch: 'trunk', files: { 'seed.txt': 'seed\n' } });
  await addRepository(ws, remote, 'demo');
  await openProject(ws, 'alpha');
});

afterAll(() => {
  applyGitTestEnv();
  removeDir(scratch);
});
