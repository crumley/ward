// Doctor's host findings (design/0031-detached-session-hosting/), against a
// FAKE host: one inventory joined against every session record. Each row
// fabricates one state and says what doctor must report — and every finding
// that names something live carries the command that would end it, for a
// human to run. Nothing here is ever ended: the fake records every close and
// placement it is asked for, and the suite asserts it was asked for none.
import { afterAll, beforeEach, expect, test } from 'bun:test';
import { join } from 'node:path';
import pkg from '../../package.json' with { type: 'json' };
import { hostFindings } from '../../src/agent/host-findings.ts';
import type { AgentHost, Resolved } from '../../src/agent/settings.ts';
import type { FoundWindow, InventoryGroup } from '../../src/host/host.ts';
import type { SessionRecord } from '../../src/store/types.ts';
import type { Finding } from '../../src/workspace/doctor.ts';
import { workspaceId } from '../../src/workspace/identity.ts';
import { openProject } from '../../src/workspace/projects.ts';
import {
  closeSession,
  openFloorSession,
  openWorkspaceSession,
} from '../../src/workspace/sessions.ts';
import { openTask } from '../../src/workspace/tasks.ts';
import { applyGitTestEnv, makeTempDir, removeDir } from '../helpers.ts';
import { preparedWorkspace } from '../prepared.ts';
import { type FakeHostOptions, fakeHost } from './fake-host.ts';

const unset: Resolved<AgentHost> = { provenance: 'default', value: 'foreground' };

interface Row {
  readonly name: string;
  /** Builds the host's state over the records it opened. */
  readonly arrange: () => Promise<FakeHostOptions>;
  readonly expected: Partial<Finding>[];
}

