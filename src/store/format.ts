// The workspace format level (design/0066-workspace-format-guard/): what a
// workspace's record needs of the Ward that reads it, and the guard that
// refuses a Ward too old to read it.
//
// A workspace travels in git between machines, and each machine runs whatever
// `ward` it has. The record therefore says which reader it needs — one small
// integer, `format:` in workspace.md — and every Ward that carries this module
// compares it with the highest level it reads BEFORE parsing anything else. A
// level, not the package version: the version does not move with the record's
// shape, and what blocks is a schema mismatch, never a version difference
// (intent/01-concepts/06-workspace-lifecycle.md, Version skew).
//
// The marker is read on its own terms — a line match on the front matter,
// never through the workspace record's schema — because the schema is exactly
// what a newer Ward may have changed. This module is the one piece of record
// reading that has to keep working on a record it cannot otherwise read, so it
// depends on nothing but the file's framing.
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import pkg from '../../package.json' with { type: 'json' };
import { WardError } from '../errors.ts';

/**
 * One step of the format. A level is added — here, and nowhere else — by the
 * change that makes the record carry something a Ward one level back would
 * reject, misread, or act wrongly on.
 */
export interface FormatLevel {
  readonly level: number;
  /** The design entry that introduced it. */
  readonly entry: string;
  /** What the record may carry from this level on. */
  readonly introduces: string;
  /**
   * What happens to a Ward that reads only the levels below, in the words the
   * upgrade report prints when it raises a workspace to this level.
   */
  readonly older: string;
  /**
   * Recognizes a document only a Ward at this level can read: given a record
   * type's name and its validated data, true when the document carries the
   * shape this level introduced. The store refuses to write such a document
   * into a workspace still below the level (`requireFormatFor`), so the new
   * shape can never reach a main line ahead of the marker that guards it.
   * Absent when no document distinguishes the level.
   */
  readonly needs?: (type: string, data: unknown) => boolean;
}

/**
 * The format's history, oldest first. THE ONE PLACE A LEVEL IS RAISED: append
 * an entry. `ward workspace upgrade` then raises each workspace to it, older
 * Wards refuse a workspace that has been raised, and
 * test/store/format.test.ts re-pins the record shapes against the new level.
 *
 * Level 0 is every workspace written before the marker existed and has no
 * entry: it is the absence of one.
 */
export const FORMAT_LEVELS: readonly FormatLevel[] = [
  {
    level: 1,
    entry: '0066-workspace-format-guard',
    introduces:
      'the format marker itself, over the record as it stood at design 0065: the floor color ' +
      '`silver` and `checkout: external` on a repository record included',
    older:
      'a ward from before the guard (design 0066) does not read this marker and is NOT stopped ' +
      'by it — update ward on every machine that shares this workspace; from this level on, a ' +
      'ward that reads less than the workspace needs refuses before it reads anything',
  },
];

/** The highest level this Ward reads and writes. */
export const FORMAT_LEVEL: number = FORMAT_LEVELS.reduce(
  (highest, entry) => Math.max(highest, entry.level),
  0,
);

/** The file that carries the marker: the workspace record. */
const MARKER_FILE = 'workspace.md';

/** `format: <value>` on a line of its own, inside the front matter. */
const MARKER_LINE = /^format:[ \t]*(.*?)[ \t]*$/m;

/**
 * What the workspace at `root` says it needs.
 * - `level`: the recorded level — 0 when the record carries no marker, which
 *   is every workspace written before the marker existed, and 0 when there is
 *   no workspace record at all (a root being created, a global directory).
 * - `unreadable`: a marker is there and is not a level this Ward can
 *   interpret. Read as "newer than this Ward", never as absent: a marker that
 *   changed its spelling is the newest thing a workspace can carry.
 */
export type RecordedFormat =
  | { readonly state: 'level'; readonly level: number }
  | { readonly state: 'unreadable'; readonly raw: string };

export function readFormat(root: string): RecordedFormat {
  let text: string;
  try {
    text = readFileSync(join(root, MARKER_FILE), 'utf8');
  } catch {
    return { state: 'level', level: 0 };
  }
  return formatOf(text);
}

/** The marker in a workspace record's text. Exported for the tests' table. */
export function formatOf(text: string): RecordedFormat {
  // Only the front matter is asked: the body is prose, and prose may say
  // "format: 3" about anything. A record with no closing fence is not a
  // record this function can bound, so the whole text is the front matter.
  const opening = /^---\n/.exec(text);
  const rest = opening === null ? text : text.slice(opening[0].length);
  const closing = /^---[ \t]*$/m.exec(rest);
  const frontMatter = closing === null ? rest : rest.slice(0, closing.index);
  const match = MARKER_LINE.exec(frontMatter);
  if (match === null) return { state: 'level', level: 0 };
  const raw = match[1] ?? '';
  if (/^\d{1,9}$/.test(raw)) return { state: 'level', level: Number(raw) };
  return { state: 'unreadable', raw };
}

