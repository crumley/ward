// Joining a hosted run (design/0031-detached-session-hosting/): `ward session
// attach` takes part in it, `ward session observe` watches it. Both go through
// a VIEW the host makes for the one client — so one human's attach never
// moves the window another human is looking at, and an observer sees the one
// window it asked for and nothing beside it.
//
// The asymmetry is the seam's (intent/02-subsystems/01-session-multiplexer.md):
// attach is interactive by default and re-creates a run that has gone, because
// attaching is most often done to take part; observe is the deliberate extra
// act, and it never starts or re-creates anything — watching must
// not disturb. Both verify the window is the record's own before showing it.
import { WardError } from '../errors.ts';
import type { FoundWindow, SessionHost, View, ViewRequest } from '../host/host.ts';
import type { HostedKind, SessionRecord } from '../store/types.ts';
import { workspaceId } from '../workspace/identity.ts';
import {
  appendSessionEvent,
  type OpenSessionListing,
  readAllSessions,
  requireOpenSession,
} from '../workspace/sessions.ts';
import { classify, describeExit, hostedBy, hostOf, type LiveState } from './host.ts';
import { readNaming, refreshNames } from './naming.ts';
import { placementFloor } from './placement.ts';
import { resumeSession } from './run.ts';

type Env = Record<string, string | undefined>;

export interface JoinOptions {
  /** Whether the caller has a terminal to hand over (stdin and stdout both TTYs). */
  readonly terminal: boolean;
  readonly env?: Env;
  /** A host to use instead of the one the record names (the tests' fake). */
  readonly host?: SessionHost;
  /** Told what is about to happen, the instant before the terminal is handed over. */
  readonly onReady?: (prepared: Prepared) => void;
}

/** What a join prepared, reported before the terminal changes hands. */
export interface Prepared {
  readonly record: SessionRecord;
  readonly live: LiveState;
  readonly view: View;
  /** True when attach found the run gone (or ended) and re-created it first. */
  readonly recreated: boolean;
  /** Hosts, and views of them, attach renamed in place ("ward-main-f3 is now main-f3-alpha"). */
  readonly renamed: readonly string[];
}

export interface Joined extends Prepared {
  /** The host client's exit code, once it has left the view. */
  readonly exitCode: number;
  /**
   * Set when an observer's terminal came back because the window it was
   * watching went — not because the human left: what became of the session.
   */
  readonly ended?: Ended;
}

/**
 * Why a watched window is no longer there: its session was `closed`; the
 * window is `gone` with the session still open — the run exited cleanly,
 * which closes its window (design/0070-clean-exit-closes-window/), or the
 * window was ended under it; or the run was `restarted` in another window (a
 * resume cleared the one being watched).
 */
export type Ended = 'closed' | 'gone' | 'restarted';

/**
 * `ward session attach ID`: join the session's live window through a view of
 * its floor host, re-creating the run from the record first when the host no
 * longer holds it live. Refuses — naming the way forward — a session last run
 * in the foreground (Ward cannot see that run, so it will not start a second
 * one over it), a caller with no terminal, an unusable host, a host that
 * cannot answer, and a window wearing the session's tag that is not its own.
 */
