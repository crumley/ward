// What happens the moment a foreground agent run exits
// (design/0038-machine-bound-sessions/). An exit is not a close — that stays
// true (intent/01-concepts/02-sessions-and-lifecycle.md, open ≠ running) — but
// the human who just left the run is demonstrably present, standing at the
// terminal Ward has taken back, and is the only party entitled to say whether
// the thread is done. So Ward asks them, once, and never asks anyone else.
//
// The decision is a PURE FUNCTION of four facts, separated from the asking so
// that "when is a question allowed?" is table-testable and cannot drift into
// the rendering. Everything the two-audiences asymmetry demands (§8;
// design/0005-agent-audience/) lives in that one function: a declared agent,
// a `--json` invocation, or any non-TTY caller is never asked, and the
// session stays open exactly as it did before this entry existed.
import { createInterface } from 'node:readline';

/** `--on-exit`: the answer given in advance, for a human who already knows it. */
export type OnExit = 'ask' | 'keep' | 'close';

/** Whether the run left a harness history behind — the answer's whole basis. */
export type ExitHistory = 'found' | 'gone' | 'unlocatable';

/**
 * What the moment after the run calls for. The two `ask-` values carry their
 * DEFAULT, because a question whose default is wrong is worse than no
 * question: it turns Enter — the key a tired human presses — into a decision
 * they did not make.
 */
export type ExitDecision = 'ask-default-yes' | 'ask-default-no' | 'keep' | 'close';

export interface ExitSituation {
  readonly history: ExitHistory;
  /** Both stdin and stdout are terminals: someone is there to answer. */
  readonly tty: boolean;
  /** The caller declared itself an agent (WARD_AGENT). */
  readonly agent: boolean;
  readonly json: boolean;
  readonly onExit: OnExit;
}

/**
 * The rule, stated once:
 *
 * - `--on-exit close|keep` is the human's answer given in advance, and it is
 *   honored for every caller — a pre-answered question needs no terminal, and
 *   `close` is exactly "don't make me do an extra thing" for someone who knows
 *   they are bouncing out of an empty run.
 * - `ask` (the default) degrades to `keep` wherever asking is impossible or
 *   forbidden: no agent, no `--json` invocation, and no caller whose stdin or
 *   stdout is not a terminal is ever blocked on a prompt.
 * - Where it may ask, the default follows the evidence. `gone` means the run
 *   left NO history — nothing to resume, the empty session — so the default is
 *   yes. Anything else (a real transcript, or a handle this build cannot
 *   resolve) defaults to no: keeping an open session costs a line in `ward
 *   status`, and closing one the human still wanted costs a thread.
 */
export function exitDecision(situation: ExitSituation): ExitDecision {
  if (situation.onExit === 'close') return 'close';
  if (situation.onExit === 'keep') return 'keep';
  if (situation.agent || situation.json || !situation.tty) return 'keep';
  return situation.history === 'gone' ? 'ask-default-yes' : 'ask-default-no';
}

/**
 * Ask the one question and read the one answer. `y`/`n` (either case) answer
 * it; Enter takes the default; EOF keeps the session open, because a stream
 * that ended said nothing and Ward never reads silence as consent (closing
 * stays deliberate — the intent's guarantee, which a default accepted by a
 * present human does not violate and a default accepted by a closed pipe
 * would).
 */
export async function askToClose(prompt: string, defaultYes: boolean): Promise<boolean> {
  process.stdout.write(`${prompt} ${defaultYes ? '[Y/n]' : '[y/N]'} `);
  const answer = await readLine();
  process.stdout.write('\n');
  if (answer === null) return false;
  const trimmed = answer.trim().toLowerCase();
  if (trimmed === '') return defaultYes;
  return trimmed.startsWith('y');
}

/** One line from stdin, or null at end of input. */
async function readLine(): Promise<string | null> {
  const reader = createInterface({ input: process.stdin });
  try {
    for await (const line of reader) return line;
    return null;
  } finally {
    reader.close();
    process.stdin.pause();
  }
}
