// Detached hosting against a REAL tmux (design/0031-detached-session-hosting/),
// end to end through the spawned CLI: the floor host found or minted by its
// stamps, the tagged window, `WARD_AGENT` on the agent's pane alone, the
// floating coordinator, resume's gate, close ending a window and never a
// host, and the race the store write serializes.
//
// Every call goes to a PRIVATE server (`tmux -L <unique>`, through
// WARD_TMUX_SOCKET), started here with no configuration file and killed in
// afterAll — nothing here can see or touch a human's own tmux sessions. When
// tmux is not installed the suite is skipped, saying so; CI installs it.
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { chmodSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  doctorShape,
  type SessionMutationShape,
  sessionLocateShape,
  sessionMutationShape,
} from '../../src/cli/schema.ts';
import { mungeCwd } from '../../src/harness/claude.ts';
import { createWorkspace } from '../../src/workspace/create.ts';
import { workspaceId } from '../../src/workspace/identity.ts';
import { GROUND_FLOOR, openProject } from '../../src/workspace/projects.ts';
import { readAllSessions } from '../../src/workspace/sessions.ts';
import { openTask } from '../../src/workspace/tasks.ts';
import { applyGitTestEnv, type CliResult, makeTempDir, removeDir } from '../helpers.ts';

const TMUX = Bun.which('tmux');
if (TMUX === null) {
  console.warn(
    'test/host/tmux-live.test.ts: tmux is not installed — the real-tmux suite is skipped',
  );
}
const SOCKET = `ward-test-${process.pid}-${Math.random().toString(36).slice(2, 8)}`;

