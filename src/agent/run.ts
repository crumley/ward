// Starting, resuming, and locating the agent RUN behind a recorded session
// (design/0029-launched-sessions/, extended to task scope by
// design/0032-task-scope-session-launch/) — the Ward-shaped half of the
// agent-harness seam. The adapter (src/harness/claude.ts) knows how to build an argv, spawn
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
import { resolveOpenTask } from '../workspace/scan.ts';
import {
  appendSessionEvent,
  findSession,
  openSession,
  openWorkspaceSession,
  requireOpenSession,
} from '../workspace/sessions.ts';
import { readTaskWorktrees } from '../workspace/worktrees.ts';
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
 * Open a workspace-scope session and run the agent in it, in the foreground —
 * standing in the workspace root (or `workingDirectory`), where an agent
 * responsible for the whole workspace loads workspace-wide context.
 *
 * What launching means — for THIS scope and every launched scope, because
 * both go through `launchOpened`:
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
  return launchOpened(root, onRecorded, (choice) =>
    openWorkspaceSession(root, purpose, {
      handle: claudeHandle(choice.nativeId),
      ...choice.model,
      ...choice.effort,
      ...(workingDirectory === undefined ? {} : { workingDirectory }),
    }),
  );
}

/**
 * Open a TASK-scope session and run the agent in it, in the foreground
 * (design/0032-task-scope-session-launch/) — the same launch spine as the
 * workspace scope: assigned handle, record-then-launch, `WARD_AGENT` set,
 * exit ≠ close. What differs is WHERE the agent stands: a task's agent works
 * in the task's worktree, so with exactly one worktree that is the launch
 * directory, and with none or several Ward REFUSES — legibly, before any
 * record exists — rather than standing the agent somewhere it guessed.
 * `workingDirectory` (the verb's `--dir`) overrides, exactly as it always
 * named the recorded directory on this verb.
 */
export async function launchTaskSession(
  root: string,
  taskCode: string,
  purpose: string,
  workingDirectory: string | undefined,
  onRecorded: Recorded = () => {},
): Promise<LaunchedSession> {
  // Settled BEFORE the record is written: a refusal here manufactures
  // nothing — no session, no id spent, no event trail for a launch that
  // never had a place to stand.
  const dir = workingDirectory ?? (await soleWorktreeOf(root, taskCode));
  return launchOpened(root, onRecorded, (choice) =>
    openSession(root, taskCode, purpose, {
      handle: claudeHandle(choice.nativeId),
      ...choice.model,
      ...choice.effort,
      workingDirectory: dir,
    }),
  );
}

/** What the launch resolved before the record was opened. */
interface LaunchChoice {
  readonly nativeId: string;
  readonly model: Partial<Record<'model', string>>;
  readonly effort: Partial<Record<'effort', string>>;
}

/**
 * The one launch spine both scopes share, so they cannot drift: resolve the
 * configuration, mint the id, open the record (the scope-shaped half a caller
 * supplies), REPORT it, then spawn. The configuration is resolved BEFORE the
 * record is written, because what the run is started with is part of what the
 * record says (the session-log minimum names the model): the record must be
 * complete the moment it exists, not patched after the process is up.
 */
async function launchOpened(
  root: string,
  onRecorded: Recorded,
  open: (choice: LaunchChoice) => Promise<SessionRecord>,
): Promise<LaunchedSession> {
  const nativeId = randomUUID();
  const agent = await readAgentConfig(root);
  const model = chosenFlag('model', agent.model);
  const effort = chosenFlag('effort', agent.effort);
  const record = await open({ nativeId, model, effort });
  onRecorded(record);
  const run = await runClaude({
    argv: startArgv({ nativeId, ...model, ...effort, args: argsOf(agent.args) }),
    cwd: resolve(root, record.workingDirectory),
    env: { WARD_AGENT: record.id },
  });
  return { record, run };
}

/**
 * The task's one worktree — or a refusal that names the options. Zero
 * worktrees means the task has no room to stand an agent in; several mean
 * Ward would be guessing which one the work is in, and a guessed directory
 * silently loads the wrong context. Both refusals name the way through:
 * create the worktree, or say where with `--dir`.
 */
async function soleWorktreeOf(root: string, taskCode: string): Promise<string> {
  const task = await resolveOpenTask(root, taskCode);
  const worktrees = await readTaskWorktrees(root, task.dir);
  const sole = worktrees[0];
  if (sole !== undefined && worktrees.length === 1) return sole.path;
  if (worktrees.length === 0) {
    throw new WardError(
      `task '${taskCode}' has no worktree to stand the agent in — create one with ` +
        `\`ward worktree create ${taskCode} --repo NAME\`, or name a directory with --dir PATH`,
    );
  }
  throw new WardError(
    `task '${taskCode}' has ${worktrees.length} worktrees — say where the agent stands with ` +
      `--dir PATH (one of: ${worktrees.map((worktree) => worktree.path).join(', ')})`,
  );
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
