// The transcripts against a REAL tmux (design/0073-scripted-tmux-runner/):
// every scenario of tmux-scenarios.ts runs on a private server of its own,
// its assertions checked against what tmux really does, and what it sent and
// was answered is recorded — then required to equal the committed transcript
// that the fast tier (tmux-scripted.test.ts) plays back. A transcript that
// differs here is stale: Ward now says something else to tmux, or tmux now
// answers something else. Re-record with
//
//   WARD_RECORD_TMUX=1 bun test test/host/tmux-conformance-live.test.ts
//
// and read the diff: it is exactly what changed in the conversation.
//
// No pseudo-terminal, no CLI, no workspace: the host's own methods only. The
// server is started with no configuration file, from an environment of four
// fixed variables, so nothing of the machine's reaches a transcript.
import { afterEach, describe, expect, setDefaultTimeout, test } from 'bun:test';
import { realpathSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { makeTempDir, removeDir } from '../helpers.ts';
import { readTranscript, recording, type Step, writeTranscript } from './scripted-tmux.ts';
import { SCENARIOS } from './tmux-scenarios.ts';

setDefaultTimeout(30_000);

const TMUX = Bun.which('tmux');
if (TMUX === null) {
  console.warn('test/host/tmux-conformance-live.test.ts: tmux is not installed — skipped');
}
const RECORD = process.env.WARD_RECORD_TMUX === '1';

describe.skipIf(TMUX === null)('the transcripts agree with a real tmux', () => {
  test.each(SCENARIOS.map((scenario) => [scenario.name, scenario] as const))(
    '%s',
    async (name, scenario) => {
      const tmux = TMUX ?? 'tmux';
      scratch = makeTempDir();
      socket = `ward-conf-${process.pid}-${Math.random().toString(36).slice(2, 8)}`;
      const env = {
        PATH: '/usr/bin:/bin',
        HOME: scratch,
        SHELL: '/bin/sh',
        LANG: 'en_US.UTF-8',
      };
      if (scenario.server !== false) {
        Bun.spawnSync(
          [
            tmux,
            '-L',
            socket,
            '-f',
            '/dev/null',
            'start-server',
            ';',
            'set',
            '-s',
            'exit-empty',
            'off',
          ],
          { env, cwd: scratch },
        );
      }
      const recorded = recording(name, tmux, socket, scratch, env);
      await scenario.run(recorded.stage);
      await recorded.settled();
      const fresh = recorded.transcript();
      if (RECORD) {
        writeTranscript(fresh);
        return;
      }
      const committed = readTranscript(name);
      const at = firstDifference(fresh.steps, committed.steps);
      if (at !== -1) {
        throw new Error(
          `${name}: the transcript is stale at step ${at + 1} (recorded on ` +
            `${committed.recordedWith}, run on ${fresh.recordedWith}).\n` +
            `committed: ${JSON.stringify(committed.steps[at] ?? 'nothing')}\n` +
            `this tmux: ${JSON.stringify(fresh.steps[at] ?? 'nothing')}\n` +
            're-record with WARD_RECORD_TMUX=1 bun test test/host/tmux-conformance-live.test.ts',
        );
      }
      expect(fresh.steps).toEqual(committed.steps);
    },
  );
});

let scratch: string | undefined;
let socket: string | undefined;

afterEach(() => {
  // The server, and the socket file tmux leaves behind it.
  if (socket !== undefined) {
    Bun.spawnSync([TMUX ?? 'tmux', '-L', socket, 'kill-server']);
    rmSync(socketPath(socket), { force: true });
  }
  if (scratch !== undefined) removeDir(scratch);
  scratch = undefined;
  socket = undefined;
});

function firstDifference(a: readonly Step[], b: readonly Step[]): number {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (!Bun.deepEquals(a[i], b[i])) return i;
  }
  return -1;
}

function socketPath(name: string): string {
  return join(realpathSync('/tmp'), `tmux-${process.getuid?.() ?? 0}`, name);
}
