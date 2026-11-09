// The legacy bare task's full address (design/0053-legacy-task-address/): a
// task under `tasks/` is `legacy-t<room>`, every task-addressed verb accepts
// it, and the shorthand's ambiguity refusal names the legacy candidate by it —
// in a workspace shaped like the one that exposed the gap, where two floors
// reuse the legacy task's room. Through the spawned CLI.
import { afterAll, beforeAll, beforeEach, expect, test } from 'bun:test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { taskMutationShape } from '../../src/cli/schema.ts';
import { writeDocument } from '../../src/store/document.ts';
import { type TaskRecord, taskRecordType } from '../../src/store/types.ts';
import { createWorkspace } from '../../src/workspace/create.ts';
import { openProject } from '../../src/workspace/projects.ts';
import { openTask } from '../../src/workspace/tasks.ts';
import { applyGitTestEnv, GIT_ENV, makeTempDir, removeDir, runWard } from '../helpers.ts';

const URL = 'https://example.com/x/pull/67';
const AMBIGUOUS =
  't2 is ambiguous — f1t2 (statement-ingest), f2t2 (intent-extraction), ' +
  'legacy-t2 (multiplexer-seam-design); name one';

test('the shorthand refuses, naming the legacy candidate by the spelling that works', () => {
  for (const argv of [
    ['task', 'show', 't2'],
    ['task', 'pr', 't2', URL],
    ['task', 'close', 't2', '--outcome', 'abandoned'],
  ]) {
    const result = runWard(argv, ws);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain(AMBIGUOUS);
  }
});

test('show answers to the legacy address, case-folded', () => {
  for (const address of ['legacy-t2', 'LEGACY-T2']) {
    const result = runWard(['task', 'show', address], ws);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('legacy-t2 multiplexer-seam-design');
    expect(result.stdout).toContain('legacy bare task (no floor)');
  }
});

test('pr links and unlinks through the legacy address, and the journal names it', () => {
  const linked = runWard(['task', 'pr', 'legacy-t2', URL, '--json'], ws);
  expect(linked.exitCode).toBe(0);
  expect(taskMutationShape.parse(JSON.parse(linked.stdout))).toMatchObject({
    code: 't2',
    address: 'legacy-t2',
    prs: [URL],
  });
  expect(lastSubject()).toBe('Link PR to task legacy-t2 (ward 0.1.0)');

  const unlinked = runWard(['task', 'pr', '--unlink', 'legacy-t2', URL], ws);
  expect(unlinked.exitCode).toBe(0);
  expect(unlinked.stdout).toContain(`unlinked ${URL} from legacy-t2`);
});

test('task list --json speaks the legacy address, and every address it gives resolves', () => {
  const listed = JSON.parse(runWard(['task', 'list', '--json'], ws).stdout) as {
    tasks: { address: string; slug: string }[];
  };
  expect(listed.tasks.find((task) => task.slug === 'multiplexer-seam-design')?.address).toBe(
    'legacy-t2',
  );
  for (const { address, slug } of listed.tasks) {
    const shown = runWard(['task', 'show', address], ws);
    expect(shown.exitCode).toBe(0);
    expect(shown.stdout).toContain(`${address} ${slug}`);
  }
});

test('close takes the legacy address; closed, it is unaddressable by either form', () => {
  const closed = runWard(['task', 'close', 'legacy-t2', '--outcome', 'abandoned'], ws);
  expect(closed.exitCode).toBe(0);
  expect(closed.stdout).toContain('Task legacy-t2 closed — abandoned.');

  const again = runWard(['task', 'close', 'legacy-t2', '--outcome', 'abandoned'], ws);
  expect(again.exitCode).toBe(1);
  expect(again.stderr).toContain(
    'no open task at legacy-t2 — the legacy pool (tasks/) holds no open task in room 2',
  );
  expect(runWard(['task', 'pause', 'legacy-t2'], ws).exitCode).toBe(1);
  // The shorthand no longer counts it: only the two floors' rooms are candidates.
  const bare = runWard(['task', 'pause', 't2'], ws);
  expect(bare.stderr).toContain(
    't2 is ambiguous — f1t2 (statement-ingest), f2t2 (intent-extraction); name one',
  );
});

test('a room the legacy pool never held is refused as the legacy pool, not a floor', () => {
  const result = runWard(['task', 'pr', 'legacy-t9', URL], ws);
  expect(result.exitCode).toBe(1);
  expect(result.stderr).toContain(
    'no open task at legacy-t9 — the legacy pool (tasks/) holds no open task in room 9',
  );
});

// -- setup ------------------------------------------------------------------
// Two floors whose second rooms reuse the legacy task's `t2` — the collision
// that left the legacy task with no spelling that named it.

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
  await createWorkspace(ws);
  await openProject(ws, 'ledger'); // floor 1
  await openProject(ws, 'intent'); // floor 2
  for (const [floor, slug] of [
    [1, 'ledger-setup'],
    [1, 'statement-ingest'],
    [2, 'intent-setup'],
    [2, 'intent-extraction'],
  ] as const) {
    await openTask(ws, slug, { floor });
  }
  await seedLegacyTask(ws, 2, 'multiplexer-seam-design');
  git('add', '-A');
  git('commit', '-m', 'a legacy bare task from before the ground floor');
});

/** A legacy bare task written straight into `tasks/`, as an older ward left it. */
async function seedLegacyTask(root: string, room: number, slug: string): Promise<void> {
  const dir = `tasks/t${room}-${slug}`;
  mkdirSync(join(root, dir), { recursive: true });
  const record: TaskRecord = {
    type: 'task',
    code: `t${room}`,
    slug,
    state: 'active',
    prs: [],
    openedAt: '2026-08-24T01:35:00.278Z',
  };
  await writeDocument(root, taskRecordType(dir), { data: record, body: 'a task from before' });
}

function git(...args: string[]): void {
  const result = Bun.spawnSync(['git', '-C', ws, ...args], { env: { ...process.env, ...GIT_ENV } });
  if (result.exitCode !== 0) throw new Error(result.stderr.toString());
}

function lastSubject(): string {
  return Bun.spawnSync(['git', '-C', ws, 'log', '--format=%s', '-1'], {
    env: { ...process.env, ...GIT_ENV },
  })
    .stdout.toString()
    .trim();
}
