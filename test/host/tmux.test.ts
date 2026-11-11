// The tmux host's pure half (design/0031-detached-session-hosting/, ADR 0006):
// host-name minting and munging, exact-match targets, the argv the adapter
// hands tmux, and how it reads tmux's answers back. Tables, no tmux — the
// real server is test/host/tmux-live.test.ts's.
import { expect, test } from 'bun:test';
import {
  attachViewArgv,
  belowFloor,
  commandArgs,
  createGroupArgv,
  createWindowArgv,
  enterArgv,
  insideServer,
  linkWindowArgv,
  mintGroupName,
  observeViewArgv,
  parseEnvironmentNames,
  parseGroups,
  parseInventoryWindows,
  parseVersion,
  parseWindows,
  prepareArgv,
  sessionTarget,
  shellQuote,
  startRunArgv,
  tmuxHost,
  viewName,
  windowTarget,
} from '../../src/host/tmux.ts';

test.each([
  ['main', 0, 'ward-main-f0'],
  ['main', 12, 'ward-main-f12'],
  ['my work', 3, 'ward-my-work-f3'],
  ['a.b:c', 1, 'ward-a-b-c-f1'], // `.` and `:` are tmux target syntax
  ['ünï', 2, 'ward--n--f2'],
  ['under_score-ok', 4, 'ward-under_score-ok-f4'],
])('the host minted for %p floor %p is %p', (name, floor, expected) => {
  expect(mintGroupName(name, floor)).toBe(expected);
});

test('every name target is exact-match; windows and panes are addressed by id', () => {
  expect(sessionTarget('ward-main-f0')).toBe('=ward-main-f0');
  expect(windowTarget('ward-main-f0')).toBe('=ward-main-f0:');
  expect(windowTarget('ward-main-f0', '3')).toBe('=ward-main-f0:3');
  expect(linkWindowArgv('@4', 'ward-main-f2', '0')).toEqual([
    'link-window',
    '-d',
    '-k',
    '-s',
    '@4',
    '-t',
    '=ward-main-f2:0',
  ]);
  expect(linkWindowArgv('@4', 'ward-main-f2')).toEqual([
    'link-window',
    '-d',
    '-s',
    '@4',
    '-t',
    '=ward-main-f2:',
  ]);
});

test('the hygiene preamble carries no path, and keeps an empty server alive', () => {
  expect(prepareArgv()).toEqual(['start-server', ';', 'set-option', '-s', 'exit-empty', 'off']);
});

test("a host is created at the detached size, stamped, and holding nothing of a session's", () => {
  const argv = createGroupArgv(
    'ward-main-f3',
    { workspace: 'ws-id-0123456789ab', floor: 3 },
    '0.1.0',
  );
  expect(argv.slice(0, 8)).toEqual([
    'new-session',
    '-d',
    '-s',
    'ward-main-f3',
    '-x',
    '120',
    '-y',
    '40',
  ]);
  expect(argv).not.toContain('-e'); // the host's environment is inherited by every window
  expect(options(argv)).toEqual([
    ['=ward-main-f3:', '@ward_workspace', 'ws-id-0123456789ab'],
    ['=ward-main-f3:', '@ward_floor', '3'],
    ['=ward-main-f3:', '@ward_version', '0.1.0'],
    ['=ward-main-f3:', 'detach-on-destroy', 'off'],
  ]);
});

