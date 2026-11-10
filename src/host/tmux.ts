// tmux as a session host (ADR 0006; design/0031-detached-session-hosting/):
// the one file in Ward that speaks tmux. A floor's group is a tmux SESSION —
// the floor host — found by the `@ward_workspace` and `@ward_floor` options
// stamped on it, never by its name; a Ward session's window is a tmux WINDOW
// tagged with `@ward_session`, `@ward_epoch`, and `@ward_pane` window options,
// which no rename, `automatic-rename`, or terminal title escape can touch.
//
// Three disciplines run through every call here:
//
// - **Exact targets.** tmux prefix-matches a bare `-t` name, so every name
//   target is `=`-prefixed, and every window or pane target is the id tmux
//   assigned (`@12`, `%7`).
// - **Nothing session-specific in a host's environment.** A tmux session's
//   environment is inherited by every later window in it — the next agent's,
//   or a human's shell — so `WARD_AGENT` is set on the agent's pane alone, by
//   the respawn that starts the run, and the client environment Ward talks to
//   tmux from carries no `WARD_AGENT` or `TMUX` of the caller's.
// - **A failed probe is not an empty one.** "no server running" is absence;
//   any other failure — a timeout, an error — is "could not determine".
//
// Two environment seams, `WARD_CLAUDE_BIN`'s pattern: `WARD_TMUX_BIN` names
// the program, and `WARD_TMUX_SOCKET` a private server (`tmux -L NAME`) — what
// the real-tmux tests stand on, and how a human tries hosting on a throwaway
// server. Unset, Ward uses the default server, where a human's own `tmux ls`
// already looks.
import { realpathSync } from 'node:fs';
import { WardError } from '../errors.ts';
import type {
  CloseResult,
  FindResult,
  FoundGroup,
  FoundWindow,
  GroupStamp,
  HostCheck,
  InheritedEnv,
  Inventory,
  InventoryGroup,
  InventoryWindow,
  Placement,
  PlaceRequest,
  SessionHost,
  View,
  ViewMode,
  ViewRequest,
} from './host.ts';

type Env = Record<string, string | undefined>;

/** The prefix every host Ward creates wears — the namespace a human reads. */
export const GROUP_PREFIX = 'ward-';

/**
 * The size a host is created at while no client is attached — the field's
 * tested floor for TUIs drawn with nobody watching (0031, the premise).
 */
export const DETACHED_SIZE = { columns: 120, rows: 40 } as const;

/** Per-call ceiling: past it the answer is "could not determine". */
const CALL_TIMEOUT_MS = 5000;

/**
 * The version floor: per-window user options and `-e` on respawn arrived by
 * tmux 3.0, and the client flags observe attaches with (`-f
 * read-only,ignore-size`) in 3.2.
 */
export const MINIMUM_VERSION = { major: 3, minor: 2 } as const;

/**
 * What holds a freshly created window or host until it is filled: a process
 * that waits and does nothing. The agent never starts here — it starts by a
 * respawn once the window's tags and `remain-on-exit` are already set, so even
 * a run that exits at once leaves its window, and its exit status, behind.
 */
const HOLD = ['cat'];

const FIELD = '\t';

// -- names and targets -------------------------------------------------------

/**
 * The name a new floor host is given: `ward-<workspace>-f<floor>`, munged to
 * the characters tmux takes without quoting. Minted only when no host is
 * stamped for the floor, and recorded nowhere — the stamps are the binding.
 */
export function mintGroupName(workspaceName: string, floor: number): string {
  return munge(`${GROUP_PREFIX}${workspaceName}-f${floor}`);
}

/** Every character outside `[A-Za-z0-9_-]` becomes `-`. */
export function munge(name: string): string {
  return name.replace(/[^A-Za-z0-9_-]/g, '-');
}

/** A tmux session as an exact-match target. */
export function sessionTarget(name: string): string {
  return `=${name}`;
}