describe.skipIf(TMUX === null)('a real tmux, on a private server', () => {
  test('a detached open: the record first, a stamped floor host, a tagged window', async () => {
    const opened = session(ward(['session', 'open', '--detach', '--json']));
    const host = `ward-${name}-f0`;
    expect(opened.events).toEqual([{ event: 'opened', at: opened.openedAt, host: 'tmux' }]);
    expect(opened.live).toMatchObject({ kind: 'tmux', state: 'live', floor: 0, host });
    expect(opened.live?.join).toBe(`tmux -L ${SOCKET} attach -t =${host}`);

    // Found by stamp: this workspace's immutable id, and the floor.
    expect(hostsOf(await workspaceId(ws))).toEqual([{ name: host, floor: '0' }]);
    const window = opened.live?.window ?? '';
    expect(windowOption(window, '@ward_session')).toBe(opened.id);
    expect(windowOption(window, '@ward_epoch')).toBe(opened.openedAt);
    expect(windowOption(window, 'remain-on-exit')).toBe('on');
    expect(windowOption(window, 'automatic-rename')).toBe('off');

    // The run was born declared, and the record was on disk before it started.
    expect(await runsSoon(1)).toEqual([`agent=${opened.id} seen=yes`]);
  });

  test('WARD_AGENT is on the agent pane only: the host and a human window inherit none', async () => {
    const opened = session(ward(['session', 'open', '--detach', '--json']));
    const host = opened.live?.host ?? '';
    expect(tmux('show-environment', '-t', `=${host}:`)).not.toContain('WARD_AGENT');
    expect(tmux('show-environment', '-g')).not.toContain('WARD_AGENT');
    const probe = join(scratch, `human-${caseId}.txt`);
    tmux('new-window', '-d', '-t', `=${host}:`, `echo "\${WARD_AGENT:-none}" > ${probe}; sleep 5`);
    expect(await fileSoon(probe)).toBe('none\n');
  });

  test('the coordinator floats into a new floor host; close ends a window, never a host', async () => {
    const coordinator = session(ward(['session', 'open', '--detach', '--json']));
    await openProject(ws, 'alpha');
    const floor = session(ward(['session', 'open', '--floor', '1', '--detach', '--json']));
    const f0 = `ward-${name}-f0`;
    const f1 = `ward-${name}-f1`;
    expect(floor.live).toMatchObject({ state: 'live', floor: 1, host: f1 });
    // The coordinator's window is the first in floor 1's host, the same window as floor 0's.
    expect(windowsIn(f1)).toEqual([coordinator.id, floor.id]);
    expect(windowsIn(f0)).toEqual([coordinator.id]);

    const closedFloor = session(ward(['session', 'close', floor.id, '--json']));
    expect(closedFloor.teardown).toMatchObject({ kind: 'tmux', outcome: 'closed' });
    // Floor 1's host still shows the coordinator, so tmux keeps it — Ward never kills a host.
    expect(windowsIn(f1)).toEqual([coordinator.id]);

    const closedCoordinator = session(ward(['session', 'close', coordinator.id, '--json']));
    expect(closedCoordinator.teardown?.outcome).toBe('closed');
    // Gone from every host at once; the hosts, left empty, ended by tmux's own rule.
    expect(hostsOf(await workspaceId(ws))).toEqual([]);
    expect(Bun.spawnSync([TMUX ?? 'tmux', '-L', SOCKET, 'list-sessions']).exitCode).toBe(0);

    // Closing again is a record refusal; there is no window left to end either way.
    expect(ward(['session', 'close', floor.id]).exitCode).toBe(1);
  });

  test('an exited run is legible; resume clears it, records how it ended, and refuses over a live one', async () => {
    const opened = session(ward(['session', 'open', '--detach', '--json'], { stub: exiting }));
    expect(opened.live).toMatchObject({ state: 'exited', exitStatus: 3 });
    expect(session(ward(['session', 'show', opened.id, '--json'])).live).toMatchObject({
      state: 'exited',
      exitStatus: 3,
    });

    fabricateTranscript(opened.handle?.replace('claude:', '') ?? '');
    const resumed = session(ward(['session', 'resume', opened.id, '--detach', '--json']));
    expect(resumed.events?.at(-1)).toMatchObject({
      event: 'resumed',
      host: 'tmux',
      cause: 'previous run exited 3',
    });
    expect(resumed.live).toMatchObject({ state: 'live', strangers: [] });
    expect(windowsIn(`ward-${name}-f0`)).toEqual([opened.id]); // the dead window was cleared

    const refused = ward(['session', 'resume', opened.id]);
    expect(refused.exitCode).toBe(1);
    expect(refused.stderr).toContain(`is still running in tmux host ward-${name}-f0`);
    expect(refused.stderr).toContain(`tmux -L ${SOCKET} attach -t =ward-${name}-f0`);
    expect(session(ward(['session', 'show', opened.id, '--json'])).events).toHaveLength(2);
  });

  test("a task's close sweeps its hosted session and ends that window", async () => {
    await openTask(ws, 'feature', { floor: GROUND_FLOOR });
    const nativeId = '0f8fad5b-d9cb-469f-a165-70867728950e';
    const recorded = session(
      ward([
        'session',
        'open',
        'f0t1',
        '--purpose',
        'work',
        '--handle',
        `claude:${nativeId}`,
        '--json',
      ]),
    );
    fabricateTranscript(nativeId);
    const resumed = session(ward(['session', 'resume', recorded.id, '--detach', '--json']));
    expect(resumed.live).toMatchObject({ state: 'live', floor: 0 });
    const window = resumed.live?.window ?? '';

    const closed = ward(['task', 'close', 'f0t1', '--outcome', 'abandoned', '--json']);
    expect(closed.exitCode).toBe(0);
    const steps = (JSON.parse(closed.stdout) as { steps: { step: string; detail: string }[] })
      .steps;
    expect(steps).toContainEqual({
      step: 'live windows',
      detail: `${recorded.id}: ended window ${window}`,
    });
    expect(tmux('list-windows', '-a', '-F', '#{window_id}').split('\n')).not.toContain(window);
  });

  test('two detached opens racing on an empty floor make one floor host', async () => {
    await openProject(ws, 'alpha');
    const racers = [0, 1].map(() =>
      Bun.spawn(['bun', cliPath, 'session', 'open', '--floor', '1', '--detach', '--json'], {
        cwd: ws,
        env: wardEnv(staying),
        stdout: 'pipe',
        stderr: 'pipe',
      }),
    );
    expect(await Promise.all(racers.map((racer) => racer.exited))).toEqual([0, 0]);
    expect(hostsOf(await workspaceId(ws))).toEqual([{ name: `ward-${name}-f1`, floor: '1' }]);
    expect(windowsIn(`ward-${name}-f1`).sort()).toEqual([`f1-1@test`, `f1-2@test`]);
  });

  test('a moved workspace finds its own host by stamp; a same-named stranger is refused, untouched', async () => {
    await openProject(ws, 'alpha');
    await openProject(ws, 'beta');
    session(ward(['session', 'open', '--floor', '1', '--detach', '--json']));
    const moved = `${ws}-moved`;
    renameSync(ws, moved);
    ws = moved;
    const again = session(ward(['session', 'open', '--floor', '1', '--detach', '--json']));
    expect(again.live?.host).toBe(`ward-${name}-f1`); // the host minted under the old path
    expect(windowsIn(`ward-${name}-f1`)).toHaveLength(2);

    const stranger = `ward-${name}-f2`;
    tmux('new-session', '-d', '-s', stranger, 'sleep 600');
    const refused = ward(['session', 'open', '--floor', '2', '--detach']);
    expect(refused.exitCode).toBe(1);
    expect(refused.stderr).toContain(`a tmux session named '${stranger}' already exists`);
    expect(tmux('list-windows', '-t', `=${stranger}:`, '-F', '#{@ward_session}')).toBe('\n');
  });

  test('--detach with no usable tmux refuses before recording; a configured tmux degrades, saying so', async () => {
    const missing = { WARD_TMUX_BIN: '/nonexistent/tmux' };
    const refused = ward(['session', 'open', '--detach'], { env: missing });
    expect(refused.exitCode).toBe(1);
    expect(refused.stderr).toContain('cannot detach');
    expect(await readAllSessions(ws)).toEqual([]);

    writeGlobalConfig('host: tmux');
    const degraded = ward(['session', 'open', '--purpose', 'degrade', '--on-exit', 'keep'], {
      env: missing,
      stub: exitingZero,
    });
    expect(degraded.exitCode).toBe(0);
    expect(degraded.stderr).toContain('host tmux unavailable');
    expect(degraded.stderr).toContain('this session ends with this terminal');
    const [record] = (await readAllSessions(ws)).map((listing) => listing.record);
    expect(record?.events?.[0]?.host).toBeUndefined(); // it ran in the foreground

    // With tmux usable the configured host is honored, and --foreground still wins.
    expect(session(ward(['session', 'open', '--json'])).live?.state).toBe('live');
    const forced = ward(['session', 'open', '--foreground', '--json', '--on-exit', 'keep'], {
      stub: exitingZero,
    });
    expect(session(forced).events?.[0]?.host).toBeUndefined();
  });

  // -- attach, observe, locate, doctor (phase 2) ------------------------------------

  test("attach joins through a view of its own: the host's and other clients' windows stay put", async () => {
    await openProject(ws, 'alpha');
    const first = session(ward(['session', 'open', '--floor', '1', '--detach', '--json']));
    const second = session(ward(['session', 'open', '--floor', '1', '--detach', '--json']));
    const f1 = `ward-${name}-f1`;
    const hostCurrent = activeWindow(f1);

    const one = attach(['session', 'attach', second.id]);
    const view = await clientOn(`${f1}-v1`);
    expect(sessionOption(view, '@ward_view')).toBe(await workspaceId(ws));
    expect(activeWindow(view)).toBe(second.live?.window ?? '?'); // the human lands on the session
    expect(activeWindow(f1)).toBe(hostCurrent); // and the floor host's own current window is unmoved

    // A second human attaching to another session keeps the first one where they are.
    const two = attach(['session', 'attach', first.id]);
    await clientOn(`${f1}-v2`);
    expect(activeWindow(view)).toBe(second.live?.window ?? '?');
    expect(activeWindow(`${f1}-v2`)).toBe(first.live?.window ?? '?');

    // Leaving ends the view (and only the view): the host and both runs stay.
    tmux('detach-client', '-s', `=${view}`);
    tmux('detach-client', '-s', `=${f1}-v2`);
    expect(await exited(one)).toBe(0);
    expect(await exited(two)).toBe(0);
    expect(await groupsSoon((names) => !names.some((n) => n.includes('-v')))).toEqual([f1]);
    expect(windowsIn(f1).sort()).toEqual([first.id, second.id].sort());
    const trail = session(ward(['session', 'show', second.id, '--json'])).events;
    expect(trail?.map((event) => event.event)).toEqual(['opened', 'attached']);
  });

  test('attach re-creates a run that ended, from its record, then joins it', async () => {
    const opened = session(ward(['session', 'open', '--detach', '--json'], { stub: exiting }));
    expect(opened.live?.state).toBe('exited');
    fabricateTranscript(opened.handle?.replace('claude:', '') ?? '');

    const client = attach(['session', 'attach', opened.id]);
    await clientOn(`ward-${name}-f0-v1`);
    const after = session(ward(['session', 'show', opened.id, '--json']));
    expect(after.live).toMatchObject({ state: 'live', strangers: [] });
    expect(after.events?.map((e) => [e.event, e.cause])).toEqual([
      ['opened', undefined],
      ['resumed', 'previous run exited 3'],
      ['attached', undefined],
    ]);
    tmux('detach-client', '-s', `=ward-${name}-f0-v1`);
    expect(await exited(client)).toBe(0);
  });

  test("attach puts back the coordinator's link a human removed — additive only", async () => {
    const coordinator = session(ward(['session', 'open', '--detach', '--json']));
    await openProject(ws, 'alpha');
    const floor = session(ward(['session', 'open', '--floor', '1', '--detach', '--json']));
    const f1 = `ward-${name}-f1`;
    tmux('unlink-window', '-t', `=${f1}:${coordinator.live?.window}`);
    expect(windowsIn(f1)).toEqual([floor.id]);
    const report = doctor();
    expect(report).toContainEqual(
      expect.objectContaining({
        severity: 'info',
        message: expect.stringContaining('attach repairs it'),
      }),
    );

    const client = attach(['session', 'attach', floor.id]);
    await clientOn(`${f1}-v1`);
    expect(windowsIn(f1).sort()).toEqual([coordinator.id, floor.id].sort());
    tmux('detach-client', '-s', `=${f1}-v1`);
    expect(await exited(client)).toBe(0);
  });

  test('observe: one window alone, read-only and never resizing it; refused when not live', async () => {
    const coordinator = session(ward(['session', 'open', '--detach', '--json']));
    const helper = session(ward(['session', 'open', '--detach', '--json']));
    // A human taking part sizes the window; an observer beside them never does.
    // (tmux honours ignore-size only while an unflagged client is attached: an
    // observer watching alone sizes the window until a participant returns.)
    const human = attach(['session', 'attach', helper.id], { cols: 100, rows: 30 });
    await clientOn(`ward-${name}-f0-v1`);
    const size = windowSize(helper.live?.window ?? '');
    expect(size).toBe('100x29');

    const client = attach(['session', 'observe', helper.id], { cols: 60, rows: 15 });
    const view = await clientOn(`ward-${name}-f0-o1`);
    expect(windowsIn(view)).toEqual([helper.id]); // no neighbor — not even the coordinator
    const flags = tmux('list-clients', '-F', '#{client_session}\t#{client_flags}')
      .split('\n')
      .find((line) => line.startsWith(`${view}\t`));
    expect(flags).toContain('read-only');
    expect(flags).toContain('ignore-size');
    expect(windowSize(helper.live?.window ?? '')).toBe(size);
    tmux('detach-client', '-s', `=${view}`);
    tmux('detach-client', '-s', `=ward-${name}-f0-v1`);
    expect(await exited(client)).toBe(0);
    expect(await exited(human)).toBe(0);
    // Ending the view only unlinked the window: the run is untouched.
    expect(session(ward(['session', 'show', helper.id, '--json'])).live?.state).toBe('live');
    expect(
      session(ward(['session', 'show', helper.id, '--json'])).events?.map((e) => e.event),
    ).toEqual(['opened', 'attached', 'observed']);
    expect(windowsIn(`ward-${name}-f0`).sort()).toEqual([coordinator.id, helper.id].sort());

    const ended = session(ward(['session', 'open', '--detach', '--json'], { stub: exiting }));
    const refused = attach(['session', 'observe', ended.id]);
    expect(await exited(refused)).toBe(1);
    expect(refused.output()).toContain('is not running (exited 3)');
  });

  test('attach and observe refuse a caller with no terminal, changing nothing', () => {
    const opened = session(ward(['session', 'open', '--detach', '--json']));
    for (const verb of ['attach', 'observe']) {
      const refused = ward(['session', verb, opened.id]);
      expect(refused.exitCode).toBe(1);
      expect(refused.stderr).toContain('there is no terminal here');
    }
    expect(session(ward(['session', 'show', opened.id, '--json'])).events).toHaveLength(1);
  });

  test("locate --json carries the host block: the live half beside the transcript's answer", () => {
    const opened = session(ward(['session', 'open', '--detach', '--json']));
    const located = sessionLocateShape.parse(
      JSON.parse(ward(['session', 'locate', opened.id, '--json']).stdout),
    );
    expect(located.host).toEqual({
      kind: 'tmux',
      state: 'live',
      floor: 0,
      host: `ward-${name}-f0`,
      window: opened.live?.window,
      strangers: [],
    });
    tmux('kill-window', '-t', opened.live?.window ?? '');
    const gone = sessionLocateShape.parse(
      JSON.parse(ward(['session', 'locate', opened.id, '--json']).stdout),
    );
    expect(gone.host).toMatchObject({ state: 'gone', floor: 0 });
  });

  test('doctor names strays, duplicates, leftover views, and gone sessions — and ends nothing', async () => {
    const opened = session(ward(['session', 'open', '--detach', '--json']));
    const closed = session(ward(['session', 'open', '--detach', '--json']));
    const f0 = `ward-${name}-f0`;
    const id = await workspaceId(ws);
    // A stray: a window still tagged for a session whose record is closed (a
    // close whose teardown never ran — fabricated by re-tagging a live window).
    const stray = tmux(
      'new-window',
      '-d',
      '-P',
      '-F',
      '#{window_id}\t#{pane_id}',
      '-t',
      `=${f0}:`,
      'sleep 600',
    )
      .trim()
      .split('\t');
    ward(['session', 'close', closed.id]);
    tmux('set-option', '-w', '-t', stray[0] ?? '', '@ward_session', closed.id);
    tmux('set-option', '-w', '-t', stray[0] ?? '', '@ward_epoch', closed.openedAt);
    tmux('set-option', '-w', '-t', stray[0] ?? '', '@ward_pane', stray[1] ?? '');
    // A duplicate floor-0 host, and a view nobody is looking through.
    tmux('new-session', '-d', '-s', `${f0}-dup`, 'sleep 600');
    tmux('set-option', '-t', `=${f0}-dup:`, '@ward_workspace', id);
    tmux('set-option', '-t', `=${f0}-dup:`, '@ward_floor', '0');
    tmux('new-session', '-d', '-s', `${f0}-v9`, 'sleep 600');
    tmux('set-option', '-t', `=${f0}-v9:`, '@ward_view', id);
    // A gone session: its window killed by hand.
    tmux('kill-window', '-t', opened.live?.window ?? '');
    const before = tmux('list-windows', '-a', '-F', '#{window_id}');

    const findings = doctor();
    const message = (severity: string, ...parts: string[]) =>
      expect.objectContaining({
        severity,
        message: expect.stringMatching(new RegExp(parts.map(escapeRe).join('.*'))),
      });
    expect(findings).toContainEqual(
      message(
        'warn',
        `stray window ${stray[0]}`,
        'its session is closed',
        `tmux -L ${SOCKET} kill-window -t ${stray[0]}`,
      ),
    );
    expect(findings).toContainEqual(
      message('warn', 'floor 0 has 2 hosts', `kill-session -t =${f0}-dup`),
    );
    expect(findings).toContainEqual(message('info', `${f0}-v9 is a leftover view`));
    expect(findings).toContainEqual(
      message('info', `session ${opened.id} is not running`, 'ward session attach'),
    );
    expect(findings.some((finding) => finding.severity === 'error')).toBe(false);
    // Hygiene reported; nothing was ended.
    expect(tmux('list-windows', '-a', '-F', '#{window_id}')).toBe(before);
  });

  test('a tmux that errors is could-not-determine in doctor, never a clean bill', () => {
    const broken = join(scratch, `broken-tmux-${caseId}.sh`);
    writeFileSync(
      broken,
      '#!/bin/sh\ncase " $* " in *" -V "*) echo "tmux 3.7"; exit 0 ;; esac\necho "server exploded" >&2\nexit 1\n',
    );
    chmodSync(broken, 0o755);
    const findings = doctor({ WARD_TMUX_BIN: broken });
    expect(findings).toContainEqual(
      expect.objectContaining({
        check: 'host windows',
        severity: 'warn',
        message: expect.stringContaining(
          'could not determine what the host holds (server exploded)',
        ),
      }),
    );
    expect(findings.some((f) => f.check === 'host windows' && f.severity === 'ok')).toBe(false);
  });

  test('a server left with no session at all is an empty answer, never could-not-determine', async () => {
    // A server of its own, so "no session at all" is literally true.
    const fresh = `${SOCKET}-empty`;
    const env = { WARD_TMUX_SOCKET: fresh };
    const own = (...args: string[]) =>
      Bun.spawnSync([TMUX ?? 'tmux', '-L', fresh, ...args]).stdout.toString();
    try {
      const opened = session(ward(['session', 'open', '--detach', '--json'], { env }));
      // Its only window gone by hand: the floor host ends, the server (exit-empty off) stays.
      own('kill-window', '-t', opened.live?.window ?? '');
      expect(own('list-sessions', '-F', '#{session_name}')).toBe('');
      expect(session(ward(['session', 'show', opened.id, '--json'], { env })).live?.state).toBe(
        'gone',
      );
      expect(doctor(env)).toContainEqual(
        expect.objectContaining({
          check: 'host windows',
          severity: 'info',
          message: expect.stringContaining(`session ${opened.id} is not running`),
        }),
      );
      fabricateTranscript(opened.handle?.replace('claude:', '') ?? '');
      const resumed = session(
        ward(['session', 'resume', opened.id, '--detach', '--json'], { env }),
      );
      expect(resumed.live?.state).toBe('live');
    } finally {
      killServer(fresh);
    }
  });

  test("a server started by a Claude-run ward does not hand that run's identity to hosted runs", async () => {
    // A fresh private server, started by Ward itself from an environment that
    // looks like the inside of a Claude Code run.
    const fresh = `${SOCKET}-fresh`;
    const env = {
      WARD_TMUX_SOCKET: fresh,
      CLAUDECODE: '1',
      CLAUDE_CODE_SESSION_ID: 'parent-run',
      CLAUDE_CODE_MESSAGING_SOCKET: '/tmp/parent.sock',
    };
    try {
      session(ward(['session', 'open', '--detach', '--json'], { env }));
      const inherited = Bun.spawnSync([
        TMUX ?? 'tmux',
        '-L',
        fresh,
        'show-environment',
        '-g',
      ]).stdout.toString();
      expect(inherited).not.toContain('CLAUDECODE');
      expect(inherited).not.toContain('parent-run');
      expect(inherited).not.toContain('parent.sock');
    } finally {
      killServer(fresh);
    }
  });
});

