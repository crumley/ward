// A floor's reflection, through the spawned CLI (design/0069-floor-reflection/).
// The whole loop in a throwaway workspace: tasks close on a floor, the packet
// says what there is to read and where each session history stands, the
// vehicle opens, the agent's part is played by editing the notes in the
// worktree, the record is written on the branch, and the gated merge is what
// advances the cursor. Then the path where the human declines, the refusals,
// the hint at task close, and the format level the new shapes wait for.
import { afterAll, beforeAll, beforeEach, expect, test } from 'bun:test';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import {
  reflectionOpenShape,
  reflectionPacketShape,
  reflectionRecordShape,
  statusShape,
  taskCloseShape,
} from '../../src/cli/schema.ts';
import { transcriptPath } from '../../src/harness/claude.ts';
import { readDocument } from '../../src/store/document.ts';
import { FORMAT_LEVEL } from '../../src/store/format.ts';
import { reflectionRecordType } from '../../src/store/types.ts';
import { gitOrThrow } from '../../src/workspace/git.ts';
import { openProject } from '../../src/workspace/projects.ts';
import {
  REFLECTION_HINT_THRESHOLD,
  REFLECTION_SUMMARY_LIMIT,
} from '../../src/workspace/reflection.ts';
import { workspaceMainLine } from '../../src/workspace/steward.ts';
import { closeTask, openTask } from '../../src/workspace/tasks.ts';
import { applyGitTestEnv, makeTempDir, removeDir, runWard, runWardEnv } from '../helpers.ts';
import { preparedWorkspace } from '../prepared.ts';

const NOTES = 'projects/1-demo/notes.md';
const RECORD = 'projects/1-demo/reflections/1.md';
const BRANCH = 'steward/reflect-floor-1';
const COPY = 'floors/0-workspace/f0t1-steward-reflect-floor-1';
const TRANSCRIPT = 'a line of harness history that must never reach the record\n';

// -- the loop, end to end -----------------------------------------------------

