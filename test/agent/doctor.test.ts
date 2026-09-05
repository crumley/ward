// The agent configuration where a caller can see it
// (design/0028-agent-configuration/): doctor resolves the two axes in the
// workspace the caller is standing in and shows the answer per key with the
// layer that gave it — one line for the human, keyed structure under `--json`
// for an agent (§8), both from the same single resolution so they cannot
// disagree.
//
// Hermetic: a workspace and a global configuration directory per case, with
// the ambient WARD_CONFIG_DIR pointed at it — runDoctor reads the ambient
// directory exactly as the CLI does — and the spawned CLI given the same pair
// explicitly.
import { afterAll, beforeAll, beforeEach, expect, test } from 'bun:test';
import { mkdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AgentSettings } from '../../src/agent/settings.ts';
import { doctorShape } from '../../src/cli/schema.ts';
import { readDocument, writeDocument } from '../../src/store/document.ts';
import { workspaceRecordType } from '../../src/store/types.ts';
import { createWorkspace } from '../../src/workspace/create.ts';
import { type Finding, runDoctor as runDoctorReal } from '../../src/workspace/doctor.ts';
import { applyGitTestEnv, makeTempDir, NO_GH, removeDir, writeFakeClaude } from '../helpers.ts';

test('doctor resolves both axes and names the layer that answered, per key', async () => {
  writeGlobalAgent({ model: 'fable', effort: 'high', args: ['--dangerously-skip-permissions'] });
  await writeWorkspaceAgent({ model: 'sonnet' });

  const report = await runDoctor(root);
  expect(report.agent).toEqual({
    harness: { provenance: 'default', value: 'claude' },
    model: { provenance: 'workspace', value: 'sonnet' },
    effort: { provenance: 'global', value: 'high' },
    args: { provenance: 'global', value: ['--dangerously-skip-permissions'] },
    command: { provenance: 'absent' },
  });
  expect(finding(report.workspace, 'agent configuration')).toEqual({
    check: 'agent configuration',
    severity: 'ok',
    message:
      "harness claude (ward's default) · model sonnet (this workspace) · " +
      'effort high (global config) · args --dangerously-skip-permissions (global config) · ' +
      'command not set',
  });
});

// -- the command, and whether it can be found (design/0035-agent-command/) --

test('the command resolves like every other key, and doctor checks it can be found', async () => {
  writeGlobalAgent({ command: ['npx', 'claude'] });
  await writeWorkspaceAgent({ command: [stub, '--via-shim'] });

  const report = await runDoctor(root);
  expect(report.agent?.command).toEqual({
    provenance: 'workspace',
    value: [stub, '--via-shim'],
  });
  expect(finding(report.workspace, 'agent configuration').message).toContain(
    `command ${stub} --via-shim (this workspace)`,
  );
  expect(finding(report.workspace, 'agent command')).toEqual({
    check: 'agent command',
    severity: 'ok',
    message: `${stub} --via-shim (this workspace) — ${stub}`,
  });
});

test('a command whose program is nowhere is a warning that names it and the key', async () => {
  writeGlobalAgent({ command: ['npx-that-is-not-installed', 'claude'] });
  const shown = finding((await runDoctor(root)).workspace, 'agent command');
  expect(shown.severity).toBe('warn');
  expect(shown.message).toContain('npx-that-is-not-installed (global config) is not on PATH');
  expect(shown.message).toContain('ward session open would fail');
  expect(shown.message).toContain('agent.command');
  expect((await runDoctor(root)).healthy).toBe(true); // a launch that would fail is not a broken record
});

test('unset, the default program is checked too — that is the machine that needs the key', async () => {
  // A PATH with git on it and nothing else: doctor still runs, and `claude`
  // is exactly as absent as it is on a machine that needs the key.
  const shown = finding(
    (await runDoctor(root, { PATH: pathWithoutClaude })).workspace,
    'agent command',
  );
  expect(shown.severity).toBe('warn');
  expect(shown.message).toContain("claude (the claude adapter's default) is not on PATH");
  expect(shown.message).toContain('[npx, claude]');
  expect(shown.message).toContain(join(configHome, 'config.md'));
});

test('WARD_CLAUDE_BIN is the narrowest layer: doctor describes what the launch would run', async () => {
  writeGlobalAgent({ command: ['npx', 'claude'] });
  const shown = finding(
    (await runDoctor(root, { WARD_CLAUDE_BIN: stub })).workspace,
    'agent command',
  );
  expect(shown).toEqual({
    check: 'agent command',
    severity: 'ok',
    message: `${stub} (WARD_CLAUDE_BIN) — ${stub}`,
  });
});

