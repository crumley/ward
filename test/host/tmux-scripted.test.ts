// The tmux host over a SCRIPTED tmux (design/0073-scripted-tmux-runner/): no
// server, no process, milliseconds a case. Three kinds of case:
//
// - every conformance scenario, played back from its committed transcript —
//   the same assertions the live tier proves on a real tmux;
// - fault cases, for the branches no real tmux can be made to take on cue (a
//   call that times out, a program that cannot start, an error where tmux
//   gave none, a poll that never settles): each scripts the calls the host
//   makes with the pinned argv builders, and every call it scripts must have
//   been sent to a real tmux by some conformance scenario — only the answer
//   is made up, and the answer is the fault under test;
// - the mechanism itself: a host that strays from its script, or stops short
//   of it, fails naming the step; the normalizer.
import { describe, expect, test } from 'bun:test';
import { claudeInputLine } from '../../src/harness/claude.ts';
import type { SessionHost } from '../../src/host/host.ts';
import {
  attachViewArgv,
  captureArgv,
  createGroupArgv,
  createWindowArgv,
  endViewArgv,
  enterArgv,
  eraseArgv,
  killWindowArgv,
  linkWindowArgv,
  listGroupsArgv,
  listPanesArgv,
  observeViewArgv,
  paneStateArgv,
  prepareArgv,
  renameGroupArgv,
  startRunArgv,
  submitArgv,
  themeArgv,
  titleGroupArgv,
  typeArgv,
  watchArgv,
  windowRunArgv,
  windowTagArgv,
  windowTarget,
} from '../../src/host/tmux.ts';
import {
  call,
  normalize,
  type Playback,
  playback,
  readTranscript,
  SCRATCH,
  type Step,
  transcriptNames,
} from './scripted-tmux.ts';
import { BLUE, epoch, F0, F1, RULE, request, SCENARIOS, SILVER, WS } from './tmux-scenarios.ts';

describe('every scenario, played back from its transcript', () => {
  test.each(SCENARIOS.map((scenario) => [scenario.name, scenario] as const))(
    '%s',
    async (name, scenario) => {
      const played = playback(name, readTranscript(name).steps);
      await scenario.run(played.stage);
      played.finish();
    },
  );

  test('every transcript is a scenario’s, and every scenario has one', () => {
    expect(transcriptNames()).toEqual(SCENARIOS.map((scenario) => scenario.name).sort());
  });
});

// -- check, and the call itself -------------------------------------------------

test.each<[string, Partial<Step>, ReturnType<SessionHost['check']>]>([
  [
    'a program that cannot start',
    { unstartable: 'ENOENT: no such file' },
    { usable: false, reason: 'tmux: ENOENT: no such file' },
  ],
  ['a version query that fails silently', { exit: 1 }, { usable: false, reason: 'tmux -V failed' }],
  [
    'a tmux below the floor',
    { stdout: 'tmux 3.1c\n' },
    { usable: false, reason: 'tmux 3.1c is older than tmux 3.2' },
  ],
  [
    'a build from master, unreadable: not refused',
    { stdout: 'tmux next-3.8\n' },
    { usable: true, version: 'tmux next-3.8' },
  ],
])('check: %s', (_, reply, expected) => {
  const { host, played } = scripted([
    { ...call(['-V'], { stdout: 'tmux 3.7c\n' }), ...reply } as Step,
  ]);
  expect(host.check()).toEqual(expected);
  played.finish();
});

test.each<[string, Partial<Step>, ReturnType<SessionHost['find']>]>([
  [
    'a call that times out is could-not-determine, saying so',
    { exit: null, timedOut: true },
    { outcome: 'unknown', reason: 'tmux did not answer in 5000ms' },
  ],
  [
    'a socket nobody answers on is no server: an empty answer',
    { exit: 1, stderr: `error connecting to ${'<socket>'} (Connection refused)\n` },
    { outcome: 'answered', windows: [] },
  ],
  [
    'an error is could-not-determine, with tmux’s words',
    { exit: 1, stderr: 'server exploded\n' },
    { outcome: 'unknown', reason: 'server exploded' },
  ],
  [
    'an error with no words is still could-not-determine',
    { exit: 1 },
    { outcome: 'unknown', reason: 'tmux failed without a reason' },
  ],
  [
    'a program that cannot start is could-not-determine',
    { unstartable: 'EACCES' },
    { outcome: 'unknown', reason: 'tmux: EACCES' },
  ],
])('find: %s', (_, reply, expected) => {
  const { host, played } = scripted([{ ...call(listPanesArgv()), ...reply } as Step]);
  expect(host.find('coord')).toEqual(expected);
  played.finish();
});

