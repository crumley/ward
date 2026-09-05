// The exit question's rule (design/0038-machine-bound-sessions/), as a table.
// The whole asymmetry lives in one pure function, so "who may be asked, and
// what does Enter mean?" is answered here rather than inferred from the
// rendering: an agent, a `--json` invocation, and every caller without a
// terminal keep the deterministic still-open behavior they have always had.
import { expect, test } from 'bun:test';
import {
  type ExitDecision,
  type ExitHistory,
  exitDecision,
  type OnExit,
} from '../../src/cli/session-exit.ts';

const HUMAN = { tty: true, agent: false, json: false, onExit: 'ask' as OnExit };

const CASES: readonly [string, Partial<typeof HUMAN> & { history: ExitHistory }, ExitDecision][] = [
  // A human at a terminal, asked — the default follows what the run left.
  ['no history: the empty session, default yes', { history: 'gone' }, 'ask-default-yes'],
  ['a real transcript: default no', { history: 'found' }, 'ask-default-no'],
  ['nothing to look for: default no', { history: 'unlocatable' }, 'ask-default-no'],
  // Nobody else is ever asked.
  ['a declared agent is never asked', { history: 'gone', agent: true }, 'keep'],
  ['--json is never asked', { history: 'gone', json: true }, 'keep'],
  ['a pipe is never asked', { history: 'gone', tty: false }, 'keep'],
  // Pre-answering needs no terminal: the human already said it.
  ['--on-exit keep, at a terminal', { history: 'gone', onExit: 'keep' }, 'keep'],
  ['--on-exit close, at a terminal', { history: 'found', onExit: 'close' }, 'close'],
  ['--on-exit close, from a script', { history: 'gone', onExit: 'close', tty: false }, 'close'],
  ['--on-exit close, from an agent', { history: 'gone', onExit: 'close', agent: true }, 'close'],
  ['--on-exit close, under --json', { history: 'gone', onExit: 'close', json: true }, 'close'],
];

test.each(CASES)('%s', (_why, situation, expected) => {
  expect(exitDecision({ ...HUMAN, ...situation })).toBe(expected);
});
