// Adoption (design/0027-shell-adoption/): `ward shell adopt fish [NAME…]`
// writes the REAL definition of a shorthand the human names into files they
// own, `ward shell diff fish NAME` shows what has moved on, and doctor
// supervises the drift per alias — ok, the "needs you" warning, or "yours,
// kept". Nothing but `adopt` writes, nothing is written that was not named,
// and the offering with no names is a listing (§18).
import { afterAll, beforeAll, beforeEach, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { shellAdoptShape } from '../../src/cli/schema.ts';
import { verbPath } from '../../src/cli/telemetry.ts';
import { FISH_ADOPTED_MARKER } from '../../src/shell/adopt.ts';
import { unifiedDiff } from '../../src/shell/diff.ts';
import { emitShellLayer } from '../../src/shell/layer.ts';
import { FISH_HELPERS, FISH_SHORTHANDS } from '../../src/shell/shorthands.ts';
import { type Finding, runDoctor } from '../../src/workspace/doctor.ts';
import { applyGitTestEnv, makeTempDir, NO_GH, removeDir, runWardEnv } from '../helpers.ts';

// -- the offering: naming nothing writes nothing ----------------------------

test('no names lists every shorthand with its standing, and writes not one byte', () => {
  const result = adopt([]);
  expect(result.exitCode).toBe(0);
  for (const shorthand of FISH_SHORTHANDS) {
    expect(result.stdout).toContain(`available  ${shorthand.name}`);
    expect(result.stdout).toContain(shorthand.summary);
  }
  // The selection surface says how to select — the next step never needs the README.
  expect(result.stdout).toContain('adopt one by name (ward shell adopt fish wrr)');
  expect(result.stdout).toContain('--all');
  expect(written()).toEqual([]);
});

// -- what a name writes -----------------------------------------------------

const fileSets: ReadonlyArray<{ name: string; files: readonly string[] }> = [
  // `wrr` forwards $argv and calls no helper, so adopting it writes exactly two files:
  // per-alias granularity is honest in both directions.
  { name: 'wrr', files: ['functions/wrr.fish', 'completions/wrr.fish'] },
  {
    name: 'wrcd',
    files: [
      'functions/wrcd.fish',
      'completions/wrcd.fish',
      // Transitively: wrcd → __ward_choose → both picker functions. An adopted
      // wrcd that arrived without them would fail the first time a name did
      // not resolve.
      'functions/__ward_picker_present.fish',
      'functions/__ward_picker.fish',
      'functions/__ward_choose.fish',
    ],
  },
  {
    name: 'wwcd',
    files: [
      'functions/wwcd.fish',
      'completions/wwcd.fish',
      // wwcd → __ward_workspace_root → __ward_choose → both picker functions.
      'functions/__ward_picker_present.fish',
      'functions/__ward_picker.fish',
      'functions/__ward_choose.fish',
      'functions/__ward_workspace_root.fish',
    ],
  },
  {
    // wws resolves the workspace exactly as wwcd does, through the same helper.
    name: 'wws',
    files: [
      'functions/wws.fish',
      'completions/wws.fish',
      'functions/__ward_picker_present.fish',
      'functions/__ward_picker.fish',
      'functions/__ward_choose.fish',
      'functions/__ward_workspace_root.fish',
    ],
  },
];

for (const row of fileSets) {
  test(`adopting ${row.name} writes its function, its completion, and exactly the helpers it needs`, () => {
    const result = adopt([row.name]);
    expect(result.exitCode).toBe(0);
    expect(written()).toEqual([...row.files].sort());
    for (const file of row.files) expect(result.stdout).toContain(`written    ${file}`);
    // Every file says whose it is, in bytes, so classification needs no manifest (§17).
    for (const file of row.files) {
      expect(readFileSync(join(fishDir(), file), 'utf8').startsWith(FISH_ADOPTED_MARKER)).toBe(
        true,
      );
    }
    expect(result.stdout).toContain(`current    ${row.name}`);
  });
}

test('the adopted file holds the real definition — not a trampoline back into ward', () => {
  adopt(['wrcd']);
  const body = readFileSync(join(fishDir(), 'functions', 'wrcd.fish'), 'utf8');
  // The whole point: the bytes are a snapshot, so "wrcd has changed" is diffable.
  expect(body).toContain("function wrcd --description 'cd to a repository checkout");
  expect(body).toContain('set name (__ward_choose repos repo "$name")');
  expect(body).not.toContain('ward shell init');
  // And it explains its own lifecycle to whoever opens it in a dotfiles repo.
  expect(body).toContain('ward shell diff fish wrcd');
  expect(body).toContain('Yours now');
});

test('--all adopts every shorthand ward offers, in one convergent pass', () => {
  const result = adopt(['--all']);
  expect(result.exitCode).toBe(0);
  for (const shorthand of FISH_SHORTHANDS)
    expect(result.stdout).toContain(`current    ${shorthand.name}`);
  const files = written();
  for (const helper of FISH_HELPERS) expect(files).toContain(`functions/${helper.name}.fish`);
  expect(files.length).toBe(FISH_SHORTHANDS.length * 2 + FISH_HELPERS.length);
});

test('re-adopting a current shorthand is a visible no-op — every file unchanged, nothing rewritten', () => {
  adopt(['wrcd']);
  const stamps = written().map((file) => Bun.file(join(fishDir(), file)).lastModified);
  const again = adopt(['wrcd']);
  expect(again.exitCode).toBe(0);
  expect(again.stdout).not.toContain('written');
  for (const file of written()) expect(again.stdout).toContain(`unchanged  ${file}`);
  // Convergence is not merely reported: an unchanged file is not touched, so a
  // tracked dotfiles repo sees no churn from a re-run (§6).
  expect(written().map((file) => Bun.file(join(fishDir(), file)).lastModified)).toEqual(stamps);
});

// -- the four words the offering speaks -------------------------------------

const statuses: ReadonlyArray<{ name: string; stage: () => void; status: string }> = [
  { name: 'available — nothing adopted at this name', stage: () => {}, status: 'available' },
  { name: 'current — adopted and byte-identical', stage: () => adopt(['wrr']), status: 'current' },
  {
    name: "changed — ward's own file, from a ward that defined wrr differently",
    stage: () => {
      adopt(['wrr']);
      append('functions/wrr.fish', '\n# an older ward wrote this\n');
    },
    status: 'changed',
  },
  {
    name: 'changed — a shared helper drifted under an otherwise current shorthand',
    stage: () => {
      adopt(['wrr']);
      append('completions/wrr.fish', '\ncomplete -c wrr -f\n');
    },
    status: 'changed',
  },
  {
    name: 'yours — a file at that name carrying no ward marker',
    stage: () =>
      write('functions/wrr.fish', 'function wrr; command ward repo refresh --stash; end\n'),
    status: 'yours',
  },
  {
    name: 'unreadable — a directory where the function file belongs',
    stage: () => mkdirSync(join(fishDir(), 'functions', 'wrr.fish'), { recursive: true }),
    status: 'unreadable',
  },
];

for (const row of statuses) {
  test(`the offering classifies from bytes alone — ${row.name}`, () => {
    row.stage();
    const listing = adopt([]);
    expect(listing.exitCode).toBe(0);
    expect(listing.stdout).toContain(`${row.status.padEnd(9)}  wrr`);
  });
}

// -- a file ward did not write is never overwritten -------------------------

test('a `yours` file is kept, and adopting says so rather than claiming it landed', () => {
  const mine = 'function wrr; command ward repo refresh --stash; end\n';
  write('functions/wrr.fish', mine);
  const result = adopt(['wrr']);
  expect(result.exitCode).toBe(0); // declining to overwrite is not a failure
  expect(result.stdout).toContain('kept       functions/wrr.fish');
  expect(result.stdout).toContain('yours      wrr');
  expect(result.stdout).toContain('--force replaces it');
  expect(readFileSync(join(fishDir(), 'functions', 'wrr.fish'), 'utf8')).toBe(mine);
  // The completion beside it is ward's to write — only the marked file is spared.
  expect(result.stdout).toContain('written    completions/wrr.fish');
});

test('--force replaces a file ward did not write, and only when asked', () => {
  write('functions/wrr.fish', 'function wrr; end\n');
  const forced = adopt(['wrr', '--force']);
  expect(forced.exitCode).toBe(0);
  expect(forced.stdout).toContain('replaced   functions/wrr.fish');
  expect(forced.stdout).toContain('current    wrr');
  expect(readFileSync(join(fishDir(), 'functions', 'wrr.fish'), 'utf8')).toContain(
    FISH_ADOPTED_MARKER,
  );
});

// -- --dir: the same files, somewhere else ----------------------------------

test('--dir writes the same bytes into an arbitrary fish root, naming its own location nowhere', () => {
  const stow = join(scratch, `stow-${caseId}`);
  const there = runWardEnv(['shell', 'adopt', 'fish', '--all', '--dir', stow], scratch, env());
  expect(there.exitCode).toBe(0);
  adopt(['--all']);

  // The tree is a fish configuration root, not a flat dump — which is exactly
  // what a stow package or a dotfiles repo wants to symlink into place.
  const live = written();
  expect(written(stow)).toEqual(live);
  for (const file of live) {
    const bytes = readFileSync(join(stow, file), 'utf8');
    expect(bytes).toBe(readFileSync(join(fishDir(), file), 'utf8'));
    // Location-independent by construction: no written byte names where it was
    // written, or the file would be wrong the moment it was symlinked.
    expect(bytes).not.toContain(stow);
    expect(bytes).not.toContain(fishDir());
  }
  // And nothing landed in the live configuration on the --dir run: the two
  // roots are independent.
  expect(existsSync(join(stow, 'conf.d'))).toBe(false);
});

test('--dir is honored by the diff too, so a dotfiles repo can ask the same question', () => {
  const stow = join(scratch, `stow-diff-${caseId}`);
  runWardEnv(['shell', 'adopt', 'fish', 'wrr', '--dir', stow], scratch, env());
  const path = join(stow, 'functions', 'wrr.fish');
  writeFileSync(path, `${readFileSync(path, 'utf8')}\n# a tweak in the dotfiles repo\n`);
  const diff = runWardEnv(['shell', 'diff', 'fish', 'wrr', '--dir', stow], scratch, env());
  expect(diff.exitCode).toBe(0);
  expect(diff.stdout).toContain('--- functions/wrr.fish (adopted)');
});

// -- the diff: see it, without taking it ------------------------------------

test('`shell diff` prints a unified diff of what changed, writes nothing, and exits 0', () => {
  adopt(['wrr']);
  append('functions/wrr.fish', '\n# my own tweak\n');
  const before = readFileSync(join(fishDir(), 'functions', 'wrr.fish'), 'utf8');
  const diff = runWardEnv(['shell', 'diff', 'fish', 'wrr'], scratch, env());
  expect(diff.exitCode).toBe(0);
  expect(diff.stdout).toContain('--- functions/wrr.fish (adopted)');
  expect(diff.stdout).toContain('+++ functions/wrr.fish (this ward)');
  expect(diff.stdout).toContain('-# my own tweak');
  // The `-` side is the human's copy and the `+` side is ward's offer: the
  // human is being shown what adopting would do TO their file.
  expect(diff.stdout).not.toContain('+# my own tweak');
  expect(readFileSync(join(fishDir(), 'functions', 'wrr.fish'), 'utf8')).toBe(before);
});

test("nothing to show is silence — a current shorthand, and one that is not ward's at all", () => {
  adopt(['wrr']);
  expect(runWardEnv(['shell', 'diff', 'fish', 'wrr'], scratch, env()).stdout).toBe('');
  // Ward has no claim on a file it did not write, so it is not diffed against
  // ward's definition — that would frame somebody's arrangement as a deviation.
  write('functions/wwcd.fish', 'function wwcd; cd /tmp; end\n');
  expect(runWardEnv(['shell', 'diff', 'fish', 'wwcd'], scratch, env()).stdout).toBe('');
  // With no names it asks about every shorthand at once.
  append('functions/wrr.fish', '\n# drift\n');
  const all = runWardEnv(['shell', 'diff', 'fish'], scratch, env());
  expect(all.stdout).toContain('functions/wrr.fish');
  expect(all.stdout).not.toContain('wwcd');
});

test('the diff agrees with `diff -u` line for line, on the shape of edit these files get', () => {
  // Not a fuzz for its own sake: the whole feature rests on the human
  // believing the diff, so the answer is checked against the tool they would
  // have run. Deterministic (a seeded generator), and realistic — mostly
  // unique lines with a handful of edits, which is what a shell function is.
  let seed = 20260821;
  const random = (): number => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  const a = join(scratch, 'diff-a');
  const b = join(scratch, 'diff-b');
  for (let round = 0; round < 40; round++) {
    const base = Array.from(
      { length: 12 + Math.floor(random() * 20) },
      (_, i) => `line ${i} of ${round}`,
    );
    const edited = [...base];
    for (let edit = 0; edit < 1 + Math.floor(random() * 4); edit++) {
      const at = Math.floor(random() * edited.length);
      const kind = Math.floor(random() * 3);
      if (kind === 0) edited.splice(at, 1);
      else if (kind === 1) edited.splice(at, 0, `inserted ${round}.${edit}`);
      else edited[at] = `changed ${round}.${edit}`;
    }
    const from = `${base.join('\n')}\n`;
    const to = `${edited.join('\n')}\n`;
    writeFileSync(a, from);
    writeFileSync(b, to);
    const expected = Bun.spawnSync([
      'diff',
      '-u',
      '--label',
      'A',
      '--label',
      'B',
      a,
      b,
    ]).stdout.toString();
    expect(unifiedDiff(from, to, { from: 'A', to: 'B' })).toBe(expected);
  }
});

// -- doctor supervises the drift, per alias ---------------------------------

const findings: ReadonlyArray<{
  name: string;
  stage: () => void;
  expected: () => ReadonlyArray<Record<string, unknown>>;
}> = [
  {
    name: 'nothing adopted on a machine with no fish configuration: silence',
    stage: () => {},
    expected: () => [],
  },
  {
    name: 'a fish user who has adopted nothing: one dim line naming the set, never a warning',
    stage: () => mkdirSync(fishDir(), { recursive: true }),
    expected: () => [
      {
        check: 'fish shorthands',
        severity: 'info',
        message: expect.stringContaining('wrr, wrcd, wwcd, wws not adopted'),
      },
    ],
  },
  {
    name: 'adopted and current: an ok naming the file, and the rest still one dim line',
    stage: () => adopt(['wrr']),
    expected: () => [
      {
        check: 'fish shorthand wrr',
        severity: 'ok',
        message: expect.stringContaining('matches what this ward defines'),
      },
      { check: 'fish shorthands', severity: 'info' },
    ],
  },
  {
    name: 'changed: the needs-you warning naming the alias, the file, the diff, and the re-adopt',
    stage: () => {
      adopt(['wrr']);
      append('functions/wrr.fish', '\n# an older ward\n');
    },
    expected: () => [
      {
        check: 'fish shorthand wrr',
        severity: 'warn',
        message: expect.stringContaining('ward shell diff fish wrr'),
      },
      { check: 'fish shorthands', severity: 'info' },
    ],
  },
  {
    name: 'yours: info, kept, never told to overwrite',
    stage: () => write('functions/wrr.fish', 'function wrr; end\n'),
    expected: () => [
      {
        check: 'fish shorthand wrr',
        severity: 'info',
        message: expect.stringContaining('your own `wrr`, kept'),
      },
      { check: 'fish shorthands', severity: 'info' },
    ],
  },
  {
    name: 'unreadable: warn with the reason, never a guess about what the file holds',
    stage: () => mkdirSync(join(fishDir(), 'functions', 'wrr.fish'), { recursive: true }),
    expected: () => [
      {
        check: 'fish shorthand wrr',
        severity: 'warn',
        message: expect.stringContaining('could not be read'),
      },
      { check: 'fish shorthands', severity: 'info' },
    ],
  },
  {
    name: 'every shorthand adopted: one ok each and no remainder line at all',
    stage: () => adopt(['--all']),
    expected: () =>
      FISH_SHORTHANDS.map((shorthand) => ({
        check: `fish shorthand ${shorthand.name}`,
        severity: 'ok',
      })),
  },
];

for (const row of findings) {
  test(`doctor — ${row.name}`, async () => {
    row.stage();
    const report = await runDoctor(scratch);
    expect(adoptionFindings(report.machine)).toMatchObject([...row.expected()]);
    // A convenience can never make a machine unhealthy (0024's posture, kept).
    expect(report.healthy).toBe(true);
  });
}

test('doctor names the one condition only two install styles can produce: the layer shadows them', async () => {
  adopt(['wrr']);
  write(join('conf.d', 'ward.fish'), emitShellLayer('fish'));
  const report = await runDoctor(scratch);
  const shadow = report.machine.find((finding) => finding.check === 'fish shorthands shadowed');
  expect(shadow?.severity).toBe('warn');
  expect(shadow?.message).toContain('and wins');
  expect(shadow?.message).toContain('Keep one style');
  expect(report.healthy).toBe(true);

  // Only when something was actually adopted: a layer on its own is 0026's
  // business and says nothing about adoption.
  removeDir(join(fishDir(), 'functions'));
  const alone = await runDoctor(scratch);
  expect(alone.machine.some((finding) => finding.check === 'fish shorthands shadowed')).toBe(false);
});

test('the human rendering marks a changed shorthand and carries both choices; the run exits 0', () => {
  adopt(['wrr']);
  append('functions/wrr.fish', '\n# an older ward\n');
  const result = runWardEnv(['doctor'], scratch, env());
  expect(result.exitCode).toBe(0); // report-only: drift never fails the run
  expect(result.stdout).toContain('! fish shorthand wrr — wrr has changed');
  expect(result.stdout).toContain('See it: ward shell diff fish wrr');
  expect(result.stdout).toContain('Take it: ward shell adopt fish wrr');
  expect(result.stdout).toContain('Or keep yours');
});

// -- one source of truth ----------------------------------------------------

test('both assemblies are built from the same units — the layer holds every adopted definition verbatim', () => {
  const layer = emitShellLayer('fish');
  adopt(['--all']);
  for (const shorthand of FISH_SHORTHANDS) {
    // What `shell init` emits and what `shell adopt` writes are the same fish,
    // framed differently. If these ever diverge the shorthands have forked.
    expect(layer).toContain(shorthand.body);
    expect(layer).toContain(shorthand.completion);
    expect(readFileSync(join(fishDir(), 'functions', `${shorthand.name}.fish`), 'utf8')).toContain(
      shorthand.body,
    );
  }
  for (const helper of FISH_HELPERS) {
    expect(layer).toContain(helper.body);
    expect(readFileSync(join(fishDir(), 'functions', `${helper.name}.fish`), 'utf8')).toContain(
      helper.body,
    );
  }
  // The two markers are distinct: a conf.d layer must never be read as an
  // adopted function, nor the reverse.
  expect(layer).not.toContain(FISH_ADOPTED_MARKER);
});

// -- both audiences ---------------------------------------------------------

test('--json carries the offering and the write report in the shape ward schema documents', () => {
  const offering = shellAdoptShape.parse(JSON.parse(adopt(['--json']).stdout));
  expect(offering.offeredOnly).toBe(true);
  expect(offering.dir).toBe(fishDir());
  expect(offering.shorthands).toMatchObject(
    FISH_SHORTHANDS.map((shorthand) => ({ name: shorthand.name, status: 'available', files: [] })),
  );

  const written = shellAdoptShape.parse(JSON.parse(adopt(['wrr', '--json']).stdout));
  expect(written.offeredOnly).toBe(false);
  expect(written.shorthands).toEqual([
    {
      name: 'wrr',
      summary: 'ward repo refresh, arguments and all, from any directory',
      status: 'current',
      files: [
        { path: 'functions/wrr.fish', outcome: 'written' },
        { path: 'completions/wrr.fish', outcome: 'written' },
      ],
    },
  ]);
  // The status is the standing AFTER the run, so a re-run reports the truth.
  const again = shellAdoptShape.parse(JSON.parse(adopt(['wrr', '--json']).stdout));
  expect(again.shorthands[0]?.files.every((file) => file.outcome === 'unchanged')).toBe(true);
});

test('the verb path splits `shell` into its four sub-verbs and nothing else', () => {
  expect(verbPath(['shell', 'adopt', 'fish', 'wrr'])).toBe('shell adopt');
  expect(verbPath(['shell', 'diff', 'fish'])).toBe('shell diff');
  expect(verbPath(['shell', 'init', 'fish'])).toBe('shell init');
  expect(verbPath(['shell', 'candidates', 'repos'])).toBe('shell candidates');
});

// -- refusals name the fix --------------------------------------------------

test('an unbuilt shell, an unoffered name, and two contradicting selections are each refused legibly', () => {
  const bash = runWardEnv(['shell', 'adopt', 'bash'], scratch, env());
  expect(bash.exitCode).toBe(1);
  expect(bash.stderr).toContain("no shell adoption for 'bash' — available: fish");
  expect(bash.stderr).toContain('unbuilt, not unsupported');

  // The parser holds the offered set, so an unknown name is refused before
  // anything is read or written — and the refusal lists what exists.
  const unknown = runWardEnv(['shell', 'adopt', 'fish', 'wxx'], scratch, env());
  expect(unknown.exitCode).toBe(1);
  expect(unknown.stderr).toContain('"wrr"');
  expect(unknown.stderr).toContain('"wwcd"');

  const both = runWardEnv(['shell', 'adopt', 'fish', 'wrr', '--all'], scratch, env());
  expect(both.exitCode).toBe(1);
  expect(both.stderr).toContain('--all adopts every shorthand');
  expect(written()).toEqual([]);
});

// -- the real proof: fish runs what was adopted -----------------------------

test('an adopted shorthand parses, autoloads, and runs under a real fish', () => {
  if (!existsSync(FISH)) return; // hermetic: no fish on this machine, no claim
  adopt(['--all']);
  for (const file of written()) {
    const parsed = Bun.spawnSync([FISH, '--no-execute', join(fishDir(), file)]);
    expect(parsed.stderr.toString()).toBe('');
    expect(parsed.exitCode).toBe(0);
  }

  // Autoloading is the whole reason each function is its own file named after
  // it: fish loads `functions/wwcd.fish` when `wwcd` is called, and
  // `functions/__ward_choose.fish` when that calls the helper.
  const run = fish(
    `set -p fish_function_path ${join(fishDir(), 'functions')}; ` +
      `set -p fish_complete_path ${join(fishDir(), 'completions')}; ` +
      `cd /; wwcd; and pwd; echo "complete: "(complete -C 'wwcd ')`,
  );
  // No picker on this PATH, so `wwcd` takes the honest lesser answer and says so.
  expect(run.stderr).toContain('no picker installed — going to the default workspace');
  expect(run.stdout).toContain(workspace);
  // And the adopted completion file answered from ward's own candidate feed.
  expect(run.stdout).toContain(`complete: ${workspaceName}`);
});

// -- setup -------------------------------------------------------------------
// A throwaway `$XDG_CONFIG_HOME` per case — the seam is the XDG variable
// itself, so no case can touch the developer's own `~/.config/fish`
// (test/helpers.ts pins it for every suite). `scratch` is deliberately not a
// workspace: adoption is per-user MACHINE state and must work from anywhere.

const FISH = Bun.which('fish') ?? '/usr/bin/fish';
const cliPath = new URL('../../src/cli/index.ts', import.meta.url).pathname;

let scratch: string;
let fishHome: string;
let state: string;
let workspace: string;
let workspaceName: string;
let toolBin: string;
let wardBin: string;
let caseId = 0;

function fishDir(): string {
  return join(fishHome, 'fish');
}

/** The environment every CLI call in this suite runs under: this case's XDG root. */
function env(): Record<string, string> {
  return {
    XDG_CONFIG_HOME: fishHome,
    NO_COLOR: '1',
    WARD_GH: NO_GH,
    WARD_STATE_DIR: state,
    WARD_CONFIG_DIR: join(state, '..', 'config'),
  };
}

/** `ward shell adopt fish …` with this case's environment. */
function adopt(args: readonly string[]) {
  return runWardEnv(['shell', 'adopt', 'fish', ...args], scratch, env());
}

/** A fish one-liner with a PATH holding `ward` and `git` — and deliberately no fzf. */
function fish(script: string) {
  const result = Bun.spawnSync([FISH, '--no-config', '-c', script], {
    cwd: scratch,
    env: { ...process.env, ...env(), PATH: `${wardBin}:${toolBin}`, WARD_AGENT: undefined },
  });
  return { stdout: result.stdout.toString(), stderr: result.stderr.toString() };
}

/** Every file under a fish root, relative and sorted — what a run actually wrote. */
function written(root = fishDir()): string[] {
  if (!existsSync(root)) return [];
  return [...new Bun.Glob('**/*.fish').scanSync({ cwd: root, onlyFiles: true })].sort();
}

function write(relativePath: string, contents: string): void {
  mkdirSync(join(fishDir(), relativePath, '..'), { recursive: true });
  writeFileSync(join(fishDir(), relativePath), contents);
}

function append(relativePath: string, contents: string): void {
  const path = join(fishDir(), relativePath);
  writeFileSync(path, readFileSync(path, 'utf8') + contents);
}

function adoptionFindings(machine: readonly Finding[]): Finding[] {
  return machine.filter((finding) => finding.check.startsWith('fish shorthand'));
}

beforeAll(async () => {
  applyGitTestEnv();
  scratch = makeTempDir();
  state = join(scratch, 'state');
  workspace = join(scratch, 'ws');
  workspaceName = 'ws';

  // A registered workspace, so `wwcd` with nothing to pick has an honest
  // lesser answer to take — the case the fish run proves.
  const { createWorkspace } = await import('../../src/workspace/create.ts');
  await createWorkspace(workspace);

  // Two one-file PATH directories, so the fish case states exactly what is
  // installed: `fzf` is deliberately absent, and inheriting the machine's PATH
  // would let its own picker decide the answer (0025's hard-won note).
  toolBin = join(scratch, 'tools');
  wardBin = join(scratch, 'bin');
  const realGit = Bun.which('git') ?? '/usr/bin/git';
  await Bun.write(join(toolBin, 'git'), `#!/bin/sh\nexec ${realGit} "$@"\n`);
  await Bun.write(join(wardBin, 'ward'), `#!/bin/sh\nexec ${process.execPath} ${cliPath} "$@"\n`);
  Bun.spawnSync(['chmod', '+x', join(toolBin, 'git'), join(wardBin, 'ward')]);
});

beforeEach(() => {
  caseId += 1;
  fishHome = mkdtempSync(join(scratch, 'xdg-'));
  process.env.XDG_CONFIG_HOME = fishHome;
  // A registry per case, so registering the workspace cannot leak between them.
  state = join(scratch, `state-${caseId}`);
  runWardEnv(['workspace', 'register', workspace], scratch, env());
});

afterAll(() => removeDir(scratch));
