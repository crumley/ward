// `ward session resume --all` (design/0068-bulk-session-resume/), against a
// FAKE host: what the plan says of each open session and in what order, that
// planning writes nothing, what enacting attempts and how one failure leaves
// the rest alone, and which flag combinations the verb refuses. The real
// tmux — a server killed under two floors and a coordinator, then planned,
// enacted, and enacted again — is test/host/tmux-live.test.ts's.
import { afterAll, afterEach, beforeEach, expect, test } from 'bun:test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { LiveState } from '../../src/agent/host.ts';
import {
  enactResumeAll,
  leftBroken,
  type PlanStep,
  planResumeAll,
  tally,
} from '../../src/agent/resume-all.ts';
import type { LaunchedSession } from '../../src/agent/run.ts';
import { sessionResumeAllShape } from '../../src/cli/schema.ts';
import { mungeCwd } from '../../src/harness/claude.ts';
import type { FoundWindow } from '../../src/host/host.ts';
import type { SessionRecord } from '../../src/store/types.ts';
import { gitOrThrow } from '../../src/workspace/git.ts';
import { workspaceId } from '../../src/workspace/identity.ts';
import { GROUND_FLOOR, openProject } from '../../src/workspace/projects.ts';
import {
  closeSession,
  findSession,
  openFloorSession,
  openSession,
  openWorkspaceSession,
} from '../../src/workspace/sessions.ts';
import { openTask } from '../../src/workspace/tasks.ts';
import { applyGitTestEnv, callWard, makeTempDir, removeDir } from '../helpers.ts';
import { preparedWorkspace } from '../prepared.ts';
import { type FakeHostOptions, fakeHost } from './fake-host.ts';

// -- the plan: one step per open hosted session ------------------------------

interface StepCase {
  readonly name: string;
  /** Whether the harness still has the run's history on this machine. */
  readonly history: boolean;
  /** The machine the record names; this machine is `test`. */
  readonly ranOn?: string;
  readonly handle?: string;
  readonly host: (session: SessionRecord) => FakeHostOptions;
  readonly step: PlanStep;
  readonly says: string;
}

const STEPS: StepCase[] = [
  {
    name: 'no window, history here',
    history: true,
    host: () => ({}),
    step: 'resume',
    says: 'not running (no tmux window)',
  },
  {
    name: 'a dead window kept from a run that ended, history here',
    history: true,
    host: (s) => ({ windows: [{ ...own(s, 0), dead: true, exitStatus: 3 }] }),
    step: 'resume',
    says: 'its last run exited 3, window @1 kept',
  },
  {
    name: 'a live window of its own',
    history: true,
    host: (s) => ({ windows: [own(s, 0)] }),
    step: 'live',
    says: 'running in',
  },
  {
    name: 'a live window, whatever became of the history',
    history: false,
    host: (s) => ({ windows: [own(s, 0)] }),
    step: 'live',
    says: 'window @1',
  },
  {
    name: 'no window and no history, on the machine it ran on',
    history: false,
    host: () => ({}),
    step: 'gone',
    says: 'no harness history on test — cannot be resumed',
  },
  {
    name: "no window and no history, another machine's session",
    history: false,
    ranOn: 'laptop',
    host: () => ({}),
    step: 'elsewhere',
    says: 'ran on laptop — resume it there',
  },
  {
    name: "another machine's session whose history was carried here",
    history: true,
    ranOn: 'laptop',
    host: () => ({}),
    step: 'resume',
    says: 'not running',
  },
  {
    name: 'a host that cannot answer — never read as gone',
    history: true,
    host: () => ({ unknown: 'server not answering' }),
    step: 'unknown',
    says: 'could not tell whether it is running (server not answering)',
  },
  {
    name: 'a handle no harness here reads',
    history: false,
    handle: 'zed:run-9',
    host: () => ({}),
    step: 'unknown',
    says: "handle 'zed:run-9' is one no harness here can read",
  },
];