// -- scaffolding ------------------------------------------------------------------

let scratch: string;
let ws: string;
let name: string;
let claudeHome: string;
let configHome: string;
let runLog: string;
let staying: string;
let exiting: string;
let exitingZero: string;
let caseId = 0;

const cliPath = new URL('../../src/cli/index.ts', import.meta.url).pathname;

const TERM_ENV = { TERM: 'xterm-256color' };

interface Client {
  readonly proc: ReturnType<typeof Bun.spawn>;
  output(): string;
}

/** Run a ward verb on a real pseudo-terminal, as a human at a terminal would. */
function attach(
  argv: string[],
  size: { cols: number; rows: number } = { cols: 100, rows: 30 },
): Client {
  let out = '';
  const decoder = new TextDecoder();
  const proc = Bun.spawn(['bun', cliPath, ...argv], {
    cwd: ws,
    env: { ...wardEnv(staying), ...TERM_ENV },
    terminal: {
      ...size,
      data(_terminal, bytes) {
        out += decoder.decode(bytes);
      },
    },
  });
  return { proc, output: () => out };
}

async function exited(client: Client): Promise<number | null> {
  const timeout = Bun.sleep(10_000).then(() => 'timeout' as const);
  const result = await Promise.race([client.proc.exited, timeout]);
  if (result === 'timeout') {
    client.proc.kill();
    throw new Error(`the client did not exit: ${client.output()}`);
  }
  return result;
}

