// The harness registry (intent/02-subsystems/03-agent-harness.md,
// design/0044-pi-harness/): the one place that knows which adapters exist, and
// the two ways Ward selects one. A LAUNCH selects by name — the value resolved
// for `agent.harness` — because at open there is no handle yet. Everything
// after open — resume, locate, a status probe — selects by HANDLE PREFIX,
// because a recorded `claude:` run is claude's to resolve whatever the
// configuration now says: this is what lets a workspace mix harnesses without
// a handle ever reaching an adapter that cannot read it.
import { WardError } from '../errors.ts';
import type { Env, HarnessAdapter } from './adapter.ts';
import { claudeAdapter } from './claude.ts';
import { piAdapter } from './pi.ts';

/** Every harness Ward can run, in the order they were added. */
export const HARNESS_ADAPTERS: readonly HarnessAdapter[] = [claudeAdapter, piAdapter];

/**
 * The adapter a configured harness name selects, for a launch. The name is
 * validated by `agentHarnessSchema` before it reaches here, so an unknown one
 * is a Ward bug rather than a user error — but it is refused explicitly all
 * the same, naming what Ward has, because a silent `undefined` at spawn time
 * would be far harder to diagnose than a named refusal.
 */
export function adapterNamed(name: string): HarnessAdapter {
  const found = HARNESS_ADAPTERS.find((adapter) => adapter.name === name);
  if (found === undefined) {
    const known = HARNESS_ADAPTERS.map((adapter) => adapter.name).join(', ');
    throw new WardError(`no harness adapter named '${name}' — Ward has: ${known}`);
  }
  return found;
}

/**
 * The adapter that can read a handle, by its prefix — null when none can
 * (no handle recorded, or one a harness Ward no longer has minted). The prefix
 * test IS `nativeId(handle) !== null`: an adapter reads exactly the handles it
 * mints, so asking whether it can extract a native id is asking whether the
 * handle is its.
 */
export function adapterForHandle(handle: string | undefined): HarnessAdapter | null {
  if (handle === undefined) return null;
  return HARNESS_ADAPTERS.find((adapter) => adapter.nativeId(handle) !== null) ?? null;
}

/**
 * The handle of the harness run the caller is standing in, read from the
 * variable that harness sets for everything it starts — null outside any run
 * Ward has an adapter for (design/0045-agent-record-reads/). This is what lets
 * an agent record its own session without composing a handle: an agent asked
 * to spell its run id guesses one when it does not know it, and a guessed
 * handle locates nothing, ever. An empty value counts as unset.
 */
export function ambientHandle(env: Env = process.env): string | null {
  for (const adapter of HARNESS_ADAPTERS) {
    const value = adapter.ambientEnvVar === undefined ? undefined : env[adapter.ambientEnvVar];
    if (value !== undefined && value !== '') return adapter.handle(value);
  }
  return null;
}