test('nothing configured is info, not ok — and it names where the settings would go', async () => {
  const shown = finding((await runDoctor(root)).workspace, 'agent configuration');
  expect(shown.severity).toBe('info');
  expect(shown.message).toContain('model not set');
  expect(shown.message).toContain('effort not set');
  expect(shown.message).toContain('args none');
  expect(shown.message).toContain(join(configHome, 'config.md'));
  expect(shown.message).toContain('workspace.md');
});

test('the workspace record is the workspace-local home — the block round-trips through the store', async () => {
  await writeWorkspaceAgent({ model: 'sonnet', args: [] });
  expect((await readDocument(root, workspaceRecordType)).data.agent).toEqual({
    model: 'sonnet',
    args: [],
  });
  const report = await runDoctor(root);
  expect(report.agent?.args).toEqual({ provenance: 'workspace', value: [] });
});

test('a record that will not parse loses its layer, and is complained about exactly once', async () => {
  writeGlobalAgent({ model: 'fable' });
  writeFileSync(join(root, workspaceRecordType.relPath), '---\ntype: workspace\n---\n');

  const report = await runDoctor(root);
  expect(finding(report.workspace, 'workspace record').severity).toBe('error');
  expect(report.agent?.model).toEqual({ provenance: 'global', value: 'fable' });
});

test('an unreadable global config leaves the workspace layer answering', async () => {
  mkdirSync(configHome, { recursive: true });
  writeFileSync(join(configHome, 'config.md'), 'not a document at all\n');
  await writeWorkspaceAgent({ model: 'sonnet' });

  const report = await runDoctor(root);
  expect(finding(report.machine, 'global config').severity).toBe('warn');
  expect(report.agent?.model).toEqual({ provenance: 'workspace', value: 'sonnet' });
  expect(report.healthy).toBe(true); // a preference file can never make a machine unhealthy
});

test('outside a workspace there is no resolution to report — the block is null', async () => {
  const report = await runDoctor(scratch);
  expect(report.workspaceRoot).toBeNull();
  expect(report.agent).toBeNull();
});

test('doctor --json carries the resolution as data, an absent key without a value', async () => {
  writeGlobalAgent({ model: 'fable', args: [] });
  await writeWorkspaceAgent({ effort: 'max' });

  const configured = doctorShape.parse(JSON.parse(ward(['doctor', '--json'], root).stdout));
  expect(configured.agent).toEqual({
    harness: { provenance: 'default', value: 'claude' },
    model: { provenance: 'global', value: 'fable' },
    effort: { provenance: 'workspace', value: 'max' },
    args: { provenance: 'global', value: [] },
    command: { provenance: 'absent' },
  });

  // The whole point, in one document: with nothing configured on either axis,
  // model and effort carry no value — entry 0029's launch has no flag to pass.
  const bare = doctorShape.parse(
    JSON.parse(ward(['doctor', '--json'], bareRoot, emptyConfigHome).stdout),
  );
  expect(bare.agent).toEqual({
    harness: { provenance: 'default', value: 'claude' },
    model: { provenance: 'absent' },
    effort: { provenance: 'absent' },
    args: { provenance: 'default', value: [] },
    command: { provenance: 'absent' },
  });

  // A configured command is data too — the list, with its layer.
  writeGlobalAgent({ command: ['npx', 'claude'] });
  const launcher = doctorShape.parse(JSON.parse(ward(['doctor', '--json'], root).stdout));
  expect(launcher.agent?.command).toEqual({ provenance: 'global', value: ['npx', 'claude'] });
});

test('doctor names this machine, and the layer that named it', async () => {
  // Machine-level (design/0038-machine-bound-sessions/): the name is the
  // second half of every session id allocated here, so "what would my next
  // session be called?" is answerable before opening one to find out.
  expect(finding((await runDoctor(root)).machine, 'machine')).toEqual({
    check: 'machine',
    severity: 'ok',
    message: "named 'test' (from WARD_MACHINE) — session ids allocated here end '@test'",
  });

  // Configured, with the suite's override out of the way — and normalized to
  // the slug alphabet, because the name goes inside an id and a filename.
  mkdirSync(configHome, { recursive: true });
  writeFileSync(join(configHome, 'config.md'), '---\ntype: ward-config\nmachine: My Box\n---\n');
  const configured = await runDoctor(root, { WARD_MACHINE: '' });
  expect(configured.machineName).toEqual({ name: 'my-box', source: 'configured' });
  expect(finding(configured.machine, 'machine').message).toContain("named 'my-box' (configured)");

  // Nothing configured: this machine's own hostname — answered outside a
  // workspace too, where only the machine half of doctor exists.
  writeFileSync(join(configHome, 'config.md'), '---\ntype: ward-config\n---\n');
  const derived = await runDoctor(scratch, { WARD_MACHINE: '' });
  expect(derived.workspaceRoot).toBeNull();
  expect(derived.machineName.source).toBe('hostname');
  expect(derived.machineName.name).toMatch(/^[a-z0-9-]+$/);
});