test.each<[string, Step[], ReturnType<SessionHost['inventory']>]>([
  [
    'the sessions cannot be listed',
    [call(listGroupsArgv(), { exit: 1, stderr: 'boom' })],
    { outcome: 'unknown', reason: 'boom' },
  ],
  [
    'the sessions cannot be listed, wordlessly',
    [call(listGroupsArgv(), { exit: 1 })],
    { outcome: 'unknown', reason: 'tmux failed without a reason' },
  ],
  [
    'the panes cannot be listed',
    [call(listGroupsArgv()), call(listPanesArgv(), { exit: 1, stderr: 'boom' })],
    { outcome: 'unknown', reason: 'boom' },
  ],
])('inventory: %s → could-not-determine', (_, steps, expected) => {
  const { host, played } = scripted(steps);
  expect(host.inventory()).toEqual(expected);
  played.finish();
});

test.each<[string, Partial<Step>, ReturnType<SessionHost['inheritedEnv']>]>([
  ['an error', { exit: 1, stderr: 'boom' }, { outcome: 'unknown', reason: 'boom' }],
  [
    'an error with no words',
    { exit: 1 },
    { outcome: 'unknown', reason: 'tmux failed without a reason' },
  ],
])('inheritedEnv: %s → could-not-determine', (_, reply, expected) => {
  const { host, played } = scripted([{ ...call(['show-environment', '-g']), ...reply } as Step]);
  expect(host.inheritedEnv()).toEqual(expected);
  played.finish();
});

test.each<[string, string]>([
  ['permission denied', 'tmux could not start its server: permission denied'],
  ['', 'tmux could not start its server: no reason given'],
])('prepare: a server that cannot start (%p) throws, with the reason', (stderr, message) => {
  const { host, played } = scripted([call(prepareArgv(), { exit: 1, stderr })]);
  expect(() => host.prepare()).toThrow(message);
  played.finish();
});

// -- place ------------------------------------------------------------------------

