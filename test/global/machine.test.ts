// What this machine is called (design/0038-machine-bound-sessions/,
// design/0085-machine-name-pinned/): the ladder — an env override, the
// configured key, the stored pin, the hostname — the pin's first-run write, and the one
// normalizer every layer's answer goes through, so a machine name can always
// be spelled inside a session id, a filename, and an unquoted shell argument.
import { afterEach, beforeEach, expect, test } from 'bun:test';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  type HostReading,
  inspectMachine,
  type MachineSeams,
  type MachineSource,
  machineName,
  machinePinPath,
  readHost,
  readMachine,
  readPin,
} from '../../src/global/machine.ts';
import { makeTempDir, removeDir } from '../helpers.ts';

const LADDER: readonly [string, string | undefined, string, string, MachineSource][] = [
  // [why, configured, hostname, expected name, expected source]
  ['the hostname when nothing is configured', undefined, 'gcp', 'gcp', 'hostname'],
  ['the first label only — the domain is noise', undefined, 'mbp.local', 'mbp', 'hostname'],
  ['lowercased', undefined, 'Ryans-MacBook-Pro', 'ryans-macbook-pro', 'hostname'],
  ['punctuation collapses to one hyphen', undefined, 'box_2!!3', 'box-2-3', 'hostname'],
  ['a configured name wins over the hostname', 'work', 'gcp', 'work', 'configured'],
  ['a configured name is normalized too', 'My Box', 'gcp', 'my-box', 'configured'],
  ['an unnameable hostname still answers', undefined, '!!!', 'local', 'hostname'],
  ['a configured name that carries none falls through', '???', 'gcp', 'gcp', 'hostname'],
];

test.each(LADDER)('%s', (_why, configured, host, name, source) => {
  expect(machineName(configured, {}, host)).toEqual({ name, source });
});

test('WARD_MACHINE overrides one invocation — the narrowest layer wins', () => {
  // The same shape `claudeCommand` gives the harness command
  // (design/0035-agent-command/): an env override above the configuration,
  // which is what keeps every test in this suite off the machine's real name.
  expect(machineName('work', { WARD_MACHINE: 'ci' }, 'gcp')).toEqual({
    name: 'ci',
    source: 'override',
  });
  // An empty override is not an override: it says nothing, so the next layer
  // answers rather than a session id ending in `@`.
  expect(machineName('work', { WARD_MACHINE: '' }, 'gcp')).toEqual({
    name: 'work',
    source: 'configured',
  });
});

// -- the pin (design/0085-machine-name-pinned/) -----------------------------

const PINNED: readonly [
  string,
  Record<string, string>,
  string | undefined,
  string,
  MachineSource,
][] = [
  // [why, env, configured, expected name, expected source] — stored 'dstar', host 'mac'
  ['a stored name wins over the hostname', {}, undefined, 'dstar', 'stored'],
  ['a configured name wins over the stored one', {}, 'work', 'work', 'configured'],
  ['WARD_MACHINE wins over the stored one', { WARD_MACHINE: 'ci' }, undefined, 'ci', 'override'],
];

test.each(PINNED)('%s', (_why, env, configured, name, source) => {
  expect(machineName(configured, env, 'mac.lan', 'dstar')).toEqual({ name, source });
});

test('a stored name that carries none falls through to the hostname', () => {
  expect(machineName(undefined, {}, 'mac.lan', '!!')).toEqual({ name: 'mac', source: 'hostname' });
});

test('the first derivation is stored, and answers from then on, whatever the host reads', async () => {
  const first = await readMachine(seams('dstar.local'));
  expect(first).toEqual({ name: 'dstar', source: 'stored' });
  const pin = await readPin(state);
  expect(pin).toEqual({
    state: 'read',
    name: 'dstar',
    pinnedAt: '2026-11-22T12:00:00.000Z',
    from: 'hostname',
    host: 'dstar.local',
  });
  expect(readFileSync(machinePinPath(state), 'utf8')).toContain('set `machine:`');

  // The network hands the machine another name: the pin holds, and the file
  // is not rewritten.
  const later = await readMachine(seams('mac.lan', '2026-11-23T08:00:00.000Z'));
  expect(later).toEqual({ name: 'dstar', source: 'stored' });
  expect(await readPin(state)).toEqual(pin);
});

