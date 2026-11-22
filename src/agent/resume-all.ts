// `ward session resume --all` (design/0068-bulk-session-resume/): the first
// slice of recovery after a reboot. Two halves, kept apart on purpose:
//
// - the PLAN reads — every open session whose latest launch was hosted, what
//   the host holds of it, and whether its harness history is on this machine —
//   and writes nothing: no event, no commit, no window. It is what the bare
//   verb prints, and it may be asked any number of times.
// - ENACTING walks the plan's `resume` rows serially, coordinator first, each
//   through the same `resumeSession` a single `ward session resume ID --detach`
//   takes, so the gate, the record-then-launch order and the events are that
//   verb's and not a second copy of them.
//
// The plan decides with `locate` what a resume would otherwise discover by
// failing: a session whose history is gone is never attempted, so asking again
// never piles `resume-failed` events onto a thread that cannot come back.
import { resolve } from 'node:path';
import { WardError } from '../errors.ts';
import { readMachine } from '../global/machine.ts';
import { adapterForHandle } from '../harness/index.ts';
import type { SessionHost } from '../host/host.ts';
import type { HostedKind, SessionRecord } from '../store/types.ts';
import { sessionScopeOf } from '../store/types.ts';
import { workspaceId } from '../workspace/identity.ts';
import { type OpenSessionListing, readAllSessions } from '../workspace/sessions.ts';
import { classify, describeExit, hostedBy, hostOf, type LiveState } from './host.ts';
import { isCoordinator, placementFloor } from './placement.ts';
import { type LaunchedSession, resumeSession } from './run.ts';

type Env = Record<string, string | undefined>;

/**
 * What the plan says of one open hosted session:
 *
 * - `resume` — not running here and its history is here: enacting starts it.
 * - `live` — already running in its host: nothing to do.
 * - `gone` — not running, and its harness history is not on this machine,
 *   which is the machine it ran on: it cannot be resumed anywhere. It needs
 *   its human (close it, or start a fresh session), and is never attempted.
 * - `elsewhere` — its history is on another machine: resumed there, not here.
 * - `unknown` — could not be determined (the host did not answer, or the
 *   handle is one no harness here reads): never attempted, never read as gone.
 */
export type PlanStep = 'resume' | 'live' | 'gone' | 'elsewhere' | 'unknown';

export interface PlannedSession {
  readonly record: SessionRecord;
  /** The floor whose host the window belongs in, derived from the records. */
  readonly floor: number;
  /** Whether it is the coordinator — resumed first. */
  readonly coordinator: boolean;
  readonly step: PlanStep;
  /** One clause saying why the step is what it is. */
  readonly detail: string;
  /** Where the run stands in the host, as the plan read it. */
  readonly live: LiveState;
}

export interface ResumePlan {
  /** This machine's name: a plan is an answer about one machine. */
  readonly machine: string;
  readonly kind: HostedKind;
  /** The `--floor` narrowing, when one was asked for. */
  readonly floor?: number;
  /** In the order enacting takes them: the coordinator, then floor by floor. */
  readonly sessions: readonly PlannedSession[];
  /**
   * Open sessions (inside the narrowing) whose latest run was not hosted — a
   * foreground run, or a session that recorded itself. Ward cannot see into
   * those runs and starts nothing over them; they are counted, not listed.
   */
  readonly notHosted: number;
  /** Open hosted sessions a `--floor` narrowing left out. */
  readonly outside: number;
}

export interface PlanOptions {
  readonly floor?: number | undefined;
  readonly env?: Env;
  /** A host to use instead of the real one (the tests' fake). */
  readonly host?: SessionHost;
}

const KIND: HostedKind = 'tmux';

/**
 * Read what a bulk resume would do, and do none of it. Refused when the
 * detached host is not usable on this machine: every row would then read
 * "resume" for a run that could not be placed.
 */
