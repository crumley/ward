// A floor at a chosen number (design/0077-floor-chosen-number/): `ward project
// open SLUG --floor N` opens at N while nothing in the record has spent it —
// no floor holds it, open or closed, none retired it, and no directory leads
// with it — and refuses otherwise, naming what spent it and what to do
// instead. Left unchosen, a floor takes one past the highest number ever
// spent, a chosen one included. Floors list by number, not as text. Two
// floors on one number — two machines that each opened it before their
// records synced — are reported by doctor, each named by its directory.
// Through the CLI, in-process.
import { afterAll, beforeAll, beforeEach, expect, test } from 'bun:test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { projectListShape, projectOpenShape, statusShape } from '../../src/cli/schema.ts';
import { readDocument, writeDocument } from '../../src/store/document.ts';
import { projectRecordType } from '../../src/store/types.ts';
import {
  CHOSEN_FLOOR_CEILING,
  nextFloor,
  openProject,
  requireFloorChoice,
  spentFloors,
} from '../../src/workspace/projects.ts';
import { commitRecords, projectDirs } from '../../src/workspace/scan.ts';
import {
  applyGitTestEnv,
  type CliResult,
  callWardEnv,
  GIT_ENV,
  makeTempDir,
  NO_GH,
  removeDir,
} from '../helpers.ts';
import { preparedWorkspace } from '../prepared.ts';

// -- allocation -----------------------------------------------------------------

test('--floor opens at the number chosen, and the next unchosen floor follows the highest', async () => {
  const chosen = await ward(['project', 'open', 'night-shift', '--floor', '10', '--json']);
  expect(chosen.exitCode).toBe(0);
  expect(projectOpenShape.parse(JSON.parse(chosen.stdout))).toMatchObject({
    floor: 10,
    chosen: true,
    slug: 'night-shift',
  });
  // A number below the highest that was never spent is still open to a choice.
  expect((await ward(['project', 'open', 'duet', '--floor', '3'])).stdout).toStartWith(
    'opened floor 3 — ',
  );
  // Unchosen: one past the highest ever spent, never the gap below it.
  const next = await ward(['project', 'open', 'garden', '--json']);
  expect(JSON.parse(next.stdout)).toMatchObject({ floor: 11, chosen: false });
  expect(floorDirs()).toEqual([
    'projects/0-workspace',
    'projects/3-duet',
    'projects/10-night-shift',
    'projects/11-garden',
  ]);
});

test('the choice is read as a whole number: leading zeros and spaces name the same floor', () => {
  expect(requireFloorChoice('7')).toBe(7);
  expect(requireFloorChoice('007')).toBe(7);
  expect(requireFloorChoice(' 12 ')).toBe(12);
  expect(requireFloorChoice(String(CHOSEN_FLOOR_CEILING))).toBe(999);
});

// -- refusals --------------------------------------------------------------------

test.each<[string, string, string]>([
  ['the ground floor', '0', "floor 0 is the ground floor's, reserved in every workspace"],
  ['a negative number', '-3', "--floor takes a whole number from 1 to 999 — '-3' is not one"],
  ['a fraction', '2.5', "'2.5' is not one"],
  ['a word', 'seven', "'seven' is not one"],
  ['a number above the ceiling', '1000', 'floor 1000 is above 999, the highest floor opened by'],
])('--floor refuses %s, and opens nothing', async (_, value, says) => {
  const refused = await ward(['project', 'open', 'beta', `--floor=${value}`, '--json']);
  expect(refused.exitCode).toBe(1);
  expect(refused.stdout).toBe('');
  expect(refused.stderr).toContain(says);
  expect(refused.stderr).toContain('leave --floor out and the floor takes the next number');
  expect(floorDirs()).toEqual(['projects/0-workspace']);
});

test('a negative number after a space is read as the value, not as a flag', async () => {
  const refused = await ward(['project', 'open', 'beta', '--floor', '-3']);
  expect(refused.exitCode).toBe(1);
  expect(refused.stderr).toContain("'-3' is not one");
});

test('a number an open floor holds is refused, naming the floor and the next number', async () => {
  await openProject(ws, 'alpha', { floor: 4 });
  const refused = await ward(['project', 'open', 'beta', '--floor', '4']);
  expect(refused.exitCode).toBe(1);
  expect(refused.stderr).toContain(
    'floor 4 is held by alpha (projects/4-alpha) — a floor number is never reused',
  );
  expect(refused.stderr).toContain(
    'choose one never spent, or leave --floor out and the floor takes the next (5)',
  );
});

test('a number a closed floor holds is refused: closed floors keep their numbers', async () => {
  await openProject(ws, 'alpha'); // floor 1
  expect((await ward(['task', 'open', 'only-task', '--project', '1'])).exitCode).toBe(0);
  expect((await ward(['task', 'close', 'f1t1', '--outcome', 'abandoned'])).exitCode).toBe(0);
  const listed = projectListShape.parse(
    JSON.parse((await ward(['project', 'list', '--all', '--json'])).stdout),
  );
  expect(listed.projects.find((p) => p.floor === 1)?.derived).toBe('closed');
  const refused = await ward(['project', 'open', 'beta', '--floor', '1']);
  expect(refused.exitCode).toBe(1);
  expect(refused.stderr).toContain('floor 1 is held by alpha (projects/1-alpha)');
});

