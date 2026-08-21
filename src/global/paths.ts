// Where Ward's per-user state lives (design/0024-global-config-registry/).
// Two directories, because the two kinds of file have different lifetimes and
// different owners:
//
//   $XDG_CONFIG_HOME/ward/   — preferences: written by a human (or, later, a
//                              guided setup), read by every invocation.
//   $XDG_STATE_HOME/ward/    — machine state: the workspace registry, which
//                              Ward rewrites as workspaces are registered and
//                              used. Frequently-rewritten, never hand-tended,
//                              and safe to delete.
//
// Both hold ONLY preferences and conveniences — nothing the understanding or
// resumption of work depends on (intent/01-concepts/06-workspace-lifecycle.md,
// the global-state boundary). Delete either and every workspace is intact.
import { homedir } from 'node:os';
import { isAbsolute, join } from 'node:path';

/**
 * Preferences. `WARD_CONFIG_DIR` overrides everything — it is the seam that
 * keeps tests hermetic (no test ever reads the machine's real `$HOME`) and
 * the escape hatch for a human who keeps their configuration elsewhere.
 * A relative `XDG_CONFIG_HOME` is ignored, as the XDG basedir spec requires.
 */
export function configDir(env: Env = process.env): string {
  return chosen(env.WARD_CONFIG_DIR, env.XDG_CONFIG_HOME, join(homedir(), '.config'));
}

/** Machine state — the workspace registry and its lock. */
export function stateDir(env: Env = process.env): string {
  return chosen(env.WARD_STATE_DIR, env.XDG_STATE_HOME, join(homedir(), '.local', 'state'));
}

type Env = Record<string, string | undefined>;

function chosen(override: string | undefined, xdgHome: string | undefined, fallback: string) {
  if (override !== undefined && override !== '') return override;
  return join(xdgHome !== undefined && isAbsolute(xdgHome) ? xdgHome : fallback, 'ward');
}
