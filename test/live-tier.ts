// The live tier's preload (`mise run test:live`, design/0071-ci-tiers-and-pinned-tmux/):
// it runs before any *-live.test.ts file is loaded, and does two things the
// files themselves should not each have to.
//
// 1. It holds the tmux under test to the pin. `WARD_TMUX_PIN` (set by the mise
//    task from mise.toml's `tmux_version`) names the version the tier is meant
//    to prove; the tmux it would actually drive is the first on PATH. In CI a
//    mismatch, or no tmux at all, fails the tier here, before a single case,
//    with one line saying which tmux was found and how to get the pinned one —
//    a suite that skipped itself or ran against a drifted runner tmux would
//    otherwise pass and prove nothing. On a laptop the same finding is a
//    warning. `WARD_TMUX_PIN=native` opts out (the nightly does, on purpose).
//
// 2. With `WARD_LIVE_EVIDENCE=DIR`, it keeps what every pseudo-terminal client
//    was sent — the screen a human would have seen, including tmux's own
//    bracketed exit line when a client dies — one file per client, numbered in
//    the order the cases ran. CI uploads the directory when the tier fails.
//    It wraps `Bun.spawn` rather than asking each suite to log, so a new live
//    file is covered without doing anything.
import { beforeEach } from 'bun:test';
import { appendFileSync, mkdirSync } from 'node:fs';
import { basename, join } from 'node:path';

const pin = process.env.WARD_TMUX_PIN ?? '';
const strict = process.env.CI === 'true';

if (pin !== '' && pin !== 'native') {
  const found = Bun.which('tmux');
  const version = found === null ? null : Bun.spawnSync([found, '-V']).stdout.toString().trim();
  if (version !== `tmux ${pin}`) {
    const what = found === null ? 'no tmux on PATH' : `${version} at ${found}`;
    const message =
      `live tier: the pinned tmux is ${pin}, but this run has ${what}. ` +
      'Build the pin with `mise run tmux:pinned` (test:live then finds it), ' +
      'or run WARD_TMUX_PIN=native mise run test:live to test the tmux you have.';
    if (strict) throw new Error(message);
    console.warn(`warning: ${message}`);
  } else {
    console.log(`live tier: ${version} at ${found}`);
  }
}

const evidence = process.env.WARD_LIVE_EVIDENCE ?? '';
if (evidence !== '') {
  mkdirSync(evidence, { recursive: true });
  // --isolate loads this preload afresh for each file, so the file's own
  // start time keeps two files' case numbers apart, in the order they ran.
  const fileRun = new Date().toISOString().replace(/[:.]/g, '');
  let caseNo = 0;
  let clientNo = 0;
  beforeEach(() => {
    caseNo += 1;
    clientNo = 0;
  });
  const spawn = Bun.spawn;
  // Only the options form with a `terminal` is a pty client; everything else
  // passes through untouched.
  const wrapped = ((command: unknown, options?: unknown) => {
    const opts = options as { terminal?: { data?: (t: unknown, b: Uint8Array) => void } };
    const argv = Array.isArray(command) ? (command as string[]) : [];
    if (opts?.terminal?.data === undefined || argv.length === 0) {
      return (spawn as (...a: unknown[]) => unknown)(command, options);
    }
    clientNo += 1;
    const name = `${fileRun}-case-${String(caseNo).padStart(3, '0')}-client-${clientNo}-${basename(argv[0] ?? 'pty')}.log`;
    const file = join(evidence, name);
    appendFileSync(file, `$ ${argv.join(' ')}\n# at ${new Date().toISOString()}\n`);
    const data = opts.terminal.data;
    const terminal = {
      ...opts.terminal,
      data(t: unknown, bytes: Uint8Array) {
        appendFileSync(file, bytes);
        data(t, bytes);
      },
    };
    return (spawn as (...a: unknown[]) => unknown)(command, { ...opts, terminal });
  }) as typeof Bun.spawn;
  Bun.spawn = wrapped;
}