const rows: Row[] = [
  {
    name: 'a clean host: one ok line, never a list of nothing',
    arrange: async () => {
      const s = await hosted();
      return { windows: [win(s, ['f0'])] };
    },
    expected: [ok('host windows', '1 floor host, 1 window — every window answers')],
  },
  {
    name: 'a stray: a window whose session is closed — named, with its remedy',
    arrange: async () => {
      const s = await hosted();
      await closeSession(ws, s.id);
      return { windows: [win(s, ['f0'], '@4')] };
    },
    expected: [warn('host windows', 'stray window @4', 'its session is closed', 'fake kill @4')],
  },
  {
    name: 'a stray: a window of an earlier run of an open session',
    arrange: async () => {
      const s = await hosted();
      return { windows: [{ ...win(s, ['f0']), tags: { session: s.id, epoch: 'older' } }] };
    },
    expected: [
      warn('host windows', 'a window of an earlier run'),
      info('host windows', 'is not running (no tmux window)'),
    ],
  },
  {
    name: 'a stray nobody recorded, flagged when a client is viewing it',
    arrange: async () => ({
      windows: [
        {
          window: '@9',
          groups: [{ name: host('f0'), stamp: { workspace: id, floor: 0 } }],
          tags: { session: 'ghost-1@x', epoch: 'E' },
          dead: false,
        },
      ],
      groups: [floorHost('f0', { clients: 1 })],
    }),
    expected: [warn('host windows', 'no record of that session', 'a client is viewing')],
  },
  {
    name: 'gone is information — the normal state after any reboot',
    arrange: async () => {
      await hosted();
      return {};
    },
    expected: [info('host windows', 'is not running', 'attach re-creates it: ward session attach')],
  },
  {
    name: 'several gone at once — what a reboot leaves: each named, and one line for the bulk resume',
    arrange: async () => {
      await hosted();
      await hosted();
      return {};
    },
    expected: [
      info('host windows', 'workspace-1@test is not running', 'ward session attach'),
      info('host windows', 'workspace-2@test is not running', 'ward session attach'),
      info('host windows', '2 sessions are not running', 'ward session resume --all'),
    ],
  },
  {
    name: 'an exited run, with how it ended',
    arrange: async () => {
      const s = await hosted();
      return { windows: [{ ...win(s, ['f0']), dead: true, exitStatus: 3 }] };
    },
    expected: [info('host windows', 'exited 3, its window @1 kept')],
  },
  {
    name: 'a misplaced window: attach follows it',
    arrange: async () => {
      await openProject(ws, 'alpha');
      await openProject(ws, 'beta');
      const s = await hostedFloor(1);
      return {
        windows: [{ ...win(s, ['f2']) }],
      };
    },
    expected: [info('host windows', 'stands in', "not floor 1's host — attach follows it")],
  },
  {
    name: 'the coordinator in its own host alone, with other floor hosts standing: a clean bill',
    arrange: async () => {
      await openProject(ws, 'alpha');
      const c = await hosted();
      const f = await hostedFloor(1);
      return { windows: [win(c, ['f0'], '@1'), win(f, ['f1'], '@2')], groups: [floorHost('f3')] };
    },
    expected: [ok('host windows', '2 windows — every window answers to an open record')],
  },
  {
    name: "an older Ward's coordinator links: named, with the unlink for each, never undone",
    arrange: async () => {
      await openProject(ws, 'alpha');
      const c = await hosted();
      const f = await hostedFloor(1);
      return { windows: [win(c, ['f0', 'f1'], '@1'), win(f, ['f1'], '@2')] };
    },
    expected: [
      info(
        'host windows',
        `window @1 is also linked into ${host('f1')}`,
        'the links go when its run ends',
        `fake unlink @1 from ${host('f1')}`,
      ),
    ],
  },
  {
    name: 'an idle host: only an older link to the coordinator, so tmux keeps it — kill-session named',
    arrange: async () => {
      const c = await hosted();
      return { windows: [win(c, ['f0', 'f3'])] };
    },
    expected: [
      info('host windows', `also linked into ${host('f3')}`, `fake unlink @1 from ${host('f3')}`),
      info(
        'floor hosts',
        `${host('f3')} holds nothing of floor 3's own`,
        'only links to windows that live in another host',
        `fake end ${host('f3')}`,
      ),
    ],
  },
  {
    name: 'two hosts for one floor: the oldest is used, the other named with its remedy',
    arrange: async () => ({
      groups: [
        floorHost('f2', { created: 5 }),
        { ...floorHost('f2b', { created: 1 }), stamp: { workspace: id, floor: 2 } },
      ],
    }),
    expected: [
      warn(
        'floor hosts',
        'floor 2 has 2 hosts',
        `the oldest, ${host('f2b')}`,
        `fake end ${host('f2')}`,
      ),
    ],
  },
  {
    name: 'two windows of one run',
    arrange: async () => {
      const s = await hosted();
      return { windows: [win(s, ['f0'], '@1'), win(s, ['f0'], '@2')] };
    },
    expected: [warn('host windows', '2 windows of one run', 'fake kill @2')],
  },
  {
    name: 'a leftover view with no client',
    arrange: async () => ({
      groups: [{ name: `${host('f0')}-v1`, viewOf: id, clients: 0, windows: 1, created: 0 }],
    }),
    expected: [info('floor hosts', 'leftover view with no client', 'fake end')],
  },
  {
    name: "another workspace's hosts are reported and left alone",
    arrange: async () => ({
      groups: [
        {
          name: 'ward-other-f0',
          stamp: { workspace: 'ws-elsewhere', floor: 0 },
          clients: 0,
          windows: 1,
          created: 0,
        },
      ],
    }),
    expected: [info('floor hosts', "ward-other-f0 is not this workspace's", 'left alone')],
  },
  {
    name: 'a floor host whose windows work tasks, with no attending, is information (0089)',
    arrange: async () => {
      await openProject(ws, 'alpha');
      await openTask(ws, 'work', { floor: 1 });
      const working = await openFloorSession(ws, 1, 'on it', {
        handle: 'claude:t',
        host: 'tmux',
        task: 'f1t1',
      });
      return { windows: [win(working, ['f1'])] };
    },
    expected: [
      info(
        'host windows',
        "floor 1's host holds",
        'but no attending',
        'wsa 1 (ward session open --floor 1 --detach)',
      ),
    ],
  },
  {
    name: 'a floor host with its attending beside its task windows: a clean bill (0089)',
    arrange: async () => {
      await openProject(ws, 'alpha');
      await openTask(ws, 'work', { floor: 1 });
      const attending = await hostedFloor(1);
      const working = await openFloorSession(ws, 1, 'on it', {
        handle: 'claude:t',
        host: 'tmux',
        task: 'f1t1',
      });
      return { windows: [win(attending, ['f1'], '@1'), win(working, ['f1'], '@2')] };
    },
    expected: [ok('host windows', '1 floor host, 2 windows')],
  },
  {
    name: 'version skew is information',
    arrange: async () => ({ groups: [floorHost('f0', { version: '0.0.1' })] }),
    expected: [info('floor hosts', 'created by ward 0.0.1', `this is ${pkg.version}`)],
  },
  {
    name: 'a host that cannot answer is could-not-determine, never a clean bill',
    arrange: async () => ({ unknown: 'server not answering' }),
    expected: [warn('host windows', 'could not determine', 'this is not a clean bill')],
  },
  {
    name: "a run's identity in the host's own environment",
    arrange: async () => ({ inherited: ['HOME', 'CLAUDECODE', 'WARD_AGENT'] }),
    expected: [
      warn('host environment', 'carries CLAUDECODE, WARD_AGENT', 'fake forget CLAUDECODE'),
      ok('host windows', 'no floor host of this workspace is running'),
    ],
  },
];

