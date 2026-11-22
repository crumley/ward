// Doctor's look at the detached host (design/0031-detached-session-hosting/):
// one inventory of the host joined against every session record, reported as
// findings. Hygiene REPORTS and never ends anything
// (intent/02-subsystems/01-session-multiplexer.md: teardown only by a
// session's deliberate close) — so every finding that names something live
// no open record explains carries the exact command that would end it, for a
// human to run, and nothing here runs it.
//
// The severities follow from what each state means. A stray window, a
// duplicate floor host or window, and a host environment carrying a run's
// identity are `warn`: something is live or inherited that nothing accounts
// for. Gone, exited, misplaced, linked elsewhere, idle hosts, leftover views,
// foreign hosts, and version skew are `info`: "gone" is the normal state of
// every detached session after a reboot, and of any session whose run exited
// cleanly (its window closes itself, design/0070-clean-exit-closes-window/),
// and the rest are arrangements a human may well have chosen. A host that cannot answer is `warn`, worded so
// it can never be read as a clean bill.
import pkg from '../../package.json' with { type: 'json' };
import { runIdentityVars } from '../harness/index.ts';
import type { InventoryGroup, InventoryWindow, SessionHost } from '../host/host.ts';
import type { HostedKind, SessionRecord } from '../store/types.ts';
import type { Finding } from '../workspace/doctor.ts';
import { readProjects, renumberedFloors } from '../workspace/projects.ts';
import { type OpenSessionListing, readAllSessions } from '../workspace/sessions.ts';
import { hostedBy, hostOf, latestLaunch } from './host.ts';
import { attendingOf, placementFloor } from './placement.ts';
import type { AgentHost, Resolved } from './settings.ts';

type Env = Record<string, string | undefined>;

const CAPABILITY = 'session host';
const ENVIRONMENT = 'host environment';
const WINDOWS = 'host windows';
const HOSTS = 'floor hosts';

/** What every floor host's name began with before design 0061 named hosts for their floors. */
const LEGACY_GROUP_PREFIX = 'ward-';

/**
 * Every host finding for one workspace. `workspace` is the workspace's id —
 * undefined when the record carries none yet, in which case nothing can have
 * been placed and only the capability is reported.
 */
export async function hostFindings(
  root: string,
  workspace: string | undefined,
  configured: Resolved<AgentHost>,
  env: Env = process.env,
  given?: SessionHost,
): Promise<Finding[]> {
  const kind: HostedKind = 'tmux';
  const host = given ?? hostOf(kind, env);
  const check = host.check();
  const wanted = configured.provenance !== 'absent' && configured.value === kind;
  if (!check.usable) {
    return [
      {
        check: CAPABILITY,
        severity: wanted ? 'warn' : 'info',
        message: wanted
          ? `${kind} is not usable (${check.reason}) — agent.host is ${kind}, so every launch ` +
            'runs in the foreground instead and ends with its terminal; install tmux 3.2 or later'
          : `${kind} is not usable (${check.reason}) — sessions run in the foreground; ` +
            '--detach needs tmux 3.2 or later',
      },
    ];
  }
  const findings: Finding[] = [
    {
      check: CAPABILITY,
      severity: 'ok',
      message: `${check.version} — detached hosting available (ward session open --detach)`,
    },
  ];
  findings.push(...environmentFindings(host));
  if (workspace === undefined) return findings;
  findings.push(
    ...inventoryFindings(host, workspace, await readAllSessions(root), kind, await retired(root)),
  );
  return findings;
}

/** Where each retired floor number went — empty when the records cannot say. */
async function retired(root: string): Promise<ReadonlyMap<number, number>> {
  try {
    return renumberedFloors(await readProjects(root));
  } catch {
    return new Map();
  }
}

/** A run's identity in the host's own environment, which every new window inherits. */
function environmentFindings(host: SessionHost): Finding[] {
  const inherited = host.inheritedEnv();
  if (inherited.outcome === 'unknown') return [];
  const identity = new Set(runIdentityVars());
  const carried = inherited.names.filter((name) => identity.has(name));
  if (carried.length === 0) return [];
  const remedy = carried.map((name) => host.forgetEnvCommand(name)).join('; ');
  return [
    {
      check: ENVIRONMENT,
      severity: 'warn',
      message:
        `the tmux server's global environment carries ${carried.join(', ')} — it was started ` +
        "from inside an agent's run, and every hosted run inherits that run's identity. " +
        `Remove them (running windows keep theirs): ${remedy}`,
    },
  ];
}

