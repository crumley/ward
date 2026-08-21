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
  return chosen(env.WARD_CONFIG_DIR, xdgConfigHome(env));
}

/** Machine state — the workspace registry and its lock. */
export function stateDir(env: Env = process.env): string {
  return chosen(env.WARD_STATE_DIR, base(env.XDG_STATE_HOME, join(homedir(), '.local', 'state')));
}

/**
 * The per-user configuration root itself — `$XDG_CONFIG_HOME`, default
 * `~/.config`. Ward's own preferences live in `ward/` under it (above), but
 * OTHER tools' directories under the same root are Ward's business too: the
 * emitted shell layer and completions are installed into
 * `$XDG_CONFIG_HOME/fish/`, and doctor reads them from there
 * (design/0026-shell-staleness-doctor/). Exported so that one function
 * decides where the root is, and one environment variable moves it — which is
 * also the seam that keeps tests off the developer's real `~/.config`.
 */
export function xdgConfigHome(env: Env = process.env): string {
  return base(env.XDG_CONFIG_HOME, join(homedir(), '.config'));
}

type Env = Record<string, string | undefined>;

/** A relative `XDG_*_HOME` is ignored, as the XDG basedir spec requires. */
function base(xdgHome: string | undefined, fallback: string): string {
  return xdgHome !== undefined && isAbsolute(xdgHome) ? xdgHome : fallback;
}

function chosen(override: string | undefined, xdgBase: string) {
  if (override !== undefined && override !== '') return override;
  return join(xdgBase, 'ward');
}
