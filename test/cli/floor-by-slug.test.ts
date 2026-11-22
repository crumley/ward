// A floor named by its slug (design/0088-floor-by-slug/): wherever a verb
// takes a floor, its number or its exact slug names it, and the verb receives
// the number. All digits is a number, whatever floor wears a numeric slug;
// anything else is a slug matched exactly, ignoring case, against every floor.
// A slug no floor wears is refused with the near ones; a slug two floors wear
// is refused naming each by number. The parser table first, then one verb per
// family through the CLI, in-process.
import { afterAll, beforeAll, expect, test } from 'bun:test';
import { join } from 'node:path';
import type { ProjectRecord } from '../../src/store/types.ts';
import {
  type FloorArg,
  FloorSlug,
  floorBySlug,
  parseFloorArg,
  resolveFloorArgs,
} from '../../src/workspace/floor-ref.ts';
import type { FoundProject } from '../../src/workspace/projects.ts';
import {
  applyGitTestEnv,
  type CliResult,
  callWardEnv,
  makeTempDir,
  NO_GH,
  removeDir,
} from '../helpers.ts';
import { preparedWorkspace } from '../prepared.ts';

// -- the parser -----------------------------------------------------------------

test.each<[string, FloorArg | 'refused']>([
  ['0', 0],
  ['7', 7],
  ['007', 7], // digits are a number, leading zeros and all
  ['2026', 2026], // even where a floor's slug is all digits
  ['brain3', new FloorSlug('brain3')],
  ['7-ward-development', new FloorSlug('7-ward-development')],
  ['Brain3', new FloorSlug('brain3')], // slugs are lowercase; the match ignores case
  ['-3', 'refused'],
  ['a_b', 'refused'],
  ['two words', 'refused'],
  ['', 'refused'],
])('parseFloorArg(%p)', (input, expected) => {
  const parsed = parseFloorArg(input);
  if (expected === 'refused') expect(parsed).toHaveProperty('error');
  else expect(parsed).toEqual(expected);
});

test.each<[string, number | string]>([
  ['alpha', 1],
  ['ALPHA', 1],
  ['workspace', 0],
  ['alpah', "no floor wears the slug 'alpah' — did you mean alpha (floor 1)?"],
  ['zzz', "no floor wears the slug 'zzz' (see: ward project list)"],
  // An open floor and a settled one on one slug, or two machines' collision.
  ['twin', "floor slug 'twin' is worn by 2 floors — floor 4 (active), floor 9 (closed);"],
])('floorBySlug(%p)', (slug, expected) => {
  const projects = [
    floor(0, 'workspace'),
    floor(1, 'alpha'),
    floor(4, 'twin'),
    floor(9, 'twin', 'closed'),
  ];
  if (typeof expected === 'number') expect(floorBySlug(projects, slug)).toBe(expected);
  else expect(() => floorBySlug(projects, slug)).toThrow(expected);
});

test('numbers cost nothing: the record is read only when a slug is given', async () => {
  const never = () => Promise.reject(new Error('the workspace was asked for'));
  const given = { action: 'x', floor: 3, to: undefined, slug: 'not-a-floor-ref' };
  expect(await resolveFloorArgs(given, never)).toBe(given);
});

// -- one verb per family --------------------------------------------------------

test('task: --project, --floor, --to name a floor by slug', async () => {
  expect(
    json(await ward(['task', 'open', 'sloped', '--project', 'alpha', '--json'])),
  ).toMatchObject({ address: 'f1t1' });
  const listed = json(await ward(['task', 'list', '--floor', 'Alpha', '--json'])) as {
    tasks: { address: string; floor: number }[];
  };
  expect(listed.tasks.map((task) => [task.address, task.floor])).toEqual([['f1t1', 1]]);
  await Bun.write(brief, '# Handed over\n');
  const sent = json(
    await ward(['task', 'dispatch', 'handed', '--to', 'beta', '--brief', brief, '--json']),
  );
  expect(sent).toMatchObject({ dispatch: { address: 'f2t1', to: 2 } }); // JSON keeps numbers
  const waiting = json(await ward(['task', 'dispatches', '--to', 'beta', '--json'])) as {
    dispatches: { address: string }[];
  };
  expect(waiting.dispatches.map((d) => d.address)).toEqual(['f2t1']);
});

