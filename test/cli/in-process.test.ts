// The CLI run in-process (design/0074-in-process-cli-tests/): runs started
// together in one process never see each other's environment, directory,
// palette or output, and leave the caller's process exactly as they found it.
// The parity suite (parity.test.ts) holds what each run answers to what a
// spawned `ward` answers; this file holds that runs do not leak into each
// other or into their caller.
import { afterAll, beforeAll, expect, test } from 'bun:test';
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runCli } from '../../src/cli/in-process.ts';
import { createWorkspace } from '../../src/workspace/create.ts';
import { openProject } from '../../src/workspace/projects.ts';
import {
  applyGitTestEnv,
  callWard,
  callWardEnv,
  makeTempDir,
  removeDir,
  runWard,
} from '../helpers.ts';

const ESC = '\u001b[';

test('runs started together each answer from their own directory and environment', async () => {
  // Four workspaces, each with a floor named for it, each asked by a caller
  // declaring a different session: under any overlap, a run would read
  // another's directory (its floor) or environment (its caller).
  const asked = Array.from({ length: 16 }, (_, i) => {
    const n = i % spaces.length;
    return callWardEnv(['status', '--json'], spaces[n] as string, {
      WARD_AGENT: `agent-${n}`,
      NO_COLOR: '1',
    }).then((result) => ({ n, result }));
  });
  for (const { n, result } of await Promise.all(asked)) {
    expect(result.exitCode).toBe(0);
    const report = JSON.parse(result.stdout);
    expect(report.projects.map((p: { slug: string }) => p.slug)).toContain(`floor-of-${n}`);
  }
  // The caller each run saw is the one its telemetry row recorded at exit.
  for (const [n, root] of spaces.entries()) {
    const rows = telemetryRows(root).filter((row) => row.verb === 'status');
    expect(rows.length).toBe(4);
    expect(new Set(rows.map((row) => row.agent))).toEqual(new Set([`agent-${n}`]));
    expect(new Set(rows.map((row) => row.cwd))).toEqual(new Set([root]));
  }
});

test('the palette is chosen per run: color, then none, then color, in one module', async () => {
  const [colored, plain, agent, again] = await Promise.all([
    callWardEnv(['--version'], scratch, { FORCE_COLOR: '1' }),
    callWardEnv(['--version'], scratch, { NO_COLOR: '1' }),
    callWardEnv(['--version'], scratch, { FORCE_COLOR: '1', WARD_AGENT: '1' }),
    callWardEnv(['--version'], scratch, { FORCE_COLOR: '1' }),
  ]);
  expect(colored.stdout).toContain(ESC);
  expect(plain.stdout).toBe('ward 0.1.0\n');
  expect(agent.stdout).toBe('ward 0.1.0\n');
  expect(again.stdout).toBe(colored.stdout);
});

test("a run's exit, refusal or crash stays its own: the next run answers whole", async () => {
  const [help, usage, refused, after] = await Promise.all([
    callWard(['--help'], scratch),
    callWard(['task', 'nonesuch'], scratch),
    callWardEnv(['status'], scratch, { WARD_AGENT: '1' }),
    callWard(['--version'], scratch),
  ]);
  expect(help.exitCode).toBe(0);
  expect(help.stdout).toStartWith('Usage: ward');
  expect(usage.exitCode).toBe(1);
  expect(usage.stdout).toBe('');
  expect(refused.exitCode).toBe(1);
  expect(refused.stderr).toStartWith('error: no Ward workspace encloses this directory');
  expect(after).toEqual({ exitCode: 0, stdout: 'ward 0.1.0\n', stderr: '' });

  // A run whose directory is gone never starts, and takes nothing with it.
  await expect(
    runCli({ argv: ['--version'], cwd: join(scratch, 'nowhere'), env: process.env }),
  ).rejects.toThrow();
  expect((await callWard(['--version'], scratch)).stdout).toBe('ward 0.1.0\n');
});

test("the caller's environment, directory and console are back after every run", async () => {
  const env = { ...process.env };
  const cwd = process.cwd();
  const { log, info, error, warn } = console;
  await Promise.all([
    callWardEnv(['status'], spaces[0] as string, { WARD_AGENT: 'x', EXTRA: 'only-in-the-run' }),
    callWard(['nonesuch'], spaces[1] as string),
    callWard(['schema'], spaces[2] as string),
  ]);
  expect(process.env).toEqual(env);
  expect(process.env.EXTRA).toBeUndefined();
  expect(process.cwd()).toBe(cwd);
  expect({ log, info, error, warn }).toEqual({
    log: console.log,
    info: console.info,
    error: console.error,
    warn: console.warn,
  });
});

test('stdin and a terminal are the request’s, never the process’s', async () => {
  const brief = '# A brief from stdin\n\nRead whole.\n';
  const opened = await callWard(['task', 'open', 'from-stdin', '--json'], spaces[3] as string);
  const address = JSON.parse(opened.stdout).address;
  const [piped, tty, pipe] = await Promise.all([
    callWard(['task', 'brief', address, '-'], spaces[3] as string, { stdin: brief }),
    callWardEnv(['project', 'list', '--json'], spaces[3] as string, {}, { tty: true }),
    callWardEnv(['project', 'list', '--json'], spaces[3] as string, {}),
  ]);
  expect(piped.exitCode).toBe(0);
  const shown = JSON.parse(
    (await callWard(['task', 'show', address, '--json'], spaces[3] as string)).stdout,
  );
  expect(readFileSync(join(spaces[3] as string, shown.brief.path), 'utf8')).toContain(brief);
  // Indented for a terminal, compact for a pipe (design/0050-compact-json-for-pipes/).
  expect(tty.stdout).toStartWith('{\n  "');
  expect(pipe.stdout).toStartWith('{"');
});

test('in-process and spawned runs of the same invocation agree, whichever runs first', async () => {
  const root = spaces[0] as string;
  const spawned = runWard(['project', 'list'], root);
  const called = await callWard(['project', 'list'], root);
  expect(called).toEqual(spawned);
  expect(runWard(['project', 'list'], root)).toEqual(called);
});

// -- fixtures -------------------------------------------------------------

let scratch: string;
const spaces: string[] = [];

beforeAll(async () => {
  applyGitTestEnv();
  scratch = makeTempDir();
  for (const n of [0, 1, 2, 3]) {
    const root = join(scratch, `space-${n}`);
    mkdirSync(root);
    await createWorkspace(root);
    await openProject(root, `floor-of-${n}`, {});
    spaces.push(root);
  }
});

afterAll(() => removeDir(scratch));

interface Row {
  readonly verb: string;
  readonly agent?: string;
  readonly cwd: string;
}

function telemetryRows(root: string): Row[] {
  const dir = join(root, '.ward', 'telemetry');
  const month = new Date().toISOString().slice(0, 7);
  return readFileSync(join(dir, `usage-${month}.jsonl`), 'utf8')
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line) as Row);
}
