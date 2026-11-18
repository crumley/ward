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
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  setDefaultTimeout,
  test,
} from 'bun:test';
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

// Real tmux on a shared CI runner: a re-create-then-join round trip took over
// 5s on macOS (Bun's default per-test limit) while passing on Linux.
setDefaultTimeout(30_000);

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
    const host = `${name}-f0-workspace`;
    expect(opened.events).toEqual([{ event: 'opened', at: opened.openedAt, host: 'tmux' }]);
    expect(opened.live).toMatchObject({ kind: 'tmux', state: 'live', floor: 0, host });
    expect(opened.live?.join).toBe(`tmux -L ${SOCKET} attach -t =${host}`);

    // Found by stamp: this workspace's immutable id, and the floor.
    expect(hostsOf(await workspaceId(ws))).toEqual([{ name: host, floor: '0' }]);
    const window = opened.live?.window ?? '';
    expect(windowOption(window, '@ward_session')).toBe(opened.id);
    expect(windowOption(window, '@ward_epoch')).toBe(opened.openedAt);
    expect(windowOption(window, 'remain-on-exit')).toBe('failed');
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
    const f0 = `${name}-f0-workspace`;
    const f1 = `${name}-f1-alpha`;
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
    // The open's report is ONE read, a beat after the run was placed. It
    // promises the truth as of that read and nothing about the next moment:
    // `exited` with the status when the run had ended by then, else `live` —
    // never `gone`, never unknown, and never an exit status it did not see.
    // Which of the two depends on how long the run took to start and end,
    // which a loaded machine stretches past the beat; both are honest.
    expect(['live', 'exited']).toContain(opened.live?.state ?? 'none');
    expect(opened.live).toMatchObject(
      opened.live?.state === 'exited' ? { exitStatus: 3, strangers: [] } : { strangers: [] },
    );
    expect(opened.live?.window).toMatch(/^@\d+$/);
    // What IS promised without a clock: every later read says how it ended,
    // from the window the open reported, kept for exactly that.
    const ended = await exitedSoon(opened.id);
    expect(ended.live).toMatchObject({
      state: 'exited',
      exitStatus: 3,
      window: opened.live?.window,
    });

    fabricateTranscript(opened.handle?.replace('claude:', '') ?? '');
    const resumed = session(ward(['session', 'resume', opened.id, '--detach', '--json']));
    expect(resumed.events?.at(-1)).toMatchObject({
      event: 'resumed',
      host: 'tmux',
      cause: 'previous run exited 3',
    });
    expect(resumed.live).toMatchObject({ state: 'live', strangers: [] });
    expect(windowsIn(`${name}-f0-workspace`)).toEqual([opened.id]); // the dead window was cleared

    const refused = ward(['session', 'resume', opened.id]);
    expect(refused.exitCode).toBe(1);
    expect(refused.stderr).toContain(`is still running in tmux host ${name}-f0-workspace`);
    expect(refused.stderr).toContain(`tmux -L ${SOCKET} attach -t =${name}-f0-workspace`);
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
    expect(hostsOf(await workspaceId(ws))).toEqual([{ name: `${name}-f1-alpha`, floor: '1' }]);
    expect(windowsIn(`${name}-f1-alpha`).sort()).toEqual([`f1-1@test`, `f1-2@test`]);
  });

  test('a moved workspace finds its own host by stamp; a same-named stranger is refused, untouched', async () => {
    await openProject(ws, 'alpha');
    await openProject(ws, 'beta');
    session(ward(['session', 'open', '--floor', '1', '--detach', '--json']));
    const moved = `${ws}-moved`;
    renameSync(ws, moved);
    ws = moved;
    const again = session(ward(['session', 'open', '--floor', '1', '--detach', '--json']));
    expect(again.live?.host).toBe(`${name}-f1-alpha`); // the host minted under the old path
    expect(windowsIn(`${name}-f1-alpha`)).toHaveLength(2);

    const stranger = `${name}-f2-beta`;
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
    const f1 = `${name}-f1-alpha`;
    const hostCurrent = activeWindow(f1);

    const one = attach(['session', 'attach', second.id]);
    const view = await clientOn(`${f1}-v1`, one);
    expect(sessionOption(view, '@ward_view')).toBe(await workspaceId(ws));
    expect(activeWindow(view)).toBe(second.live?.window ?? '?'); // the human lands on the session
    expect(activeWindow(f1)).toBe(hostCurrent); // and the floor host's own current window is unmoved

    // A second human attaching to another session keeps the first one where they are.
    const two = attach(['session', 'attach', first.id]);
    await clientOn(`${f1}-v2`, two);
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
    // Waited for, not read off the open's own report: on a loaded runner the
    // stub can still be starting a beat after it was placed.
    await exitedSoon(opened.id);
    fabricateTranscript(opened.handle?.replace('claude:', '') ?? '');

    const client = attach(['session', 'attach', opened.id]);
    await clientOn(`${name}-f0-workspace-v1`, client);
    const after = session(ward(['session', 'show', opened.id, '--json']));
    expect(after.live).toMatchObject({ state: 'live', strangers: [] });
    expect(after.events?.map((e) => [e.event, e.cause])).toEqual([
      ['opened', undefined],
      ['resumed', 'previous run exited 3'],
      ['attached', undefined],
    ]);
    tmux('detach-client', '-s', `=${name}-f0-workspace-v1`);
    expect(await exited(client)).toBe(0);
  });

  test("attach puts back the coordinator's link a human removed — additive only", async () => {
    const coordinator = session(ward(['session', 'open', '--detach', '--json']));
    await openProject(ws, 'alpha');
    const floor = session(ward(['session', 'open', '--floor', '1', '--detach', '--json']));
    const f1 = `${name}-f1-alpha`;
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
    await clientOn(`${f1}-v1`, client);
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
    await clientOn(`${name}-f0-workspace-v1`, human);
    const size = windowSize(helper.live?.window ?? '');
    expect(size).toBe('100x29');

    const client = attach(['session', 'observe', helper.id], { cols: 60, rows: 15 });
    const view = await clientOn(`${name}-f0-workspace-o1`, client);
    expect(windowsIn(view)).toEqual([helper.id]); // no neighbor — not even the coordinator
    const flags = tmux('list-clients', '-F', '#{client_session}\t#{client_flags}')
      .split('\n')
      .find((line) => line.startsWith(`${view}\t`));
    expect(flags).toContain('read-only');
    expect(flags).toContain('ignore-size');
    expect(windowSize(helper.live?.window ?? '')).toBe(size);
    tmux('detach-client', '-s', `=${view}`);
    tmux('detach-client', '-s', `=${name}-f0-workspace-v1`);
    expect(await exited(client)).toBe(0);
    expect(await exited(human)).toBe(0);
    // Ending the view only unlinked the window: the run is untouched.
    expect(session(ward(['session', 'show', helper.id, '--json'])).live?.state).toBe('live');
    expect(
      session(ward(['session', 'show', helper.id, '--json'])).events?.map((e) => e.event),
    ).toEqual(['opened', 'attached', 'observed']);
    expect(windowsIn(`${name}-f0-workspace`).sort()).toEqual([coordinator.id, helper.id].sort());

    const ended = session(ward(['session', 'open', '--detach', '--json'], { stub: exiting }));
    await exitedSoon(ended.id); // waited for: the open's own report may honestly read live
    const refused = attach(['session', 'observe', ended.id]);
    expect(await exited(refused)).toBe(1);
    expect(refused.output()).toContain('is not running (exited 3)');
  });

  // -- hosts that outlive what happens in them (phase 3) ---------------------------

  test('resume over a dead window places its replacement first: the host, and the humans in it, stay', async () => {
    const opened = session(ward(['session', 'open', '--detach', '--json']));
    const host = `${name}-f0-workspace`;
    const dead = opened.live?.window ?? '';
    // Two humans: one through a view of Ward's, one sitting in the host itself.
    const viewer = attach(['session', 'attach', opened.id]);
    const view = await clientOn(`${host}-v1`, viewer);
    const sitter = human(host);
    await clientOn(host, sitter);
    const before = [tmuxId(host), tmuxId(view)];

    // The run ends under them: the host's only window is now a dead one.
    process.kill(Number(tmux('display-message', '-p', '-t', dead, '#{pane_pid}').trim()));
    await exitedSoon(opened.id);
    fabricateTranscript(opened.handle?.replace('claude:', '') ?? '');
    const resumed = session(ward(['session', 'resume', opened.id, '--detach', '--json']));

    expect(resumed.live).toMatchObject({ state: 'live', host, strangers: [] });
    expect(resumed.live?.window).not.toBe(dead);
    expect(resumed.events?.at(-1)?.cause).toMatch(/^previous run /);
    // The same tmux sessions, never ended and minted again: the host was not
    // left empty between the dead window's going and its replacement's coming.
    expect([tmuxId(host), tmuxId(view)]).toEqual(before);
    expect(windowIds(host)).toEqual([resumed.live?.window ?? '?']); // the dead one is cleared
    // Neither human was moved out, and both now look at the new run.
    expect(clientSessions().sort()).toEqual([host, view].sort());
    expect(activeWindow(view)).toBe(resumed.live?.window ?? '?');
    expect(viewer.proc.exitCode).toBeNull();
    expect(sitter.proc.exitCode).toBeNull();

    tmux('detach-client', '-s', `=${view}`);
    tmux('detach-client', '-s', `=${host}`);
    expect(await exited(viewer)).toBe(0);
    expect(await exited(sitter)).toBe(0);
  });

  test('two resumes of one session racing make one window; the loser is refused toward joining it', async () => {
    const opened = session(ward(['session', 'open', '--detach', '--json'], { stub: exiting }));
    await exitedSoon(opened.id);
    fabricateTranscript(opened.handle?.replace('claude:', '') ?? '');
    const racers = [0, 1].map(() =>
      Bun.spawn(['bun', cliPath, 'session', 'resume', opened.id, '--detach', '--json'], {
        cwd: ws,
        env: wardEnv(staying),
        stdout: 'pipe',
        stderr: 'pipe',
      }),
    );
    const results = await Promise.all(
      racers.map(async (racer) => ({
        exitCode: await racer.exited,
        stderr: await new Response(racer.stderr).text(),
      })),
    );
    expect(results.map((result) => result.exitCode).sort()).toEqual([0, 1]);
    const loser = results.find((result) => result.exitCode === 1);
    expect(loser?.stderr).toContain(`session ${opened.id} is still running in tmux host`);
    expect(loser?.stderr).toContain(`tmux -L ${SOCKET} attach -t =${name}-f0-workspace`);

    // One run, one window, one `resumed` on the trail: the loser wrote nothing.
    const after = session(ward(['session', 'show', opened.id, '--json']));
    expect(after.live).toMatchObject({ state: 'live', strangers: [] });
    expect(after.events?.map((event) => event.event)).toEqual(['opened', 'resumed']);
    expect(windowsIn(`${name}-f0-workspace`)).toEqual([opened.id]);
    expect(await runsSoon(2)).toHaveLength(2); // the run that exited, and the one resume
  });

  test('a floor host killed by hand only unlinks the coordinator: it runs on in every other host', async () => {
    const coordinator = session(ward(['session', 'open', '--detach', '--json']));
    await openProject(ws, 'alpha');
    await openProject(ws, 'beta');
    const one = session(ward(['session', 'open', '--floor', '1', '--detach', '--json']));
    const two = session(ward(['session', 'open', '--floor', '2', '--detach', '--json']));
    const [f0, f1, f2] = [`${name}-f0-workspace`, `${name}-f1-alpha`, `${name}-f2-beta`];
    const window = coordinator.live?.window ?? '';
    const run = tmux('display-message', '-p', '-t', window, '#{pane_id} #{pane_pid}');
    expect(windowsIn(f1)).toEqual([coordinator.id, one.id]);

    tmux('kill-session', '-t', `=${f1}`); // a human's own act; Ward never does this

    expect(hostsOf(await workspaceId(ws)).map((host) => host.name)).toEqual([f0, f2]);
    // The same window, pane, and process, still shown by every host left standing.
    expect(windowIds(f0)).toEqual([window]);
    expect(windowsIn(f2)).toEqual([coordinator.id, two.id]);
    expect(tmux('display-message', '-p', '-t', window, '#{pane_id} #{pane_pid}')).toBe(run);
    const live = (id: string) => session(ward(['session', 'show', id, '--json'])).live;
    expect(live(coordinator.id)).toMatchObject({ state: 'live', window, host: f0 });
    expect(live(two.id)?.state).toBe('live');
    // Only what the killed host alone held went with it — and the record says so honestly.
    expect(live(one.id)?.state).toBe('gone');

    // The floor's next session mints its host again, the coordinator linked in at its left edge.
    const again = session(ward(['session', 'open', '--floor', '1', '--detach', '--json']));
    expect(windowsIn(f1)).toEqual([coordinator.id, again.id]);
  });

  test("attach from inside tmux switches the human's own client, and hands it back when the view ends", async () => {
    await openProject(ws, 'alpha');
    const opened = session(ward(['session', 'open', '--floor', '1', '--detach', '--json']));
    const f1 = `${name}-f1-alpha`;
    // A human's own tmux session on the same server, whose pane runs the verb
    // once they are attached to it — so `$TMUX` is tmux's own, and the pane a
    // real terminal.
    const inside = insideTmux(['session', 'attach', opened.id]);
    tmux('new-session', '-d', '-s', 'mine', 'sh', inside.script);
    const own = human('mine');
    await clientOn('mine', own);
    writeFileSync(inside.go, '');

    // Their one client is moved into the view: switched, not nested in a second.
    const view = await clientOn(`${f1}-v1`, own);
    expect(clientSessions()).toEqual([view]);
    expect(activeWindow(view)).toBe(opened.live?.window ?? '?');
    // The verb returns at once — the client is theirs, and stays where it was put.
    expect(await fileSoon(inside.exit)).toBe('0\n');
    expect(clientSessions()).toEqual([view]);
    expect(sessionOption(view, 'destroy-unattached')).toBe('on');
    expect(sessionOption(view, 'detach-on-destroy')).toBe('off');
    expect(
      session(ward(['session', 'show', opened.id, '--json'])).events?.map((e) => e.event),
    ).toEqual(['opened', 'attached']);

    // The floor's last window closes: host and view end, and the human is
    // back in a tmux session of their own — not thrown out of tmux.
    session(ward(['session', 'close', opened.id, '--json']));
    await clientOn('mine', own);
    expect(await groupsSoon((names) => names.length === 0)).toEqual([]);
    expect(own.proc.exitCode).toBeNull();
    tmux('detach-client', '-s', '=mine');
    expect(await exited(own)).toBe(0);
  });

  test('when a host ends under them, the participants move to a host still standing; the observer returns to the shell, told why', async () => {
    await openProject(ws, 'alpha');
    await openProject(ws, 'beta');
    const closing = session(ward(['session', 'open', '--floor', '1', '--detach', '--json']));
    const standing = session(ward(['session', 'open', '--floor', '2', '--detach', '--json']));
    const [f1, f2] = [`${name}-f1-alpha`, `${name}-f2-beta`];
    // Three ways to be looking at floor 1: sitting in the host itself, and
    // through each kind of view. The observer joins last, so its view is the
    // session tmux moves the sitter into first when the host ends — the
    // cascade: a view that detached everyone in it would drop the sitter too.
    const sitter = human(f1);
    await clientOn(f1, sitter);
    const viewer = attach(['session', 'attach', closing.id]);
    await clientOn(`${f1}-v1`, viewer);
    const watcher = attach(['session', 'observe', closing.id]);
    await clientOn(`${f1}-o1`, watcher);
    for (const group of [f1, `${f1}-v1`, `${f1}-o1`]) {
      expect(sessionOption(group, 'detach-on-destroy')).toBe('off');
    }

    // Floor 1's only window closes, and the host and both views end.
    expect(session(ward(['session', 'close', closing.id, '--json'])).teardown?.outcome).toBe(
      'closed',
    );
    // The observer asked to watch one window: its terminal is handed back,
    // saying what happened — it is not left watching some other session.
    expect(await exited(watcher)).toBe(0);
    expect(watcher.output()).toContain(
      `session ${closing.id} was closed — the window you were watching ended with it`,
    );
    // Both participants are in the host still standing, and neither is at the shell.
    expect(await groupsSoon((names) => names.length === 1)).toEqual([f2]);
    expect(await clientsSoon(2)).toEqual([f2, f2]);
    expect(tmux('list-clients', '-F', '#{client_flags}')).not.toContain('read-only');
    for (const client of [sitter, viewer]) expect(client.proc.exitCode).toBeNull();
    expect(session(ward(['session', 'show', standing.id, '--json'])).live?.state).toBe('live');

    tmux('detach-client', '-s', `=${f2}`);
    for (const client of [sitter, viewer]) expect(await exited(client)).toBe(0);
  });

  test("an observer's terminal returns when its window goes, whatever else stands: closed, gone, or restarted", async () => {
    const coordinator = session(ward(['session', 'open', '--detach', '--json']));
    const f0 = `${name}-f0-workspace`;
    // A session of the human's own, the most recently used on the server:
    // where tmux would have put an observer whose view ended under it.
    tmux('new-session', '-d', '-s', 'mine', 'cat');
    const own = human('mine');
    await clientOn('mine', own);
    const watch = async (id: string) => {
      const watcher = attach(['session', 'observe', id]);
      const view = await clientOn(`${f0}-o1`, watcher);
      // One window is all the observer sees named: the view's holder has no entry.
      expect(windowsIn(view)).toEqual([id]);
      return watcher;
    };
    const returned = async (watcher: Client, said: string) => {
      expect(await exited(watcher)).toBe(0);
      expect(watcher.output()).toContain(said);
      // The view is gone, the human's own session has its one client, and the host stands.
      expect(await groupsSoon((names) => names.length === 1)).toEqual([f0]);
      expect(clientSessions()).toEqual(['mine']);
    };

    // Closed: the session's window ends, the floor host stands (the coordinator is in it).
    const closed = session(ward(['session', 'open', '--detach', '--json']));
    let watcher = await watch(closed.id);
    ward(['session', 'close', closed.id]);
    await returned(watcher, `session ${closed.id} was closed`);

    // Gone: the window ended by hand, the record still open.
    const gone = session(ward(['session', 'open', '--detach', '--json']));
    watcher = await watch(gone.id);
    tmux('kill-window', '-t', gone.live?.window ?? '');
    await returned(
      watcher,
      `session ${gone.id}'s run ended — the window you were watching is gone`,
    );

    // Restarted: the run ends under the observer, who goes on seeing its dead
    // window until a resume clears it for the replacement.
    const restarted = session(ward(['session', 'open', '--detach', '--json']));
    watcher = await watch(restarted.id);
    const window = restarted.live?.window ?? '';
    process.kill(Number(tmux('display-message', '-p', '-t', window, '#{pane_pid}').trim()));
    await exitedSoon(restarted.id);
    expect(watcher.proc.exitCode).toBeNull();
    fabricateTranscript(restarted.handle?.replace('claude:', '') ?? '');
    session(ward(['session', 'resume', restarted.id, '--detach', '--json']));
    await returned(watcher, `session ${restarted.id} was restarted in a new window`);

    // Leaving by choice says nothing: the window is still there.
    watcher = await watch(coordinator.id);
    tmux('detach-client', '-s', `=${f0}-o1`);
    expect(await exited(watcher)).toBe(0);
    expect(watcher.output()).not.toContain('you were watching');
    tmux('detach-client', '-s', '=mine');
    expect(await exited(own)).toBe(0);
  });

  // -- a clean exit closes its window (design/0070-clean-exit-closes-window/) ------

  test('a run that exits cleanly closes its window: the session stays open, reads gone, and resumes with no cause', async () => {
    const coordinator = session(ward(['session', 'open', '--detach', '--json']));
    const leaving = leavingStub('helper');
    const helper = session(ward(['session', 'open', '--detach', '--json'], { stub: leaving.stub }));
    const f0 = `${name}-f0-workspace`;
    const window = helper.live?.window ?? '';
    expect(windowOption(window, 'remain-on-exit')).toBe('failed');
    expect(windowsIn(f0).sort()).toEqual([coordinator.id, helper.id].sort());

    leaving.leave(); // the human leaves the agent the ordinary way: it exits 0
    const gone = await goneSoon(helper.id);
    // No window, no exit status — and nothing else of the host's went with it.
    expect(gone.live).toEqual({ kind: 'tmux', state: 'gone', floor: 0, strangers: [] });
    expect(gone.state).toBe('open'); // an exit is not a close
    expect(windowIds(f0)).toEqual([coordinator.live?.window ?? '?']);
    const shown = ward(['session', 'show', helper.id]);
    expect(shown.stdout).toContain(
      'not running (no tmux window, floor 0 — it exited cleanly, or its window was ended)',
    );
    // Doctor counts it as information, with both ways on; observe has nothing to watch.
    expect(doctor()).toContainEqual(
      expect.objectContaining({
        severity: 'info',
        message:
          `session ${helper.id} is not running (no tmux window) — attach re-creates it: ` +
          `ward session attach ${helper.id}; if it is done, close it: ` +
          `ward session close ${helper.id}`,
      }),
    );
    const refused = attach(['session', 'observe', helper.id]);
    expect(await exited(refused)).toBe(1);
    expect(refused.output()).toContain('is not running (it has no window)');

    // Resume finds nothing to clear and nothing to say about how the last run ended.
    fabricateTranscript(helper.handle?.replace('claude:', '') ?? '');
    const resumed = session(ward(['session', 'resume', helper.id, '--detach', '--json']));
    expect(resumed.live).toMatchObject({ state: 'live', host: f0, strangers: [] });
    expect(resumed.events?.at(-1)).toEqual({
      event: 'resumed',
      at: resumed.events?.at(-1)?.at ?? '',
      host: 'tmux',
    });
  });

  test('a run that fails or is killed keeps its window, read as before', async () => {
    const failed = session(ward(['session', 'open', '--detach', '--json'], { stub: exiting }));
    const killed = session(ward(['session', 'open', '--detach', '--json']));
    const hung = session(ward(['session', 'open', '--detach', '--json']));
    const pid = (window: string | undefined) =>
      Number(tmux('display-message', '-p', '-t', window ?? '', '#{pane_pid}').trim());
    process.kill(pid(killed.live?.window), 'SIGKILL');
    process.kill(pid(hung.live?.window), 'SIGTERM');
    expect((await exitedSoon(failed.id)).live).toMatchObject({ state: 'exited', exitStatus: 3 });
    const byKill = (await exitedSoon(killed.id)).live;
    const byTerm = (await exitedSoon(hung.id)).live;
    expect(byKill).toMatchObject({ state: 'exited', window: killed.live?.window });
    expect(byKill?.exitSignal?.toLowerCase()).toContain('kill');
    expect(byTerm?.exitSignal?.toLowerCase()).toContain('term');
    // All three windows stand, dead, in the host — which therefore stands too.
    expect(windowsIn(`${name}-f0-workspace`).sort()).toEqual(
      [failed.id, killed.id, hung.id].sort(),
    );
    expect(ward(['session', 'show', failed.id]).stdout).toContain('exited 3, window kept in');
    expect(doctor()).toContainEqual(
      expect.objectContaining({
        severity: 'info',
        message: expect.stringContaining(`session ${failed.id}'s run exited 3, its window`),
      }),
    );
  });

  test('a clean exit at once: the open still succeeds, says so, and the host it made ends with its only window', async () => {
    await openProject(ws, 'alpha');
    const floor = session(ward(['session', 'open', '--floor', '1', '--detach', '--json']));
    const f1 = `${name}-f1-alpha`;
    // A coordinator whose run is over before Ward has linked it anywhere: tmux
    // is held back at the link until the stub has logged its run (its last
    // act before it exits 0), so the window has closed itself by then — and
    // the placement is not failed by it.
    const slow = join(scratch, `slow-link-${caseId}.sh`);
    writeFileSync(
      slow,
      [
        '#!/bin/sh',
        'case " $* " in *" link-window "*)',
        '  while [ ! -s "$WARD_TEST_RUNS" ]; do sleep 0.1; done',
        '  sleep 0.5 ;;',
        'esac',
        `exec '${TMUX}' "$@"`,
        '',
      ].join('\n'),
    );
    chmodSync(slow, 0o755);
    rmSync(runLog, { force: true }); // floor 1's run logged too: wait for the coordinator's own
    const opened = ward(['session', 'open', '--detach'], {
      stub: exitingZero,
      env: { WARD_TMUX_BIN: slow },
    });
    expect(opened.exitCode).toBe(0);
    const id = /opened session (\S+)/.exec(opened.stdout)?.[1] ?? '';
    // The one read a beat after placement finds no window: said, with the way
    // to run it again, and no join command for a host that is no longer there.
    // Never `exited` — nothing was kept to read a status from.
    expect(opened.stderr).toContain('the run has already ended and left no window');
    expect(opened.stderr).toContain(`run it again: ward session resume ${id}`);
    expect(opened.stderr).not.toMatch(/exited \d|window kept|did not start/);
    expect(opened.stdout).not.toContain('join it:');
    expect(opened.stdout).not.toContain('linked into every floor host');
    await goneSoon(id);
    // Floor 0's host held nothing else, so tmux ended it; floor 1's is untouched.
    expect(hostsOf(await workspaceId(ws))).toEqual([{ name: f1, floor: '1' }]);
    expect(windowsIn(f1)).toEqual([floor.id]);
    expect(Bun.spawnSync([TMUX ?? 'tmux', '-L', SOCKET, 'list-sessions']).exitCode).toBe(0);
    expect(session(ward(['session', 'show', id, '--json'])).state).toBe('open');
  });

  test("the coordinator's clean exit takes its window out of every host; a host left with nothing ends", async () => {
    const leaving = leavingStub('coord');
    const coordinator = session(
      ward(['session', 'open', '--detach', '--json'], { stub: leaving.stub }),
    );
    await openProject(ws, 'alpha');
    await openProject(ws, 'beta');
    const one = session(ward(['session', 'open', '--floor', '1', '--detach', '--json']));
    const two = session(ward(['session', 'open', '--floor', '2', '--detach', '--json']));
    const [f0, f1, f2] = [`${name}-f0-workspace`, `${name}-f1-alpha`, `${name}-f2-beta`];
    expect(windowsIn(f1)).toEqual([coordinator.id, one.id]);
    expect(windowsIn(f2)).toEqual([coordinator.id, two.id]);
    expect(windowsIn(f0)).toEqual([coordinator.id]);

    leaving.leave();
    await goneSoon(coordinator.id);
    // Gone from all three at once. Floor 0's host showed nothing else and is
    // ended by tmux; the others keep their own sessions, which run on.
    expect(hostsOf(await workspaceId(ws)).map((host) => host.name)).toEqual([f1, f2]);
    expect(windowsIn(f1)).toEqual([one.id]);
    expect(windowsIn(f2)).toEqual([two.id]);
    for (const id of [one.id, two.id]) {
      expect(session(ward(['session', 'show', id, '--json'])).live?.state).toBe('live');
    }
    // Attach brings the coordinator back from its record, linked into every host again.
    fabricateTranscript(coordinator.handle?.replace('claude:', '') ?? '');
    const client = attach(['session', 'attach', coordinator.id]);
    await clientOn(`${f0}-v1`, client);
    expect(client.output()).toContain(`re-created session ${coordinator.id} from its record`);
    expect(windowsIn(f1).sort()).toEqual([one.id, coordinator.id].sort());
    expect(windowsIn(f2).sort()).toEqual([two.id, coordinator.id].sort());
    tmux('detach-client', '-s', `=${f0}-v1`);
    expect(await exited(client)).toBe(0);
  });

  test('a clean exit of a host’s last window: participants move to a host still standing, the observer returns told why', async () => {
    await openProject(ws, 'alpha');
    await openProject(ws, 'beta');
    const leaving = leavingStub('floor');
    const ending = session(
      ward(['session', 'open', '--floor', '1', '--detach', '--json'], { stub: leaving.stub }),
    );
    const standing = session(ward(['session', 'open', '--floor', '2', '--detach', '--json']));
    const [f1, f2] = [`${name}-f1-alpha`, `${name}-f2-beta`];
    // The three ways to be looking at floor 1, as when a close ends its host.
    const sitter = human(f1);
    await clientOn(f1, sitter);
    const viewer = attach(['session', 'attach', ending.id]);
    await clientOn(`${f1}-v1`, viewer);
    const watcher = attach(['session', 'observe', ending.id]);
    await clientOn(`${f1}-o1`, watcher);

    leaving.leave(); // nobody closed anything: the run simply exited 0

    expect(await exited(watcher)).toBe(0);
    expect(watcher.output()).toContain(
      `session ${ending.id}'s run ended — the window you were watching is gone, and the ` +
        'session is still open',
    );
    expect(await groupsSoon((names) => names.length === 1)).toEqual([f2]);
    expect(await clientsSoon(2)).toEqual([f2, f2]);
    expect(tmux('list-clients', '-F', '#{client_flags}')).not.toContain('read-only');
    for (const client of [sitter, viewer]) expect(client.proc.exitCode).toBeNull();
    // The server is up, the other floor's run untouched, the record still open.
    expect(session(ward(['session', 'show', standing.id, '--json'])).live?.state).toBe('live');
    expect(session(ward(['session', 'show', ending.id, '--json']))).toMatchObject({
      state: 'open',
      live: { state: 'gone' },
    });

    tmux('detach-client', '-s', `=${f2}`);
    for (const client of [sitter, viewer]) expect(await exited(client)).toBe(0);
  });

  test('a clean exit under a client switched in from inside tmux hands the human back their own session', async () => {
    await openProject(ws, 'alpha');
    const leaving = leavingStub('floor');
    const opened = session(
      ward(['session', 'open', '--floor', '1', '--detach', '--json'], { stub: leaving.stub }),
    );
    const f1 = `${name}-f1-alpha`;
    const inside = insideTmux(['session', 'attach', opened.id]);
    tmux('new-session', '-d', '-s', 'mine', 'sh', inside.script);
    const own = human('mine');
    await clientOn('mine', own);
    writeFileSync(inside.go, '');
    const view = await clientOn(`${f1}-v1`, own);
    expect(await fileSoon(inside.exit)).toBe('0\n');
    expect(sessionOption(view, 'destroy-unattached')).toBe('on');

    leaving.leave();

    // Host and view end with the floor's last window; the human is in a tmux
    // session of their own, and the server that holds it is still there.
    await clientOn('mine', own);
    expect(await groupsSoon((names) => names.length === 0)).toEqual([]);
    expect(own.proc.exitCode).toBeNull();
    expect(session(ward(['session', 'show', opened.id, '--json'])).live?.state).toBe('gone');
    tmux('detach-client', '-s', '=mine');
    expect(await exited(own)).toBe(0);
  });

  test('a window an older Ward made is told the rule while its run is still going; a dead one is left as it stands', async () => {
    const leaving = leavingStub('old');
    const running = session(
      ward(['session', 'open', '--detach', '--json'], { stub: leaving.stub }),
    );
    const ended = leavingStub('ended');
    const dead = session(ward(['session', 'open', '--detach', '--json'], { stub: ended.stub }));
    const f0 = `${name}-f0-workspace`;
    // As Ward made them before this entry: every exit kept, a clean one included.
    for (const opened of [running, dead]) {
      tmux('set-option', '-w', '-t', opened.live?.window ?? '', 'remain-on-exit', 'on');
    }
    ended.leave();
    expect((await exitedSoon(dead.id)).live).toMatchObject({ state: 'exited', exitStatus: 0 });

    // The next thing opened into the workspace's hosts brings standing windows up to date.
    const next = session(ward(['session', 'open', '--detach', '--json']));
    expect(windowOption(running.live?.window ?? '', 'remain-on-exit')).toBe('failed');
    // The dead window was kept under the old rule and is not made to vanish.
    expect(windowOption(dead.live?.window ?? '', 'remain-on-exit')).toBe('on');
    expect(session(ward(['session', 'show', dead.id, '--json'])).live).toMatchObject({
      state: 'exited',
      exitStatus: 0,
      window: dead.live?.window,
    });

    leaving.leave();
    await goneSoon(running.id);
    expect(windowsIn(f0).sort()).toEqual([dead.id, next.id].sort());
    // A resume still clears the old dead window and says how that run ended.
    fabricateTranscript(dead.handle?.replace('claude:', '') ?? '');
    const resumed = session(ward(['session', 'resume', dead.id, '--detach', '--json']));
    expect(resumed.events?.at(-1)?.cause).toBe('previous run exited 0');
    expect(windowOption(resumed.live?.window ?? '', 'remain-on-exit')).toBe('failed');
  });

  // -- names and titles (design/0061-host-names-and-titles/) ---------------------

  test('hosts and windows are named for what they hold, and a terminal is titled through its view', async () => {
    const coordinator = session(ward(['session', 'open', '--detach', '--json']));
    await openProject(ws, 'alpha');
    const floor = session(ward(['session', 'open', '--floor', '1', '--detach', '--json']));
    const f1 = `${name}-f1-alpha`;
    expect(windowNames(`${name}-f0-workspace`)).toEqual(['coord']);
    expect(windowNames(f1)).toEqual(['coord', 'alpha']);
    // The id is still what finds the window: the tag, never the name.
    expect(windowsIn(f1)).toEqual([coordinator.id, floor.id]);
    expect(sessionOption(f1, 'set-titles')).toBe('on');
    // Session options, on Ward's own tmux sessions: the server's stay as they were.
    expect(tmux('show-options', '-gv', 'set-titles').trim()).toBe('off');

    // A pane that never set a title carries the hostname, which the title leaves out.
    const client = attach(['session', 'attach', floor.id]);
    await clientOn(`${f1}-v1`, client);
    expect(await titleSoon(client, `🌊 alpha · ${name} f1`)).toBe(true);
    // What the run says about itself joins the title, as the harness's own line does.
    tmux('select-pane', '-t', floor.live?.window ?? '', '-T', 'working on it');
    expect(await titleSoon(client, `🌊 alpha · ${name} f1 · working on it`)).toBe(true);

    const watcher = attach(['session', 'observe', coordinator.id]);
    await clientOn(`${name}-f0-workspace-o1`, watcher);
    expect(await titleSoon(watcher, `🔧 coord · ${name} f0 (observing)`)).toBe(true);
    tmux('detach-client', '-s', `=${f1}-v1`);
    tmux('detach-client', '-s', `=${name}-f0-workspace-o1`);
    expect(await exited(client)).toBe(0);
    expect(await exited(watcher)).toBe(0);
  });

  test('a host and its windows from an older naming are renamed in place, never re-created', async () => {
    const first = session(ward(['session', 'open', '--detach', '--json']));
    const window = first.live?.window ?? '';
    const pane = tmux('display-message', '-p', '-t', window, '#{pane_id} #{pane_pid}');
    // As ward once named them: the host for its number, the window for its session id.
    const old = `ward-${name}-f0`;
    tmux('rename-session', '-t', `=${name}-f0-workspace`, old);
    tmux('rename-window', '-t', window, first.id);
    tmux('set-option', '-t', `=${old}:`, 'set-titles', 'off');
    const human = attach(['session', 'attach', first.id]);
    await clientOn(`${name}-f0-workspace-v1`, human);
    expect(human.output()).toContain(`renamed: ${old} is now ${name}-f0-workspace`);
    expect(windowNames(`${name}-f0-workspace`)).toEqual(['coord']);
    expect(sessionOption(`${name}-f0-workspace`, 'set-titles')).toBe('on');
    // The same window, the same pane, the same process: nothing was re-created.
    expect(tmux('display-message', '-p', '-t', window, '#{pane_id} #{pane_pid}')).toBe(pane);
    expect(hostsOf(await workspaceId(ws))).toEqual([{ name: `${name}-f0-workspace`, floor: '0' }]);

    // A second coordinator: the two are told apart by their ordinals, the first renamed too.
    const second = session(ward(['session', 'open', '--detach', '--json']));
    expect(second.live?.host).toBe(`${name}-f0-workspace`);
    expect(windowNames(`${name}-f0-workspace`).sort()).toEqual(['coord 1', 'coord 2']);
    tmux('detach-client', '-s', `=${name}-f0-workspace-v1`);
    expect(await exited(human)).toBe(0);
  });

  // -- views follow their host (design/0063-views-follow-their-host/) -------------

  test('the views clients are looking through are renamed and titled with their host, in place', async () => {
    const coordinator = session(ward(['session', 'open', '--detach', '--json']));
    await openProject(ws, 'alpha');
    const floor = session(ward(['session', 'open', '--floor', '1', '--detach', '--json']));
    const [f0, f1] = [`${name}-f0-workspace`, `${name}-f1-alpha`];
    const human = attach(['session', 'attach', floor.id]);
    await clientOn(`${f1}-v1`, human);
    const watcher = attach(['session', 'observe', coordinator.id]);
    await clientOn(`${f0}-o1`, watcher);

    // As an older ward left them: hosts named for their numbers, views named
    // after those hosts, and no view titled at all.
    const stale = [`ward-${name}-f1-v1`, `ward-${name}-f0-o1`];
    tmux('rename-session', '-t', `=${f1}`, `ward-${name}-f1`);
    tmux('rename-session', '-t', `=${f0}`, `ward-${name}-f0`);
    tmux('rename-session', '-t', `=${f1}-v1`, stale[0] ?? '');
    tmux('rename-session', '-t', `=${f0}-o1`, stale[1] ?? '');
    for (const view of stale) {
      tmux('set-option', '-u', '-t', `=${view}:`, 'set-titles');
      tmux('set-option', '-u', '-t', `=${view}:`, 'set-titles-string');
    }
    const [humanPid, watcherPid] = [clientOf(stale[0] ?? ''), clientOf(stale[1] ?? '')];
    expect(humanPid).not.toBe('');
    expect(watcherPid).not.toBe('');

    // One refresh — here the one a change of identity runs — and every view
    // answers to its host's name again, wearing the title its host wears.
    const changed = ward([
      'project',
      'identity',
      '1',
      '--color',
      'pink',
      '--emoji',
      '🚀',
      '--json',
    ]);
    expect(JSON.parse(changed.stdout)).toMatchObject({
      host: { outcome: 'themed', groups: [f1, `${f1}-v1`] },
    });
    expect((await groupsSoon((names) => names.length === 4)).sort()).toEqual(
      [f0, `${f0}-o1`, f1, `${f1}-v1`].sort(),
    );
    for (const view of [`${f1}-v1`, `${f0}-o1`])
      expect(sessionOption(view, 'set-titles')).toBe('on');
    expect(sessionOption(`${f1}-v1`, 'set-titles-string')).toBe(
      sessionOption(f1, 'set-titles-string'),
    );
    expect(await titleSoon(human, `🚀 alpha · ${name} f1`)).toBe(true);
    // An observe view shares no group with its host: found by the window it
    // shows, and titled by the same pass — the coordinator's window leading
    // with the emoji of the floor it is seen through.
    expect(sessionOption(`${f0}-o1`, 'set-titles-string')).toStartWith(
      `🔧 #{window_name} · ${name} f0 (observing)`,
    );
    expect(await titleSoon(watcher, `🔧 coord · ${name} f0 (observing)`)).toBe(true);
    expect(theme(`${f0}-o1`)).toEqual(theme(f0));

    // The same clients, each still on the view it was on: nothing was
    // re-created, and nobody was moved or dropped.
    expect(clientOf(`${f1}-v1`)).toBe(humanPid);
    expect(clientOf(`${f0}-o1`)).toBe(watcherPid);
    expect(windowOption(floor.live?.window ?? '', '@ward_epoch')).toBe(floor.openedAt);
    // Still session options on Ward's own: the server's are as they were.
    expect(tmux('show-options', '-gv', 'set-titles').trim()).toBe('off');

    // A view whose derived name another session already wears takes the next free one.
    tmux('rename-session', '-t', `=${f1}-v1`, 'out-of-date');
    tmux('new-session', '-d', '-s', `${f1}-v1`, 'cat');
    ward(['project', 'identity', '1']);
    expect(clientOf(`${f1}-v2`)).toBe(humanPid);

    tmux('detach-client', '-s', `=${f1}-v2`);
    tmux('detach-client', '-s', `=${f0}-o1`);
    expect(await exited(human)).toBe(0);
    expect(await exited(watcher)).toBe(0);
  });

  test('a view ends once its client has left — never under a client still on its way out', async () => {
    const helper = session(ward(['session', 'open', '--detach', '--json']));
    const f0 = `${name}-f0-workspace`;
    for (const [verb, view] of [
      ['attach', `${f0}-v1`],
      ['observe', `${f0}-o1`],
    ] as const) {
      const client = attach(['session', verb, helper.id]);
      await clientOn(view, client);
      // Ward ends this view when the client returns; tmux is not left to
      // (through 3.7c it destroys a destroy-unattached session under a client
      // that has been told to detach and has not yet gone, and dies of it).
      expect(sessionOption(view, 'destroy-unattached')).toBe(''); // not set while it holds its client
      // The worst order, held still: the client is told to detach and is slow
      // to go, while another client of the server (this command's own)
      // disconnects — which is when tmux looks for unattached sessions.
      const pid = Number(clientOf(view));
      process.kill(pid, 'SIGSTOP');
      try {
        tmux('detach-client', '-s', `=${view}`);
        expect(tmux('list-sessions', '-F', '#{session_name}').split('\n')).toContain(view);
      } finally {
        process.kill(pid, 'SIGCONT');
      }
      expect(await exited(client)).toBe(0);
      // The client has left, so the view is gone by the time the verb returns.
      expect(tmux('list-sessions', '-F', '#{session_name}').split('\n')).not.toContain(view);
    }
    expect(session(ward(['session', 'show', helper.id, '--json'])).live?.state).toBe('live');
  });

  test('a terminal that closes on a view ends the view, and nothing else', async () => {
    const helper = session(ward(['session', 'open', '--detach', '--json']));
    const f0 = `${name}-f0-workspace`;
    for (const [verb, view] of [
      ['attach', `${f0}-v1`],
      ['observe', `${f0}-o1`],
    ] as const) {
      const client = attach(['session', verb, helper.id]);
      await clientOn(view, client);
      // The terminal goes away under the verb: both it and its client are hung up.
      client.proc.terminal?.close();
      expect(await exited(client)).not.toBe(0);
      expect(await groupsSoon((names) => !names.includes(view))).toEqual([f0]);
    }
    expect(session(ward(['session', 'show', helper.id, '--json'])).live?.state).toBe('live');
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
      host: `${name}-f0-workspace`,
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
    const f0 = `${name}-f0-workspace`;
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

  test('a floor host wears its floor: its color and emoji on its own status line, and nowhere else', async () => {
    tmux('new-session', '-d', '-s', 'mine'); // a human's own session, on the same server
    // The server's defaults differ between tmux builds (`bg=green,fg=black`
    // on one, `bg=themegreen,fg=themeblack` on CI's macOS runner), so they are
    // read here and compared, never spelled.
    const defaults = ['status-style', 'status-left'].map((option) =>
      tmux('show-options', '-gv', option),
    );
    const coordinator = session(ward(['session', 'open', '--detach', '--json']));
    await openProject(ws, 'alpha');
    session(ward(['session', 'open', '--floor', '1', '--detach', '--json']));
    const [f0, f1] = [`${name}-f0-workspace`, `${name}-f1-alpha`];

    expect(theme(f0)).toEqual(['bg=colour250,fg=colour16', '#[bold] 🔧 f0 workspace #[nobold]']);
    expect(theme(f1)).toEqual(['bg=colour26,fg=colour231', '#[bold] 🌊 f1 alpha #[nobold]']);
    expect(sessionOption(f1, '@ward_color')).toBe('blue');
    expect(sessionOption(f1, '@ward_emoji')).toBe('🌊');
    // The coordinator's one window stands in both hosts; each shows it under its own theme.
    expect(windowsIn(f0)).toContain(coordinator.id);
    expect(windowsIn(f1)).toContain(coordinator.id);

    // Session options only: the server's defaults and the human's session are as they were.
    expect(
      ['status-style', 'status-left'].map((option) => tmux('show-options', '-gv', option)),
    ).toEqual(defaults);
    expect(tmux('show-options', '-t', '=mine:').trim()).toBe('');
  });

  test('a standing host and the view a client is looking through are re-dressed live, never re-created', async () => {
    await openProject(ws, 'alpha');
    const opened = session(ward(['session', 'open', '--floor', '1', '--detach', '--json']));
    const f1 = `${name}-f1-alpha`;
    const client = attach(['session', 'attach', opened.id]);
    await clientOn(`${f1}-v1`, client);
    expect(theme(`${f1}-v1`)).toEqual(theme(f1)); // the view wears the floor too
    await shown(client, '🌊 f1 alpha');

    const changed = ward([
      'project',
      'identity',
      '1',
      '--color',
      'pink',
      '--emoji',
      '🚀',
      '--json',
    ]);
    expect(JSON.parse(changed.stdout)).toMatchObject({
      outcome: 'changed',
      host: { outcome: 'themed', groups: [f1, `${f1}-v1`] },
    });
    const pink = ['bg=colour205,fg=colour16', '#[bold] 🚀 f1 alpha #[nobold]'];
    expect(theme(f1)).toEqual(pink);
    expect(theme(`${f1}-v1`)).toEqual(pink);
    // What the human sees changes under them: the new color and emoji, drawn.
    await shown(client, '🚀 f1 alpha');
    await shown(client, '48;5;205');
    // The same window, the same run: nothing was re-created to do it.
    expect(windowOption(opened.live?.window ?? '', '@ward_epoch')).toBe(opened.openedAt);
    expect(await runsSoon(1)).toHaveLength(1);

    tmux('detach-client', '-s', `=${f1}-v1`);
    expect(await exited(client)).toBe(0);
  });

  test('a host from before identities picks one up at the next open into it, or attach to it', async () => {
    const first = session(ward(['session', 'open', '--detach', '--json']));
    const f0 = `${name}-f0-workspace`;
    const undress = () => {
      for (const option of ['status-style', 'status-left', 'status-left-length']) {
        tmux('set-option', '-u', '-t', `=${f0}:`, option);
      }
      expect(theme(f0)).toEqual(['', '']);
    };

    undress(); // as an older ward left it
    session(ward(['session', 'open', '--detach', '--json']));
    expect(theme(f0)).toEqual(['bg=colour250,fg=colour16', '#[bold] 🔧 f0 workspace #[nobold]']);

    undress();
    const client = attach(['session', 'attach', first.id]);
    await clientOn(`${f0}-v1`, client);
    expect(theme(f0)).toEqual(['bg=colour250,fg=colour16', '#[bold] 🔧 f0 workspace #[nobold]']);
    expect(theme(`${f0}-v1`)).toEqual(theme(f0));
    tmux('detach-client', '-s', `=${f0}-v1`);
    expect(await exited(client)).toBe(0);
  });

  test('an observe view wears the floor; observing dresses nothing else', async () => {
    const opened = session(ward(['session', 'open', '--detach', '--json']));
    const f0 = `${name}-f0-workspace`;
    for (const option of ['status-style', 'status-left']) {
      tmux('set-option', '-u', '-t', `=${f0}:`, option);
    }
    const client = attach(['session', 'observe', opened.id]);
    await clientOn(`${f0}-o1`, client);
    expect(theme(`${f0}-o1`)).toEqual([
      'bg=colour250,fg=colour16',
      '#[bold] 🔧 f0 workspace #[nobold]',
    ]);
    expect(theme(f0)).toEqual(['', '']); // watching never changes what it watches
    tmux('detach-client', '-s', `=${f0}-o1`);
    expect(await exited(client)).toBe(0);
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
  return pty(['bun', cliPath, ...argv], size);
}

/** Run a command on a real pseudo-terminal, kept so no client outlives its case. */
function pty(
  command: string[],
  size: { cols: number; rows: number } = { cols: 100, rows: 30 },
): Client {
  let out = '';
  const decoder = new TextDecoder();
  const proc = Bun.spawn(command, {
    cwd: ws,
    env: { ...wardEnv(staying), ...TERM_ENV },
    terminal: {
      ...size,
      data(_terminal, bytes) {
        out += decoder.decode(bytes);
      },
    },
  });
  const client = { proc, output: () => out };
  clients.push(client);
  return client;
}

/** A human's own client: a raw `tmux attach` to one tmux session, on a real pseudo-terminal. */
function human(group: string): Client {
  return pty([TMUX ?? 'tmux', '-L', SOCKET, 'attach-session', '-t', `=${group}`]);
}

/**
 * A script that runs a ward verb from INSIDE a tmux pane — where tmux itself
 * sets `$TMUX` and the pane is the terminal — once `go` exists, and writes the
 * verb's exit code to `exit`. It then stays, so its tmux session does.
 */
function insideTmux(argv: string[]): { script: string; go: string; exit: string } {
  const [script, go, exit] = ['sh', 'go', 'exit'].map((kind) =>
    join(scratch, `inside-${caseId}.${kind}`),
  ) as [string, string, string];
  const env = wardEnv(staying);
  const exported = [
    'NO_COLOR',
    'WARD_CLAUDE_BIN',
    'WARD_TMUX_SOCKET',
    'CLAUDE_CONFIG_DIR',
    'WARD_CONFIG_DIR',
  ].map((key) => `export ${key}='${env[key] ?? ''}'`);
  writeFileSync(
    script,
    [
      '#!/bin/sh',
      ...exported,
      'unset WARD_AGENT',
      `cd '${ws}'`,
      `while [ ! -e '${go}' ]; do sleep 0.1; done`,
      `bun '${cliPath}' ${argv.join(' ')}`,
      `echo $? > '${exit}'`,
      'exec sleep 600',
      '',
    ].join('\n'),
  );
  return { script, go, exit };
}

/**
 * A stand-in harness a case can make leave the ordinary way: it stays until
 * `leave()` is called, then exits 0 — a human typing /exit, without a clock.
 */
function leavingStub(tag: string): { stub: string; leave(): void } {
  const signal = join(scratch, `leave-${caseId}-${tag}`);
  const stub = writeStub(
    `leave-${caseId}-${tag}.sh`,
    `while [ ! -e '${signal}' ]; do sleep 0.1; done\nexit 0`,
  );
  return { stub, leave: () => writeFileSync(signal, '') };
}

/** Wait until a hosted session reads gone: its run exited cleanly, and its window closed. */
async function goneSoon(id: string): Promise<SessionMutationShape> {
  let shown = session(ward(['session', 'show', id, '--json']));
  for (let i = 0; i < 100 && shown.live?.state !== 'gone'; i++) {
    await Bun.sleep(100);
    shown = session(ward(['session', 'show', id, '--json']));
  }
  if (shown.live?.state !== 'gone') {
    throw new Error(`session ${id} never read as gone: ${JSON.stringify(shown.live)}`);
  }
  return shown;
}

/** Wait until a hosted run has failed, its window kept — however long its start took. */
async function exitedSoon(id: string): Promise<SessionMutationShape> {
  let shown = session(ward(['session', 'show', id, '--json']));
  for (let i = 0; i < 100 && shown.live?.state !== 'exited'; i++) {
    await Bun.sleep(100);
    shown = session(ward(['session', 'show', id, '--json']));
  }
  if (shown.live?.state !== 'exited') {
    throw new Error(`session ${id} never read as exited: ${JSON.stringify(shown.live)}`);
  }
  return shown;
}

/** The tmux session every attached client is in, one entry per client. */
function clientSessions(): string[] {
  return tmux('list-clients', '-F', '#{client_session}')
    .split('\n')
    .filter((line) => line !== '');
}

/** Wait until `count` clients are attached and settled; the tmux session each is in. */
async function clientsSoon(count: number): Promise<string[]> {
  let seen = clientSessions();
  for (let i = 0; i < 100 && seen.length !== count; i++) {
    await Bun.sleep(100);
    seen = clientSessions();
  }
  return seen;
}

/** tmux's own id for a tmux session: a host ended and minted again answers with another. */
function tmuxId(group: string): string {
  return tmux('display-message', '-p', '-t', `=${group}:`, '#{session_id}').trim();
}

/** The ids of a host's windows, in window order. */
function windowIds(host: string): string[] {
  return tmux('list-windows', '-t', `=${host}:`, '-F', '#{window_id}')
    .split('\n')
    .filter((line) => line !== '');
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
async function clientOn(view: string, client?: Client): Promise<string> {
  // Up to 30s: a re-create-then-join round trip is slow on a loaded CI runner.
  for (let i = 0; i < 300; i++) {
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
    // A client that already exited will never attach: say what it printed.
    if (client !== undefined && client.proc.exitCode !== null) {
      throw new Error(
        `no client attached to ${view}: the attach exited ${client.proc.exitCode}: ${client.output()}`,
      );
    }
    await Bun.sleep(100);
  }
  const seen = client === undefined ? '' : `; the attach printed: ${client.output()}`;
  throw new Error(`no client attached to ${view}${seen}`);
}

async function groupsSoon(done: (names: string[]) => boolean): Promise<string[]> {
  let names: string[] = [];
  for (let i = 0; i < 50; i++) {
    names = tmux('list-sessions', '-F', '#{session_name}')
      .split('\n')
      .filter((line) => line !== '' && line.startsWith(`${name}-f`));
    if (done(names)) return names;
    await Bun.sleep(100);
  }
  return names;
}

/** The pid of the one client looking at a tmux session — empty when none is. */
function clientOf(view: string): string {
  const rows = tmux('list-clients', '-F', '#{client_session}\t#{client_pid}').split('\n');
  return rows.find((row) => row.startsWith(`${view}\t`))?.split('\t')[1] ?? '';
}

function activeWindow(group: string): string {
  return tmux('display-message', '-p', '-t', `=${group}:`, '#{window_id}').trim();
}

/** What a tmux session's status line wears: its style, and its left edge (trimmed). */
function theme(group: string): string[] {
  return [sessionOption(group, 'status-style'), sessionOption(group, 'status-left')];
}

/** Wait until a client's terminal has been sent `text`. */
async function shown(client: Client, text: string): Promise<void> {
  for (let i = 0; i < 100; i++) {
    if (client.output().includes(text)) return;
    await Bun.sleep(100);
  }
  throw new Error(`the client was never shown ${JSON.stringify(text)}`);
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
  const stderr = result.stderr.toString();
  // A server holding no sessions answers a list with "no current target" — an
  // empty answer, as Ward's own host reads it (0031 phase 2), not a failure.
  if (result.exitCode !== 0 && args[0]?.startsWith('list-') && /no current target/.test(stderr)) {
    return '';
  }
  if (result.exitCode !== 0) throw new Error(`tmux ${args.join(' ')}: ${stderr}`);
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

/** The names of a host's windows, in window order — what a human reads. */
function windowNames(host: string): string[] {
  return tmux('list-windows', '-t', `=${host}:`, '-F', '#{window_name}')
    .split('\n')
    .filter((line) => line !== '');
}

/** Whether the client's terminal was handed exactly this title (tmux writes OSC 0 or 2). */
async function titleSoon(client: Client, title: string): Promise<boolean> {
  for (let i = 0; i < 100; i++) {
    const out = client.output();
    if (out.includes(`\u001b]0;${title}\u0007`) || out.includes(`\u001b]2;${title}\u0007`)) {
      return true;
    }
    await Bun.sleep(100);
  }
  return false;
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

/**
 * The private server, started with no configuration file, so neither a human's
 * ~/.tmux.conf nor their running server is involved. Started fresh for every
 * case and ended after it: each case leaves panes (stub runs, kept dead
 * windows) and clients holding ptys, and a macOS runner's pty supply is small
 * enough that one server kept across the whole suite ran out ("fork failed:
 * Device not configured").
 */
function startServer(): void {
  if (TMUX === null) return;
  const env: Record<string, string | undefined> = { ...process.env };
  delete env.WARD_AGENT;
  delete env.TMUX;
  Bun.spawnSync(
    [TMUX, '-L', SOCKET, '-f', '/dev/null', 'start-server', ';', 'set', '-s', 'exit-empty', 'off'],
    { env },
  );
}

/** Every attach and observe client a case spawns, so none outlives its case. */
const clients: Client[] = [];

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
  startServer();
  if (TMUX !== null) tmux('set-environment', '-g', 'WARD_TEST_RUNS', runLog);
  staying = writeStub(`stay-${caseId}.sh`, 'exec sleep 600');
  exiting = writeStub(`exit3-${caseId}.sh`, 'exit 3');
  exitingZero = writeStub(`exit0-${caseId}.sh`, 'exit 0');
  await createWorkspace(ws);
});

afterEach(() => {
  for (const client of clients.splice(0)) {
    if (client.proc.exitCode === null) client.proc.kill();
  }
  if (TMUX !== null) killServer(SOCKET);
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
