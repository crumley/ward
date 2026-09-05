// What this machine is called (design/0038-machine-bound-sessions/): the
// ladder — an env override, the configured key, the hostname — and the one
// normalizer every layer's answer goes through, so a machine name can always
// be spelled inside a session id, a filename, and an unquoted shell argument.
import { expect, test } from 'bun:test';
import { type MachineSource, machineName } from '../../src/global/machine.ts';

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
