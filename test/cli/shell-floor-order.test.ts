// The order `ward shell candidates coordinators --floor N` lists a floor's
// sessions in, which is the order `wsa N` takes them: it joins the first and
// never asks (design/0079-wsa-floor-first-window/). Against a FAKE host, so
// what is decided from what the host answers is all that is under test; the
// real tmux's window index reaching FoundGroup is the conformance
// transcripts' (test/host/tmux-conformance-live.test.ts), and what wsa does
// with the first line is test/cli/shell.test.ts's.
import { afterAll, beforeEach, expect, test } from 'bun:test';
import { join } from 'node:path';
import type { FoundWindow } from '../../src/host/host.ts';
import { coordinatorCandidates } from '../../src/shell/candidates.ts';
import type { SessionRecord } from '../../src/store/types.ts';
import { workspaceId } from '../../src/workspace/identity.ts';
import { openProject } from '../../src/workspace/projects.ts';
import { openFloorSession, openWorkspaceSession } from '../../src/workspace/sessions.ts';
import { type FakeHostOptions, fakeHost } from '../agent/fake-host.ts';
import { applyGitTestEnv, makeTempDir, removeDir } from '../helpers.ts';
import { preparedWorkspace } from '../prepared.ts';

interface OrderCase {
  readonly name: string;
  /** What the host holds, given the floor's three sessions in the order they were opened. */
  readonly host: (s: readonly SessionRecord[]) => FakeHostOptions;
  /** The feed's order, as indexes into the sessions opened. */
  readonly order: readonly number[];
}

const ORDER: OrderCase[] = [
  {
    name: 'windows standing in the floor host come left to right, not in the order opened',
    host: (s) => ({ windows: [at(s[0], 4), at(s[1], 2), at(s[2], 3)] }),
    order: [1, 2, 0],
  },
  {
    name: 'a window kept dead still stands where it is, ahead of a session with none',
    host: (s) => ({ windows: [{ ...at(s[2], 5), dead: true, exitStatus: 1 }] }),
    order: [2, 0, 1],
  },
  {
    name: 'after a reboot no window stands: lowest session number first',
    host: () => ({}),
    order: [0, 1, 2],
  },
  {
    name: 'a host that cannot be asked leaves the lowest number first — the feed still answers',
    host: () => ({ unknown: 'tmux is not answering' }),
    order: [0, 1, 2],
  },
  {
    name: 'a window from an earlier launch is not the session’s own: it stands nowhere',
    host: (s) => ({
      windows: [{ ...at(s[0], 1), tags: { session: s[0]?.id ?? '', epoch: 'old' } }],
    }),
    order: [0, 1, 2],
  },
  {
    name: 'where a window stands in ANOTHER floor’s host says nothing about this one',
    host: (s) => ({ windows: [at(s[2], 1, 2), at(s[1], 6)] }),
    order: [1, 0, 2],
  },
];

test.each(ORDER)('floor order: $name', async ({ host, order }) => {
  const sessions = await floorSessions();
  const fake = fakeHost(host(sessions));
  const found = await coordinatorCandidates(ws, 1, () => fake);
  expect(found.map((c) => c.name)).toEqual(order.map((i) => sessions[i]?.id ?? ''));
});

test('session numbers compare as numbers: f1-10 comes after f1-9', async () => {
  await openProject(ws, 'alpha');
  const opened: SessionRecord[] = [];
  for (let n = 1; n <= 10; n += 1) opened.push(await openFloorSession(ws, 1, `s${n}`, launch()));
  const found = await coordinatorCandidates(ws, 1, () => fakeHost());
  expect(found.map((c) => c.name).slice(-2)).toEqual(['f1-9@test', 'f1-10@test']);
});

test('a floor of foreground sessions never asks the host', async () => {
  await openProject(ws, 'alpha');
  await openFloorSession(ws, 1, 'in a terminal', { handle: 'claude:fg' });
  const fake = fakeHost();
  expect((await coordinatorCandidates(ws, 1, () => fake)).map((c) => c.cue)).toEqual([
    'in a terminal',
  ]);
  expect(fake.finds).toBe(0);
});

test('the coordinators keep the order they were opened in: bare wsa still picks', async () => {
  const first = await openWorkspaceSession(ws, 'first', launch());
  const second = await openWorkspaceSession(ws, 'second', launch());
  const fake = fakeHost({ windows: [at(second, 0, 0), at(first, 3, 0)] });
  const found = await coordinatorCandidates(ws, undefined, () => fake);
  expect(found.map((c) => c.name)).toEqual([first.id, second.id]);
  expect(fake.finds).toBe(0);
});

// -- setup -----------------------------------------------------------------------

let scratch: string;
let ws: string;
let id: string;
let caseId = 0;
let handles = 0;

/** Floor 1 with three hosted sessions, opened in id order. */
async function floorSessions(): Promise<SessionRecord[]> {
  await openProject(ws, 'alpha');
  const opened: SessionRecord[] = [];
  for (const purpose of ['one', 'two', 'three']) {
    opened.push(await openFloorSession(ws, 1, purpose, launch()));
  }
  return opened;
}

/** A launch as Ward records a detached one: its own handle, hosted in tmux. */
function launch(): { handle: string; host: 'tmux' } {
  handles += 1;
  return { handle: `claude:h-${handles}`, host: 'tmux' };
}

/** The session's own window, standing at `index` in floor `floor`'s host. */
function at(record: SessionRecord | undefined, index: number, floor = 1): FoundWindow {
  return {
    window: `@${index + 10 * floor}`,
    groups: [{ name: `host-${floor}`, stamp: { workspace: id, floor }, index }],
    tags: { session: record?.id ?? '', epoch: record?.events?.at(-1)?.at ?? '' },
    dead: false,
  };
}

beforeEach(async () => {
  applyGitTestEnv();
  caseId += 1;
  scratch ??= makeTempDir();
  ws = join(scratch, `ws-${caseId}`);
  await preparedWorkspace(ws);
  id = await workspaceId(ws);
});

afterAll(() => {
  if (scratch !== undefined) removeDir(scratch);
});