test.each(STEPS)('plan: $name → $step', async ({ history, ranOn, handle, host, step, says }) => {
  const session = await hosted({ ranOn, handle });
  if (history) fabricateTranscript(session);
  const before = head();
  const fake = fakeHost(host(session));

  const plan = await planResumeAll(ws, { host: fake });

  expect(plan.sessions.map((s) => [s.record.id, s.step])).toEqual([[session.id, step]]);
  expect(plan.sessions[0]?.detail).toContain(says);
  // The plan is a read: no event, no commit, nothing asked of the host but where things are.
  expect(await events(session.id)).toEqual(['opened']);
  expect(head()).toBe(before);
  expect(fake.placed).toEqual([]);
  expect(fake.closed).toEqual([]);
});

test('plan: asked again and again of a session that can never resume, it records nothing', async () => {
  const session = await hosted({});
  for (let i = 0; i < 3; i++) await planResumeAll(ws, { host: fakeHost() });
  expect(await events(session.id)).toEqual(['opened']);
});

test('plan: the coordinator, then floor by floor — a floor’s own session before those beside it', async () => {
  await openProject(ws, 'alpha');
  await openProject(ws, 'beta');
  // Opened out of order on purpose: the plan's order is not the opening order.
  const beta = await openFloorSession(ws, 2, 'beta', launch('b'));
  const alphaTwo = await openFloorSession(ws, 1, 'alpha, again', launch('a'));
  const alpha = await openFloorSession(ws, 1, 'alpha', launch('a'));
  // A helper the first floor-1 session started: placed beside it, on floor 1.
  const helper = await openWorkspaceSession(ws, 'helper', {
    ...launch('w'),
    startedBy: alphaTwo.id,
  });
  const ground = await openFloorSession(ws, GROUND_FLOOR, 'ground', launch('g'));
  const coordinator = await openWorkspaceSession(ws, 'coordinate', launch('c'));

  const plan = await planResumeAll(ws, { host: fakeHost() });

  expect(plan.sessions.map((s) => [s.record.id, s.floor, s.coordinator])).toEqual([
    [coordinator.id, 0, true],
    [ground.id, 0, false],
    [alphaTwo.id, 1, false],
    [alpha.id, 1, false],
    [helper.id, 1, false],
    [beta.id, 2, false],
  ]);
});

test('plan: closed sessions are left out; sessions never hosted are counted, not listed', async () => {
  const kept = await hosted({});
  const closed = await hosted({});
  await closeSession(ws, closed.id);
  await openWorkspaceSession(ws, 'in a terminal', { handle: 'claude:fg' }); // a foreground launch
  await openTask(ws, 'feature', { floor: GROUND_FLOOR });
  await openSession(ws, 'f0t1', 'self-recorded', { handle: 'claude:self' });

  const plan = await planResumeAll(ws, { host: fakeHost() });

  expect(plan.sessions.map((s) => s.record.id)).toEqual([kept.id]);
  expect(plan.notHosted).toBe(2);
  expect(plan.outside).toBe(0);
});

test('plan: --floor keeps the sessions placed on that floor and counts the rest', async () => {
  await openProject(ws, 'alpha');
  await hosted({}); // the coordinator, placed on floor 0
  const alpha = await openFloorSession(ws, 1, 'alpha', launch('a'));
  await openWorkspaceSession(ws, 'in a terminal', { handle: 'claude:fg' });

  const plan = await planResumeAll(ws, { floor: 1, host: fakeHost() });

  expect(plan).toMatchObject({ floor: 1, outside: 1, notHosted: 0 });
  expect(plan.sessions.map((s) => s.record.id)).toEqual([alpha.id]);
});

test('plan: refused when the detached host is not usable — every row would be a promise it cannot keep', async () => {
  await hosted({});
  await expect(planResumeAll(ws, { host: fakeHost({ unusable: 'tmux missing' }) })).rejects.toThrow(
    'cannot resume --all: tmux is not usable here (tmux missing)',
  );
});

