// The completion script, re-obtainable in process
// (design/0026-shell-staleness-doctor/). `ward completion <shell>` is
// optique's own subcommand — `completion: 'command'` in `src/cli/index.ts`
// generates the script and answers the per-TAB callback
// (design/0022-shell-completion/) — so nothing in Ward held the emitted bytes
// until doctor needed to compare an installed file against them.
//
// This module re-renders exactly what that subcommand prints, from the same
// generator, so the comparison is against the running ward's own emission and
// not against a copy that could drift. The two couplings to optique's facade
// — the arguments the generated driver calls back with, and the trailing
// newline its `stdout` writer adds — are pinned by a test that spawns
// `ward completion fish` and compares byte for byte.
import { fish } from '@optique/core/completion';
import { WardError } from '../errors.ts';

/**
 * The identifying string ward's emitted fish completion script carries.
 * optique names the driver function after the program (`__<program>_complete`)
 * and the script calls `ward completion fish` back on every TAB — so the
 * script says whose it is without a header of ours. See the design entry's
 * "no header on the completion script" decision.
 */
export const FISH_COMPLETION_MARKER = '__ward_complete';

/** The shells `ward completion <shell>` is asked about here. */
const GENERATORS = { fish } as const;

export const COMPLETION_SHELLS: readonly string[] = Object.keys(GENERATORS);

/**
 * What `ward completion <shell>` prints, byte for byte: the generated script
 * plus the newline optique's line-oriented `stdout` writer appends.
 */
export function renderCompletionScript(shell: string): string {
  const generator = GENERATORS[shell as keyof typeof GENERATORS];
  if (generator === undefined) {
    throw new WardError(
      `no completion script for '${shell}' — available: ${COMPLETION_SHELLS.join(', ')}`,
    );
  }
  return `${generator.generateScript('ward', ['completion', shell])}\n`;
}