export async function attachSession(root: string, id: string, options: JoinOptions) {
  const env = options.env ?? process.env;
  let open = await requireOpenSession(root, id);
  const kind = hostedKindOf(open.record, 'attach');
  requireTerminal(id, options.terminal, 'attach');
  const host = usableHost(kind, env, options.host, 'attach');
  const workspace = await workspaceId(root);
  // Names are brought up to date before anything is read by name: a host
  // from an older naming is renamed here, in place, and found again below.
  const { renamed } = await refreshNames(root, host, workspace, kind);
  let { live, own } = await readLive(root, open, host, workspace, kind);
  refuseUnknownOrStranger(id, live, own, host);
  let recreated = false;
  if (live.state !== 'live') {
    // Gone (a clean exit closes its own window), or failed with its window
    // kept: the record says what to rebuild,
    // so attach rebuilds it — a hosted resume, the same path that opened it,
    // which also refuses (with locate's answer) when the history is gone.
    const resumed = await resumeSession(root, id, () => {}, { hostFlag: 'detach' });
    recreated = true;
    open = await requireOpenSession(root, id);
    ({ live, own } = await readLive(root, open, host, workspace, kind));
    if (live.state !== 'live' || own === undefined) {
      // A re-created run that fails at once is kept to say how; one that
      // exits cleanly at once leaves no window, which is all that is known.
      const ended =
        live.state === 'exited' ? `, then ${describeExit(live)}` : ', then left no window';
      throw new WardError(
        `session ${id} was re-created${ended}, and is not running now — ` +
          `see: ward session show ${id}` +
          ('hosted' in resumed ? '' : ' (it was resumed in the foreground)'),
      );
    }
  }
  if (own === undefined || live.group === undefined || live.window === undefined) {
    throw new WardError(`session ${id}: the host answered without a window to show`);
  }
  const view = host.view({
    group: live.group,
    window: live.window,
    mode: 'attach',
    workspace,
    ...(await viewNaming(root, own, live.group, live.floor)),
  });
  return join(root, id, 'attached', view, host, options, {
    live,
    recreated,
    renamed,
  });
}

/**
 * `ward session observe ID`: watch the session's live window, read-only,
 * through a view holding that one window alone. Refuses anything not live —
 * observe watches a running agent; `attach` would re-create it and `locate`
 * reads its history.
 */
export async function observeSession(root: string, id: string, options: JoinOptions) {
  const env = options.env ?? process.env;
  const open = await requireOpenSession(root, id);
  const kind = hostedKindOf(open.record, 'observe');
  requireTerminal(id, options.terminal, 'observe');
  const host = usableHost(kind, env, options.host, 'observe');
  const workspace = await workspaceId(root);
  const { live, own } = await readLive(root, open, host, workspace, kind);
  refuseUnknownOrStranger(id, live, own, host);
  if (live.state !== 'live' || own === undefined || live.window === undefined) {
    const why = live.state === 'exited' ? describeExit(live) : 'it has no window';
    throw new WardError(
      `session ${id} is not running (${why}) — observe watches a live run. ` +
        `Re-create it with ward session attach ${id}, or read its history with ` +
        `ward session locate ${id}`,
    );
  }
  const view = host.view({
    group: live.group ?? '',
    window: live.window,
    mode: 'observe',
    workspace,
    // The view observe makes wears the floor it watches; the host itself is
    // left exactly as it is — watching changes nothing.
    ...(await viewNaming(root, own, live.group, live.floor)),
  });
  const joined = await join(root, id, 'observed', view, host, options, {
    live,
    recreated: false,
    renamed: [],
  });
  // The host returns an observer's terminal when the watched window goes
  // (the host's own rule for an observe view), and tmux says only that the
  // client detached — so the reason is read here, once, and never guessed:
  // a host that cannot answer, or a window still standing, says nothing.
  const ended = await endedUnder(root, id, live.window, host, workspace, kind);
  return ended === undefined ? joined : { ...joined, ended };
}

/** What became of the window an observer was watching — undefined while it still stands. */
async function endedUnder(
  root: string,
  id: string,
  watched: string,
  host: SessionHost,
  workspace: string,
  kind: HostedKind,
): Promise<Ended | undefined> {
  try {
    const listing = (await readAllSessions(root)).find(({ record }) => record.id === id);
    if (listing === undefined || listing.record.state !== 'open') return 'closed';
    const { live } = await readLive(root, listing, host, workspace, kind);
    if (live.state === 'unknown' || live.window === watched) return undefined;
    return live.window === undefined ? 'gone' : 'restarted';
  } catch {
    return undefined;
  }
}

