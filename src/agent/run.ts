// Starting, resuming, and locating the agent RUN behind a recorded session
// (design/0029-launched-sessions/, design/0044-pi-harness/) — the Ward-shaped
// half of the agent-harness seam. The adapters (src/harness/) know how to
// build an argv, name a handle, and find a run's history; this module knows
// what Ward wants done: which record to write first, what environment declares
// the agent, which events to append, how a failure is recorded rather than
// lost — and which adapter to route to. A launch routes by the configured
// `agent.harness`; a resume, a locate, or a close routes by the recorded
// handle's prefix, so a run keeps the harness it was born under whatever the
// configuration later says.
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
  type HarnessAdapter,
  type LocateResult,
  type RunResult,
  runHarness,
} from '../harness/adapter.ts';
import { adapterForHandle, adapterNamed } from '../harness/index.ts';
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
 * The adapter is chosen from the resolved `agent.harness` (default `claude`) —
 * a launch has no handle yet, so the configured harness is what selects it.
 * The handle is ASSIGNED, not discovered: Ward mints a UUID and passes it as
 * the harness's externally-supplied session id, so the run is born under an id
 * Ward already recorded. That is the directive's constraint met exactly — the
 * id costs no tokens and puts no Ward context into the agent's window.
 *
 * The child is told `WARD_AGENT=<session id>`: a Ward-launched session is born
 * declared, so its very first `ward` call already gets agent-shaped output and
 * is attributable to this session.
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
  const adapter = adapterNamed(resolvedHarness(agent.harness));
  const model = chosenFlag('model', agent.model);
  const effort = chosenFlag('effort', agent.effort);
  const record = await openWorkspaceSession(root, purpose, {
    handle: adapter.handle(nativeId),
    ...model,
    ...effort,
    ...(workingDirectory === undefined ? {} : { workingDirectory }),
  });
  onRecorded(record);
  const run = await runHarness(adapter, {
    argv: adapter.startArgv({ nativeId, ...model, ...effort, args: argsOf(agent.args) }),
    command: commandOf(agent.command),
    cwd: resolve(root, record.workingDirectory),
    env: { WARD_AGENT: record.id },
  });
  return { record, run };
}

/**
 * Resume a recorded session: re-attach to its underlying run, in the directory
 * it ran in, and record the attempt either way. The adapter is the RECORDED
 * handle's, never the configuration's — the run is the harness it was born
 * under, so a `claude:` session resumes through claude even in a workspace now
 * configured for pi.
 *
 * LOCATE COMES FIRST (design/0038-machine-bound-sessions/). A harness history
 * that is not on this machine cannot be resumed here, and spawning a run that
 * can only fail spends a process and a terminal to learn what one lookup
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
 *   open, and the caller is refused with the fresh-start affordance.
 *
 * The `resumed` event is otherwise appended BEFORE the launch, because the
 * attempt is the fact, and an attempt that dies with the process it was about
 * to start must still be visible. A spawn that never gets off the ground
 * appends `resume-failed` with its cause.
 *
 * Model and effort are deliberately not passed (see each adapter's
 * `resumeArgv`); `agent.args` is, because those are per-invocation flags.
 */
export async function resumeSession(
  root: string,
  id: string,
  onRecorded: Recorded = () => {},
): Promise<LaunchedSession> {
  const open = await requireOpenSession(root, id);
  const { adapter, nativeId } = adapterAndIdOf(open.record);
  const history = adapter.locate(nativeId, resolve(root, open.record.workingDirectory));
  if (history.outcome === 'gone') await refuseUnresumable(root, open.record, history.path);
  const agent = await readAgentConfig(root);
  const record = await appendSessionEvent(root, id, 'resumed');
  onRecorded(record);
  const run = await runHarness(adapter, {
    argv: adapter.resumeArgv(nativeId, argsOf(agent.args)),
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
  /** The harness that minted the handle — reported so `--json` names it. */
  readonly harness: string;
  readonly nativeId: string;
}

/**
 * Where a session's history lives — found, or gone. Both are ordinary
 * outcomes, never an error exit: harness retention is the harness's, and
 * reflection must be able to learn what it CANNOT read. The lookup uses the
 * RECORDED working directory, because a run's history is addressed by the
 * directory it stood in — not wherever the caller is asking from — and the
 * RECORDED handle's adapter, because the run is the harness it was born under.
 */
export async function locateSession(root: string, id: string): Promise<SessionLocation> {
  // Closed sessions locate too: reflection reads finished work, and refusing
  // a closed id would put the harness history of everything that ever
  // completed out of reach.
  const found = await findSession(root, id);
  const { adapter, nativeId } = adapterAndIdOf(found.record);
  return {
    record: found.record,
    handle: found.record.handle ?? '',
    harness: adapter.name,
    nativeId,
    ...adapter.locate(nativeId, resolve(root, found.record.workingDirectory)),
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
 * The adapter that can read a session's handle, and the native id inside it. A
 * session with no handle, or one whose harness Ward no longer has, is refused
 * by name rather than guessed at: the handle says which adapter can resolve it.
 */
function adapterAndIdOf(record: SessionRecord): { adapter: HarnessAdapter; nativeId: string } {
  if (record.handle === undefined) {
    throw new WardError(
      `session '${record.id}' has no harness handle — Ward did not launch it, so there is no ` +
        'run to re-attach to; record one with: ward session open --purpose TEXT --handle HANDLE',
    );
  }
  const adapter = adapterForHandle(record.handle);
  if (adapter === null) {
    throw new WardError(
      `session '${record.id}' carries handle '${record.handle}', which no harness Ward has can ` +
        "resolve — an adapter reads its own '<harness>:<id>' handles",
    );
  }
  const nativeId = adapter.nativeId(record.handle);
  if (nativeId === null) {
    throw new WardError(
      `session '${record.id}' carries handle '${record.handle}' with no id after its prefix`,
    );
  }
  return { adapter, nativeId };
}

/** The resolved harness value — always present, since its default is `claude`. */
function resolvedHarness(resolved: Resolved<string>): string {
  return resolved.provenance === 'absent' ? 'claude' : resolved.value;
}

/**
 * A resolved key as an optional field: present when a layer answered, ABSENT
 * when nobody did — so the spread contributes nothing and the flag is omitted
 * from the command entirely (design/0028-agent-configuration/). Ward never
 * invents a model or an effort.
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