test('a retired number is refused, naming the floor that retired it', async () => {
  // The ground floor relocated from floor 3 (design/0041-ground-floor/).
  const ground = projectRecordType('projects/0-workspace');
  const record = await readDocument(ws, ground);
  await writeDocument(ws, ground, { ...record, data: { ...record.data, previousFloor: 3 } });
  commitRecords(ws, 'Retire floor 3', 'projects/0-workspace');
  const refused = await ward(['project', 'open', 'beta', '--floor', '3']);
  expect(refused.exitCode).toBe(1);
  expect(refused.stderr).toContain(
    'floor 3 was retired by workspace (projects/0-workspace), which stood on floor 3 before ' +
      'it moved to floor 0',
  );
  expect(refused.stderr).toContain('the floor takes the next (4)');
  expect(await nextFloor(ws)).toBe(4);
});

test('a directory whose record does not read still spends its number', async () => {
  mkdirSync(join(ws, 'projects/6-broken'), { recursive: true });
  await Bun.write(join(ws, 'projects/6-broken/project.md'), '---\nfloor: [\n---\n');
  const refused = await ward(['project', 'open', 'beta', '--floor', '6']);
  expect(refused.exitCode).toBe(1);
  expect(refused.stderr).toContain(
    'floor 6 is spent by projects/6-broken, whose record does not read as floor 6',
  );
  // The allocator reads the same scan: it would never hand 6 out either.
  expect(await nextFloor(ws)).toBe(7);
  expect((await spentFloors(ws)).get(6)).toEqual([{ kind: 'directory', dir: 'projects/6-broken' }]);
});

// -- order ----------------------------------------------------------------------

test('floors list by number, not as text — project list, status, and their --json', async () => {
  for (const [slug, floor] of [
    ['seven', 7],
    ['ten', 10],
    ['two', 2],
    ['twelve', 12],
    ['nine', 9],
  ] as const) {
    await openProject(ws, slug, { floor });
  }
  const order = [0, 2, 7, 9, 10, 12];
  const listed = projectListShape.parse(
    JSON.parse((await ward(['project', 'list', '--json'])).stdout),
  );
  expect(listed.projects.map((p) => p.floor)).toEqual(order);
  const status = statusShape.parse(JSON.parse((await ward(['status', '--json'])).stdout));
  expect(status.projects.map((p) => p.floor)).toEqual(order);
  const human = (await ward(['project', 'list'])).stdout;
  expect([...human.matchAll(/floor (\d+) —/g)].map((m) => Number(m[1]))).toEqual(order);
});

// -- collisions -----------------------------------------------------------------

test('two machines that each open the next floor leave two on one number; doctor names both', async () => {
  const vm = `${ws}-vm`;
  git(scratch, 'clone', '--quiet', ws, vm);
  await openProject(vm, 'distill'); // the VM's floor 1
  await openProject(ws, 'rituals'); // the Mac's floor 1
  git(ws, 'pull', '--quiet', '--rebase', vm, 'HEAD');

  expect(floorDirs()).toEqual(['projects/0-workspace', 'projects/1-distill', 'projects/1-rituals']);
  const findings = await doctorFindings('floor collisions');
  expect(findings).toHaveLength(1);
  expect(findings[0]?.severity).toBe('warn');
  expect(findings[0]?.message).toContain(
    'floor 1 is held by 2 floors: projects/1-distill, projects/1-rituals — the number was ' +
      'handed out twice',
  );
  expect(findings[0]?.message).toContain('a verb given floor 1 reaches projects/1-distill');
  expect(findings[0]?.message).toContain(
    'The collision stands until all but one of them holds a number other than 1 — give the ' +
      'other a number never spent: ward project renumber projects/1-rituals N',
  );
  // Both floors are listed, in directory order, and the next floor clears both.
  const listed = projectListShape.parse(
    JSON.parse((await ward(['project', 'list', '--json'])).stdout),
  );
  expect(listed.projects.map((p) => p.slug)).toEqual(['workspace', 'distill', 'rituals']);
  expect(JSON.parse((await ward(['project', 'open', 'next', '--json'])).stdout).floor).toBe(2);
  // And the chosen number neither machine may take again.
  expect((await ward(['project', 'open', 'again', '--floor', '1'])).stderr).toContain(
    'floor 1 is held by distill (projects/1-distill)',
  );
});

test('a workspace with no shared number has no floor-collision finding', async () => {
  await openProject(ws, 'alpha');
  await openProject(ws, 'beta', { floor: 10 });
  expect(await doctorFindings('floor collisions')).toEqual([]);
});

// -- schema ----------------------------------------------------------------------

test('ward schema documents chosen on project open', async () => {
  const schema = JSON.parse((await ward(['schema', 'project', 'open'])).stdout);
  expect(schema.properties.chosen.type).toBe('boolean');
  expect(schema.required).toContain('chosen');
});

// -- setup ----------------------------------------------------------------------

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
  await preparedWorkspace(ws);
});

/** The CLI with no color, no forge, and no tmux. */
function ward(argv: string[]): Promise<CliResult> {
  return callWardEnv(argv, ws, {
    NO_COLOR: '1',
    WARD_GH: NO_GH,
    WARD_TMUX_BIN: '/nonexistent/tmux',
  });
}

function floorDirs(): string[] {
  return projectDirs(ws);
}

async function doctorFindings(check: string): Promise<{ severity: string; message: string }[]> {
  const doctor = JSON.parse((await ward(['doctor', '--json'])).stdout) as {
    workspace: { check: string; severity: string; message: string }[];
  };
  return doctor.workspace.filter((finding) => finding.check === check);
}

function git(cwd: string, ...args: string[]): void {
  const result = Bun.spawnSync(['git', '-C', cwd, ...args], {
    env: { ...process.env, ...GIT_ENV },
    timeout: 30_000,
  });
  if (result.exitCode !== 0) throw new Error(result.stderr.toString());
}