test.each(rows)('$name', async (row) => {
  const host = fakeHost(await row.arrange());
  const findings = await hostFindings(ws, id, unset, {}, host);
  expect(findings[0]).toMatchObject({ check: 'session host', severity: 'ok' });
  const rest = findings.slice(1);
  for (const expected of row.expected) {
    expect(rest).toContainEqual(expect.objectContaining(expected));
  }
  expect(rest).toHaveLength(row.expected.length);
  expect(findings.some((finding) => finding.severity === 'error')).toBe(false);
  expect(host.closed).toEqual([]); // hygiene reports; it never ends anything
  expect(host.placed).toEqual([]);
});

test.each<[string, Resolved<AgentHost>, Finding['severity']]>([
  ['not configured: information — foreground is a complete technique', unset, 'info'],
  [
    'agent.host is tmux: a warning — every launch degrades',
    { provenance: 'global', value: 'tmux' },
    'warn',
  ],
])('an unusable tmux, %s', async (_, configured, severity) => {
  const findings = await hostFindings(ws, id, configured, {}, fakeHost({ unusable: 'not found' }));
  expect(findings).toEqual([
    { check: 'session host', severity, message: expect.stringContaining('tmux 3.2 or later') },
  ]);
});

// -- scaffolding ------------------------------------------------------------------

function ok(check: string, ...parts: string[]): Partial<Finding> {
  return { check, severity: 'ok', message: containing(parts) };
}
function info(check: string, ...parts: string[]): Partial<Finding> {
  return { check, severity: 'info', message: containing(parts) };
}
function warn(check: string, ...parts: string[]): Partial<Finding> {
  return { check, severity: 'warn', message: containing(parts) };
}
function containing(parts: string[]): string {
  return expect.stringMatching(new RegExp(parts.map(escapeRe).join('.*'))) as unknown as string;
}
function escapeRe(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

let scratch: string;
let ws: string;
let id: string;
let caseId = 0;

function host(floor: string): string {
  return `ward-w-${floor}`;
}

function floorHost(floor: string, over: Partial<InventoryGroup> = {}): InventoryGroup {
  return {
    name: host(floor),
    stamp: { workspace: id, floor: Number.parseInt(floor.slice(1), 10) },
    clients: 0,
    windows: 1,
    created: 0,
    version: pkg.version,
    ...over,
  };
}

function win(record: SessionRecord, floors: string[], window = '@1'): FoundWindow {
  return {
    window,
    groups: floors.map((floor) => ({
      name: host(floor),
      stamp: { workspace: id, floor: Number.parseInt(floor.slice(1), 10) },
    })),
    tags: { session: record.id, epoch: record.events?.at(-1)?.at ?? '' },
    dead: false,
  };
}

// Each hosted open is a run of its own: one handle is one open session (0084).
let runs = 0;

function hosted(): Promise<SessionRecord> {
  return openWorkspaceSession(ws, 'hosted', { handle: `claude:h-${++runs}`, host: 'tmux' });
}

function hostedFloor(floor: number): Promise<SessionRecord> {
  return openFloorSession(ws, floor, 'hosted', { handle: `claude:f-${++runs}`, host: 'tmux' });
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
