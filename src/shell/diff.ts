// A line-oriented unified diff, for `ward shell diff fish NAME`
// (design/0027-shell-adoption/): what an adopted file holds today against
// what this ward would write. It is the "here's the diff" half of the
// human's three choices — ignore it, see it, or take it — so the whole job is
// to be readable and to be honest about which side is which.
//
// Written here rather than pulled in: the inputs are two shell functions,
// tens of lines each, and the entire need is `diff -u` over them. A
// dependency would be a stack decision (an ADR) for output nothing else in
// Ward consumes, and Ward's one hard rule about the diff — that the `-` side
// is the file the human owns and the `+` side is ward's offer — is a labeling
// choice no library would make for us.

/** How many unchanged lines flank a change, `diff -u`'s own default. */
const CONTEXT = 3;

export interface DiffLabels {
  /** The `---` side: what is installed, the file the human owns. */
  readonly from: string;
  /** The `+++` side: what this ward would write. */
  readonly to: string;
}

/**
 * A unified diff of two texts, or the empty string when they are identical —
 * an empty answer being exactly what "nothing to show" should print. The
 * result ends in a newline whenever it is non-empty, so a caller can write it
 * straight to stdout.
 */
export function unifiedDiff(from: string, to: string, labels: DiffLabels): string {
  if (from === to) return '';
  const a = splitLines(from);
  const b = splitLines(to);
  const hunks = hunksOf(a, b, common(a, b));
  if (hunks.length === 0) return '';
  return [`--- ${labels.from}`, `+++ ${labels.to}`, ...hunks].join('\n') + '\n';
}

/**
 * Lines without their terminators. A trailing newline is dropped rather than
 * yielding a phantom empty last line: every file Ward writes ends in one, so
 * keeping it would put an unchanged blank line at the end of every diff.
 */
function splitLines(text: string): readonly string[] {
  const lines = text.split('\n');
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  return lines;
}

/** One aligned pair of line indices — `a[ai]` and `b[bi]` are the same line. */
interface Match {
  readonly ai: number;
  readonly bi: number;
}

/**
 * The longest common subsequence of the two line arrays, as index pairs. The
 * classic O(n·m) table: these inputs are one shell function each, so the
 * quadratic cost is a few thousand cells and buys the smallest diff rather
 * than a greedy approximation of one.
 */
function common(a: readonly string[], b: readonly string[]): readonly Match[] {
  const lengths: number[][] = Array.from({ length: a.length + 1 }, () =>
    new Array<number>(b.length + 1).fill(0),
  );
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      // biome-ignore lint/style/noNonNullAssertion: every index is in range by construction.
      lengths[i]![j] =
        a[i] === b[j]
          ? // biome-ignore lint/style/noNonNullAssertion: same.
            lengths[i + 1]![j + 1]! + 1
          : // biome-ignore lint/style/noNonNullAssertion: same.
            Math.max(lengths[i + 1]![j]!, lengths[i]![j + 1]!);
    }
  }
  const matches: Match[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      matches.push({ ai: i, bi: j });
      i++;
      j++;
      // biome-ignore lint/style/noNonNullAssertion: every index is in range by construction.
    } else if (lengths[i + 1]![j]! >= lengths[i]![j + 1]!) {
      i++;
    } else {
      j++;
    }
  }
  return matches;
}

/**
 * The diff's hunks, each `@@ -x,y +p,q @@` header followed by its lines.
 * Changed regions within `CONTEXT` lines of each other merge into one hunk,
 * which is what makes a unified diff readable rather than a shower of
 * one-line fragments.
 */
function hunksOf(
  a: readonly string[],
  b: readonly string[],
  matches: readonly Match[],
): readonly string[] {
  // The changed spans, as [aStart, aEnd) × [bStart, bEnd) between matches.
  const spans: { aStart: number; aEnd: number; bStart: number; bEnd: number }[] = [];
  let ai = 0;
  let bi = 0;
  for (const match of [...matches, { ai: a.length, bi: b.length }]) {
    if (match.ai > ai || match.bi > bi) {
      spans.push({ aStart: ai, aEnd: match.ai, bStart: bi, bEnd: match.bi });
    }
    ai = match.ai + 1;
    bi = match.bi + 1;
  }
  if (spans.length === 0) return [];

  const lines: string[] = [];
  let group = [spans[0] as (typeof spans)[number]];
  const flush = (): void => {
    const first = group[0] as (typeof spans)[number];
    const last = group[group.length - 1] as (typeof spans)[number];
    const aStart = Math.max(0, first.aStart - CONTEXT);
    const aEnd = Math.min(a.length, last.aEnd + CONTEXT);
    const bStart = Math.max(0, first.bStart - CONTEXT);
    const bEnd = Math.min(b.length, last.bEnd + CONTEXT);
    lines.push(`@@ -${range(aStart, aEnd)} +${range(bStart, bEnd)} @@`);
    let cursor = aStart;
    for (const span of group) {
      for (let i = cursor; i < span.aStart; i++) lines.push(` ${a[i]}`);
      for (let i = span.aStart; i < span.aEnd; i++) lines.push(`-${a[i]}`);
      for (let i = span.bStart; i < span.bEnd; i++) lines.push(`+${b[i]}`);
      cursor = span.aEnd;
    }
    for (let i = cursor; i < aEnd; i++) lines.push(` ${a[i]}`);
  };
  for (const span of spans.slice(1)) {
    const last = group[group.length - 1] as (typeof spans)[number];
    if (span.aStart - last.aEnd <= CONTEXT * 2) group.push(span);
    else {
      flush();
      group = [span];
    }
  }
  flush();
  return lines;
}

/** `start,count` in unified-diff's 1-based numbering; a zero-length range starts at `start`. */
function range(start: number, end: number): string {
  const count = end - start;
  return `${count === 0 ? start : start + 1},${count}`;
}
