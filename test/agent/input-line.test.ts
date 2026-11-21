// Reading Claude Code's input line off its screen
// (design/0067-floor-dispatch/): the one question a nudge asks before it
// types, and again before it submits. The screens are Claude Code 2.1.325's,
// as `tmux capture-pane -p` returned them from a real run, trimmed of nothing
// that the reader looks at. What matters is the last table: every screen
// where Enter would answer a question instead of sending a message reads as
// no input line at all.
import { expect, test } from 'bun:test';
import { claudeAdapter, claudeInputLine } from '../../src/harness/claude.ts';
import { piAdapter } from '../../src/harness/pi.ts';

const RULE = '─'.repeat(120);
const STATUS = [
  '  Haiku 5.5 | medium | $0.00                                    Update available!',
  '  d98e4c3f-f7d2-4934-8cc2-41fb474e4332 | …/main                                 /rc',
  '  ⏵⏵ auto mode on (shift+tab to cycle)',
];
const BANNER = [' ▐▛███▛█   Claude Code v2.1.325', '▝▜██████▀  Haiku 5.5 · Claude Max', ''];
const NOTICE =
  '[ward] hand-off to floor 3: task f3t4 (fix-login) from floor 7. Read it: ward task show f3t4';

const screen = (...rows: string[]) => `${rows.join('\n')}\n`;
const box = (...rows: string[]) => [RULE, ...rows, RULE, ...STATUS];

test.each<[string, string, string]>([
  [
    'an empty line shows its placeholder',
    screen(...BANNER, ...box('❯ Try "refactor <filepath>"')),
    'Try "refactor <filepath>"',
  ],
  ['a truly empty line', screen(...BANNER, ...box('❯ ')), ''],
  ['the typed notice, alone', screen(...BANNER, ...box(`❯ ${NOTICE}`)), NOTICE],
  [
    'the notice wrapped onto a second row',
    screen(
      ...BANNER,
      ...box(`❯ ${NOTICE.slice(0, 60).trimEnd()}`, `  ${NOTICE.slice(60).trimStart()}`),
    ),
    `${NOTICE.slice(0, 60).trimEnd()} ${NOTICE.slice(60).trimStart()}`,
  ],
  [
    "someone's words, then the notice",
    screen(...BANNER, ...box(`❯ half a thought${NOTICE}`)),
    `half a thought${NOTICE}`,
  ],
  [
    'mid-turn, with a message already queued',
    screen(
      '  the hidden reef, the sandbar that moves with every storm',
      '',
      `❯ ${NOTICE}`,
      '  ctrl+x ctrl+s to send now',
      '',
      ...box('❯ Press up to edit queued messages'),
    ),
    'Press up to edit queued messages',
  ],
  [
    'a rule in the transcript above is not the line',
    screen('⏺ Here is a section break:', RULE, 'and more prose', '', ...box('❯ ')),
    '',
  ],
])('the input line: %s', (_name, text, expected) => {
  expect(claudeInputLine(text)?.text).toBe(expected);
});

test('the rows a reading rests on: the upper rule to the last status row, never the transcript above', () => {
  // Banner rows 0-2, the upper rule at 3, the line at 4, the lower rule at 5,
  // three status rows at 6-8.
  expect(claudeInputLine(screen(...BANNER, ...box(`❯ ${NOTICE}`)))?.rows).toEqual({
    first: 3,
    last: 8,
  });
  // A wrapped line, and no status beneath it: the lower rule is the last row.
  expect(
    claudeInputLine(
      screen('prose', RULE, `❯ ${NOTICE.slice(0, 60)}`, `  ${NOTICE.slice(60).trimStart()}`, RULE),
    )?.rows,
  ).toEqual({ first: 1, last: 4 });
  // Blank rows beneath the status area are not part of it.
  expect(claudeInputLine(screen(RULE, '❯ ', RULE, '  status', '', ''))?.rows).toEqual({
    first: 0,
    last: 3,
  });
});

test.each<[string, string]>([
  [
    'a permission question (Enter answers Yes)',
    screen(
      '❯ Use the Write tool to create permtest.txt containing the word hi.',
      '',
      '⏺ Write(permtest.txt)',
      '',
      RULE,
      ' Create file',
      ' permtest.txt',
      '╌'.repeat(120),
      '  1 hi',
      '╌'.repeat(120),
      ' Do you want to create permtest.txt?',
      ' ❯ 1. Yes',
      '   2. Yes, and switch to accept edits for this session',
      '   3. No',
      '',
      ' Esc to cancel · Tab to amend',
    ),
  ],
  [
    'a permission question under a transcript that submitted this very notice',
    screen(
      RULE,
      `❯ ${NOTICE}`,
      '',
      '⏺ Bash(ward task show f3t4)',
      '',
      RULE,
      ' Bash command',
      '   ward task show f3t4',
      ' Do you want to proceed?',
      ' ❯ 1. Yes',
      '   2. No',
      '',
      ' Esc to cancel · Tab to amend',
    ),
  ],
  [
    'the trust question at startup (Enter answers No, exit)',
    screen(
      '',
      RULE,
      ' Accessing workspace:',
      '',
      ' /somewhere/ws',
      '',
      ' Quick safety check: Is this a project you created or one you trust?',
      '',
      ' ❯ No, exit',
      '   Yes, I trust this folder',
      '',
      ' Enter to confirm · Esc to cancel',
    ),
  ],
  ['a harness still starting: nothing drawn', screen('', '')],
  ['a plain shell', screen('$ ls', 'AGENTS.md  workspace.md', '$ ')],
  ['a dead pane', screen('Pane is dead (status 127, Mon Nov 16 21:28:31 2026)')],
  [
    'more beneath the line than a status area',
    screen(RULE, '❯ text', RULE, ...Array.from({ length: 9 }, (_, n) => ` option ${n}`)),
  ],
  [
    'a box far taller than a typed line',
    screen(RULE, '❯ text', ...Array.from({ length: 12 }, () => '  more'), RULE, ...STATUS),
  ],
])('no input line: %s', (_name, text) => {
  expect(claudeInputLine(text)).toBeNull();
});

test('the reader is the claude adapter’s, and a harness without one has none', () => {
  expect(claudeAdapter.inputLine).toBe(claudeInputLine);
  expect(piAdapter.inputLine).toBeUndefined();
});
