// What this machine is called (design/0038-machine-bound-sessions/,
// design/0085-machine-name-pinned/): one short slug, resolved the same way for
// every caller, that names the computer a session ran on.
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
// And the name has to stay put. A derived name is a reading of the network
// as much as of the machine (a macOS kernel hostname follows whatever the
// network hands it), so the first name Ward derives is PINNED in the
// machine's Ward state directory and answered from there afterwards
// (design/0085-machine-name-pinned/): a machine that flipped between two
// names would mint two id series and judge its own sessions as another
// machine's.
//
// The name is a slug, not a hostname: it goes inside a session id
// (`workspace-7@gcp`), a record filename, and a shell argument, so the
// characters it may contain are the same ones every other Ward slug may
// contain. Ward normalizes rather than refuses — a machine name is a
// convenience, and dying on `My-MacBook.local` would be Ward inventing a
// failure where a lowercase answer will do (§20).
import { hostname } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import type { DocumentType } from '../store/document.ts';
import { readConfig } from './config.ts';
import { configDir, stateDir } from './paths.ts';
import { readGlobal, reasonOf, withGlobalLock, writeGlobal } from './store.ts';

/** Where the machine's name came from — reported by doctor, never guessed at. */
export type MachineSource = 'override' | 'configured' | 'stored' | 'hostname';

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
 * The machine's name, and where it came from. Four layers, narrowest first —
 * the same ladder `claudeCommand` uses for the same reason
 * (design/0035-agent-command/), with the pin slotted in above the derivation
 * (design/0085-machine-name-pinned/): `WARD_MACHINE` overrides one invocation
 * (the hermeticity seam tests point at a fixed name, and the escape hatch for
 * a machine whose hostname is meaningless), then the configured `machine`
 * key, then the name stored the first time one was derived, then the name
 * derived from this computer's host reading.
 *
 * Every layer's answer goes through the same normalizer, so the alphabet of a
 * machine name has one definition and a configured or stored value can never
 * produce an id the shell has to quote.
 */
export function machineName(
  configured: string | undefined,
  env: Env = process.env,
  host: string = hostname(),
  stored?: string,
): MachineName {
  const override = slugOf(env.WARD_MACHINE ?? '');
  if (override !== '') return { name: override, source: 'override' };
  const chosen = slugOf(configured ?? '');
  if (chosen !== '') return { name: chosen, source: 'configured' };
  const pinned = slugOf(stored ?? '');
  if (pinned !== '') return { name: pinned, source: 'stored' };
  return { name: derivedName(host), source: 'hostname' };
}

/**
 * The name a host reading yields. The first label only: `mbp.lan` and
 * `mbp.local` are one machine wearing whatever domain the network handed it
 * that morning, and the domain half is noise in an id a human reads aloud.
 */