interface Ours {
  readonly hosts: readonly InventoryGroup[];
  readonly names: ReadonlySet<string>;
}

function inventoryFindings(
  host: SessionHost,
  workspace: string,
  sessions: readonly OpenSessionListing[],
  kind: HostedKind,
  renumbered: ReadonlyMap<number, number>,
): Finding[] {
  const inventory = host.inventory();
  if (inventory.outcome === 'unknown') {
    return [
      {
        check: WINDOWS,
        severity: 'warn',
        message:
          `could not determine what the host holds (${inventory.reason}) — strays, gone ` +
          'sessions, and misplaced windows are unchecked; this is not a clean bill',
      },
    ];
  }
  const floorHosts = inventory.groups.filter(
    (group) => group.viewOf === undefined && group.stamp?.workspace === workspace,
  );
  const ours: Ours = { hosts: floorHosts, names: new Set(floorHosts.map((group) => group.name)) };
  const inOurs = inventory.windows.filter((window) => window.groups.some((g) => ours.names.has(g)));
  const byId = latestById(sessions);
  const findings: Finding[] = [];

  // -- windows that no open record explains ---------------------------------
  const verified = new Map<string, InventoryWindow[]>();
  for (const window of inOurs) {
    const listing = byId.get(window.tags.session);
    const why = unexplained(listing?.record, window, kind);
    if (why === undefined) {
      const same = verified.get(window.tags.session) ?? [];
      same.push(window);
      verified.set(window.tags.session, same);
      continue;
    }
    const viewed = window.groups.some(
      (name) => (inventory.groups.find((g) => g.name === name)?.clients ?? 0) > 0,
    );
    findings.push({
      check: WINDOWS,
      severity: 'warn',
      message:
        `stray window ${window.window} (tagged ${window.tags.session}: ${why}) in ` +
        `${hostsOf(window, ours)} — no open record explains it` +
        `${viewed ? '; a client is viewing its host' : ''}. Look at it; if nothing in it ` +
        `matters, end it: ${host.closeCommand(window.window)}`,
    });
  }
  for (const [session, windows] of verified) {
    if (windows.length < 2) continue;
    findings.push({
      check: WINDOWS,
      severity: 'warn',
      message:
        `session ${session} has ${windows.length} windows of one run ` +
        `(${windows.map((w) => w.window).join(', ')}) — Ward uses the first; end the others ` +
        `once nothing in them matters: ${windows
          .slice(1)
          .map((w) => host.closeCommand(w.window))
          .join('; ')}`,
    });
  }

  // -- every open hosted session against its window ---------------------------
  let notRunning = 0;
  for (const listing of sessions) {
    const { record } = listing;
    if (record.state !== 'open' || hostedBy(record) !== kind) continue;
    const window = verified.get(record.id)?.[0];
    if (window === undefined || window.dead) notRunning += 1;
    if (window === undefined) {
      findings.push({
        check: WINDOWS,
        severity: 'info',
        message:
          `session ${record.id} is not running (no ${kind} window) — attach re-creates it: ` +
          `ward session attach ${record.id}; if it is done, close it: ` +
          `ward session close ${record.id}`,
      });
      continue;
    }
    if (window.dead) {
      findings.push({
        check: WINDOWS,
        severity: 'info',
        message:
          `session ${record.id}'s run ${exitOf(window)}, its window ${window.window} kept to ` +
          `show it — attach re-creates it: ward session attach ${record.id}`,
      });
      continue;
    }
    const floor = placementFloor(listing, sessions);
    const home = ours.hosts.filter((group) => group.stamp?.floor === floor).map((g) => g.name);
    const standing = window.groups.filter((name) => ours.names.has(name));
    if (!standing.some((name) => home.includes(name))) {
      findings.push({
        check: WINDOWS,
        severity: 'info',
        message:
          `session ${record.id}'s window ${window.window} stands in ${standing.join(', ')}, ` +
          `not floor ${floor}'s host — attach follows it wherever it is`,
      });
    }
    // Ward links no window into a second host
    // (design/0086-coordinator-stays-home/); an older Ward linked the
    // coordinator into every floor host, and those links stay until its run
    // ends and takes the window with it. Named, with the way to take each out
    // now, and never undone here.
    const beyond = standing.filter((name) => !home.includes(name));
    if (beyond.length > 0 && beyond.length < standing.length) {
      findings.push({
        check: WINDOWS,
        severity: 'info',
        message:
          `session ${record.id}'s window ${window.window} is also linked into ` +
          `${beyond.join(', ')} (an older Ward linked the coordinator into every floor host) — ` +
          'the links go when its run ends; to take them out now: ' +
          beyond.map((name) => host.unlinkCommand(window.window, name)).join('; '),
      });
    }
  }

  findings.push(...attendingFindings(sessions, kind));

  // Several at once is what a reboot leaves: one line names the bulk verb,
  // whose bare form only prints what would come back
  // (design/0068-bulk-session-resume/). One alone has its attach line above.
  if (notRunning > 1) {
    findings.push({
      check: WINDOWS,
      severity: 'info',
      message:
        `${notRunning} sessions are not running — see what would come back, and bring them ` +
        'back together: ward session resume --all',
    });
  }

  const home = new Map(
    sessions
      .filter(({ record }) => record.state === 'open')
      .map((listing) => [listing.record.id, placementFloor(listing, sessions)]),
  );
  findings.push(...hostShapeFindings(host, inventory.groups, inOurs, ours, home, workspace));
  // A host stamped with a number its floor has left (design/0081-floor-renumber/):
  // nothing finds it by that stamp any more, and the next name refresh here
  // restamps it.
  for (const group of ours.hosts) {
    const floor = group.stamp?.floor;
    const to = floor === undefined ? undefined : renumbered.get(floor);
    if (to === undefined) continue;
    findings.push({
      check: HOSTS,
      severity: 'warn',
      message:
        `${group.name} is stamped floor ${floor}, a number retired when its floor was renumbered ` +
        `to ${to} — restamp it now: ward workspace upgrade (an attach or launch here does too)`,
    });
  }
  if (findings.length === 0) {
    const windows = inOurs.length;
    findings.push({
      check: WINDOWS,
      severity: 'ok',
      message:
        ours.hosts.length === 0
          ? 'no floor host of this workspace is running'
          : `${ours.hosts.length} floor host${ours.hosts.length === 1 ? '' : 's'}, ` +
            `${windows} window${windows === 1 ? '' : 's'} — every window answers to an open record`,
    });
  }
  return findings;
}

