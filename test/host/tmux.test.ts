// The tmux host's pure half (design/0031-detached-session-hosting/, ADR 0006):
// host-name minting and munging, exact-match targets, the argv the adapter
// hands tmux, and how it reads tmux's answers back. Tables, no tmux — the
// real server is test/host/tmux-live.test.ts's.
import { expect, test } from 'bun:test';
import {
  commandArgs,
  createGroupArgv,
  createWindowArgv,
  linkWindowArgv,
  majorVersion,
  mintGroupName,
  parseGroups,
  parseWindows,
  prepareArgv,
  sessionTarget,
  shellQuote,
  startRunArgv,
  tmuxHost,
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
      'ward-main-f0\tws-id-0123456789ab\t0\t\t100\n' +
        'scratch\t\t\t\t50\n' +
        'ward-main-f0-v1\tws-id-0123456789ab\t0\t1\t120\n',
    ),
  ).toEqual([
    {
      name: 'ward-main-f0',
      stamp: { workspace: 'ws-id-0123456789ab', floor: 0 },
      view: false,
      created: 100,
    },
    { name: 'scratch', view: false, created: 50 },
    {
      name: 'ward-main-f0-v1',
      stamp: { workspace: 'ws-id-0123456789ab', floor: 0 },
      view: true,
      created: 120,
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
  ['tmux 3.7c', 3],
  ['tmux 2.9a', 2],
  ['tmux next-3.6', 3],
  ['tmux master', null],
])('%p reads as major version %p', (line, major) => {
  expect(majorVersion(line)).toBe(major);
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