// -- enacting: serial, in order, and one failure is one row's ------------------

test('enact: only the resume rows are attempted, in plan order; a failure does not stop the rest', async () => {
  await openProject(ws, 'alpha');
  await openProject(ws, 'beta');
  const coordinator = await openWorkspaceSession(ws, 'coordinate', launch('c'));
  const alpha = await openFloorSession(ws, 1, 'alpha', launch('a'));
  const lost = await openFloorSession(ws, 1, 'alpha two', launch('l'));
  const running = await openFloorSession(ws, 2, 'beta', launch('b'));
  const ended = await openFloorSession(ws, 2, 'beta two', launch('e'));
  for (const session of [coordinator, alpha, ended]) fabricateTranscript(session);
  const plan = await planResumeAll(ws, { host: fakeHost({ windows: [own(running, 2)] }) });
  expect(plan.sessions.map((s) => s.step)).toEqual(['resume', 'resume', 'gone', 'live', 'resume']);

  const attempted: string[] = [];
  const settled: string[] = [];
  const enacted = await enactResumeAll(ws, plan, {
    onSession: (s) => settled.push(`${s.record.id}:${s.outcome ?? s.step}`),
    resume: async (_, id) => {
      attempted.push(id);
      if (id === alpha.id) throw new Error('the agent did not start in tmux — no room');
      return placed(id, id === ended.id ? { state: 'exited', exitStatus: 1 } : { state: 'live' });
    },
  });

  expect(attempted).toEqual([coordinator.id, alpha.id, ended.id]);
  expect(settled).toEqual([
    `${coordinator.id}:resumed`,
    `${alpha.id}:failed`,
    `${lost.id}:gone`,
    `${running.id}:live`,
    `${ended.id}:exited`,
  ]);
  expect(enacted.map((s) => s.cause)).toEqual([
    undefined,
    'the agent did not start in tmux — no room',
    undefined,
    undefined,
    'the run exited 1 at once',
  ]);
  expect(enacted[0]).toMatchObject({ group: 'host-0', join: 'fake join host-0' });
  expect(tally(enacted)).toEqual({
    resume: 3,
    live: 1,
    gone: 1,
    elsewhere: 0,
    unknown: 0,
    resumed: 1,
    exited: 1,
    failed: 1,
  });
  expect(leftBroken(enacted)).toBe(true);
});

test('enact: a plan with nothing to resume attempts nothing', async () => {
  const running = await hosted({});
  await hosted({}); // history gone: never attempted
  const plan = await planResumeAll(ws, { host: fakeHost({ windows: [own(running, 0)] }) });
  const enacted = await enactResumeAll(ws, plan, {
    resume: async () => {
      throw new Error('nothing should be resumed');
    },
  });
  expect(enacted.map((s) => s.outcome)).toEqual([undefined, undefined]);
  // History gone is a standing fact, reported and not charged to the run.
  expect(leftBroken(enacted)).toBe(false);
});

test('enact: a session that could not be read leaves the run broken, though nothing was attempted', async () => {
  const session = await hosted({});
  fabricateTranscript(session);
  const plan = await planResumeAll(ws, { host: fakeHost({ unknown: 'server not answering' }) });
  const enacted = await enactResumeAll(ws, plan, {
    resume: async () => {
      throw new Error('nothing should be resumed');
    },
  });
  expect(enacted.map((s) => s.step)).toEqual(['unknown']);
  expect(leftBroken(enacted)).toBe(true);
});

// -- the verb: which combinations it refuses -----------------------------------

