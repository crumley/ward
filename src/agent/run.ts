// Starting, resuming, and locating the agent RUN behind a recorded session
// (design/0029-launched-sessions/) — the Ward-shaped half of the agent-harness
// seam. The adapter (src/harness/claude.ts) knows how to build an argv, spawn
// a process, and find a transcript; this module knows what Ward wants done:
// which record to write first, what environment declares the agent, which
// events to append, and how a failure is recorded rather than lost.
//
// The invariant everything here is arranged around: RECORD, THEN LAUNCH. The
// session document — state `open`, handle, working directory, purpose — is
// written and committed BEFORE any process exists, so a crash between the two
// leaves an honest record of an open session with a handle that resolves to
// nothing (`ward session locate` says so), never a running agent Ward has
// never heard of. The record is the source of truth (§16); a process is not.
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { WardError } from '../errors.ts';
import { readMachine } from '../global/machine.ts';
import {
  claudeHandle,
  claudeNativeId,
  type LocateResult,
  locateClaudeRun,
  type RunResult,
  resumeArgv,
  runClaude,
  startArgv,
} from '../harness/claude.ts';
import type { SessionRecord } from '../store/types.ts';
import {
  appendSessionEvent,
  findSession,
  openWorkspaceSession,
  requireOpenSession,
} from '../workspace/sessions.ts';
import { readAgentConfig } from './config.ts';
import type { Resolved } from './settings.ts';

export interface LaunchedSession {
  readonly record: SessionRecord;
  readonly run: RunResult;
}

/**
 * Called with the record as it stands the instant before the process starts.
 * It exists so the caller can REPORT the record first — the CLI prints its
 * `--json` document there — which is the record-then-launch ordering made
 * observable instead of merely promised.
 */
type Recorded = (record: SessionRecord) => void;

/**
 * Open a workspace-scope session and run the agent in it, in the foreground.
 *
 * The handle is ASSIGNED, not discovered: Ward mints a UUID and passes it as
 * `--session-id`, so the run is born under an id Ward already recorded. That
 * is the directive's constraint met exactly — the id costs no tokens and puts
 * no Ward context into the agent's window, because nothing is ever asked of
 * the agent.
 *
 * The child is told `WARD_AGENT=<session id>`: a Ward-launched session is born
 * declared, so its very first `ward` call already gets agent-shaped output and
 * is attributable to this session (the workspace manifest asks agents to set
 * exactly this; here Ward sets it for them).
 *
 * When the run exits, the session STAYS OPEN. An exit is not a close — open ≠
 * running (intent/01-concepts/02-sessions-and-lifecycle.md) — so the record
 * still says what it said, and the resume affordance the caller prints is what
 * turns it back into a run.
 */
export async function launchWorkspaceSession(
  root: string,
  purpose: string | undefined,
  workingDirectory: string | undefined,
  onRecorded: Recorded = () => {},
): Promise<LaunchedSession> {
  const nativeId = randomUUID();
  // Resolved BEFORE the record is written, because what the run is started
  // with is part of what the record says (the session-log minimum names the
  // model): the record must be complete the moment it exists, not patched
  // after the process is up.
  const agent = await readAgentConfig(root);
  const model = chosenFlag('model', agent.model);
  const effort = chosenFlag('effort', agent.effort);
  const record = await openWorkspaceSession(root, purpose, {
    handle: claudeHandle(nativeId),
    ...model,
    ...effort,
    ...(workingDirectory === undefined ? {} : { workingDirectory }),
  });
  onRecorded(record);
  const run = await runClaude({
    argv: startArgv({ nativeId, ...model, ...effort, args: argsOf(agent.args) }),
    command: commandOf(agent.command),
    cwd: resolve(root, record.workingDirectory),
    env: { WARD_AGENT: record.id },
  });
  return { record, run };
}

/**
 * Resume a recorded session: re-attach to its underlying run, in the directory
 * it ran in, and record the attempt either way.
 *
 * LOCATE COMES FIRST (design/0038-machine-bound-sessions/). A harness history
 * that is not on this machine cannot be resumed here, and spawning a run that
 * can only fail spends a process and a terminal to learn what one `existsSync`
 * already knew. Found here is resumed here whatever machine the record names —
 * facts beat assumptions, and a transcript may have been carried across — while
 * gone splits by what the record says:
 *
 * - **another machine** — refused before anything is written or spawned, with
 *   the machine that CAN resume it named. No `resumed` event: nothing was
 *   attempted here, and an event saying otherwise would falsify the trail.
 * - **this machine, or unrecorded** — the thread is UNRESUMABLE, the intent's
 *   third per-thread outcome (intent/01-concepts/02-sessions-and-lifecycle.md,
 *   Recovery): `resume-failed` is appended with its cause, the session stays
 *   open (nothing closes it on its behalf), and the caller is refused with the
 *   fresh-start affordance.
 *
 * The `resumed` event is otherwise appended BEFORE the launch, for the reason
 * the record is written before the launch: the attempt is the fact, and an
 * attempt that dies with the process it was about to start must still be
 * visible. A spawn that never gets off the ground appends `resume-failed` with
 * its cause, so a session whose re-attach keeps failing is distinguishable
 * from one that is open and healthy — the intent's own argument for events.
 *
 * `--model` and `--effort` are deliberately not passed (see `resumeArgv`);
 * `agent.args` is, because those are per-invocation flags.
 */
