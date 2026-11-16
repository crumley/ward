// A repository's own commands (design/0065-external-checkouts-and-repo-commands/):
// the three places a machine may put its own tool in Ward's hands — bringing
// the canonical checkout to the latest, making a task's worktree, removing
// one. Each is an ARGUMENT LIST read from this machine's configuration
// (src/global/config.ts), spawned directly: there is no shell, so nothing
// Ward substitutes — a branch name, a path with spaces — is ever parsed as
// syntax. A command that wants a shell names one (`[sh, -c, …]`) and reads the
// same values from its environment, where they are data too.
import { WardError } from '../errors.ts';
import { type RepositoryCommands, readConfig } from '../global/config.ts';

export type CommandKind = 'update' | 'worktree.create' | 'worktree.remove';

/** What every command is told about the repository it runs for. */
const REPOSITORY_VALUES = ['repo', 'checkout', 'mainline', 'remote', 'workspace'] as const;

/**
 * The values each kind is given. `path` is the worktree's absolute path:
 * proposed for `worktree.create` (the command may make it elsewhere), recorded
 * for `worktree.remove`.
 */
export const COMMAND_VALUES: Readonly<Record<CommandKind, readonly string[]>> = {
  update: REPOSITORY_VALUES,
  'worktree.create': [...REPOSITORY_VALUES, 'task', 'branch', 'base', 'path'],
  'worktree.remove': [...REPOSITORY_VALUES, 'task', 'branch', 'path', 'outcome'],
};

/** The environment variable that carries each value. */
const ENV_NAMES: Readonly<Record<string, string>> = {
  repo: 'WARD_REPO',
  checkout: 'WARD_CHECKOUT',
  mainline: 'WARD_MAIN_LINE',
  remote: 'WARD_REMOTE',
  workspace: 'WARD_WORKSPACE',
  task: 'WARD_TASK',
  branch: 'WARD_BRANCH',
  base: 'WARD_BASE',
  path: 'WARD_WORKTREE_PATH',
  outcome: 'WARD_OUTCOME',
};

/**
 * A `{name}` placeholder: lowercase letters only, and never after a `$`, so
 * ordinary braces and a shell's own `${name}` pass through.
 */
const PLACEHOLDER = /(?<!\$)\{([a-z]+)\}/g;

/** The placeholders an argument list uses that its kind is not given. */
export function unknownPlaceholders(kind: CommandKind, argv: readonly string[]): string[] {
  const known = COMMAND_VALUES[kind];
  const unknown = new Set<string>();
  for (const argument of argv) {
    for (const match of argument.matchAll(PLACEHOLDER)) {
      const name = match[1] ?? '';
      if (!known.includes(name)) unknown.add(name);
    }
  }
  return [...unknown];
}

/**
 * Substitute the values into the argument list. One pass per argument, so a
 * value that itself contains `{branch}` is never expanded a second time; an
 * argument stays one argument whatever the value holds.
 */
export function expandCommand(
  kind: CommandKind,
  argv: readonly string[],
  values: Readonly<Record<string, string>>,
): string[] {
  const unknown = unknownPlaceholders(kind, argv);
  if (unknown.length > 0) {
    throw new WardError(
      `the ${kind} command uses ${unknown.map((name) => `{${name}}`).join(', ')}, which Ward ` +
        `does not provide — it provides ${COMMAND_VALUES[kind].map((name) => `{${name}}`).join(', ')}`,
    );
  }
  return argv.map((argument) =>
    argument.replaceAll(PLACEHOLDER, (_whole, name: string) => values[name] ?? ''),
  );
}

export interface CommandRun {
  /** The argument list as run, values substituted. */
  readonly argv: readonly string[];
  /** Null when the program could not be started or was ended by a signal. */
  readonly exitCode: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

/**
 * Run one command in `cwd` (the canonical checkout), with the values in its
 * arguments and in its environment. Never throws for the command's own
 * failure — the caller decides what a failure means where it happened — but a
 * placeholder Ward does not provide is refused before anything runs.
 */
export async function runRepositoryCommand(
  kind: CommandKind,
  argv: readonly string[],
  values: Readonly<Record<string, string>>,
  cwd: string,
): Promise<CommandRun> {
  const expanded = expandCommand(kind, argv, values);
  const env: Record<string, string | undefined> = { ...process.env };
  for (const name of COMMAND_VALUES[kind]) {
    const variable = ENV_NAMES[name];
    if (variable !== undefined) env[variable] = values[name] ?? '';
  }
  try {
    const proc = Bun.spawn(expanded, { cwd, env, stdin: 'ignore', stdout: 'pipe', stderr: 'pipe' });
    const [stdout, stderr] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ]);
    await proc.exited;
    return { argv: expanded, exitCode: proc.exitCode, stdout, stderr };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return { argv: expanded, exitCode: null, stdout: '', stderr: `cannot start it: ${reason}` };
  }
}

export function commandSucceeded(run: CommandRun): boolean {
  return run.exitCode === 0;
}

/**
 * A failed run in one line: the program, how it ended, and the end of what it
 * said — its stderr, or its stdout when stderr is empty.
 */
export function describeFailure(run: CommandRun): string {
  const how = run.exitCode === null ? 'did not run to an exit code' : `exited ${run.exitCode}`;
  const said = (run.stderr.trim() === '' ? run.stdout : run.stderr)
    .trim()
    .split('\n')
    .slice(-3)
    .join(' ')
    .replaceAll(/\s+/g, ' ');
  return `${run.argv[0] ?? 'the command'} ${how}${said === '' ? '' : `: ${said}`}`;
}

/** The commands this machine's configuration names for a repository — `{}` when none. */
export async function repositoryCommands(name: string): Promise<RepositoryCommands> {
  return (await readConfig()).repositories[name] ?? {};
}

/** The values every kind shares, from the repository's record and where it stands. */
export function repositoryValues(
  root: string,
  repo: { readonly name: string; readonly remote: string; readonly mainLine: string },
  checkout: string,
): Record<string, string> {
  return {
    repo: repo.name,
    checkout,
    mainline: repo.mainLine,
    remote: repo.remote,
    workspace: root,
  };
}

/**
 * A word spelled for a command Ward SUGGESTS (never one it runs — those are
 * argument lists and need no quoting): single-quoted unless it is plainly
 * safe bare, so a remedy naming a path with spaces can be pasted as printed.
 */
export function shellWord(word: string): string {
  return /^[A-Za-z0-9_./:@=+-]+$/.test(word) ? word : `'${word.replaceAll("'", `'\\''`)}'`;
}
