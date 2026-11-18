// The nudge against a REAL tmux (design/0067-floor-dispatch/), end to end
// through the spawned CLI: a hand-off is recorded, and its notice is typed
// into the window of the target floor's own session — read back first, and
// submitted only at an input line that holds it alone — and nobody but the
// target floor's session receives a key.
//
// The run is a stand-in that DRAWS what the typing reads: a line between two
// rules that echoes what is typed and logs each line submitted to it. What
// the real harness does with the same keys was measured by hand and is in
// design/0067-floor-dispatch/. How the host reads a screen and decides —
// a question on it, words already on the line, a window someone is
// scrolling, a run that ended — is proved at the host's own level, on a real
// tmux and from its transcript (test/host/tmux-scenarios.ts, typing-a-line;
// design/0073-scripted-tmux-runner/); which sessions a hand-off is typed to,
// and how each answer is reported, against a fake host
// (test/agent/nudge.test.ts).
//
// Every call goes to a PRIVATE server (`tmux -L <unique>`, through
// WARD_TMUX_SOCKET), started with no configuration file and killed after each
// case. When tmux is not installed the suite is skipped, saying so.
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  setDefaultTimeout,
  test,
} from 'bun:test';
import { chmodSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  type SessionMutationShape,
  sessionMutationShape,
  type TaskDispatchShape,
  taskDispatchShape,
} from '../../src/cli/schema.ts';
import { claudeInputLine } from '../../src/harness/claude.ts';
import { createWorkspace } from '../../src/workspace/create.ts';
import { openProject } from '../../src/workspace/projects.ts';
import { applyGitTestEnv, type CliResult, makeTempDir, removeDir } from '../helpers.ts';

setDefaultTimeout(30_000);

const TMUX = Bun.which('tmux');
if (TMUX === null) {
  console.warn(
    'test/host/tmux-nudge-live.test.ts: tmux is not installed — the real-tmux suite is skipped',
  );
}
const SOCKET = `ward-nudge-${process.pid}-${Math.random().toString(36).slice(2, 8)}`;

describe.skipIf(TMUX === null)('a hand-off, on a real tmux', () => {
  test("recorded, then typed to the target floor's session — and to no one else", async () => {
    const coordinator = open(['session', 'open', '--detach', '--json']);
    const sender = open(['session', 'open', '--floor', '1', '--detach', '--json']);
    const target = open(['session', 'open', '--floor', '2', '--detach', '--json']);
    for (const each of [coordinator, sender, target]) await lineSoon(each);

    const sent = dispatch(['fix-login'], sender.id);
    expect(sent.dispatch).toMatchObject({
      address: 'f2t1',
      slug: 'fix-login',
      to: 2,
      fromSession: sender.id,
      fromFloor: 1,
      state: 'pending',
    });
    expect(sent.nudges).toEqual([
      { session: target.id, outcome: 'typed', detail: expect.stringContaining('typed into') },
    ]);
    // Exactly one line reached exactly one run: the notice, whole, submitted once.
    const notice =
      '[ward] hand-off to floor 2: task f2t1 (fix-login) from floor 1. ' +
      'Read it: ward task show f2t1';
    expect(await typedSoon(1)).toEqual([`${target.id}: ${notice}`]);
    // And the line is the target's again, empty, for whoever types next.
    expect(await lineSoon(target)).toBe('');
    expect(inputLine(coordinator)).toBe('');
    expect(inputLine(sender)).toBe('');
  });
});

// -- scaffolding ------------------------------------------------------------------

let scratch: string;
let ws: string;
let configHome: string;
let claudeHome: string;
let typedLog: string;
let asking: string;
let brief: string;
let caseId = 0;

const cliPath = new URL('../../src/cli/index.ts', import.meta.url).pathname;
const RULE = '─'.repeat(40);

/**
 * A stand-in run that draws an input line as the harness does — a rule, the
 * prompt mark, a rule, a status row — leaves the cursor after the mark so the
 * terminal echoes what is typed there, and logs every line submitted to it.
 */
const ASKING = `rule='${RULE}'
draw() { printf '\\033[2J\\033[H%s\\n❯ \\n%s\\n  stub status\\n\\033[2;3H' "$rule" "$rule"; }
draw
while IFS= read -r line; do
  echo "$WARD_AGENT: $line" >> "$WARD_TEST_TYPED"
  draw
done`;

function writeStub(file: string, body: string): string {
  const path = join(scratch, file);
  writeFileSync(path, `#!/bin/sh\n${body}\n`);
  chmodSync(path, 0o755);
  return path;
}