export function derivedName(host: string): string {
  const derived = slugOf(host.split('.')[0] ?? '');
  return derived === '' ? UNNAMEABLE : derived;
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

// -- the host reading ------------------------------------------------------

/**
 * What this computer answers to, and which of its names was read. On macOS
 * the kernel hostname follows the network when no fixed `HostName` is set
 * (a DHCP or reverse-DNS answer replaces it), while the `LocalHostName` —
 * the Bonjour name System Settings shows under Sharing — changes only when
 * someone renames the machine. So macOS is read through `LocalHostName`, and
 * everywhere else, and on macOS when it cannot be read, through the kernel
 * hostname.
 */
export interface HostReading {
  readonly host: string;
  readonly from: 'LocalHostName' | 'hostname';
}

export function readHost(
  platform: string = process.platform,
  localHostName: () => string | undefined = scutilLocalHostName,
  kernel: () => string = hostname,
): HostReading {
  if (platform === 'darwin') {
    const local = localHostName()?.trim() ?? '';
    if (local !== '') return { host: local, from: 'LocalHostName' };
  }
  return { host: kernel(), from: 'hostname' };
}

/** `scutil --get LocalHostName`, or undefined when it cannot answer. */
function scutilLocalHostName(): string | undefined {
  try {
    const run = Bun.spawnSync(['/usr/sbin/scutil', '--get', 'LocalHostName'], {
      stdout: 'pipe',
      stderr: 'ignore',
    });
    return run.exitCode === 0 ? run.stdout.toString() : undefined;
  } catch {
    return undefined;
  }
}

// -- the pin ---------------------------------------------------------------

/**
 * The stored name (design/0085-machine-name-pinned/): a machine-state
 * document beside the workspace registry, because the name is a fact about
 * this computer and no workspace may carry it. `from` and `host` say what the
 * name was derived from, so a later disagreement can be explained.
 */
export const machinePinSchema = z.object({
  type: z.literal('ward-machine'),
  name: z.string().min(1),
  pinnedAt: z.string().min(1),
  from: z.enum(['LocalHostName', 'hostname']),
  host: z.string(),
});
export type MachinePin = z.infer<typeof machinePinSchema>;

export const machinePinType: DocumentType<MachinePin> = {
  name: 'ward-machine',
  relPath: 'machine.md',
  schema: machinePinSchema,
};

const PIN_BODY =
  'What this machine is called in Ward session ids, stored the first time Ward derived it so ' +
  'that it does not change with the network. To name the machine on purpose, set `machine:` ' +
  'in the Ward configuration (`ward doctor` names the file); deleting this file lets Ward ' +
  'derive and store a name again.\n';

export function machinePinPath(dir: string = stateDir()): string {
  return join(dir, machinePinType.relPath);
}

/** The pin as read: a stored name that slugs to nothing is unreadable, not absent. */
export type PinRead =
  | { readonly state: 'absent' }
  | {
      readonly state: 'read';
      readonly name: string;
      readonly pinnedAt: string;
      readonly from: HostReading['from'];
      readonly host: string;
    }
  | { readonly state: 'unreadable'; readonly reason: string };

export async function readPin(dir: string = stateDir()): Promise<PinRead> {
  const read = await readGlobal(dir, machinePinType);
  if (read.state !== 'read') return read;
  const { name, pinnedAt, from, host } = read.document.data;
  if (slugOf(name) === '') {
    return { state: 'unreadable', reason: `its name '${name}' carries no letter or digit` };
  }
  return { state: 'read', name: slugOf(name), pinnedAt, from, host };
}

/** The seams `readMachine` and `inspectMachine` read, each defaulting to the real one. */
export interface MachineSeams {
  readonly env?: Env;
  readonly configDir?: string;
  readonly stateDir?: string;
  readonly readHost?: () => HostReading;
  readonly now?: () => Date;
}

/**
 * This machine's name, resolved against the global configuration and the
 * pin. Never throws: an unreadable configuration file degrades to the next
 * layer exactly as it degrades to every other default (§20), because a
 * preference file may not be the reason a session cannot be opened.
 *
 * When neither the environment nor the configuration names the machine and
 * nothing is stored yet, the derived name is stored, under the global lock,
 * by whichever verb asks first — a read verb included. Every reader of the
 * name compares it with a record or allocates under it, so a read that
 * answered from the network while a later write answered from the pin would
 * be the very disagreement the pin exists to end. A pin that cannot be read
 * is left alone and the name derived (doctor says so); a pin that cannot be
 * written costs only the guard, never the command.
 */
export async function readMachine(seams: MachineSeams = {}): Promise<MachineName> {
  const env = seams.env ?? process.env;
  const configured = (await readConfig(seams.configDir ?? configDir(env))).machine;
  const above = machineName(configured, env, '');
  if (above.source === 'override' || above.source === 'configured') return above;
  const dir = seams.stateDir ?? stateDir(env);
  const pin = await readPin(dir);
  if (pin.state === 'read') return { name: pin.name, source: 'stored' };
  const reading = (seams.readHost ?? readHost)();
  const derived = derivedName(reading.host);
  if (pin.state === 'unreadable') return { name: derived, source: 'hostname' };
  try {
    return await storePin(dir, derived, reading, (seams.now ?? (() => new Date()))());
  } catch {
    return { name: derived, source: 'hostname' };
  }
}

/**
 * Store the derived name, unless another invocation stored one first — read
 * again under the lock, so two first runs at once agree on the earlier one.
 */
async function storePin(
  dir: string,
  name: string,
  reading: HostReading,
  now: Date,
): Promise<MachineName> {
  return withGlobalLock(dir, 'machine name', 'pin machine name', async () => {
    const again = await readPin(dir);
    if (again.state === 'read') return { name: again.name, source: 'stored' as const };
    if (again.state === 'unreadable') return { name, source: 'hostname' as const };
    await writeGlobal(dir, machinePinType, {
      data: {
        type: 'ward-machine',
        name,
        pinnedAt: now.toISOString(),
        from: reading.from,
        host: reading.host,
      },
      body: PIN_BODY,
    });
    return { name, source: 'stored' as const };
  });
}

/**
 * Everything doctor says about the name, read without writing anything: the
 * answer the ladder gives, the pin as found, and what this machine would
 * derive now — the comparison that tells a deliberate rename from a pin
 * doing its job.
 */
export interface MachineInspection {
  readonly name: MachineName;
  readonly pin: PinRead;
  readonly pinPath: string;
  readonly derived: { readonly name: string } & HostReading;
}

export async function inspectMachine(
  configured: string | undefined,
  seams: MachineSeams = {},
): Promise<MachineInspection> {
  const env = seams.env ?? process.env;
  const dir = seams.stateDir ?? stateDir(env);
  let pin: PinRead;
  try {
    pin = await readPin(dir);
  } catch (error) {
    pin = { state: 'unreadable', reason: reasonOf(error) };
  }
  const reading = (seams.readHost ?? readHost)();
  const derived = { name: derivedName(reading.host), ...reading };
  const stored = pin.state === 'read' ? pin.name : undefined;
  return {
    name: machineName(configured, env, reading.host, stored),
    pin,
    pinPath: machinePinPath(dir),
    derived,
  };
}