export async function planResumeAll(root: string, options: PlanOptions = {}): Promise<ResumePlan> {
  const host = options.host ?? hostOf(KIND, options.env ?? process.env);
  const check = host.check();
  if (!check.usable) {
    throw new WardError(
      `cannot resume --all: ${KIND} is not usable here (${check.reason}) — the bulk resume ` +
        'hosts every run detached. Resume one session in this terminal with ' +
        'ward session resume ID --foreground, or see: ward doctor',
    );
  }
  const workspace = await workspaceId(root);
  const machine = (await readMachine()).name;
  const all = await readAllSessions(root);
  const sessions: PlannedSession[] = [];
  let notHosted = 0;
  let outside = 0;
  for (const listing of all) {
    const { record } = listing;
    if (record.state !== 'open') continue;
    const floor = placementFloor(listing, all);
    const within = options.floor === undefined || options.floor === floor;
    if (hostedBy(record) !== KIND) {
      if (within) notHosted += 1;
      continue;
    }
    if (!within) {
      outside += 1;
      continue;
    }
    const { live } = classify(record, host.find(record.id), workspace, floor, KIND);
    sessions.push({
      record,
      floor,
      coordinator: isCoordinator(record),
      live,
      ...stepOf(root, listing, live, machine),
    });
  }
  sessions.sort(inResumeOrder);
  return {
    machine,
    kind: KIND,
    ...(options.floor === undefined ? {} : { floor: options.floor }),
    sessions,
    notHosted,
    outside,
  };
}

/** The step for one session: what the host holds first, then where its history is. */
function stepOf(
  root: string,
  listing: OpenSessionListing,
  live: LiveState,
  machine: string,
): Pick<PlannedSession, 'step' | 'detail'> {
  const { record } = listing;
  if (live.state === 'unknown') {
    return {
      step: 'unknown',
      detail: `could not tell whether it is running (${live.reason ?? 'no reason'})`,
    };
  }
  if (live.state === 'live') {
    return {
      step: 'live',
      detail: `running in ${live.group ?? '?'}, window ${live.window ?? '?'}`,
    };
  }
  const adapter = adapterForHandle(record.handle);
  const nativeId = adapter?.nativeId(record.handle ?? '') ?? null;
  if (adapter === null || nativeId === null) {
    return {
      step: 'unknown',
      detail: `handle '${record.handle ?? ''}' is one no harness here can read`,
    };
  }
  const history = adapter.locate(nativeId, resolve(root, record.workingDirectory));
  if (history.outcome === 'found') {
    return {
      step: 'resume',
      detail:
        live.state === 'exited'
          ? `its last run ${describeExit(live)}, window ${live.window ?? '?'} kept`
          : `not running (no ${live.kind} window)`,
    };
  }
  if (record.machine !== undefined && record.machine !== machine) {
    return { step: 'elsewhere', detail: `ran on ${record.machine} — resume it there` };
  }
  return {
    step: 'gone',
    detail: `no harness history on ${machine} — cannot be resumed (ward session locate ${record.id})`,
  };
}

/**
 * Coordinator first, then floor by floor; within a floor, the floor's own
 * session before the sessions placed beside it, and each of those in the
 * order they were opened — so a floor's host is minted by the session that
 * answers for the floor, and a rerun reads in the same order as the last.
 */
function inResumeOrder(a: PlannedSession, b: PlannedSession): number {
  return (
    Number(b.coordinator) - Number(a.coordinator) ||
    a.floor - b.floor ||
    Number(ownsFloor(b)) - Number(ownsFloor(a)) ||
    a.record.openedAt.localeCompare(b.record.openedAt) ||
    a.record.id.localeCompare(b.record.id)
  );
}

/** Whether the session is the one opened at its placement floor's own scope. */
function ownsFloor(planned: PlannedSession): boolean {
  return sessionScopeOf(planned.record) === 'project' && planned.record.floor === planned.floor;
}

/**
 * How one attempted resume went:
 *
 * - `resumed` — placed in its floor's host. Read back a beat later it was
 *   running, or the host could not say; nothing says it ended.
 * - `exited` — placed, and the run had already ended when read back.
 * - `failed` — not placed: the resume refused or the host could not hold it.
 *   The cause is the single verb's own refusal, word for word.
 */
export type ResumeOutcome = 'resumed' | 'exited' | 'failed';

export interface EnactedSession extends PlannedSession {
  /** Present exactly on a `resume` row that was attempted. */
  readonly outcome?: ResumeOutcome;
  /** Why it failed, or how it ended. */
  readonly cause?: string;
  /** The host the run was placed in, and the command that joins it. */
  readonly group?: string;
  readonly join?: string;
}

export interface EnactOptions {
  /** Told of every planned session in order — attempted or not — as it is settled. */
  readonly onSession?: (session: EnactedSession) => void;
  /** The pause between one launch and the next; see {@link LAUNCH_GAP_MS}. */
  readonly gapMs?: number;
  /** The single resume to call (the tests substitute one that fails on cue). */
  readonly resume?: (root: string, id: string) => Promise<LaunchedSession>;
}

