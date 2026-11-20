// tmux as a session host (ADR 0006; design/0031-detached-session-hosting/):
// the one file in Ward that speaks tmux. A floor's group is a tmux SESSION —
// the floor host — found by the `@ward_workspace` and `@ward_floor` options
// stamped on it, never by its name; a Ward session's window is a tmux WINDOW
// tagged with `@ward_session`, `@ward_epoch`, and `@ward_pane` window options,
// which no rename, `automatic-rename`, or terminal title escape can touch.
// Names are therefore presentation, handed in by the Ward side
// (design/0061-host-names-and-titles/) and renamed in place when they change.
//
// A floor host also WEARS its floor's identity (design/0060-floor-identity/):
// its status line takes the floor's color and names the floor beside its
// emoji. That is set as SESSION options on the floor host and on its views —
// never with `-g`, never on the server: the hosts stand on the human's
// default server beside their own sessions, whose look is theirs.
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
import type { InputLine } from '../harness/adapter.ts';
import { INK, PALETTE } from '../theme/palette.ts';
import type {
  CloseResult,
  FindResult,
  FoundGroup,
  FoundWindow,
  GroupIdentity,
  GroupStamp,
  HostCheck,
  InheritedEnv,
  Inventory,
  InventoryGroup,
  InventoryWindow,
  Placement,
  PlaceRequest,
  Renamed,
  RenameRequest,
  SessionHost,
  TypeRequest,
  TypeResult,
  View,
  ViewMode,
  ViewRequest,
} from './host.ts';

type Env = Record<string, string | undefined>;

/**
 * The size a host is created at while no client is attached — the field's
 * tested floor for TUIs drawn with nobody watching (0031, the premise).
 */
export const DETACHED_SIZE = { columns: 120, rows: 40 } as const;

/** Per-call ceiling: past it the answer is "could not determine". */
const CALL_TIMEOUT_MS = 5000;

/**
 * The version floor: per-window user options and `-e` on respawn arrived by
 * tmux 3.0, and in 3.2 both the client flags observe attaches with (`-f
 * read-only,ignore-size`) and the `failed` value of `remain-on-exit`
 * ({@link EXIT_RULE}).
 */
export const MINIMUM_VERSION = { major: 3, minor: 2 } as const;

/**
 * What a session's window does when its run ends
 * (design/0070-clean-exit-closes-window/): tmux's `remain-on-exit failed` — a
 * run that exits 0 closes its window, and one that exits with any other
 * status, or is ended by a signal, leaves its pane behind, dead, with how it
 * ended readable on it. A failure is kept because nothing else would say it
 * happened; a clean exit leaves nothing to say, and a window kept for it
 * only lingers in its floor host (the coordinator's, in every one).
 */
export const EXIT_RULE = 'failed';

/**
 * What holds a freshly created window or host until it is filled: a process
 * that waits and does nothing. The agent never starts here — it starts by a
 * respawn once the window's tags and `remain-on-exit` are already set, so even
 * a run that fails at once leaves its window, and its exit status, behind.
 */
const HOLD = ['cat'];

const FIELD = '\t';

/** tmux's answer for a window id it no longer holds. */
const GONE_WINDOW = /can't find window|no such window/;

// -- names and targets -------------------------------------------------------

/**
 * The name a floor host is given: the name wanted
 * (design/0061-host-names-and-titles/), munged to the characters tmux takes
 * without quoting. Recorded nowhere — the stamps are the binding.
 */
export function mintGroupName(wanted: string): string {
  return munge(wanted);
}

/** What a terminal's title is built from: where it stands, and the floor's mark. */
export interface Titling {
  /** What the title says after the window's own name — literal text. */
  readonly title: string;
  /** The emoji of the floor whose host this is, which the title leads with. */
  readonly identity?: GroupIdentity;
}

/**
 * The title tmux hands a terminal looking at a host or a view: the floor's
 * emoji first when it has one (design/0064-floor-identity-palette/ — a tab
 * shows the head of a title, and the emoji is the shortest thing that says
 * which floor), then the current window's name, where it stands, and — when
 * the run has set one — the pane's own title (the harness's line about what
 * it is doing). A pane that never set a title carries the machine's
 * hostname, which says nothing and is left out. `standing` and the emoji are
 * literal text, so a `#` in either is escaped. The string is the SESSION's,
 * so a window linked into several hosts leads with the emoji of the host it
 * is seen through.
 */
