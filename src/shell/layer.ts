// `ward shell init <shell>` (design/0025-fish-shell-layer/): the emitted
// layer of mnemonic shorthands — `wrr`, `wrcd`, `wwcd` — that work from any
// directory. Intent calls for exactly this ("the interactive layer adds
// mnemonic shorthands for common operations — thin plumbing, evolvable as
// telemetry reveals real usage", intent/02-subsystems/07-human-shell.md).
//
// Ward emits; the human installs. Writing into somebody's shell
// configuration unasked is not a thing Ward does (§18), so this verb prints
// to stdout and the redirect is theirs — the same contract
// `ward completion <shell>` already holds.
import { WardError } from '../errors.ts';
import { FISH_LAYER } from './fish.ts';

/**
 * The shells with a layer today. One entry, and the seam is the point: bash
 * and zsh are a second constant and a second row here, and nothing else — the
 * shorthands themselves are `ward` invocations, which every shell can make.
 */
const LAYERS: Record<string, string> = { fish: FISH_LAYER };

export const SHELL_LAYERS: readonly string[] = Object.keys(LAYERS);

/**
 * What `ward shell init <shell>` writes to stdout, byte for byte: the script
 * plus the trailing newline a line-oriented print adds. It is a function
 * rather than a fact the CLI knows privately because doctor compares an
 * installed file against these exact bytes
 * (design/0026-shell-staleness-doctor/) — one definition, so the emission and
 * the comparison cannot drift apart.
 */
export function emitShellLayer(shell: string): string {
  return `${renderShellLayer(shell)}\n`;
}

/** The script for a shell, or a refusal that names what does exist (§20). */
export function renderShellLayer(shell: string): string {
  const layer = LAYERS[shell];
  if (layer === undefined) {
    throw new WardError(
      `no shell layer for '${shell}' — available: ${SHELL_LAYERS.join(', ')} ` +
        '(the other shells are unbuilt, not unsupported)',
    );
  }
  return layer;
}
