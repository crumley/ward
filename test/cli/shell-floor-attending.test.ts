// What `ward shell candidates coordinators --floor N` answers, which is what
// `wsa N` joins without asking: the floor's attending, alone, or nothing
// (design/0089-floor-attending/) — on floor 0 the coordinator. Derived from the
// records alone: the feed never asks the host. What wsa does with the answer
// is test/cli/shell.test.ts's.
import { afterAll, beforeEach, expect, test } from 'bun:test';
import { join } from 'node:path';
import { coordinatorCandidates } from '../../src/shell/candidates.ts';
import { openProject } from '../../src/workspace/projects.ts';
import {
  closeSession,
  nameSessionTask,
  openFloorSession,
  openWorkspaceSession,
} from '../../src/workspace/sessions.ts';
import { openTask } from '../../src/workspace/tasks.ts';
import { applyGitTestEnv, makeTempDir, removeDir } from '../helpers.ts';
import { preparedWorkspace } from '../prepared.ts';

const names = async (floor?: number) =>
  (await coordinatorCandidates(ws, floor)).map((candidate) => candidate.name);

test('a floor with an attending: the attending alone, however many sessions work tasks', async () => {
  await openTask(ws, 'work', { floor: 1 });
  const early = await openFloorSession(ws, 1, 'early', { ...launch(), task: 'f1t1' });
  const attending = await openFloorSession(ws, 1, 'attending', launch());
  const second = await openFloorSession(ws, 1, 'second', launch());
  expect(await names(1)).toEqual([attending.id]);
  // The second general session works a task now: still not what wsa N joins.
  await nameSessionTask(ws, second.id, 'f1t1');
  expect(await names(1)).toEqual([attending.id]);
  // The attending closed: the floor's only remaining sessions work tasks, so
  // there is none, and wsa N opens one.
  await closeSession(ws, attending.id);
  expect(await names(1)).toEqual([]);
  expect(early.id).not.toBe(attending.id);
});

test('a floor with no session open answers nothing', async () => {
  expect(await names(1)).toEqual([]);
});

test('floor 0: the coordinator, never a floor-0 session or a helper', async () => {
  const ground = await openFloorSession(ws, 0, 'ground', launch());
  expect(await names(0)).toEqual([]);
  const coordinator = await openWorkspaceSession(ws, 'first', launch());
  const later = await openWorkspaceSession(ws, 'second', launch());
  expect(await names(0)).toEqual([coordinator.id]);
  // Bare wsa still sees every coordinator, oldest first, and picks.
  expect(await names()).toEqual([coordinator.id, later.id]);
  expect(ground.floor).toBe(0);
});

test("an attending on another machine is not this machine's", async () => {
  const elsewhere = await openFloorSession(ws, 1, 'elsewhere', launch());
  const file = join(ws, 'projects/1-alpha/sessions', `${elsewhere.id}.md`);
  await Bun.write(
    file,
    (await Bun.file(file).text()).replace(/^machine: .*$/m, 'machine: elsewhere'),
  );
  expect(await names(1)).toEqual([]);
  const here = await openFloorSession(ws, 1, 'here', launch());
  expect(await names(1)).toEqual([here.id]);
});

// -- setup -----------------------------------------------------------------------

let scratch: string;
let ws: string;
let caseId = 0;
let handles = 0;

/** A launch as Ward records a detached one: its own handle, hosted in tmux. */
function launch(): { handle: string; host: 'tmux' } {
  handles += 1;
  return { handle: `claude:h-${handles}`, host: 'tmux' };
}

beforeEach(async () => {
  applyGitTestEnv();
  caseId += 1;
  scratch ??= makeTempDir();
  ws = join(scratch, `ws-${caseId}`);
  await preparedWorkspace(ws);
  await openProject(ws, 'alpha');
});

afterAll(() => {
  if (scratch !== undefined) removeDir(scratch);
});
