// The pi coding agent adapter (design/0044-pi-harness/): the second
// implementation of the harness seam (src/harness/adapter.ts), and the proof
// that the seam is one — start / handle / resume / locate for `pi`
// (@earendil-works/pi-coding-agent), with everything Ward-specific staying in
// Ward exactly as it does for claude (src/harness/claude.ts).
//
// pi is close enough to claude that the shapes line up, and different in the
// two places the seam exists to absorb: it spells thinking depth `--thinking`
// (claude's `--effort`), and it keeps a run's history under a per-cwd
// directory named on its own scheme, one file per session, rather than a
// single transcript at a computed path. Model, session id, and the extra-args
// tail map straight across, which is why parity is reached without pi-shaped
// concepts leaking upward.
import { readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  type Env,
  flag,
  type HarnessAdapter,
  type LocateResult,
  type StartRequest,
} from './adapter.ts';

/** The harness name recorded in every handle this adapter mints, and its prefix. */
export const PI_HARNESS = 'pi';

/** What runs when nobody configured a command: the CLI under its own name. */
export const DEFAULT_PI_COMMAND: readonly string[] = ['pi'];

/** The env override that names the program for one invocation (the test seam). */
export const PI_BIN_ENV = 'WARD_PI_BIN';

/** The handle for a pi run: the name, then its native session id. */
export function piHandle(nativeId: string): string {
  return `${PI_HARNESS}:${nativeId}`;
}

/** The native session id inside a `pi:` handle — null for anything else. */
export function piNativeId(handle: string): string | null {
  const prefix = `${PI_HARNESS}:`;
  if (!handle.startsWith(prefix)) return null;
  const id = handle.slice(prefix.length);
  return id === '' ? null : id;
}

/**
 * The argv of a fresh pi run, without the command that starts the CLI.
 * `--session-id <id>` is pi's externally-supplied id — "use exact project
 * session ID, creating it if missing" — so Ward assigns the handle and the
 * process is born under it, the same trick claude's adapter rests on. `--model`
 * takes pi's `provider/id[:thinking]` pattern verbatim; thinking depth is a
 * separate flag here, `--thinking`, which is the one place the argv differs
 * from claude's — the vocabulary is pi's (`off … max`), passed through unread.
 *
 * Ward's flags first, the human's `agent.args` LAST, so the tail is theirs.
 */
export function piStartArgv(request: StartRequest): string[] {
  return [
    '--session-id',
    request.nativeId,
    ...flag('--model', request.model),
    ...flag('--thinking', request.effort),
    ...request.args,
  ];
}

/**
 * The argv of a resumed pi run. `--session <id>` selects the existing session
 * by exact id within the project and errors if it is gone — the honest resume,
 * where `--session-id` would silently mint a fresh session under the id when
 * the history has been removed. No model or thinking: a resumed run restores
 * what it was saved with, as for claude. `args` rides along — per-invocation
 * flags a resumed process needs as much as a fresh one.
 */
export function piResumeArgv(nativeId: string, args: readonly string[]): string[] {
  return ['--session', nativeId, ...args];
}

/**
 * The directory pi keeps a run's history in. Its default is per-cwd, under the
 * agent dir: `<agentDir>/sessions/--<cwd>--`, where the cwd is absolute with
 * its leading separator stripped and every `/`, `\`, or `:` turned to `-`.
 * `PI_CODING_AGENT_DIR` moves the agent dir (default `~/.pi/agent`);
 * `PI_CODING_AGENT_SESSION_DIR` replaces the WHOLE session directory with one
 * flat dir, in which case the cwd no longer shapes the path — Ward honors both,
 * so a human who moved pi's storage is not reported as having lost every run.
 */
export function piSessionDir(cwd: string, env: Env = process.env): string {
  const flat = env.PI_CODING_AGENT_SESSION_DIR;
  if (flat !== undefined && flat !== '') return resolve(flat);
  const agentDir = env.PI_CODING_AGENT_DIR ?? join(homedir(), '.pi', 'agent');
  return join(resolve(agentDir), 'sessions', piSessionDirName(cwd));
}

/** The per-cwd directory name pi computes: `--<cwd, separators dashed>--`. */
export function piSessionDirName(cwd: string): string {
  return `--${resolve(cwd)
    .replace(/^[/\\]/, '')
    .replace(/[/\\:]/g, '-')}--`;
}

/**
 * Resolve a session id to its history on THIS machine — found, or gone. pi
 * names each file `<timestamp>_<session-id>.jsonl`, so the run is the file
 * whose name ends `_<id>.jsonl` in the session directory. Gone reports the
 * pattern Ward looked for, because "we looked HERE" is what makes a gone
 * answer actionable — and gone is ordinary, since a missing directory (pi
 * never ran here, or its storage moved) is a fact reflection must be able to
 * read, never an error.
 */
export function locatePiRun(nativeId: string, cwd: string, env: Env = process.env): LocateResult {
  const dir = piSessionDir(cwd, env);
  const suffix = `_${nativeId}.jsonl`;
  try {
    for (const name of readdirSync(dir)) {
      if (name.endsWith(suffix)) return { path: join(dir, name), outcome: 'found' };
    }
  } catch {
    // The directory is not there: pi kept no history here. Fall through to gone.
  }
  return { path: join(dir, `*${suffix}`), outcome: 'gone' };
}

/** The pi coding agent as a harness adapter — the seam's surface. */
export const piAdapter: HarnessAdapter = {
  name: PI_HARNESS,
  defaultCommand: DEFAULT_PI_COMMAND,
  binEnvVar: PI_BIN_ENV,
  retentionNote:
    'pi keeps a session until a human deletes it, so a missing one was removed on purpose or ' +
    "its storage moved — the session's own record is what survives either way",
  handle: piHandle,
  nativeId: piNativeId,
  startArgv: piStartArgv,
  resumeArgv: piResumeArgv,
  locate: locatePiRun,
};
