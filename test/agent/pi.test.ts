// The pi adapter (design/0044-pi-harness/): argv construction, the handle, and
// history resolution — the whole seam surface, proven without ever spawning
// the real CLI. The argv table is parity with claude made checkable: an absent
// key omits its flag ENTIRELY (0028's "omitted means omitted"), `agent.args`
// rides last so a human's flags get the final word, and the one deliberate
// difference — thinking depth is `--thinking`, not `--effort` — is pinned.
// History lives in a per-cwd directory pi names on its own scheme, one file
// per session, which is the other thing the seam absorbs.
import { expect, test } from 'bun:test';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { harnessCommand } from '../../src/harness/adapter.ts';
import {
  DEFAULT_PI_COMMAND,
  locatePiRun,
  piAdapter,
  piHandle,
  piNativeId,
  piResumeArgv,
  piSessionDir,
  piSessionDirName,
  piStartArgv,
} from '../../src/harness/pi.ts';

const ID = '019218c4-7e4d-7a1f-9f4c-1d2e3f4a5b6c';

test('start argv: every key that resolved, in order — thinking, not effort', () => {
  const table: ReadonlyArray<[string, Parameters<typeof piStartArgv>[0], string[]]> = [
    ['nothing configured', { nativeId: ID, args: [] }, ['--session-id', ID]],
    [
      'model alone — no --thinking anywhere in the line',
      { nativeId: ID, model: 'anthropic/claude-sonnet', args: [] },
      ['--session-id', ID, '--model', 'anthropic/claude-sonnet'],
    ],
    [
      'effort maps to --thinking, pi’s own word',
      { nativeId: ID, effort: 'high', args: [] },
      ['--session-id', ID, '--thinking', 'high'],
    ],
    [
      'both, plus args last — the human gets the final word',
      { nativeId: ID, model: 'openai/gpt-5', effort: 'low', args: ['--no-approve', '--verbose'] },
      [
        '--session-id',
        ID,
        '--model',
        'openai/gpt-5',
        '--thinking',
        'low',
        '--no-approve',
        '--verbose',
      ],
    ],
    [
      'args alone, with nothing of Ward’s but the id',
      { nativeId: ID, args: ['--offline'] },
      ['--session-id', ID, '--offline'],
    ],
  ];
  for (const [name, request, expected] of table) {
    expect(piStartArgv(request), name).toEqual(expected);
  }
});

test('resume argv: --session, the args, and never a model or a thinking level', () => {
  expect(piResumeArgv(ID, [])).toEqual(['--session', ID]);
  expect(piResumeArgv(ID, ['--no-approve'])).toEqual(['--session', ID, '--no-approve']);
  // A resumed run restores what it was saved with; passing today's
  // configuration would silently re-model an old conversation mid-thread.
  expect(piResumeArgv(ID, ['--model', 'openai/gpt-5']).indexOf('--model')).toBe(2); // only a human's own arg
});

test('the handle is the harness plus its native id, and reads back', () => {
  expect(piHandle(ID)).toBe(`pi:${ID}`);
  const table: ReadonlyArray<[string, string | null]> = [
    [`pi:${ID}`, ID],
    ['pi:run', 'run'],
    ['pi:', null], // a prefix with nothing after it names no run
    ['claude:abc', null], // another harness's handle is not this adapter's to read
    [ID, null], // a bare id says nothing about which harness minted it
  ];
  for (const [handle, expected] of table) {
    expect(piNativeId(handle), handle).toBe(expected);
  }
});

test('the session directory: per-cwd under the agent dir, its own name scheme', () => {
  // Every `/`, `\`, or `:` becomes a dash, wrapped in `--…--`; other
  // characters (dots, underscores) survive, unlike claude's munge.
  const table: ReadonlyArray<[string, string]> = [
    ['/home/ryan/w/ws', '--home-ryan-w-ws--'],
    ['/tmp/ward_test-1', '--tmp-ward_test-1--'],
    ['/a/b.c', '--a-b.c--'],
  ];
  for (const [cwd, name] of table) {
    expect(piSessionDirName(cwd), cwd).toBe(name);
  }
  // A relative cwd is resolved first: the address is the ABSOLUTE directory.
  expect(piSessionDirName('.')).toBe(piSessionDirName(process.cwd()));

  // PI_CODING_AGENT_DIR moves the agent dir; the per-cwd dir hangs under it.
  expect(piSessionDir('/w', { PI_CODING_AGENT_DIR: '/cfg/pi' })).toBe(
    join('/cfg/pi', 'sessions', piSessionDirName('/w')),
  );
  // PI_CODING_AGENT_SESSION_DIR replaces the WHOLE session dir — cwd drops out.
  expect(piSessionDir('/w', { PI_CODING_AGENT_SESSION_DIR: '/flat/sessions' })).toBe(
    '/flat/sessions',
  );
});

test('locate reports found and gone as distinct outcomes, with the path either way', () => {
  const dir = join(tmpdir(), `ward-pi-${process.pid}`);
  const cwd = join(dir, 'ws');
  const sessions = join(dir, 'cfg', 'sessions', piSessionDirName(cwd));
  mkdirSync(sessions, { recursive: true });
  const env = { PI_CODING_AGENT_DIR: join(dir, 'cfg') };

  const missing = locatePiRun(ID, cwd, env);
  expect(missing.outcome).toBe('gone');
  expect(missing.path).toBe(join(sessions, `*_${ID}.jsonl`));

  // pi names the file `<timestamp>_<id>.jsonl`; locate finds it by that suffix.
  const file = join(sessions, `2026-09-09T22-15-00-000Z_${ID}.jsonl`);
  writeFileSync(file, '{"type":"session"}\n');
  const found = locatePiRun(ID, cwd, env);
  expect(found).toEqual({ outcome: 'found', path: file });
  rmSync(dir, { recursive: true, force: true });
});

test('the command: WARD_PI_BIN, else agent.command, else `pi`', () => {
  expect(harnessCommand(piAdapter, undefined, {})).toEqual({ command: ['pi'], source: 'default' });
  expect(harnessCommand(piAdapter, ['npx', 'pi'], {})).toEqual({
    command: ['npx', 'pi'],
    source: 'configured',
  });
  // The override is the whole command, one program, and it wins over config.
  expect(harnessCommand(piAdapter, ['npx', 'pi'], { WARD_PI_BIN: '/opt/fake/pi' })).toEqual({
    command: ['/opt/fake/pi'],
    source: 'override',
  });
  // A claude override does not touch pi — each adapter has its own env seam.
  expect(harnessCommand(piAdapter, undefined, { WARD_CLAUDE_BIN: '/x' })).toEqual({
    command: ['pi'],
    source: 'default',
  });
  expect(DEFAULT_PI_COMMAND).toEqual(['pi']);
});
