// The tmux host's pure half (design/0031-detached-session-hosting/, ADR 0006):
// host-name minting and munging, exact-match targets, the argv the adapter
// hands tmux, and how it reads tmux's answers back. Tables, no tmux — the
// real server is test/host/tmux-live.test.ts's.
import { expect, test } from 'bun:test';
import {
  attachViewArgv,
  belowFloor,
  captureArgv,
  commandArgs,
  createGroupArgv,
  createWindowArgv,
  EXIT_RULE,
  endLeftViewArgv,
  endViewArgv,
  enterArgv,
  eraseArgv,
  exitRuleArgv,
  insideServer,
  leftViewsArgv,
  linkWindowArgv,
  MINIMUM_VERSION,
  mintGroupName,
  namedFor,
  observeViewArgv,
  paneStateArgv,
  parseEnvironmentNames,
  parseGroups,
  parseInventoryWindows,
  parseLeftViews,
  parseVersion,
  parseWindows,
  prepareArgv,
  renameGroupArgv,
  renameWindowArgv,
  rowPattern,
  screenHolds,
  sessionTarget,
  shellQuote,
  squash,
  startRunArgv,
  statusText,
  submitArgv,
  TYPEABLE,
  themeArgv,
  titleGroupArgv,
  titleString,
  tmuxHost,
  typeArgv,
  VIEW_ENDS,
  viewHosts,
  viewName,
  watchArgv,
  windowRunArgv,
  windowTagArgv,
  windowTarget,
} from '../../src/host/tmux.ts';

test.each([
  ['main-f0-workspace', 'main-f0-workspace'],
  ['my work-f3-alpha', 'my-work-f3-alpha'],
  ['a.b:c-f1-x', 'a-b-c-f1-x'], // `.` and `:` are tmux target syntax
  ['ünï-f2', '-n--f2'],
  ['under_score-ok-f4', 'under_score-ok-f4'],
])('the host wanted as %p is named %p', (wanted, expected) => {
  expect(mintGroupName(wanted)).toBe(expected);
});

// -- names and titles in place (design/0061-host-names-and-titles/) ------------

test('a title leads with the window, says where it stands, and adds a pane title only when one was set', () => {
  const unset =
    '#{||:#{==:#{pane_title},},#{||:#{==:#{pane_title},#{host}},#{==:#{pane_title},#{host_short}}}}';
  expect(titleString('main f7')).toBe(`#{window_name} · main f7#{?${unset},, · #{pane_title}}`);
  expect(titleString('main f7', 'observe')).toContain('· main f7 (observing)#{?');
  // Where it stands is literal text: a `#` in it is never read as a format.
  expect(titleString('c# f1')).toContain('· c## f1#{?');
});

test("a title leads with the floor's emoji when it has one, and with no gap when it has none", () => {
  // design/0064-floor-identity-palette/: a tab shows the head of a title.
  expect(titleString('main f7', 'attach', '🌸')).toStartWith('🌸 #{window_name} · main f7#{?');
  expect(titleString('main f7', 'observe', '🌸')).toStartWith(
    '🌸 #{window_name} · main f7 (observing)#{?',
  );
  expect(titleString('main f7', 'attach', undefined)).toStartWith('#{window_name} · main f7');
  expect(titleString('main f7', 'attach', '')).toStartWith('#{window_name} · main f7');
  const pink = { color: 'pink', emoji: '🌸', label: 'f7 ward-development' } as const;
  expect(
    options([';', ...titleGroupArgv('main-f7-x', { title: 'main f7', identity: pink })]),
  ).toEqual([
    ['=main-f7-x:', 'set-titles', 'on'],
    ['=main-f7-x:', 'set-titles-string', titleString('main f7', 'attach', '🌸')],
  ]);
});

test('the exit rule is one every supported tmux takes, and a standing window is told it by id', () => {
  // `remain-on-exit failed` arrived in tmux 3.2 (CHANGES FROM 3.1c TO 3.2) —
  // the version floor itself, so there is no older tmux to fall back for.
  expect(EXIT_RULE).toBe('failed');
  expect(MINIMUM_VERSION).toEqual({ major: 3, minor: 2 });
  expect(belowFloor('tmux 3.1c')).toBe(true);
  expect(belowFloor('tmux 3.2')).toBe(false);
  expect(exitRuleArgv('@3')).toEqual(['set-option', '-w', '-t', '@3', 'remain-on-exit', 'failed']);
});

