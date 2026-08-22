// The agent's configuration vocabulary and its precedence rule
// (design/0028-agent-configuration/): one block, accepted on two axes — a
// human's defaults in the global config, overridden PER KEY by the workspace
// record — merged into one answer that reports which layer gave it.
//
// The invariant every case here is really about: OMITTED MEANS OMITTED. A key
// set nowhere resolves to `absent` carrying no value at all, so the launch
// that follows (entry 0029) omits the flag rather than passing a Ward-invented
// default. Hermetic by construction: the merge is pure, and the file cases
// take their own directory — nothing reads the machine's real `$HOME`.
import { afterAll, beforeAll, beforeEach, expect, test } from 'bun:test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  AGENT_DEFAULTS,
  type AgentSettings,
  type ResolvedAgentConfig,
  resolveAgentConfig,
} from '../../src/agent/settings.ts';
import { CONFIG_DEFAULTS, readConfig } from '../../src/global/config.ts';
import { workspaceRecordSchema } from '../../src/store/types.ts';
import { makeTempDir, removeDir } from '../helpers.ts';

// -- the merge matrix ------------------------------------------------------
// Each key × the level that set it. Read a row as: given these two layers,
// here is every key's value and the layer it came from.

const unset = { provenance: 'absent' } as const;
const fromWorkspace = <T>(value: T) => ({ provenance: 'workspace', value }) as const;
const fromGlobal = <T>(value: T) => ({ provenance: 'global', value }) as const;
const fromDefault = <T>(value: T) => ({ provenance: 'default', value }) as const;

const mergeRows: ReadonlyArray<{
  name: string;
  workspace?: AgentSettings;
  global?: AgentSettings;
  expected: ResolvedAgentConfig;
}> = [
  {
    name: 'nothing configured anywhere: only the two keys Ward has an opinion about answer',
    expected: {
      harness: fromDefault('claude'),
      model: unset,
      effort: unset,
      args: fromDefault([]),
    },
  },
  {
    name: 'the global layer alone — a human\'s "every session" defaults',
    global: {
      harness: 'claude',
      model: 'fable',
      effort: 'high',
      args: ['--dangerously-skip-permissions'],
    },
    expected: {
      harness: fromGlobal('claude'),
      model: fromGlobal('fable'),
      effort: fromGlobal('high'),
      args: fromGlobal(['--dangerously-skip-permissions']),
    },
  },
  {
    name: 'the workspace layer alone: it wins over the built-in defaults too, not only over global',
    workspace: { harness: 'claude', model: 'sonnet', effort: 'low', args: ['--verbose'] },
    expected: {
      harness: fromWorkspace('claude'),
      model: fromWorkspace('sonnet'),
      effort: fromWorkspace('low'),
      args: fromWorkspace(['--verbose']),
    },
  },
  {
    name: 'the directive\'s case: "in this workspace, the model is Sonnet" — nothing else moves',
    global: { model: 'fable', effort: 'high', args: ['--dangerously-skip-permissions'] },
    workspace: { model: 'sonnet' },
    expected: {
      harness: fromDefault('claude'),
      model: fromWorkspace('sonnet'),
      effort: fromGlobal('high'),
      args: fromGlobal(['--dangerously-skip-permissions']),
    },
  },
  {
    name: 'an empty workspace block overrides nothing — presence is not an override',
    global: { model: 'fable' },
    workspace: {},
    expected: {
      harness: fromDefault('claude'),
      model: fromGlobal('fable'),
      effort: unset,
      args: fromDefault([]),
    },
  },
  {
    name: 'effort omitted everywhere stays absent while its neighbours are answered',
    global: { model: 'fable', args: ['--flag'] },
    expected: {
      harness: fromDefault('claude'),
      model: fromGlobal('fable'),
      effort: unset,
      args: fromGlobal(['--flag']),
    },
  },
  {
    name: 'the harness is configurable on both axes, and defaults when neither says',
    workspace: { harness: 'claude' },
    expected: {
      harness: fromWorkspace('claude'),
      model: unset,
      effort: unset,
      args: fromDefault([]),
    },
  },
  {
    name: 'args replace at the winning level — the workspace set is the whole set',
    global: { args: ['--a', '--b'] },
    workspace: { args: ['--c'] },
    expected: {
      harness: fromDefault('claude'),
      model: unset,
      effort: unset,
      args: fromWorkspace(['--c']),
    },
  },
  {
    name: 'an explicitly empty workspace args drops the global flags here — the escape hatch',
    global: { args: ['--dangerously-skip-permissions'] },
    workspace: { args: [] },
    expected: {
      harness: fromDefault('claude'),
      model: unset,
      effort: unset,
      args: fromWorkspace([]),
    },
  },
];

for (const row of mergeRows) {
  test(`resolve — ${row.name}`, () => {
    expect(resolveAgentConfig({ workspace: row.workspace, global: row.global })).toEqual(
      row.expected,
    );
  });
}

