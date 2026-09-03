// The Claude Code adapter (design/0029-launched-sessions/): argv construction,
// the handle, and transcript resolution — the whole seam, proven without ever
// spawning the real CLI. The argv table is the entry's central promise made
// checkable: an absent key omits its flag ENTIRELY (0028's "omitted means
// omitted"), `agent.args` rides last so a human's flags get the final word,
// and a resume passes no model or effort at all.
import { expect, test } from 'bun:test';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  claudeCommand,
  claudeHandle,
  claudeNativeId,
  DEFAULT_CLAUDE_COMMAND,
  locateClaudeRun,
  locateProgram,
  mungeCwd,
  resumeArgv,
  startArgv,
  transcriptPath,
} from '../../src/harness/claude.ts';

const ID = '0b9d9f2e-6e4c-4a1f-9f4c-1d2e3f4a5b6c';

test('start argv: every key that resolved, in order, and nothing for the ones that did not', () => {
  const table: ReadonlyArray<[string, Parameters<typeof startArgv>[0], string[]]> = [
    ['nothing configured', { nativeId: ID, args: [] }, ['--session-id', ID]],
    [
      'model alone — no --effort anywhere in the line',
      { nativeId: ID, model: 'fable', args: [] },
      ['--session-id', ID, '--model', 'fable'],
    ],
    [
      'effort alone — no --model anywhere in the line',
      { nativeId: ID, effort: 'high', args: [] },
      ['--session-id', ID, '--effort', 'high'],
    ],
    [
      'both, plus args last — the human gets the final word',
      {
        nativeId: ID,
        model: 'sonnet',
        effort: 'low',
        args: ['--dangerously-skip-permissions', '--verbose'],
      },
      [
        '--session-id',
        ID,
        '--model',
        'sonnet',
        '--effort',
        'low',
        '--dangerously-skip-permissions',
        '--verbose',
      ],
    ],
    [
      'args alone, with nothing of Ward’s but the id',
      { nativeId: ID, args: ['--add-dir', '/data'] },
      ['--session-id', ID, '--add-dir', '/data'],
    ],
  ];
  for (const [name, request, expected] of table) {
    expect(startArgv(request), name).toEqual(expected);
  }
});

test('resume argv: the same id, the args, and never a model or an effort', () => {
  expect(resumeArgv(ID, [])).toEqual(['--resume', ID]);
  expect(resumeArgv(ID, ['--dangerously-skip-permissions'])).toEqual([
    '--resume',
    ID,
    '--dangerously-skip-permissions',
  ]);
  // A resumed run restores the model it was saved with; passing today's
  // configuration would silently re-model an old conversation mid-thread.
  expect(resumeArgv(ID, ['--model', 'sonnet']).indexOf('--model')).toBe(2); // only as a human's own arg
});

test('the handle is the harness plus its native id, and reads back', () => {
  expect(claudeHandle(ID)).toBe(`claude:${ID}`);
  const table: ReadonlyArray<[string, string | null]> = [
    [`claude:${ID}`, ID],
    ['claude:run', 'run'],
    ['claude:', null], // a prefix with nothing after it names no run
    ['codex:abc', null], // another harness's handle is not this adapter's to read
    [ID, null], // a bare id says nothing about which harness minted it
  ];
  for (const [handle, expected] of table) {
    expect(claudeNativeId(handle), handle).toBe(expected);
  }
});

test('the transcript address: the config dir, the munged cwd, the id', () => {
  const env = { CLAUDE_CONFIG_DIR: '/cfg' };
  expect(transcriptPath(ID, '/home/ryan/w/ws', env)).toBe(
    `/cfg/projects/-home-ryan-w-ws/${ID}.jsonl`,
  );
  // Every non-alphanumeric character becomes a dash — dots, underscores, and
  // dashes included, which is why two neighbouring directories can munge to
  // the same name and the session id is what disambiguates.
  const table: ReadonlyArray<[string, string]> = [
    ['/a/b', '-a-b'],
    ['/home/ryan/.ward/ws', '-home-ryan--ward-ws'],
    ['/tmp/ward_test-1', '-tmp-ward-test-1'],
    ['/Users/Ryan/W', '-Users-Ryan-W'],
  ];
  for (const [cwd, munged] of table) {
    expect(mungeCwd(cwd), cwd).toBe(munged);
  }
  // A relative cwd is resolved first: the address is the ABSOLUTE directory.
  expect(mungeCwd('.')).toBe(mungeCwd(process.cwd()));
});