function wardEnv(stub: string, agent?: string): Record<string, string | undefined> {
  const env: Record<string, string | undefined> = {
    ...process.env,
    NO_COLOR: '1',
    WARD_CLAUDE_BIN: stub,
    WARD_TMUX_SOCKET: SOCKET,
    CLAUDE_CONFIG_DIR: claudeHome,
    WARD_CONFIG_DIR: configHome,
    WARD_STATE_DIR: configHome,
  };
  delete env.WARD_AGENT;
  delete env.TMUX;
  if (agent !== undefined) env.WARD_AGENT = agent;
  return env;
}

function ward(argv: string[], stub: string = asking, agent?: string): CliResult {
  const result = Bun.spawnSync(['bun', cliPath, ...argv], {
    cwd: ws,
    env: wardEnv(stub, agent),
  });
  return {
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  };
}

function open(argv: string[], stub: string = asking): SessionMutationShape {
  const result = ward(argv, stub);
  if (result.exitCode !== 0) throw new Error(`ward failed (${result.exitCode}): ${result.stderr}`);
  return sessionMutationShape.parse(JSON.parse(result.stdout));
}

/** Hand a task to floor 2, as the session given (or as a human), and read the report. */
function dispatch(argv: string[], agent?: string): TaskDispatchShape {
  const result = ward(
    ['task', 'dispatch', ...argv, '--to', '2', '--brief', brief, '--json'],
    asking,
    agent,
  );
  if (result.exitCode !== 0) throw new Error(`ward failed (${result.exitCode}): ${result.stderr}`);
  return taskDispatchShape.parse(JSON.parse(result.stdout));
}

function tmux(...args: string[]): string {
  const result = Bun.spawnSync([TMUX ?? 'tmux', '-L', SOCKET, ...args]);
  if (result.exitCode !== 0) throw new Error(`tmux ${args.join(' ')}: ${result.stderr}`);
  return result.stdout.toString();
}

/** The pane a session's run was started in, by the window's own tag. */
function pane(session: SessionMutationShape): string {
  return tmux('show-options', '-wv', '-t', session.live?.window ?? '', '@ward_pane').trim();
}

function screen(session: SessionMutationShape): string {
  return tmux('capture-pane', '-p', '-t', pane(session));
}

/** The run's input line, read exactly as the nudge reads it. */
function inputLine(session: SessionMutationShape): string | null {
  return claudeInputLine(screen(session));
}

async function lineSoon(session: SessionMutationShape, wanted = ''): Promise<string | null> {
  for (let i = 0; i < 100 && inputLine(session) !== wanted; i++) await Bun.sleep(50);
  return inputLine(session);
}

function typed(): string[] {
  try {
    return readFileSync(typedLog, 'utf8')
      .split('\n')
      .filter((line) => line !== '');
  } catch {
    return [];
  }
}

async function typedSoon(count: number): Promise<string[]> {
  for (let i = 0; i < 100 && typed().length < count; i++) await Bun.sleep(50);
  return typed();
}

beforeEach(async () => {
  applyGitTestEnv();
  caseId += 1;
  scratch ??= makeTempDir();
  ws = join(scratch, `ws-${caseId}`);
  claudeHome = join(scratch, `claude-home-${caseId}`);
  configHome = join(scratch, `config-${caseId}`);
  typedLog = join(scratch, `typed-${caseId}.log`);
  brief = join(scratch, 'brief.md');
  writeFileSync(brief, '# Fix the login page\n\nIt rejects every password.\n');
  asking = writeStub(`asking-${caseId}.sh`, ASKING);
  if (TMUX !== null) {
    const env: Record<string, string | undefined> = { ...process.env };
    delete env.WARD_AGENT;
    delete env.TMUX;
    Bun.spawnSync(
      [
        TMUX,
        '-L',
        SOCKET,
        '-f',
        '/dev/null',
        'start-server',
        ';',
        'set',
        '-s',
        'exit-empty',
        'off',
      ],
      { env },
    );
    // The server's environment is what every pane inherits: the stand-ins find their log there.
    tmux('set-environment', '-g', 'WARD_TEST_TYPED', typedLog);
  }
  await createWorkspace(ws);
  await openProject(ws, 'alpha');
  await openProject(ws, 'beta');
});

afterEach(() => {
  if (TMUX !== null) killServer();
});

afterAll(() => {
  if (TMUX !== null) killServer();
  if (scratch !== undefined) removeDir(scratch);
});

/** End the private server, and remove its socket file, which tmux leaves behind. */
function killServer(): void {
  const args = [TMUX ?? 'tmux', '-L', SOCKET];
  const path = Bun.spawnSync([...args, 'display-message', '-p', '#{socket_path}'])
    .stdout.toString()
    .trim();
  Bun.spawnSync([...args, 'kill-server']);
  if (path !== '') rmSync(path, { force: true });
}
