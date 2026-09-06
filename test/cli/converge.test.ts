// The update owns convergence, through the spawned CLI
// (design/0042-upgrade-owns-convergence/): `workspace create` refuses a path
// that is already a workspace with the 0015 refusal posture, `workspace
// upgrade` carries the converge steps in both its renderings, and every doctor
// remedy for a workspace that already exists names the update verb.
import { afterAll, beforeAll, expect, test } from 'bun:test';
import { join } from 'node:path';
import { workspaceUpgradeShape } from '../../src/cli/schema.ts';
import { gitOrThrow } from '../../src/workspace/git.ts';
import { GROUND_FLOOR_DIR } from '../../src/workspace/projects.ts';
import { applyGitTestEnv, makeTempDir, NO_GH, removeDir, runWard, runWardEnv } from '../helpers.ts';

test('create on an existing workspace: exit 1, stdout empty, the remedy names upgrade', () => {
  const ws = workspace('refusal');
  const result = runWard(['workspace', 'create', ws], scratch);
  expect(result.exitCode).toBe(1);
  expect(result.stdout).toBe(''); // a refusal emits no document (0015)
  expect(result.stderr).toContain(
    `${ws} is already a Ward workspace — bring it to this release with: ward workspace upgrade`,
  );
  expect(gitOrThrow(ws, 'rev-list', '--count', 'HEAD').stdout.trim()).toBe('1');
  expect(gitOrThrow(ws, 'status', '--porcelain').stdout).toBe('');
});

test('upgrade --json on a workspace behind on its record: converged rides the document', () => {
  const ws = workspace('json');
  removeDir(join(ws, GROUND_FLOOR_DIR)); // the pre-0018 shape
  gitOrThrow(ws, 'commit', '-am', 'a workspace from before the standing project');

  const result = upgrade(ws, ['--json']);
  expect(result.exitCode).toBe(0);
  const report = workspaceUpgradeShape.parse(JSON.parse(result.stdout));
  expect(report.vehicle).toBe('none'); // no default moved: no task, no branch
  expect(report.outcome).toBe('current');
  expect(report.converged.length).toBe(12);
  const standing = report.converged.find((step) => step.step === 'standing project');
  expect(standing).toMatchObject({ outcome: 'established', detail: `${GROUND_FLOOR_DIR}/` });
});

// Converging something and finding the artifacts current is work done, and the
// human rendering says so rather than "nothing to upgrade".
test('a run that converged the record does not report nothing to do', () => {
  const ws = workspace('not-nothing');
  removeDir(join(ws, GROUND_FLOOR_DIR));
  gitOrThrow(ws, 'commit', '-am', 'a workspace from before the standing project');

  const first = upgrade(ws, []);
  expect(first.exitCode).toBe(0);
  expect(first.stdout).toContain('established  standing project');
  expect(first.stdout).toContain('record converged — 2 established');
  expect(first.stdout).toContain('installed artifacts already current');
  expect(first.stdout).not.toContain('nothing to upgrade');

  // And now there is genuinely nothing to do, which reads differently.
  const second = upgrade(ws, []);
  expect(second.stdout).toContain('nothing to upgrade — everything already current');
});

test('the converge steps print before the artifact rows, in create step style', () => {
  const ws = workspace('render');
  const rendered = upgrade(ws, []);
  expect(rendered.exitCode).toBe(0);
  const stdout = rendered.stdout;
  expect(stdout.indexOf('workspace marker')).toBeGreaterThan(-1);
  expect(stdout.indexOf('workspace marker')).toBeLessThan(stdout.indexOf('AGENTS.md'));
  expect(stdout.indexOf('workspace history')).toBeLessThan(stdout.indexOf('.ward/README.md'));
});

// One job, one owner: no finding about a workspace that exists may point at the
// verb that makes one. The two remedies for no workspace at all keep `create`,
// and they are not doctor's.
test('every doctor remedy for an existing workspace names the update verb', async () => {
  const ws = workspace('remedies');
  removeDir(join(ws, GROUND_FLOOR_DIR));
  removeDir(join(ws, 'repositories'));
  await Bun.write(join(ws, '.gitignore'), '# mine\n');
  gitOrThrow(ws, 'rm', '--cached', '-r', '-q', '--', '.ward/baselines.md');
  await Bun.write(join(ws, '.ward', 'baselines.md'), '');
  gitOrThrow(ws, 'commit', '-am', 'a workspace behind in several ways (test fixture)');

  const doctor = JSON.parse(runWard(['doctor', '--json'], ws).stdout) as {
    workspace: { check: string; message: string }[];
  };
  const messages = doctor.workspace.map((finding) => finding.message);
  expect(messages.join('\n')).not.toContain('ward workspace create');
  for (const check of ['ignore policy', 'standing project']) {
    const finding = doctor.workspace.find((row) => row.check === check);
    expect(finding?.message).toContain('ward workspace upgrade');
  }
  // And the refusal `ward task open` carries is the same string doctor prints.
  const refused = runWard(['task', 'open', 'nowhere-to-go'], ws);
  expect(refused.exitCode).toBe(1);
  expect(refused.stderr).toContain('no ground floor — establish it: ward workspace upgrade');
});

// -- setup ------------------------------------------------------------------

let scratch: string;
let counter = 0;

beforeAll(() => {
  applyGitTestEnv();
  scratch = makeTempDir();
});

afterAll(() => removeDir(scratch));

function workspace(name: string): string {
  counter += 1;
  const ws = join(scratch, `${name}-${counter}`);
  expect(runWard(['workspace', 'create', ws], scratch).exitCode).toBe(0);
  return ws;
}

/**
 * The bare upgrade is the human's form, so the caller environment is pinned:
 * a WARD_AGENT inherited from the environment the suite runs in would turn
 * every one of these into the agent refusal (design/0005-agent-audience/).
 */
function upgrade(ws: string, flags: string[]) {
  return runWardEnv(['workspace', 'upgrade', ...flags], ws, { NO_COLOR: '1', WARD_GH: NO_GH });
}
