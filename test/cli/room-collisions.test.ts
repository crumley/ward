// Rooms two machines both handed out (design/0058-room-collisions/): a
// workspace cloned onto a second machine, a task opened on each before either
// had the other's record, and the records then synced — the live shape, two
// open tasks holding `f1t2` on one floor. Every task stays nameable by its
// slug-qualified address, the shorthand and the room address refuse naming
// each candidate by that spelling, `task list --json` hands out addresses that
// resolve, and doctor reports the room until all but one holder closes.
// Through the spawned CLI.
import { afterAll, beforeAll, beforeEach, expect, test } from 'bun:test';
import { join } from 'node:path';
import { taskMutationShape } from '../../src/cli/schema.ts';
import { openProject } from '../../src/workspace/projects.ts';
import { openTask } from '../../src/workspace/tasks.ts';
import {
  applyGitTestEnv,
  type CliResult,
  cliPath,
  GIT_ENV,
  makeTempDir,
  NO_GH,
  removeDir,
  WARD_GLOBAL_ENV,
} from '../helpers.ts';
import { preparedWorkspace } from '../prepared.ts';

const URL = 'https://example.com/x/pull/58';
const MAC = 'f1t2-weekly-rituals-design';
const VM = 'f1t2-distill-2026-10-25';
const AMBIGUOUS = `is ambiguous — ${VM}, ${MAC}; name one`;

test('the sync left two open tasks in one room — the shape being repaired', () => {
  const listed = taskList();
  expect(listed.filter((task) => task.code === 't2' && task.state === 'active')).toHaveLength(2);
});

test('the room address and the shorthand refuse, naming each by the spelling that works', () => {
  for (const argv of [
    ['task', 'show', 'f1t2'],
    ['task', 'show', 't2'],
    ['task', 'pr', 'f1t2', URL],
    ['task', 'pause', 't2'],
    ['task', 'close', 'f1t2', '--outcome', 'abandoned'],
  ]) {
    const result = ward(argv);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain(`${argv[2]} ${AMBIGUOUS}`);
  }
});