test('renaming is in place: a host by exact name, a window by its id, titles per tmux session', () => {
  expect(renameGroupArgv('ward-main-f7', 'main-f7-ward-development')).toEqual([
    'rename-session',
    '-t',
    '=ward-main-f7',
    'main-f7-ward-development',
  ]);
  expect(renameWindowArgv('@3', 't33 host names')).toEqual([
    'rename-window',
    '-t',
    '@3',
    't33 host names',
  ]);
  const argv = titleGroupArgv('main-f7-x', { title: 'main f7' });
  expect(argv[0]).toBe('set-option');
  expect(options([';', ...argv])).toEqual([
    ['=main-f7-x:', 'set-titles', 'on'],
    ['=main-f7-x:', 'set-titles-string', titleString('main f7')],
  ]);
  expect(argv).not.toContain('-g'); // never the server's, never another session's
  // A standing observe view is retitled as one: its mark stays (0063).
  expect(
    options([';', ...titleGroupArgv('main-f7-x-o1', { title: 'main f7' }, 'observe')]),
  ).toEqual([
    ['=main-f7-x-o1:', 'set-titles', 'on'],
    ['=main-f7-x-o1:', 'set-titles-string', titleString('main f7', 'observe')],
  ]);
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
    { title: 'main f3' },
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
    ['=ward-main-f3:', 'set-titles', 'on'],
    ['=ward-main-f3:', 'set-titles-string', titleString('main f3')],
  ]);
});