/** Duplicate hosts, idle hosts, leftover views, foreign hosts, and version skew. */
function hostShapeFindings(
  host: SessionHost,
  groups: readonly InventoryGroup[],
  inOurs: readonly InventoryWindow[],
  ours: Ours,
  home: ReadonlyMap<string, number>,
  workspace: string,
): Finding[] {
  const findings: Finding[] = [];
  const byFloor = new Map<number, InventoryGroup[]>();
  for (const group of ours.hosts) {
    const floor = group.stamp?.floor ?? -1;
    byFloor.set(floor, [...(byFloor.get(floor) ?? []), group]);
  }
  for (const [floor, hosts] of byFloor) {
    if (hosts.length < 2) continue;
    const sorted = [...hosts].sort((a, b) => a.created - b.created);
    const [oldest, ...rest] = sorted;
    findings.push({
      check: HOSTS,
      severity: 'warn',
      message:
        `floor ${floor} has ${hosts.length} hosts (${sorted.map((g) => g.name).join(', ')}) — ` +
        `new windows go to the oldest, ${oldest?.name}. Move what matters there, then end ` +
        `the others: ${rest.map((g) => host.endGroupCommand(g.name)).join('; ')}`,
    });
  }
  // A host left holding only links to windows that live in another host — an
  // older Ward's coordinator — is kept by tmux for them alone.
  for (const group of ours.hosts) {
    const floor = group.stamp?.floor ?? 0;
    const shown = inOurs.filter((window) => window.groups.includes(group.name));
    const linked = shown.filter((window) => {
      const placed = home.get(window.tags.session);
      const hosts = window.groups.filter((name) => ours.names.has(name));
      return placed !== undefined && placed !== floor && hosts.length > 1;
    });
    if (group.windows > 0 && linked.length === group.windows) {
      findings.push({
        check: HOSTS,
        severity: 'info',
        message:
          `${group.name} holds nothing of floor ${floor}'s own — only links to windows that ` +
          'live in another host, so tmux keeps it. If you are done with it, ' +
          `${host.endGroupCommand(group.name)} only unlinks them`,
      });
    }
  }
  for (const group of groups) {
    if (group.viewOf !== workspace || group.clients > 0) continue;
    findings.push({
      check: HOSTS,
      severity: 'info',
      message:
        `${group.name} is a leftover view with no client — ending it only unlinks what it ` +
        `shows: ${host.endGroupCommand(group.name)}`,
    });
  }
  const foreign = groups.filter(
    (group) =>
      group.viewOf === undefined &&
      group.stamp?.workspace !== workspace &&
      // Another workspace's host says so by its stamp; an unstamped session is
      // Ward's business only when it wears the name hosts were once minted
      // under (design/0061-host-names-and-titles/) — anything else is a
      // human's own tmux session.
      (group.stamp !== undefined || group.name.startsWith(LEGACY_GROUP_PREFIX)),
  );
  if (foreign.length > 0) {
    findings.push({
      check: HOSTS,
      severity: 'info',
      message:
        `${foreign.map((g) => g.name).join(', ')} ${foreign.length === 1 ? 'is' : 'are'} not ` +
        "this workspace's (another workspace's floor hosts, or unstamped) — left alone",
    });
  }
  for (const group of ours.hosts) {
    if (group.version === undefined || group.version === pkg.version) continue;
    findings.push({
      check: HOSTS,
      severity: 'info',
      message:
        `${group.name} was created by ward ${group.version}; this is ${pkg.version} — ` +
        'nothing blocked, and a host made now carries the new stamp',
    });
  }
  return findings;
}

