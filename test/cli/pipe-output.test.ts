// Output larger than a pipe's buffer arrives whole (design/0048-pipe-safe-output/).
// Each row writes a document well past 64 KiB into a pipe whose reader waits
// before it reads — the shape of `ward … --json | jq` when jq is slower than
// ward — and asserts the reader gets every byte, the document parses, and the
// exit code is the one the writer chose. Before 0048 each row read exactly
// 65536 bytes: the rest was dropped on the floor.
import { afterAll, beforeAll, expect, test } from 'bun:test';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { cliPath, GIT_ENV, makeTempDir, NO_GH, removeDir, WARD_GLOBAL_ENV } from '../helpers.ts';

const PIPE_BUFFER = 64 * 1024;

const rows: { name: string; argv: () => string[]; exitCode: number }[] = [
  // A real verb, ending naturally: the schema document is the largest one
  // ward emits without a workspace, and it touches no record.
  { name: 'ward schema (natural exit)', argv: () => ['bun', cliPath, 'schema'], exitCode: 0 },
  // The flushed exit: a console write followed at once by a nonzero exit,
  // the shape of `doctor --json` on an unhealthy workspace.
  { name: 'console.log then exitWhenFlushed(3)', argv: () => ['bun', fixture], exitCode: 3 },
];

for (const row of rows) {
  test(`${row.name}: a document past the pipe buffer arrives whole`, () => {
    const result = throughSlowPipe(row.argv());
    expect(result.exitCode).toBe(row.exitCode);
    expect(result.stdout.length).toBeGreaterThan(PIPE_BUFFER);
    expect(() => JSON.parse(result.stdout)).not.toThrow();
  });
}

// -- scaffolding -------------------------------------------------------------

let dir: string;
let fixture: string;

beforeAll(() => {
  dir = makeTempDir();
  fixture = join(dir, 'writer.ts');
  const output = new URL('../../src/cli/output.ts', import.meta.url).pathname;
  // Reading `isTTY` constructs process.stdout, which is what flips the pipe
  // non-blocking under Bun — the argument parser does the same on every run.
  writeFileSync(
    fixture,
    `import { exitWhenFlushed, installPipeSafeConsole } from ${JSON.stringify(output)};
installPipeSafeConsole();
void process.stdout.isTTY;
console.log(JSON.stringify({ rows: Array.from({ length: 4000 }, (_, i) => 'row ' + i + ' '.repeat(40)) }));
await exitWhenFlushed(3);
`,
  );
});

afterAll(() => removeDir(dir));

/**
 * Run argv with stdout into a pipe whose reader sleeps before reading, so the
 * writer fills the pipe and has to wait for it. The writer's own exit code is
 * carried out through a file, since the pipeline's is the reader's.
 */
function throughSlowPipe(argv: string[]): { exitCode: number; stdout: string } {
  const codeFile = join(dir, 'code');
  const result = Bun.spawnSync(
    ['sh', '-c', '{ "$@"; echo $? > "$CODE_FILE"; } | { sleep 0.5; cat; }', 'sh', ...argv],
    {
      cwd: dir,
      env: {
        ...process.env,
        NO_COLOR: '1',
        WARD_GH: NO_GH,
        CODE_FILE: codeFile,
        ...GIT_ENV,
        ...WARD_GLOBAL_ENV,
      },
    },
  );
  return {
    exitCode: Number(readFileSync(codeFile, 'utf8').trim()),
    stdout: result.stdout.toString(),
  };
}