/**
 * Where a view of `group` says its terminal stands, and what it wears
 * (design/0060-floor-identity/): those of the floor the group is stamped for —
 * which is not the session's own when its window was moved, or was linked
 * into other hosts by an older Ward.
 */
async function viewNaming(
  root: string,
  own: FoundWindow,
  group: string | undefined,
  placed: number,
): Promise<Pick<ViewRequest, 'title' | 'identity'>> {
  const floor = own.groups.find((g) => g.name === group)?.stamp?.floor ?? placed;
  const { title, identity } = (await readNaming(root)).group(floor);
  return { title, ...(identity === undefined ? {} : { identity }) };
}

async function join(
  root: string,
  id: string,
  event: 'attached' | 'observed',
  view: View,
  host: SessionHost,
  options: JoinOptions,
  prepared: Omit<Prepared, 'record' | 'view'>,
): Promise<Joined> {
  // Recorded before the terminal is handed over: the trail says a human
  // joined even if the client is then killed rather than detached.
  const record = await appendSessionEvent(root, id, event);
  const ready: Prepared = { ...prepared, record, view };
  options.onReady?.(ready);
  const exitCode = await host.enter(view);
  return { ...ready, exitCode };
}

function hostedKindOf(record: SessionRecord, verb: 'attach' | 'observe'): HostedKind {
  const kind = hostedBy(record);
  if (kind !== undefined) return kind;
  const id = record.id;
  throw new WardError(
    `session ${id} last ran in the foreground — in a terminal Ward cannot see into, so it ` +
      `will not ${verb} or start a second run over it. If that run has ended, host it ` +
      `detached with: ward session resume ${id} --detach`,
  );
}

function requireTerminal(id: string, terminal: boolean, verb: 'attach' | 'observe'): void {
  if (terminal) return;
  throw new WardError(
    `${verb} joins this terminal to session ${id}, and there is no terminal here ` +
      `(stdin or stdout is not a TTY). Where it stands: ward session show ${id}; ` +
      `to start it detached without joining it: ward session resume ${id} --detach`,
  );
}

function usableHost(
  kind: HostedKind,
  env: Env,
  given: SessionHost | undefined,
  verb: 'attach' | 'observe',
): SessionHost {
  const host = given ?? hostOf(kind, env);
  const check = host.check();
  if (!check.usable) {
    throw new WardError(
      `cannot ${verb}: ${kind} is not usable here (${check.reason}) — see: ward doctor`,
    );
  }
  return host;
}

async function readLive(
  root: string,
  open: OpenSessionListing,
  host: SessionHost,
  workspace: string,
  kind: HostedKind,
): Promise<{ live: LiveState; own?: FoundWindow }> {
  const floor = placementFloor(open, await readAllSessions(root));
  return classify(open.record, host.find(open.record.id), workspace, floor, kind);
}

/**
 * Could-not-determine refuses, never re-creates: a host that cannot answer
 * may be holding the run live. And a window that wears the session's tag but
 * is not its own (another life's epoch, an unstamped holder) is never joined,
 * and never replaced by a second run beside it — the human decides.
 */
function refuseUnknownOrStranger(
  id: string,
  live: LiveState,
  own: FoundWindow | undefined,
  host: SessionHost,
): void {
  if (live.state === 'unknown') {
    throw new WardError(
      `cannot tell whether session ${id} is running (${live.reason ?? 'no reason'}) — ` +
        'refusing to join or re-create it; check the host, then try again',
    );
  }
  if (own === undefined && live.strangers.length > 0) {
    const remedies = live.strangers.map((window) => host.closeCommand(window)).join('; ');
    throw new WardError(
      `session ${id} has no window of its own, but ${live.strangers.join(', ')} wears its ` +
        'tag — from another run, or moved where Ward did not put it. Ward will not join it ' +
        `or start a second run beside it. Look at it; if nothing in it matters, end it: ${remedies}`,
    );
  }
}