test('the window is created holding, then tagged, told to keep a failed exit, and only then started', () => {
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
    // A clean exit closes the window; a failed or signalled one is kept (0070).
    ['@7', 'remain-on-exit', 'failed'],
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
      'ward-main-f0\tws-id-0123456789ab\t0\t\t100\t1\t0.1.0\t3\tG\n' +
        'scratch\t\t\t\t50\t0\t\t1\n' +
        'ward-main-f0-v1\tws-id-0123456789ab\t0\tws-id-0123456789ab\t120\t0\t\t3\tG\n',
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
      group: 'G',
    },
    {
      name: 'scratch',
      view: false,
      viewOf: '',
      created: 50,
      clients: 0,
      version: '',
      windows: 1,
      group: '',
    },
    {
      name: 'ward-main-f0-v1',
      stamp: { workspace: 'ws-id-0123456789ab', floor: 0 },
      view: true,
      viewOf: 'ws-id-0123456789ab',
      created: 120,
      clients: 0,
      version: '',
      windows: 3,
      group: 'G',
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
      extra.index ?? '1',
    ].join('\t');
  const listing = [
    row('ward-main-f0', '%5'),
    row('ward-main-f2', '%5', { index: '4' }), // the same window, linked into floor 2's host, standing elsewhere there
    row('ward-main-f0', '%6'), // a pane a human split off beside the agent's
    row('ward-main-f0', '%8', { tag: 'workspace-2@mbp' }),
  ].join('\n');
  expect(parseWindows(listing, 'workspace-1@mbp')).toEqual([
    {
      window: '@3',
      groups: [
        { name: 'ward-main-f0', stamp: { workspace: 'ws-id-0123456789ab', floor: 0 }, index: 1 },
        { name: 'ward-main-f2', stamp: { workspace: 'ws-id-0123456789ab', floor: 2 }, index: 4 },
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
  // A host that did not say where the window stands leaves the index out.
  expect(
    parseWindows(row('ward-main-f0', '%5', { index: '' }), 'workspace-1@mbp')[0]?.groups,
  ).toEqual([{ name: 'ward-main-f0', stamp: { workspace: 'ws-id-0123456789ab', floor: 0 } }]);
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
  expect(attachViewArgv('ward-a-f3', 'ward-a-f3-v1', 'ws-id', '@7', { title: 'a f3' })).toEqual([
    'new-session',
    '-d',
    '-t',
    '=ward-a-f3',
    '-s',
    'ward-a-f3-v1',
    '-P',
    '-F',
    '#{session_id}',
    ';',
    'set-option',
    '-t',
    '=ward-a-f3-v1:',
    '@ward_view',
    'ws-id',
    ';',
    'set-option',
    '-t',
    '=ward-a-f3-v1:',
    'set-titles',
    'on',
    ';',
    'set-option',
    '-t',
    '=ward-a-f3-v1:',
    'set-titles-string',
    titleString('a f3'),
    ';',
    'select-window',
    '-t',
    '=ward-a-f3-v1:@7',
  ]);
});

test('an observe view is a session of its own, sized like a host, holding a placeholder', () => {
  const argv = observeViewArgv('ward-a-f3-o1', 'ws-id', { title: 'a f3' });
  expect(argv.slice(0, 4)).toEqual(['new-session', '-d', '-s', 'ward-a-f3-o1']);
  expect(argv.slice(0, argv.indexOf(';'))).not.toContain('-t'); // not grouped: no neighbor in it
  expect(argv.join(' ')).toContain('-x 120 -y 40');
  expect(options(argv)).toEqual([
    ['=ward-a-f3-o1:', '@ward_view', 'ws-id'],
    ['=ward-a-f3-o1:', 'set-titles', 'on'],
    ['=ward-a-f3-o1:', 'set-titles-string', titleString('a f3', 'observe')],
  ]);
});

test('a view whose client has left is ended by its tmux session id, and only while nobody is in it', () => {
  // Never destroy-unattached (design/0076-tmux-remaining-races/): kill-session
  // moves any client still pointing in out first; the id is quoted so tmux
  // does not read `$7` as a variable.
  expect(endViewArgv('$7')).toEqual([
    'if-shell',
    '-F',
    '-t',
    '$7:',
    '#{==:#{session_attached},0}',
    "kill-session -t '$7'",
  ]);
  expect(endLeftViewArgv('$7')).toEqual([
    'if-shell',
    '-F',
    '-t',
    '$7:',
    '#{&&:#{==:#{session_attached},0},#{@ward_joined}}',
    "kill-session -t '$7'",
  ]);
  expect(VIEW_ENDS).toBe("if-shell -F '#{==:#{session_attached},0}' kill-session");
});

test("the views a sweep ends: this workspace's, joined, and with nobody in them", () => {
  expect(leftViewsArgv()).toEqual([
    'list-sessions',
    '-F',
    '#{session_id}\t#{@ward_view}\t#{@ward_joined}\t#{session_attached}',
  ]);
  const listed = [
    '$1\t\t\t0', // a floor host, or a human's own session
    '$2\tws\t1\t0', // left
    '$3\tws\t1\t1', // someone is in it
    '$4\tws\t\t0', // made, not yet joined — another Ward's, on its way
    '$5\tother\t1\t0', // another workspace's
    '$6\tws\t1\t0',
  ].join('\n');
  expect(parseLeftViews(`${listed}\n`, 'ws')).toEqual(['$2', '$6']);
  expect(parseLeftViews('', 'ws')).toEqual([]);
});

test.each<[string, string, string]>([
  ['plain text', 'hello there', 'hello there'],
  [
    'every character special to a regular expression',
    '.[()*+?{|^$\\]}',
    '\\.\\[\\(\\)\\*\\+\\?\\{\\|\\^\\$\\\\]}',
  ],
  ['a rule, counted as a group', '─'.repeat(40), '(─){40}'],
  ['a run of three is spelled out', 'aaa', 'aaa'],
  ['a run past what one interval may count', ' '.repeat(300), '( ){255}( ){45}'],
  ['an escaped character repeated', '....', '(\\.){4}'],
])('a screen row as a pattern: %s', (_, row, pattern) => {
  expect(rowPattern(row)).toBe(pattern);
  // And it matches that row alone, whole (JavaScript's non-unicode syntax is
  // the nearest to POSIX's: a lone `]` or `}` is literal in both).
  const re = new RegExp(`^${pattern}$`);
  expect(re.test(row)).toBe(true);
  expect(re.test(`${row}x`)).toBe(false);
});

test('the screen check asks for each non-blank row where it first stands, escaped for a format', () => {
  const screen = ['rule', '❯ a,b}#c', 'rule', '', '  status', ''].join('\n');
  expect(screenHolds(screen, { first: 0, last: 4 })).toBe(
    '#{&&:#{==:#{C/r:^rule$},1},' +
      '#{&&:#{==:#{C/r:^❯ a#,b#}##c$},2},' +
      // The lower rule reads the same as the upper: it is known by where that one stands.
      '#{&&:#{==:#{C/r:^rule$},1},' +
      '#{==:#{C/r:^  status$},5}}}}',
  );
  // Trailing blanks are not part of a row, as tmux reads it.
  expect(screenHolds('x  \n', { first: 0, last: 0 })).toBe('#{==:#{C/r:^x$},1}');
  // Nothing to ask about vouches for nothing.
  expect(screenHolds('\n\n', { first: 0, last: 1 })).toBe('0');
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
  expect(options(argv.slice(join.length))).toEqual([
    // Marked joined, so a sweep never ends a view another Ward has not yet joined.
    ['=v:', '@ward_joined', '1'],
    // A view that ends under its client moves it on, as the host does — never to the shell.
    ['=v:', 'detach-on-destroy', 'off'],
    // No view is ever destroy-unattached: it ends itself once its client has
    // gone, however it joined (design/0076-tmux-remaining-races/).
    ['=v:', 'client-detached', VIEW_ENDS],
    // Only an observer leaves for the shell when its window goes — that one
    // client by name, so nobody tmux moved into the view goes with it.
    ...(mode === 'observe'
      ? [['=v:', 'session-window-changed', 'detach-client -t "#{client_name}" ; kill-session']]
      : []),
  ]);
  // The hook names the client by a format, expanded as the option is set.
  expect(argv.includes('-F')).toBe(mode === 'observe');
});

test('the watched window joins an observe view beside its placeholder, which the window list hides', () => {
  expect(watchArgv('ward-a-f3-o1', '@9', '@7')).toEqual([
    'set-option',
    '-w',
    '-t',
    '@9',
    'window-status-format',
    '',
    ';',
    'set-option',
    '-w',
    '-t',
    '@9',
    'window-status-current-format',
    '',
    ';',
    'link-window', // no -k: the placeholder stays, so the view outlives the watched window
    '-s',
    '@7',
    '-t',
    '=ward-a-f3-o1:',
    ';',
    'select-window',
    '-t',
    '=ward-a-f3-o1:@7',
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

// -- the theme (design/0060-floor-identity/) ----------------------------------

test.each<[string, string, string]>([
  ['blue', 'bg=colour26,fg=colour231', 'light ink on a dark swatch'],
  ['yellow', 'bg=colour220,fg=colour16', 'dark ink on a light swatch'],
  ['silver', 'bg=colour250,fg=colour16', "the ground floor's"],
])('a %s floor is a %s status line (%s)', (color, style) => {
  const argv = themeArgv('main-f7-ward-development', {
    color: color as 'blue',
    emoji: '🌊',
    label: 'f7 ward-development',
  });
  const host = '=main-f7-ward-development:';
  expect(options(argv)).toEqual([
    [host, 'status-style', style],
    [host, 'status-left', '#[bold] 🌊 f7 ward-development #[nobold] '],
    [host, 'status-left-length', '26'], // the whole name: tmux's default 10 cuts it mid-word
    [host, '@ward_color', color],
    [host, '@ward_emoji', '🌊'],
  ]);
});

test('a theme is set on one session, by exact name — never globally, never on the server', () => {
  const argv = themeArgv('main-f7-x', { color: 'teal', emoji: '🐬', label: 'f7 x' });
  expect(argv[0]).toBe('set-option');
  for (const flag of ['-g', '-s', '-w', '-p', '-a']) expect(argv).not.toContain(flag);
  expect(argv.filter((word) => word === 'set-option')).toHaveLength(5);
  expect(argv.filter((word) => word === '=main-f7-x:')).toHaveLength(5);
});

test("the floor's name is shown literally, and a long one cannot crowd out the window list", () => {
  expect(statusText('50% #done')).toBe('50%% ##done');
  const long = themeArgv('h', { color: 'red', emoji: '🍎', label: `f3 ${'x'.repeat(80)}` });
  expect(options(long)[2]).toEqual(['=h:', 'status-left-length', '48']);
});

test.each<[string, string[], Record<string, string>]>([
  [
    'the host is the stamped member of its session group that is no view',
    [
      'main-f7-a\tWS\t7\t\tG7',
      'main-f7-a-v1\t\t\tWS\tG7',
      'main-f0-w\tWS\t0\t\tG0',
      'main-f0-w-v1\t\t\tWS\tG0',
    ],
    { 'main-f7-a-v1': 'main-f7-a', 'main-f0-w-v1': 'main-f0-w' },
  ],
  [
    'found by group and stamp, never by name: a view from an older naming, and a renamed one',
    [
      'main-f7-a\tWS\t7\t\tward-main-f7',
      'ward-main-f7-v1\t\t\tWS\tward-main-f7',
      'x\t\t\tWS\tward-main-f7',
    ],
    { 'ward-main-f7-v1': 'main-f7-a', x: 'main-f7-a' },
  ],
  [
    "an observe view is in no group; a human's own grouped session is no view",
    ['main-f7-a\tWS\t7\t\tG7', 'main-f7-a-o1\t\t\tWS\t', 'main-f7-a-v9\t\t\t\tG7'],
    {},
  ],
  ["a view whose group holds no host of Ward's has none", ['mine\t\t\t\tG1', 'v\t\t\tWS\tG1'], {}],
])('the host an attach view looks at — %s', (_, rows, expected) => {
  // name, workspace stamp, floor stamp, view stamp, session group
  const listed = rows.map((row) => {
    const [name, workspace, floor, view, group] = row.split('\t');
    return [name, workspace, floor, view, '0', '0', '', '1', group].join('\t');
  });
  expect(Object.fromEntries(viewHosts(parseGroups(`${listed.join('\n')}\n`)))).toEqual(expected);
});

test.each<[string, string, 'attach' | 'observe', boolean]>([
  ['main-f7-a-v1', 'main-f7-a', 'attach', true],
  ['main-f7-a-v12', 'main-f7-a', 'attach', true],
  ['main-f7-a-o1', 'main-f7-a', 'observe', true],
  ['main-f7-a-o1', 'main-f7-a', 'attach', false], // the other mode's letter
  ['ward-main-f7-v1', 'main-f7-a', 'attach', false], // an older naming
  ['main-f7-a-v', 'main-f7-a', 'attach', false],
  ['main-f7-a-v1x', 'main-f7-a', 'attach', false],
  ['main-f7-a-b-v1', 'main-f7-a', 'attach', false], // a longer host's view
])('whether view %s is already named for %s (%s)', (view, group, mode, expected) => {
  expect(namedFor(view, group, mode)).toBe(expected);
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

// -- typing into a run (design/0067-floor-dispatch/) ---------------------------

test('a line is typed literally, by pane id, and never carries the submitting key', () => {
  // `-l` keeps a word like `Enter` or `C-c` from being read as a key, and
  // `--` keeps a line that opens with `-` from being read as a flag.
  expect(typeArgv('%7', '[ward] Enter C-c -x')).toEqual([
    'send-keys',
    '-t',
    '%7',
    '-l',
    '--',
    '[ward] Enter C-c -x',
  ]);
  // The key is never sent alone: tmux sends it, behind a check of the screen.
  expect(submitArgv('%7', 'r\n❯ hi\n', { first: 1, last: 1 })).toEqual([
    'if-shell',
    '-F',
    '-t',
    '%7',
    '#{&&:#{==:#{pane_in_mode},0},#{==:#{C/r:^❯ hi$},2}}',
    'send-keys -t %7 Enter ; display-message -p submitted',
    'display-message -p held',
  ]);
  expect(eraseArgv('%7', 12)).toEqual(['send-keys', '-t', '%7', '-N', '12', 'BSpace']);
  expect(captureArgv('%7')).toEqual(['capture-pane', '-p', '-t', '%7']);
  expect(windowRunArgv('@3')).toEqual([
    'display-message',
    '-p',
    '-t',
    '@3',
    '#{window_id}\t#{@ward_session}\t#{@ward_pane}',
  ]);
  expect(windowTagArgv('@3')).toEqual([
    'display-message',
    '-p',
    '-t',
    '@3',
    '#{window_id}\t#{@ward_session}',
  ]);
  expect(paneStateArgv('%7')).toEqual([
    'display-message',
    '-p',
    '-t',
    '%7',
    '#{window_id}\t#{pane_dead}\t#{pane_in_mode}',
  ]);
});

test.each<[string, boolean]>([
  ['[ward] hand-off to floor 3: task f3t4 (fix-login). Read it: ward task show f3t4', true],
  ['', false],
  ['two\nlines', false],
  ['a tab\tin it', false],
  ['an escape \u001b[2J', false],
  ['not ASCII — a dash', false],
  ['x'.repeat(201), false],
])('typeable: %p is %p', (line, expected) => {
  expect(TYPEABLE.test(line)).toBe(expected);
});

test('a line that is not typeable is withheld before tmux is asked anything', () => {
  const host = tmuxHost({ WARD_TMUX_BIN: '/nonexistent/tmux' });
  expect(
    host.typeLine({
      window: '@1',
      session: 's',
      text: 'two\nlines',
      inputLine: () => ({ text: '', rows: { first: 0, last: 0 } }),
    }),
  ).toEqual({ outcome: 'withheld', reason: 'the line is not one line of printable ASCII' });
});

test('a typed line compares across a wrap: whitespace is not part of it', () => {
  expect(squash('[ward] hand-off  to\n  floor 3')).toBe('[ward]hand-offtofloor3');
});