test('close, packet, open, propose, record, preview, merge: the cursor advances with the merge', async () => {
  await floorWithHistory();

  // The packet before any vehicle: read-only, and it writes nothing.
  const head = gitOrThrow(ws, 'rev-parse', 'HEAD').stdout;
  const before = packet();
  expect(gitOrThrow(ws, 'rev-parse', 'HEAD').stdout).toBe(head);
  expect(before.since).toBeUndefined();
  expect(before.vehicle).toBeUndefined();
  expect(before.notes).toBe(NOTES);
  expect(before.editable).toEqual([NOTES, 'projects/0-workspace/notes.md']);
  expect(before.tasks.map((task) => [task.slug, task.outcome])).toEqual([
    ['read-here', 'delivered'],
    ['ran-elsewhere', 'abandoned'],
  ]);
  expect(before.tasks[0]?.dir).toBe('projects/1-demo/tasks/t1-read-here');
  expect(before.tasks[0]?.brief).toBe('projects/1-demo/tasks/t1-read-here/brief.md');
  expect(before.tasks[0]?.prs).toEqual(['https://example.com/pr/7']);
  // Each session: its trail, and where its history stands on THIS machine.
  expect(sessionsOf(before)).toEqual([
    ['read-here-1@test', 'closed', 'found'],
    ['read-here-2@test', 'closed', 'gone'],
    ['read-here-3@test', 'closed', 'unlocatable'],
    ['ran-elsewhere-1@other', 'closed', 'elsewhere'],
    ['f1-1@test', 'open', 'gone'],
  ]);
  const found = before.tasks[0]?.sessions[0];
  expect(found?.history).toEqual({
    standing: 'found',
    path: transcriptPath('here-1', ws, process.env),
    bytes: TRANSCRIPT.length,
  });
  expect(found?.events.map((event) => event.event)).toEqual(['opened', 'closed']);
  expect(before.unread).toEqual([
    'read-here-2@test',
    'read-here-3@test',
    'ran-elsewhere-1@other',
    'f1-1@test',
  ]);
  expect(before.open).toEqual([
    { address: 'f1t3', slug: 'still-open', state: 'active', openedAt: expect.any(String) },
  ]);

  // The vehicle: a ground-floor task marked as floor 1's reflection, and a
  // worktree of the workspace's own repository.
  const opened = reflectionOpenShape.parse(json(['reflection', 'open', '1', '--json']));
  expect(opened).toMatchObject({
    floor: 1,
    outcome: 'opened',
    task: 'f0t1',
    branch: BRANCH,
    path: COPY,
    tasks: 2,
  });
  expect(
    readFileSync(join(ws, 'projects/0-workspace/tasks/t1-reflect-floor-1/task.md'), 'utf8'),
  ).toContain('stewardship: reflection\nreflects: 1\n');
  // Opening again finds the same one.
  expect(reflectionOpenShape.parse(json(['reflection', 'open', '1', '--json']))).toMatchObject({
    outcome: 'reused',
    task: 'f0t1',
    branch: BRANCH,
  });

  // Work goes on while the reflection is read: a task closes after the
  // vehicle was cut. The copy is the window, so it waits for the next one.
  await closeTask(ws, 'f1t3', 'abandoned');
  expect(packet().tasks.map((task) => task.slug)).toEqual(['read-here', 'ran-elsewhere']);
  expect(packet().vehicle).toEqual({ task: 'f0t1', branch: BRANCH, path: COPY });

  // The agent's part: rewrite the notes in the copy, and hand over a summary.
  const notes = readFileSync(join(ws, COPY, NOTES), 'utf8');
  writeFileSync(join(ws, COPY, NOTES), `${notes}- 2026-11-16 — Name an owner at open.\n`);
  writeFileSync(join(scratch, 'summary.md'), '# What floor 1 learned\n\nName an owner.\n');
  const recorded = reflectionRecordShape.parse(
    json(['reflection', 'record', '1', join(scratch, 'summary.md'), '--json']),
  );
  expect(recorded).toMatchObject({
    number: 1,
    outcome: 'recorded',
    task: 'f0t1',
    branch: BRANCH,
    path: RECORD,
    tasks: 2,
    sessions: 5,
    changed: [NOTES],
  });
  expect(recorded.unread).toEqual(before.unread);
  expect(recorded.remaining.map((act) => act.step)).toEqual([
    'review',
    'merge',
    'close',
    'decline',
  ]);

  // One commit on the branch carries the notes and the record together; the
  // main line holds neither yet, and the root is clean.
  expect(
    gitOrThrow(ws, 'rev-list', '--count', `${workspaceMainLine(ws)}..${BRANCH}`).stdout.trim(),
  ).toBe('1');
  expect(gitOrThrow(join(ws, COPY), 'status', '--porcelain').stdout).toBe('');
  expect(existsSync(join(ws, RECORD))).toBe(false);
  expect(readFileSync(join(ws, NOTES), 'utf8')).toBe(notes);
  expect(gitOrThrow(ws, 'status', '--porcelain').stdout).toBe('');

  // What the record holds: ids and standings, the summary — no path, no text.
  const text = readFileSync(join(ws, COPY, RECORD), 'utf8');
  const record = (await readDocument(join(ws, COPY), reflectionRecordType('projects/1-demo', 1)))
    .data;
  expect(record).toEqual({
    type: 'reflection',
    floor: 1,
    number: 1,
    task: 'projects/0-workspace/tasks/t1-reflect-floor-1',
    machine: 'test',
    through: expect.any(String),
    tasks: [
      {
        dir: 'projects/1-demo/tasks/t1-read-here',
        outcome: 'delivered',
        closedAt: expect.any(String),
      },
      {
        dir: 'projects/1-demo/tasks/t2-ran-elsewhere',
        outcome: 'abandoned',
        closedAt: expect.any(String),
      },
    ],
    sessions: [
      { id: 'read-here-1@test', state: 'closed', history: 'found' },
      { id: 'read-here-2@test', state: 'closed', history: 'gone' },
      { id: 'read-here-3@test', state: 'closed', history: 'unlocatable' },
      { id: 'ran-elsewhere-1@other', state: 'closed', history: 'elsewhere' },
      { id: 'f1-1@test', state: 'open', history: 'gone' },
    ],
  });
  expect(text).toContain('# What floor 1 learned');
  expect(text).not.toContain(scratch); // no machine path
  expect(text).not.toContain('.jsonl');
  expect(text).not.toContain(TRANSCRIPT.trim());

  // Recording again replaces: same number, same interval, one more commit.
  writeFileSync(join(scratch, 'summary.md'), '# What floor 1 learned\n\nName an owner, early.\n');
  const again = reflectionRecordShape.parse(
    json(['reflection', 'record', '1', join(scratch, 'summary.md'), '--json']),
  );
  expect(again).toMatchObject({ number: 1, outcome: 'replaced', tasks: 2, sessions: 5 });
  expect(again.changed).toEqual([NOTES]);

  // The human's two acts: preview, then the gated merge.
  const preview = runWard(['workspace', 'merge', BRANCH, '--preview'], ws);
  expect(preview.stdout).toContain(NOTES);
  expect(preview.stdout).toContain(RECORD);
  expect(preview.stdout).toContain('2 files changed');
  // Until the merge the cursor has not moved: status still counts both.
  expect(unreflectedOnFloor1()).toBe(3);
  expect(runWard(['workspace', 'merge', BRANCH], ws).exitCode).toBe(0);
  expect(unreflectedOnFloor1()).toBe(1);
  expect(readFileSync(join(ws, NOTES), 'utf8')).toContain('Name an owner at open.');
  expect(runWard(['task', 'close', 'f0t1'], ws).exitCode).toBe(0);

  // The next reflection starts where this one reached: the task closed
  // meanwhile, and the floor session that was still open when it was read.
  const after = packet();
  expect(after.since).toEqual({ number: 1, through: expect.any(String), path: RECORD });
  expect(after.vehicle).toBeUndefined();
  expect(after.tasks.map((task) => task.slug)).toEqual(['still-open']);
  expect(after.floorSessions.map((session) => session.id)).toEqual(['f1-1@test']);
  // A reflection's own task is never something to reflect on.
  expect(packetOf(0).tasks).toEqual([]);
});

