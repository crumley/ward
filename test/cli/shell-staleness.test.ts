// Doctor's staleness findings for the installed shell artifacts
// (design/0026-shell-staleness-doctor/): the emitted fish layer and ward's
// fish completions are installed by redirect, so each installed file is a
// snapshot of the ward that wrote it. Doctor re-emits and compares byte for
// byte — absent is quiet, current is ✓, ward's own emission gone stale is the
// one warning (with the exact re-run), a file ward did not write is reported
// honestly and never told to overwrite, and nothing here is ever an error.
import { afterAll, beforeAll, beforeEach, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { doctorShape } from '../../src/cli/schema.ts';
import { renderCompletionScript } from '../../src/shell/completion.ts';
import { emitShellLayer } from '../../src/shell/layer.ts';
import { type Finding, runDoctor } from '../../src/workspace/doctor.ts';
import { applyGitTestEnv, makeTempDir, removeDir, runWardEnv } from '../helpers.ts';

const LAYER = 'fish shell layer';
const COMPLETIONS = 'fish completions';

const rows: ReadonlyArray<{
  name: string;
  install: () => void;
  /** A thunk: the expected messages name paths that exist only per case. */
  expected: () => ReadonlyArray<Record<string, unknown>>;
}> = [
  {
    name: 'no fish configuration at all: doctor says nothing about a shell this machine does not run',
    install: () => {},
    expected: () => [],
  },
  {
    name: 'a fish user with neither file: two dim notes, each naming the redirect that installs it',
    install: () => mkdirSync(join(fishHome, 'fish')),
    expected: () => [
      {
        check: LAYER,
        severity: 'info',
        message: expect.stringContaining('ward shell init fish >'),
      },
      {
        check: COMPLETIONS,
        severity: 'info',
        message: expect.stringContaining('ward completion fish >'),
      },
    ],
  },
  {
    name: 'both freshly installed: byte-identical to what this ward emits',
    install: () => {
      installLayer(emitShellLayer('fish'));
      installCompletions(renderCompletionScript('fish'));
    },
    expected: () => [
      { check: LAYER, severity: 'ok', message: expect.stringContaining(layerPath()) },
      { check: COMPLETIONS, severity: 'ok', message: expect.stringContaining(completionsPath()) },
    ],
  },
  {
    name: "ward's own layer, from an earlier ward: warn, naming the file and the re-run",
    install: () => {
      installLayer(`${emitShellLayer('fish')}\nfunction wold\n    command ward status\nend\n`);
      installCompletions(renderCompletionScript('fish'));
    },
    expected: () => [
      {
        check: LAYER,
        severity: 'warn',
        message: expect.stringContaining(`ward shell init fish > ${layerPath()}`),
      },
      { check: COMPLETIONS, severity: 'ok' },
    ],
  },
  {
    name: "ward's own completions, from an earlier ward: warn, naming the file and the re-run",
    install: () => {
      installLayer(emitShellLayer('fish'));
      installCompletions(`${renderCompletionScript('fish')}# an older driver\n`);
    },
    expected: () => [
      { check: LAYER, severity: 'ok' },
      {
        check: COMPLETIONS,
        severity: 'warn',
        message: expect.stringContaining(`ward completion fish > ${completionsPath()}`),
      },
    ],
  },
  {
    name: "files ward did not write: reported honestly as not ward's emission, never a warning",
    install: () => {
      installLayer('function wrcd\n    cd (my-own-thing)\nend\n');
      installCompletions('complete -c ward -f -a "(my-own-thing)"\n');
    },
    expected: () => [
      { check: LAYER, severity: 'info', message: expect.stringContaining("not ward's emission") },
      {
        check: COMPLETIONS,
        severity: 'info',
        message: expect.stringContaining("not ward's emission"),
      },
    ],
  },
  {
    name: "lazy bootstraps: recognized as always-fresh, ok, never called somebody else's file",
    install: () => {
      installLayer(
        '# regenerate per shell\ncommand -q ward; or exit\nward shell init fish | source\n',
      );
      installCompletions(
        '# the dotfiles idiom\ncommand -q ward; or return\nward completion fish 2>/dev/null | source\n',
      );
    },
    expected: () => [
      { check: LAYER, severity: 'ok', message: expect.stringContaining('lazy bootstrap') },
      { check: COMPLETIONS, severity: 'ok', message: expect.stringContaining('lazy bootstrap') },
    ],
  },
  {
    name: "mentioning the command is not bootstrapping it: a redirect or the wrong site's command stays foreign",
    install: () => {
      // A redirect writes a snapshot; only a pipe into `source` regenerates.
      installLayer('ward shell init fish > ~/.config/fish/conf.d/ward.fish\n');
      // The layer's bootstrap line cannot vouch for the completions site.
      installCompletions('ward shell init fish | source\n');
    },
    expected: () => [
      { check: LAYER, severity: 'info', message: expect.stringContaining("not ward's emission") },
      {
        check: COMPLETIONS,
        severity: 'info',
        message: expect.stringContaining("not ward's emission"),
      },
    ],
  },
  {
    name: 'a path that cannot be read: warn carrying the reason, never a guess about its contents',
    install: () => {
      mkdirSync(layerPath(), { recursive: true }); // a directory where the file belongs
      installCompletions(renderCompletionScript('fish'));
    },
    expected: () => [
      { check: LAYER, severity: 'warn', message: expect.stringContaining('could not be read') },
      { check: COMPLETIONS, severity: 'ok' },
    ],
  },
];

for (const row of rows) {
  test(`installed shell artifacts — ${row.name}`, async () => {
    row.install();
    const report = await runDoctor(scratch);
    expect(shellFindings(report.machine)).toMatchObject([...row.expected()]);
    // A convenience can never make a machine unhealthy (0024's posture).
    expect(report.healthy).toBe(true);
  });
}

test('the comparison is against the real emission — `ward shell init fish`, byte for byte', () => {
  const emitted = runWardEnv(['shell', 'init', 'fish'], scratch, { NO_COLOR: '1' });
  expect(emitted.exitCode).toBe(0);
  expect(emitted.stdout).toBe(emitShellLayer('fish'));
});

test('the comparison is against the real emission — `ward completion fish`, byte for byte', () => {
  const emitted = runWardEnv(['completion', 'fish'], scratch, { NO_COLOR: '1' });
  expect(emitted.exitCode).toBe(0);
  expect(emitted.stdout).toBe(renderCompletionScript('fish'));
});

test('the human rendering marks a stale layer and carries the re-run; the run still exits 0', () => {
  installLayer(`${emitShellLayer('fish')}# an older ward wrote this\n`);
  const result = runWardEnv(['doctor'], scratch, { XDG_CONFIG_HOME: fishHome, NO_COLOR: '1' });
  expect(result.exitCode).toBe(0); // report-only: staleness never fails the run
  expect(result.stdout).toContain(`! ${LAYER} — ${layerPath()} differs from what this ward emits`);
  expect(result.stdout).toContain(`ward shell init fish > ${layerPath()}`);
});

test('--json carries the findings in the shape ward schema documents', () => {
  installLayer(`${emitShellLayer('fish')}# an older ward wrote this\n`);
  const result = runWardEnv(['doctor', '--json'], scratch, {
    XDG_CONFIG_HOME: fishHome,
    NO_COLOR: '1',
  });
  const report = doctorShape.parse(JSON.parse(result.stdout));
  expect(report.machine).toContainEqual({
    check: LAYER,
    severity: 'warn',
    message: expect.stringContaining(`ward shell init fish > ${layerPath()}`),
  });
});

// -- setup -----------------------------------------------------------------
// A throwaway `$XDG_CONFIG_HOME` per case: the seam is the XDG variable
// itself, so no case can read the developer's own `~/.config/fish`
// (test/helpers.ts pins it for every suite). `scratch` is deliberately not a
// workspace — these are MACHINE findings, and doctor must produce them from
// anywhere.

let scratch: string;
let fishHome: string;

function layerPath(): string {
  return join(fishHome, 'fish', 'conf.d', 'ward.fish');
}

function completionsPath(): string {
  return join(fishHome, 'fish', 'completions', 'ward.fish');
}

function installLayer(contents: string): void {
  writeInstalled(layerPath(), contents);
}

function installCompletions(contents: string): void {
  writeInstalled(completionsPath(), contents);
}

function writeInstalled(path: string, contents: string): void {
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, contents);
}

function shellFindings(findings: readonly Finding[]): Finding[] {
  return findings.filter((finding) => finding.check === LAYER || finding.check === COMPLETIONS);
}

beforeAll(() => {
  applyGitTestEnv();
  scratch = makeTempDir();
});

beforeEach(() => {
  fishHome = mkdtempSync(join(scratch, 'xdg-'));
  process.env.XDG_CONFIG_HOME = fishHome;
});

afterAll(() => removeDir(scratch));
