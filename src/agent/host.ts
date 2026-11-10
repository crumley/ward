// The Ward-shaped half of detached hosting (design/0031-detached-session-hosting/):
// everything that reads a record — which host a launch selects, which floor a
// window is placed on and whether it floats, whether a window found by its
// tag is the record's OWN, what resume must refuse, and what close tears
// down. The host itself (src/host/) knows none of this; it is handed a floor,
// a list of tags, and a command.
//
// Ownership is the rule this module exists to keep: a window found carrying a
// session's tag is that session's live half only when its epoch equals the
// `at` of the record's latest launch event and a host it stands in is stamped
// with this workspace's id. A window that fails either check is a stranger —
// reported, never acted on.
import { resolve } from 'node:path';
import pkg from '../../package.json' with { type: 'json' };
import { WardError } from '../errors.ts';
import { harnessCommand } from '../harness/adapter.ts';
import { withoutRunIdentity } from '../harness/index.ts';
import type { CloseResult, FoundWindow, SessionHost, WindowTags } from '../host/host.ts';
import { hostFor } from '../host/index.ts';
import { readDocument } from '../store/document.ts';
import type { HostedKind, SessionEvent, SessionRecord } from '../store/types.ts';
import { workspaceRecordType } from '../store/types.ts';
import { workspaceId } from '../workspace/identity.ts';
import { closeSession, type OpenSessionListing, readAllSessions } from '../workspace/sessions.ts';
import { floats, placementFloor } from './placement.ts';
import type { AgentHost, Resolved } from './settings.ts';

type Env = Record<string, string | undefined>;

/**
 * The host a kind names, talked to from an environment that carries no run's
 * identity. A tmux server inherits the environment of the client that starts
 * it, and every window it ever creates inherits the server's: a `ward` run
 * from inside an agent's run would otherwise stamp that run's id, pid, and
 * private sockets onto every hosted run that follows (found by the premise
 * check, design/0031-detached-session-hosting/ build log).
 */
export function hostOf(kind: HostedKind, env: Env = process.env): SessionHost {
  return hostFor(kind, withoutRunIdentity(env));
}

/** The two ways a caller states where a run goes, beside the configuration. */
export type HostFlag = 'detach' | 'foreground';

/** What a launch will be hosted by: the foreground, or a detached host made ready. */
export type HostChoice =
  | { readonly kind: 'foreground'; readonly notice?: string }
  | { readonly kind: HostedKind; readonly host: SessionHost; readonly workspace: string };

/**
 * Select the host for one launch (design/0031-detached-session-hosting/,
 * the explicit-flag / configured-default decision). `--foreground` forces the
 * baseline. `--detach` asks for the configured detached host (tmux when the
 * configuration names none) and is REFUSED when it cannot be had — detaching
 * was the point of the invocation. A configured `agent.host` that cannot be
 * had DEGRADES to the foreground and says so — a preference must never be the
 * reason an agent cannot start. Readiness includes the workspace id the host
 * is stamped with, and the server-hygiene preamble, run here — before any
 * store lock is taken.
 */
export async function chooseHost(
  root: string,
  flag: HostFlag | undefined,
  configured: Resolved<AgentHost>,
  env: Env = process.env,
): Promise<HostChoice> {
  if (flag === 'foreground') return { kind: 'foreground' };
  const wanted = configured.provenance === 'absent' ? 'foreground' : configured.value;
  if (flag === undefined && wanted === 'foreground') return { kind: 'foreground' };
  const kind: HostedKind = wanted === 'foreground' ? 'tmux' : wanted;
  const host = hostOf(kind, env);
  const problem = await unready(root, host);
  if (problem === undefined) return { kind, host, workspace: await workspaceId(root) };
  if (flag === 'detach') {
    throw new WardError(
      `cannot detach: ${problem}. Nothing was recorded; run in the foreground with ` +
        'ward session open --foreground, or see: ward doctor',
    );
  }
  return {
    kind: 'foreground',
    notice:
      `host ${kind} unavailable (${problem}) — running in the foreground; ` +
      'this session ends with this terminal',
  };
}

