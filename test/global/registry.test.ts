// The machine-level workspace registry and the global config
// (design/0023-global-config-registry/): registration is idempotent and keyed
// by location, order is derived from recency, the default is a pointer into
// the entry set, and every failure mode — a stale entry, a corrupt file, an
// unwritable directory — degrades to "no registry" rather than to a broken
// command. The intent invariant underneath every case: global state holds
// conveniences only (intent/01-concepts/06-workspace-lifecycle.md), so losing
// it must cost nothing but the shortcuts.
//
// Hermetic by construction: every function takes its directory, so no case
// reads or writes the machine's real config or state.
import { afterAll, beforeAll, beforeEach, expect, test } from 'bun:test';
import { chmodSync, existsSync, mkdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { CONFIG_DEFAULTS, inspectConfig, readConfig } from '../../src/global/config.ts';
import { locateRepo, locateWorkspace, searchOrder } from '../../src/global/locate.ts';
import { configDir, stateDir } from '../../src/global/paths.ts';
import {
  listWorkspaces,
  readRegistry,
  registerWorkspace,
  registryPath,
  resolutionOrder,
  setDefaultWorkspace,
  touchWorkspace,
  unregisterWorkspace,
} from '../../src/global/registry.ts';
import { createWorkspace } from '../../src/workspace/create.ts';
import { addRepository } from '../../src/workspace/repos.ts';
import { applyGitTestEnv, GIT_ENV, makeTempDir, removeDir } from '../helpers.ts';

// -- registration ----------------------------------------------------------

test('register: the workspace containing the path, marked default because it is the first', async () => {
  const report = await registerWorkspace(join(alpha, 'tasks'), state);
  expect(report).toMatchObject({ outcome: 'registered' });
  expect(report.entry).toMatchObject({ name: 'alpha', path: alpha, isDefault: true, stale: false });
});

test('register is idempotent: a registered path converges, and never doubles the entry', async () => {
  await registerWorkspace(alpha, state);
  const again = await registerWorkspace(alpha, state);
  expect(again.outcome).toBe('satisfied');
  expect(await listWorkspaces(state)).toHaveLength(1);
});

test('register refuses a path that no workspace encloses, naming the fix', async () => {
  await expect(registerWorkspace(scratch, state)).rejects.toThrow(
    /no Ward workspace encloses .* ward workspace create PATH/s,
  );
});

test('names are labels: a second workspace with the same basename is suffixed, not refused', async () => {
  await registerWorkspace(alpha, state);
  const twin = join(scratch, 'twin', 'alpha');
  await createWorkspace(twin);
  expect((await registerWorkspace(twin, state)).entry).toMatchObject({
    name: 'alpha-2',
    path: twin,
  });
});

test('unregister drops the entry and touches nothing on disk', async () => {
  await registerWorkspace(alpha, state);
  const report = await unregisterWorkspace('alpha', state);
  expect(report).toMatchObject({ outcome: 'unregistered' });
  expect(report.entry.isDefault).toBe(false); // out of the registry, so not the default
  expect(await listWorkspaces(state)).toEqual([]);
  expect(existsSync(join(alpha, 'workspace.md'))).toBe(true); // the workspace is untouched
});

test('unregister and default refuse an unknown identity, naming what is registered', async () => {
  await registerWorkspace(alpha, state);
  await expect(unregisterWorkspace('ghost', state)).rejects.toThrow(/registered: alpha/);
  await expect(setDefaultWorkspace('ghost', state)).rejects.toThrow(/registered: alpha/);
});

// -- the default and MRU order ---------------------------------------------

test('default: set by name or by path, converging when it is already the default', async () => {
  await registerWorkspace(alpha, state);
  await registerWorkspace(beta, state);
  expect((await setDefaultWorkspace('beta', state)).outcome).toBe('default-set');
  expect((await setDefaultWorkspace(beta, state)).outcome).toBe('satisfied');
  expect(resolutionOrder(await listWorkspaces(state))[0]?.name).toBe('beta');
});

test('unregistering the default hands it to the next most recent, so ward still answers', async () => {
  await registerWorkspace(alpha, state);
  await registerWorkspace(beta, state);
  await unregisterWorkspace('alpha', state); // alpha was the default (registered first)
  expect((await listWorkspaces(state))[0]).toMatchObject({ name: 'beta', isDefault: true });
});

test('MRU: a touched workspace leads the list; the default still leads resolution', async () => {
  await registerWorkspace(alpha, state); // default
  await registerWorkspace(beta, state);
  expect((await listWorkspaces(state)).map((entry) => entry.name)).toEqual(['beta', 'alpha']);

  await touchWorkspace(alpha, state);
  expect((await listWorkspaces(state)).map((entry) => entry.name)).toEqual(['alpha', 'beta']);
  await touchWorkspace(beta, state);
  expect((await listWorkspaces(state)).map((entry) => entry.name)).toEqual(['beta', 'alpha']);
  // Resolution is not MRU order: the default is what a verb falls back to.
  expect(resolutionOrder(await listWorkspaces(state))[0]?.name).toBe('alpha');
});

test('touching the workspace already at the head writes nothing — the hot path is a read', async () => {
  await registerWorkspace(alpha, state);
  await touchWorkspace(alpha, state);
  const before = statSync(registryPath(state)).mtimeMs;
  await Bun.sleep(10);
  await touchWorkspace(alpha, state);
  expect(statSync(registryPath(state)).mtimeMs).toBe(before);
});

test('touching an unregistered workspace records nothing — the registry is opt-in', async () => {
  await registerWorkspace(alpha, state);
  await touchWorkspace(beta, state);
  expect(await listWorkspaces(state)).toHaveLength(1);
});

// -- stale entries ---------------------------------------------------------

test('a stale entry is reported by list, skipped by resolution, and refused by name', async () => {
  await registerWorkspace(alpha, state);
  await registerWorkspace(beta, state);
  rmSync(join(beta, '.ward'), { recursive: true });

  expect(await listWorkspaces(state)).toMatchObject([
    { name: 'beta', stale: true },
    { stale: false },
  ]);
  expect(resolutionOrder(await listWorkspaces(state)).map((entry) => entry.name)).toEqual([
    'alpha',
  ]);
  await expect(locateWorkspaceIn(state, 'beta')).rejects.toThrow(
    /registered at .* but no workspace is there.*ward workspace unregister beta/s,
  );
});

// -- degrading honestly ----------------------------------------------------

test('no registry at all: reads are empty, and nothing throws', async () => {
  expect(await listWorkspaces(state)).toEqual([]);
  expect(await readRegistry(state)).toMatchObject({ state: 'absent' });
  expect(resolutionOrder(await listWorkspaces(state))).toEqual([]);
  await touchWorkspace(alpha, state); // no registry, nothing to touch, no throw
});

test('a corrupt registry reads as no registry — with the reason kept for doctor', async () => {
  mkdirSync(state, { recursive: true });
  writeFileSync(registryPath(state), '---\ntype: not-a-registry\n---\n');
  expect(await listWorkspaces(state)).toEqual([]); // the point of use: no registry
  const read = await readRegistry(state);
  expect(read).toMatchObject({ state: 'unreadable' }); // the diagnosis: kept
  expect(read.state === 'unreadable' && read.reason).toContain('workspaces.md');
  await touchWorkspace(alpha, state); // still never throws
  await expect(registerWorkspace(alpha, state)).rejects.toThrow(
    /is not a valid workspace registry/,
  );
});

const asRoot = (process.getuid?.() ?? 1) === 0;

test.skipIf(asRoot)(
  'an unwritable state directory: reads degrade, writes say so plainly',
  async () => {
    mkdirSync(state, { recursive: true });
    chmodSync(state, 0o500);
    try {
      expect(await listWorkspaces(state)).toEqual([]);
      await touchWorkspace(alpha, state); // never throws, whatever the filesystem says
      await expect(registerWorkspace(alpha, state)).rejects.toThrow(
        /cannot update .*workspaces\.md.*conveniences only/s,
      );
    } finally {
      chmodSync(state, 0o700);
    }
  },
);

// -- resolution from anywhere ----------------------------------------------

test('workspace path: the default when unnamed, the entry when named, refused when empty', async () => {
  await expect(locateWorkspaceIn(state)).rejects.toThrow(/no workspaces are registered/);
  await registerWorkspace(alpha, state);
  await registerWorkspace(beta, state);
  expect((await locateWorkspaceIn(state)).path).toBe(alpha);
  expect((await locateWorkspaceIn(state, 'beta')).path).toBe(beta);
  expect((await locateWorkspaceIn(state, beta)).name).toBe('beta'); // a path names it too
});

test('repo path search order: the workspace you stand in, then the default, then MRU', async () => {
  await registerWorkspace(alpha, state);
  await registerWorkspace(beta, state);
  await addRepository(beta, remote, 'only-in-beta');
  await addRepository(alpha, remote, 'in-both');
  await addRepository(beta, remote, 'in-both');

  await withState(state, async () => {
    // Standing in beta, `in-both` is beta's — the location wins over the default.
    expect((await searchOrder(beta)).map((ref) => ref.source)).toEqual(['cwd', 'default']);
    expect((await locateRepo('in-both', beta)).workspace.path).toBe(beta);
    // Standing nowhere, the default (alpha) answers first.
    expect((await locateRepo('in-both', scratch)).workspace.path).toBe(alpha);
    // A name only beta has is still found — the search continues past the default.
    expect((await locateRepo('only-in-beta', scratch)).workspace.path).toBe(beta);
    // --workspace asks exactly one, and a miss names where it looked.
    await expect(locateRepo('only-in-beta', scratch, 'alpha')).rejects.toThrow(
      /no repository named 'only-in-beta' is registered in 'alpha'/,
    );
    await expect(locateRepo('ghost', scratch)).rejects.toThrow(/'alpha'.*'beta'/s);
  });
});

test("a registered repo whose checkout is gone names the remedy, never a path that isn't there", async () => {
  await registerWorkspace(alpha, state);
  await addRepository(alpha, remote, 'vanished');
  rmSync(join(alpha, 'repos', 'vanished'), { recursive: true });
  await withState(state, async () => {
    await expect(locateRepo('vanished', alpha)).rejects.toThrow(
      /canonical checkout is missing.*ward workspace restore/s,
    );
  });
});

// -- global config ---------------------------------------------------------

const configRows: ReadonlyArray<{
  name: string;
  file?: string;
  stash: boolean;
  read: 'absent' | 'read' | 'unreadable';
}> = [
  { name: 'absent: the built-in defaults apply', stash: false, read: 'absent' },
  {
    name: 'a dotted key is its path through the document',
    file: '---\ntype: ward-config\nrepo:\n  refresh:\n    stash: true\n---\n',
    stash: true,
    read: 'read',
  },
  {
    name: 'an unset key falls back to its default, the file notwithstanding',
    file: '---\ntype: ward-config\n---\n',
    stash: false,
    read: 'read',
  },
  {
    name: 'a wrongly-typed value is invalid, and the defaults still apply',
    file: '---\ntype: ward-config\nrepo:\n  refresh:\n    stash: yes-please\n---\n',
    stash: false,
    read: 'unreadable',
  },
  {
    name: 'unparseable front matter degrades the same way',
    file: 'not a document at all\n',
    stash: false,
    read: 'unreadable',
  },
];

for (const row of configRows) {
  test(`global config — ${row.name}`, async () => {
    if (row.file !== undefined) {
      mkdirSync(config, { recursive: true });
      writeFileSync(join(config, 'config.md'), row.file);
    }
    expect((await readConfig(config)).repo.refresh.stash).toBe(row.stash);
    expect((await inspectConfig(config)).read.state).toBe(row.read);
  });
}

test('the defaults are stated once — the resolved config with no file is exactly them', async () => {
  expect(await readConfig(config)).toEqual(CONFIG_DEFAULTS);
});

// -- where the files live --------------------------------------------------

const pathRows: ReadonlyArray<{
  name: string;
  env: Record<string, string | undefined>;
  config: string;
  state: string;
}> = [
  {
    name: 'XDG unset: the conventional defaults under $HOME',
    env: {},
    config: join(home(), '.config', 'ward'),
    state: join(home(), '.local', 'state', 'ward'),
  },
  {
    name: 'XDG set: honored, one directory per kind',
    env: { XDG_CONFIG_HOME: '/xdg/config', XDG_STATE_HOME: '/xdg/state' },
    config: '/xdg/config/ward',
    state: '/xdg/state/ward',
  },
  {
    name: 'a relative XDG value is ignored, as the basedir spec requires',
    env: { XDG_CONFIG_HOME: 'relative/config', XDG_STATE_HOME: '' },
    config: join(home(), '.config', 'ward'),
    state: join(home(), '.local', 'state', 'ward'),
  },
  {
    name: 'the WARD_ overrides win outright — the seam tests are hermetic through',
    env: { XDG_CONFIG_HOME: '/xdg/config', WARD_CONFIG_DIR: '/w/cfg', WARD_STATE_DIR: '/w/state' },
    config: '/w/cfg',
    state: '/w/state',
  },
];

for (const row of pathRows) {
  test(`global paths — ${row.name}`, () => {
    expect(configDir(row.env)).toBe(row.config);
    expect(stateDir(row.env)).toBe(row.state);
  });
}

// -- setup -----------------------------------------------------------------
// A fresh state and config directory per case (the verbs mutate), two
// workspaces `alpha` and `beta`, and one bare remote the repository cases add
// from. `locateWorkspaceIn` / `withState` point the two locate helpers — which
// read the ambient directory, as the CLI does — at the case's own state.

let scratch: string;
let remote: string;
let alpha: string;
let beta: string;
let state: string;
let config: string;
let caseId = 0;

function home(): string {
  return process.env.HOME ?? '';
}

/** Run `fn` with the ambient state directory pinned at `dir`. */
async function withState<T>(dir: string, fn: () => Promise<T>): Promise<T> {
  const previous = process.env.WARD_STATE_DIR;
  process.env.WARD_STATE_DIR = dir;
  try {
    return await fn();
  } finally {
    process.env.WARD_STATE_DIR = previous;
  }
}

function locateWorkspaceIn(dir: string, target?: string) {
  return withState(dir, () => locateWorkspace(target));
}

beforeAll(async () => {
  applyGitTestEnv();
  scratch = makeTempDir();
  remote = join(scratch, 'remote.git');
  Bun.spawnSync(['git', 'init', '--bare', '--initial-branch=main', remote], {
    env: { ...process.env, ...GIT_ENV },
  });
  const seed = join(scratch, 'seed');
  Bun.spawnSync(['git', 'clone', remote, seed], { env: { ...process.env, ...GIT_ENV } });
  await Bun.write(join(seed, 'README.md'), 'demo\n');
  for (const argv of [
    ['checkout', '-b', 'main'],
    ['add', '-A'],
    ['commit', '-m', 'seed'],
    ['push', '-u', 'origin', 'main'],
  ]) {
    Bun.spawnSync(['git', '-C', seed, ...argv], { env: { ...process.env, ...GIT_ENV } });
  }
});

beforeEach(async () => {
  caseId += 1;
  const home = join(scratch, `case-${caseId}`);
  state = join(home, 'state');
  config = join(home, 'config');
  alpha = join(home, 'alpha');
  beta = join(home, 'beta');
  await createWorkspace(alpha);
  await createWorkspace(beta);
});

afterAll(() => {
  removeDir(scratch);
});