/** A window slot in a tmux session: its next free index, or the index given. */
export function windowTarget(name: string, index?: string): string {
  return `=${name}:${index ?? ''}`;
}

// -- argv builders (pure, so the tables can test them) -----------------------

/** The server-hygiene preamble: a path-free argv, and a server that outlives its last host. */
export function prepareArgv(): string[] {
  return ['start-server', ';', 'set-option', '-s', 'exit-empty', 'off'];
}

/** Create a floor host, holding a placeholder window, with its stamps. */
export function createGroupArgv(name: string, stamp: GroupStamp, version: string): string[] {
  const target = windowTarget(name);
  return [
    'new-session',
    '-d',
    '-s',
    name,
    '-x',
    String(DETACHED_SIZE.columns),
    '-y',
    String(DETACHED_SIZE.rows),
    '-P',
    '-F',
    ['#{window_id}', '#{window_index}'].join(FIELD),
    ...HOLD,
    ...setOption(['-t', target], '@ward_workspace', stamp.workspace),
    ...setOption(['-t', target], '@ward_floor', String(stamp.floor)),
    ...setOption(['-t', target], '@ward_version', version),
    // A human attached to a host tmux destroys moves to another session
    // rather than dropping to the shell.
    ...setOption(['-t', target], 'detach-on-destroy', 'off'),
  ];
}

/** The window that will hold the run — created holding, not yet running it. */
export function createWindowArgv(group: string, label: string): string[] {
  return [
    'new-window',
    '-d',
    '-P',
    '-F',
    ['#{window_id}', '#{pane_id}'].join(FIELD),
    '-t',
    windowTarget(group),
    '-n',
    label,
    ...HOLD,
  ];
}

/**
 * Tag the window, make it keep its exit, keep its name, then start the run in
 * its pane — in that order, in one invocation, so a run that ends at once
 * still leaves a tagged, dead window to read.
 */
export function startRunArgv(
  window: string,
  pane: string,
  request: Pick<PlaceRequest, 'tags' | 'cwd' | 'env' | 'command'>,
): string[] {
  const target = ['-w', '-t', window];
  return [
    ...setOption(target, '@ward_session', request.tags.session).slice(1),
    ...setOption(target, '@ward_epoch', request.tags.epoch),
    ...setOption(target, '@ward_pane', pane),
    ...setOption(target, 'remain-on-exit', 'on'),
    ...setOption(target, 'automatic-rename', 'off'),
    ...setOption(target, 'allow-rename', 'off'),
    ';',
    'respawn-pane',
    '-k',
    '-t',
    pane,
    '-c',
    request.cwd,
    ...Object.entries(request.env).flatMap(([key, value]) => ['-e', `${key}=${value}`]),
    ...commandArgs(request.command),
  ];
}

/**
 * Link a window into a host: replacing the window at `index` (the placeholder)
 * when given, else at the host's next free index. `-d` so no one's current
 * window moves.
 */
export function linkWindowArgv(window: string, group: string, index?: string): string[] {
  return [
    'link-window',
    '-d',
    ...(index === undefined ? [] : ['-k']),
    '-s',
    window,
    '-t',
    windowTarget(group, index),
  ];
}

export function listGroupsArgv(): string[] {
  return [
    'list-sessions',
    '-F',
    [
      '#{session_name}',
      '#{@ward_workspace}',
      '#{@ward_floor}',
      '#{@ward_view}',
      '#{session_created}',
      '#{session_attached}',
      '#{@ward_version}',
      '#{session_windows}',
    ].join(FIELD),
  ];
}

/**
 * The name of a view: the group's name and `-v<n>` for an attach view, or
 * `-o<n>` for an observe view, with the smallest `n` no tmux session wears.
 */
export function viewName(group: string, mode: ViewMode, taken: ReadonlySet<string>): string {
  const letter = mode === 'attach' ? 'v' : 'o';
  for (let n = 1; ; n++) {
    const name = `${group}-${letter}${n}`;
    if (!taken.has(name)) return name;
  }
}