async function unready(root: string, host: SessionHost): Promise<string | undefined> {
  const check = host.check();
  if (!check.usable) return check.reason;
  try {
    await workspaceId(root);
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  try {
    host.prepare();
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  return undefined;
}

/** The latest launch event — `opened` or `resumed` — whose `at` is the window's epoch. */
export function latestLaunch(record: SessionRecord): SessionEvent | undefined {
  return [...(record.events ?? [])]
    .reverse()
    .find((event) => event.event === 'opened' || event.event === 'resumed');
}

/** The host the latest launch was placed in — undefined when it ran in the foreground. */
export function hostedBy(record: SessionRecord): HostedKind | undefined {
  return latestLaunch(record)?.host;
}

// -- placement -----------------------------------------------------------------

export interface PlacedRun {
  readonly floor: number;
  readonly group: string;
  readonly window: string;
  readonly createdGroup: boolean;
  readonly linkedInto: readonly string[];
  /** The command a human runs to join the floor's host. */
  readonly join: string;
}

export interface RunToPlace {
  readonly harness: Parameters<typeof harnessCommand>[0];
  readonly configuredCommand: readonly string[] | undefined;
  readonly argv: readonly string[];
}

/**
 * Place a just-recorded launch in its floor's host. Called INSIDE the store
 * write that recorded the launch, so the records read here are current and no
 * concurrent launch can interleave its own lookup-or-mint.
 */
export async function placeLaunch(
  root: string,
  choice: Extract<HostChoice, { host: SessionHost }>,
  launched: OpenSessionListing,
  run: RunToPlace,
  env: Env = process.env,
): Promise<PlacedRun> {
  const all = await readAllSessions(root);
  const epoch = latestLaunch(launched.record)?.at;
  if (epoch === undefined) throw new WardError(`session ${launched.record.id} has no launch event`);
  const floor = placementFloor(launched, all);
  const placement = choice.host.place({
    group: { workspace: choice.workspace, floor },
    workspaceName: (await readDocument(root, workspaceRecordType)).data.name,
    tags: { session: launched.record.id, epoch },
    label: launched.record.id,
    cwd: resolve(root, launched.record.workingDirectory),
    env: { WARD_AGENT: launched.record.id },
    command: [...harnessCommand(run.harness, run.configuredCommand, env).command, ...run.argv],
    floats: floats(launched.record),
    floating: floatingTags(
      all.filter(({ record }) => record.id !== launched.record.id),
      choice.kind,
    ),
    version: pkg.version,
  });
  return {
    floor,
    group: placement.group,
    window: placement.window,
    createdGroup: placement.createdGroup,
    linkedInto: placement.linkedInto,
    join: choice.host.joinCommand(placement.group),
  };
}

/** The tags of every open floating session whose latest launch this host holds. */
export function floatingTags(all: readonly OpenSessionListing[], kind: HostedKind): WindowTags[] {
  return all
    .filter(({ record }) => record.state === 'open' && floats(record) && hostedBy(record) === kind)
    .flatMap(({ record }) => {
      const epoch = latestLaunch(record)?.at;
      return epoch === undefined ? [] : [{ session: record.id, epoch }];
    });
}

// -- the live half, read -------------------------------------------------------

/** Where a hosted session's run stands now — derived per read, never stored. */
export interface LiveState {
  readonly kind: HostedKind;
  readonly state: 'live' | 'exited' | 'gone' | 'unknown';
  /** The placement floor, derived from the records. */
  readonly floor: number;
  /** The host the window stands in — the placement floor's when it is linked into several. */
  readonly group?: string;
  readonly window?: string;
  readonly exitStatus?: number;
  readonly exitSignal?: string;
  /** Why the state could not be determined. */
  readonly reason?: string;
  /** Windows wearing this session's tag that are NOT its own (another epoch or workspace). */
  readonly strangers: readonly string[];
}

/**
 * Classify what the host answers for one session against the record: the
 * window that verifies (tag, epoch, workspace stamp) is the session's own;
 * every other tagged window is a stranger.
 */
export function classify(
  record: SessionRecord,
  answer: ReturnType<SessionHost['find']>,
  workspace: string,
  floor: number,
  kind: HostedKind,
): { live: LiveState; own?: FoundWindow } {
  if (answer.outcome === 'unknown') {
    return { live: { kind, state: 'unknown', floor, reason: answer.reason, strangers: [] } };
  }
  const epoch = latestLaunch(record)?.at;
  const isOwn = (window: FoundWindow) =>
    window.tags.session === record.id &&
    window.tags.epoch === epoch &&
    window.groups.some((group) => group.stamp?.workspace === workspace);
  // Session ids repeat across workspaces (every workspace has a
  // `workspace-1@<machine>`), so a window standing only in ANOTHER
  // workspace's hosts is that workspace's business, not a stranger of ours.
  const elsewhere = (window: FoundWindow) =>
    window.groups.length > 0 &&
    window.groups.every(
      (group) => group.stamp !== undefined && group.stamp.workspace !== workspace,
    );
  const own = answer.windows.find(isOwn);
  const strangers = answer.windows
    .filter((window) => !isOwn(window) && !elsewhere(window))
    .map((window) => window.window);
  if (own === undefined) return { live: { kind, state: 'gone', floor, strangers } };
  const home =
    own.groups.find(
      (group) => group.stamp?.workspace === workspace && group.stamp.floor === floor,
    ) ?? own.groups.find((group) => group.stamp?.workspace === workspace);
  return {
    own,
    live: {
      kind,
      state: own.dead ? 'exited' : 'live',
      floor,
      ...(home === undefined ? {} : { group: home.name }),
      window: own.window,
      ...(own.exitStatus === undefined ? {} : { exitStatus: own.exitStatus }),
      ...(own.exitSignal === undefined ? {} : { exitSignal: own.exitSignal }),
      strangers,
    },
  };
}

/**
 * The live half of a session whose latest launch was hosted — undefined for
 * a foreground one, or a closed one (its window went with its close). A
 * workspace with no id cannot have placed anything, so it reads as unknown.
 */
export async function liveStateOf(
  root: string,
  listing: OpenSessionListing,
  env: Env = process.env,
  host?: SessionHost,
): Promise<LiveState | undefined> {
  const kind = hostedBy(listing.record);
  if (kind === undefined || listing.record.state !== 'open') return undefined;
  const floor = placementFloor(listing, await readAllSessions(root));
  let workspace: string;
  try {
    workspace = await workspaceId(root);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return { kind, state: 'unknown', floor, reason, strangers: [] };
  }
  const using = host ?? hostOf(kind, env);
  return classify(listing.record, using.find(listing.record.id), workspace, floor, kind).live;
}

/** "exited 3" / "killed by SIGKILL" — how a dead pane's run ended, for a human. */
export function describeExit(live: Pick<LiveState, 'exitStatus' | 'exitSignal'>): string {
  if (live.exitSignal !== undefined && live.exitSignal !== '')
    return `killed by ${live.exitSignal}`;
  return live.exitStatus === undefined ? 'exited' : `exited ${live.exitStatus}`;
}

// -- resume's gate -------------------------------------------------------------

/**
 * The gate a resume passes under the store lock when the latest launch was
 * hosted: refuse over a LIVE window (two processes on one conversation), and
 * over a host that cannot answer; clear a dead window of this session's own
 * and hand its ending back as the `resumed` event's cause; proceed when there
 * is nothing. A stranger is never touched.
 */
export async function guardResume(
  root: string,
  open: OpenSessionListing,
  env: Env = process.env,
  host?: SessionHost,
  /** False for the early, read-only look before any lock: refuse, but clear nothing. */
  clear = true,
): Promise<string | undefined> {
  const kind = hostedBy(open.record);
  if (kind === undefined) return undefined;
  const using = host ?? hostOf(kind, env);
  // No usable host here means no server Ward could have placed into is
  // reachable from this machine: there is nothing live to collide with.
  if (!using.check().usable) return undefined;
  const floor = placementFloor(open, await readAllSessions(root));
  const workspace = await workspaceId(root);
  const { live, own } = classify(open.record, using.find(open.record.id), workspace, floor, kind);
  const id = open.record.id;
  switch (live.state) {
    case 'unknown':
      throw new WardError(
        `cannot tell whether session ${id} is still running in ${kind} (${live.reason}) — ` +
          'refusing to start a second run over it; check the host, then resume again',
      );
    case 'live':
      throw new WardError(
        `session ${id} is still running in ${kind} host ${live.group ?? '?'} ` +
          `(window ${live.window ?? '?'}) — join it instead of resuming: ` +
          using.joinCommand(live.group ?? ''),
      );
    case 'exited': {
      if (!clear) return undefined;
      if (own !== undefined) using.close(own.window, id);
      return `previous run ${describeExit(live)}`;
    }
    case 'gone':
      return undefined;
  }
}

// -- close's teardown ----------------------------------------------------------

export interface Teardown {
  readonly kind: HostedKind;
  readonly outcome: 'closed' | 'absent' | 'refused' | 'unknown';
  readonly window?: string;
  readonly detail: string;
}

/**
 * Tear down a just-closed session's live half: its own verified window, live
 * or dead alike, and nothing else — never a host, and never a stranger
 * (intent/02-subsystems/01-session-multiplexer.md: teardown only by the
 * deliberate close). Undefined when the latest launch ran in the foreground.
 */
export async function teardownSession(
  root: string,
  closed: OpenSessionListing,
  env: Env = process.env,
  host?: SessionHost,
): Promise<Teardown | undefined> {
  const kind = hostedBy(closed.record);
  if (kind === undefined) return undefined;
  const using = host ?? hostOf(kind, env);
  const check = using.check();
  if (!check.usable) {
    return {
      kind,
      outcome: 'absent',
      detail: `no ${kind} here (${check.reason}) — nothing to end`,
    };
  }
  let workspace: string;
  try {
    workspace = await workspaceId(root);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return { kind, outcome: 'unknown', detail: reason };
  }
  const floor = placementFloor(closed, await readAllSessions(root));
  const { live, own } = classify(
    closed.record,
    using.find(closed.record.id),
    workspace,
    floor,
    kind,
  );
  const strangers =
    live.strangers.length === 0
      ? ''
      : `; left standing, not this run's: ${live.strangers.join(', ')}`;
  if (live.state === 'unknown') {
    return { kind, outcome: 'unknown', detail: `could not determine (${live.reason})` };
  }
  if (own === undefined) {
    return { kind, outcome: 'absent', detail: `no window was running${strangers}` };
  }
  const result: CloseResult = using.close(own.window, closed.record.id);
  const detail =
    result.outcome === 'closed'
      ? `ended window ${own.window}${strangers}`
      : result.outcome === 'absent'
        ? `window ${own.window} was already gone${strangers}`
        : `left window ${own.window} standing: ${result.reason}`;
  return { kind, outcome: result.outcome, window: own.window, detail };
}

/**
 * `ward session close`, hosted-aware: the record mutation, then — inside the
 * same store write — the teardown of the session's own window.
 */
export async function closeHostedSession(
  root: string,
  id: string,
  env: Env = process.env,
): Promise<{ record: SessionRecord; teardown?: Teardown }> {
  let teardown: Teardown | undefined;
  const record = await closeSession(root, id, async (closed) => {
    teardown = await teardownSession(root, closed, env);
  });
  return { record, ...(teardown === undefined ? {} : { teardown }) };
}