describe('place', () => {
  const coord = request({ scratch: SCRATCH }, 'coord', { floats: true, identity: SILVER });
  const created = (): Step[] => [
    call(listGroupsArgv()),
    call(createGroupArgv(F0, coord.group, coord.version, coord.naming), { stdout: '@1\t0\n' }),
    call(createWindowArgv(F0, 'coord'), { stdout: '@2\t%1\n' }),
    call(startRunArgv('@2', '%1', coord)),
    call(killWindowArgv('@1')),
    call(themeArgv(F0, SILVER)),
    call(listGroupsArgv(), { stdout: rows([F0, WS, 0], [F1, WS, 1]) }),
    call(linkWindowArgv('@2', F1)),
  ];

  test('the whole of it, scripted: a new host, its run, its theme, its float', () => {
    const { host, played } = scripted(created());
    expect(host.place(coord)).toEqual({
      group: F0,
      window: '@2',
      createdGroup: true,
      linkedInto: [F1],
    });
    played.finish();
  });

  test.each<[string, number, Partial<Step>, string]>([
    [
      'the sessions cannot be listed',
      0,
      { exit: 1, stderr: 'boom' },
      'tmux could not list its sessions: boom',
    ],
    [
      'the host cannot be made',
      1,
      { exit: 1, stderr: 'bad' },
      `tmux could not create host ${F0}: bad`,
    ],
    [
      'the window cannot be made',
      2,
      { exit: 1, stderr: 'no space' },
      `tmux could not create a window in ${F0}: no space`,
    ],
    [
      'the run cannot be started',
      3,
      { exit: 1 },
      'tmux could not start the run in @2: no reason given',
    ],
    [
      'the placeholder cannot be cleared',
      4,
      { exit: 1, stderr: 'odd' },
      'tmux could not clear the placeholder: odd',
    ],
    [
      'the float cannot be linked',
      7,
      { exit: 1, stderr: 'no room' },
      `tmux could not link @2 into ${F1}: no room`,
    ],
  ])('throws when %s', (_, at, reply, message) => {
    const steps = created()
      .slice(0, at + 1)
      .map((step, i) => (i === at ? ({ ...step, ...reply } as Step) : step));
    const { host, played } = scripted(steps);
    expect(() => host.place(coord)).toThrow(message);
    played.finish();
  });

  test('a theme that fails is passed over: a run never fails to start over a status line', () => {
    const steps = created().map((step, i) =>
      i === 5 ? ({ ...step, exit: 1, stderr: 'bad style' } as Step) : step,
    );
    const { host, played } = scripted(steps);
    expect(host.place(coord)).toMatchObject({ group: F0, linkedInto: [F1] });
    played.finish();
  });

  test('a run already over when it is linked is not a failed launch: the links stop, the placement stands', () => {
    // What a run that exits 0 before the link leaves behind (EXIT_RULE): tmux no longer knows the window.
    const steps = created().map((step, i) =>
      i === 7 ? ({ ...step, exit: 1, stderr: "can't find window: @2\n" } as Step) : step,
    );
    const { host, played } = scripted(steps);
    expect(host.place(coord)).toEqual({
      group: F0,
      window: '@2',
      createdGroup: true,
      linkedInto: [],
    });
    played.finish();
  });

  test('of two hosts stamped for one floor, the older is placed into — whatever the listing order', () => {
    const helper = request({ scratch: SCRATCH }, 'helper');
    const { host, played } = scripted([
      call(listGroupsArgv(), { stdout: rows([F0, WS, 0, 9], ['main-f0-older', WS, 0, 3]) }),
      call(createWindowArgv('main-f0-older', 'helper'), { stdout: '@5\t%5\n' }),
      call(startRunArgv('@5', '%5', helper)),
    ]);
    expect(host.place(helper)).toEqual({
      group: 'main-f0-older',
      window: '@5',
      createdGroup: false,
      linkedInto: [],
    });
    played.finish();
  });

  test('a floating window found dead, and the run’s own tags, are not linked into a new host', () => {
    const alpha = request({ scratch: SCRATCH }, 'alpha', {
      floor: 1,
      floating: ['coord', 'alpha'],
      identity: BLUE,
    });
    const dead = pane([F0, '@2', '%1', '1', '3', '', 'coord', epoch('coord'), '%1', WS, '0']);
    const { host, played } = scripted([
      call(listGroupsArgv(), { stdout: rows([F0, WS, 0]) }),
      call(createGroupArgv(F1, alpha.group, alpha.version, alpha.naming), { stdout: '@3\t0\n' }),
      call(listPanesArgv(), { stdout: dead }),
      call(createWindowArgv(F1, 'alpha'), { stdout: '@4\t%2\n' }),
      call(startRunArgv('@4', '%2', alpha)),
      call(killWindowArgv('@3')),
      call(themeArgv(F1, BLUE)),
    ]);
    expect(host.place(alpha)).toMatchObject({ group: F1, createdGroup: true });
    played.finish();
  });
});

// -- close and link ---------------------------------------------------------------

test.each<[string, Step[], ReturnType<SessionHost['close']>]>([
  [
    'a tag read tmux refuses for a window it does not hold',
    [call(windowTagArgv('@2'), { exit: 1, stderr: "can't find window: @2" })],
    { outcome: 'absent' },
  ],
  [
    'a tag read that errors otherwise',
    [call(windowTagArgv('@2'), { exit: 1, stderr: 'boom' })],
    { outcome: 'unknown', reason: 'boom' },
  ],
  [
    'a window gone between the read and the kill',
    [
      call(windowTagArgv('@2'), { stdout: 'coord\n' }),
      call(killWindowArgv('@2'), { exit: 1, stderr: "can't find window: @2" }),
    ],
    { outcome: 'absent' },
  ],
  [
    'a kill that errors otherwise',
    [
      call(windowTagArgv('@2'), { stdout: 'coord\n' }),
      call(killWindowArgv('@2'), { exit: 1, stderr: 'boom' }),
    ],
    { outcome: 'unknown', reason: 'boom' },
  ],
])('close: %s', (_, steps, expected) => {
  const { host, played } = scripted(steps);
  expect(host.close('@2', 'coord')).toEqual(expected);
  played.finish();
});