// -- setup -----------------------------------------------------------------

let scratch: string;
let root: string;
let bareRoot: string;
let configHome: string;
let emptyConfigHome: string;
let stateHome: string;
let stub: string;
let pathWithoutClaude: string;
let caseId = 0;
let originalConfigDir: string | undefined;
let originalClaudeBin: string | undefined;

/**
 * `runDoctor` with a few environment variables pinned for the call — the
 * program lookup reads PATH and the WARD_CLAUDE_BIN seam from the ambient
 * environment, exactly as the launch does.
 */
async function runDoctor(root: string, env: Record<string, string> = {}) {
  const saved = Object.fromEntries(Object.keys(env).map((key) => [key, process.env[key]]));
  Object.assign(process.env, env);
  try {
    return await runDoctorReal(root);
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

function finding(findings: readonly Finding[], check: string): Finding {
  const found = findings.find((entry) => entry.check === check);
  if (found === undefined) throw new Error(`no '${check}' finding was reported`);
  return found;
}

/** The global layer, written as a human would write it. */
function writeGlobalAgent(agent: AgentSettings): void {
  const lines = ['agent:'];
  if (agent.harness !== undefined) lines.push(`  harness: ${agent.harness}`);
  if (agent.model !== undefined) lines.push(`  model: ${agent.model}`);
  if (agent.effort !== undefined) lines.push(`  effort: ${agent.effort}`);
  if (agent.args !== undefined) {
    lines.push(`  args: [${agent.args.map((arg) => `'${arg}'`).join(', ')}]`);
  }
  if (agent.command !== undefined) {
    lines.push(`  command: [${agent.command.map((word) => `'${word}'`).join(', ')}]`);
  }
  mkdirSync(configHome, { recursive: true });
  writeFileSync(
    join(configHome, 'config.md'),
    `---\ntype: ward-config\n${lines.join('\n')}\n---\n\nPreferences.\n`,
  );
}

/** The workspace layer, written into the record through the store. */
async function writeWorkspaceAgent(agent: AgentSettings): Promise<void> {
  const record = await readDocument(root, workspaceRecordType);
  await writeDocument(root, workspaceRecordType, {
    data: { ...record.data, agent },
    body: record.body,
  });
}

/** The CLI, with this case's global directories and a hermetic environment. */
function ward(argv: string[], cwd: string, config: string = configHome) {
  const result = Bun.spawnSync(['bun', cliPath, ...argv], {
    cwd,
    env: {
      ...process.env,
      NO_COLOR: '1',
      WARD_GH: NO_GH,
      WARD_CONFIG_DIR: config,
      WARD_STATE_DIR: stateHome,
      WARD_AGENT: undefined,
      WARD_CLAUDE_BIN: undefined,
    },
  });
  return { exitCode: result.exitCode, stdout: result.stdout.toString() };
}

const cliPath = new URL('../../src/cli/index.ts', import.meta.url).pathname;

beforeAll(() => {
  applyGitTestEnv();
  originalConfigDir = process.env.WARD_CONFIG_DIR;
  originalClaudeBin = process.env.WARD_CLAUDE_BIN;
  // The command finding reads the launch's own seam: unset it here so a
  // developer's ambient override cannot answer for the configuration under test.
  delete process.env.WARD_CLAUDE_BIN;
  scratch = makeTempDir();
  stub = writeFakeClaude(scratch, 'claude-stub');
  pathWithoutClaude = join(scratch, 'path-without-claude');
  mkdirSync(pathWithoutClaude, { recursive: true });
  const git = Bun.which('git');
  if (git === null) throw new Error('git is required on PATH to run this suite');
  symlinkSync(git, join(pathWithoutClaude, 'git'));
});

beforeEach(async () => {
  caseId += 1;
  const home = join(scratch, `case-${caseId}`);
  configHome = join(home, 'config');
  emptyConfigHome = join(home, 'no-config');
  stateHome = join(home, 'state');
  root = join(home, 'ws');
  bareRoot = join(home, 'bare');
  process.env.WARD_CONFIG_DIR = configHome;
  await createWorkspace(root);
  await createWorkspace(bareRoot);
});

afterAll(() => {
  process.env.WARD_CONFIG_DIR = originalConfigDir;
  if (originalClaudeBin !== undefined) process.env.WARD_CLAUDE_BIN = originalClaudeBin;
  removeDir(scratch);
});