export function titleString(
  standing: string,
  mode: ViewMode = 'attach',
  emoji: string | undefined = undefined,
): string {
  const unset = (name: string) => `#{==:#{pane_title},#{${name}}}`;
  const untitled = `#{||:#{==:#{pane_title},},#{||:${unset('host')},${unset('host_short')}}}`;
  const watching = mode === 'observe' ? ' (observing)' : '';
  const literal = (text: string) => text.replace(/#/g, '##');
  const lead = emoji === undefined || emoji === '' ? '' : `${literal(emoji)} `;
  return `${lead}#{window_name} · ${literal(standing)}${watching}#{?${untitled},, · #{pane_title}}`;
}

/** Turn terminal titles on for one tmux session, and say what they read. */
function titleOptions(name: string, titling: Titling, mode: ViewMode = 'attach'): string[] {
  const target = ['-t', windowTarget(name)];
  const string = titleString(titling.title, mode, titling.identity?.emoji);
  return [
    ...setOption(target, 'set-titles', 'on'),
    ...setOption(target, 'set-titles-string', string),
  ];
}

/** Rename a tmux session in place — every window, client, and stamp stays. */
export function renameGroupArgv(from: string, to: string): string[] {
  return ['rename-session', '-t', sessionTarget(from), to];
}

/** Title a tmux session that already exists — a host, or a view in its own mode. */
export function titleGroupArgv(
  name: string,
  titling: Titling,
  mode: ViewMode = 'attach',
): string[] {
  return titleOptions(name, titling, mode).slice(1);
}

export function renameWindowArgv(window: string, label: string): string[] {
  return ['rename-window', '-t', window, label];
}

/**
 * Bring a window whose run is still going to today's exit rule
 * ({@link EXIT_RULE}) — a window an older Ward made keeps every exit, a clean
 * one included, until this is said to it. Only ever sent for a RUNNING
 * window: one already dead was kept under the rule it died by, and stays
 * until a resume or a close clears it. (tmux applies the option when a pane
 * dies and never looks at it again, so one that died in the instant before
 * this arrives is left standing as well — measured on 3.7c.)
 */
export function exitRuleArgv(window: string): string[] {
  return ['set-option', '-w', '-t', window, 'remain-on-exit', EXIT_RULE];
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
export function createGroupArgv(
  name: string,
  stamp: GroupStamp,
  version: string,
  title: Titling,
): string[] {
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
    ...titleOptions(name, title),
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
 * Tag the window, make it keep a failed exit ({@link EXIT_RULE}), keep its
 * name, then start the run in its pane — in that order, in one invocation,
 * so a run that fails at once still leaves a tagged, dead window to read.
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
    ...setOption(target, 'remain-on-exit', EXIT_RULE),
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
      '#{session_group}',
    ].join(FIELD),
  ];
}

/**
 * The name of a view: the group's name and `-v<n>` for an attach view, or
 * `-o<n>` for an observe view, with the smallest `n` no tmux session wears.
 */
export function viewName(group: string, mode: ViewMode, taken: ReadonlySet<string>): string {
  for (let n = 1; ; n++) {
    const name = `${group}-${viewLetter(mode)}${n}`;
    if (!taken.has(name)) return name;
  }
}

function viewLetter(mode: ViewMode): string {
  return mode === 'attach' ? 'v' : 'o';
}

/**
 * Whether a view already wears a name derived from `group` — the only thing a
 * view's name is ever read for: deciding whether it is due a new one
 * (design/0063-views-follow-their-host/). What a view IS comes from its stamp.
 */
export function namedFor(view: string, group: string, mode: ViewMode): boolean {
  const lead = `${group}-${viewLetter(mode)}`;
  return view.startsWith(lead) && /^[1-9][0-9]*$/.test(view.slice(lead.length));
}

/**
 * An attach view: a tmux session GROUPED with the floor host, so it shares
 * the host's windows but holds a current window of its own — selecting the
 * session's window in it moves no other client. Stamped `@ward_view` with the
 * workspace id it was made for.
 */
export function attachViewArgv(
  group: string,
  name: string,
  workspace: string,
  window: string,
  title: Titling,
) {
  return [
    'new-session',
    '-d',
    '-t',
    sessionTarget(group),
    '-s',
    name,
    // The view's session id, printed as it is made: a view whose window
    // cannot be selected is ended by it ({@link endViewArgv}'s reasoning).
    '-P',
    '-F',
    '#{session_id}',
    ...setOption(['-t', windowTarget(name)], '@ward_view', workspace),
    // A grouped session shares its host's windows, not its options: the view
    // is titled for itself.
    ...titleOptions(name, title),
    ';',
    'select-window',
    '-t',
    windowTarget(name, window),
  ];
}

/**
 * An observe view: a tmux session of its own, holding a placeholder window
 * the watched window is then linked in beside ({@link watchArgv}). The
 * placeholder STAYS, hidden from the view's window list: it is what keeps
 * the view standing for the instant after the watched window goes, so the
 * view's own hook ({@link enterArgv}) can act on the observer while that
 * client is still in the view it joined — rather than wherever tmux would
 * have moved it once the view had ended under it.
 */
export function observeViewArgv(name: string, workspace: string, title: Titling): string[] {
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
    '#{window_id}',
    ...HOLD,
    ...setOption(['-t', windowTarget(name)], '@ward_view', workspace),
    ...titleOptions(name, title, 'observe'),
  ];
}

/**
 * Show the watched window in an observe view, current, beside its
 * placeholder — whose entry in the view's window list is emptied, so the
 * observer's status line names the one window it asked for.
 */
export function watchArgv(view: string, placeholder: string, window: string): string[] {
  return [
    ...setOption(['-w', '-t', placeholder], 'window-status-format', '').slice(1),
    ...setOption(['-w', '-t', placeholder], 'window-status-current-format', ''),
    ';',
    'link-window',
    '-s',
    window,
    '-t',
    windowTarget(view),
    ';',
    'select-window',
    '-t',
    windowTarget(view, window),
  ];
}

/**
 * What an observe view does when the window it watches goes: the view's
 * current window changes (to the placeholder — the only other one, and no
 * client of a read-only view can select it), and the hook detaches the
 * OBSERVER'S OWN client, named by `#{client_name}` as the option is set
 * (`set-option -F`, run by that client as it joins), then ends the view.
 * Naming the one client is the point: tmux, ending a floor's host, may have
 * just moved a participant into this view, and that client must not be
 * detached with the observer — the view's `detach-on-destroy off` moves it
 * on to a session still standing when the view ends.
 */
export const OBSERVER_LEAVES = 'detach-client -t "#{client_name}" ; kill-session';

