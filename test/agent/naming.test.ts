// Names read from the records (design/0061-host-names-and-titles/): which
// floor a number names, what a session is, and what each host and window of
// a workspace is called now — derived per call, never stored.
import { afterAll, beforeEach, expect, test } from 'bun:test';
import { join } from 'node:path';
import { readNaming, refreshNames } from '../../src/agent/naming.ts';
import type { SessionRecord } from '../../src/store/types.ts';
import { createWorkspace } from '../../src/workspace/create.ts';
import { workspaceId } from '../../src/workspace/identity.ts';
import { GROUND_FLOOR, openProject } from '../../src/workspace/projects.ts';
import {
  findSession,
  openFloorSession,
  openSession,
  openWorkspaceSession,
} from '../../src/workspace/sessions.ts';
import { openTask } from '../../src/workspace/tasks.ts';
import { applyGitTestEnv, makeTempDir, removeDir } from '../helpers.ts';
import { fakeHost } from './fake-host.ts';

test('every scope reads as what it is: coordinator, helper, floor, task', async () => {
  await openProject(ws, 'alpha');
  await openTask(ws, 'fix-the-thing', { floor: 1 });
  const coordinator = await openWorkspaceSession(ws, undefined, HOSTED);
  const quiet = await openWorkspaceSession(ws, undefined, {
    ...hosted('q'),
    startedBy: coordinator.id,
  });
  const sweep = await openWorkspaceSession(ws, 'Sweep the worktrees', {
    ...hosted('s'),
    startedBy: coordinator.id,
  });
  const floor = await openFloorSession(ws, 1, 'Outstanding work', hosted('f'));
  const task = await openSession(ws, 'f1t1', 'build it', { handle: 'claude:t', host: 'tmux' });
  // Started by floor 1's session for the ground floor: placed beside its parent.
  const lineage = await openFloorSession(ws, GROUND_FLOOR, undefined, {
    ...hosted('l'),
    startedBy: floor.id,
  });
  const naming = await readNaming(ws);
  const label = async (record: SessionRecord) => naming.label(await findSession(ws, record.id));
  expect(await label(coordinator)).toBe('coord');
  expect(await label(quiet)).toBe('helper'); // the purpose Ward wrote for it names nothing
  expect(await label(sweep)).toBe('Sweep the worktrees');
  expect(await label(floor)).toBe('alpha'); // a purpose never displaces what the session is
  expect(await label(task)).toBe('t1 fix-the-thing');
  expect(await label(lineage)).toBe('🌊f0 workspace'); // another floor's, marked with its emoji
  // A floor's emoji leads its title, and its host wears its identity (0060).
  expect(naming.group(1)).toEqual({
    name: `${name}-f1-alpha`,
    title: `🌲 ${name} f1`,
    identity: { color: 'green', emoji: '🌲', label: 'f1 alpha' },
  });
  expect(naming.group(6)).toEqual({ name: `${name}-f6`, title: `${name} f6` });
  expect(naming.foreground(await findSession(ws, floor.id))).toBe(`🌲f1 alpha · ${name}`);
});

test('two sessions that would read the same are told apart; a foreground one never counts', async () => {
  const first = await openWorkspaceSession(ws, undefined, HOSTED);
  const foreground = await openWorkspaceSession(ws, undefined, { handle: 'claude:fg' });
  const only = await readNaming(ws);
  expect(only.label(await findSession(ws, first.id))).toBe('coord');
  const second = await openWorkspaceSession(ws, undefined, hosted('2'));
  const both = await readNaming(ws);
  expect(both.label(await findSession(ws, first.id))).toBe('coord 1');
  expect(both.label(await findSession(ws, second.id))).toBe('coord 3');
  expect(both.label(await findSession(ws, foreground.id))).toBe('coord');
});

test('a refresh renames only what is verifiably this workspace’s own, and never throws', async () => {
  const coordinator = await openWorkspaceSession(ws, undefined, HOSTED);
  const id = await workspaceId(ws);
  const ours = { name: 'ward-old-f0', stamp: { workspace: id, floor: 0 } };
  const window = (at: string, epoch: string, groups: (typeof ours)[]) => ({
    window: at,
    groups,
    tags: { session: coordinator.id, epoch },
    dead: false,
  });
  const host = fakeHost({
    windows: [
      window('@1', coordinator.openedAt, [ours]),
      window('@2', 'another-life', [ours]), // the tag, but not this launch: a stranger
      window('@3', coordinator.openedAt, [
        { name: 'ward-else-f0', stamp: { workspace: 'ws-elsewhere', floor: 0 } },
      ]),
    ],
    groups: [
      { name: 'ward-old-f0-v1', viewOf: id, clients: 1, windows: 1, created: 0 },
      { name: 'mine', clients: 1, windows: 1, created: 0 },
    ],
  });
  expect(await refreshNames(ws, host, id, 'tmux')).toEqual({
    renamed: [`ward-old-f0 is now ${name}-f0-workspace`],
    failed: [],
    // The host is dressed as its floor in the same pass, by its new name (0060).
    themed: [{ floor: 0, names: [`${name}-f0-workspace`] }],
  });
  expect(host.renames).toEqual([
    {
      groups: [
        {
          name: 'ward-old-f0',
          naming: {
            name: `${name}-f0-workspace`,
            title: `🌊 ${name} f0`,
            identity: { color: 'blue', emoji: '🌊', label: 'f0 workspace' },
          },
        },
      ],
      windows: [{ window: '@1', label: 'coord' }],
    },
  ]);
  // A host that cannot answer is passed over: a name is never why a launch stops.
  const silent = fakeHost({ unknown: 'timed out' });
  expect(await refreshNames(ws, silent, id, 'tmux')).toEqual({
    renamed: [],
    failed: [],
    themed: [],
  });
  expect(silent.renames).toEqual([]);
});

// -- scaffolding ------------------------------------------------------------------

const HOSTED = { handle: 'claude:h', host: 'tmux' } as const;
const hosted = (handle: string) => ({ handle: `claude:${handle}`, host: 'tmux' }) as const;

let scratch: string;
let ws: string;
let name: string;
let caseId = 0;

beforeEach(async () => {
  applyGitTestEnv();
  caseId += 1;
  scratch ??= makeTempDir();
  name = `ws-${caseId}`;
  ws = join(scratch, name);
  await createWorkspace(ws);
});

afterAll(() => {
  if (scratch !== undefined) removeDir(scratch);
});
