// Adoption: the human takes a shorthand as a file they own
// (design/0027-shell-adoption/).
//
// `ward shell init fish` emits one always-fresh layer the human redirects.
// This is the other style, and it exists because "always fresh" and "mine"
// are different things to want. Here the human names a shorthand, ward writes
// its REAL definition — the same fish the layer holds, not a trampoline that
// calls back into ward — into `functions/<name>.fish` and
// `completions/<name>.fish`, and from that moment the file is theirs: to
// track in a dotfiles repo, to edit, to keep. Ward never rewrites it unless
// asked again by name.
//
// What that buys is the point: because the bytes are a snapshot of a specific
// ward's definition, "wrr has changed" is a visible, diffable, per-alias
// event. Doctor reports it; `ward shell diff fish wrr` shows it; re-adopting
// takes it. The choice stays with the human — ignore it, see it, or take it —
// and only this module ever writes (§18).
//
// One assembly of the units in `shorthands.ts`; `fish.ts` is the other.
// Nothing here defines a line of fish.
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { WardError } from '../errors.ts';
import { reasonOf } from '../global/store.ts';
import { unifiedDiff } from './diff.ts';
import { fishConfigDir } from './installed.ts';
import {
  FISH_SHORTHAND_NAMES,
  FISH_SHORTHANDS,
  helpersFor,
  type ShellHelper,
  type Shorthand,
} from './shorthands.ts';

/**
 * The opening bytes of every file adoption writes. Classification is derived
 * from the file's own contents and nothing else (§17) — no manifest, no
 * stamp, nothing two writers could disagree about — so a file that carries
 * this was written by ward and a file that does not is the human's own. It is
 * deliberately distinct from `FISH_LAYER_MARKER`: the two styles produce
 * different files in different places, and a `conf.d` layer must never be
 * mistaken for an adopted function.
 */
export const FISH_ADOPTED_MARKER = '# ward — adopted fish';

/** The shells adoption can write. One today, for the reason `shell init` has one. */
export const ADOPTION_SHELLS: readonly string[] = ['fish'];

/** What a written file is, which is also which directory it belongs in. */
export type FileRole = 'function' | 'completion' | 'helper';

/** One file's standing, derived from its bytes. */
export type FileState = 'absent' | 'current' | 'changed' | 'yours' | 'unreadable';

/**
 * One shorthand's standing — the selection surface's four words, plus the
 * honest fifth for a file that would not read.
 *
 * `available` is decided by the shorthand's own function file alone: helpers
 * are shared, so a `__ward_choose.fish` that some other adoption left behind
 * must never make an un-adopted `wwcd` look installed.
 */
export type ShorthandStatus = 'available' | 'current' | 'changed' | 'yours' | 'unreadable';

/** What a write did — `unchanged` is what makes re-adopting a visible no-op (§6). */
export type FileOutcome = 'written' | 'unchanged' | 'kept' | 'replaced';

/** What ward would write for one file of one shorthand. */
export interface AdoptedFile {
  /** Relative to the fish configuration root, so the file is location-independent. */
  readonly relativePath: string;
  readonly path: string;
  readonly role: FileRole;
  readonly contents: string;
}

export interface InspectedFile extends AdoptedFile {
  readonly state: FileState;
  /** What is on disk — present when the file exists and could be read. */
  readonly installed?: string;
  /** Why it could not be read (`unreadable` only). */
  readonly reason?: string;
}

export interface ShorthandInspection {
  readonly name: string;
  readonly summary: string;
  readonly status: ShorthandStatus;
  readonly files: readonly InspectedFile[];
}

export interface AdoptedFileReport {
  readonly relativePath: string;
  readonly outcome: FileOutcome;
}

export interface AdoptedShorthandReport {
  readonly name: string;
  readonly summary: string;
  /** The standing AFTER the run, so a re-adopt reports `current` and a kept file reports `yours`. */
  readonly status: ShorthandStatus;
  readonly files: readonly AdoptedFileReport[];
}

export interface AdoptionReport {
  readonly shell: string;
  /** The fish configuration root written into — the live one, or `--dir`'s. */
  readonly dir: string;
  /** True when the run only listed the offering; nothing was written. */
  readonly offeredOnly: boolean;
  readonly shorthands: readonly AdoptedShorthandReport[];
}

/**
 * Where adoption writes: `--dir`'s path, or the live fish configuration.
 *
 * `--dir` names a fish configuration ROOT, not a flat dump — the files land
 * in `<dir>/functions/` and `<dir>/completions/` exactly as they would live
 * under `~/.config/fish`. That is what a stow package or a dotfiles repo
 * wants: the same tree, somewhere else, symlinked or copied into place later.
 * It is also why nothing ward writes may name its own location.
 */