// -- declining ----------------------------------------------------------------

test('declined: never merged, the cursor stays and the next reflection covers the same work', async () => {
  await floorWithHistory();
  const before = packet();
  expect(runWard(['reflection', 'open', '1'], ws).exitCode).toBe(0);
  appendFileSync(join(ws, COPY, NOTES), '- 2026-11-16 — A lesson the human will not take.\n');
  writeFileSync(join(scratch, 'summary.md'), 'Not persuasive.\n');
  expect(runWard(['reflection', 'record', '1', join(scratch, 'summary.md')], ws).exitCode).toBe(0);

  // Declining is closing the task unmerged. Nothing of the proposal is on
  // the main line; the branch is left, as every stewardship branch is.
  expect(runWard(['task', 'close', 'f0t1', '--outcome', 'abandoned'], ws).exitCode).toBe(0);
  expect(existsSync(join(ws, RECORD))).toBe(false);
  expect(readFileSync(join(ws, NOTES), 'utf8')).not.toContain('will not take');
  expect(existsSync(join(ws, COPY))).toBe(false);

  const after = packet();
  expect(after.since).toBeUndefined();
  expect(after.tasks.map((task) => task.dir)).toEqual(before.tasks.map((task) => task.dir));

  // A new reflection of the floor is a new vehicle on a fresh branch, and it
  // is this floor's first reflection again.
  const reopened = reflectionOpenShape.parse(json(['reflection', 'open', '1', '--json']));
  expect(reopened.outcome).toBe('opened');
  expect(reopened.branch).not.toBe(BRANCH);
  expect(reopened.tasks).toBe(2);
  const recorded = reflectionRecordShape.parse(
    json(['reflection', 'record', '1', join(scratch, 'summary.md'), '--json']),
  );
  expect(recorded).toMatchObject({ number: 1, outcome: 'recorded', changed: [] });
});

// -- refusals -----------------------------------------------------------------

test('nothing closed, nothing to open: no vehicle is built for no work', async () => {
  await openProject(ws, 'demo');
  await openTask(ws, 'in-flight', { floor: 1 });
  const head = gitOrThrow(ws, 'rev-parse', 'HEAD').stdout;
  const refused = runWard(['reflection', 'open', '1', '--json'], ws);
  expect(refused.exitCode).toBe(1);
  expect(refused.stdout).toBe('');
  expect(refused.stderr).toContain('nothing to reflect on yet');
  expect(gitOrThrow(ws, 'rev-parse', 'HEAD').stdout).toBe(head);

  writeFileSync(join(scratch, 'summary.md'), 'A summary.\n');
  const unopened = runWard(['reflection', 'record', '1', join(scratch, 'summary.md')], ws);
  expect(unopened.exitCode).toBe(1);
  expect(unopened.stderr).toContain('no open reflection — open one first: ward reflection open 1');
  expect(runWard(['reflection', 'packet', '9'], ws).stderr).toContain('no project on floor 9');
});

test.each([
  ['an empty summary', '  \n', 'needs a summary'],
  ['a summary past the limit', 'x'.repeat(REFLECTION_SUMMARY_LIMIT + 1), 'holds at most'],
  ['front matter of its own', '---\ntype: reflection\n---\nbody\n', 'Ward writes the front matter'],
])('record refuses %s, writing nothing', async (_name, summary, says) => {
  await floorWithHistory();
  expect(runWard(['reflection', 'open', '1'], ws).exitCode).toBe(0);
  writeFileSync(join(scratch, 'bad.md'), summary);
  const refused = runWard(['reflection', 'record', '1', join(scratch, 'bad.md'), '--json'], ws);
  expect(refused.exitCode).toBe(1);
  expect(refused.stdout).toBe('');
  expect(refused.stderr).toContain(says);
  expect(existsSync(join(ws, COPY, RECORD))).toBe(false);
});

