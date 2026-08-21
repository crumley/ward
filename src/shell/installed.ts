// Installed shell artifacts, and whether they still say what this ward would
// say (design/0026-shell-staleness-doctor/).
//
// Ward emits and the human redirects (§18), which makes every installed file a
// SNAPSHOT: `ward shell init fish > conf.d/ward.fish` in August still defines
// August's shorthands in December, and the human-shell contract says the
// shorthand set is expected to churn. Churn that cannot be seen is churn that
// cannot be delivered, so the emission is re-obtained here — cheaply, in
// process — and compared byte for byte with what is installed.
//
// Byte comparison rather than a version marker on purpose: ward has sat at
// 0.1.0 across every entry that changed these files, so a version check would
// have detected nothing. Regenerating catches every drift, including the ones
// that come from a dependency (the completion driver is optique's).
//
// Nothing here writes, suggests writing over somebody's own file, or fails a
// command: this is one read of two paths, feeding doctor.
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { xdgConfigHome } from '../global/paths.ts';
import { reasonOf } from '../global/store.ts';
import { FISH_COMPLETION_MARKER, renderCompletionScript } from './completion.ts';
import { FISH_LAYER_MARKER } from './fish.ts';
import { emitShellLayer } from './layer.ts';

export type InstalledState =
  /** No file at the conventional path — not installing is a choice, not a fault. */
  | 'absent'
  /** Byte-identical to what this ward emits. */
  | 'current'
  /** Ward's emission, from an older ward — the one state worth a warning. */
  | 'stale'
  /** A file at the path that ward did not write; ward reports it, never overwrites it. */
  | 'foreign'
  | 'unreadable';

export interface InstalledArtifact {
  /** What the file is, in the human's words — 'fish shell layer'. */
  readonly what: string;
  readonly path: string;
  /** The command whose stdout belongs in that file. */
  readonly command: string;
  readonly state: InstalledState;
  /** Why the file could not be read (`unreadable` only). */
  readonly reason?: string;
}

export interface InstalledShellArtifacts {
  /**
   * Whether this machine keeps a fish configuration at all. False means
   * nothing to say: doctor stays silent rather than advertising a shell the
   * machine does not run.
   */
  readonly configured: boolean;
  readonly artifacts: readonly InstalledArtifact[];
}

/** Where fish reads its own configuration — `$XDG_CONFIG_HOME/fish`. */
export function fishConfigDir(env: Env = process.env): string {
  return join(xdgConfigHome(env), 'fish');
}

/**
 * The two conventional install sites, exactly the paths the README and the
 * emitted layer's own header tell the human to redirect into.
 */
export function fishArtifactSites(env: Env = process.env): readonly Site[] {
  const dir = fishConfigDir(env);
  return [
    {
      what: 'fish shell layer',
      path: join(dir, 'conf.d', 'ward.fish'),
      command: 'ward shell init fish',
      emit: () => emitShellLayer('fish'),
      marker: FISH_LAYER_MARKER,
    },
    {
      what: 'fish completions',
      path: join(dir, 'completions', 'ward.fish'),
      command: 'ward completion fish',
      emit: () => renderCompletionScript('fish'),
      marker: FISH_COMPLETION_MARKER,
    },
  ];
}

/** Read both sites and say, for each, how it stands against the emission. */
export async function inspectInstalledShellArtifacts(
  env: Env = process.env,
): Promise<InstalledShellArtifacts> {
  const sites = fishArtifactSites(env);
  return {
    configured: existsSync(fishConfigDir(env)),
    artifacts: await Promise.all(sites.map(inspectSite)),
  };
}

interface Site {
  readonly what: string;
  readonly path: string;
  readonly command: string;
  readonly emit: () => string;
  readonly marker: string;
}

type Env = Record<string, string | undefined>;

async function inspectSite(site: Site): Promise<InstalledArtifact> {
  const { what, path, command } = site;
  let installed: Buffer;
  try {
    installed = await readFile(path);
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return { what, path, command, state: 'absent' };
    }
    return { what, path, command, state: 'unreadable', reason: reasonOf(error) };
  }
  // Byte comparison, not a text one: an installed file that differs only in
  // its encoding differs, and saying otherwise would be a guess.
  if (installed.equals(Buffer.from(site.emit(), 'utf8'))) {
    return { what, path, command, state: 'current' };
  }
  return {
    what,
    path,
    command,
    state: installed.includes(site.marker) ? 'stale' : 'foreign',
  };
}
