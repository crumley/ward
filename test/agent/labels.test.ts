// What a human reads on a hosted session (design/0061-host-names-and-titles/):
// the host's name, the window's name, and the terminal's title — each a pure
// function of facts the records hold, and none of them a session id.
import { expect, test } from 'bun:test';
import {
  distinguish,
  type FloorIdentity,
  foregroundTitle,
  hostName,
  hostTitle,
  type Subject,
  shortSlug,
  shortText,
  windowLabel,
} from '../../src/agent/labels.ts';
import { setTerminalTitle, titleEscape } from '../../src/agent/title.ts';

const F0: FloorIdentity = { number: 0, slug: 'workspace' };
const F7: FloorIdentity = { number: 7, slug: 'ward-development' };
const F9: FloorIdentity = { number: 9, slug: 'review-tool', emoji: '🔍' };
const LONG: FloorIdentity = { number: 4, slug: 'obsidian-brain-refresh-and-more' };

test.each<[string, FloorIdentity, string, string]>([
  ['main', F0, 'main-f0-workspace', 'main f0'],
  ['main', F7, 'main-f7-ward-development', 'main f7'],
  // The name is the one a human types: a floor's emoji marks the title, never the name.
  ['main', F9, 'main-f9-review-tool', '🔍 main f9'],
  ['main', LONG, 'main-f4-obsidian-brain-refresh', 'main f4'],
  ['main', { number: 3, slug: '' }, 'main-f3', 'main f3'], // no project record on the floor
])('workspace %p, floor %p: host %p, titled %p', (workspace, floor, name, title) => {
  expect(hostName(workspace, floor)).toBe(name);
  expect(hostTitle(workspace, floor)).toBe(title);
});

test.each<[string, Subject, number, string]>([
  ['the coordinator, on any floor', { kind: 'coordinator' }, 7, 'coord'],
  ['a helper with no purpose given', { kind: 'helper' }, 0, 'helper'],
  [
    'a helper, by the purpose it was given',
    { kind: 'helper', purpose: 'Sweep stale worktrees across every floor' },
    0,
    'Sweep stale worktrees a…',
  ],
  ["a floor's session, in its own host", { kind: 'floor', floor: F7 }, 7, 'ward-development'],
  ["a floor's session, in another's host", { kind: 'floor', floor: F7 }, 3, 'f7 ward-development'],
  ['a floor with an emoji, elsewhere', { kind: 'floor', floor: F9 }, 3, '🔍f9 review-tool'],
  ['a floor no record names', { kind: 'floor', floor: { number: 3, slug: '' } }, 3, 'f3'],
  [
    'a task, on its own floor',
    { kind: 'task', floor: F7, room: 33, slug: 'host-names-and-titles' },
    7,
    't33 host-names-and-titles',
  ],
  [
    "a task, in another floor's host",
    { kind: 'task', floor: F7, room: 33, slug: 'host-names-and-titles' },
    3,
    'f7t33 host-names-and-titles',
  ],
  ['a legacy bare task', { kind: 'task', room: 2, slug: 'old-work' }, 0, 'legacy-t2 old-work'],
])('%s is %p (host floor %p) → %p', (_name, subject, hostFloor, label) => {
  expect(windowLabel(subject, hostFloor)).toBe(label);
});

test.each<[string, Subject, string]>([
  ['the coordinator', { kind: 'coordinator' }, 'coord · main'],
  ["a floor's session", { kind: 'floor', floor: F7 }, 'f7 ward-development · main'],
  ['a task', { kind: 'task', floor: F7, room: 33, slug: 'titles' }, 'f7t33 titles · main'],
])('in the foreground, %s is titled %p', (_name, subject, title) => {
  expect(foregroundTitle(subject, 'main')).toBe(title);
});

test('only windows that would read the same in one host take their ordinal', () => {
  expect(
    distinguish([
      { label: 'coord', host: 0, ordinal: 16 },
      { label: 'coord', host: 0, ordinal: 17 },
      { label: 't1 fix', host: 3, ordinal: 1 },
      { label: 't1 fix', host: 5, ordinal: 1 }, // another host: nothing to tell apart
      { label: 'alpha', host: 1, ordinal: 2 },
    ]),
  ).toEqual(['coord 16', 'coord 17', 't1 fix', 't1 fix', 'alpha']);
});

test.each([
  ['short', 'short'],
  ['obsidian-brain-refresh-and-more', 'obsidian-brain-refresh'], // whole words only
  ['supercalifragilisticexpialidocious', 'supercalifragilisticexpi'], // no boundary to keep
])('the slug %p sits in a name as %p', (slug, expected) => {
  expect(shortSlug(slug)).toBe(expected);
});

test('free text is one line, cut with an ellipsis', () => {
  expect(shortText('two\nlines\there')).toBe('two lines here');
  expect(shortText('x'.repeat(40))).toBe(`${'x'.repeat(23)}…`);
});

test('a title is written only to a terminal, and nothing in it can end the escape early', () => {
  expect(titleEscape('coord · main')).toBe('\u001b]2;coord · main\u0007');
  expect(titleEscape('a\u0007b\u001bc\nd')).toBe('\u001b]2;a b c d\u0007');
  const written: string[] = [];
  const write = (text: string) => written.push(text);
  expect(setTerminalTitle('coord', { isTTY: false, write })).toBe(false);
  expect(setTerminalTitle('coord', { write })).toBe(false);
  expect(written).toEqual([]); // a pipe gets no escape
  expect(setTerminalTitle('coord', { isTTY: true, write })).toBe(true);
  expect(written).toEqual(['\u001b]2;coord\u0007']);
});
