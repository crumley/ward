// The spawn smoke suite (design/0074-in-process-cli-tests/): every top-level
// verb group answered once by the real binary, as a shell runs it — a fresh
// runtime, the bin file executed by its own shebang, exit codes as the
// operating system reports them, stdin piped, output read off pipes. Most CLI
// tests call `ward` in-process (test/helpers.ts callWard); this is the file
// that keeps the real entry honest, and parity.test.ts holds the two modes to
// the same bytes.
import { afterAll, beforeAll, expect, test } from 'bun:test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import pkg from '../../package.json' with { type: 'json' };
import { createWorkspace } from '../../src/workspace/create.ts';
import {
  applyGitTestEnv,
  cliPath,
  GIT_ENV,
  makeTempDir,
  NO_GH,
  removeDir,
  WARD_GLOBAL_ENV,
} from '../helpers.ts';

/** One invocation per verb group: what it says, and a line its answer must carry. */
const GROUPS: ReadonlyArray<{ argv: string[]; exitCode: number; carries: string }> = [
  { argv: [], exitCode: 0, carries: `ward ${pkg.version} — ` },
  { argv: ['--version'], exitCode: 0, carries: `ward ${pkg.version}` },
  { argv: ['--help'], exitCode: 0, carries: 'Usage: ward workspace create' },
  { argv: ['workspace', 'list'], exitCode: 0, carries: '' },
  { argv: ['repo', 'list', '--json'], exitCode: 0, carries: '[]' },
  { argv: ['project', 'list'], exitCode: 0, carries: 'floor 0 — 🔧 workspace (ground floor)' },
  { argv: ['reflection', 'packet', '9'], exitCode: 1, carries: 'error: ' },
  { argv: ['task', 'open', 'smoke', '--json'], exitCode: 0, carries: '"address":"f0t1"' },
  { argv: ['worktree', 'list'], exitCode: 0, carries: '' },
  { argv: ['session', 'show', 'nonesuch'], exitCode: 1, carries: 'error: ' },
  { argv: ['status'], exitCode: 0, carries: 'floor 0 — 🔧 workspace' },
  { argv: ['doctor', '--json'], exitCode: 0, carries: '"healthy":true' },
  { argv: ['context'], exitCode: 0, carries: 'AGENTS.md' },
  { argv: ['schema', 'status'], exitCode: 0, carries: '"$schema"' },
  { argv: ['shell', 'init', 'fish'], exitCode: 0, carries: 'function wrr' },
  { argv: ['completion', 'bash'], exitCode: 0, carries: 'complete' },
  { argv: ['task', 'nonesuch'], exitCode: 1, carries: 'Usage: ward' },
];

for (const { argv, exitCode, carries } of GROUPS) {
  test(`the real binary answers: ward ${argv.join(' ')}`, () => {
    const result = spawn(argv);
    expect(result.exitCode).toBe(exitCode);
    expect(exitCode === 0 ? result.stdout : result.stderr).toContain(carries);
  });
}

test('a piped stdin reaches a `-` argument', () => {
  expect(spawn(['task', 'open', 'piped']).exitCode).toBe(0);
  const recorded = spawn(['task', 'brief', 'f0t2', '-'], '# Piped\n');
  expect(recorded.exitCode).toBe(0);
  expect(recorded.stdout).toContain('recorded the brief for f0t2');
});

test('imported rather than run, the entry answers nothing until main is called', () => {
  const imported = Bun.spawnSync(['bun', '-e', `await import(${JSON.stringify(cliPath)})`], {
    cwd: ws,
    env: env(),
  });
  expect(imported.exitCode).toBe(0);
  expect(imported.stdout.toString()).toBe('');
  expect(imported.stderr.toString()).toBe('');
});

// -- fixtures -------------------------------------------------------------

let scratch: string;
let ws: string;

beforeAll(async () => {
  applyGitTestEnv();
  scratch = makeTempDir();
  ws = join(scratch, 'ws');
  mkdirSync(ws);
  await createWorkspace(ws);
});

afterAll(() => removeDir(scratch));

function env(): Record<string, string | undefined> {
  return { ...process.env, NO_COLOR: '1', WARD_GH: NO_GH, ...GIT_ENV, ...WARD_GLOBAL_ENV };
}

/** The bin file, executed by its own shebang — the way a shell runs `ward`. */
function spawn(argv: string[], stdin?: string) {
  const result = Bun.spawnSync([cliPath, ...argv], {
    cwd: ws,
    env: env(),
    ...(stdin === undefined ? {} : { stdin: Buffer.from(stdin) }),
  });
  return {
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  };
}