/**
 * The pause between one launch and the next. Zero: a hosted resume already
 * costs its own record commit and the beat it waits before reading its window
 * back, which spaced launches about 0.45 s apart when measured, and twelve
 * harnesses started at the same instant each still drew their first screen
 * within half a second (design/0068-bulk-session-resume/, _Pacing_). The knob stays so the number
 * can move without the loop changing.
 */
export const LAUNCH_GAP_MS = 0;

/**
 * Enact a plan: resume every `resume` row, serially, in the plan's order.
 * One session's failure never stops the rest — each attempt is caught, turned
 * into that row's outcome, and the loop goes on. Rows the plan did not mark
 * `resume` are passed through untouched, so the caller reads one list.
 *
 * Idempotent by the plan, not by a guard here: a session this brought back is
 * `live` in the next plan, and a `live` row is never attempted. Should the
 * world move between the plan and an attempt (a human attached it meanwhile),
 * `resumeSession` re-reads under the store lock and refuses, and that refusal
 * is the row's `failed`.
 */
export async function enactResumeAll(
  root: string,
  plan: ResumePlan,
  options: EnactOptions = {},
): Promise<EnactedSession[]> {
  const resume =
    options.resume ??
    ((at: string, id: string) => resumeSession(at, id, () => {}, { hostFlag: 'detach' }));
  const gapMs = options.gapMs ?? LAUNCH_GAP_MS;
  const enacted: EnactedSession[] = [];
  let launched = 0;
  for (const planned of plan.sessions) {
    let settled: EnactedSession = planned;
    if (planned.step === 'resume') {
      if (launched > 0 && gapMs > 0) await Bun.sleep(gapMs);
      launched += 1;
      settled = { ...planned, ...(await attempt(root, planned.record.id, resume)) };
    }
    enacted.push(settled);
    options.onSession?.(settled);
  }
  return enacted;
}

async function attempt(
  root: string,
  id: string,
  resume: NonNullable<EnactOptions['resume']>,
): Promise<Pick<EnactedSession, 'outcome' | 'cause' | 'group' | 'join'> & { live?: LiveState }> {
  try {
    const result = await resume(root, id);
    if (!('hosted' in result)) {
      // `--detach` either hosts the run or refuses; a foreground result here
      // would mean this verb sat in one session's terminal.
      return { outcome: 'failed', cause: 'the resume ran in the foreground, not in a host' };
    }
    const { hosted } = result;
    const where = { group: hosted.group, join: hosted.join };
    const live = hosted.live;
    if (live === undefined) return { outcome: 'resumed', ...where };
    if (live.state === 'exited') {
      return { outcome: 'exited', cause: `the run ${describeExit(live)} at once`, live, ...where };
    }
    if (live.state === 'gone') {
      return { outcome: 'exited', cause: 'its window was gone when read back', live, ...where };
    }
    return { outcome: 'resumed', live, ...where };
  } catch (error) {
    return { outcome: 'failed', cause: error instanceof Error ? error.message : String(error) };
  }
}

/** What a plan, or an enacted run, comes to — the counts both renderings print. */
export interface ResumeTally {
  readonly resume: number;
  readonly live: number;
  readonly gone: number;
  readonly elsewhere: number;
  readonly unknown: number;
  readonly resumed: number;
  readonly exited: number;
  readonly failed: number;
}

export function tally(sessions: readonly EnactedSession[]): ResumeTally {
  const count = (test: (session: EnactedSession) => boolean) => sessions.filter(test).length;
  return {
    resume: count((s) => s.step === 'resume'),
    live: count((s) => s.step === 'live'),
    gone: count((s) => s.step === 'gone'),
    elsewhere: count((s) => s.step === 'elsewhere'),
    unknown: count((s) => s.step === 'unknown'),
    resumed: count((s) => s.outcome === 'resumed'),
    exited: count((s) => s.outcome === 'exited'),
    failed: count((s) => s.outcome === 'failed'),
  };
}

/**
 * Whether an enacted run leaves something this run tried, or should have
 * tried, not running: an attempt that failed or ended at once, or a session
 * whose state could not be read. `gone` and `elsewhere` are not in it — they
 * are standing facts no rerun changes, reported for the human and not charged
 * to the run.
 */
export function leftBroken(sessions: readonly EnactedSession[]): boolean {
  return sessions.some(
    (s) => s.outcome === 'failed' || s.outcome === 'exited' || s.step === 'unknown',
  );
}