test.each<[string, Step[], string]>([
  [
    'the host’s windows cannot be listed',
    [
      call(['list-windows', '-t', windowTarget(F1), '-F', '#{window_id}'], {
        exit: 1,
        stderr: 'gone',
      }),
    ],
    'tmux could not list: gone',
  ],
  [
    'the link fails',
    [
      call(['list-windows', '-t', windowTarget(F1), '-F', '#{window_id}'], { stdout: '@3\n' }),
      call(linkWindowArgv('@2', F1), { exit: 1, stderr: 'no room' }),
    ],
    `tmux could not link @2 into ${F1}: no room`,
  ],
])('link throws when %s', (_, steps, message) => {
  const { host, played } = scripted(steps);
  expect(() => host.link('@2', F1)).toThrow(message);
  played.finish();
});

// -- typing a line ------------------------------------------------------------------

describe('typeLine', () => {
  const TEXT = 'hello';
  const type = (host: SessionHost) =>
    host.typeLine({ window: '@2', session: 'target', text: TEXT, inputLine: claudeInputLine });
  const tagged = (): Step[] => [
    call(windowRunArgv('@2'), { stdout: 'target\t%1\n' }),
    call(paneStateArgv('%1'), { stdout: '@2\t0\t0\n' }),
  ];
  // A screen read, answered again for as long as the host keeps asking.
  const capture = (screen: string): Step => call(['-u', ...captureArgv('%1')], { stdout: screen });

  test.each<[string, Step[], ReturnType<SessionHost['typeLine']>, number?]>([
    [
      'the window read errors with a gone pane',
      [call(windowRunArgv('@2'), { exit: 1, stderr: "can't find pane: %1" })],
      { outcome: 'absent' },
    ],
    [
      'the window read errors otherwise',
      [call(windowRunArgv('@2'), { exit: 1, stderr: 'boom' })],
      { outcome: 'unknown', reason: 'boom' },
    ],
    [
      'the window carries its tag but names no pane',
      [call(windowRunArgv('@2'), { stdout: 'target\t\n' })],
      { outcome: 'withheld', reason: "window @2 carries 'target', not 'target'" },
    ],
    [
      'the pane read errors with a gone pane',
      [tagged()[0] as Step, call(paneStateArgv('%1'), { exit: 1, stderr: "can't find pane: %1" })],
      { outcome: 'absent' },
    ],
    [
      'the pane read errors otherwise',
      [tagged()[0] as Step, call(paneStateArgv('%1'), { exit: 1, stderr: 'boom' })],
      { outcome: 'unknown', reason: 'boom' },
    ],
    [
      'the run’s pane was moved to another window',
      [tagged()[0] as Step, call(paneStateArgv('%1'), { stdout: '@7\t0\t0\n' })],
      { outcome: 'withheld', reason: "the run's pane is no longer in window @2" },
    ],
    [
      'the screen cannot be read',
      [...tagged(), { ...capture(''), exit: 1, stderr: 'boom' }],
      { outcome: 'withheld', reason: 'its screen does not show an input line' },
    ],
    [
      'typing fails',
      [...tagged(), capture(prompt('')), call(typeArgv('%1', TEXT), { exit: 1 })],
      { outcome: 'unknown', reason: 'tmux gave no reason' },
    ],
    [
      'the screen stops showing an input line as the line is typed',
      [...tagged(), capture(prompt('')), call(typeArgv('%1', TEXT)), capture(QUESTION)],
      {
        outcome: 'unknown',
        reason:
          'its screen stopped showing an input line as the line was typed — not submitted; ' +
          'the typed text may have gone to whatever took its place',
      },
      20,
    ],
    [
      'the line reads back as something else entirely',
      [...tagged(), capture(prompt('')), call(typeArgv('%1', TEXT)), capture(prompt('goodbye'))],
      {
        outcome: 'unknown',
        reason: 'its input line did not read back as typed — not submitted; the text may remain',
      },
      20,
    ],
    [
      'held text cannot be erased',
      [
        ...tagged(),
        capture(prompt('')),
        call(typeArgv('%1', TEXT)),
        capture(prompt(`draft ${TEXT}`)),
        call(eraseArgv('%1', TEXT.length), { exit: 1 }),
      ],
      {
        outcome: 'unknown',
        reason: 'its input line did not read back as typed — not submitted; the text may remain',
      },
      20,
    ],
    [
      'held text erased never reads as it was',
      [
        ...tagged(),
        capture(prompt('')),
        call(typeArgv('%1', TEXT)),
        capture(prompt(`draft ${TEXT}`)),
        call(eraseArgv('%1', TEXT.length)),
        capture(prompt(`draft ${TEXT}x`)),
      ],
      {
        outcome: 'unknown',
        reason: 'its input line did not read back as typed — not submitted; the text may remain',
      },
      40,
    ],
    [
      'the submitting key fails',
      [
        ...tagged(),
        capture(prompt('')),
        call(typeArgv('%1', TEXT)),
        capture(prompt(TEXT)),
        call(submitArgv('%1'), { exit: 1, stderr: 'boom' }),
      ],
      { outcome: 'unknown', reason: 'boom' },
    ],
    [
      'the line is still there after it was submitted',
      [
        ...tagged(),
        capture(prompt('')),
        call(typeArgv('%1', TEXT)),
        capture(prompt(TEXT)),
        call(submitArgv('%1')),
        capture(prompt(TEXT)),
      ],
      { outcome: 'unknown', reason: 'typed and submitted, but the line is still there' },
      20,
    ],
    [
      'the screen leaves its input line once submitted (a turn begins): typed',
      [
        ...tagged(),
        capture(prompt('')),
        call(typeArgv('%1', TEXT)),
        capture(prompt(TEXT)),
        call(submitArgv('%1')),
        capture(QUESTION),
      ],
      { outcome: 'typed' },
    ],
  ])('%s', (_, steps, expected, pauses = 0) => {
    const { host, played } = scripted(steps);
    expect(type(host)).toEqual(expected);
    played.finish();
    // Each wait is bounded: 2s of 100ms polls, never longer.
    expect(played.pauses).toBe(pauses);
  });
});