export async function resumeSession(
  root: string,
  id: string,
  onRecorded: Recorded = () => {},
): Promise<LaunchedSession> {
  const open = await requireOpenSession(root, id);
  const nativeId = nativeIdOf(open.record);
  const history = locateClaudeRun(nativeId, resolve(root, open.record.workingDirectory));
  if (history.outcome === 'gone') await refuseUnresumable(root, open.record, history.path);
  const agent = await readAgentConfig(root);
  const record = await appendSessionEvent(root, id, 'resumed');
  onRecorded(record);
  const run = await runClaude({
    argv: resumeArgv(nativeId, argsOf(agent.args)),
    command: commandOf(agent.command),
    cwd: resolve(root, record.workingDirectory),
    env: { WARD_AGENT: record.id },
  });
  if (run.outcome === 'failed') {
    return { record: await appendSessionEvent(root, id, 'resume-failed', run.cause), run };
  }
  return { record, run };
}

export interface SessionLocation extends LocateResult {
  readonly record: SessionRecord;
  readonly handle: string;
  readonly nativeId: string;
}

/**
 * Where a session's history lives — found, or gone. Both are ordinary
 * outcomes, never an error exit: harness retention is the harness's (Claude
 * Code discards transcripts after 30 days by default), and reflection must be
 * able to learn what it CANNOT read. The lookup uses the RECORDED working
 * directory, because the transcript's address includes the directory the run
 * stood in — not wherever the caller is asking from.
 */
export async function locateSession(root: string, id: string): Promise<SessionLocation> {
  // Closed sessions locate too: reflection reads finished work, and refusing
  // a closed id would put the harness history of everything that ever
  // completed out of reach.
  const found = await findSession(root, id);
  const nativeId = nativeIdOf(found.record);
  return {
    record: found.record,
    handle: found.record.handle ?? '',
    nativeId,
    ...locateClaudeRun(nativeId, resolve(root, found.record.workingDirectory)),
  };
}

/**
 * The two honest refusals for a session whose history is not here, and the
 * one event that separates them. Both name a way forward, because a session
 * that cannot be resumed is not a session that must be abandoned: the work
 * continues in a fresh run, which is a DIFFERENT act with a different word
 * (intent/01-concepts/02-sessions-and-lifecycle.md — continuing a gone thread
 * is never called resume).
 */
async function refuseUnresumable(root: string, record: SessionRecord, path: string): Promise<void> {
  const here = (await readMachine()).name;
  const there = record.machine;
  if (there !== undefined && there !== here) {
    throw new WardError(
      `session ${record.id} ran on ${there}; its history is not on ${here} (looked at ${path}). ` +
        `Resume it on ${there}, or start a fresh session here: ward session open --purpose TEXT`,
    );
  }
  await appendSessionEvent(root, record.id, 'resume-failed', `history not found at ${path}`);
  throw new WardError(
    `session ${record.id} has no harness history on ${here} (looked at ${path}) — the harness ` +
      'owns retention, and the attempt is recorded as resume-failed. The session stays open; ' +
      'start a fresh session here: ward session open --purpose TEXT',
  );
}

/**
 * The native run id a `claude:` handle carries. A session with no handle, or
 * one another harness minted, is refused by name rather than guessed at: the
 * handle says which adapter can resolve it, and Ward has exactly one today.
 */
function nativeIdOf(record: SessionRecord): string {
  if (record.handle === undefined) {
    throw new WardError(
      `session '${record.id}' has no harness handle — Ward did not launch it, so there is no ` +
        'run to re-attach to; record one with: ward session open --purpose TEXT --handle HANDLE',
    );
  }
  const nativeId = claudeNativeId(record.handle);
  if (nativeId === null) {
    throw new WardError(
      `session '${record.id}' carries handle '${record.handle}', which no harness Ward has can ` +
        "resolve — the claude adapter reads 'claude:<session-id>'",
    );
  }
  return nativeId;
}

/**
 * A resolved key as an optional field: present when a layer answered, ABSENT
 * when nobody did — so the spread contributes nothing and the flag is omitted
 * from the command entirely (design/0028-agent-configuration/, its whole
 * point). Ward never invents a model or an effort.
 */
function chosenFlag<K extends string>(
  key: K,
  resolved: Resolved<string>,
): Partial<Record<K, string>> {
  return resolved.provenance === 'absent' ? {} : ({ [key]: resolved.value } as Record<K, string>);
}

/** `args` always resolves (its default is the empty list), so it is never absent. */
function argsOf(resolved: Resolved<readonly string[]>): readonly string[] {
  return resolved.provenance === 'absent' ? [] : resolved.value;
}

/**
 * `agent.command` when a layer set it, else undefined — and the adapter's own
 * default program then runs (design/0035-agent-command/). Not recorded on the
 * session: how a harness is reached on THIS machine is a fact about the
 * machine, not about what the run was (the model is; the launcher is not).
 */
function commandOf(resolved: Resolved<readonly string[]>): readonly string[] | undefined {
  return resolved.provenance === 'absent' ? undefined : resolved.value;
}
