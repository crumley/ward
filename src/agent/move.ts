// `ward session move` (design/0084-session-move/): carry an open session's
// conversation to another floor, or between a floor and the workspace. The
// record half is `continueSession` (src/workspace/sessions.ts): the old record
// closed with a `continued` event, the new one opened with the same handle, in
// one journal commit. This module is the run's half, OUTSIDE that commit and in
// this order:
//
// 1. read, before anything is written, whether the old run is live in its host
//    — a host that cannot answer refuses the move, since what follows would be
//    a guess about a process;
// 2. the record commit;
// 3. end the old window (its own verified window and nothing else, exactly as
//    `session close` does);
// 4. resume the continuation detached, in its new floor's host — only when the
//    old run was live there and its window was ended. A move never starts a
//    run that was not running, and never starts one beside a run still going.
//
// A move asked from inside the very run it moves is refused: step 3 would end
// the window the command is running in, before step 4 could start anything.
import { WardError } from '../errors.ts';
import type { SessionHost } from '../host/host.ts';
import type { SessionRecord } from '../store/types.ts';
import {
  type ContinuationScope,
  continueSession,
  describeScope,
  requireOpenSession,
} from '../workspace/sessions.ts';
import { hostedBy, type LiveState, liveStateOf, type Teardown, teardownSession } from './host.ts';
import { type HostedRun, type LaunchedSession, resumeSession } from './run.ts';

type Env = Record<string, string | undefined>;

/** Who is asking: the declared session and the harness run the command stands in. */
export interface MoveCaller {
  /** `WARD_AGENT`, when it names a session. */
  readonly session?: string | undefined;
  /** The harness handle of the run this process stands in, when there is one. */
  readonly handle?: string | undefined;
}

export interface MoveOptions {
  readonly purpose?: string | undefined;
  readonly caller?: MoveCaller;
  readonly env?: Env;
  /** A host to use instead of the real one (the tests' fake). */
  readonly host?: SessionHost;
  /** The single resume to call (the tests substitute one). */
  readonly resume?: (root: string, id: string) => Promise<LaunchedSession>;
}

export interface MoveReport {
  /** The old record, closed with its `continued` event. */
  readonly from: SessionRecord;
  /** The continuation — as the resume left it, when the move resumed it. */
  readonly to: SessionRecord;
  /** What ending the old window did; present when its latest run was hosted. */
  readonly teardown?: Teardown;
  /** Where the continuation's run was placed, when the move resumed it. */
  readonly hosted?: HostedRun;
  /** What to run, and why, when the move started nothing. */
  readonly next?: string;
}

export async function moveSession(
  root: string,
  id: string,
  target: ContinuationScope,
  options: MoveOptions = {},
): Promise<MoveReport> {
  const env = options.env ?? process.env;
  const open = await requireOpenSession(root, id);
  refuseSelfMove(open.record, target, options.caller);
  const kind = hostedBy(open.record);
  const before = kind === undefined ? undefined : await liveStateOf(root, open, env, options.host);
  if (before?.state === 'unknown') {
    throw new WardError(
      `cannot tell whether session ${id} is still running in ${before.kind} (${before.reason}) — ` +
        'nothing was moved; check the host, then move it again',
    );
  }
  const { from, to } = await continueSession(root, id, target, { purpose: options.purpose });
  const successor = to.record.id;
  const resumeLater = `ward session resume ${successor}`;
  if (kind === undefined) {
    return {
      from: from.record,
      to: to.record,
      next:
        `its last run was in the foreground, where Ward cannot see it — leave that run if it is ` +
        `still going, then continue the conversation on ${describeScope(to.record)}: ${resumeLater}`,
    };
  }
  const teardown = await teardownSession(root, from, env, options.host);
  const report = {
    from: from.record,
    to: to.record,
    ...(teardown === undefined ? {} : { teardown }),
  };
  if (before?.state !== 'live') {
    return {
      ...report,
      next: `it was not running (${notRunning(before)}) — run it when wanted: ${resumeLater}`,
    };
  }
  if (teardown === undefined || (teardown.outcome !== 'closed' && teardown.outcome !== 'absent')) {
    return {
      ...report,
      next:
        `its old window could not be ended (${teardown?.detail ?? 'no answer'}) — end it, so ` +
        `one conversation is not run twice, then: ${resumeLater}`,
    };
  }
  const resume =
    options.resume ??
    ((at: string, which: string) => resumeSession(at, which, () => {}, { hostFlag: 'detach' }));
  try {
    const resumed = await resume(root, successor);
    if (!('hosted' in resumed)) return { ...report, to: resumed.record };
    return { ...report, to: resumed.record, hosted: resumed.hosted };
  } catch (error) {
    const why = error instanceof Error ? error.message : String(error);
    return { ...report, next: `the continuation did not start (${why}) — ${resumeLater}` };
  }
}

/**
 * Refuse moving the session this command runs in: the old window is ended
 * before the continuation starts, and ending it ends the command too — the
 * record would be moved and the conversation left with no run. Matched by the
 * declared session and by the run's own handle, since an agent's subagents
 * declare other sessions while standing in the same run.
 */
function refuseSelfMove(
  record: SessionRecord,
  target: ContinuationScope,
  caller: MoveCaller | undefined,
): void {
  const mine =
    caller?.session === record.id ||
    (caller?.handle !== undefined && caller.handle === record.handle);
  if (!mine) return;
  const where = target.scope === 'workspace' ? '--workspace' : `--floor ${target.floor}`;
  throw new WardError(
    `session ${record.id} is the one this command is running in — a move ends its window ` +
      'before the continuation starts, which would end this command with it. Nothing was ' +
      `moved; run the move from another terminal: ward session move ${record.id} ${where}`,
  );
}

function notRunning(live: LiveState | undefined): string {
  if (live === undefined) return 'no window';
  return live.state === 'exited' ? 'its last run failed, its window kept' : 'no window';
}