test('record refuses a branch that changes anything but the notes, committed or not', async () => {
  await floorWithHistory();
  expect(runWard(['reflection', 'open', '1'], ws).exitCode).toBe(0);
  const copy = join(ws, COPY);
  writeFileSync(join(scratch, 'summary.md'), 'A summary.\n');
  const record = () => runWard(['reflection', 'record', '1', join(scratch, 'summary.md')], ws);

  appendFileSync(join(copy, 'AGENTS.md'), 'an edit outside the set\n');
  writeFileSync(join(copy, 'projects/1-demo/extra.md'), 'a new file\n');
  const uncommitted = record();
  expect(uncommitted.exitCode).toBe(1);
  expect(uncommitted.stderr).toContain(
    `the reflection branch changes AGENTS.md, projects/1-demo/extra.md — a reflection may ` +
      `change only ${NOTES} and projects/0-workspace/notes.md; nothing was recorded`,
  );
  expect(existsSync(join(copy, RECORD))).toBe(false);

  // Committing the stray change does not launder it.
  gitOrThrow(copy, 'add', '-A');
  gitOrThrow(copy, 'commit', '-m', 'stray');
  expect(record().stderr).toContain('the reflection branch changes AGENTS.md');

  // Inside the copy itself the verb refuses like every mutation: it is the
  // enclosing workspace's act.
  const inside = runWard(['reflection', 'record', '1', join(scratch, 'summary.md')], copy);
  expect(inside.exitCode).toBe(1);
  expect(inside.stderr).toContain('stewardship copy');
});

// -- the hint at task close ---------------------------------------------------

test('task close says when a floor has enough unreflected work, and never before', async () => {
  await openProject(ws, 'demo');
  const hints: string[] = [];
  for (let n = 1; n <= REFLECTION_HINT_THRESHOLD; n++) {
    await openTask(ws, `job-${n}`, { floor: 1 });
    const closed = runWard(['task', 'close', `f1t${n}`, '--outcome', 'abandoned'], ws);
    expect(closed.exitCode).toBe(0);
    hints.push(closed.stdout.split('\n').find((line) => line.includes('reflection')) ?? '');
  }
  expect(hints).toEqual([
    ...Array.from({ length: REFLECTION_HINT_THRESHOLD - 1 }, () => ''),
    `floor 1 has ${REFLECTION_HINT_THRESHOLD} closed tasks no reflection has covered — ` +
      'see: ward reflection packet 1',
  ]);
  expect(runWard(['status'], ws).stdout).toContain(
    `· ${REFLECTION_HINT_THRESHOLD} closed tasks unreflected`,
  );

  // Under --json the hint is a field of the one document.
  const next = REFLECTION_HINT_THRESHOLD + 1;
  await openTask(ws, 'one-more', { floor: 1 });
  const doc = taskCloseShape.parse(
    json(['task', 'close', `f1t${next}`, '--outcome', 'abandoned', '--json']),
  );
  expect(doc.reflection).toEqual({
    floor: 1,
    unreflected: REFLECTION_HINT_THRESHOLD + 1,
    command: 'ward reflection packet 1',
  });

  // With the floor's reflection open the human has been told: no hint. And a
  // reflection's own close carries none.
  expect(runWard(['reflection', 'open', '1'], ws).exitCode).toBe(0);
  await openTask(ws, 'during', { floor: 1 });
  const during = taskCloseShape.parse(
    json(['task', 'close', `f1t${next + 1}`, '--outcome', 'abandoned', '--json']),
  );
  expect(during.reflection).toBeUndefined();
  const own = taskCloseShape.parse(
    json(['task', 'close', 'f0t1', '--outcome', 'abandoned', '--json']),
  );
  expect(own.reflection).toBeUndefined();
});

// -- the format level ---------------------------------------------------------

