// The fish shell layer (design/0025-fish-shell-layer/): `ward shell init
// fish` emits the shorthands — `wrr`, `wrcd`, `wwcd`, `wws` — that work from
// any directory, `ward shell candidates KIND` is the feed they pick from, and
// `ward repo path` grew the shorthand ladder they lean on. The layer runs
// inside the human's shell, so the bar is the same as completion's: never
// hang, never prompt, never fail cryptically, and never be counted as usage.
import { afterAll, beforeAll, beforeEach, expect, test } from 'bun:test';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { verbPath } from '../../src/cli/telemetry.ts';
import { createWorkspace } from '../../src/workspace/create.ts';
import { gitOrThrow } from '../../src/workspace/git.ts';
import { addRepository } from '../../src/workspace/repos.ts';
import { defaultWorkspaceSessionPurpose, readSessions } from '../../src/workspace/sessions.ts';
import { applyGitTestEnv, makeTempDir, NO_GH, removeDir } from '../helpers.ts';

// -- the emitted script ----------------------------------------------------

test('`ward shell init fish` emits the four shorthands, the picker seam, and their completions', () => {
  const result = ward(['shell', 'init', 'fish'], alpha);
  expect(result.exitCode).toBe(0);
  const script = result.stdout;

  // The set, as functions — all but wrr must run logic, not expand.
  for (const fn of ['function wrr', 'function wrcd', 'function wwcd', 'function wws']) {
    expect(script).toContain(fn);
  }
  // Thin plumbing: every shorthand ends in a real `ward` invocation.
  expect(script).toContain('command ward repo refresh $argv');
  expect(script).toContain('command ward repo path $name');
  expect(script).toContain('command ward workspace path $name');
  expect(script).toContain('command ward session open $argv');
  // One answer to "which workspace?": wwcd and wws both ask the shared helper,
  // and the helper sits above them (design/0034-workspace-session-shorthand/).
  expect(script.split('__ward_workspace_root').length - 1).toBe(3); // defined once, called twice
  expect(script.indexOf('function wwcd')).toBeGreaterThan(
    script.indexOf('function __ward_workspace_root'),
  );

  // fzf is named on exactly two lines of running code — the presence probe
  // and the invocation — so swapping the picker is a two-function edit
  // (tool modularity). Everything else that says "fzf" is a comment.
  const running = script
    .split('\n')
    .filter((line) => line.includes('fzf') && !line.trimStart().startsWith('#'));
  const invocations = running.filter((line) => /^\s*command (-q )?fzf\b/.test(line));
  expect(invocations.length).toBe(2);
  // And both sit above the shorthands: the seam is a prologue, not a habit.
  expect(script.indexOf('function wrr')).toBeGreaterThan(script.lastIndexOf('command fzf'));

  // Completion for the new names — wrr by wrapping the command it forwards
  // to (never a second description of ward's tree), the two cd verbs by
  // calling back into the candidate feed.
  expect(script).toContain("complete -c wrr -w 'ward repo refresh'");
  expect(script).toContain("complete -c wrcd -f -a '(ward shell candidates repos)'");
  expect(script).toContain("complete -c wwcd -f -a '(ward shell candidates workspaces)'");
  expect(script).toContain("complete -c wws -f -a '(ward shell candidates workspaces)'");
});

test('the emitted script is valid fish — checked by fish itself', () => {
  if (!existsSync(FISH)) return; // hermetic: no fish on this machine, no claim
  const script = join(scratch, 'emitted.fish');
  writeFileSync(script, ward(['shell', 'init', 'fish'], alpha).stdout);
  const parsed = Bun.spawnSync([FISH, '--no-execute', script]);
  expect(parsed.stderr.toString()).toBe('');
  expect(parsed.exitCode).toBe(0);
});

test('an unknown shell is refused with the list of what exists, exit 1', () => {
  for (const shell of ['bash', 'zsh', 'csh', 'pwsh']) {
    const result = ward(['shell', 'init', shell], alpha);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain(`no shell layer for '${shell}'`);
    expect(result.stderr).toContain('available: fish');
  }
});

// -- the candidate feed ----------------------------------------------------

