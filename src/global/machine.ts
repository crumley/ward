// What this machine is called (design/0038-machine-bound-sessions/): one
// short slug, resolved the same way for every caller, that names the computer
// a session ran on.
//
// It exists because a session is bound to the machine holding its harness
// history: the transcript lives on the machine that produced it
// (intent/02-subsystems/03-agent-harness.md — locate answers found or gone,
// and it answers per machine), while the workspace record travels through git
// to every machine that clones it. So the machine has to be a RECORDED fact,
// not an assumption made by whoever happens to be reading — otherwise two
// clones allocate the same session id, one record overwrites the other, and a
// resume on the wrong machine spawns a run that can only fail.
//
// The name is a slug, not a hostname: it goes inside a session id
// (`workspace-7@gcp`), a record filename, and a shell argument, so the
// characters it may contain are the same ones every other Ward slug may
// contain. Ward normalizes rather than refuses — a machine name is a
// convenience, and dying on `My-MacBook.local` would be Ward inventing a
// failure where a lowercase answer will do (§20).
import { hostname } from 'node:os';
import { readConfig } from './config.ts';
import { configDir } from './paths.ts';

/** Where the machine's name came from — reported by doctor, never guessed at. */
export type MachineSource = 'override' | 'configured' | 'hostname';

export interface MachineName {
  readonly name: string;
  readonly source: MachineSource;
}

/**
 * The last resort: a hostname that survives no character of the slug alphabet
 * (an all-punctuation name, or an empty one). Ward still answers, because
 * every session id needs a machine half — and a machine that cannot say what
 * it is called is still, honestly, the local one.
 */
const UNNAMEABLE = 'local';

type Env = Record<string, string | undefined>;

/**
 * The machine's name, and where it came from. Three layers, narrowest first —
 * the same ladder `claudeCommand` uses for the same reason
 * (design/0035-agent-command/): `WARD_MACHINE` overrides one invocation (the
 * hermeticity seam tests point at a fixed name, and the escape hatch for a
 * machine whose hostname is meaningless), then the configured `machine` key,
 * then the hostname this computer answers to.
 *
 * Both configured and derived names go through the same normalizer, so the
 * alphabet of a machine name has one definition and a configured value can
 * never produce an id the shell has to quote.
 */
export function machineName(
  configured: string | undefined,
  env: Env = process.env,
  host: string = hostname(),
): MachineName {
  const override = slugOf(env.WARD_MACHINE ?? '');
  if (override !== '') return { name: override, source: 'override' };
  const chosen = slugOf(configured ?? '');
  if (chosen !== '') return { name: chosen, source: 'configured' };
  // The first label only: `mbp.lan` and `mbp.local` are one machine wearing
  // whatever domain the network handed it that morning, and the domain half
  // is noise in an id a human reads aloud.
  const derived = slugOf(host.split('.')[0] ?? '');
  return { name: derived === '' ? UNNAMEABLE : derived, source: 'hostname' };
}

/**
 * The slug alphabet, applied to whatever it is given: lowercase, every run of
 * anything outside `[a-z0-9-]` collapsed to one hyphen, no leading or
 * trailing hyphen. Empty out means "this string carried no name", which the
 * caller resolves by falling to the next layer.
 */
function slugOf(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * This machine's name, resolved against the global configuration. Never
 * throws: an unreadable configuration file degrades to the hostname exactly
 * as it degrades to every other default (§20), because a preference file may
 * not be the reason a session cannot be opened.
 */
export async function readMachine(dir: string = configDir()): Promise<MachineName> {
  return machineName((await readConfig(dir)).machine);
}