test('absent carries no value at all — there is nothing to pass, not an empty string', () => {
  const resolved = resolveAgentConfig({});
  expect('value' in resolved.model).toBe(false);
  expect('value' in resolved.effort).toBe(false);
  // The two keys Ward does answer say so with a default, and the defaults are
  // stated in exactly one place.
  expect(resolved.harness).toEqual(fromDefault(AGENT_DEFAULTS.harness));
  expect(resolved.args).toEqual(fromDefault(AGENT_DEFAULTS.args));
});

test("args never concatenate across layers — the resolved set is exactly one layer's", () => {
  const resolved = resolveAgentConfig({
    global: { args: ['--a', '--b'] },
    workspace: { args: ['--c'] },
  });
  expect(resolved.args).toEqual(fromWorkspace(['--c']));
});

// -- what the global config accepts ----------------------------------------
// Ward validates the vocabulary it owns (the harness set — it is the list of
// adapters Ward has) and passes through the vocabularies it does not (model
// names, effort levels): gating those would break the day the underlying CLI
// grows a level. An invalid file degrades to the defaults, as every global
// preference does (§20) — loudly through doctor, silently at the point of use.

const configRows: ReadonlyArray<{ name: string; frontMatter: string; agent: AgentSettings }> = [
  {
    name: 'the block a human writes for every session',
    frontMatter:
      'agent:\n  harness: claude\n  model: fable\n  effort: high\n' +
      '  args:\n    - --dangerously-skip-permissions\n',
    agent: {
      harness: 'claude',
      model: 'fable',
      effort: 'high',
      args: ['--dangerously-skip-permissions'],
    },
  },
  {
    name: 'an effort level Ward has never heard of is passed through, not gated',
    frontMatter: 'agent:\n  effort: ludicrous\n',
    agent: { effort: 'ludicrous' },
  },
  {
    name: 'a model name is never checked against a list that would be stale in a month',
    frontMatter: 'agent:\n  model: some-model-from-next-year\n',
    agent: { model: 'some-model-from-next-year' },
  },
  {
    name: 'an empty args list is a value, not an absence',
    frontMatter: 'agent:\n  args: []\n',
    agent: { args: [] },
  },
  { name: 'no agent block at all reads as nothing configured', frontMatter: '', agent: {} },
  {
    name: 'a harness Ward has no adapter for is invalid, and the file degrades to defaults',
    frontMatter: 'agent:\n  harness: some-other-harness\n',
    agent: {},
  },
  {
    name: 'an empty argument would put an empty word on the command line — invalid',
    frontMatter: "agent:\n  args:\n    - ''\n",
    agent: {},
  },
  {
    name: 'args must be a list, not one string',
    frontMatter: 'agent:\n  args: --dangerously-skip-permissions\n',
    agent: {},
  },
];

for (const row of configRows) {
  test(`global config — ${row.name}`, async () => {
    writeConfig(row.frontMatter);
    expect((await readConfig(dir)).agent).toEqual(row.agent);
  });
}

test('the agent block is not resolved to defaults here — that belongs where both layers are', () => {
  // The global file is one layer of two. Defaulting on read would make a
  // global default beat a workspace value: precedence exactly backwards.
  expect(CONFIG_DEFAULTS.agent).toEqual({});
});

test('an unreadable config still answers every other key from its default', async () => {
  writeConfig('agent:\n  harness: nope\n');
  expect(await readConfig(dir)).toEqual(CONFIG_DEFAULTS);
});

// -- the workspace record's half -------------------------------------------

test('the extension is additive: a record written before this entry still validates', () => {
  const preExisting = {
    type: 'workspace',
    name: 'ws',
    wardVersion: '0.1.0',
    mainLine: 'main',
    createdAt: '2026-01-01T00:00:00.000Z',
  };
  const parsed = workspaceRecordSchema.safeParse(preExisting);
  expect(parsed.success).toBe(true);
  expect(parsed.data?.agent).toBeUndefined();
  // Which is just the workspace layer dropping out of the merge: no upgrade
  // is needed, the global layer answers, and the workspace keeps working.
  expect(
    resolveAgentConfig({ workspace: parsed.data?.agent, global: { model: 'fable' } }).model,
  ).toEqual(fromGlobal('fable'));
});

test('the record accepts the same block, and rejects what the config rejects', () => {
  const record = {
    type: 'workspace',
    name: 'ws',
    wardVersion: '0.1.0',
    createdAt: '2026-01-01T00:00:00.000Z',
  };
  expect(workspaceRecordSchema.safeParse({ ...record, agent: { model: 'sonnet' } }).success).toBe(
    true,
  );
  expect(workspaceRecordSchema.safeParse({ ...record, agent: { harness: 'other' } }).success).toBe(
    false,
  );
});

// -- setup -----------------------------------------------------------------
// A fresh configuration directory per case; every function under test takes
// its directory, so no case reads or writes the machine's real config.

let scratch: string;
let dir: string;
let caseId = 0;

function writeConfig(frontMatter: string): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, 'config.md'),
    `---\ntype: ward-config\n${frontMatter}---\n\nPreferences.\n`,
  );
}

beforeAll(() => {
  scratch = makeTempDir();
});

beforeEach(() => {
  caseId += 1;
  dir = join(scratch, `case-${caseId}`);
});

afterAll(() => {
  removeDir(scratch);
});