test('`shell candidates repos` unions the workspaces `repo path` searches, cued by the answerer', () => {
  register(beta); // beta first, so it is the default
  register(alpha);
  // From inside alpha: alpha answers `shared`, beta contributes `beta-only`.
  expect(rows(ward(['shell', 'candidates', 'repos'], alpha))).toEqual([
    ['shared', 'alpha'],
    ['beta-only', 'beta'],
  ]);
  // From nowhere: the registry alone decides, and only beta is reachable.
  expect(rows(ward(['shell', 'candidates', 'repos'], scratch)).map((row) => row[1])).toEqual([
    'beta',
    'beta',
  ]);
  expect(
    rows(ward(['shell', 'candidates', 'repos'], scratch))
      .map((row) => row[0])
      .sort(),
  ).toEqual(['beta-only', 'shared']);
});

test('`shell candidates workspaces` lists the registered ones, most recently used first', () => {
  register(alpha);
  register(beta);
  expect(rows(ward(['shell', 'candidates', 'workspaces'], scratch))).toEqual([
    ['beta', beta],
    ['alpha', alpha],
  ]);
});

test('a stale entry is never offered as somewhere to cd', () => {
  register(alpha);
  register(beta);
  removeDir(beta);
  expect(rows(ward(['shell', 'candidates', 'workspaces'], scratch))).toEqual([['alpha', alpha]]);
});

test('nothing to offer is exit 0 and silence — never an error in the shell', () => {
  for (const kind of ['repos', 'workspaces']) {
    const result = ward(['shell', 'candidates', kind], scratch);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe('');
    expect(result.stderr).toBe('');
  }
});

test('a registry that will not parse degrades to no candidates, never to shell noise', () => {
  register(alpha);
  writeFileSync(join(state, 'workspaces.md'), 'not a document at all\n');
  for (const kind of ['repos', 'workspaces']) {
    const result = ward(['shell', 'candidates', kind], scratch);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe('');
    expect(result.stderr).toBe('');
  }
});

test('an unknown candidate kind is refused by the parser, naming both', () => {
  const result = ward(['shell', 'candidates', 'bogus'], alpha);
  expect(result.exitCode).not.toBe(0);
  expect(result.stderr).toContain('repos');
  expect(result.stderr).toContain('workspaces');
});

// -- the shorthand ladder in `repo path` -----------------------------------

test('a human reaches a repository by exact name, unique prefix, or unique substring', () => {
  const table: ReadonlyArray<readonly [string, string, string]> = [
    ['shared', 'shared', 'exact'],
    ['sha', 'shared', 'prefix'],
    ['SHA', 'shared', 'prefix'], // the fuzzy rungs are case-insensitive
    ['are', 'shared', 'substring'],
  ];
  for (const [typed, expected, how] of table) {
    const result = ward(['repo', 'path', typed], alpha);
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe(join(alpha, 'repos', expected));
    // An inexact match is an implicit input, echoed on stderr — stdout stays
    // exactly one path, because a shell substitutes it directly.
    if (how === 'exact') expect(result.stderr).toBe('');
    else
      expect(result.stderr).toContain(`repository ${expected} — '${typed}' matched it by ${how}`);
  }
});

test('exact beats a shorthand, even one in a workspace searched earlier', async () => {
  // `shared-extra` in alpha (underfoot) and `shared` in beta: typing `shared`
  // must reach the repository actually named that, not the longer neighbour.
  await addRepository(alpha, remote, 'shared-extra');
  register(beta);
  const only = join(alpha, 'repos', 'shared');
  expect(ward(['repo', 'path', 'shared'], alpha).stdout.trim()).toBe(only);
});

test('an ambiguous shorthand is refused, naming every repository it could have meant', async () => {
  await addRepository(alpha, remote, 'shared-extra');
  const result = ward(['repo', 'path', 'share'], alpha);
  expect(result.exitCode).toBe(1);
  expect(result.stderr).toContain("'share' matches 2 repositories in workspace 'alpha'");
  expect(result.stderr).toContain('shared, shared-extra');
  expect(result.stderr).toContain('name one exactly');
});

test('a declared agent resolves names exactly — and is told what the shorthand meant', () => {
  const exact = ward(['repo', 'path', 'shared'], alpha, { WARD_AGENT: 'agent-1' });
  expect(exact.exitCode).toBe(0);
  expect(exact.stdout.trim()).toBe(join(alpha, 'repos', 'shared'));

  const shorthand = ward(['repo', 'path', 'sha'], alpha, { WARD_AGENT: 'agent-1' });
  expect(shorthand.exitCode).toBe(1);
  expect(shorthand.stderr).toContain('no repository named');
  expect(shorthand.stderr).toContain("did you mean 'shared'?");
  expect(shorthand.stderr).toContain('a declared agent resolves names exactly');
});