/**
 * An attach view: a tmux session GROUPED with the floor host, so it shares
 * the host's windows but holds a current window of its own — selecting the
 * session's window in it moves no other client. Stamped `@ward_view` with the
 * workspace id it was made for.
 */
export function attachViewArgv(group: string, name: string, workspace: string, window: string) {
  return [
    'new-session',
    '-d',
    '-t',
    sessionTarget(group),
    '-s',
    name,
    ...setOption(['-t', windowTarget(name)], '@ward_view', workspace),
    ';',
    'select-window',
    '-t',
    windowTarget(name, window),
  ];
}

/** An observe view: a tmux session of its own, holding a placeholder the link will replace. */
export function observeViewArgv(name: string, workspace: string): string[] {
  return [
    'new-session',
    '-d',
    '-s',
    name,
    '-x',
    String(DETACHED_SIZE.columns),
    '-y',
    String(DETACHED_SIZE.rows),
    '-P',
    '-F',
    '#{window_index}',
    ...HOLD,
    ...setOption(['-t', windowTarget(name)], '@ward_view', workspace),
  ];
}

/**
 * Join a view. A caller already a client of this server is SWITCHED to it
 * (an attach run inside tmux would otherwise nest); anyone else attaches,
 * observe read-only and without resizing the window. Either way the view is
 * set to end when its client leaves — set only once the client is in it,
 * because tmux ends an unattached session the moment the option is set.
 */
export function enterArgv(view: View, inside: boolean): string[] {
  const target = sessionTarget(view.name);
  const join =
    view.mode === 'attach' && inside
      ? ['switch-client', '-t', target]
      : [
          'attach-session',
          ...(view.mode === 'observe' ? ['-f', 'read-only,ignore-size'] : []),
          '-t',
          target,
        ];
  return [...join, ...setOption(['-t', windowTarget(view.name)], 'destroy-unattached', 'on')];
}

/**
 * Every pane in every host, with the window tags and the host stamps beside
 * it — one call answers "where is this session's window, and is its run
 * alive". A linked window answers once per host it is linked into.
 */
export function listPanesArgv(): string[] {
  return [
    'list-panes',
    '-a',
    '-F',
    [
      '#{session_name}',
      '#{window_id}',
      '#{pane_id}',
      '#{pane_dead}',
      '#{pane_dead_status}',
      '#{pane_dead_signal}',
      '#{@ward_session}',
      '#{@ward_epoch}',
      '#{@ward_pane}',
      '#{@ward_workspace}',
      '#{@ward_floor}',
    ].join(FIELD),
  ];
}

/** Read one window's tag, then end it — two calls, the read first. */
export function windowTagArgv(window: string): string[] {
  return ['display-message', '-p', '-t', window, '#{@ward_session}'];
}

export function killWindowArgv(window: string): string[] {
  return ['kill-window', '-t', window];
}

/**
 * A run's command as tmux arguments. tmux runs two or more arguments directly
 * but hands a single one to `sh -c`, so a lone program is quoted to survive
 * that shell unchanged.
 */
export function commandArgs(command: readonly string[]): string[] {
  return command.length === 1 ? [shellQuote(command[0] ?? '')] : [...command];
}