export function adoptionDir(dir: string | undefined, env = process.env): string {
  return dir ?? fishConfigDir(env);
}

/** The shell name, checked — an unbuilt shell is refused the way `shell init` refuses one. */
export function requireAdoptionShell(shell: string): void {
  if (ADOPTION_SHELLS.includes(shell)) return;
  throw new WardError(
    `no shell adoption for '${shell}' — available: ${ADOPTION_SHELLS.join(', ')} ` +
      '(the other shells are unbuilt, not unsupported)',
  );
}

/**
 * Every file adopting `shorthand` writes, in write order: the function, its
 * completion, then the helpers it leans on.
 *
 * Each helper is its own autoloaded function file rather than a shared blob,
 * because that is what fish itself does — `functions/<name>.fish` is loaded
 * the first time `<name>` is called, and a file holding several functions
 * under some other name would never be autoloaded at all. It also keeps the
 * per-alias granularity honest in both directions: `wrr` needs no picker, so
 * adopting it writes exactly two files, and a helper two shorthands share is
 * one file on disk however many of them are adopted.
 */
export function adoptedFiles(shorthand: Shorthand, dir: string): readonly AdoptedFile[] {
  const files: AdoptedFile[] = [
    file(dir, 'function', join('functions', `${shorthand.name}.fish`), functionFile(shorthand)),
    file(
      dir,
      'completion',
      join('completions', `${shorthand.name}.fish`),
      completionFile(shorthand),
    ),
  ];
  for (const helper of helpersFor(shorthand)) {
    files.push(file(dir, 'helper', join('functions', `${helper.name}.fish`), helperFile(helper)));
  }
  return files;
}

/** Read one shorthand's files and fold them into its standing. */
export async function inspectShorthand(
  shorthand: Shorthand,
  dir: string,
): Promise<ShorthandInspection> {
  const files = await Promise.all(adoptedFiles(shorthand, dir).map(inspectFile));
  return { name: shorthand.name, summary: shorthand.summary, status: fold(files), files };
}

/** The whole offering — every shorthand ward has, with its standing in `dir`. */
export async function inspectAdoption(dir: string): Promise<readonly ShorthandInspection[]> {
  return await Promise.all(FISH_SHORTHANDS.map((shorthand) => inspectShorthand(shorthand, dir)));
}

/**
 * Write the named shorthands, and report what each file's write did.
 *
 * Convergent (§6): a file already holding these bytes is not rewritten at
 * all, so re-adopting costs no mtime in a tracked dotfiles repo and reports
 * `unchanged`. A file ward did not write is never overwritten without
 * `--force` — it is `kept`, and the report says so rather than pretending the
 * adoption completed (§20).
 */
export async function adoptShorthands(
  names: readonly string[],
  dir: string,
  options: { readonly force?: boolean } = {},
): Promise<readonly AdoptedShorthandReport[]> {
  const reports: AdoptedShorthandReport[] = [];
  for (const name of names) {
    const shorthand = requireShorthand(name);
    const before = await inspectShorthand(shorthand, dir);
    const files: AdoptedFileReport[] = [];
    for (const seen of before.files) {
      files.push({ relativePath: seen.relativePath, outcome: await write(seen, options.force) });
    }
    const after = await inspectShorthand(shorthand, dir);
    reports.push({ name, summary: shorthand.summary, status: after.status, files });
  }
  return reports;
}

/**
 * The unified diff of one shorthand's files: what is installed against what
 * this ward would write, file by file, `-` being the human's copy.
 *
 * A file ward did not write is skipped rather than diffed. Ward has no claim
 * on it, so showing it against ward's own definition would frame somebody's
 * arrangement as a deviation from ours — the posture 0026 chose for the same
 * situation, and the reason `yours` is not a warning anywhere.
 */
export function diffShorthand(inspection: ShorthandInspection): string {
  return inspection.files
    .filter((seen) => seen.state === 'changed')
    .map((seen) =>
      unifiedDiff(seen.installed ?? '', seen.contents, {
        from: `${seen.relativePath} (adopted)`,
        to: `${seen.relativePath} (this ward)`,
      }),
    )
    .join('');
}

/** True when this machine keeps a fish configuration at all — doctor's silence gate (0026). */
export function fishConfigured(env = process.env): boolean {
  return existsSync(fishConfigDir(env));
}

// -- the files themselves ---------------------------------------------------

/**
 * The header every adopted file opens with. It carries the marker, says whose
 * the file now is, and names the two commands that make drift a choice rather
 * than a surprise — so the file explains its own lifecycle to whoever opens
 * it in a dotfiles repo six months from now.
 *
 * It names no path. `--dir` writes the same bytes into a stow package that
 * `~/.config/fish` gets, and a header that said where it was written would be
 * wrong the moment the file was symlinked into place.
 */