test('a name nothing resembles is refused without a near-miss to chase', () => {
  const result = ward(['repo', 'path', 'zzz'], alpha, { WARD_AGENT: 'agent-1' });
  expect(result.exitCode).toBe(1);
  expect(result.stderr).not.toContain('did you mean');
});

// -- machinery is not usage -------------------------------------------------

test('a candidate feed writes no telemetry row and never churns the MRU; `shell init` does both', () => {
  register(alpha);
  register(beta); // beta is now most recently used
  const usage = () => {
    const dir = join(alpha, '.ward', 'telemetry');
    return Bun.spawnSync(['ls', dir]).exitCode === 0
      ? readFileSync(join(dir, monthFile()), 'utf8').trim().split('\n').filter(Boolean)
      : [];
  };

  ward(['shell', 'candidates', 'repos'], alpha);
  ward(['shell', 'candidates', 'workspaces'], alpha);
  expect(usage()).toEqual([]);
  // The MRU is untouched: alpha was invoked in, twice, and beta still leads.
  expect(rows(ward(['shell', 'candidates', 'workspaces'], scratch))[0]?.[0]).toBe('beta');

  // Generating the layer is the deliberate once-per-install act, and is.
  ward(['shell', 'init', 'fish'], alpha);
  const rowsWritten = usage().map((line) => JSON.parse(line) as { verb: string; exit: number });
  expect(rowsWritten).toEqual([expect.objectContaining({ verb: 'shell init', exit: 0 })]);
  expect(rows(ward(['shell', 'candidates', 'workspaces'], scratch))[0]?.[0]).toBe('alpha');
});

test('the verb path splits `shell` into its two sub-verbs and nothing else', () => {
  expect(verbPath(['shell', 'init', 'fish'])).toBe('shell init');
  expect(verbPath(['shell', 'candidates', 'repos'])).toBe('shell candidates');
  expect(verbPath(['shell'])).toBe('shell');
});

// -- doctor closes the degradation loop -------------------------------------

test('doctor names the picker either way — the condition the layer degrades on (§20)', () => {
  const withFzf = ward(['doctor'], alpha, { PATH: `${fakeBin}:${toolBin}` });
  expect(withFzf.stdout).toContain('picker — fzf available');

  const without = ward(['doctor'], alpha, { PATH: toolBin });
  expect(without.stdout).toContain('picker — fzf not found');
  expect(without.stdout).toContain('wrcd/wwcd list the candidates');
  // Never an error: not installing a fuzzy finder is a choice, not a fault.
  expect(without.stdout).not.toContain('✗ picker');
});

// -- the shorthands, run by a real fish -------------------------------------

test('wrcd and wwcd cd where ward says, and degrade to a listing without a picker', () => {
  if (!existsSync(FISH)) return;
  register(alpha);
  const script = join(scratch, 'layer.fish');
  writeFileSync(script, ward(['shell', 'init', 'fish'], alpha).stdout);

  // wrcd by exact name and by shorthand; wwcd by name — with a picker on PATH
  // that is never reached, because ward resolved the name.
  const resolved = fish(
    `source ${script}; wrcd shared; and pwd; cd /; wrcd sha 2>/dev/null; and pwd; cd /; wwcd alpha; and pwd`,
    `${fakeBin}:${wardBin}:${toolBin}`,
  );
  expect(resolved.stdout.trim().split('\n')).toEqual([
    join(alpha, 'repos', 'shared'),
    join(alpha, 'repos', 'shared'),
    alpha,
  ]);

  // No picker: a listing of what could have been meant, and a non-zero
  // return — no hang, no prompt, no cryptic failure (§20).
  const bare = fish(`source ${script}; wrcd; echo "exit=$status"`, `${wardBin}:${toolBin}`);
  expect(bare.stderr).toContain('no picker installed');
  expect(bare.stderr).toContain('shared');
  expect(bare.stdout).toContain('exit=127');

  // wwcd with neither a name nor a picker takes the honest lesser answer:
  // the default workspace, said out loud.
  const home = fish(`source ${script}; cd /; wwcd; and pwd`, `${wardBin}:${toolBin}`);
  expect(home.stderr).toContain('going to the default workspace');
  expect(home.stdout.trim()).toBe(alpha);
});

