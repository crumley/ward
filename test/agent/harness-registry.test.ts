// The harness registry (design/0044-pi-harness/): the two ways Ward selects an
// adapter — by NAME for a launch, by HANDLE PREFIX for everything after. The
// point the test pins is that the two never cross: a `claude:` handle resolves
// to claude in a workspace configured for pi, which is what lets one workspace
// mix harnesses without a run ever being handed to an adapter that cannot read
// its handle.
import { expect, test } from 'bun:test';
import { WardError } from '../../src/errors.ts';
import { adapterForHandle, adapterNamed, HARNESS_ADAPTERS } from '../../src/harness/index.ts';

test('every adapter’s name is its handle prefix, and the names are distinct', () => {
  const names = HARNESS_ADAPTERS.map((a) => a.name);
  expect(names).toEqual(['claude', 'pi']);
  expect(new Set(names).size).toBe(names.length);
  for (const adapter of HARNESS_ADAPTERS) {
    expect(adapter.handle('x')).toBe(`${adapter.name}:x`);
    expect(adapter.nativeId(`${adapter.name}:x`)).toBe('x');
  }
});

test('adapterNamed selects by the configured harness, and refuses an unknown one', () => {
  expect(adapterNamed('claude').name).toBe('claude');
  expect(adapterNamed('pi').name).toBe('pi');
  expect(() => adapterNamed('nope')).toThrow(WardError);
  expect(() => adapterNamed('nope')).toThrow(/claude, pi/);
});

test('adapterForHandle routes by prefix — the run keeps the harness it was born under', () => {
  expect(adapterForHandle('claude:abc')?.name).toBe('claude');
  expect(adapterForHandle('pi:abc')?.name).toBe('pi');
  expect(adapterForHandle('codex:abc')).toBeNull(); // a harness Ward no longer has
  expect(adapterForHandle('bare-id')).toBeNull(); // says nothing about its harness
  expect(adapterForHandle(undefined)).toBeNull(); // no handle recorded
});
