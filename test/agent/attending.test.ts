// Which session is a floor's attending (design/0089-floor-attending/): the
// derivation, pure, over records built in place — nothing is stored, so the
// table is the whole rule. Where the attending's window stands is the
// conformance scenario's (test/host/tmux-scenarios.ts, `the-attending-leads`)
// and placement's (test/agent/attending-placement.test.ts).
import { expect, test } from 'bun:test';
import {
  attendingFloorOf,
  attendingOf,
  isAttending,
  isGeneralFloorSession,
} from '../../src/agent/placement.ts';
import type { SessionEvent, SessionRecord } from '../../src/store/types.ts';
import type { OpenSessionListing } from '../../src/workspace/sessions.ts';

interface Made {
  readonly id: string;
  readonly at: number;
  readonly floor?: number;
  readonly scope?: 'workspace' | 'project' | 'task';
  readonly parent?: string;
  readonly machine?: string | null;
  readonly state?: 'open' | 'closed';
  readonly events?: readonly SessionEvent['event'][];
}

function made(spec: Made): OpenSessionListing {
  const scope = spec.scope ?? (spec.floor === undefined ? 'workspace' : 'project');
  const openedAt = `2026-11-22T10:00:${String(spec.at).padStart(2, '0')}.000Z`;
  const record: SessionRecord = {
    type: 'session',
    id: spec.id,
    scope,
    ...(scope === 'project' ? { floor: spec.floor ?? 0 } : {}),
    ...(scope === 'task' ? { task: 't1' } : {}),
    purpose: 'p',
    workingDirectory: '.',
    ...(spec.machine === null ? {} : { machine: spec.machine ?? 'here' }),
    ...(spec.parent === undefined ? {} : { parent: spec.parent }),
    state: spec.state ?? 'open',
    events: [
      { event: 'opened', at: openedAt },
      ...(spec.events ?? []).map((event) => ({
        event,
        at: openedAt,
        ...(event === 'task-named' ? { task: 'f1t1-work' } : {}),
      })),
    ],
    openedAt,
  };
  const scopeDir =
    scope === 'workspace'
      ? ''
      : scope === 'project'
        ? `projects/${spec.floor}-x`
        : 'projects/1-x/tasks/t1-work';
  return { scopeDir, record };
}

interface Row {
  readonly name: string;
  readonly sessions: readonly Made[];
  readonly floor: number;
  readonly machine?: string;
  /** The attending's id, or undefined for none. */
  readonly attending: string | undefined;
}

