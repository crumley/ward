// A task's brief as a typed artifact (design/0056-worktree-context-bridge/):
// written by `ward task brief`, read leniently, named by doctor when untyped
// or invalid, and reported by `ward task show` as `brief: {path, standing}` —
// the one place an agent finds its task's brief (design 0057: context loads
// downward from the root, and Ward writes nothing inside a worktree).
import { afterAll, beforeAll, beforeEach, expect, test } from 'bun:test';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { taskBriefShape, taskShowShape } from '../../src/cli/schema.ts';
import { readDocument } from '../../src/store/document.ts';
import { briefRecordType } from '../../src/store/types.ts';
import { readBrief, recordBrief } from '../../src/workspace/briefs.ts';
import { createWorkspace } from '../../src/workspace/create.ts';
import { runDoctor } from '../../src/workspace/doctor.ts';
import { git, gitOrThrow } from '../../src/workspace/git.ts';
import { openProject } from '../../src/workspace/projects.ts';
import { readTasks } from '../../src/workspace/scan.ts';
import { openSession } from '../../src/workspace/sessions.ts';
import { openTask } from '../../src/workspace/tasks.ts';
import {
  applyGitTestEnv,
  cliPath,
  GIT_ENV,
  makeTempDir,
  removeDir,
  runWard,
  WARD_GLOBAL_ENV,
} from '../helpers.ts';

// -- the brief: typed, one verb, lenient read --------------------------------

test('task brief records a typed brief in one commit', async () => {
  const commits = commitCount(ws);
  const report = await recordBrief(ws, 'f1t1', '# The handoff\n\nBuild it.\n', undefined);
  expect(report.path).toBe(`${taskDir}/brief.md`);
  expect(report.replaced).toBe(false);
  expect(commitCount(ws)).toBe(commits + 1);
  expect(committedNames(ws)).toEqual([`${taskDir}/brief.md`]);
  expect(lastSubject(ws)).toStartWith('Record brief for task f1t1');

  const stored = await readDocument(ws, briefRecordType(taskDir));
  expect(stored.data).toEqual({ type: 'brief', for: 'f1t1', createdAt: report.record.createdAt });
  expect(stored.body).toBe('# The handoff\n\nBuild it.\n');

  // Replace, never append; and handing the typed file back converges on itself.
  const again = await recordBrief(
    ws,
    'f1t1',
    readFileSync(join(ws, report.path), 'utf8'),
    undefined,
  );
  expect(again.replaced).toBe(true);
  expect((await readDocument(ws, briefRecordType(taskDir))).body).toBe(
    '# The handoff\n\nBuild it.\n',
  );
});

test('provenance is recorded only from a source that exists', async () => {
  const session = await openSession(ws, 'f1t1', 'brief it', {});
  const declared = await recordBrief(ws, 'f1t1', 'brief\n', session.id);
  expect(declared.record.session).toBe(session.id);
  const bare = await recordBrief(ws, 'f1t1', 'brief\n', '1'); // declared, but names no session
  expect(bare.record.session).toBeUndefined();
});

const refusals: readonly { name: string; text: string; message: string }[] = [
  { name: 'an empty file', text: '\n\n', message: 'a brief needs a body' },
  {
    name: 'front matter of another type',
    text: '---\ntype: note\n---\n\nbody\n',
    message: 'front matter that is not a brief',
  },
];
for (const { name, text, message } of refusals) {
  test(`task brief refuses ${name}, writing nothing`, async () => {
    const commits = commitCount(ws);
    await expect(recordBrief(ws, 'f1t1', text, undefined)).rejects.toThrow(message);
    expect(commitCount(ws)).toBe(commits);
    expect(existsSync(join(ws, taskDir, 'brief.md'))).toBe(false);
  });
}

test('an untyped brief still counts, doctor names it, and the verb types it in place', async () => {
  const path = `${taskDir}/brief.md`;
  writeFileSync(join(ws, path), '# Brief — hand-written\n\nThe old way.\n');
  gitOrThrow(ws, 'add', path);
  gitOrThrow(ws, 'commit', '-m', 'a brief from before the type');
  expect(await readBrief(ws, taskDir)).toEqual({ standing: 'untyped' });
  expect(briefFindings(await runDoctor(ws))).toEqual([
    {
      check: 'brief f1t1',
      severity: 'info',
      message:
        `${path} carries no front matter — it still serves as the brief; type it in place: ` +
        `ward task brief f1t1 ${path}`,
    },
  ]);

  const typed = runWard(['task', 'brief', 'f1t1', path, '--json'], ws);
  expect(typed.exitCode).toBe(0);
  const doc = taskBriefShape.parse(JSON.parse(typed.stdout));
  expect(doc).toMatchObject({ address: 'f1t1', path, for: 'f1t1', replaced: true });
  expect((await readDocument(ws, briefRecordType(taskDir))).body).toBe(
    '# Brief — hand-written\n\nThe old way.\n',
  );
  expect(briefFindings(await runDoctor(ws))).toEqual([]);
});