test('CLAUDE_CONFIG_DIR is honored; without it the default claude home answers', () => {
  expect(transcriptPath(ID, '/w', { CLAUDE_CONFIG_DIR: '/elsewhere' })).toStartWith('/elsewhere/');
  expect(transcriptPath(ID, '/w', {})).toContain('/.claude/projects/');
});

test('locate reports found and gone as distinct outcomes, with the path either way', () => {
  const dir = join(tmpdir(), `ward-harness-${process.pid}`);
  const cwd = join(dir, 'ws');
  const projects = join(dir, 'cfg', 'projects', mungeCwd(cwd));
  mkdirSync(projects, { recursive: true });
  const env = { CLAUDE_CONFIG_DIR: join(dir, 'cfg') };

  const missing = locateClaudeRun(ID, cwd, env);
  expect(missing.outcome).toBe('gone');
  expect(missing.path).toBe(join(projects, `${ID}.jsonl`));

  writeFileSync(join(projects, `${ID}.jsonl`), '{"type":"user"}\n');
  const found = locateClaudeRun(ID, cwd, env);
  expect(found).toEqual({ outcome: 'found', path: missing.path });
  rmSync(dir, { recursive: true, force: true });
});

test('the command: WARD_CLAUDE_BIN, else agent.command, else `claude` (design/0035)', () => {
  const table: ReadonlyArray<
    [
      string,
      readonly string[] | undefined,
      Record<string, string>,
      ReturnType<typeof claudeCommand>,
    ]
  > = [
    ['nothing anywhere', undefined, {}, { command: ['claude'], source: 'default' }],
    [
      'the work machine: a launcher in front of the CLI',
      ['npx', 'claude'],
      {},
      { command: ['npx', 'claude'], source: 'configured' },
    ],
    [
      'the override is the whole command — one program, the narrowest layer',
      ['npx', 'claude'],
      { WARD_CLAUDE_BIN: '/opt/fake/claude' },
      { command: ['/opt/fake/claude'], source: 'override' },
    ],
    [
      'an empty override is not a choice',
      undefined,
      { WARD_CLAUDE_BIN: '' },
      {
        command: ['claude'],
        source: 'default',
      },
    ],
    [
      'an empty configured list cannot run anything — the default stands',
      [],
      {},
      {
        command: ['claude'],
        source: 'default',
      },
    ],
  ];
  for (const [name, configured, env, expected] of table) {
    expect(claudeCommand(configured, env), name).toEqual(expected);
  }
  expect(DEFAULT_CLAUDE_COMMAND).toEqual(['claude']);
});

test('locateProgram: a bare name on PATH, a path as a path, nothing for what is not there', () => {
  const dir = join(tmpdir(), `ward-harness-program-${process.pid}`);
  mkdirSync(join(dir, 'bin'), { recursive: true });
  writeFileSync(join(dir, 'bin', 'fake-claude'), '#!/bin/sh\n', { mode: 0o755 });
  const env = { PATH: join(dir, 'bin') };
  expect(locateProgram('fake-claude', dir, env)).toBe(join(dir, 'bin', 'fake-claude'));
  expect(locateProgram(join(dir, 'bin', 'fake-claude'), '/', env)).toBe(
    join(dir, 'bin', 'fake-claude'),
  );
  expect(locateProgram('./bin/fake-claude', dir, env)).toBe(join(dir, 'bin', 'fake-claude'));
  expect(locateProgram('fake-claude', dir, { PATH: '/nowhere' })).toBeNull();
  expect(locateProgram('/nonexistent/claude', dir, env)).toBeNull();
  rmSync(dir, { recursive: true, force: true });
});
