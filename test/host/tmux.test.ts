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
  namedFor,
  observeViewArgv,
  parseEnvironmentNames,
  parseGroups,
  parseInventoryWindows,
  parseVersion,
  parseWindows,
  prepareArgv,
  renameGroupArgv,
  renameWindowArgv,
  sessionTarget,
  shellQuote,
  startRunArgv,
  statusText,
  themeArgv,
  titleGroupArgv,
  titleString,
  tmuxHost,
  viewHosts,
  viewName,
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
  expect(attachViewArgv('ward-a-f3', 'ward-a-f3-v1', 'ws-id', '@7', { title: 'a f3' })).toEqual([
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
    // Set only once the client is in it: tmux ends an unattached session the moment it is set.
    ['=v:', 'destroy-unattached', 'on'],
    // A view that ends under its client moves it on, as the host does — never to the shell.
    ['=v:', 'detach-on-destroy', 'off'],
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
