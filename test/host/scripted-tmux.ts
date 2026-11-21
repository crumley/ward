// A scripted tmux (design/0073-scripted-tmux-runner/): the runner that
// `tmuxHost()` is handed in place of the real program, and the transcripts it
// plays back. A transcript is what one SCENARIO — a short drive of the host's
// methods, with its assertions — sent a real tmux and what tmux answered,
// recorded on a private server and normalized so it reads the same on any
// machine. It is kept honest from both ends:
//
// - the fast tier (tmux-scripted.test.ts) runs each scenario against its
//   transcript: Ward must send exactly the recorded argv, in order, and its
//   assertions must hold over the recorded answers;
// - the live tier (tmux-conformance-live.test.ts) runs the same scenario
//   against a real tmux and requires the fresh recording to equal the
//   committed one — so a transcript tmux no longer agrees with fails there,
//   and one Ward no longer agrees with fails in both.
//
// `WARD_RECORD_TMUX=1` on the live tier writes the transcripts instead of
// comparing them, the way `WARD_PIN_SHAPES=1` re-pins the record shapes.
import { readdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { SessionHost } from '../../src/host/host.ts';
import { type TmuxClient, type TmuxReply, type TmuxRunner, tmuxHost } from '../../src/host/tmux.ts';

/** One exchange with tmux. */
export type Step =
  /** A call the host made, and its answer. */
  | {
      readonly kind: 'run';
      readonly argv: readonly string[];
      readonly exit: number | null;
      readonly stdout: string;
      readonly stderr: string;
      readonly timedOut?: true;
      /** Fault cases only: the program could not be started — `run` throws this. */
      readonly unstartable?: string;
    }
  /** A call the scenario made itself — a human's act, or a read it asserts on. */
  | {
      readonly kind: 'outside';
      readonly argv: readonly string[];
      readonly exit: number | null;
      readonly stdout: string;
      readonly stderr: string;
    }
  /** The client the host started to join a view, and how it ended. */
  | {
      readonly kind: 'client';
      readonly argv: readonly string[];
      /** The `$TMUX` it was handed (a switch), if any. */
      readonly tmux?: string;
      readonly exit: number;
      readonly stderr: string;
    };

export interface Transcript {
  readonly scenario: string;
  /** The tmux it was recorded on — for a human; never compared. */
  readonly recordedWith: string;
  readonly steps: readonly Step[];
}

/** What a scenario is handed: the host to drive, and the stage it stands on. */
export interface Stage {
  /** Whether a real tmux is behind this run (the live tier). */
  readonly live: boolean;
  /** A directory for the scenario's files — `<scratch>` when played back. */
  readonly scratch: string;
  /** The server's socket path — `<socket>` when played back. */
  readonly socketPath: string;
  /** The tmux host, over this stage's runner; `env` adds to its environment (a `$TMUX`). */
  host(env?: Record<string, string>): SessionHost;
  /** A call of the scenario's own, recorded: its stdout, or a throw on a non-zero exit. */
  tmux(...argv: string[]): string;
  /** The same, answered whatever the exit — for a call expected to fail. */
  tmuxReply(...argv: string[]): TmuxReply;
  /**
   * Wait, on a real tmux only, until `done` holds — its reads go through
   * {@link peek}, which nothing records. Played back, the recorded answers
   * that follow already reflect the wait, and this returns at once.
   */
  waitFor(what: string, done: () => boolean): void;
  /** An unrecorded read, for {@link waitFor}: empty when played back. */
  peek(...argv: string[]): string;
  /** A stand-in run, as a `sh` script in the scratch directory: its path. */
  stub(name: string, body: string): string;
  /** Create an empty file in the scratch directory — a cue a stand-in run waits on. */
  touch(name: string): void;
  /** A file a stand-in run wrote in the scratch directory — empty when played back. */
  read(name: string): string;
  /**
   * Hold the host's next call matching `match` until `done` holds — a race
   * made deterministic on a real tmux. Played back, nothing races.
   */
  holdBefore(match: (argv: readonly string[]) => boolean, done: () => boolean): void;
}

export interface Scenario {
  readonly name: string;
  /** Whether the live tier starts the private server first — false for a scenario about none. */
  readonly server?: false;
  run(stage: Stage): void | Promise<void>;
}

export const TRANSCRIPTS = new URL('./transcripts/', import.meta.url).pathname;

export function transcriptPath(name: string): string {
  return join(TRANSCRIPTS, `${name}.json`);
}

export function readTranscript(name: string): Transcript {
  return JSON.parse(readFileSync(transcriptPath(name), 'utf8')) as Transcript;
}

export function writeTranscript(transcript: Transcript): void {
  writeFileSync(transcriptPath(transcript.scenario), `${JSON.stringify(transcript, null, 2)}\n`);
}

export function transcriptNames(): string[] {
  return readdirSync(TRANSCRIPTS)
    .filter((file) => file.endsWith('.json'))
    .map((file) => file.slice(0, -'.json'.length))
    .sort();
}

// -- playback (the fast tier) -------------------------------------------------

/** A stage that plays a transcript back, refusing any call it does not hold. */
export interface Playback {
  readonly stage: Stage;
  /** How many times the host paused between reads. */
  readonly pauses: number;
  /** The signals passed on to a client the host started. */
  readonly kills: readonly string[];
  /** Throws when the host left the script, or left steps of it unplayed. */
  finish(): void;
}

export const SCRATCH = '<scratch>';
export const SOCKET = '<socket>';

export function playback(name: string, steps: readonly Step[]): Playback {
  let next = 0;
  let pauses = 0;
  const kills: string[] = [];
  let strayed: string | undefined;
  const take = <K extends Step['kind']>(kind: K, argv: readonly string[]) => {
    // A screen read asked again at once is answered again: the recording
    // kept one of a run of identical reads (see normalize).
    const held = steps[next - 1];
    if (held?.kind === 'run' && kind === 'run' && isScreenRead(argv) && sameArgv(held.argv, argv)) {
      return held as Extract<Step, { kind: K }>;
    }
    const step = steps[next];
    const wanted = step === undefined ? 'nothing more' : `${step.kind} ${show(step.argv)}`;
    if (step?.kind !== kind || !sameArgv(step.argv, argv)) {
      strayed ??=
        `${name}, step ${next + 1}: the host sent ${kind} ${show(argv)}, ` +
        `but the transcript has ${wanted} — re-record it (WARD_RECORD_TMUX=1 bun test ` +
        'test/host/tmux-conformance-live.test.ts) if the change is meant';
      return undefined;
    }
    next += 1;
    return step as Extract<Step, { kind: K }>;
  };
  const off: TmuxReply = { exitCode: 1, stdout: '', stderr: 'off the script', timedOut: false };
  const runner: TmuxRunner = {
    run(argv) {
      const step = take('run', argv);
      if (step === undefined) return off;
      if (step.unstartable !== undefined) throw new Error(step.unstartable);
      return {
        exitCode: step.exit,
        stdout: step.stdout,
        stderr: step.stderr,
        timedOut: step.timedOut === true,
      };
    },
    client(argv, tmuxVar): TmuxClient {
      const step = take('client', argv);
      if (step !== undefined && step.tmux !== tmuxVar) {
        strayed ??= `${name}, step ${next}: the client was handed $TMUX ${tmuxVar}, not ${step.tmux}`;
      }
      // The client exits a moment later, as a real one would: long enough for a
      // signal to arrive while the host waits on it.
      const exited = new Promise<number>((done) => setTimeout(() => done(step?.exit ?? 1), 5));
      return { exited, kill: (signal) => kills.push(signal) };
    },
    pause: () => {
      pauses += 1;
    },
  };
  const outside = (argv: readonly string[]): TmuxReply => {
    const step = take('outside', argv);
    if (step === undefined) return off;
    return { exitCode: step.exit, stdout: step.stdout, stderr: step.stderr, timedOut: false };
  };
  const stage: Stage = {
    live: false,
    scratch: SCRATCH,
    socketPath: SOCKET,
    host: (env = {}) => tmuxHost(env, runner),
    tmux: (...argv) => mustSucceed(argv, outside(argv)),
    tmuxReply: (...argv) => outside(argv),
    waitFor: () => {},
    peek: () => '',
    stub: (file) => `${SCRATCH}/${file}.sh`,
    touch: () => {},
    read: () => '',
    holdBefore: () => {},
  };
  return {
    stage,
    get pauses() {
      return pauses;
    },
    kills,
    finish() {
      if (strayed !== undefined) throw new Error(strayed);
      if (next < steps.length) {
        throw new Error(
          `${name}: the host stopped at step ${next + 1} of ${steps.length}; ` +
            `the transcript goes on with ${steps[next]?.kind} ${show(steps[next]?.argv ?? [])}`,
        );
      }
    },
  };
}

// -- recording (the live tier) ------------------------------------------------

export interface Recording {
  readonly stage: Stage;
  /** Everything recorded so far, normalized: what the transcript would hold. */
  transcript(): Transcript;
  /** Wait for any client the host started, so its exit is in the transcript. */
  settled(): Promise<void>;
}

/**
 * A stage over a real tmux on the private server `socket`, started (by the
 * scenario's first call) from `env` alone, so what the server inherits is the
 * same on every machine.
 */
export function recording(
  name: string,
  tmuxBin: string,
  socket: string,
  scratch: string,
  env: Record<string, string>,
): Recording {
  const steps: Step[] = [];
  const holds: { match: (argv: readonly string[]) => boolean; done: () => boolean }[] = [];
  const clients: Promise<unknown>[] = [];
  const spawn = (argv: readonly string[]): TmuxReply => {
    const result = Bun.spawnSync([tmuxBin, '-L', socket, ...argv], {
      env,
      cwd: scratch,
      stdin: 'ignore',
    });
    return {
      exitCode: result.exitCode,
      stdout: result.stdout.toString(),
      stderr: result.stderr.toString(),
      timedOut: false,
    };
  };
  const runner: TmuxRunner = {
    run(argv) {
      const hold = holds.findIndex((each) => each.match(argv));
      if (hold !== -1) {
        const [{ done } = { done: () => true }] = holds.splice(hold, 1);
        waitSync(`the hold before ${show(argv)}`, done);
      }
      const reply = spawn(argv);
      steps.push({
        kind: 'run',
        argv: [...argv],
        exit: reply.exitCode,
        stdout: reply.stdout,
        stderr: reply.stderr,
      });
      return reply;
    },
    client(argv, tmuxVar) {
      // Never the test's own terminal: a client with no terminal is refused
      // by tmux, which is exactly the answer the scenario records.
      const child = Bun.spawn([tmuxBin, '-L', socket, ...argv], {
        env: tmuxVar === undefined ? env : { ...env, TMUX: tmuxVar },
        cwd: scratch,
        stdin: 'ignore',
        stdout: 'ignore',
        stderr: 'pipe',
      });
      const step: { kind: 'client'; argv: string[]; tmux?: string; exit: number; stderr: string } =
        {
          kind: 'client',
          argv: [...argv],
          ...(tmuxVar === undefined ? {} : { tmux: tmuxVar }),
          exit: -1,
          stderr: '',
        };
      steps.push(step);
      const exited = child.exited.then(async (code) => {
        step.exit = code;
        step.stderr = await new Response(child.stderr).text();
        return code;
      });
      clients.push(exited);
      return { exited, kill: (signal) => child.kill(signal) };
    },
    pause: (ms) => Bun.sleepSync(ms),
  };
  const outside = (argv: readonly string[]): TmuxReply => {
    const reply = spawn(argv);
    steps.push({
      kind: 'outside',
      argv: [...argv],
      exit: reply.exitCode,
      stdout: reply.stdout,
      stderr: reply.stderr,
    });
    return reply;
  };
  const stage: Stage = {
    live: true,
    scratch,
    // Where tmux puts a named server's socket: TMUX_TMPDIR (else /tmp), resolved,
    // under tmux-<uid>.
    socketPath: join(
      realpathSync(env.TMUX_TMPDIR ?? '/tmp'),
      `tmux-${process.getuid?.() ?? 0}`,
      socket,
    ),
    host: (extra = {}) => tmuxHost(extra, runner),
    tmux: (...argv) => mustSucceed(argv, outside(argv)),
    tmuxReply: (...argv) => outside(argv),
    waitFor: (what, done) => waitSync(what, done),
    peek: (...argv) => spawn(argv).stdout,
    stub(file, body) {
      const path = join(scratch, `${file}.sh`);
      writeFileSync(path, `#!/bin/sh\n${body}\n`, { mode: 0o755 });
      return path;
    },
    touch: (file) => writeFileSync(join(scratch, file), ''),
    read(file) {
      try {
        return readFileSync(join(scratch, file), 'utf8');
      } catch {
        return '';
      }
    },
    holdBefore: (match, done) => {
      holds.push({ match, done });
    },
  };
  return {
    stage,
    transcript: () => ({
      scenario: name,
      recordedWith: spawn(['-V']).stdout.trim(),
      steps: normalize(steps, { scratch, socket }),
    }),
    settled: async () => {
      await Promise.all(clients);
    },
  };
}

// -- normalizing ----------------------------------------------------------------

/**
 * A recording as it reads on any machine and server: the scratch directory
 * and the socket by placeholder; tmux's own ids (`@N` windows, `%N` panes,
 * `$N` sessions) numbered in the order they first appear; every session
 * creation time as `1` (tmux counts them in whole seconds, so two sessions
 * made a moment apart read the same or a second apart by chance — and the one
 * thing Ward reads from them, which of two hosts for a floor is older, is no
 * scenario's to show: an edited transcript does); the version line by placeholder (the transcript records which
 * tmux it was taken on beside it); and a screen read answered the same as the
 * read before it dropped, so a poll that happened to wait one round longer
 * reads as the poll that did not.
 */
export function normalize(
  steps: readonly Step[],
  where: { readonly scratch: string; readonly socket: string },
): Step[] {
  // The ids tmux issued are the ones it answered with; an id a scenario made
  // up (`@999`, a window that is not there) is left as it is written.
  const ids = new Map<string, string>();
  const counters = new Map<string, number>();
  for (const step of steps) {
    if (step.kind === 'client') continue;
    for (const [whole, sigil = ''] of step.stdout.matchAll(ID)) {
      if (ids.has(whole)) continue;
      const n = (counters.get(sigil) ?? 0) + 1;
      counters.set(sigil, n);
      ids.set(whole, `${sigil}${n}`);
    }
  }
  const socketRe = new RegExp(`[^\\s'"]*/${escapeRe(where.socket)}\\b`, 'g');
  const clean = (text: string): string =>
    text
      .split(where.scratch)
      .join(SCRATCH)
      .replace(socketRe, SOCKET)
      .replace(EPOCH, '1')
      .replace(ID, (whole) => ids.get(whole) ?? whole);
  const out: Step[] = [];
  for (const step of steps) {
    const argv = step.argv.map(clean);
    if (step.kind === 'client') {
      out.push({ ...step, argv, ...(step.tmux === undefined ? {} : { tmux: clean(step.tmux) }) });
      continue;
    }
    const isVersion = argv.length === 1 && argv[0] === '-V';
    const stdout = isVersion ? 'tmux <version>\n' : clean(step.stdout);
    const reply = { ...step, argv, stdout, stderr: clean(step.stderr) };
    // Only a read answered the same as the step right before it — the one
    // playback answers again — is dropped: a read that follows anything else
    // is a read the host will ask for again, and must be there to answer it.
    const last = out.at(-1);
    if (
      step.kind === 'run' &&
      isScreenRead(argv) &&
      last?.kind === 'run' &&
      sameArgv(last.argv, argv) &&
      last.exit === reply.exit &&
      last.stdout === stdout
    ) {
      continue;
    }
    out.push(reply);
  }
  return out;
}

/**
 * A read of a pane's screen — the one call the host repeats while it waits
 * (typing a line). A run of identical reads is recorded as one, and played
 * back as many times as the host asks, so a wait that took a round longer on
 * the recording machine reads the same.
 */
function isScreenRead(argv: readonly string[]): boolean {
  return argv[0] === '-u' && argv[1] === 'capture-pane';
}

/** A tmux session's creation time: seconds since the epoch, as tmux prints them. */
const EPOCH = /\b1[6-9]\d{8}\b/g;

/** An id tmux hands out: `@N` a window, `%N` a pane, `$N` a session. */
const ID = /([@%$])(\d+)\b/g;

// -- editing a transcript (fault cases) -----------------------------------------

/** Where in a transcript: the first host call whose argv starts with `head`, after `skip` such. */
export function at(steps: readonly Step[], head: readonly string[], skip = 0): number {
  let seen = 0;
  const index = steps.findIndex((step) => {
    if (step.kind !== 'run' || !head.every((word, i) => step.argv[i] === word)) return false;
    return seen++ === skip;
  });
  if (index === -1) throw new Error(`no host call starting ${show(head)} in the transcript`);
  return index;
}

/** The transcript's steps with one host call answered otherwise. */
export function answered(
  steps: readonly Step[],
  index: number,
  reply: Partial<Pick<Extract<Step, { kind: 'run' }>, 'exit' | 'stdout' | 'stderr' | 'timedOut'>>,
): Step[] {
  return steps.map((step, i) => (i === index ? ({ ...step, ...reply } as Step) : step));
}

/** A host call written out — for the steps after a fault, built from the pinned argv builders. */
export function call(
  argv: readonly string[],
  reply: { exit?: number; stdout?: string; stderr?: string } = {},
): Extract<Step, { kind: 'run' }> {
  return {
    kind: 'run',
    argv,
    exit: reply.exit ?? 0,
    stdout: reply.stdout ?? '',
    stderr: reply.stderr ?? '',
  };
}

// -- helpers --------------------------------------------------------------------

function mustSucceed(argv: readonly string[], reply: TmuxReply): string {
  if (reply.exitCode !== 0) throw new Error(`tmux ${show(argv)}: ${reply.stderr}`);
  return reply.stdout;
}

function sameArgv(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((word, i) => word === b[i]);
}

function show(argv: readonly string[]): string {
  return JSON.stringify(argv);
}

function waitSync(what: string, done: () => boolean): void {
  for (let i = 0; i < 200; i++) {
    if (done()) return;
    Bun.sleepSync(50);
  }
  throw new Error(`waited 10s for ${what}`);
}

function escapeRe(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
