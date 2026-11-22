// The nudge (design/0067-floor-dispatch/): after a hand-off is recorded, tell
// the floor it was handed to — one line typed into the window of that floor's
// attending (design/0089-floor-attending/), when its run is live in a detached
// host on this machine.
//
// It is live delivery, and so it is the optimization the messaging seam says
// it is (intent/02-subsystems/02-messaging-coordination.md, Recorded-first):
// the hand-off is already committed when this runs, a floor with no running
// session is served entirely from that record, and nothing here can fail the
// verb that sent it. Every way a nudge does not happen is an answer with its
// reason, reported beside the hand-off.
//
// Who is typed to is decided here, from records: the floor's ATTENDING on this
// machine (design/0089-floor-attending/) — its one general session, the
// coordinator on the ground floor. Never a session working a task, never a
// second general session, never another floor's — a session is typed to only
// because the record says the floor is run from it.

import { readMachine } from '../global/machine.ts';
import { adapterForHandle } from '../harness/index.ts';
import type { SessionHost } from '../host/host.ts';
import type { DispatchRecord } from '../store/types.ts';
import { workspaceId } from '../workspace/identity.ts';
import { type OpenSessionListing, readAllSessions } from '../workspace/sessions.ts';
import { classify, describeExit, hostedBy, hostOf } from './host.ts';
import { attendingOf, placementFloor } from './placement.ts';

type Env = Record<string, string | undefined>;

/** What became of one floor session's nudge. */
export interface Nudge {
  readonly session: string;
  /**
   * `typed`: the line was submitted to its run. `withheld`: its run is live
   * and the line was not typed, or was taken back. `not-running`: its run has
   * ended or is gone. `unreachable`: Ward cannot type to it from here at all.
   * `unknown`: the host could not say.
   */
  readonly outcome: 'typed' | 'withheld' | 'not-running' | 'unreachable' | 'unknown';
  readonly detail: string;
}

/** The slug is spelled in the notice only while it keeps the line short. */
const SLUG_MAX = 40;

/**
 * The line typed for a hand-off. It carries no instruction of its own: it
 * names the task and the read that shows it, so what the receiving session
 * acts on is the record — the brief, and who sent it — never this line, which
 * anything able to type into the window could have typed. Printable ASCII,
 * one line, opening with a mark no harness reads as a command.
 */
export function dispatchNotice(record: DispatchRecord, slug: string): string {
  const named = slug.length <= SLUG_MAX ? ` (${slug})` : '';
  const from =
    record.fromFloor !== undefined
      ? ` from floor ${record.fromFloor}`
      : record.fromSession !== undefined
        ? ` from ${record.fromSession}`
        : '';
  return (
    `[ward] hand-off to floor ${record.to}: task ${record.task}${named}${from}. ` +
    `Read it: ward task show ${record.task}`
  );
}

/**
 * The session a floor's hand-off notice goes to: its attending on `machine`
 * (design/0089-floor-attending/) — on floor 0 the coordinator. Empty when the
 * floor has none here, and the hand-off waits in the record.
 */
export function floorSessions(
  all: readonly OpenSessionListing[],
  floor: number,
  machine: string,
): OpenSessionListing[] {
  const attending = attendingOf(all, floor, machine);
  return attending === undefined ? [] : [attending];
}

/**
 * Nudge a floor: type `text` to its attending, when it can be reached. An
 * empty answer means the floor has no attending here — the hand-off waits in
 * the record. Never throws: a nudge that could not be
 * attempted is an answer like any other.
 */
export async function nudgeFloor(
  root: string,
  floor: number,
  text: string,
  env: Env = process.env,
  host?: SessionHost,
): Promise<Nudge[]> {
  const all = await readAllSessions(root);
  const here = (await readMachine()).name;
  const nudges: Nudge[] = [];
  for (const listing of floorSessions(all, floor, here)) {
    const session = listing.record.id;
    try {
      nudges.push({ session, ...(await nudgeOne(root, listing, all, here, text, env, host)) });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      nudges.push({ session, outcome: 'unknown', detail: reason });
    }
  }
  return nudges;
}

async function nudgeOne(
  root: string,
  listing: OpenSessionListing,
  all: readonly OpenSessionListing[],
  here: string,
  text: string,
  env: Env,
  given: SessionHost | undefined,
): Promise<Omit<Nudge, 'session'>> {
  const { record } = listing;
  if (record.machine !== undefined && record.machine !== here) {
    return { outcome: 'unreachable', detail: `it runs on ${record.machine}` };
  }
  const kind = hostedBy(record);
  if (kind === undefined) {
    return {
      outcome: 'unreachable',
      detail: 'its run is in a terminal of its own, not a host Ward can type into',
    };
  }
  const adapter = adapterForHandle(record.handle);
  const inputLine = adapter?.inputLine;
  if (inputLine === undefined) {
    return {
      outcome: 'unreachable',
      detail: `Ward cannot read the input line of its harness (${adapter?.name ?? 'no handle'})`,
    };
  }
  const host = given ?? hostOf(kind, env);
  const check = host.check();
  if (!check.usable) return { outcome: 'unreachable', detail: `no ${kind} here (${check.reason})` };
  const workspace = await workspaceId(root);
  const floor = placementFloor(listing, all);
  const { live, own } = classify(record, host.find(record.id), workspace, floor, kind);
  if (live.state === 'unknown') {
    return { outcome: 'unknown', detail: `could not determine (${live.reason ?? 'no reason'})` };
  }
  if (live.state === 'exited') {
    return { outcome: 'not-running', detail: `its run ${describeExit(live)}` };
  }
  if (own === undefined || live.state === 'gone') {
    return { outcome: 'not-running', detail: `no ${kind} window holds its run` };
  }
  const result = host.typeLine({ window: own.window, session: record.id, text, inputLine });
  switch (result.outcome) {
    case 'typed':
      return { outcome: 'typed', detail: `typed into window ${own.window}` };
    case 'withheld':
      return { outcome: 'withheld', detail: result.reason };
    case 'absent':
      return { outcome: 'not-running', detail: `window ${own.window} is gone` };
    case 'unknown':
      return { outcome: 'unknown', detail: result.reason };
  }
}