test('show answers to each slug-qualified address, case-folded', () => {
  for (const [address, slug] of [
    [MAC, 'weekly-rituals-design'],
    [VM, 'distill-2026-10-25'],
    [VM.toUpperCase(), 'distill-2026-10-25'],
  ] as const) {
    const result = ward(['task', 'show', address]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain(`${address.toLowerCase()} ${slug}`);
  }
});

test('a qualifier that names no task in the room is a miss, never a neighbour', () => {
  const result = ward(['task', 'show', 'f1t2-statement-ingest']);
  expect(result.exitCode).toBe(1);
  expect(result.stderr).toContain('no task at f1t2-statement-ingest');
});

test('pr, pr --unlink, pause and resume work through the qualified address', () => {
  const linked = ward(['task', 'pr', MAC, URL, '--json']);
  expect(linked.exitCode).toBe(0);
  expect(taskMutationShape.parse(JSON.parse(linked.stdout))).toMatchObject({
    code: 't2',
    slug: 'weekly-rituals-design',
    address: MAC,
    prs: [URL],
  });
  expect(ward(['task', 'pr', '--unlink', MAC, URL]).stdout).toContain(
    `unlinked ${URL} from ${MAC}`,
  );
  expect(ward(['task', 'pause', VM]).stdout).toContain(`paused ${VM}`);
  expect(ward(['task', 'resume', VM]).stdout).toContain(`resumed ${VM}`);
});

test('task list --json gives each holder its qualified address, and every address resolves', () => {
  const listed = taskList();
  expect(listed.find((task) => task.slug === 'weekly-rituals-design')?.address).toBe(MAC);
  expect(listed.find((task) => task.slug === 'distill-2026-10-25')?.address).toBe(VM);
  // A room only one task holds keeps its short address.
  expect(listed.find((task) => task.slug === 'ledger-setup')?.address).toBe('f1t1');
  // A filter that leaves out one holder does not make the other's room unique.
  const filtered = JSON.parse(ward(['task', 'list', '--slug', 'weekly', '--json']).stdout) as {
    tasks: { address: string }[];
  };
  expect(filtered.tasks.map((task) => task.address)).toEqual([MAC]);
  for (const { address, slug } of listed) {
    const shown = ward(['task', 'show', address]);
    expect(shown.exitCode).toBe(0);
    expect(shown.stdout).toContain(`${address} ${slug}`);
  }
});

test('doctor reports the room with both addresses and the remedy', () => {
  const finding = collisionFindings()[0];
  expect(collisionFindings()).toHaveLength(1);
  expect(finding?.severity).toBe('warn');
  expect(finding?.message).toContain(`f1t2 is held by 2 open tasks: ${VM}, ${MAC}`);
  expect(finding?.message).toContain(`ward task show ${VM}`);
  expect(finding?.message).toContain('the room clears when all but one close');
});

test('closing one holder by its qualified address frees the room address for the other', () => {
  const closed = ward(['task', 'close', VM, '--outcome', 'abandoned']);
  expect(closed.exitCode).toBe(0);
  expect(closed.stdout).toContain(`Task ${VM} closed — abandoned.`);

  expect(collisionFindings()).toEqual([]);
  const open = ward(['task', 'pause', 'f1t2']);
  expect(open.exitCode).toBe(0);
  expect(open.stdout).toContain('paused f1t2 — weekly-rituals-design');
  // The closed holder is still readable by its qualified address, and the
  // listing spells it that way: the room address now names the open task.
  expect(ward(['task', 'show', VM]).stdout).toContain(
    `${VM} distill-2026-10-25 [closed · abandoned]`,
  );
  const listed = taskList();
  expect(listed.find((task) => task.slug === 'distill-2026-10-25')?.address).toBe(VM);
  expect(listed.find((task) => task.slug === 'weekly-rituals-design')?.address).toBe('f1t2');
});

test('the next task on either machine takes a room neither holder has', () => {
  const result = ward(['task', 'open', 'week-start-job', '--project', '1', '--json']);
  expect(result.exitCode).toBe(0);
  expect(JSON.parse(result.stdout)).toMatchObject({ code: 't3', address: 'f1t3' });
});

// -- setup ------------------------------------------------------------------
// One workspace, cloned as a second machine would hold it. Each opens the
// next room on floor 1 — `t2` — before either has the other's commits, and
// the clone's journal is then pulled back, exactly as `pull --rebase` on the
// live machines brought the two records together.

let scratch: string;
let ws: string;
let counter = 0;

beforeAll(() => {
  applyGitTestEnv();
  scratch = makeTempDir();
});

afterAll(() => removeDir(scratch));

beforeEach(async () => {
  counter += 1;
  ws = join(scratch, `case-${counter}`);
  const vm = join(scratch, `case-${counter}-vm`);
  await preparedWorkspace(ws);
  await openProject(ws, 'ledger'); // floor 1
  await openTask(ws, 'ledger-setup', { floor: 1 }); // f1t1, before the machines diverge
  git(scratch, 'clone', '--quiet', ws, vm);
  await openTask(vm, 'distill-2026-10-25', { floor: 1 }); // the VM's f1t2
  await openTask(ws, 'weekly-rituals-design', { floor: 1 }); // the Mac's f1t2
  git(ws, 'pull', '--quiet', '--rebase', vm, 'HEAD');
});

/** The CLI, bounded: spawnSync blocks the runner, so a stalled child must time out itself. */
function ward(argv: string[]): CliResult {
  const result = Bun.spawnSync(['bun', cliPath, ...argv], {
    cwd: ws,
    env: { ...process.env, NO_COLOR: '1', WARD_GH: NO_GH, ...GIT_ENV, ...WARD_GLOBAL_ENV },
    timeout: 30_000,
  });
  return {
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  };
}

function taskList(): { address: string; code: string; slug: string; state: string }[] {
  return JSON.parse(ward(['task', 'list', '--all', '--json']).stdout).tasks;
}

function collisionFindings(): { severity: string; message: string }[] {
  const doctor = JSON.parse(ward(['doctor', '--json']).stdout) as {
    workspace: { check: string; severity: string; message: string }[];
  };
  return doctor.workspace.filter((finding) => finding.check === 'room collisions');
}

function git(cwd: string, ...args: string[]): void {
  const result = Bun.spawnSync(['git', '-C', cwd, ...args], {
    env: { ...process.env, ...GIT_ENV },
    timeout: 30_000,
  });
  if (result.exitCode !== 0) throw new Error(result.stderr.toString());
}
