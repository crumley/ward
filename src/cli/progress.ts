// Live progress for `ward repo refresh` (design/0023-refresh-concurrency-ux/).
// Refresh now runs its repositories at once, which makes "what is it doing?"
// a real question for the half of the time the command is alive — so the
// human watching a terminal gets an in-place, multi-line status that settles
// into the final report, and every other caller gets the report streamed as
// it settles, byte-for-byte what the sequential version printed.
//
// The two-audiences asymmetry (§8) decides which: an in-place redraw is a
// human-audience cue, exactly like color, so it is offered only when the
// caller has not declared itself an agent AND stdout is a terminal that can
// hold the block. Every other caller — an agent, a pipe, a CI log, a terminal
// too short — degrades to the plain stream (§20): fewer cues, never a
// different answer, and never a control sequence in someone's log file.
//
// The renderer holds no state about the refresh: it is handed a complete,
// ordered snapshot on every transition and paints it. That is what keeps this
// seam small and swappable — a second renderer (a status line, a TUI pane)
// implements one function.
import type { RefreshRow, RefreshState } from '../workspace/repos.ts';
import { callerIsAgent } from './caller.ts';

/** The palette the rows are painted with — picocolors, or its no-op twin. */
export interface Palette {
  readonly green: (text: string) => string;
  readonly yellow: (text: string) => string;
  readonly red: (text: string) => string;
  readonly dim: (text: string) => string;
}

/** Where the rows go: the subset of a writable stream this module needs. */
export interface ProgressStream {
  write(chunk: string): unknown;
  readonly isTTY?: boolean | undefined;
  readonly rows?: number | undefined;
}

export interface RefreshDisplay {
  /** Pass this to `refreshRepositories`'s `observe`. */
  readonly observe: (rows: readonly RefreshRow[]) => void;
  /** Called once the refresh has returned: the report is on screen, tidy up. */
  readonly settle: () => void;
}

/**
 * The display for this caller. Live where a human is watching a terminal tall
 * enough for the block, plain streaming everywhere else.
 */
export function refreshDisplay(
  palette: Palette,
  stream: ProgressStream = process.stdout,
  isAgent: boolean = callerIsAgent(),
): RefreshDisplay {
  return !isAgent && stream.isTTY === true
    ? liveDisplay(palette, stream)
    : streamingDisplay(palette, stream);
}

/**
 * The plain form: each repository's final line, printed once, **in
 * registration order** — a row goes out as soon as it and every row before it
 * has settled. Streaming in completion order would have been simpler and is
 * what "as it completes" literally means, but it would make the same set of
 * repositories print in a different order on every run, which is precisely
 * what an agent, a diff, or a test cannot use (§6). Ordered streaming keeps
 * the liveness that matters — the first repositories appear while the rest
 * are still fetching — and costs only the wait for a slow row ahead.
 */
function streamingDisplay(palette: Palette, stream: ProgressStream): RefreshDisplay {
  let emitted = 0;
  return {
    observe(rows) {
      while (emitted < rows.length) {
        const row = rows[emitted];
        if (row === undefined || !hasSettled(row.state)) return;
        stream.write(`${refreshLine(palette, row)}\n`);
        emitted += 1;
      }
    },
    settle() {},
  };
}

/**
 * The live form: one line per repository, repainted in place as states
 * change, settling into exactly the lines the plain form would have printed.
 * Repaint is driven by state changes alone — no timer, no spinner frames:
 * there is nothing to animate between transitions, and a process that keeps
 * no timer has nothing to leak or to flush at exit.
 */
function liveDisplay(palette: Palette, stream: ProgressStream): RefreshDisplay {
  let painted = 0;
  let restore: (() => void) | null = null;
  // A block taller than the terminal scrolls, and scrolled lines cannot be
  // moved back to — so the first snapshot that does not fit hands the whole
  // run to the plain stream rather than painting over the human's scrollback
  // (§20: degrade to a lesser answer, never to a wrong one).
  let plain: RefreshDisplay | null = null;
  return {
    observe(rows) {
      if (plain !== null) return plain.observe(rows);
      if (rows.length === 0) return;
      if (painted === 0 && rows.length > terminalHeight(stream) - 1) {
        plain = streamingDisplay(palette, stream);
        return plain.observe(rows);
      }
      if (painted === 0) {
        stream.write(HIDE_CURSOR);
        restore = () => stream.write(SHOW_CURSOR);
        // The cursor comes back even if the process leaves by another door.
        process.once('exit', restore);
      } else {
        stream.write(`${CSI}${painted}A`);
      }
      for (const row of rows) stream.write(`${CSI}2K${refreshLine(palette, row)}\n`);
      painted = rows.length;
    },
    settle() {
      if (restore === null) return;
      process.off('exit', restore);
      restore();
      restore = null;
    },
  };
}

/**
 * One row, human form — the same line whether it is a live frame or the final
 * report, so the settled block **is** the report and nothing is printed
 * twice. Verbs are right-aligned into one column so the names line up.
 */
export function refreshLine(palette: Palette, row: RefreshRow): string {
  // One row is one line, unconditionally: the live form counts lines to know
  // how far back to move the cursor, so a detail that smuggled in a newline
  // would leave it painting over the human's scrollback.
  const detail =
    row.detail === undefined ? '' : ` ${palette.dim(`(${row.detail.replaceAll('\n', ' ')})`)}`;
  return `  ${refreshVerb(palette, row.state)}  ${row.name}${detail}`;
}

const VERB_WIDTH = 'conflicted'.length;

function refreshVerb(palette: Palette, state: RefreshState): string {
  const pad = (word: string): string => word.padStart(VERB_WIDTH);
  switch (state) {
    case 'pending':
      return palette.dim(pad('pending'));
    case 'fetching':
      return palette.dim(pad('fetching'));
    case 'refreshed':
      return palette.green(pad('refreshed'));
    case 'current':
      return palette.dim(pad('current'));
    case 'dirty':
      return palette.yellow(pad('dirty'));
    case 'conflicted':
      return palette.yellow(pad('conflicted'));
    case 'failed':
      return palette.red(pad('failed'));
  }
}

function hasSettled(state: RefreshState): boolean {
  return state !== 'pending' && state !== 'fetching';
}

/**
 * How many lines the terminal holds. A TTY that reports no size at all — a
 * pty opened without one, which is what CI harnesses and `script` hand you —
 * reports `0`, and reading that as "zero lines tall" would send every run
 * down the degraded path. An unknown size falls back to the conventional 24
 * rather than to a number that is certainly wrong.
 */
function terminalHeight(stream: ProgressStream): number {
  const rows = stream.rows ?? 0;
  return rows > 0 ? rows : DEFAULT_TERMINAL_ROWS;
}

// Plain ANSI, no new dependency: three sequences carry the whole live form —
// move up N lines, erase a line, hide/show the cursor. ADR 0004 keeps the CLI
// layer thin and its color surface to picocolors; a spinner library would buy
// frames this design deliberately does not draw.
const CSI = '\u001B[';
const HIDE_CURSOR = `${CSI}?25l`;
const SHOW_CURSOR = `${CSI}?25h`;
const DEFAULT_TERMINAL_ROWS = 24;