/** Wait until a client is attached to the named tmux session; returns its name. */
async function clientOn(view: string): Promise<string> {
  for (let i = 0; i < 100; i++) {
    const clients = Bun.spawnSync([
      TMUX ?? 'tmux',
      '-L',
      SOCKET,
      'list-clients',
      '-F',
      '#{client_session}',
    ])
      .stdout.toString()
      .split('\n');
    if (clients.includes(view)) return view;
    await Bun.sleep(100);
  }
  throw new Error(`no client attached to ${view}`);
}

async function groupsSoon(done: (names: string[]) => boolean): Promise<string[]> {
  let names: string[] = [];
  for (let i = 0; i < 50; i++) {
    names = tmux('list-sessions', '-F', '#{session_name}')
      .split('\n')
      .filter((line) => line !== '' && line.includes(`ward-${name}-`));
    if (done(names)) return names;
    await Bun.sleep(100);
  }
  return names;
}

function activeWindow(group: string): string {
  return tmux('display-message', '-p', '-t', `=${group}:`, '#{window_id}').trim();
}

function sessionOption(group: string, option: string): string {
  return tmux('show-options', '-v', '-t', `=${group}:`, option).trim();
}

function windowSize(window: string): string {
  return tmux('display-message', '-p', '-t', window, '#{window_width}x#{window_height}').trim();
}