test('an override or a configured name answers without storing anything', async () => {
  expect(await readMachine({ ...seams('dstar'), env: { WARD_MACHINE: 'ci' } })).toEqual({
    name: 'ci',
    source: 'override',
  });
  mkdirSync(config, { recursive: true });
  writeFileSync(join(config, 'config.md'), '---\ntype: ward-config\nmachine: Work Box\n---\n');
  expect(await readMachine(seams('dstar'))).toEqual({ name: 'work-box', source: 'configured' });
  expect(existsSync(machinePinPath(state))).toBe(false);
});

test('an unreadable pin is left alone and the name derived each run', async () => {
  mkdirSync(state, { recursive: true });
  writeFileSync(machinePinPath(state), '---\ntype: ward-machine\nname: [oops\n---\n');
  const before = readFileSync(machinePinPath(state), 'utf8');
  expect(await readMachine(seams('mac'))).toEqual({ name: 'mac', source: 'hostname' });
  expect(await readMachine(seams('dstar'))).toEqual({ name: 'dstar', source: 'hostname' });
  expect(readFileSync(machinePinPath(state), 'utf8')).toBe(before);
  expect((await readPin(state)).state).toBe('unreadable');
});

test('a pin that cannot be written costs the guard, never the command', async () => {
  // The state directory's place is taken by a file: nothing can be made under it.
  writeFileSync(state, 'not a directory');
  expect(await readMachine(seams('dstar'))).toEqual({ name: 'dstar', source: 'hostname' });
});

test('two first runs at once agree on one stored name', async () => {
  const [a, b] = await Promise.all([readMachine(seams('dstar')), readMachine(seams('mac'))]);
  expect(a.source).toBe('stored');
  expect(b).toEqual(a);
  const pin = await readPin(state);
  expect(pin.state === 'read' ? pin.name : undefined).toBe(a.name);
});

// -- the host reading --------------------------------------------------------

const READINGS: readonly [string, string, string | undefined, HostReading][] = [
  // [why, platform, LocalHostName, expected reading] — kernel hostname 'mac.lan'
  ['macOS reads the LocalHostName', 'darwin', 'dstar\n', { host: 'dstar', from: 'LocalHostName' }],
  ['macOS without one falls back', 'darwin', undefined, { host: 'mac.lan', from: 'hostname' }],
  ['macOS with an empty one falls back', 'darwin', ' \n', { host: 'mac.lan', from: 'hostname' }],
  ['elsewhere the kernel hostname', 'linux', 'dstar', { host: 'mac.lan', from: 'hostname' }],
];

test.each(READINGS)('%s', (_why, platform, local, reading) => {
  expect(
    readHost(
      platform,
      () => local,
      () => 'mac.lan',
    ),
  ).toEqual(reading);
});

test('inspectMachine reads the pin and the derivation, and writes nothing', async () => {
  const unpinned = await inspectMachine(undefined, seams('dstar'));
  expect(unpinned).toMatchObject({
    name: { name: 'dstar', source: 'hostname' },
    pin: { state: 'absent' },
    derived: { name: 'dstar', host: 'dstar', from: 'hostname' },
  });
  expect(existsSync(machinePinPath(state))).toBe(false);
  await readMachine(seams('dstar'));
  const moved = await inspectMachine(undefined, seams('mac'));
  expect(moved.name).toEqual({ name: 'dstar', source: 'stored' });
  expect(moved.derived.name).toBe('mac');
});

// -- setup -------------------------------------------------------------------

let scratch: string;
let config: string;
let state: string;

/** The seams with this case's directories, a host that reads `host`, and a fixed clock. */
function seams(host: string, now = '2026-11-22T12:00:00.000Z'): MachineSeams {
  return {
    env: {},
    configDir: config,
    stateDir: state,
    readHost: () => ({ host, from: 'hostname' }),
    now: () => new Date(now),
  };
}

beforeEach(() => {
  scratch = makeTempDir();
  config = join(scratch, 'config');
  state = join(scratch, 'state');
});

afterEach(() => removeDir(scratch));