function header(what: string, name: string): string {
  return `${FISH_ADOPTED_MARKER} ${what}.
#
# Yours now: \`ward shell adopt fish ${name}\` wrote it, and nothing in ward
# rewrites it unless you ask for ${name} again by name. Track it, edit it,
# keep it. When ward's own definition moves on, \`ward doctor\` says so —
# \`ward shell diff fish ${name}\` shows what changed, and re-running the
# adopt command takes ward's version.`;
}

function functionFile(shorthand: Shorthand): string {
  return `${header(`shorthand \`${shorthand.name}\` — ${shorthand.summary}`, shorthand.name)}

${shorthand.body}
`;
}

function completionFile(shorthand: Shorthand): string {
  return `${header(`completion for \`${shorthand.name}\``, shorthand.name)}

${shorthand.completion}
`;
}

/**
 * A helper file names the shorthands that need it rather than a single
 * adopt command, because it is not adopted on its own: it arrives with, and
 * is refreshed by, whichever of them the human asked for.
 */
function helperFile(helper: ShellHelper): string {
  const users = FISH_SHORTHANDS.filter((shorthand) =>
    helpersFor(shorthand).some((needed) => needed.name === helper.name),
  ).map((shorthand) => shorthand.name);
  return `${FISH_ADOPTED_MARKER} helper \`${helper.name}\` — ${helper.summary}.
#
# Shared plumbing, not a shorthand of its own: it is written and refreshed
# alongside whichever of ward's shorthands need it (${users.join(', ')}).
# Yours to keep and to edit, like they are — \`ward doctor\` tells you when
# ward's own version has moved on, and re-adopting any of them takes it.

${helper.body}
`;
}

// -- reading and writing ----------------------------------------------------

function file(dir: string, role: FileRole, relativePath: string, contents: string): AdoptedFile {
  return { relativePath, path: join(dir, relativePath), role, contents };
}

function requireShorthand(name: string): Shorthand {
  const found = FISH_SHORTHANDS.find((shorthand) => shorthand.name === name);
  if (found === undefined) {
    throw new WardError(
      `ward offers no fish shorthand named '${name}' — it offers: ${FISH_SHORTHAND_NAMES.join(', ')}`,
    );
  }
  return found;
}

/**
 * Byte comparison, never a text one — 0026's rule and its reason: a file that
 * differs only in its encoding differs, and saying otherwise would be a
 * guess. The decoded text is kept alongside for the diff, which needs lines.
 */
async function inspectFile(wanted: AdoptedFile): Promise<InspectedFile> {
  let installed: Buffer;
  try {
    installed = await readFile(wanted.path);
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return { ...wanted, state: 'absent' };
    }
    return { ...wanted, state: 'unreadable', reason: reasonOf(error) };
  }
  if (installed.equals(Buffer.from(wanted.contents, 'utf8'))) {
    return { ...wanted, state: 'current', installed: wanted.contents };
  }
  const text = installed.toString('utf8');
  return {
    ...wanted,
    state: installed.includes(FISH_ADOPTED_MARKER) ? 'changed' : 'yours',
    installed: text,
  };
}

async function write(seen: InspectedFile, force: boolean | undefined): Promise<FileOutcome> {
  if (seen.state === 'current') return 'unchanged';
  if ((seen.state === 'yours' || seen.state === 'unreadable') && force !== true) return 'kept';
  await mkdir(dirname(seen.path), { recursive: true });
  await writeFile(seen.path, seen.contents, 'utf8');
  return seen.state === 'absent' || seen.state === 'changed' ? 'written' : 'replaced';
}

/**
 * One shorthand's standing from its files'.
 *
 * The function file decides two of the five outright: absent means the human
 * has not adopted this name (whatever shared helpers happen to sit beside
 * it), and a function file without ward's marker means the name is already
 * theirs — ward reports it and stops. Otherwise the shorthand is as current
 * as its least current file, because an adopted `wrcd` whose
 * `__ward_choose.fish` has drifted is a `wrcd` that no longer behaves the way
 * this ward describes it.
 */
function fold(files: readonly InspectedFile[]): ShorthandStatus {
  const own = files[0];
  if (own === undefined || own.state === 'absent') return 'available';
  if (own.state === 'yours') return 'yours';
  if (own.state === 'unreadable') return 'unreadable';
  if (files.some((seen) => seen.state === 'unreadable')) return 'unreadable';
  return files.every((seen) => seen.state === 'current') ? 'current' : 'changed';
}