const TABLE: Row[] = [
  {
    name: 'a floor with one general session: it is the attending',
    sessions: [{ id: 'f1-1@here', at: 1, floor: 1 }],
    floor: 1,
    attending: 'f1-1@here',
  },
  {
    name: 'several general sessions: the earliest opened',
    sessions: [
      { id: 'f1-3@here', at: 5, floor: 1 },
      { id: 'f1-2@here', at: 2, floor: 1 },
    ],
    floor: 1,
    attending: 'f1-2@here',
  },
  {
    name: 'opened in the same instant: the lower session number',
    sessions: [
      { id: 'f1-10@here', at: 2, floor: 1 },
      { id: 'f1-9@here', at: 2, floor: 1 },
    ],
    floor: 1,
    attending: 'f1-9@here',
  },
  {
    name: 'a session opened with a task (--task, --new-task) is a task session, however early',
    sessions: [
      { id: 'f1-1@here', at: 1, floor: 1, events: ['task-named'] },
      { id: 'f1-2@here', at: 2, floor: 1 },
    ],
    floor: 1,
    attending: 'f1-2@here',
  },
  {
    name: 'a session that named a task and set it down stays a task session',
    sessions: [
      { id: 'f1-1@here', at: 1, floor: 1, events: ['task-named', 'task-cleared'] },
      { id: 'f1-2@here', at: 2, floor: 1 },
    ],
    floor: 1,
    attending: 'f1-2@here',
  },
  {
    name: 'only task sessions open: the floor has no attending',
    sessions: [{ id: 'f1-1@here', at: 1, floor: 1, events: ['task-named'] }],
    floor: 1,
    attending: undefined,
  },
  {
    name: 'a closed session is no one: the next general session is the attending',
    sessions: [
      { id: 'f1-1@here', at: 1, floor: 1, state: 'closed' },
      { id: 'f1-2@here', at: 2, floor: 1 },
    ],
    floor: 1,
    attending: 'f1-2@here',
  },
  {
    name: "another floor's session is not this floor's",
    sessions: [{ id: 'f2-1@here', at: 1, floor: 2 }],
    floor: 1,
    attending: undefined,
  },
  {
    name: 'floor 0: the coordinator, not a floor-0 session opened before it',
    sessions: [
      { id: 'f0-1@here', at: 1, floor: 0 },
      { id: 'workspace-2@here', at: 2 },
    ],
    floor: 0,
    attending: 'workspace-2@here',
  },
  {
    name: 'floor 0: the earliest coordinator; a helper (a session started) is not one',
    sessions: [
      { id: 'workspace-1@here', at: 3 },
      { id: 'workspace-2@here', at: 1, parent: 'workspace-1@here' },
      { id: 'workspace-3@here', at: 5 },
    ],
    floor: 0,
    attending: 'workspace-1@here',
  },
  {
    name: 'floor 0 with no coordinator open has no attending, whatever floor-0 sessions stand',
    sessions: [{ id: 'f0-1@here', at: 1, floor: 0 }],
    floor: 0,
    attending: undefined,
  },
  {
    name: 'per machine: the earliest on THIS machine, not an earlier one elsewhere',
    sessions: [
      { id: 'f1-1@there', at: 1, floor: 1, machine: 'there' },
      { id: 'f1-2@here', at: 2, floor: 1 },
    ],
    floor: 1,
    machine: 'here',
    attending: 'f1-2@here',
  },
  {
    name: 'a record from before machines were recorded counts on every machine',
    sessions: [
      { id: 'f1-1', at: 1, floor: 1, machine: null },
      { id: 'f1-2@here', at: 2, floor: 1 },
    ],
    floor: 1,
    machine: 'here',
    attending: 'f1-1',
  },
];

test.each(TABLE)('the attending: $name', ({ sessions, floor, machine, attending }) => {
  const all = sessions.map(made);
  expect(attendingOf(all, floor, machine ?? 'here')?.record.id).toBe(attending);
  // isAttending agrees, asked of each of this floor's sessions on this machine.
  for (const listing of all) {
    const { record } = listing;
    if (attendingFloorOf(record) !== floor) continue;
    if (record.machine !== 'here' && record.machine !== undefined) continue;
    expect(isAttending(record, all)).toBe(record.id === attending);
  }
});

test('what could be an attending: the coordinator for floor 0, a general floor session above it', () => {
  const of = (spec: Made) => attendingFloorOf(made(spec).record);
  expect(of({ id: 'workspace-1@here', at: 1 })).toBe(0);
  expect(of({ id: 'workspace-2@here', at: 1, parent: 'workspace-1@here' })).toBeUndefined();
  expect(of({ id: 'f3-1@here', at: 1, floor: 3 })).toBe(3);
  expect(of({ id: 'f0-1@here', at: 1, floor: 0 })).toBeUndefined();
  expect(of({ id: 'f3-2@here', at: 1, floor: 3, events: ['task-named'] })).toBeUndefined();
  expect(of({ id: 't1-1@here', at: 1, scope: 'task' })).toBeUndefined();
  expect(isGeneralFloorSession(made({ id: 'f0-1@here', at: 1, floor: 0 }).record)).toBe(true);
});

test('each machine has its own attending: two machines, one floor', () => {
  const all = [
    made({ id: 'f1-1@there', at: 1, floor: 1, machine: 'there' }),
    made({ id: 'f1-2@here', at: 2, floor: 1 }),
    made({ id: 'f1-3@here', at: 3, floor: 1 }),
  ];
  expect(all.map(({ record }) => isAttending(record, all))).toEqual([true, true, false]);
  expect(attendingOf(all, 1, 'there')?.record.id).toBe('f1-1@there');
});