test('a workspace below the reflection level is told to upgrade before one opens', async () => {
  await floorWithHistory();
  expect(FORMAT_LEVEL).toBeGreaterThanOrEqual(2);
  const file = join(ws, 'workspace.md');
  writeFileSync(file, readFileSync(file, 'utf8').replace(/^format: \d+$/m, 'format: 1'));
  gitOrThrow(ws, 'commit', '-am', 'A workspace no upgrade has raised yet');
  const head = gitOrThrow(ws, 'rev-parse', 'HEAD').stdout;

  // Reading is not a new shape: the packet answers.
  expect(packet().tasks).toHaveLength(2);
  const refused = runWard(['reflection', 'open', '1'], ws);
  expect(refused.exitCode).toBe(1);
  expect(refused.stderr).toContain('this task record needs workspace format 2');
  expect(refused.stderr).toContain('raise it first, with: ward workspace upgrade');
  expect(gitOrThrow(ws, 'rev-parse', 'HEAD').stdout).toBe(head);
  expect(gitOrThrow(ws, 'status', '--porcelain').stdout).toBe('');
});

// -- setup ------------------------------------------------------------------

let scratch: string;
let ws: string;
let caseId = 0;
let claudeHome: string | undefined;

beforeAll(() => {
  applyGitTestEnv();
  scratch = makeTempDir();
  // Session histories are looked for under the harness's own home: a
  // throwaway one, so `found` is a file this suite wrote.
  claudeHome = process.env.CLAUDE_CONFIG_DIR;
  process.env.CLAUDE_CONFIG_DIR = join(scratch, 'claude-home');
});

beforeEach(async () => {
  caseId += 1;
  ws = join(scratch, `ws-${caseId}`);
  await preparedWorkspace(ws);
});

afterAll(() => {
  if (claudeHome === undefined) delete process.env.CLAUDE_CONFIG_DIR;
  else process.env.CLAUDE_CONFIG_DIR = claudeHome;
  removeDir(scratch);
});

/**
 * Floor 1 with finished work to reflect on: `read-here` closed delivered with
 * a brief, a PR and three sessions (history found, gone, and no handle);
 * `ran-elsewhere` closed abandoned, its one session on another machine;
 * `still-open` in flight; and the floor's own session, still open.
 */
async function floorWithHistory(): Promise<void> {
  await openProject(ws, 'demo');
  await openTask(ws, 'read-here', { floor: 1 });
  await openTask(ws, 'ran-elsewhere', { floor: 1 });
  await openTask(ws, 'still-open', { floor: 1 });
  const ok = (argv: string[], env?: Record<string, string>): void => {
    const result = env === undefined ? runWard(argv, ws) : runWardEnv(argv, ws, env);
    expect([argv.join(' '), result.stderr, result.exitCode]).toEqual([argv.join(' '), '', 0]);
  };
  ok(['session', 'open', 'f1t1', '--purpose', 'build it', '--handle', 'claude:here-1']);
  ok(['session', 'open', 'f1t1', '--purpose', 'fix it', '--handle', 'claude:here-2']);
  ok(['session', 'open', 'f1t1', '--purpose', 'no handle']);
  ok(['session', 'open', 'f1t2', '--purpose', 'far away', '--handle', 'claude:there-1'], {
    WARD_MACHINE: 'other',
    WARD_GH: '/dev/null/gh',
    NO_COLOR: '1',
  });
  ok(['session', 'open', '--floor', '1', '--purpose', 'the floor', '--handle', 'claude:floor-1']);
  const history = transcriptPath('here-1', ws, process.env);
  mkdirSync(dirname(history), { recursive: true });
  writeFileSync(history, TRANSCRIPT);
  writeFileSync(join(scratch, 'brief.md'), 'Build the thing.\n');
  ok(['task', 'brief', 'f1t1', join(scratch, 'brief.md')]);
  ok(['task', 'pr', 'f1t1', 'https://example.com/pr/7']);
  await closeTask(ws, 'f1t1', 'delivered');
  await closeTask(ws, 'f1t2', 'abandoned');
}

function json(argv: string[]): unknown {
  const result = runWard(argv, ws);
  expect([argv.join(' '), result.stderr, result.exitCode]).toEqual([argv.join(' '), '', 0]);
  return JSON.parse(result.stdout);
}

function packetOf(floor: number) {
  return reflectionPacketShape.parse(json(['reflection', 'packet', String(floor), '--json']));
}

function packet() {
  return packetOf(1);
}

function sessionsOf(doc: ReturnType<typeof packet>): [string, string, string][] {
  return [...doc.tasks.flatMap((task) => task.sessions), ...doc.floorSessions].map((session) => [
    session.id,
    session.state,
    session.history.standing,
  ]);
}

function unreflectedOnFloor1(): number | undefined {
  const doc = statusShape.parse(json(['status', '--all', '--json']));
  return doc.projects.find((project) => project.floor === 1)?.unreflected;
}