/**
 * Join a view. A caller already a client of this server is SWITCHED to it
 * (an attach run inside tmux would otherwise nest); anyone else attaches,
 * observe read-only and without resizing the window.
 *
 * A view ends when its client leaves, and it is never left to tmux's
 * `destroy-unattached` to end it (design/0076-tmux-remaining-races/). That
 * option is a tmux fault waiting to happen (through 3.7c): a client told to
 * detach stops counting as attached before it has left its session, and the
 * next time tmux looks for unattached sessions — any client of the server
 * disconnecting is enough — it destroys a `destroy-unattached` view with that
 * client still pointing into it, and the SERVER dies, every host and run on
 * it with it. `kill-session` takes the other path, which moves every client
 * out first, so a view is only ever ended by one, guarded so that it ends
 * only a view nobody is in ({@link endViewIfEmpty}):
 *
 * - by the view's own `client-detached` hook ({@link VIEW_ENDS}), which tmux
 *   runs once a client that was in it has GONE — detached, or its terminal
 *   closed — never while it is on its way out;
 * - by Ward, when the client it attached returns ({@link endViewArgv}), for
 *   a view whose client never got in;
 * - and, for a view its client left by switching to another session — tmux
 *   runs no hook of the view's for that — by the next view made in the
 *   workspace ({@link leftViewsArgv}), which ends every view that was joined
 *   and has nobody in it. Until then it is what doctor reports as a leftover.
 *
 * Every view is marked `@ward_joined` as its client joins, so that sweep
 * never ends a view another Ward has made and not yet joined.
 *
 * What becomes of the client when the VIEW ends under it (the last window it
 * shows closed) is said here too, never left to the server's default: it
 * moves to another tmux session, as a client sitting in the floor host itself
 * does. tmux ends a host and its views one after another, moving each one's
 * clients into whatever session it finds — one of those views as readily as
 * any — so a single view that detached its clients would drop to the shell
 * whoever had just been moved into it. Every view moving its clients on is
 * what makes the host's own promise hold.
 *
 * An OBSERVER is the exception, and it is made per client, not per view: it
 * asked to watch one window, so when that window goes its terminal returns
 * to the shell rather than landing, read-only, in a session it never asked
 * to see. The observe view's hook ({@link OBSERVER_LEAVES}) detaches that
 * one client by name; the view still moves on anyone else found in it.
 */
export function enterArgv(view: View, inside: boolean): string[] {
  const target = sessionTarget(view.name);
  const join = switches(view, inside)
    ? ['switch-client', '-t', target]
    : [
        'attach-session',
        ...(view.mode === 'observe' ? ['-f', 'read-only,ignore-size'] : []),
        '-t',
        target,
      ];
  const options = ['-t', windowTarget(view.name)];
  return [
    ...join,
    ...setOption(options, '@ward_joined', '1'),
    ...setOption(options, 'detach-on-destroy', 'off'),
    ...setOption(options, 'client-detached', VIEW_ENDS),
    ...(view.mode === 'observe'
      ? setOption(['-F', ...options], 'session-window-changed', OBSERVER_LEAVES)
      : []),
  ];
}

/** Whether joining `view` switches the caller's own client rather than attaching a new one. */
function switches(view: View, inside: boolean): boolean {
  return view.mode === 'attach' && inside;
}

/** True of a session nobody is attached to — the only kind a view is ended as. */
const EMPTY = '#{==:#{session_attached},0}';

/**
 * A view's `client-detached` hook: once a client that was in it has gone,
 * end the view if nobody is left in it. tmux runs a hook with the view as
 * its target, so the bare `kill-session` ends this view and no other; a
 * client tmux has moved in since keeps it standing, and the hook runs again
 * when that one goes.
 */
export const VIEW_ENDS = `if-shell -F '${EMPTY}' kill-session`;

/**
 * End the view `sessionId` (`$N`) if nobody is in it — the check and the end
 * one tmux command, so a client that joins it in between is never thrown
 * out. Named by id, never by name: an id is not handed out twice, so a view
 * that has already ended — its name perhaps taken by another client's fresh,
 * not-yet-joined view — is simply not found.
 */
function endViewIfEmpty(sessionId: string, also = ''): string[] {
  const when = also === '' ? EMPTY : `#{&&:${EMPTY},${also}}`;
  // Quoted: tmux would read a bare `$N` in a command string as a variable.
  return ['if-shell', '-F', '-t', `${sessionId}:`, when, `kill-session -t '${sessionId}'`];
}

/** End a view whose client has left — unless tmux has moved another client into it. */
export function endViewArgv(sessionId: string): string[] {
  return endViewIfEmpty(sessionId);
}

/** Every view's id, the workspace it was made for, whether it was joined, and its clients. */
export function leftViewsArgv(): string[] {
  return [
    'list-sessions',
    '-F',
    ['#{session_id}', '#{@ward_view}', '#{@ward_joined}', '#{session_attached}'].join(FIELD),
  ];
}

/** The ids of `workspace`'s views that were joined and have nobody in them. */
export function parseLeftViews(stdout: string, workspace: string): string[] {
  return lines(stdout)
    .map((row) => row.split(FIELD))
    .filter(([id = '', of = '', joined = '', clients = '']) => {
      return id.startsWith('$') && of === workspace && joined === '1' && clients === '0';
    })
    .map(([id = '']) => id);
}

