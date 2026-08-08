// The declared agent caller (design/0005-agent-audience/): WARD_AGENT is the
// ambient signal; a declared agent gets deterministic, ANSI-free output even
// where the environment (FORCE_COLOR, CI) would negotiate color for a human.
// Absence of the signal *is* "human" — nothing more is asked of them
// (intent/02-subsystems/07-human-shell.md).
import { afterAll, beforeAll, expect, test } from 'bun:test';
import { callerIsAgent } from '../../src/cli/caller.ts';
import { makeTempDir, removeDir, runWardEnv } from '../helpers.ts';

const rows: readonly { name: string; env: Record<string, string>; ansi: boolean }[] = [
  { name: 'a human under FORCE_COLOR gets color', env: { FORCE_COLOR: '1' }, ansi: true },
  {
    name: 'a declared agent gets none, even under FORCE_COLOR',
    env: { FORCE_COLOR: '1', WARD_AGENT: '1' },
    ansi: false,
  },
  {
    name: 'a session id declares just as well as a 1',
    env: { FORCE_COLOR: '1', WARD_AGENT: 'agent-audience-1' },
    ansi: false,
  },
  {
    name: 'an empty WARD_AGENT is no declaration',
    env: { FORCE_COLOR: '1', WARD_AGENT: '' },
    ansi: true,
  },
];

for (const row of rows) {
  test(row.name, () => {
    const result = runWardEnv([], dir, row.env);
    expect(result.exitCode).toBe(0);
    expect(result.stdout.includes('\u001b[')).toBe(row.ansi);
  });
}

test('the predicate itself: presence of a non-empty WARD_AGENT is the declaration', () => {
  expect(callerIsAgent({})).toBe(false);
  expect(callerIsAgent({ WARD_AGENT: '' })).toBe(false);
  expect(callerIsAgent({ WARD_AGENT: '1' })).toBe(true);
  expect(callerIsAgent({ WARD_AGENT: 'agent-audience-1' })).toBe(true);
});

// -- setup ----------------------------------------------------------------
// Bare `ward` (the colored version line) needs no workspace, so the rows run
// anywhere; what varies is only the environment.

let dir: string;

beforeAll(() => {
  dir = makeTempDir();
});

afterAll(() => {
  removeDir(dir);
});