/** The guard's answer for one workspace. */
export type FormatVerdict =
  | { readonly readable: true; readonly level: number }
  | { readonly readable: false; readonly message: string; readonly recorded: RecordedFormat };

/**
 * Whether this Ward may read the workspace at `root`. Asked on every document
 * read, so the answer is remembered per root for as long as the record file
 * is the same file (its inode, size and modification time — every store write
 * is a rename, so a rewritten record is a new inode).
 */
export function checkFormat(root: string): FormatVerdict {
  let key: string;
  try {
    const stat = statSync(join(root, MARKER_FILE));
    key = `${stat.ino}:${stat.size}:${stat.mtimeMs}`;
  } catch {
    return { readable: true, level: 0 };
  }
  const known = verdicts.get(root);
  if (known !== undefined && known.key === key) return known.verdict;
  const verdict = judge(root, readFormat(root));
  verdicts.set(root, { key, verdict });
  return verdict;
}

const verdicts = new Map<string, { key: string; verdict: FormatVerdict }>();

function judge(root: string, recorded: RecordedFormat): FormatVerdict {
  if (recorded.state === 'level' && recorded.level <= FORMAT_LEVEL) {
    return { readable: true, level: recorded.level };
  }
  return { readable: false, message: tooNewMessage(root, recorded), recorded };
}

/**
 * The refusal, whole: what the workspace needs, what this binary is, and the
 * remedy. One sentence shape for every verb, so it is recognizable wherever
 * it appears — a verb's stderr, doctor's finding.
 */
export function tooNewMessage(root: string, recorded: RecordedFormat): string {
  const needs =
    recorded.state === 'level'
      ? `needs a ward that reads workspace format ${recorded.level}`
      : `carries a format marker this ward cannot interpret (format: ${recorded.raw})`;
  return (
    `this ward is too old for the workspace at ${root} — the workspace ${needs}, and this ` +
    `ward (${pkg.version}) reads up to format ${FORMAT_LEVEL}. No record was read or written. ` +
    'Update ward on this machine, then run the command again; until then only ' +
    'ward doctor, ward --version and ward --help answer here.'
  );
}

/** The refusal as an error — a WardError, so the CLI prints it and exits 1. */
export class WorkspaceTooNewError extends WardError {}

/**
 * Refuse a workspace this Ward is too old to read. Called by the CLI before a
 * verb touches the record, and by the document layer on every read and write
 * — the second is what makes the guard hold on a path into the store nobody
 * remembered to gate.
 */
export function requireReadableFormat(root: string): void {
  const verdict = checkFormat(root);
  if (!verdict.readable) throw new WorkspaceTooNewError(verdict.message);
}

/** Whether this Ward may read the workspace at `root` — the guard as a question. */
export function formatReadable(root: string): boolean {
  return checkFormat(root).readable;
}

/**
 * The level a document needs: the highest level whose `needs` recognizes it,
 * or 0 when none does. Pure, and given the table so a test can ask it about a
 * level that does not exist yet.
 */
export function levelNeededBy(
  type: string,
  data: unknown,
  levels: readonly FormatLevel[] = FORMAT_LEVELS,
): number {
  return levels.reduce(
    (highest, entry) =>
      entry.level > highest && entry.needs?.(type, data) === true ? entry.level : highest,
    0,
  );
}

/**
 * Refuse to write a document into a workspace below the level the document
 * needs — the newer-Ward-on-an-older-workspace half of the guard. Everything
 * else a newer Ward does there proceeds; only the one shape the workspace's
 * level does not describe waits for the upgrade that raises it
 * (intent/01-concepts/06-workspace-lifecycle.md, Version skew).
 */
export function requireFormatFor(
  root: string,
  type: string,
  data: unknown,
  levels: readonly FormatLevel[] = FORMAT_LEVELS,
): void {
  const needed = levelNeededBy(type, data, levels);
  if (needed === 0) return;
  const recorded = readFormat(root);
  const level = recorded.state === 'level' ? recorded.level : Number.POSITIVE_INFINITY;
  if (level >= needed) return;
  const entry = levels.find((candidate) => candidate.level === needed);
  throw new WardError(
    `this ${type} record needs workspace format ${needed}` +
      (entry === undefined ? '' : ` (${entry.introduces})`) +
      `, and the workspace at ${root} is at format ${level} — raise it first, with: ` +
      'ward workspace upgrade',
  );
}

/** The levels a raise from `from` to `to` crosses, lowest first — what the upgrade reports. */
export function levelsCrossed(
  from: number,
  to: number,
  levels: readonly FormatLevel[] = FORMAT_LEVELS,
): readonly FormatLevel[] {
  return levels
    .filter((entry) => entry.level > from && entry.level <= to)
    .sort((a, b) => a.level - b.level);
}
