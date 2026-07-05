// The CLI prints its version — from package.json, the single source of truth —
// for `ward --version`, `ward -v`, and a bare `ward` (design/0001-dev-foundation/).
import { expect, test } from 'bun:test';
import pkg from '../../package.json' with { type: 'json' };

const cases: ReadonlyArray<{ argv: string[]; name: string }> = [
  { argv: ['--version'], name: 'ward --version prints the version' },
  { argv: ['-v'], name: 'ward -v prints the version' },
  { argv: [], name: 'bare ward prints the version' },
];

for (const { argv, name } of cases) {
  test(name, () => {
    const { exitCode, stdout } = runWard(argv);
    expect(exitCode).toBe(0);
    expect(stdout).toContain(`ward ${pkg.version}`);
  });
}

test('the version printed is exactly package.json version', () => {
  const { stdout } = runWard(['--version']);
  expect(stdout.trim()).toBe(`ward ${pkg.version}`);
});

// -- setup ---------------------------------------------------------------

const repoRoot = new URL('../..', import.meta.url).pathname;

function runWard(argv: string[]): { exitCode: number; stdout: string } {
  const result = Bun.spawnSync(['bun', 'src/cli/index.ts', ...argv], { cwd: repoRoot });
  return { exitCode: result.exitCode, stdout: result.stdout.toString() };
}