export function shellQuote(word: string): string {
  return /^[A-Za-z0-9_@%+=:,./-]+$/.test(word) ? word : `'${word.replace(/'/g, `'\\''`)}'`;
}

function setOption(target: readonly string[], name: string, value: string): string[] {
  return [';', 'set-option', ...target, name, value];
}

// -- parsing -----------------------------------------------------------------

export interface GroupRow {
  readonly name: string;
  readonly stamp?: GroupStamp;
  readonly view: boolean;
  /** The workspace id a view was stamped with — empty on anything that is not a view. */
  readonly viewOf: string;
  readonly created: number;
  readonly clients: number;
  readonly version: string;
  readonly windows: number;
}

export function parseGroups(stdout: string): GroupRow[] {
  return lines(stdout).map((line) => {
    const [
      name = '',
      workspace = '',
      floor = '',
      view = '',
      created = '',
      clients = '',
      version = '',
      windows = '',
    ] = line.split(FIELD);
    return {
      name,
      ...stampOf(workspace, floor),
      view: view !== '',
      viewOf: view,
      created: Number.parseInt(created, 10) || 0,
      clients: Number.parseInt(clients, 10) || 0,
      version,
      windows: Number.parseInt(windows, 10) || 0,
    };
  });
}

/** Every tagged window, with every group (views included) that shows it. */
export function parseInventoryWindows(stdout: string): InventoryWindow[] {
  const byWindow = new Map<string, InventoryWindow & { groups: string[] }>();
  for (const line of lines(stdout)) {
    const [
      group = '',
      window = '',
      pane = '',
      dead = '',
      status = '',
      signal = '',
      tag = '',
      epoch = '',
      tagPane = '',
    ] = line.split(FIELD);
    if (tag === '' || pane !== tagPane) continue;
    const found = byWindow.get(window) ?? {
      window,
      tags: { session: tag, epoch },
      groups: [],
      dead: dead === '1',
      ...(status === '' ? {} : { exitStatus: Number.parseInt(status, 10) }),
      ...(signal === '' ? {} : { exitSignal: signal }),
    };
    if (!found.groups.includes(group)) found.groups.push(group);
    byWindow.set(window, found);
  }
  return [...byWindow.values()];
}

/** The names `show-environment -g` sets — a `-NAME` line marks a removal, not a value. */
export function parseEnvironmentNames(stdout: string): string[] {
  return lines(stdout)
    .filter((line) => !line.startsWith('-'))
    .map((line) => line.split('=')[0] ?? '')
    .filter((name) => name !== '');
}

/** The windows tagged for `session`, one per window however many hosts show it. */
export function parseWindows(stdout: string, session: string): FoundWindow[] {
  const byWindow = new Map<string, { window: FoundWindow; groups: FoundGroup[] }>();
  for (const line of lines(stdout)) {
    const [
      group = '',
      window = '',
      pane = '',
      dead = '',
      status = '',
      signal = '',
      tag = '',
      epoch = '',
      tagPane = '',
      workspace = '',
      floor = '',
    ] = line.split(FIELD);
    // The session's pane is the one the launch named; a pane a human split
    // off beside it says nothing about the run.
    if (tag !== session || pane !== tagPane) continue;
    const found = byWindow.get(window) ?? {
      groups: [],
      window: {
        window,
        groups: [],
        tags: { session: tag, epoch },
        dead: dead === '1',
        ...(status === '' ? {} : { exitStatus: Number.parseInt(status, 10) }),
        ...(signal === '' ? {} : { exitSignal: signal }),
      },
    };
    found.groups.push({ name: group, ...stampOf(workspace, floor) });
    byWindow.set(window, found);
  }
  return [...byWindow.values()].map(({ window, groups }) => ({ ...window, groups }));
}

function stampOf(workspace: string, floor: string): { stamp?: GroupStamp } {
  const number = Number.parseInt(floor, 10);
  if (workspace === '' || Number.isNaN(number)) return {};
  return { stamp: { workspace, floor: number } };
}

function lines(stdout: string): string[] {
  return stdout.split('\n').filter((line) => line !== '');
}

/** The tmux version line, as numbers we can compare — null when unreadable. */
export function parseVersion(versionLine: string): { major: number; minor: number } | null {
  const match = /(\d+)\.(\d+)/.exec(versionLine);
  if (match?.[1] === undefined || match[2] === undefined) return null;
  return { major: Number.parseInt(match[1], 10), minor: Number.parseInt(match[2], 10) };
}

/** Whether a version line is below the floor. An unreadable one (a build from master) is not. */
export function belowFloor(versionLine: string): boolean {
  const version = parseVersion(versionLine);
  if (version === null) return false;
  return (
    version.major < MINIMUM_VERSION.major ||
    (version.major === MINIMUM_VERSION.major && version.minor < MINIMUM_VERSION.minor)
  );
}

/**
 * Whether a caller is already a client of THIS server: its `$TMUX` (socket
 * path, pid, session index) names the server's own socket.
 */
export function insideServer(tmuxVar: string | undefined, socketPath: string): boolean {
  if (tmuxVar === undefined || tmuxVar === '' || socketPath === '') return false;
  const callerSocket = tmuxVar.split(',')[0] ?? '';
  return realOrSame(callerSocket) === realOrSame(socketPath);
}

function realOrSame(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    return path;
  }
}

// -- the host ----------------------------------------------------------------

interface CallResult {
  readonly ok: boolean;
  readonly stdout: string;
  readonly stderr: string;
  /** No server is running: an empty answer, not a failed one. */
  readonly noServer: boolean;
}

/** The tmux host, over the program and server the environment names. */
export function tmuxHost(env: Env = process.env): SessionHost {
  const program =
    env.WARD_TMUX_BIN === undefined || env.WARD_TMUX_BIN === '' ? 'tmux' : env.WARD_TMUX_BIN;
  const socket =
    env.WARD_TMUX_SOCKET === undefined || env.WARD_TMUX_SOCKET === ''
      ? undefined
      : env.WARD_TMUX_SOCKET;
  const prefix = socket === undefined ? [] : ['-L', socket];
  const clientEnv: Env = { ...env };
  for (const key of ['TMUX', 'TMUX_PANE', 'WARD_AGENT']) delete clientEnv[key];

  const call = (args: readonly string[]): CallResult => {
    try {
      const result = Bun.spawnSync([program, ...prefix, ...args], {
        env: clientEnv,
        timeout: CALL_TIMEOUT_MS,
        stdin: 'ignore',
      });
      const stderr = result.stderr.toString().trim();
      if (result.exitedDueToTimeout === true) {
        return {
          ok: false,
          stdout: '',
          stderr: `tmux did not answer in ${CALL_TIMEOUT_MS}ms`,
          noServer: false,
        };
      }
      return {
        ok: result.exitCode === 0,
        stdout: result.stdout.toString(),
        stderr,
        noServer: /no server running|error connecting to/.test(stderr),
      };
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      return { ok: false, stdout: '', stderr: `${program}: ${reason}`, noServer: false };
    }
  };

  const must = (args: readonly string[], what: string): string => {
    const result = call(args);
    if (!result.ok)
      throw new WardError(`tmux could not ${what}: ${result.stderr || 'no reason given'}`);
    return result.stdout;
  };

  const groups = (): GroupRow[] => {
    const result = call(listGroupsArgv());
    if (result.ok) return parseGroups(result.stdout);
    if (result.noServer) return [];
    throw new WardError(`tmux could not list its sessions: ${result.stderr}`);
  };

  /**
   * Every pane, as `list-panes -a` lists them — or null when tmux could not
   * say. A server holding no session at all (it outlives its last host, by
   * the hygiene preamble) answers `list-panes -a` with "no current target":
   * that is an empty answer, not a failed one.
   */
  const panes = (): { ok: true; stdout: string } | { ok: false; reason: string } => {
    const result = call(listPanesArgv());
    if (result.ok) return { ok: true, stdout: result.stdout };
    if (result.noServer || /no current target/.test(result.stderr)) return { ok: true, stdout: '' };
    return { ok: false, reason: result.stderr || 'tmux failed without a reason' };
  };

  const find = (session: string): FindResult => {
    const result = panes();
    if (result.ok) return { outcome: 'answered', windows: parseWindows(result.stdout, session) };
    return { outcome: 'unknown', reason: result.reason };
  };

  const ours = (rows: readonly GroupRow[], workspace: string): GroupRow[] =>
    rows.filter((row) => !row.view && row.stamp?.workspace === workspace);

  return {
    kind: 'tmux',
    check(): HostCheck {
      const result = call(['-V']);
      if (!result.ok) {
        return { usable: false, reason: result.stderr || `${program} -V failed` };
      }
      const line = result.stdout.trim();
      if (belowFloor(line)) {
        const floor = `${MINIMUM_VERSION.major}.${MINIMUM_VERSION.minor}`;
        return { usable: false, reason: `${line} is older than tmux ${floor}` };
      }
      return { usable: true, version: line };
    },
    prepare(): void {
      must(prepareArgv(), 'start its server');
    },
    place(request: PlaceRequest): Placement {
      const rows = groups();
      const { workspace, floor } = request.group;
      const existing = ours(rows, workspace)
        .filter((row) => row.stamp?.floor === floor)
        .sort((a, b) => a.created - b.created)[0];
      let group = existing?.name;
      let placeholder: { window: string; index: string } | undefined;
      if (group === undefined) {
        group = mintGroupName(request.workspaceName, floor);
        const minted = group;
        if (rows.some((row) => row.name === minted)) {
          // Found by name but not by stamp: someone else's — another
          // workspace of the same name, or a human's own session. Never joined.
          throw new WardError(
            `a tmux session named '${minted}' already exists and is not this workspace's ` +
              `floor ${floor} host — rename or end it (tmux kill-session -t '=${minted}') ` +
              'and open again',
          );
        }
        const [window = '', index = ''] = must(
          createGroupArgv(minted, request.group, request.version),
          `create host ${minted}`,
        )
          .trim()
          .split(FIELD);
        placeholder = { window, index };
        // The floating windows sit at the left edge of every host: the first
        // replaces the placeholder, the rest follow it.
        for (const tags of request.floating) {
          if (tags.session === request.tags.session) continue;
          const window = windowsOf(find(tags.session), workspace).find(
            (found) => found.tags.epoch === tags.epoch && !found.dead,
          )?.window;
          if (window === undefined) continue;
          must(linkWindowArgv(window, minted, placeholder?.index), `link ${window} into ${minted}`);
          placeholder = undefined;
        }
      }
      const [window = '', pane = ''] = must(
        createWindowArgv(group, request.label),
        `create a window in ${group}`,
      )
        .trim()
        .split(FIELD);
      must(startRunArgv(window, pane, request), `start the run in ${window}`);
      if (placeholder !== undefined)
        must(killWindowArgv(placeholder.window), 'clear the placeholder');
      const linkedInto: string[] = [];
      if (request.floats) {
        for (const other of ours(groups(), workspace)) {
          if (other.name === group) continue;
          must(linkWindowArgv(window, other.name), `link ${window} into ${other.name}`);
          linkedInto.push(other.name);
        }
      }
      return { group, window, createdGroup: existing === undefined, linkedInto };
    },
    find,
    close(window: string, session: string): CloseResult {
      const tag = call(windowTagArgv(window));
      if (!tag.ok) {
        if (tag.noServer || /can't find window|no such window/.test(tag.stderr)) {
          return { outcome: 'absent' };
        }
        return { outcome: 'unknown', reason: tag.stderr };
      }
      const found = tag.stdout.trim();
      if (found !== session) {
        return {
          outcome: 'refused',
          reason: `window ${window} carries ${found === '' ? 'no session tag' : `'${found}'`}, not '${session}'`,
        };
      }
      const killed = call(killWindowArgv(window));
      if (killed.ok) return { outcome: 'closed' };
      if (/can't find window|no such window/.test(killed.stderr)) return { outcome: 'absent' };
      return { outcome: 'unknown', reason: killed.stderr };
    },
    link(window: string, group: string): void {
      const shown = must(['list-windows', '-t', windowTarget(group), '-F', '#{window_id}'], 'list');
      if (lines(shown).includes(window)) return;
      must(linkWindowArgv(window, group), `link ${window} into ${group}`);
    },
    view(request: ViewRequest): View {
      // A name another view just took fails the create; the next free one is tried.
      let last = '';
      for (let attempt = 0; attempt < 5; attempt++) {
        const name = viewName(request.group, request.mode, new Set(groups().map((g) => g.name)));
        if (request.mode === 'attach') {
          const made = call(attachViewArgv(request.group, name, request.workspace, request.window));
          if (made.ok) return { name, mode: 'attach' };
          last = made.stderr;
          if (!/duplicate session/.test(made.stderr)) break;
          continue;
        }
        const made = call(observeViewArgv(name, request.workspace));
        if (!made.ok) {
          last = made.stderr;
          if (/duplicate session/.test(made.stderr)) continue;
          break;
        }
        const index = made.stdout.trim().split('\n')[0] ?? '';
        const linked = call([
          'link-window',
          '-k',
          '-s',
          request.window,
          '-t',
          windowTarget(name, index),
        ]);
        if (linked.ok) return { name, mode: 'observe' };
        call(['kill-session', '-t', sessionTarget(name)]);
        last = linked.stderr;
        break;
      }
      throw new WardError(
        `tmux could not make a view of ${request.window}: ${last || 'no reason given'}`,
      );
    },
    async enter(view: View): Promise<number> {
      const socket = call([
        'display-message',
        '-p',
        '-t',
        windowTarget(view.name),
        '#{socket_path}',
      ]);
      const inside = insideServer(env.TMUX, socket.ok ? socket.stdout.trim() : '');
      const child = Bun.spawn([program, ...prefix, ...enterArgv(view, inside)], {
        // Switching needs the caller's own client named by $TMUX; a fresh
        // attach must not see it, or tmux refuses to nest.
        env: inside ? { ...clientEnv, TMUX: env.TMUX } : clientEnv,
        stdio: ['inherit', 'inherit', 'inherit'],
      });
      return await child.exited;
    },
    inventory(): Inventory {
      const sessions = call(listGroupsArgv());
      if (!sessions.ok) {
        if (sessions.noServer) return { outcome: 'answered', groups: [], windows: [] };
        return { outcome: 'unknown', reason: sessions.stderr || 'tmux failed without a reason' };
      }
      const listed = panes();
      if (!listed.ok) return { outcome: 'unknown', reason: listed.reason };
      const rows = parseGroups(sessions.stdout).map(
        (row): InventoryGroup => ({
          name: row.name,
          ...(row.stamp === undefined ? {} : { stamp: row.stamp }),
          ...(row.view ? { viewOf: row.viewOf } : {}),
          clients: row.clients,
          windows: row.windows,
          created: row.created,
          ...(row.version === '' ? {} : { version: row.version }),
        }),
      );
      return { outcome: 'answered', groups: rows, windows: parseInventoryWindows(listed.stdout) };
    },
    inheritedEnv(): InheritedEnv {
      const result = call(['show-environment', '-g']);
      if (result.ok) return { outcome: 'answered', names: parseEnvironmentNames(result.stdout) };
      if (result.noServer) return { outcome: 'answered', names: [] };
      return { outcome: 'unknown', reason: result.stderr || 'tmux failed without a reason' };
    },
    joinCommand(group: string): string {
      return command(['attach', '-t', sessionTarget(group)]);
    },
    closeCommand(window: string): string {
      return command(['kill-window', '-t', window]);
    },
    endGroupCommand(group: string): string {
      return command(['kill-session', '-t', sessionTarget(group)]);
    },
    forgetEnvCommand(name: string): string {
      return command(['set-environment', '-gu', name]);
    },
  };

  function command(args: readonly string[]): string {
    return [program, ...prefix, ...args].map(shellQuote).join(' ');
  }
}

/** The windows a find returned that stand in this workspace's hosts. */
function windowsOf(result: FindResult, workspace: string): FoundWindow[] {
  if (result.outcome !== 'answered') return [];
  return result.windows.filter((window) =>
    window.groups.some((group) => group.stamp?.workspace === workspace),
  );
}
