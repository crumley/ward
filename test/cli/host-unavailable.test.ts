// The CLI when no tmux can be had, or the one there misbehaves
// (design/0031-detached-session-hosting/; moved here from the real-tmux suite
// by design/0073-scripted-tmux-runner/, since none of it needs a tmux server):
// `--detach` is refused before anything is recorded, a configured tmux
// degrades to the foreground saying so, and a tmux that answers with errors
// is could-not-determine in doctor, never a clean bill. The program Ward runs
// is named by WARD_TMUX_BIN — a path that does not exist, or a script that
// answers `-V` and fails everything else.
import { afterAll, beforeAll, beforeEach, expect, test } from 'bun:test';
import { chmodSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { doctorShape } from '../../src/cli/schema.ts';
import { createWorkspace } from '../../src/workspace/create.ts';
import { readAllSessions } from '../../src/workspace/sessions.ts';
import {
  applyGitTestEnv,
  makeTempDir,
  NO_GH,
  removeDir,
  runWardEnv,
  writeFakeClaude,
} from '../helpers.ts';

test('--detach with no usable tmux refuses before recording; a configured tmux degrades, saying so', async () => {
  const refused = ward(['session', 'open', '--detach']);
  expect(refused.exitCode).toBe(1);
  expect(refused.stderr).toContain('cannot detach');
  expect(await readAllSessions(ws)).toEqual([]);

  writeGlobalConfig('host: tmux');
  const degraded = ward(['session', 'open', '--purpose', 'degrade', '--on-exit', 'keep']);
  expect(degraded.exitCode).toBe(0);
  expect(degraded.stderr).toContain('host tmux unavailable');
  expect(degraded.stderr).toContain('this session ends with this terminal');
  const [record] = (await readAllSessions(ws)).map((listing) => listing.record);
  expect(record?.events?.[0]?.host).toBeUndefined(); // it ran in the foreground
});

test('a tmux that errors is could-not-determine in doctor, never a clean bill', () => {
  const broken = join(scratch, `broken-tmux-${counter}.sh`);
  writeFileSync(
    broken,
    '#!/bin/sh\ncase " $* " in *" -V "*) echo "tmux 3.7"; exit 0 ;; esac\necho "server exploded" >&2\nexit 1\n',
  );
  chmodSync(broken, 0o755);
  const result = ward(['doctor', '--json'], { WARD_TMUX_BIN: broken });
  const findings = doctorShape.parse(JSON.parse(result.stdout)).workspace;
  expect(findings).toContainEqual(
    expect.objectContaining({
      check: 'host windows',
      severity: 'warn',
      message: expect.stringContaining('could not determine what the host holds (server exploded)'),
    }),
  );
  expect(findings.some((f) => f.check === 'host windows' && f.severity === 'ok')).toBe(false);
});

// -- setup ----------------------------------------------------------------

let scratch: string;
let ws: string;
let configHome: string;
let claude: string;
let counter = 0;

function ward(argv: string[], env: Record<string, string> = {}) {
  return runWardEnv(argv, ws, {
    NO_COLOR: '1',
    WARD_GH: NO_GH,
    WARD_TMUX_BIN: '/nonexistent/tmux',
    WARD_CLAUDE_BIN: claude,
    WARD_CONFIG_DIR: configHome,
    ...env,
  });
}

function writeGlobalConfig(agentLines: string): void {
  mkdirSync(configHome, { recursive: true });
  writeFileSync(
    join(configHome, 'config.md'),
    `---\ntype: ward-config\nagent:\n  ${agentLines}\n---\n`,
  );
}

beforeAll(() => {
  applyGitTestEnv();
  scratch = makeTempDir();
  claude = writeFakeClaude(scratch, 'claude');
});

afterAll(() => removeDir(scratch));

beforeEach(async () => {
  counter += 1;
  ws = join(scratch, `case-${counter}`);
  configHome = join(scratch, `config-${counter}`);
  await createWorkspace(ws);
});