// -- rename -----------------------------------------------------------------------

describe('rename', () => {
  const naming = { name: F0, title: 'main f0', identity: SILVER };

  test('a listing that fails is reported, and nothing is touched', () => {
    const { host, played } = scripted([call(listGroupsArgv(), { exit: 1, stderr: 'boom' })]);
    expect(host.rename({ groups: [{ name: 'old', naming }], windows: [] })).toEqual({
      groups: [],
      views: [],
      failed: ['tmux could not list its sessions: boom'],
      themed: [],
    });
    played.finish();
  });

  test('every step that fails is reported and the rest still run, under the name it kept', () => {
    // A view named for no host: due a name after the host as it is called now.
    const views = [{ name: 'stale-v1', mode: 'attach' as const }];
    const { host, played } = scripted([
      call(listGroupsArgv(), { stdout: rows(['old', WS, 0], ['stale-v1', '', '', 1, 'G', WS]) }),
      call(renameGroupArgv('old', F0), { exit: 1, stderr: 'nope' }),
      call(titleGroupArgv('old', naming), { exit: 1 }),
      call(themeArgv('old', SILVER), { exit: 1, stderr: 'bad style' }),
      call(renameGroupArgv('stale-v1', 'old-v1'), { exit: 1, stderr: 'held' }),
      call(titleGroupArgv('stale-v1', naming, 'attach'), { exit: 1, stderr: 'no title' }),
    ]);
    expect(host.rename({ groups: [{ name: 'old', naming, views }], windows: [] })).toEqual({
      groups: [],
      views: [],
      failed: [
        'old: nope',
        'old: tmux gave no reason',
        'old: bad style',
        'stale-v1: held',
        'stale-v1: no title',
      ],
      // A host that could not be dressed dresses none of its views either.
      themed: [],
    });
    played.finish();
  });
});

// -- views and entering them ----------------------------------------------------------