test.each<[string, string[], string]>([
  ['an ID beside --all', ['workspace-1@test', '--all'], 'pass one or the other'],
  ['--foreground', ['--all', '--foreground'], '--all hosts every run detached'],
  ['--on-exit', ['--all', '--on-exit', 'keep'], '--on-exit answers for a foreground run'],
  ['--go without --all', ['workspace-1@test', '--go'], '--go belongs to the bulk resume'],
  ['--floor without --all', ['workspace-1@test', '--floor', '0'], '--floor belongs to the bulk'],
  ['neither an ID nor --all', [], 'name the session to resume'],
])('ward session resume refuses %s, legibly, writing nothing', async (_, argv, says) => {
  const session = await hosted({});
  const before = head();
  const result = await callWard(['session', 'resume', ...argv, '--json'], ws);
  expect(result.exitCode).toBe(1);
  expect(result.stdout).toBe('');
  expect(result.stderr).toContain(says);
  expect(head()).toBe(before);
  expect(await events(session.id)).toEqual(['opened']);
});

test('ward schema session resume: one session’s record, or the bulk document', async () => {
  const schema = JSON.parse((await callWard(['schema', 'session', 'resume'], ws)).stdout);
  expect(schema.anyOf).toHaveLength(2);
  expect(Object.keys(schema.anyOf[1].properties)).toEqual(Object.keys(sessionResumeAllShape.shape));
});

// -- setup -----------------------------------------------------------------------

let scratch: string;
let ws: string;
let id: string;
let claudeHome: string;
let caseId = 0;
let handles = 0;

/** A launch as Ward records a detached one: its own handle, hosted in tmux. */
function launch(tag: string): { handle: string; host: 'tmux' } {
  handles += 1;
  return { handle: `claude:${tag}-${handles}`, host: 'tmux' };
}

/** An open workspace-scope session whose latest launch was hosted. */
async function hosted(options: {
  ranOn?: string | undefined;
  handle?: string | undefined;
}): Promise<SessionRecord> {
  if (options.ranOn !== undefined) process.env.WARD_MACHINE = options.ranOn;
  try {
    return await openWorkspaceSession(ws, 'hosted', {
      ...launch('h'),
      ...(options.handle === undefined ? {} : { handle: options.handle }),
    });
  } finally {
    process.env.WARD_MACHINE = 'test';
  }
}

/** The session's own window in its floor's host: its tag, its latest launch as epoch. */
function own(record: SessionRecord, floor: number): FoundWindow {
  return {
    window: '@1',
    groups: [{ name: `host-${floor}`, stamp: { workspace: id, floor } }],
    tags: { session: record.id, epoch: record.events?.at(-1)?.at ?? '' },
    dead: false,
  };
}

/** What a hosted resume hands back, as read a beat after it was placed. */
function placed(session: string, live: Pick<LiveState, 'state' | 'exitStatus'>): LaunchedSession {
  return {
    record: { id: session } as SessionRecord,
    hosted: {
      floor: 0,
      group: 'host-0',
      window: '@7',
      createdGroup: false,
      join: 'fake join host-0',
      live: { kind: 'tmux', floor: 0, window: '@7', strangers: [], ...live },
    },
  };
}

/** A transcript where the harness would have written one. */
function fabricateTranscript(record: SessionRecord): void {
  const dir = join(claudeHome, 'projects', mungeCwd(ws));
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${record.handle?.replace('claude:', '')}.jsonl`), '{"type":"user"}\n');
}

async function events(session: string): Promise<string[]> {
  return ((await findSession(ws, session)).record.events ?? []).map((event) => event.event);
}

function head(): string {
  return gitOrThrow(ws, 'rev-parse', 'HEAD').stdout.trim();
}

beforeEach(async () => {
  applyGitTestEnv();
  caseId += 1;
  scratch ??= makeTempDir();
  ws = join(scratch, `ws-${caseId}`);
  claudeHome = join(scratch, `claude-home-${caseId}`);
  process.env.CLAUDE_CONFIG_DIR = claudeHome;
  await preparedWorkspace(ws);
  id = await workspaceId(ws);
});

afterEach(() => {
  delete process.env.CLAUDE_CONFIG_DIR;
});

afterAll(() => {
  if (scratch !== undefined) removeDir(scratch);
});
