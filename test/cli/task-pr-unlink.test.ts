// `ward task pr --unlink` (design/0046-task-pr-unlink/): a PR withdrawn from
// the work leaves the task's PR set, so the close reads the set that actually
// delivered. Through the spawned CLI, with the forge faked (WARD_GH).
import { afterAll, beforeEach, expect, test } from 'bun:test';
import { join } from 'node:path';
import { taskMutationShape } from '../../src/cli/schema.ts';
import {
  applyGitTestEnv,
  makeTempDir,
  removeDir,
  runWard,
  runWardEnv,
  writeFakeGh,
} from '../helpers.ts';

const KEPT = 'https://example.com/x/pull/1';
const WITHDRAWN = 'https://example.com/x/pull/2';

test('--unlink takes one PR out of the set, and the journal says so', () => {
  runWard(['task', 'pr', 'f0t1', KEPT], ws);
  runWard(['task', 'pr', 'f0t1', WITHDRAWN], ws);

  const result = runWard(['task', 'pr', '--unlink', 'f0t1', WITHDRAWN], ws);
  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain(`unlinked ${WITHDRAWN} from f0t1 (1 in the set)`);

  const log = Bun.spawnSync(['git', '-C', ws, 'log', '--format=%s', '-1']).stdout.toString();
  expect(log.trim()).toBe('Unlink PR from task f0t1 (ward 0.1.0)');
});

test('--unlink --json: the task mutation document, with the set as it now stands', () => {
  runWard(['task', 'pr', 'f0t1', KEPT], ws);
  runWard(['task', 'pr', 'f0t1', WITHDRAWN], ws);

  const result = runWard(['task', 'pr', 'f0t1', WITHDRAWN, '--unlink', '--json'], ws);
  expect(result.exitCode).toBe(0);
  const document = taskMutationShape.parse(JSON.parse(result.stdout));
  expect(document).toMatchObject({ address: 'f0t1', prs: [KEPT] });
});

test('unlinking a URL the task does not carry is refused, naming the set', () => {
  runWard(['task', 'pr', 'f0t1', KEPT], ws);

  const result = runWard(['task', 'pr', '--unlink', 'f0t1', WITHDRAWN], ws);
  expect(result.exitCode).toBe(1);
  expect(result.stdout).toBe('');
  expect(result.stderr).toContain(`f0t1 has no linked PR ${WITHDRAWN} — its PR set: ${KEPT}`);
});

test('a withdrawn PR gates a delivered close until it is unlinked', () => {
  const gh = writeFakeGh(scratch, `gh-unlink-${caseId}`, {
    auth: 'ok',
    responses: { [WITHDRAWN]: { state: 'CLOSED' } },
  });
  runWard(['task', 'pr', 'f0t1', WITHDRAWN], ws);

  const gated = runWardEnv(['task', 'close', 'f0t1'], ws, { NO_COLOR: '1', WARD_GH: gh });
  expect(gated.exitCode).toBe(1);
  expect(gated.stderr).toContain('a linked PR was closed without merging');

  expect(runWard(['task', 'pr', '--unlink', 'f0t1', WITHDRAWN], ws).exitCode).toBe(0);
  const closed = runWardEnv(['task', 'close', 'f0t1'], ws, { NO_COLOR: '1', WARD_GH: gh });
  expect(closed.exitCode).toBe(0);
  expect(closed.stdout).toContain('Task f0t1 closed — delivered.');
});

// -- scaffolding ------------------------------------------------------------------

let scratch: string;
let ws: string;
let caseId = 0;

beforeEach(() => {
  applyGitTestEnv();
  caseId += 1;
  scratch ??= makeTempDir();
  ws = join(scratch, `ws-${caseId}`);
  expect(runWard(['workspace', 'create', ws], scratch).exitCode).toBe(0);
  expect(runWard(['task', 'open', 'feature', '--project', '0'], ws).exitCode).toBe(0);
});

afterAll(() => {
  if (scratch !== undefined) removeDir(scratch);
});