function doctor(
  env: Record<string, string> = {},
): { check: string; severity: string; message: string }[] {
  const result = ward(['doctor', '--json'], { env });
  return doctorShape.parse(JSON.parse(result.stdout)).workspace;
}

function escapeRe(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function wardEnv(
  stub: string,
  extra: Record<string, string> = {},
): Record<string, string | undefined> {
  const env: Record<string, string | undefined> = {
    ...process.env,
    NO_COLOR: '1',
    WARD_CLAUDE_BIN: stub,
    WARD_TMUX_SOCKET: SOCKET,
    CLAUDE_CONFIG_DIR: claudeHome,
    WARD_CONFIG_DIR: configHome,
    ...extra,
  };
  delete env.WARD_AGENT;
  delete env.TMUX;
  return env;
}

function ward(
  argv: string[],
  options: { stub?: string; env?: Record<string, string> } = {},
): CliResult {
  const result = Bun.spawnSync(['bun', cliPath, ...argv], {
    cwd: ws,
    env: wardEnv(options.stub ?? staying, options.env),
  });
  return {
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  };
}

function session(result: CliResult): SessionMutationShape {
  if (result.exitCode !== 0) throw new Error(`ward failed (${result.exitCode}): ${result.stderr}`);
  return sessionMutationShape.parse(JSON.parse(result.stdout));
}

function tmux(...args: string[]): string {
  const result = Bun.spawnSync([TMUX ?? 'tmux', '-L', SOCKET, ...args]);
  if (result.exitCode !== 0) throw new Error(`tmux ${args.join(' ')}: ${result.stderr.toString()}`);
  return result.stdout.toString();
}

/** This workspace's floor hosts, by their stamps. */
function hostsOf(workspace: string): { name: string; floor: string }[] {
  return tmux('list-sessions', '-F', '#{session_name}\t#{@ward_workspace}\t#{@ward_floor}')
    .split('\n')
    .filter((line) => line !== '')
    .map((line) => line.split('\t'))
    .filter(([, stamp]) => stamp === workspace)
    .map(([host = '', , floor = '']) => ({ name: host, floor }));
}

/** The session tags of a host's windows, in window order. */
function windowsIn(host: string): string[] {
  return tmux('list-windows', '-t', `=${host}:`, '-F', '#{@ward_session}')
    .split('\n')
    .filter((line) => line !== '');
}

function windowOption(window: string, option: string): string {
  return tmux('show-options', '-wv', '-t', window, option).trim();
}

async function runsSoon(count: number): Promise<string[]> {
  for (let i = 0; i < 50; i++) {
    const lines = readLines(runLog);
    if (lines.length >= count) return lines;
    await Bun.sleep(100);
  }
  return readLines(runLog);
}

async function fileSoon(path: string): Promise<string> {
  for (let i = 0; i < 50; i++) {
    try {
      return readFileSync(path, 'utf8');
    } catch {
      await Bun.sleep(100);
    }
  }
  return '';
}

function readLines(path: string): string[] {
  try {
    return readFileSync(path, 'utf8')
      .split('\n')
      .filter((line) => line !== '');
  } catch {
    return [];
  }
}

function fabricateTranscript(nativeId: string): void {
  const dir = join(claudeHome, 'projects', mungeCwd(ws));
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${nativeId}.jsonl`), '{"type":"user"}\n');
}

function writeGlobalConfig(agentLines: string): void {
  mkdirSync(configHome, { recursive: true });
  writeFileSync(
    join(configHome, 'config.md'),
    `---\ntype: ward-config\nagent:\n  ${agentLines}\n---\n`,
  );
}

/**
 * A stand-in harness, as a shell script: it logs who it was told it is, and
 * whether its session's record was already on disk, then stays (or exits).
 */
function writeStub(file: string, tail: string): string {
  const path = join(scratch, file);
  writeFileSync(
    path,
    `#!/bin/sh
seen=no
[ -n "$(find . -path '*sessions*' -name "$WARD_AGENT.md" 2>/dev/null)" ] && seen=yes
echo "agent=$WARD_AGENT seen=$seen" >> "$WARD_TEST_RUNS"
${tail}
`,
  );
  chmodSync(path, 0o755);
  return path;
}

beforeAll(() => {
  if (TMUX === null) return;
  // The private server, started by the suite with no configuration file, so
  // neither a human's ~/.tmux.conf nor their running server is involved.
  const env: Record<string, string | undefined> = { ...process.env };
  delete env.WARD_AGENT;
  delete env.TMUX;
  Bun.spawnSync(
    [TMUX, '-L', SOCKET, '-f', '/dev/null', 'start-server', ';', 'set', '-s', 'exit-empty', 'off'],
    { env },
  );
});

beforeEach(async () => {
  applyGitTestEnv();
  caseId += 1;
  scratch ??= makeTempDir();
  name = `ws-${caseId}`;
  ws = join(scratch, name);
  claudeHome = join(scratch, `claude-home-${caseId}`);
  configHome = join(scratch, `config-${caseId}`);
  runLog = join(scratch, `runs-${caseId}.log`);
  // The tmux server's environment is the suite's: the stub finds its log there.
  process.env.WARD_TEST_RUNS = runLog;
  if (TMUX !== null) tmux('set-environment', '-g', 'WARD_TEST_RUNS', runLog);
  staying = writeStub(`stay-${caseId}.sh`, 'exec sleep 600');
  exiting = writeStub(`exit3-${caseId}.sh`, 'exit 3');
  exitingZero = writeStub(`exit0-${caseId}.sh`, 'exit 0');
  await createWorkspace(ws);
});

afterAll(() => {
  if (TMUX !== null) killServer(SOCKET);
  if (scratch !== undefined) removeDir(scratch);
});

/** End a private server — and remove its socket file, which tmux leaves behind. */
function killServer(socket: string): void {
  const path = Bun.spawnSync([
    TMUX ?? 'tmux',
    '-L',
    socket,
    'display-message',
    '-p',
    '#{socket_path}',
  ])
    .stdout.toString()
    .trim();
  Bun.spawnSync([TMUX ?? 'tmux', '-L', socket, 'kill-server']);
  if (path !== '') rmSync(path, { force: true });
}