test('the window is created holding, then tagged, kept, and only then started', () => {
  expect(createWindowArgv('ward-main-f0', 'workspace-1@mbp')).toEqual([
    'new-window',
    '-d',
    '-P',
    '-F',
    '#{window_id}\t#{pane_id}',
    '-t',
    '=ward-main-f0:',
    '-n',
    'workspace-1@mbp',
    'cat',
  ]);
  const argv = startRunArgv('@7', '%9', {
    tags: { session: 'workspace-1@mbp', epoch: '2026-11-08T10:00:00.000Z' },
    cwd: '/w/main',
    env: { WARD_AGENT: 'workspace-1@mbp' },
    command: ['claude', '--session-id', 'abc'],
  });
  const respawn = argv.indexOf('respawn-pane');
  expect(options(argv.slice(0, respawn))).toEqual([
    ['@7', '@ward_session', 'workspace-1@mbp'],
    ['@7', '@ward_epoch', '2026-11-08T10:00:00.000Z'],
    ['@7', '@ward_pane', '%9'],
    ['@7', 'remain-on-exit', 'on'],
    ['@7', 'automatic-rename', 'off'],
    ['@7', 'allow-rename', 'off'],
  ]);
  // WARD_AGENT goes on the run's pane alone, through the respawn that starts it.
  expect(argv.slice(respawn)).toEqual([
    'respawn-pane',
    '-k',
    '-t',
    '%9',
    '-c',
    '/w/main',
    '-e',
    'WARD_AGENT=workspace-1@mbp',
    'claude',
    '--session-id',
    'abc',
  ]);
});

test.each([
  [
    ['claude', '--resume', 'x'],
    ['claude', '--resume', 'x'],
  ],
  [['/opt/bin/claude'], ['/opt/bin/claude']],
  [['/my dir/claude'], ["'/my dir/claude'"]], // a lone word goes through sh -c
])('the command %p reaches tmux as %p', (command, expected) => {
  expect(commandArgs(command)).toEqual(expected);
});

test('shell quoting survives a quote', () => {
  expect(shellQuote("it's")).toBe(`'it'\\''s'`);
  expect(shellQuote('=ward-a-f0')).toBe('=ward-a-f0');
});

test('hosts are read with their stamps; a view or an unstamped session carries none', () => {
  expect(
    parseGroups(
      'ward-main-f0\tws-id-0123456789ab\t0\t\t100\t1\t0.1.0\t3\n' +
        'scratch\t\t\t\t50\t0\t\t1\n' +
        'ward-main-f0-v1\tws-id-0123456789ab\t0\tws-id-0123456789ab\t120\t0\t\t3\n',
    ),
  ).toEqual([
    {
      name: 'ward-main-f0',
      stamp: { workspace: 'ws-id-0123456789ab', floor: 0 },
      view: false,
      viewOf: '',
      created: 100,
      clients: 1,
      version: '0.1.0',
      windows: 3,
    },
    { name: 'scratch', view: false, viewOf: '', created: 50, clients: 0, version: '', windows: 1 },
    {
      name: 'ward-main-f0-v1',
      stamp: { workspace: 'ws-id-0123456789ab', floor: 0 },
      view: true,
      viewOf: 'ws-id-0123456789ab',
      created: 120,
      clients: 0,
      version: '',
      windows: 3,
    },
  ]);
});

test("a window is found by its tag on the agent's own pane, once however many hosts show it", () => {
  const row = (group: string, pane: string, extra: Partial<Record<string, string>> = {}) =>
    [
      group,
      '@3',
      pane,
      extra.dead ?? '0',
      extra.status ?? '',
      extra.signal ?? '',
      extra.tag ?? 'workspace-1@mbp',
      '2026-11-08T10:00:00.000Z',
      '%5',
      'ws-id-0123456789ab',
      group.endsWith('f0') ? '0' : '2',
    ].join('\t');
  const listing = [
    row('ward-main-f0', '%5'),
    row('ward-main-f2', '%5'), // the same window, linked into floor 2's host
    row('ward-main-f0', '%6'), // a pane a human split off beside the agent's
    row('ward-main-f0', '%8', { tag: 'workspace-2@mbp' }),
  ].join('\n');
  expect(parseWindows(listing, 'workspace-1@mbp')).toEqual([
    {
      window: '@3',
      groups: [
        { name: 'ward-main-f0', stamp: { workspace: 'ws-id-0123456789ab', floor: 0 } },
        { name: 'ward-main-f2', stamp: { workspace: 'ws-id-0123456789ab', floor: 2 } },
      ],
      tags: { session: 'workspace-1@mbp', epoch: '2026-11-08T10:00:00.000Z' },
      dead: false,
    },
  ]);
  const dead = parseWindows(
    row('ward-main-f0', '%5', { dead: '1', status: '3' }),
    'workspace-1@mbp',
  );
  expect(dead[0]).toMatchObject({ dead: true, exitStatus: 3 });
  expect(parseWindows('', 'workspace-1@mbp')).toEqual([]);
});