test('a picked candidate yields its NAME alone — the CUE never reaches the verb', () => {
  if (!existsSync(FISH)) return;
  register(alpha);
  const script = join(scratch, 'layer.fish');
  writeFileSync(script, ward(['shell', 'init', 'fish'], alpha).stdout);

  // A picker that SELECTS, the half the exit-1 fake never exercises: real fzf
  // prints the chosen input line in full — NAME, tab, CUE and all. `--with-nth`
  // shapes only the display, so the layer must cut the name itself; this fake
  // "picks" the first candidate exactly as fzf would hand it back.
  // Builtins only (read/printf): this PATH holds exactly the three fixture
  // dirs, so an external `head` would silently vanish and fake a cancel.
  const pickBin = join(scratch, 'picking-fzf');
  mkdirSync(pickBin, { recursive: true });
  writeFileSync(join(pickBin, 'fzf'), '#!/bin/sh\nIFS= read -r line\nprintf \'%s\\n\' "$line"\n');
  Bun.spawnSync(['chmod', '+x', join(pickBin, 'fzf')]);

  const picked = fish(
    `source ${script}; cd /; wwcd; and pwd; wrcd; and pwd`,
    `${pickBin}:${wardBin}:${toolBin}`,
  );
  expect(picked.stderr).not.toContain('no registered workspace');
  expect(picked.stderr).not.toContain('no repository named');
  expect(picked.stdout.trim().split('\n')).toEqual([alpha, join(alpha, 'repos', 'shared')]);
});

test('wws lands in a workspace and opens a session there; the rest of argv reaches `ward session open`', async () => {
  if (!existsSync(FISH)) return;
  register(alpha);
  const script = join(scratch, 'layer.fish');
  writeFileSync(script, ward(['shell', 'init', 'fish'], alpha).stdout);

  // Named, with a purpose: cd to alpha, then `ward session open` runs THERE
  // with everything after the name — `--handle` records without launching,
  // which is what keeps this hermetic. The shell is left standing in the
  // workspace, where wwcd would have left it.
  const named = fish(
    `source ${script}; cd /; wws alpha --purpose 'from the shell' --handle test:1; and pwd`,
    `${fakeBin}:${wardBin}:${toolBin}`,
  );
  expect(named.exitCode).toBe(0);
  expect(named.stdout).toContain('opened session workspace-1');
  expect(named.stdout.trim().split('\n').at(-1)).toBe(alpha);
  expect((await readSessions(alpha, ''))[0]).toMatchObject({
    scope: 'workspace',
    purpose: 'from the shell',
    handle: 'test:1',
  });

  // A leading flag is not a name: with no picker, wws takes the default
  // workspace (said out loud) and a purpose nobody gave is the stable default.
  const bare = fish(
    `source ${script}; cd /; wws --handle test:2; and pwd`,
    `${wardBin}:${toolBin}`,
  );
  expect(bare.exitCode).toBe(0);
  expect(bare.stderr).toContain('going to the default workspace');
  expect(bare.stdout).toContain('opened session workspace-2');
  expect(bare.stdout.trim().split('\n').at(-1)).toBe(alpha);
  const [, bareRecord] = await readSessions(alpha, '');
  expect(bareRecord?.purpose).toBe(defaultWorkspaceSessionPurpose(bareRecord?.openedAt ?? ''));

  // A name ward cannot resolve, and no picker: the listing, exit 127, and no
  // session — the cd never happened, so nothing ran in the wrong place.
  const unknown = fish(
    `source ${script}; cd /; wws zzz --handle test:3; echo "exit=$status"; pwd`,
    `${wardBin}:${toolBin}`,
  );
  expect(unknown.stderr).toContain('no picker installed');
  expect(unknown.stdout).toContain('exit=127');
  expect(unknown.stdout.trim().split('\n').at(-1)).toBe('/');
  expect((await readSessions(alpha, '')).length).toBe(2);
});

test('wrr forwards its arguments to `ward repo refresh`, from outside any workspace', () => {
  if (!existsSync(FISH)) return;
  register(alpha);
  const script = join(scratch, 'layer.fish');
  writeFileSync(script, ward(['shell', 'init', 'fish'], alpha).stdout);
  const run = fish(`source ${script}; cd /; wrr --json`, `${wardBin}:${toolBin}`);
  expect(run.exitCode).toBe(0);
  // The registry fallback answered, and said so — and the flag reached ward.
  expect(run.stderr).toContain('from the registry');
  expect(JSON.parse(run.stdout)).toEqual(expect.arrayContaining([expect.anything()]));
});