/**
 * Why a window in this workspace's hosts answers to no open record —
 * undefined when it does (its record is open, hosted, and the window's epoch
 * is that record's latest launch).
 */
/**
 * A floor whose host holds sessions but no attending
 * (design/0089-floor-attending/): windows working tasks, say, with the general
 * session the floor is run from closed. `info`: nothing is wrong with the
 * windows, but window 1 of the host is not the floor's own session, and
 * `wsa N` would open one. Per machine, as an attending is.
 */
function attendingFindings(sessions: readonly OpenSessionListing[], kind: HostedKind): Finding[] {
  const lacking = new Map<number, string[]>();
  for (const listing of sessions) {
    const { record } = listing;
    if (record.state !== 'open' || hostedBy(record) !== kind) continue;
    const floor = placementFloor(listing, sessions);
    if (attendingOf(sessions, floor, record.machine) !== undefined) continue;
    lacking.set(floor, [...(lacking.get(floor) ?? []), record.id]);
  }
  return [...lacking]
    .sort(([a], [b]) => a - b)
    .map(([floor, ids]) => ({
      check: WINDOWS,
      severity: 'info' as const,
      message:
        `floor ${floor}'s host holds ${ids.join(', ')} but no attending — ` +
        (floor === 0
          ? "the coordinator is the ground floor's attending and none is open; open one: wsa 0 " +
            '(ward session open --detach)'
          : `the floor's general session, window 1 of its host; open one: wsa ${floor} ` +
            `(ward session open --floor ${floor} --detach)`),
    }));
}

function unexplained(
  record: SessionRecord | undefined,
  window: InventoryWindow,
  kind: HostedKind,
): string | undefined {
  if (record === undefined) return 'no record of that session here';
  if (record.state !== 'open') return 'its session is closed';
  if (hostedBy(record) !== kind) return 'its latest run was not hosted';
  if (latestLaunch(record)?.at !== window.tags.epoch) return 'a window of an earlier run';
  return undefined;
}

/** The open record for an id, else its latest closed one — the record a tag most plausibly means. */
function latestById(sessions: readonly OpenSessionListing[]): Map<string, OpenSessionListing> {
  const byId = new Map<string, OpenSessionListing>();
  for (const listing of sessions) {
    const seen = byId.get(listing.record.id);
    if (seen === undefined || seen.record.state !== 'open') byId.set(listing.record.id, listing);
  }
  return byId;
}

function hostsOf(window: InventoryWindow, ours: Ours): string {
  return window.groups.filter((name) => ours.names.has(name)).join(', ');
}

function exitOf(window: InventoryWindow): string {
  if (window.exitSignal !== undefined && window.exitSignal !== '') {
    return `was killed by ${window.exitSignal}`;
  }
  return window.exitStatus === undefined ? 'exited' : `exited ${window.exitStatus}`;
}
