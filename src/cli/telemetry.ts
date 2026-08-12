// Local usage telemetry (design/0013-telemetry-and-serialized-writes/): one
// JSONL row per invocation under .ward/telemetry/, recording what exists
// today of the human-shell contract's fields — verb, working directory,
// human-or-agent (intent/02-subsystems/07-human-shell.md). It is local and
// personal (§4): never tracked, never committed, never surfaced to remote
// artifacts. Recording sits on the append rung of the no-lost-updates ladder
// (§17) — one O_APPEND write per invocation, no lock — and a telemetry
// failure never fails, slows, or noisies the command it records: the
// command's work is the work (§20).
import { appendFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import pkg from '../../package.json' with { type: 'json' };
import { discoverWorkspace } from '../workspace/layout.ts';
import { callerIsAgent } from './caller.ts';

/**
 * The known command tree, verbs only — what separates the verb path from its
 * arguments in raw argv. Static, tiny, and updated when the tree grows; an
 * unknown first word is recorded as itself (bounded), so nothing is guessed.
 */
const VERB_TREE: Record<string, readonly string[]> = {
  workspace: ['create'],
  repo: ['add', 'refresh', 'list'],
  project: ['open', 'list'],
  task: ['open', 'list', 'pause', 'resume', 'pr', 'close'],
  worktree: ['create', 'rebase', 'list'],
  session: ['open', 'close'],
  status: [],
  doctor: [],
  schema: [],
};

/** The verb path of an invocation, from raw argv (`['task','open','x']` → `task open`). */
export function verbPath(argv: readonly string[]): string {
  const first = argv[0];
  if (first === undefined || first === '-v' || first === '--version') return 'version';
  if (first === '-h' || first === '--help') return 'help';
  const subverbs = VERB_TREE[first];
  if (subverbs === undefined) return first.slice(0, 32);
  const second = argv[1];
  return second !== undefined && subverbs.includes(second) ? `${first} ${second}` : first;
}

/**
 * Arm the per-invocation record: registered as a process exit handler so it
 * covers every path out — normal completion, WardError exits, optique's own
 * help/usage exits — and can carry the outcome (the exit code) and duration.
 * Telemetry is workspace-local by definition: invoked outside any workspace,
 * there is nowhere for it to live and nothing is recorded.
 */
export function recordInvocation(argv: readonly string[]): void {
  const startedAt = new Date();
  const begun = performance.now();
  process.on('exit', (code) => {
    try {
      const workspace = discoverWorkspace(process.cwd());
      if (workspace === null) return;
      const dir = join(workspace, '.ward', 'telemetry');
      mkdirSync(dir, { recursive: true });
      // Self-ignoring: the directory carries its own catch-all .gitignore, so
      // telemetry stays out of git even in a workspace created before the
      // root ignore policy learned this line — §4 does not depend on the
      // workspace having converged.
      const selfIgnore = join(dir, '.gitignore');
      if (!existsSync(selfIgnore)) writeFileSync(selfIgnore, '*\n');
      const agent = process.env.WARD_AGENT;
      const row = {
        at: startedAt.toISOString(),
        verb: verbPath(argv),
        caller: callerIsAgent() ? 'agent' : 'human',
        ...(agent !== undefined && agent !== '' ? { agent } : {}),
        cwd: process.cwd(),
        exit: code,
        ms: Math.round(performance.now() - begun),
        ward: pkg.version,
      };
      // One small O_APPEND write per invocation: concurrent appenders
      // interleave whole lines, never bytes, on a local filesystem — the
      // append rung of the ladder, needing no lock. Sharded by month so no
      // single file grows without bound and pruning is a plain deletion.
      const month = startedAt.toISOString().slice(0, 7);
      appendFileSync(join(dir, `usage-${month}.jsonl`), `${JSON.stringify(row)}\n`);
    } catch {
      // A telemetry failure never fails the command it records (§20).
    }
  });
}