describe('view', () => {
  const asked = { group: F0, window: '@2', workspace: WS, title: 'main f0' };
  const duplicate = (name: string) => ({ exit: 1, stderr: `duplicate session: ${name}` });

  test('a name another view takes in the meantime: the next free one is tried', () => {
    const { host, played } = scripted([
      call(listGroupsArgv(), { stdout: rows([F0, WS, 0]) }),
      call(attachViewArgv(F0, `${F0}-v1`, WS, '@2', asked), duplicate(`${F0}-v1`)),
      call(listGroupsArgv(), { stdout: rows([F0, WS, 0], [`${F0}-v1`, '', '', 0, F0, WS]) }),
      call(attachViewArgv(F0, `${F0}-v2`, WS, '@2', asked)),
    ]);
    expect(host.view({ ...asked, mode: 'attach' })).toEqual({ name: `${F0}-v2`, mode: 'attach' });
    played.finish();
  });

  test('five names taken in turn: refused, with tmux’s last word', () => {
    const steps: Step[] = [];
    for (let n = 1; n <= 5; n++) {
      const taken = Array.from(
        { length: n - 1 },
        (_, i): Row => [`${F0}-o${i + 1}`, '', '', 0, '', WS],
      );
      steps.push(call(listGroupsArgv(), { stdout: rows([F0, WS, 0], ...taken) }));
      steps.push(call(observeViewArgv(`${F0}-o${n}`, WS, asked), duplicate(`${F0}-o${n}`)));
    }
    const { host, played } = scripted(steps);
    expect(() => host.view({ ...asked, mode: 'observe' })).toThrow(
      `tmux could not make a view of @2: duplicate session: ${F0}-o5`,
    );
    played.finish();
  });

  test('an observe view that cannot be made, and one dressed with a theme that fails', () => {
    const failing = scripted([
      call(listGroupsArgv()),
      call(observeViewArgv(`${F0}-o1`, WS, asked), { exit: 1, stderr: 'no memory' }),
    ]);
    expect(() => failing.host.view({ ...asked, mode: 'observe' })).toThrow(
      'tmux could not make a view of @2: no memory',
    );
    failing.played.finish();

    const dressed = { ...asked, identity: SILVER };
    const { host, played } = scripted([
      call(listGroupsArgv()),
      call(observeViewArgv(`${F0}-o1`, WS, dressed), { stdout: '@9\n' }),
      call(watchArgv(`${F0}-o1`, '@9', '@2')),
      call(themeArgv(`${F0}-o1`, SILVER), { exit: 1, stderr: 'bad style' }),
    ]);
    expect(host.view({ ...dressed, mode: 'observe' })).toEqual({
      name: `${F0}-o1`,
      mode: 'observe',
    });
    played.finish();
  });
});

describe('enter', () => {
  const view = { name: `${F0}-v1`, mode: 'attach' as const };
  const where = call([
    'display-message',
    '-p',
    '-t',
    windowTarget(view.name),
    '#{socket_path}\t#{session_id}',
  ]);

  test('a view whose whereabouts cannot be read is joined, and not ended by Ward', async () => {
    const { host, played } = scripted([
      { ...where, exit: 1, stderr: "can't find session" },
      { kind: 'client', argv: enterArgv(view, false), exit: 0, stderr: '' },
    ]);
    expect(await host.enter(view)).toBe(0);
    played.finish();
  });

  test('a hang-up while the client is joined is passed on, and the view is ended after it', async () => {
    const { host, played } = scripted([
      { ...where, stdout: '<socket>\t$4\n' },
      { kind: 'client', argv: enterArgv(view, false), exit: 129, stderr: '' },
      call(endViewArgv('$4')),
    ]);
    const entered = host.enter(view);
    process.emit('SIGHUP', 'SIGHUP');
    expect(await entered).toBe(129);
    expect(played.kills).toEqual(['SIGHUP']);
    // Ward stopped standing by: a signal after it is no longer passed on.
    expect(process.listenerCount('SIGHUP')).toBe(0);
    played.finish();
  });
});

// -- the mechanism ---------------------------------------------------------------------

