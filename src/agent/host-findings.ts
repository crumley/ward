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
// for. Gone, exited, misplaced, missing links, idle hosts, leftover views,
// foreign hosts, and version skew are `info`: after any reboot "gone" is the
// normal state of every detached session, and the rest are arrangements a
// human may well have chosen. A host that cannot answer is `warn`, worded so
// it can never be read as a clean bill.
import pkg from '../../package.json' with { type: 'json' };
import { runIdentityVars } from '../harness/index.ts';
import type { InventoryGroup, InventoryWindow, SessionHost } from '../host/host.ts';
import type { HostedKind, SessionRecord } from '../store/types.ts';
import type { Finding } from '../workspace/doctor.ts';
import { type OpenSessionListing, readAllSessions } from '../workspace/sessions.ts';
import { hostedBy, hostOf, latestLaunch } from './host.ts';
import { floats, placementFloor } from './placement.ts';
import type { AgentHost, Resolved } from './settings.ts';

type Env = Record<string, string | undefined>;

const CAPABILITY = 'session host';
const ENVIRONMENT = 'host environment';
const WINDOWS = 'host windows';
const HOSTS = 'floor hosts';

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
  findings.push(...inventoryFindings(host, workspace, await readAllSessions(root), kind));
  return findings;
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
): Finding[] {
  const inventory = host.inventory();
  if (inventory.outcome === 'unknown') {
    return [
      {
        check: WINDOWS,
        severity: 'warn',
        message:
          `could not determine what the host holds (${inventory.reason}) — strays, gone ` +
          'sessions, and floating links are unchecked; this is not a clean bill',
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
  for (const listing of sessions) {
    const { record } = listing;
    if (record.state !== 'open' || hostedBy(record) !== kind) continue;
    const window = verified.get(record.id)?.[0];
    if (window === undefined) {
      findings.push({
        check: WINDOWS,
        severity: 'info',
        message:
          `session ${record.id} is not running (no ${kind} window) — attach re-creates it: ` +
          `ward session attach ${record.id}`,
      });
      continue;
    }
    if (window.dead) {
      findings.push({
        check: WINDOWS,
        severity: 'info',
        message:
          `session ${record.id} ${exitOf(window)}, its window ${window.window} kept to show ` +
          `it — attach re-creates it: ward session attach ${record.id}`,
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
    if (floats(record)) {
      const missing = ours.hosts.map((g) => g.name).filter((name) => !standing.includes(name));
      if (missing.length > 0) {
        findings.push({
          check: WINDOWS,
          severity: 'info',
          message:
            `coordinator ${record.id}'s window is not linked into ${missing.join(', ')} — ` +
            `attach repairs it: ward session attach ${record.id}`,
        });
      }
    }
  }

  findings.push(...hostShapeFindings(host, inventory.groups, inOurs, ours, byId, workspace));
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
  byId: ReadonlyMap<string, OpenSessionListing>,
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
  for (const group of ours.hosts) {
    if ((group.stamp?.floor ?? 0) === 0) continue;
    const shown = inOurs.filter((window) => window.groups.includes(group.name));
    const floating = shown.filter((window) => {
      const record = byId.get(window.tags.session)?.record;
      return record !== undefined && floats(record);
    });
    if (group.windows > 0 && floating.length === group.windows) {
      findings.push({
        check: HOSTS,
        severity: 'info',
        message:
          `${group.name} holds nothing of floor ${group.stamp?.floor}'s own — only the ` +
          "coordinator's link, so tmux keeps it. If you are done with it, " +
          `${host.endGroupCommand(group.name)} only unlinks the coordinator`,
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
      group.name.startsWith('ward-') &&
      group.stamp?.workspace !== workspace,
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