// -- setup -----------------------------------------------------------------
// Two workspaces per case — `alpha` (repository `shared`) and `beta`
// (`shared`, `beta-only`) — a fresh global state directory so the registry
// verbs cannot see each other's cases, and a `ward` shim plus a fake `fzf` on
// a scratch PATH so the fish cases control what is installed.

const FISH = Bun.which('fish') ?? '/usr/bin/fish';
const cliPath = new URL('../../src/cli/index.ts', import.meta.url).pathname;

let scratch: string;
let remote: string;
let alpha: string;
let beta: string;
let state: string;
let wardBin: string;
let fakeBin: string;
let toolBin: string;
let caseId = 0;

/** The CLI, with this case's global directories and a hermetic environment. */
function ward(argv: string[], cwd: string, env: Record<string, string | undefined> = {}) {
  const result = Bun.spawnSync([process.execPath, cliPath, ...argv], {
    cwd,
    env: {
      ...process.env,
      NO_COLOR: '1',
      WARD_GH: NO_GH,
      WARD_STATE_DIR: state,
      WARD_CONFIG_DIR: join(state, '..', 'config'),
      WARD_AGENT: undefined,
      ...env,
    },
  });
  return {
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  };
}

/** A fish one-liner with a chosen PATH — how "is fzf installed?" is varied. */
function fish(script: string, path: string) {
  const result = Bun.spawnSync([FISH, '--no-config', '-c', script], {
    cwd: scratch,
    env: {
      ...process.env,
      PATH: path,
      NO_COLOR: '1',
      WARD_GH: NO_GH,
      WARD_STATE_DIR: state,
      WARD_CONFIG_DIR: join(state, '..', 'config'),
      WARD_AGENT: undefined,
    },
  });
  return {
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  };
}

/** The candidate feed's `NAME<TAB>CUE` lines, parsed. */
function rows(result: { stdout: string }): string[][] {
  return result.stdout
    .split('\n')
    .filter((line) => line !== '')
    .map((line) => line.split('\t'));
}

function register(path: string): void {
  ward(['workspace', 'register', path], scratch);
}

function monthFile(): string {
  return `usage-${new Date().toISOString().slice(0, 7)}.jsonl`;
}

beforeAll(async () => {
  applyGitTestEnv();
  scratch = makeTempDir();
  remote = join(scratch, 'remote.git');
  gitOrThrow('.', 'init', '--bare', '--initial-branch=main', remote);
  const seed = join(scratch, 'seed');
  gitOrThrow('.', 'clone', remote, seed);
  await Bun.write(join(seed, 'README.md'), 'demo\n');
  gitOrThrow(seed, 'checkout', '-b', 'main');
  gitOrThrow(seed, 'add', '-A');
  gitOrThrow(seed, 'commit', '-m', 'seed');
  gitOrThrow(seed, 'push', '-u', 'origin', 'main');

  // Three one-file PATH directories, so every case states exactly what is
  // installed — the picker's presence is the variable these tests turn, and
  // inheriting the machine's PATH would let its own fzf decide the answer.
  // `toolBin` is the floor (git and nothing else); `fakeBin` adds a picker;
  // `wardBin` holds the `ward` the emitted script invokes by name.
  toolBin = join(scratch, 'tools');
  fakeBin = join(scratch, 'with-fzf');
  wardBin = join(scratch, 'bin');
  const realGit = Bun.which('git') ?? '/usr/bin/git';
  await Bun.write(join(toolBin, 'git'), `#!/bin/sh\nexec ${realGit} "$@"\n`);
  await Bun.write(join(wardBin, 'ward'), `#!/bin/sh\nexec ${process.execPath} ${cliPath} "$@"\n`);
  // The picker is never actually entered in these cases — the fish cases all
  // resolve their names — so a fake that exits is enough to be "installed".
  await Bun.write(join(fakeBin, 'fzf'), '#!/bin/sh\nexit 1\n');
  Bun.spawnSync(['chmod', '+x', join(toolBin, 'git'), join(wardBin, 'ward'), join(fakeBin, 'fzf')]);
});

beforeEach(async () => {
  caseId += 1;
  const home = join(scratch, `case-${caseId}`);
  state = join(home, 'state');
  alpha = join(home, 'alpha');
  beta = join(home, 'beta');
  await createWorkspace(alpha);
  await createWorkspace(beta);
  await addRepository(alpha, remote, 'shared');
  await addRepository(beta, remote, 'shared');
  await addRepository(beta, remote, 'beta-only');
});

afterAll(() => {
  removeDir(scratch);
});