describe('the scripted tmux itself', () => {
  test('a host that sends what the transcript does not hold fails, naming the step and the remedy', async () => {
    const steps = readTranscript('place-a-host').steps.map((step, i) =>
      i === 2 ? { ...step, argv: ['list-sessions', '-F', '#{session_name}'] } : step,
    );
    const played = playback('place-a-host', steps);
    await expect(
      Promise.resolve().then(() => scenario('place-a-host').run(played.stage)),
    ).rejects.toThrow();
    expect(() => played.finish()).toThrow(
      /place-a-host, step 3: the host sent run \[.*\], but the transcript has run \["list-sessions","-F","#\{session_name\}"\] — re-record it \(WARD_RECORD_TMUX=1/,
    );
  });

  test('a host that stops short of its transcript fails, naming what it left', () => {
    const played = playback('x', [call(['-V'], { stdout: 'tmux 3.7c\n' }), call(prepareArgv())]);
    played.stage.host().check();
    expect(() => played.finish()).toThrow(
      'x: the host stopped at step 2 of 2; the transcript goes on with run ["start-server"',
    );
  });

  test('normalizing: ids tmux issued are numbered by first answer, made-up ones kept; places, times, versions, repeated polls', () => {
    const where = { scratch: '/tmp/ward-test-abc', socket: 'ward-conf-1-x' };
    const steps: Step[] = [
      call(['-V'], { stdout: 'tmux 3.7c\n' }),
      call(['new-window', '-P', '-c', '/tmp/ward-test-abc/w'], { stdout: '@7\t%12\n' }),
      call(['kill-window', '-t', '@7', ';', 'kill-window', '-t', '@999']),
      call(['display-message', '-p', '#{socket_path}\t#{session_created}'], {
        stdout: '/private/tmp/tmux-501/ward-conf-1-x\t1763424000\n',
      }),
      call(['-u', 'capture-pane', '-p', '-t', '%12'], { stdout: 'A' }),
      call(['send-keys', '-t', '%12', 'x']),
      call(['-u', 'capture-pane', '-p', '-t', '%12'], { stdout: 'A' }),
      call(['-u', 'capture-pane', '-p', '-t', '%12'], { stdout: 'B' }),
    ];
    expect(
      normalize(steps, where).map((step) => [step.argv, 'stdout' in step ? step.stdout : '']),
    ).toEqual([
      [['-V'], 'tmux <version>\n'],
      [['new-window', '-P', '-c', '<scratch>/w'], '@1\t%1\n'],
      [['kill-window', '-t', '@1', ';', 'kill-window', '-t', '@999'], ''],
      [['display-message', '-p', '#{socket_path}\t#{session_created}'], '<socket>\t1\n'],
      [['-u', 'capture-pane', '-p', '-t', '%1'], 'A'],
      [['send-keys', '-t', '%1', 'x'], ''],
      [['-u', 'capture-pane', '-p', '-t', '%1'], 'B'],
    ]);
  });
});

// -- scaffolding ---------------------------------------------------------------------

/**
 * A host over a fault case's script — refused when the script holds a call no
 * conformance scenario ever sent a real tmux: only the answers are made up.
 */
function scripted(steps: readonly Step[]): { host: SessionHost; played: Playback } {
  for (const step of steps) {
    if (step.kind === 'outside') continue;
    if (!SEEN.has(shape(step.argv))) {
      throw new Error(
        `a fault case scripts ${JSON.stringify(step.argv)}, which no conformance scenario sent a real tmux`,
      );
    }
  }
  const played = playback('fault case', steps);
  return { host: played.stage.host(), played };
}

/**
 * The form of a call: each command in it, with its flags and formats — not
 * its names, ids, or values, which a fault case is free to choose.
 */
function shape(argv: readonly string[]): string {
  const commands: string[][] = [[]];
  for (const word of argv) {
    if (word === ';') commands.push([]);
    else commands.at(-1)?.push(word);
  }
  return JSON.stringify(
    commands.map(([name = '', ...rest]) => [
      name,
      ...rest.filter((word) => /^-[A-Za-z]+$/.test(word) || word.includes('#{')),
    ]),
  );
}

const SEEN = new Set(
  transcriptNames().flatMap((name) =>
    readTranscript(name)
      .steps.filter((step) => step.kind !== 'outside')
      .map((step) => shape(step.argv)),
  ),
);

/** A screen with the stand-in's input line holding `text`. */
function prompt(text: string): string {
  return `${RULE}\n❯ ${text}\n${RULE}\n  stub status\n${'\n'.repeat(36)}`;
}

const QUESTION = `${RULE}\n Bash command\n Do you want to proceed?\n ❯ 1. Yes\n   2. No\n`;

/** A `list-sessions` row: name, workspace and floor stamps, created, group, view stamp. */
type Row = [string, string, string | number, number?, string?, string?];

function rows(...each: Row[]): string {
  return each
    .map(([name, workspace, floor, created = 1, group = '', view = '']) =>
      [
        name,
        workspace,
        String(floor),
        view,
        String(created),
        '0',
        workspace === '' ? '' : '0.1.0',
        '1',
        group,
      ].join('\t'),
    )
    .map((line) => `${line}\n`)
    .join('');
}

function pane(fields: string[]): string {
  return `${fields.join('\t')}\n`;
}

function scenario(name: string) {
  const found = SCENARIOS.find((each) => each.name === name);
  if (found === undefined) throw new Error(`no scenario ${name}`);
  return found;
}