test('front matter that claims the type but fails it is a warning', async () => {
  writeFileSync(join(ws, taskDir, 'brief.md'), '---\ntype: brief\n---\n\nno for, no date\n');
  expect((await readBrief(ws, taskDir)).standing).toBe('invalid');
  expect(briefFindings(await runDoctor(ws)).map((finding) => finding.severity)).toEqual(['warn']);
});

test('the CLI reads the brief from stdin with -, and refuses a missing file', () => {
  const piped = Bun.spawnSync(['bun', cliPath, 'task', 'brief', 'f1t1', '-'], {
    cwd: ws,
    stdin: new TextEncoder().encode('# From a pipe\n'),
    env: cliEnv(),
  });
  expect(piped.exitCode).toBe(0);
  expect(piped.stdout.toString()).toContain('recorded the brief for f1t1');
  expect(readFileSync(join(ws, taskDir, 'brief.md'), 'utf8')).toEndWith('\n# From a pipe\n');

  const missing = runWard(['task', 'brief', 'f1t1', 'nowhere.md'], ws);
  expect(missing.exitCode).toBe(1);
  expect(missing.stderr).toContain("no file at 'nowhere.md'");
});

// -- task show: where the brief is, and how it reads (design 0057) -----------

const standings: readonly {
  standing: 'typed' | 'untyped' | 'invalid' | 'absent';
  file?: string;
  line: string;
}[] = [
  { standing: 'absent', line: 'none — record one with: ward task brief f1t1 FILE' },
  {
    standing: 'typed',
    file: '---\ntype: brief\nfor: f1t1\ncreatedAt: 2026-11-09T00:00:00.000Z\n---\n\nBuild it.\n',
    line: 'BRIEF',
  },
  {
    standing: 'untyped',
    file: '# Brief — hand-written\n',
    line: 'BRIEF (untyped — it still serves; type it: ward task brief f1t1 BRIEF)',
  },
  {
    standing: 'invalid',
    file: '---\ntype: brief\n---\n\nno for, no date\n',
    line: 'BRIEF (invalid front matter — see ward doctor)',
  },
];
for (const { standing, file, line } of standings) {
  test(`task show reports a ${standing} brief, in --json and on screen`, () => {
    const path = `${taskDir}/brief.md`;
    if (file !== undefined) writeFileSync(join(ws, path), file);
    const json = runWard(['task', 'show', 'f1t1', '--json'], ws);
    expect(json.exitCode).toBe(0);
    const doc = taskShowShape.parse(JSON.parse(json.stdout));
    expect(doc.brief).toEqual({ path, standing });
    const human = runWard(['task', 'show', 'f1t1'], ws);
    expect(human.exitCode).toBe(0);
    const shown = human.stdout.split('\n').find((row) => row.trimStart().startsWith('brief '));
    expect(shown?.trim().replace(/^brief\s+/, '')).toBe(line.replaceAll('BRIEF', path));
  });
}

// -- setup ------------------------------------------------------------------
// A fresh workspace per test with floor 1 `alpha` and task f1t1 `feature` on
// it.

let scratch: string;
let ws: string;
let taskDir: string;
let caseId = 0;

beforeAll(() => {
  applyGitTestEnv();
  scratch = makeTempDir();
});

beforeEach(async () => {
  caseId += 1;
  ws = join(scratch, `ws-${caseId}`);
  await createWorkspace(ws);
  await openProject(ws, 'alpha');
  taskDir = (await openTask(ws, 'feature', { floor: 1 })).dir;
  expect((await readTasks(ws)).length).toBe(1);
});

afterAll(() => {
  removeDir(scratch);
});

function cliEnv(): Record<string, string> {
  const env: Record<string, string | undefined> = {
    ...process.env,
    ...GIT_ENV,
    ...WARD_GLOBAL_ENV,
  };
  delete env.WARD_AGENT;
  delete env.NO_COLOR;
  delete env.FORCE_COLOR;
  return Object.fromEntries(
    Object.entries(env).filter((entry): entry is [string, string] => entry[1] !== undefined),
  );
}

function briefFindings(report: Awaited<ReturnType<typeof runDoctor>>) {
  return report.workspace.filter((finding) => finding.check.startsWith('brief '));
}

function commitCount(dir: string): number {
  return Number(gitOrThrow(dir, 'rev-list', '--count', 'HEAD').stdout.trim());
}

function committedNames(dir: string): string[] {
  return gitOrThrow(dir, 'show', '--name-only', '--format=', 'HEAD')
    .stdout.trim()
    .split('\n')
    .sort();
}

function lastSubject(dir: string): string {
  return git(dir, 'log', '-1', '--format=%s').stdout.trim();
}
