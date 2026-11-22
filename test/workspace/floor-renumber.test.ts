// Renumbering a floor (design/0081-floor-renumber/): `ward project renumber
// FLOOR N` is a rename that changes the number too, once in a floor's life.
// One journal commit moves the directory and rewrites every record that says
// the number — the project record (retiring the old number in
// `previousFloor`), every task of the floor, the floor's own sessions, the
// hand-offs it sent and received, its reflections and the ground floor's
// reflection tasks of it — and appends a fresh `task-named` to each open floor
// session working a task. The disk half and the hosts follow: the checkout
// goes to its new placement, whose leaf carries the new address, and a host
// stamped with the old number is restamped by any later name refresh, on any
// machine. Every address under the old number names nothing afterwards.
// All fixtures synthetic: bare repositories as remotes, a fake session host.
import { afterAll, beforeAll, beforeEach, expect, test } from 'bun:test';
import { existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { hostFindings } from '../../src/agent/host-findings.ts';
import { refreshHosted } from '../../src/agent/naming.ts';
import type { AgentHost, Resolved } from '../../src/agent/settings.ts';
import { type ProjectRenumberShape, projectRenumberShape } from '../../src/cli/schema.ts';
import { readDocument, writeDocument } from '../../src/store/document.ts';
import {
  briefRecordType,
  type DispatchRecord,
  dispatchRecordType,
  projectRecordType,
  reflectionRecordType,
  type TaskRecord,
  taskRecordType,
  worktreeRecordType,
} from '../../src/store/types.ts';
import { convergeWorkspace } from '../../src/workspace/converge.ts';
import {
  dispatchTask,
  matchesDispatchFilter,
  readDispatches,
} from '../../src/workspace/dispatch.ts';
import { runDoctor } from '../../src/workspace/doctor.ts';
import { renumberFloor } from '../../src/workspace/floor-move.ts';
import { floorViewLinks } from '../../src/workspace/floor-views.ts';
import { git, gitOrThrow } from '../../src/workspace/git.ts';
import { workspaceId } from '../../src/workspace/identity.ts';
import { nextFloor, openProject, readProjects } from '../../src/workspace/projects.ts';
import { unreflectedCount } from '../../src/workspace/reflection.ts';
import { addRepository, checkoutPath } from '../../src/workspace/repos.ts';
import { readTasks, resolveOpenTask } from '../../src/workspace/scan.ts';
import {
  closeSession,
  findSession,
  openFloorSession,
  readSessions,
  workingTaskOf,
} from '../../src/workspace/sessions.ts';
import { openTask } from '../../src/workspace/tasks.ts';
import { createWorktree } from '../../src/workspace/worktrees.ts';
import { type FakeHost, fakeHost } from '../agent/fake-host.ts';
import { applyGitTestEnv, callWardEnv, makeTempDir, removeDir } from '../helpers.ts';
import { preparedRemote, preparedWorkspace } from '../prepared.ts';

// -- the move ------------------------------------------------------------------------

test('a renumber rewrites every record that says the number, in one commit, and moves the disk and the host', async () => {
  const floor1 = await seedFloor();
  const host = await hostOnFloor(1);
  const before = commitCount();

  const report = await renumberFloor(ws, '1', '22', { host });

  expect(report).toMatchObject({
    floor: 22,
    from: { floor: 1, slug: 'alpha', dir: 'projects/1-alpha' },
    to: { floor: 22, slug: 'alpha', dir: 'projects/22-alpha' },
    outcome: 'moved',
    named: [{ session: floor1.routing, task: 'f22t2-handed' }],
    worktrees: [
      {
        address: 'f22t1',
        branch: 'feature',
        path: 'floors/22-alpha/f22t1-feature',
        outcome: 'moved',
        from: 'floors/1-alpha/f1t1-feature',
      },
    ],
    view: { dir: 'floors/22-alpha', retired: ['floors/1-alpha'], residue: [] },
    hosts: {
      restamped: [`${name()}-f1-alpha restamped floor 1 → 22`],
      renamed: [`${name()}-f1-alpha is now ${name()}-f22-alpha`],
      failed: [],
    },
  });
  expect([...report.records].sort()).toEqual(
    [
      'projects/22-alpha/project.md',
      'projects/22-alpha/tasks/t1-feature/worktrees/demo--feature.md',
      'projects/22-alpha/reflections/1.md',
      'projects/22-alpha/tasks/t1-feature/task.md',
      'projects/22-alpha/tasks/t9-done/task.md',
      'projects/22-alpha/tasks/t2-handed/task.md',
      `projects/22-alpha/sessions/${floor1.routing}.md`,
      `projects/22-alpha/sessions/${floor1.earlier}.md`,
      'projects/22-alpha/tasks/t2-handed/dispatch.md',
      'projects/2-beta/tasks/t1-sent/dispatch.md',
      'projects/0-workspace/tasks/t1-reflect/task.md',
    ].sort(),
  );
  // One journal commit, read by git as a rename, and nothing left over.
  expect(subjectsSince(before)).toEqual(['Renumber floor 1 (alpha) to 22 (ward 0.1.0)']);
  expect(gitOrThrow(ws, 'show', '--stat', '--format=', '-M', 'HEAD').stdout).toContain('=>');
  expect(git(ws, 'status', '--porcelain').stdout).toBe('');

  // The project record: its number, the one it left (retired), the body line.
  const project = await readDocument(ws, projectRecordType('projects/22-alpha'));
  expect(project.data).toMatchObject({ floor: 22, previousFloor: 1, slug: 'alpha' });
  expect(project.body).toStartWith('Floor 22: the `alpha` project.');
  expect(existsSync(join(ws, 'projects/1-alpha'))).toBe(false);
  const spentNext = await nextFloor(ws);
  expect(spentNext).toBe(23);

  // Every task of the floor, open and closed, says the new number.
  const tasks = (await readTasks(ws)).filter((t) => t.dir.startsWith('projects/22-alpha/'));
  expect(tasks.map((t) => [t.dir, t.record.floor])).toEqual([
    ['projects/22-alpha/tasks/t1-feature', 22],
    ['projects/22-alpha/tasks/t2-handed', 22],
    ['projects/22-alpha/tasks/t9-done', 22],
  ]);
  // Old addresses name nothing; new ones name the same tasks.
  await expect(resolveOpenTask(ws, 'f1t1')).rejects.toThrow();
  expect((await resolveOpenTask(ws, 'f22t1')).dir).toBe('projects/22-alpha/tasks/t1-feature');

  // The worktree: record and checkout at the new placement, work intact; the
  // closed task's record keeps the path it had — history.
  const work = join(ws, 'floors/22-alpha/f22t1-feature');
  expect(tip(work)).toBe(floor1.head);
  expect(registered()).toEqual([work]);
  expect((await worktreeRecord('projects/22-alpha/tasks/t9-done', 'done')).path).toBe(
    'floors/1-alpha/f1t9-done',
  );
  for (const link of floorViewLinks('projects/22-alpha')) {
    expect(readFileSync(join(ws, link.path), 'utf8')).toBe(
      readFileSync(join(ws, link.resolvesTo), 'utf8'),
    );
  }
  expect(existsSync(join(ws, 'floors/1-alpha'))).toBe(false);

  // The floor's sessions: the number rewritten, the ids as minted, closed ones
  // included. The open one working a task reads as working it still, by a
  // fresh `task-named` after the old one, which stays as it was said.
  const sessions = await readSessions(ws, 'projects/22-alpha');
  expect(sessions.map((s) => [s.id, s.floor, s.state])).toEqual([
    [floor1.earlier, 22, 'closed'],
    [floor1.routing, 22, 'open'],
  ]);
  const routing = sessions.find((s) => s.id === floor1.routing);
  expect(routing?.events?.filter((e) => e.event === 'task-named').map((e) => e.task)).toEqual([
    'f1t2-handed',
    'f22t2-handed',
  ]);
  expect(workingTaskOf(routing ?? fail(), await readTasks(ws))?.dir).toBe(
    'projects/22-alpha/tasks/t2-handed',
  );
  // A new floor session takes the new number; the old ids stay addressable.
  expect((await openFloorSession(ws, 22, 'after', {})).id).toBe('f22-1@test');
  expect((await findSession(ws, floor1.routing)).scopeDir).toBe('projects/22-alpha');

  // The hand-offs: `to` and `fromFloor` are filter keys, rewritten; the
  // address each was sent under, and the brief's `for`, are quotations.
  const handed = await dispatch('projects/22-alpha/tasks/t2-handed');
  expect(handed).toMatchObject({ task: 'f1t2', to: 22, fromFloor: 2 });
  const sent = await dispatch('projects/2-beta/tasks/t1-sent');
  expect(sent).toMatchObject({ task: 'f2t1', to: 2, fromFloor: 22 });
  const brief = await readDocument(ws, briefRecordType('projects/22-alpha/tasks/t2-handed'));
  expect(brief.data.for).toBe('f1t2');
  const standings = await readDispatches(ws);
  const to22 = standings.filter((s) => matchesDispatchFilter(s, { to: 22 }));
  const from22 = standings.filter((s) => matchesDispatchFilter(s, { from: 22 }));
  expect(to22.map((s) => [s.address, s.state, s.pickedUp?.session])).toEqual([
    // Picked up before the renumber, by the session that named it: still picked up.
    ['f22t2', 'picked-up', floor1.routing],
  ]);
  expect(to22[0]?.pickedUp?.at).toBe(floor1.pickedAt);
  expect(from22.map((s) => s.address)).toEqual(['f2t1']);
  expect(standings.filter((s) => matchesDispatchFilter(s, { to: 1 }))).toEqual([]);

  // Reflections: the floor each says, the cursor, and the ground floor's task.
  const reflection = await readDocument(ws, reflectionRecordType('projects/22-alpha', 1));
  expect(reflection.data.floor).toBe(22);
  expect(reflection.data.tasks.map((t) => t.dir)).toEqual(['projects/22-alpha/tasks/t9-done']);
  expect(await unreflected(22)).toBe(0);
  expect((await taskRecord('projects/0-workspace/tasks/t1-reflect')).reflects).toBe(22);

  // Asked again — by the number left, or the number held — nothing is written.
  const again = await renumberFloor(ws, '1', '22', { host });
  expect(again).toMatchObject({ outcome: 'satisfied', records: [], named: [] });
  expect(again.worktrees.map((w) => w.outcome)).toEqual(['placed']);
  expect((await renumberFloor(ws, '22', '22', { host })).outcome).toBe('satisfied');
  expect(subjectsSince(before)).toEqual([
    'Renumber floor 1 (alpha) to 22 (ward 0.1.0)',
    'Open session f22-1@test on floor 22 (ward 0.1.0)',
  ]);
});

// -- refusals -------------------------------------------------------------------------

test.each<[string, () => Promise<{ args: [string, string]; caller?: string }>, RegExp]>([
  [
    'a floor renumbered before',
    async () => {
      await renumberFloor(ws, '1', '22', { host: fakeHost() });
      return { args: ['22', '30'] };
    },
    /floor 22 \(alpha\) already left floor 1, which its record keeps retired — a floor is renumbered once/,
  ],
  [
    'a number another floor holds',
    async () => ({ args: ['1', '2'] }),
    /floor 2 is held by beta \(projects\/2-beta\) — a floor number is never reused/,
  ],
  [
    'a number a renumber retired',
    async () => {
      await renumberFloor(ws, '2', '40', { host: fakeHost() });
      return { args: ['1', '2'] };
    },
    /floor 2 was retired by beta \(projects\/40-beta\), which stood on floor 2 before it moved to floor 40/,
  ],
  [
    'the number the floor left, asked of again for another',
    async () => {
      await renumberFloor(ws, '1', '22', { host: fakeHost() });
      return { args: ['1', '30'] };
    },
    /no floor stands on 1: alpha left it for floor 22 \(projects\/22-alpha\), and 1 stays retired/,
  ],
  [
    'the ground floor',
    async () => ({ args: ['0', '5'] }),
    /floor 0 is the ground floor, .* its number is not changed/,
  ],
  ['floor 0 as the target', async () => ({ args: ['1', '0'] }), /ground floor's, reserved/],
  ['a number above 999', async () => ({ args: ['1', '1200'] }), /above 999/],
  ['a target that is not a number', async () => ({ args: ['1', 'ten'] }), /'ten' is not one/],
  ['a floor that does not exist', async () => ({ args: ['9', '10'] }), /no project on floor 9/],
  [
    'a move that would take a shared emoji from this floor',
    async () => {
      await wear(2, await emojiOf(1));
      return { args: ['1', '30'] };
    },
    /floor 2 \(beta\) also wears .*, and on floor 30 this floor would lose it .* ward project identity/,
  ],
  [
    'a move that would take a shared emoji from the other floor',
    async () => {
      await openProject(ws, 'gamma', { floor: 10 });
      await openProject(ws, 'delta', { floor: 20 });
      await wear(20, await emojiOf(10));
      return { args: ['20', '5'] };
    },
    /this floor and floor 10 \(gamma\) both wear .*, and on floor 5 this floor would take it from floor 10/,
  ],
  [
    "the caller being the floor's own session",
    async () => ({ args: ['1', '22'], caller: (await openFloorSession(ws, 1, 'here', {})).id }),
    /this is session f1-1@\S+, one of the floor's own — a floor is renumbered from the coordinator/,
  ],
])('a renumber is refused for %s, and nothing is written', async (_, arrange, says) => {
  await openTask(ws, 'feature', { floor: 1 });
  await createWorktree(ws, 'f1t1', 'demo');
  const { args, caller } = await arrange();
  const before = commitCount();
  const dirs = (await readProjects(ws)).map((p) => p.dir);
  await expect(
    renumberFloor(ws, args[0], args[1], {
      host: fakeHost(),
      ...(caller === undefined ? {} : { caller }),
    }),
  ).rejects.toThrow(says);
  expect(commitCount()).toBe(before);
  expect((await readProjects(ws)).map((p) => p.dir)).toEqual(dirs);
});

// -- two floors on one number --------------------------------------------------------------

test('of two floors on one number, the one named by its directory is renumbered, and nothing of the other', async () => {
  const vm = `${ws}-vm`;
  git(scratch, 'clone', '--quiet', ws, vm);
  process.env.WARD_MACHINE = 'vm'; // the other machine, whose session ids say so
  await openProject(vm, 'distill'); // the VM's floor 3
  const sender = await openFloorSession(vm, 3, 'distilling', {});
  await dispatchTask(vm, 'from-distill', { to: 2, brief: 'from distill', declared: sender.id });
  process.env.WARD_MACHINE = 'test';
  await openProject(ws, 'rituals'); // this machine's floor 3
  const own = await openFloorSession(ws, 3, 'rituals', {});
  await dispatchTask(ws, 'from-rituals', { to: 2, brief: 'from rituals', declared: own.id });
  git(ws, 'pull', '--quiet', '--rebase', vm, 'HEAD');
  expect((await doctorMessages('floor collisions'))[0]).toContain(
    'give the other a number never spent: ward project renumber projects/3-rituals N',
  );

  await expect(renumberFloor(ws, '3', '7', { host: fakeHost() })).rejects.toThrow(
    'floor 3 is held by 2 floors (projects/3-distill, projects/3-rituals) — name the one to ' +
      'renumber by its directory: ward project renumber projects/3-rituals 7',
  );
  const report = await renumberFloor(ws, 'projects/3-rituals', '7', { host: fakeHost() });

  expect(report).toMatchObject({ from: { dir: 'projects/3-rituals' }, to: { floor: 7 } });
  expect((await readProjects(ws)).map((p) => [p.dir, p.record.floor])).toEqual([
    ['projects/0-workspace', 0],
    ['projects/1-alpha', 1],
    ['projects/2-beta', 2],
    ['projects/3-distill', 3],
    ['projects/7-rituals', 7],
  ]);
  // Only the hand-off this floor's own session sent follows it.
  const from = (await readDispatches(ws)).map((s) => [s.task.record.slug, s.record.fromFloor]);
  expect(from).toEqual([
    ['from-distill', 3],
    ['from-rituals', 7],
  ]);
  expect((await readSessions(ws, 'projects/3-distill')).map((s) => s.floor)).toEqual([3]);
  expect((await readSessions(ws, 'projects/7-rituals')).map((s) => s.floor)).toEqual([7]);
  expect(await doctorMessages('floor collisions')).toEqual([]);
});

// -- another machine, and a move cut short -------------------------------------------------

test('a machine whose disk still stands under the old number converges, and its host is restamped at the next refresh', async () => {
  await openTask(ws, 'feature', { floor: 1 });
  await createWorktree(ws, 'f1t1', 'demo');
  await renumberFloor(ws, '1', '22', { host: fakeHost() });
  standAsBefore();
  expect(await doctorMessages('worktree placement')).toEqual([
    'task f22t1: floors/1-alpha/f1t1-feature belongs at floors/22-alpha/f22t1-feature — move it: ward workspace upgrade',
  ]);
  const before = commitCount();

  const steps = (await convergeWorkspace(ws)).steps;

  expect(steps.find((s) => s.step === 'worktree placement')?.detail).toStartWith('1 moved');
  expect(steps.find((s) => s.step === 'retire stale floor views')?.detail).toBe(
    'floors/1-alpha/ retired',
  );
  expect(registered()).toEqual([join(ws, 'floors/22-alpha/f22t1-feature')]);
  expect(existsSync(join(ws, 'floors/22-alpha/AGENTS.md'))).toBe(true);
  expect(commitCount()).toBe(before); // the record had already moved

  // This machine's host still carries the number the floor left: doctor names
  // it, and the next name refresh (attach, launch, upgrade) restamps it.
  const host = await hostOnFloor(1);
  const id = await workspaceId(ws);
  const named = async () =>
    (await hostFindings(ws, id, unset, {}, host))
      .filter((f) => f.check === 'floor hosts')
      .map((f) => f.message);
  expect(await named()).toEqual([
    `${name()}-f1-alpha is stamped floor 1, a number retired when its floor was renumbered to 22 — restamp it now: ward workspace upgrade (an attach or launch here does too)`,
  ]);
  const refreshed = await refreshHosted(ws, host, 'tmux');
  expect(refreshed?.restamped).toEqual([`${name()}-f1-alpha restamped floor 1 → 22`]);
  expect(host.restamps).toEqual([{ group: `${name()}-f1-alpha`, floor: 22 }]);
  expect(await named()).toEqual([]);
  // Asked again, nothing is stamped twice.
  expect((await refreshHosted(ws, host, 'tmux'))?.restamped).toEqual([]);
});

test('a renumber cut short after its commit is finished by asking again', async () => {
  await openTask(ws, 'feature', { floor: 1 });
  await createWorktree(ws, 'f1t1', 'demo');
  await renumberFloor(ws, '1', '22', { host: fakeHost() });
  standAsBefore();
  const before = commitCount();

  const again = await renumberFloor(ws, '1', '22', { host: fakeHost() });

  expect(again.outcome).toBe('satisfied');
  expect(again.worktrees).toEqual([
    {
      address: 'f22t1',
      branch: 'feature',
      path: 'floors/22-alpha/f22t1-feature',
      outcome: 'moved',
      from: 'floors/1-alpha/f1t1-feature',
    },
  ]);
  expect(again.view.retired).toEqual(['floors/1-alpha']);
  expect(commitCount()).toBe(before);
});

// -- the verb ---------------------------------------------------------------------------------

test('ward project renumber takes a slug, reports under --json, and refuses with no document', async () => {
  const result = await callWardEnv(['project', 'renumber', 'alpha', '22', '--json'], ws, env());
  expect(result.exitCode).toBe(0);
  const report: ProjectRenumberShape = projectRenumberShape.parse(JSON.parse(result.stdout));
  expect(report).toMatchObject({
    floor: 22,
    from: { floor: 1, slug: 'alpha' },
    to: { floor: 22, dir: 'projects/22-alpha' },
    outcome: 'moved',
    named: [],
    worktrees: [],
  });

  const human = await callWardEnv(['project', 'renumber', '1', '22'], ws, env());
  expect(human.stdout).toContain('alpha is already floor 22 (projects/22-alpha/)');
  const moved = await callWardEnv(['project', 'renumber', 'beta', '5'], ws, env());
  expect(moved.stdout).toContain('renumbered beta — floor 2 → 5');
  expect(moved.stdout).toContain('addresses under floor 2 name nothing now');

  const refused = await callWardEnv(['project', 'renumber', '22', '30', '--json'], ws, env());
  expect(refused.exitCode).not.toBe(0);
  expect(refused.stdout).toBe('');
  expect(refused.stderr).toContain('a floor is renumbered once');
});

// -- scaffolding ----------------------------------------------------------------------
// Each case: a fresh workspace with one registered repository, `demo` (main
// line `trunk`), floor 1 `alpha` and floor 2 `beta`. Each case is its own
// machine: its own configuration and state directories, and no tmux the verb
// may reach.

const unset: Resolved<AgentHost> = { provenance: 'default', value: 'foreground' };

let scratch: string;
let ws: string;
let caseId = 0;

function name(): string {
  return `ws-${caseId}`;
}

function env(): Record<string, string> {
  return { NO_COLOR: '1', WARD_TMUX_SOCKET: join(scratch, `no-tmux-${caseId}`) };
}

function fail(): never {
  throw new Error('missing');
}

interface SeededFloor {
  readonly head: string;
  /** The open floor session working the handed-over task. */
  readonly routing: string;
  /** A closed floor session. */
  readonly earlier: string;
  /** When `routing` named the hand-off's task — its pick-up. */
  readonly pickedAt: string;
}

/**
 * Floor 1 with everything a renumber rewrites: an open task with a committed
 * worktree (f1t1), a closed one with a worktree record and a reflection over
 * it (f1t9) and the ground floor's closed reflection task of it, a task handed
 * over from floor 2 (f1t2) and picked up by the floor's open session, a closed
 * floor session, and a hand-off floor 1 sent to floor 2.
 */
async function seedFloor(): Promise<SeededFloor> {
  await openTask(ws, 'feature', { floor: 1 });
  const { record } = await createWorktree(ws, 'f1t1', 'demo');
  const work = join(ws, record.path);
  writeFileSync(join(work, 'work.txt'), 'committed work\n');
  gitOrThrow(work, 'add', '-A');
  gitOrThrow(work, 'commit', '-qm', 'the work');
  await seedClosedTask('projects/1-alpha', 9, 'done', 1, 'floors/1-alpha/f1t9-done');
  await seedClosedTask('projects/0-workspace', 1, 'reflect', 0, undefined, {
    stewardship: 'reflection',
    reflects: 1,
  });
  await writeDocument(ws, reflectionRecordType('projects/1-alpha', 1), {
    data: {
      type: 'reflection',
      floor: 1,
      number: 1,
      task: 'projects/0-workspace/tasks/t1-reflect',
      machine: 'test',
      through: '2026-11-03T00:00:00.000Z',
      tasks: [{ dir: 'projects/1-alpha/tasks/t9-done', outcome: 'delivered' }],
      sessions: [],
    },
    body: 'what was learned',
  });
  gitOrThrow(ws, 'add', '-A');
  gitOrThrow(ws, 'commit', '-qm', 'a reflection');
  const beta = await openFloorSession(ws, 2, 'sending', {});
  await dispatchTask(ws, 'handed', { to: 1, brief: 'handed over', declared: beta.id });
  const earlier = await openFloorSession(ws, 1, 'earlier', {});
  await closeSession(ws, earlier.id);
  const routing = await openFloorSession(ws, 1, 'routing', { task: 'f1t2' });
  await dispatchTask(ws, 'sent', { to: 2, brief: 'sent on', declared: routing.id });
  const pickedAt = routing.events?.find((e) => e.event === 'task-named')?.at ?? fail();
  return { head: tip(work), routing: routing.id, earlier: earlier.id, pickedAt };
}

async function seedClosedTask(
  projectDir: string,
  room: number,
  slug: string,
  floor: number,
  path: string | undefined,
  extra: Partial<TaskRecord> = {},
): Promise<void> {
  const dir = `${projectDir}/tasks/t${room}-${slug}`;
  await writeDocument(ws, taskRecordType(dir), {
    data: {
      type: 'task',
      code: `t${room}`,
      slug,
      floor,
      state: 'closed',
      outcome: 'delivered',
      prs: [],
      openedAt: '2026-11-01T00:00:00.000Z',
      closedAt: '2026-11-02T00:00:00.000Z',
      ...extra,
    },
    body: 'done',
  });
  if (path !== undefined) {
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
  }
  gitOrThrow(ws, 'add', '-A');
  gitOrThrow(ws, 'commit', '-qm', `closed ${slug}`);
}

/** A fake host holding this workspace's host for floor `floor`, stamped as Ward stamps it. */
async function hostOnFloor(floor: number): Promise<FakeHost> {
  const id = await workspaceId(ws);
  return fakeHost({
    groups: [
      {
        name: `${name()}-f${floor}-alpha`,
        stamp: { workspace: id, floor },
        clients: 0,
        windows: 0,
        created: 0,
      },
    ],
  });
}

/** This machine's disk as it was before it pulled the renumber: checkout and view under floor 1. */
function standAsBefore(): void {
  for (const link of ['AGENTS.md', 'CLAUDE.md', 'notes.md']) {
    rmSync(join(ws, 'floors/22-alpha', link));
  }
  mkdirSync(join(ws, 'floors/1-alpha'));
  gitOrThrow(
    checkoutPath(ws, 'demo'),
    'worktree',
    'move',
    join(ws, 'floors/22-alpha/f22t1-feature'),
    join(ws, 'floors/1-alpha/f1t1-feature'),
  );
  rmSync(join(ws, 'floors/22-alpha'), { recursive: true });
  for (const link of floorViewLinks('projects/1-alpha')) {
    symlinkSync(link.target, join(ws, link.path));
  }
}

async function emojiOf(floor: number): Promise<string> {
  const project = (await readProjects(ws)).find((p) => p.record.floor === floor);
  return project?.record.emoji ?? fail();
}

/** Put `emoji` on floor `floor`'s record, as two machines' opens can leave two floors wearing one. */
async function wear(floor: number, emoji: string): Promise<void> {
  const project = (await readProjects(ws)).find((p) => p.record.floor === floor) ?? fail();
  const type = projectRecordType(project.dir);
  const current = await readDocument(ws, type);
  await writeDocument(ws, type, { data: { ...current.data, emoji }, body: current.body });
  gitOrThrow(ws, 'commit', '-qam', `floor ${floor} wears ${emoji}`);
}

async function dispatch(taskDir: string): Promise<DispatchRecord> {
  return (await readDocument(ws, dispatchRecordType(taskDir))).data;
}

async function taskRecord(dir: string): Promise<TaskRecord> {
  return (await readDocument(ws, taskRecordType(dir))).data;
}

async function worktreeRecord(taskDir: string, file: string) {
  return (await readDocument(ws, worktreeRecordType(taskDir, file))).data;
}

async function unreflected(floor: number): Promise<number> {
  const project = (await readProjects(ws)).find((p) => p.record.floor === floor) ?? fail();
  return unreflectedCount(ws, project, await readTasks(ws));
}

async function doctorMessages(check: string): Promise<string[]> {
  return (await runDoctor(ws)).workspace.filter((f) => f.check === check).map((f) => f.message);
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
  await openProject(ws, 'beta');
});

afterAll(() => {
  applyGitTestEnv();
  removeDir(scratch);
});