test.each([
  ['tmux 3.7c', { major: 3, minor: 7 }, false],
  ['tmux 3.2', { major: 3, minor: 2 }, false],
  ['tmux 3.1c', { major: 3, minor: 1 }, true], // observe's client flags arrived in 3.2
  ['tmux 2.9a', { major: 2, minor: 9 }, true],
  ['tmux next-3.6', { major: 3, minor: 6 }, false],
  ['tmux master', null, false], // unreadable is a build from source, not an old one
])('%p reads as %p; below the 3.2 floor: %p', (line, version, below) => {
  expect(parseVersion(line)).toEqual(version);
  expect(belowFloor(line)).toBe(below);
});

// -- views: attach and observe (design/0031-detached-session-hosting/) ---------

test('a view takes the smallest free number, v for attach and o for observe', () => {
  expect(viewName('ward-a-f3', 'attach', new Set())).toBe('ward-a-f3-v1');
  expect(viewName('ward-a-f3', 'attach', new Set(['ward-a-f3-v1', 'ward-a-f3-v3']))).toBe(
    'ward-a-f3-v2',
  );
  expect(viewName('ward-a-f3', 'observe', new Set(['ward-a-f3-v1']))).toBe('ward-a-f3-o1');
});

test("an attach view is grouped with the floor host, stamped, and selects the session's window", () => {
  expect(attachViewArgv('ward-a-f3', 'ward-a-f3-v1', 'ws-id', '@7')).toEqual([
    'new-session',
    '-d',
    '-t',
    '=ward-a-f3',
    '-s',
    'ward-a-f3-v1',
    ';',
    'set-option',
    '-t',
    '=ward-a-f3-v1:',
    '@ward_view',
    'ws-id',
    ';',
    'select-window',
    '-t',
    '=ward-a-f3-v1:@7',
  ]);
});

test('an observe view is a session of its own, sized like a host, holding a placeholder', () => {
  const argv = observeViewArgv('ward-a-f3-o1', 'ws-id');
  expect(argv.slice(0, 4)).toEqual(['new-session', '-d', '-s', 'ward-a-f3-o1']);
  expect(argv.slice(0, argv.indexOf(';'))).not.toContain('-t'); // not grouped: no neighbor in it
  expect(argv.join(' ')).toContain('-x 120 -y 40');
  expect(options(argv)).toEqual([['=ward-a-f3-o1:', '@ward_view', 'ws-id']]);
});

test.each([
  ['attach, from outside tmux', 'attach', false, ['attach-session', '-t', '=v']],
  ['attach, already a client of this server', 'attach', true, ['switch-client', '-t', '=v']],
  [
    'observe, anywhere: read-only, never resizing the window',
    'observe',
    false,
    ['attach-session', '-f', 'read-only,ignore-size', '-t', '=v'],
  ],
  [
    'observe, even inside tmux (switching cannot be read-only)',
    'observe',
    true,
    ['attach-session', '-f', 'read-only,ignore-size', '-t', '=v'],
  ],
] as const)('entering a view: %s', (_, mode, inside, join) => {
  const argv = enterArgv({ name: 'v', mode }, inside);
  expect(argv.slice(0, join.length)).toEqual([...join]);
  // Set only once the client is in it: tmux ends an unattached session the moment it is set.
  expect(argv.slice(join.length)).toEqual([
    ';',
    'set-option',
    '-t',
    '=v:',
    'destroy-unattached',
    'on',
  ]);
});