test('project: FLOOR arguments take a slug', async () => {
  expect(json(await ward(['project', 'note', 'beta', 'learned', '--json']))).toMatchObject({
    floor: 2,
    slug: 'beta',
  });
  expect(json(await ward(['project', 'identity', 'workspace', '--json']))).toMatchObject({
    floor: 0,
  });
});

test('session: --floor takes a slug', async () => {
  const opened = json(
    await ward(['session', 'open', '--floor', 'beta', '--handle', 'claude:by-slug', '--json']),
  );
  expect(opened).toMatchObject({ scope: 'project', floor: 2 });
});

test('reflection: FLOOR takes a slug', async () => {
  expect(json(await ward(['reflection', 'packet', 'alpha', '--json']))).toMatchObject({
    floor: 1,
    slug: 'alpha',
  });
});

test('digits are a number even where a floor wears them as its slug', async () => {
  // Floor 3 wears the slug '42'; 42 is a number, and no floor stands on it.
  const refused = await ward(['project', 'note', '42', 'x']);
  expect(refused.exitCode).toBe(1);
  expect(refused.stderr).toContain('no project on floor 42');
});

test('an unknown slug is refused before the verb acts, offering the near ones', async () => {
  for (const argv of [
    ['task', 'open', 'lost', '--project', 'alpah', '--json'],
    ['session', 'resume', '--all', '--floor', 'alpah', '--json'],
  ]) {
    const refused = await ward(argv);
    expect(refused.exitCode).toBe(1);
    expect(refused.stdout).toBe('');
    expect(refused.stderr).toContain(
      "error: no floor wears the slug 'alpah' — did you mean alpha (floor 1)?",
    );
  }
  expect(json(await ward(['task', 'list', '--slug', 'lost', '--json']))).toMatchObject({
    tasks: [],
  });
});

test('a value that is neither is a usage error', async () => {
  const refused = await ward(['task', 'list', '--floor', 'a_b']);
  expect(refused.exitCode).toBe(1);
  expect(refused.stderr).toContain("'a_b' is neither a floor number nor a floor slug");
});

test('the shell feed never errors: a slug it cannot resolve is an empty feed', async () => {
  const feed = await ward(['shell', 'candidates', 'coordinators', '--floor', 'nowhere']);
  expect([feed.exitCode, feed.stdout, feed.stderr]).toEqual([0, '', '']);
});

// -- setup ----------------------------------------------------------------------

let scratch: string;
let ws: string;
let brief: string;

beforeAll(async () => {
  applyGitTestEnv();
  scratch = makeTempDir();
  brief = join(scratch, 'brief.md');
  ws = join(scratch, 'ws');
  await preparedWorkspace(ws);
  for (const slug of ['alpha', 'beta', '42']) {
    expect((await ward(['project', 'open', slug])).exitCode).toBe(0);
  }
});

afterAll(() => removeDir(scratch));

/** The CLI with no color, no forge, and no tmux. */
function ward(argv: string[]): Promise<CliResult> {
  return callWardEnv(argv, ws, {
    NO_COLOR: '1',
    WARD_GH: NO_GH,
    WARD_TMUX_BIN: '/nonexistent/tmux',
  });
}

function json(result: CliResult): unknown {
  if (result.exitCode !== 0) throw new Error(`ward failed (${result.exitCode}): ${result.stderr}`);
  return JSON.parse(result.stdout);
}

function floor(number: number, slug: string, state: 'active' | 'closed' = 'active'): FoundProject {
  return {
    dir: `projects/${number}-${slug}`,
    record: { floor: number, slug, state } as unknown as ProjectRecord,
  };
}
