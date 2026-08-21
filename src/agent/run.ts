// Starting, resuming, and locating the agent RUN behind a recorded session
// (design/0028-launched-sessions/) — the Ward-shaped half of the agent-harness
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
  purpose: string,
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
    cwd: resolve(root, record.workingDirectory),
    env: { WARD_AGENT: record.id },
  });
  return { record, run };
}

/**
 * Resume a recorded session: re-attach to its underlying run, in the directory
 * it ran in, and record the attempt either way.
 *
 * The `resumed` event is appended BEFORE the launch, for the reason the record
 * is written before the launch: the attempt is the fact, and an attempt that
 * dies with the process it was about to start must still be visible. A spawn
 * that never gets off the ground appends `resume-failed` with its cause, so a
 * session whose re-attach keeps failing is distinguishable from one that is
 * open and healthy — the intent's own argument for events.
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
  const agent = await readAgentConfig(root);
  const record = await appendSessionEvent(root, id, 'resumed');
  onRecorded(record);
  const run = await runClaude({
    argv: resumeArgv(nativeId, argsOf(agent.args)),
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
 * from the command entirely (design/0027-agent-configuration/, its whole
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