test.each([
  ['/tmp/tmux-501/default,123,0', '/tmp/tmux-501/default', true],
  ['/tmp/tmux-501/default,123,0', '/tmp/tmux-501/ward-test', false],
  [undefined, '/tmp/tmux-501/default', false],
  ['', '/tmp/tmux-501/default', false],
  ['/tmp/tmux-501/default,123,0', '', false],
])('$TMUX %p against server %p: inside it is %p', (tmuxVar, socket, inside) => {
  expect(insideServer(tmuxVar, socket)).toBe(inside);
});

// -- the inventory doctor joins against the records -----------------------------

test('the inventory keeps every tagged window once, with every tmux session showing it', () => {
  // group, window, pane, dead, status, signal, @ward_session, @ward_epoch, @ward_pane, …
  const pane = (group: string, window: string, id: string, tag = 'workspace-1@mbp') =>
    [group, window, id, '0', '', '', tag, 'E', tag === '' ? '' : '%5', '', ''].join('\t');
  const rows = [
    pane('ward-main-f0', '@1', '%5'),
    pane('ward-main-f3', '@1', '%5'), // the same window, linked
    pane('ward-main-f3-v1', '@1', '%5'), // and in a view
    pane('ward-main-f0', '@2', '%9', ''), // a human's own window: not Ward's
    pane('ward-main-f0', '@1', '%6'), // a pane split off beside the agent's
  ].join('\n');
  expect(parseInventoryWindows(rows)).toEqual([
    {
      window: '@1',
      tags: { session: 'workspace-1@mbp', epoch: 'E' },
      groups: ['ward-main-f0', 'ward-main-f3', 'ward-main-f3-v1'],
      dead: false,
    },
  ]);
});

test("the host's inherited names are read; a removal marker is not a value", () => {
  expect(parseEnvironmentNames('HOME=/h\nCLAUDECODE=1\n-DISPLAY\nEMPTY=\n')).toEqual([
    'HOME',
    'CLAUDECODE',
    'EMPTY',
  ]);
});

test('remedies are whole commands, on the configured server', () => {
  const host = tmuxHost({ WARD_TMUX_SOCKET: 'try' });
  expect(host.closeCommand('@4')).toBe('tmux -L try kill-window -t @4');
  expect(host.endGroupCommand('ward-a-f2')).toBe('tmux -L try kill-session -t =ward-a-f2');
  expect(host.forgetEnvCommand('CLAUDECODE')).toBe('tmux -L try set-environment -gu CLAUDECODE');
});

test('the join command names the private server when one is configured', () => {
  expect(tmuxHost({ WARD_TMUX_SOCKET: 'try' }).joinCommand('ward-main-f0')).toBe(
    'tmux -L try attach -t =ward-main-f0',
  );
  expect(tmuxHost({}).joinCommand('ward-main-f0')).toBe('tmux attach -t =ward-main-f0');
});

test('a missing tmux is unusable, with the reason, and never throws', () => {
  const check = tmuxHost({ WARD_TMUX_BIN: '/nonexistent/tmux' }).check();
  expect(check.usable).toBe(false);
  expect(check.usable === false && check.reason).toContain('/nonexistent/tmux');
});

// -- helpers ------------------------------------------------------------------

/** The (target, name, value) of every `set-option` in an argv chain. */
function options(argv: readonly string[]): string[][] {
  const found: string[][] = [];
  argv.forEach((word, i) => {
    if (word !== 'set-option') return;
    const rest = argv.slice(i + 1);
    const t = rest.indexOf('-t');
    found.push([rest[t + 1] ?? '', rest[t + 2] ?? '', rest[t + 3] ?? '']);
  });
  return found;
}
