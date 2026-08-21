// The agent configuration where a caller can see it
// (design/0027-agent-configuration/): doctor resolves the two axes in the
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
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AgentSettings } from '../../src/agent/settings.ts';
import { doctorShape } from '../../src/cli/schema.ts';
import { readDocument, writeDocument } from '../../src/store/document.ts';
import { workspaceRecordType } from '../../src/store/types.ts';
import { createWorkspace } from '../../src/workspace/create.ts';
import { type Finding, runDoctor } from '../../src/workspace/doctor.ts';
import { applyGitTestEnv, makeTempDir, NO_GH, removeDir } from '../helpers.ts';

test('doctor resolves both axes and names the layer that answered, per key', async () => {
  writeGlobalAgent({ model: 'fable', effort: 'high', args: ['--dangerously-skip-permissions'] });
  await writeWorkspaceAgent({ model: 'sonnet' });

  const report = await runDoctor(root);
  expect(report.agent).toEqual({
    harness: { provenance: 'default', value: 'claude' },
    model: { provenance: 'workspace', value: 'sonnet' },
    effort: { provenance: 'global', value: 'high' },
    args: { provenance: 'global', value: ['--dangerously-skip-permissions'] },
  });
  expect(finding(report.workspace, 'agent configuration')).toEqual({
    check: 'agent configuration',
    severity: 'ok',
    message:
      "harness claude (ward's default) · model sonnet (this workspace) · " +
      'effort high (global config) · args --dangerously-skip-permissions (global config)',
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
  });

  // The whole point, in one document: with nothing configured on either axis,
  // model and effort carry no value — entry 0028's launch has no flag to pass.
  const bare = doctorShape.parse(
    JSON.parse(ward(['doctor', '--json'], bareRoot, emptyConfigHome).stdout),
  );
  expect(bare.agent).toEqual({
    harness: { provenance: 'default', value: 'claude' },
    model: { provenance: 'absent' },
    effort: { provenance: 'absent' },
    args: { provenance: 'default', value: [] },
  });
});

// -- setup -----------------------------------------------------------------

let scratch: string;
let root: string;
let bareRoot: string;
let configHome: string;
let emptyConfigHome: string;
let stateHome: string;
let caseId = 0;
let originalConfigDir: string | undefined;

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
    },
  });
  return { exitCode: result.exitCode, stdout: result.stdout.toString() };
}

const cliPath = new URL('../../src/cli/index.ts', import.meta.url).pathname;

beforeAll(() => {
  applyGitTestEnv();
  originalConfigDir = process.env.WARD_CONFIG_DIR;
  scratch = makeTempDir();
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
  removeDir(scratch);
});
