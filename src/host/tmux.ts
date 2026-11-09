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
import { WardError } from '../errors.ts';
import type {
  CloseResult,
  FindResult,
  FoundGroup,
  FoundWindow,
  GroupStamp,
  HostCheck,
  Placement,
  PlaceRequest,
  SessionHost,
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

/** Per-window user options and `-e` on respawn arrived by tmux 3.0. */
const MINIMUM_MAJOR = 3;

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
    ].join(FIELD),
  ];
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
  readonly created: number;
}

export function parseGroups(stdout: string): GroupRow[] {
  return lines(stdout).map((line) => {
    const [name = '', workspace = '', floor = '', view = '', created = ''] = line.split(FIELD);
    return {
      name,
      ...stampOf(workspace, floor),
      view: view !== '',
      created: Number.parseInt(created, 10) || 0,
    };
  });
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

/** The tmux version line, as a number we can compare — null when unreadable. */
export function majorVersion(versionLine: string): number | null {
  const match = /(\d+)\.\d+/.exec(versionLine);
  return match?.[1] === undefined ? null : Number.parseInt(match[1], 10);
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

  const find = (session: string): FindResult => {
    const result = call(listPanesArgv());
    if (result.ok) return { outcome: 'answered', windows: parseWindows(result.stdout, session) };
    if (result.noServer) return { outcome: 'answered', windows: [] };
    return { outcome: 'unknown', reason: result.stderr || 'tmux failed without a reason' };
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
      const major = majorVersion(line);
      if (major !== null && major < MINIMUM_MAJOR) {
        return { usable: false, reason: `${line} is older than tmux ${MINIMUM_MAJOR}.0` };
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
    joinCommand(group: string): string {
      return [program, ...prefix, 'attach', '-t', sessionTarget(group)].map(shellQuote).join(' ');
    },
  };
}

/** The windows a find returned that stand in this workspace's hosts. */
function windowsOf(result: FindResult, workspace: string): FoundWindow[] {
  if (result.outcome !== 'answered') return [];
  return result.windows.filter((window) =>
    window.groups.some((group) => group.stamp?.workspace === workspace),
  );
}
