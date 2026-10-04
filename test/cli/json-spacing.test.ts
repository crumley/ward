// How a --json document is spaced (design/0050-compact-json-for-pipes/):
// indented only for a human at a terminal, compact for a pipe, a file, or a
// declared agent anywhere. The decision is a pure function of the caller, so
// the TTY rows are proven on it directly; the piped rows are proven end to end
// through the spawned CLI, whose stdout is a pipe.
import { afterAll, beforeAll, expect, test } from 'bun:test';
import { jsonSpacing } from '../../src/cli/json.ts';
import { makeTempDir, removeDir, runWardEnv } from '../helpers.ts';

const decisions: readonly { name: string; isTTY: boolean; isAgent: boolean; spacing: 0 | 2 }[] = [
  { name: 'a human at a terminal reads it indented', isTTY: true, isAgent: false, spacing: 2 },
  {
    name: 'a declared agent at a terminal gets it compact',
    isTTY: true,
    isAgent: true,
    spacing: 0,
  },
  { name: 'a human piping it gets it compact', isTTY: false, isAgent: false, spacing: 0 },
  { name: 'a declared agent piping it gets it compact', isTTY: false, isAgent: true, spacing: 0 },
];

for (const row of decisions) {
  test(`jsonSpacing: ${row.name}`, () => {
    expect(jsonSpacing(row.isTTY, row.isAgent)).toBe(row.spacing);
  });
}

const piped: readonly { name: string; env: Record<string, string> }[] = [
  { name: 'a human caller', env: {} },
  { name: 'a declared agent', env: { WARD_AGENT: '1' } },
];

for (const row of piped) {
  test(`piped --json from ${row.name} is one compact, newline-terminated line`, () => {
    const result = runWardEnv(['schema'], dir, row.env);
    expect(result.exitCode).toBe(0);
    expect(result.stdout.endsWith('}\n')).toBe(true);
    expect(result.stdout.slice(0, -1)).not.toContain('\n');
    // Compact is the same document, minus only the whitespace.
    const parsed = JSON.parse(result.stdout);
    expect(result.stdout).toBe(`${JSON.stringify(parsed)}\n`);
  });
}

test('compact output is byte-identical across runs (§6)', () => {
  const first = runWardEnv(['schema'], dir, {});
  const second = runWardEnv(['schema'], dir, { WARD_AGENT: '1' });
  expect(first.stdout).toBe(second.stdout);
});

let dir: string;

beforeAll(() => {
  dir = makeTempDir();
});

afterAll(() => {
  removeDir(dir);
});