/** End a view the sweep found left — still only if it is joined and empty as it ends. */
export function endLeftViewArgv(sessionId: string): string[] {
  return endViewIfEmpty(sessionId, '#{@ward_joined}');
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

/**
 * Dress one tmux session — a floor host, or a view of one — in a floor's
 * identity: the status line in the floor's color with the ink that reads on
 * it, and the floor named in full at its left edge, emoji first. SESSION
 * options only, so a window linked into several hosts (the coordinator) shows
 * under each host's own theme, and nothing outside this one session changes.
 * The `@ward_color` and `@ward_emoji` stamps say what it wears to anything
 * that asks; nothing finds a host by them.
 */
export function themeArgv(session: string, identity: GroupIdentity): string[] {
  const target = ['-t', windowTarget(session)];
  const swatch = PALETTE[identity.color];
  const name = `${identity.emoji} ${identity.label}`;
  const style = `bg=colour${swatch.xterm},fg=colour${INK[swatch.ink]}`;
  return [
    ...setOption(target, 'status-style', style).slice(1),
    ...setOption(target, 'status-left', `#[bold] ${statusText(name)} #[nobold] `),
    // tmux's default (10 cells) cuts a host's name off mid-word; the cap
    // keeps a very long slug from pushing the window list off a narrow terminal.
    ...setOption(target, 'status-left-length', String(Math.min(name.length + 4, STATUS_LEFT_MAX))),
    ...setOption(target, '@ward_color', identity.color),
    ...setOption(target, '@ward_emoji', identity.emoji),
  ];
}

/** The widest the floor's name may make the status line's left edge. */
export const STATUS_LEFT_MAX = 48;

/** Text as a status line shows it literally: `#` opens a format, `%` a strftime field. */
export function statusText(text: string): string {
  return text.replace(/#/g, '##').replace(/%/g, '%%');
}

/**
 * Read one window's tag, then end it — two calls, the read first. The read
 * asks for the window's id beside its tag: tmux answers a read of a window it
 * no longer holds with an empty line and exit 0 (display-message's target may
 * fail), so an empty id is the only sign that the window has gone.
 */
export function windowTagArgv(window: string): string[] {
  return ['display-message', '-p', '-t', window, ['#{window_id}', '#{@ward_session}'].join(FIELD)];
}

export function killWindowArgv(window: string): string[] {
  return ['kill-window', '-t', window];
}

// -- typing into a run (design/0067-floor-dispatch/) ---------------------------

/** What a typed line may be: one line of printable ASCII, short enough to read back. */
export const TYPEABLE = /^[\x20-\x7e]{1,200}$/;

/** How long a typed line is waited for on the screen, and its submission after it. */
const TYPE_WAIT_MS = 2000;
const TYPE_POLL_MS = 100;

/**
 * The window's id, its session tag, and the pane its run was started in — the
 * id read only to tell a window that has gone (an empty one, see
 * {@link windowTagArgv}).
 */
export function windowRunArgv(window: string): string[] {
  return [
    'display-message',
    '-p',
    '-t',
    window,
    ['#{window_id}', '#{@ward_session}', '#{@ward_pane}'].join(FIELD),
  ];
}

/** The run's pane: the window it is in, whether its run has ended, whether it is in a mode. */
export function paneStateArgv(pane: string): string[] {
  return [
    'display-message',
    '-p',
    '-t',
    pane,
    ['#{window_id}', '#{pane_dead}', '#{pane_in_mode}'].join(FIELD),
  ];
}

/** The pane's visible screen, as plain text. */
export function captureArgv(pane: string): string[] {
  return ['capture-pane', '-p', '-t', pane];
}

/**
 * Type text into a pane literally: `-l` so no word of it is read as a key
 * name, `--` so none is read as a flag. Never carries the submitting key.
 */
export function typeArgv(pane: string, text: string): string[] {
  return ['send-keys', '-t', pane, '-l', '--', text];
}

/** What {@link submitArgv} prints: the key went, or tmux held it back. */
export const SUBMITTED = 'submitted';
export const HELD = 'held';

/**
 * The submitting key, sent only after the typed line was read back — and
 * sent BY TMUX, only while the screen still reads as it did then
 * (design/0076-tmux-remaining-races/). The check and the key are one tmux
 * command: `if-shell -F` evaluates {@link screenHolds} and, when it holds,
 * queues the `send-keys` right behind itself, and tmux runs its command
 * queue to the end before it reads anything more from any pane. So no
 * output of the run's — a question drawn over its input line — can land
 * between the check and the key, as it could between a read-back on Ward's
 * side and a second tmux client sending the key. Prints {@link SUBMITTED}
 * or {@link HELD}, so Ward knows which happened.
 */
export function submitArgv(pane: string, screen: string, rows: InputLine['rows']): string[] {
  return [
    'if-shell',
    '-F',
    '-t',
    pane,
    `#{&&:#{==:#{pane_in_mode},0},${screenHolds(screen, rows)}}`,
    `send-keys -t ${pane} Enter ; display-message -p ${SUBMITTED}`,
    `display-message -p ${HELD}`,
  ];
}

/**
 * A tmux format that is true while the pane's visible screen still holds,
 * at the same places, the non-blank rows `first` to `last` of `screen` (a
 * capture of it). tmux's `#{C/r:…}` answers the first visible row a regular
 * expression matches (1-based, 0 for none, trailing blanks ignored, as a
 * capture prints them), so each row is asked for whole — anchored, its
 * characters escaped — and must answer the row where it first stands in
 * `screen`. A row seen twice is known by where it was first seen, which is
 * a weaker check of the later one and never a looser answer: any change
 * that moves either reads as a change. A blank row cannot be told apart this
 * way and is not asked about. Nothing here can make the check pass on a
 * screen that differs in an asked row; a pattern tmux cannot compile matches
 * nothing, and holds the key back.
 */
export function screenHolds(screen: string, rows: InputLine['rows']): string {
  const visible = screen.split('\n').map((row) => row.replace(/[ \t\n\v\f\r]+$/u, ''));
  const terms: string[] = [];
  for (let index = rows.first; index <= rows.last; index++) {
    const row = visible[index];
    if (row === undefined || row === '') continue;
    const at = visible.indexOf(row) + 1;
    terms.push(`#{==:#{C/r:^${formatEscape(rowPattern(row))}$},${at}}`);
  }
  // Nothing to ask about is a screen this check cannot vouch for.
  if (terms.length === 0) return '0';
  return terms.reduceRight((rest, term) => `#{&&:${term},${rest}}`);
}

/** The most repeats one POSIX interval may count (RE_DUP_MAX is 255 on macOS). */
const RUN_MAX = 255;

/**
 * A row as an extended regular expression that matches it alone: every
 * character special to one escaped, and a run of four or more of the same
 * character — a rule, a gutter of spaces — counted rather than spelled, so a
 * wide pane's row stays well inside what one tmux command may carry. A run is
 * counted as a group, `(─){40}`, so a character of several bytes repeats
 * whole whatever the server's locale.
 */
export function rowPattern(row: string): string {
  const chars = [...row];
  let out = '';
  for (let at = 0; at < chars.length; ) {
    const char = chars[at] ?? '';
    let run = 1;
    while (chars[at + run] === char) run += 1;
    const one = /[.[()*+?{|^$\\]/u.test(char) ? `\\${char}` : char;
    if (run < 4) {
      out += one.repeat(run);
    } else {
      for (let left = run; left > 0; left -= RUN_MAX) {
        out += `(${one}){${Math.min(left, RUN_MAX)}}`;
      }
    }
    at += run;
  }
  return out;
}

/** Text as a literal inside a tmux format: `#`, `,` and `}` escaped with `#`. */
function formatEscape(text: string): string {
  return text.replace(/[#,}]/gu, (char) => `#${char}`);
}

/** Take back exactly `count` typed characters, at the cursor that typed them. */
export function eraseArgv(pane: string, count: number): string[] {
  return ['send-keys', '-t', pane, '-N', String(count), 'BSpace'];
}

/** Text as it compares across a wrapped input line: without its whitespace. */
export function squash(text: string): string {
  return text.replace(/\s+/gu, '');
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
  /** The tmux session group it is a member of — empty when it is in none. */
  readonly group: string;
}

/**
 * The floor host each ATTACH view looks at, by view name: tmux holds a view in
 * its host's session group, so the host is the member of that group that is
 * no view — found by group and stamp, never by name. An observe view is a
 * member of no group, and is not here.
 */
export function viewHosts(rows: readonly GroupRow[]): Map<string, string> {
  const hosts = new Map<string, string>();
  for (const row of rows) {
    if (row.group !== '' && !row.view && row.stamp !== undefined) hosts.set(row.group, row.name);
  }
  const found = new Map<string, string>();
  for (const row of rows) {
    const host = row.view && row.group !== '' ? hosts.get(row.group) : undefined;
    if (host !== undefined) found.set(row.name, host);
  }
  return found;
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
      group = '',
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
      group,
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

// -- the runner (design/0073-scripted-tmux-runner/) ---------------------------

/** What one tmux invocation answered. */
export interface TmuxReply {
  /** The exit status — null when the program was ended before it gave one. */
  readonly exitCode: number | null;
  readonly stdout: string;
  readonly stderr: string;
  /** The call was ended at the per-call ceiling, unanswered. */
  readonly timedOut: boolean;
}

/** The client a view is joined through, running on the caller's own terminal. */
export interface TmuxClient {
  readonly exited: Promise<number>;
  kill(signal: NodeJS.Signals): void;
}

/**
 * How the host reaches tmux: run one command line and read its answer, start
 * the client that joins a view, and wait between two reads of a screen. Each
 * `argv` is everything after the program and its server (`-L NAME`), so the
 * same conversation reads the same on any server. Production runs the real
 * program ({@link spawnRunner}); a test hands in a runner that plays back what
 * a real tmux once answered (test/host/scripted-tmux.ts). Everything Ward
 * decides from an answer — what counts as no server, a gone window, a
 * timeout — stays in {@link tmuxHost}, above this line.
 */
export interface TmuxRunner {
  /** Run one command line and wait for it. Throws when the program cannot be started. */
  run(argv: readonly string[]): TmuxReply;
  /**
   * Start a client on the caller's terminal. `tmuxVar` is the `$TMUX` it is
   * handed — given only when it switches the caller's own client.
   */
  client(argv: readonly string[], tmuxVar?: string): TmuxClient;
  /** Wait between two reads of a pane's screen. */
  pause(ms: number): void;
}

/** The real tmux: `program`, on the server `prefix` names, from `env`. */
export function spawnRunner(program: string, prefix: readonly string[], env: Env): TmuxRunner {
  return {
    run(argv) {
      const result = Bun.spawnSync([program, ...prefix, ...argv], {
        env,
        timeout: CALL_TIMEOUT_MS,
        stdin: 'ignore',
      });
      return {
        exitCode: result.exitCode,
        stdout: result.stdout.toString(),
        stderr: result.stderr.toString(),
        timedOut: result.exitedDueToTimeout === true,
      };
    },
    client(argv, tmuxVar) {
      const child = Bun.spawn([program, ...prefix, ...argv], {
        // Switching needs the caller's own client named by $TMUX; a fresh
        // attach must not see it, or tmux refuses to nest.
        env: tmuxVar === undefined ? env : { ...env, TMUX: tmuxVar },
        stdio: ['inherit', 'inherit', 'inherit'],
      });
      return { exited: child.exited, kill: (signal) => child.kill(signal) };
    },
    pause: (ms) => Bun.sleepSync(ms),
  };
}

// -- the host ----------------------------------------------------------------

interface CallResult {
  readonly ok: boolean;
  readonly stdout: string;
  readonly stderr: string;
  /** No server is running: an empty answer, not a failed one. */
  readonly noServer: boolean;
}

/**
 * The tmux host, over the program and server the environment names — or over
 * the runner given, which then stands for both (a test's scripted tmux).
 */
export function tmuxHost(env: Env = process.env, runner?: TmuxRunner): SessionHost {
  const program =
    env.WARD_TMUX_BIN === undefined || env.WARD_TMUX_BIN === '' ? 'tmux' : env.WARD_TMUX_BIN;
  const socket =
    env.WARD_TMUX_SOCKET === undefined || env.WARD_TMUX_SOCKET === ''
      ? undefined
      : env.WARD_TMUX_SOCKET;
  const prefix = socket === undefined ? [] : ['-L', socket];
  const clientEnv: Env = { ...env };
  for (const key of ['TMUX', 'TMUX_PANE', 'WARD_AGENT']) delete clientEnv[key];
  const tmux = runner ?? spawnRunner(program, prefix, clientEnv);

  const call = (args: readonly string[], flags: readonly string[] = []): CallResult => {
    try {
      const result = tmux.run([...flags, ...args]);
      const stderr = result.stderr.trim();
      if (result.timedOut) {
        return {
          ok: false,
          stdout: '',
          stderr: `tmux did not answer in ${CALL_TIMEOUT_MS}ms`,
          noServer: false,
        };
      }
      return {
        ok: result.exitCode === 0,
        stdout: result.stdout,
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
        group = mintGroupName(request.naming.name);
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
          createGroupArgv(minted, request.group, request.version, request.naming),
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
      // A host this placement made is born wearing its floor's identity; one
      // already standing was dressed by the refresh that ran before it. Best
      // effort: a run never fails to start over a status line.
      if (existing === undefined && request.naming.identity !== undefined)
        call(themeArgv(group, request.naming.identity));
      const linkedInto: string[] = [];
      if (request.floats) {
        for (const other of ours(groups(), workspace)) {
          if (other.name === group) continue;
          const linked = call(linkWindowArgv(window, other.name));
          // A run that has already exited cleanly took its window with it
          // (EXIT_RULE): there is nothing left to link anywhere, and the
          // launch is reported as it stands — gone — rather than failed.
          if (!linked.ok && GONE_WINDOW.test(linked.stderr)) break;
          if (!linked.ok) {
            throw new WardError(
              `tmux could not link ${window} into ${other.name}: ` +
                `${linked.stderr || 'no reason given'}`,
            );
          }
          linkedInto.push(other.name);
        }
      }
      return { group, window, createdGroup: existing === undefined, linkedInto };
    },
    find,
    close(window: string, session: string): CloseResult {
      const tag = call(windowTagArgv(window));
      if (!tag.ok) {
        if (tag.noServer || GONE_WINDOW.test(tag.stderr)) {
          return { outcome: 'absent' };
        }
        return { outcome: 'unknown', reason: tag.stderr };
      }
      const [id = '', found = ''] = tag.stdout.replace(/\n$/, '').split(FIELD);
      if (id === '') return { outcome: 'absent' };
      if (found !== session) {
        return {
          outcome: 'refused',
          reason: `window ${window} carries ${found === '' ? 'no session tag' : `'${found}'`}, not '${session}'`,
        };
      }
      const killed = call(killWindowArgv(window));
      if (killed.ok) return { outcome: 'closed' };
      if (GONE_WINDOW.test(killed.stderr)) return { outcome: 'absent' };
      return { outcome: 'unknown', reason: killed.stderr };
    },
    link(window: string, group: string): void {
      const shown = must(['list-windows', '-t', windowTarget(group), '-F', '#{window_id}'], 'list');
      if (lines(shown).includes(window)) return;
      must(linkWindowArgv(window, group), `link ${window} into ${group}`);
    },
    typeLine(request: TypeRequest): TypeResult {
      const { window, session, text } = request;
      if (!TYPEABLE.test(text)) {
        return { outcome: 'withheld', reason: 'the line is not one line of printable ASCII' };
      }
      const gone = (result: CallResult) =>
        result.noServer || /can't find (window|pane)|no such (window|pane)/.test(result.stderr);
      const run = call(windowRunArgv(window));
      if (!run.ok) {
        return gone(run) ? { outcome: 'absent' } : { outcome: 'unknown', reason: run.stderr };
      }
      const [id = '', tag = '', pane = ''] = run.stdout.replace(/\n$/, '').split(FIELD);
      if (id === '') return { outcome: 'absent' };
      if (tag !== session) {
        const carries = tag === '' ? 'no session tag' : `'${tag}'`;
        return {
          outcome: 'withheld',
          reason: `window ${window} carries ${carries}, not '${session}'`,
        };
      }
      if (pane === '') {
        return {
          outcome: 'withheld',
          reason: `window ${window} carries '${session}' but names no pane for its run`,
        };
      }
      const state = call(paneStateArgv(pane));
      if (!state.ok) {
        return gone(state) ? { outcome: 'absent' } : { outcome: 'unknown', reason: state.stderr };
      }
      const [inWindow = '', dead = '', mode = ''] = state.stdout.trim().split(FIELD);
      if (inWindow !== window) {
        return { outcome: 'withheld', reason: `the run's pane is no longer in window ${window}` };
      }
      if (dead === '1') return { outcome: 'withheld', reason: 'its run has ended' };
      // A pane in copy mode reads keys as scrolling commands, not as input.
      if (mode !== '0') {
        return { outcome: 'withheld', reason: 'someone is scrolling its window (copy mode)' };
      }
      const look = (): { screen: string; read: InputLine | null } | null => {
        // `-u`: the screen is read as UTF-8 whatever locale Ward was run
        // in — the marks an input line is known by are not ASCII, and a
        // client in the C locale is handed `_` in their place.
        const screen = call(captureArgv(pane), ['-u']);
        return screen.ok ? { screen: screen.stdout, read: request.inputLine(screen.stdout) } : null;
      };
      const line = (): string | null => look()?.read?.text ?? null;
      if (line() === null) {
        return { outcome: 'withheld', reason: 'its screen does not show an input line' };
      }
      const typed = call(typeArgv(pane, text));
      if (!typed.ok) return { outcome: 'unknown', reason: typed.stderr || 'tmux gave no reason' };
      // Read it back: the submitting key is sent only at an input line that
      // holds this line and nothing else.
      const wanted = squash(text);
      const until = <T>(read: () => T, done: (seen: T) => boolean): { seen: T; waited: number } => {
        let seen = read();
        let waited = 0;
        for (; !done(seen) && waited < TYPE_WAIT_MS; waited += TYPE_POLL_MS) {
          tmux.pause(TYPE_POLL_MS);
          seen = read();
        }
        return { seen, waited };
      };
      const holds = (held: string | null | undefined): boolean =>
        held !== null && held !== undefined && squash(held) === wanted;
      const back = until(look, (held) => holds(held?.read?.text));
      const seen = back.seen?.read?.text ?? null;
      if (seen === null) {
        return {
          outcome: 'unknown',
          reason:
            'its screen stopped showing an input line as the line was typed — not submitted; ' +
            'the typed text may have gone to whatever took its place',
        };
      }
      if (squash(seen) !== wanted) {
        // Someone's own words were there first. The typed characters sit at
        // the cursor that typed them, so taking back that many restores the
        // line — done only when the screen shows them at its end.
        const before = squash(seen).slice(0, -wanted.length);
        if (squash(seen).endsWith(wanted) && call(eraseArgv(pane, text.length)).ok) {
          const restored = until(line, (held) => held !== null && squash(held) === before).seen;
          if (restored !== null && squash(restored) === before) {
            return {
              outcome: 'withheld',
              reason: 'its input line already held text — put back as it was',
            };
          }
        }
        return {
          outcome: 'unknown',
          reason: 'its input line did not read back as typed — not submitted; the text may remain',
        };
      }
      // Submit — tmux sends the key only while the rows this reading rests on
      // still read the same (submitArgv). A screen that moved in between is
      // read again: still the line, alone, and the key is tried again over
      // the new reading; anything else, and the key is never sent.
      let reading = back.seen;
      let waited = back.waited;
      for (;;) {
        const rows = reading?.read?.rows;
        if (reading === null || rows === undefined) break;
        const sent = call(submitArgv(pane, reading.screen, rows));
        if (!sent.ok) return { outcome: 'unknown', reason: sent.stderr || 'tmux gave no reason' };
        if (sent.stdout.trim() === SUBMITTED) {
          const after = until(line, (held) => held === null || squash(held) !== wanted).seen;
          if (after !== null && squash(after) === wanted) {
            return {
              outcome: 'unknown',
              reason: 'typed and submitted, but the line is still there',
            };
          }
          return { outcome: 'typed' };
        }
        if (waited >= TYPE_WAIT_MS) break;
        tmux.pause(TYPE_POLL_MS);
        waited += TYPE_POLL_MS;
        reading = look();
        if (!holds(reading?.read?.text)) break;
      }
      return {
        outcome: 'unknown',
        reason:
          'its screen changed before the line could be submitted — not submitted; ' +
          'the typed text may remain on its input line',
      };
    },
    rename(request: RenameRequest): Renamed {
      const renamed: { from: string; to: string }[] = [];
      const moved: { from: string; to: string }[] = [];
      const failed: string[] = [];
      const themed: { group: string; views: string[] }[] = [];
      let taken: Set<string>;
      try {
        taken = new Set(groups().map((row) => row.name));
      } catch (error) {
        return {
          groups: [],
          views: [],
          failed: [error instanceof Error ? error.message : String(error)],
          themed: [],
        };
      }
      const why = (result: CallResult) => result.stderr || 'tmux gave no reason';
      for (const { name, naming, views = [] } of request.groups) {
        if (!taken.has(name)) continue;
        const wanted = mintGroupName(naming.name);
        let current = name;
        // A name another tmux session wears is left to it: this host keeps
        // the name it has, which nothing depends on.
        if (wanted !== name && !taken.has(wanted)) {
          const hostMoved = call(renameGroupArgv(name, wanted));
          if (hostMoved.ok) {
            current = wanted;
            taken.delete(name);
            taken.add(wanted);
            renamed.push({ from: name, to: wanted });
          } else {
            failed.push(`${name}: ${why(hostMoved)}`);
          }
        }
        const titled = call(titleGroupArgv(current, naming));
        if (!titled.ok) failed.push(`${current}: ${why(titled)}`);
        let dressed = false;
        if (naming.identity !== undefined) {
          const themedHost = call(themeArgv(current, naming.identity));
          dressed = themedHost.ok;
          if (!dressed) failed.push(`${current}: ${why(themedHost)}`);
        }
        // Then every view a client is looking at the host through: a view
        // shares the host's windows, not its name or its options, so each is
        // renamed after the host as it is called now, titled, and dressed —
        // in place, its client left exactly where it is.
        const worn: string[] = [];
        for (const view of views) {
          if (!taken.has(view.name)) continue;
          let now = view.name;
          if (!namedFor(view.name, current, view.mode)) {
            const wantedView = viewName(current, view.mode, taken);
            const followed = call(renameGroupArgv(view.name, wantedView));
            if (followed.ok) {
              now = wantedView;
              taken.delete(view.name);
              taken.add(wantedView);
              moved.push({ from: view.name, to: wantedView });
            } else {
              failed.push(`${view.name}: ${why(followed)}`);
            }
          }
          const viewTitled = call(titleGroupArgv(now, naming, view.mode));
          if (!viewTitled.ok) failed.push(`${now}: ${why(viewTitled)}`);
          if (!dressed || naming.identity === undefined) continue;
          if (call(themeArgv(now, naming.identity)).ok) worn.push(now);
        }
        if (dressed) themed.push({ group: current, views: worn });
      }
      for (const { window, label, running } of request.windows) {
        const relabelled = call([
          ...renameWindowArgv(window, label),
          ...(running ? [';', ...exitRuleArgv(window)] : []),
        ]);
        if (!relabelled.ok) failed.push(`${window}: ${why(relabelled)}`);
      }
      return { groups: renamed, views: moved, failed, themed };
    },
    view(request: ViewRequest): View {
      // First, the views this workspace's clients left by switching away from
      // them (enterArgv): best effort, each ended only if still empty.
      const left = call(leftViewsArgv());
      if (left.ok) {
        for (const id of parseLeftViews(left.stdout, request.workspace)) {
          call(endLeftViewArgv(id));
        }
      }
      // A name another view just took fails the create; the next free one is tried.
      let last = '';
      for (let attempt = 0; attempt < 5; attempt++) {
        const name = viewName(request.group, request.mode, new Set(groups().map((g) => g.name)));
        if (request.mode === 'attach') {
          const made = call(
            attachViewArgv(request.group, name, request.workspace, request.window, request),
          );
          if (made.ok) return worn({ name, mode: 'attach' }, request);
          last = made.stderr;
          if (/duplicate session/.test(made.stderr)) continue;
          // Made, then refused its window: the session this call made (named
          // by the id it printed, never by a name another may since have
          // taken) is ended, as an observe view's is.
          const viewId = made.stdout.trim().split('\n')[0] ?? '';
          if (viewId.startsWith('$')) call(['kill-session', '-t', viewId]);
          break;
        }
        const made = call(observeViewArgv(name, request.workspace, request));
        if (!made.ok) {
          last = made.stderr;
          if (/duplicate session/.test(made.stderr)) continue;
          break;
        }
        const placeholder = made.stdout.trim().split('\n')[0] ?? '';
        const linked = call(watchArgv(name, placeholder, request.window));
        if (linked.ok) return worn({ name, mode: 'observe' }, request);
        call(['kill-session', '-t', sessionTarget(name)]);
        last = linked.stderr;
        break;
      }
      throw new WardError(
        `tmux could not make a view of ${request.window}: ${last || 'no reason given'}`,
      );
    },
    async enter(view: View): Promise<number> {
      const where = call([
        'display-message',
        '-p',
        '-t',
        windowTarget(view.name),
        `#{socket_path}${FIELD}#{session_id}`,
      ]);
      const [socketPath = '', sessionId = ''] = where.ok ? where.stdout.trim().split(FIELD) : [];
      const inside = insideServer(env.TMUX, socketPath);
      const child = tmux.client(enterArgv(view, inside), inside ? env.TMUX : undefined);
      if (switches(view, inside)) return await child.exited;
      // Ward ends this view, so it has to outlive the client: a terminal that
      // closes hangs up both, and a Ward that died of it would leave the view
      // standing. The signal is passed on (one sent to Ward alone still ends
      // the client) and Ward waits for the client to go.
      const signals = ['SIGHUP', 'SIGTERM'] as const;
      const passOn = (signal: NodeJS.Signals) => {
        try {
          child.kill(signal);
        } catch {
          // The client has already gone: nothing to pass the signal to.
        }
      };
      for (const signal of signals) process.on(signal, passOn);
      try {
        return await child.exited;
      } finally {
        for (const signal of signals) process.off(signal, passOn);
        // Best-effort: a view that has already ended is not found, and one
        // Ward could not end is what doctor reports as a leftover view.
        if (sessionId !== '') call(endViewArgv(sessionId));
      }
    },
    inventory(): Inventory {
      const sessions = call(listGroupsArgv());
      if (!sessions.ok) {
        if (sessions.noServer) return { outcome: 'answered', groups: [], windows: [] };
        return { outcome: 'unknown', reason: sessions.stderr || 'tmux failed without a reason' };
      }
      const listed = panes();
      if (!listed.ok) return { outcome: 'unknown', reason: listed.reason };
      const parsed = parseGroups(sessions.stdout);
      const hosts = viewHosts(parsed);
      const rows = parsed.map(
        (row): InventoryGroup => ({
          name: row.name,
          ...(row.stamp === undefined ? {} : { stamp: row.stamp }),
          ...(row.view ? { viewOf: row.viewOf } : {}),
          ...viewHostOf(hosts.get(row.name)),
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

  /** A view just made, dressed as the floor it looks at — best effort, like every theme. */
  function worn(view: View, request: ViewRequest): View {
    if (request.identity !== undefined) call(themeArgv(view.name, request.identity));
    return view;
  }

  function command(args: readonly string[]): string {
    return [program, ...prefix, ...args].map(shellQuote).join(' ');
  }
}

function viewHostOf(host: string | undefined): { viewHost?: string } {
  return host === undefined ? {} : { viewHost: host };
}

/** The windows a find returned that stand in this workspace's hosts. */
function windowsOf(result: FindResult, workspace: string): FoundWindow[] {
  if (result.outcome !== 'answered') return [];
  return result.windows.filter((window) =>
    window.groups.some((group) => group.stamp?.workspace === workspace),
  );
}
