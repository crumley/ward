// What a human reads on a hosted session (design/0061-host-names-and-titles/):
// the name of a floor's host, the name of a session's window, and the title a
// terminal looking at either is given. Every one of them is built here, by
// pure functions of facts the records already hold — a floor's number and
// slug, a task's room and slug, a session's scope — so the same session reads
// the same wherever it is named, and nothing a human reads is a session id.
//
// Names are PRESENTATION. A host is found by its stamps and a window by its
// tags (design/0031-detached-session-hosting/); nothing reads a name back, so
// changing what this module returns renames live hosts and windows in place
// and breaks no binding.
import type { FloorColor } from '../theme/palette.ts';

/**
 * What names a floor. `emoji` is the floor's own mark where its record
 * carries one: every label that names a floor takes it from here, so a floor's
 * identity is added to the names in this one place. `color` is the other half
 * of that identity (design/0060-floor-identity/): no name spells it, and the
 * floor's host wears it.
 */
export interface FloorIdentity {
  readonly number: number;
  /** The floor's slug — empty when no project record names the floor. */
  readonly slug: string;
  readonly emoji?: string;
  readonly color?: FloorColor;
}

/** What a session is, as far as its name is concerned. */
export type Subject =
  /** A workspace-scope session no other session started. */
  | { readonly kind: 'coordinator' }
  /** A workspace-scope session another session started; `purpose` only when one was given. */
  | { readonly kind: 'helper'; readonly purpose?: string }
  | { readonly kind: 'floor'; readonly floor: FloorIdentity }
  /** `floor` is absent on a legacy bare task, which stands on no floor. */
  | {
      readonly kind: 'task';
      readonly floor?: FloorIdentity;
      readonly room: number;
      readonly slug: string;
    };

/** The longest a slug or a purpose runs inside a name before it is cut. */
export const NAME_CAP = 24;

/** What the coordinator's window is called: the one window in every floor host. */
export const COORDINATOR = 'coord';

/**
 * A slug short enough to sit in a name: whole hyphen-separated words while
 * they fit in `cap`, so a cut never lands mid-word (a first word longer than
 * the cap is cut hard — there is no word boundary to keep).
 */
export function shortSlug(slug: string, cap: number = NAME_CAP): string {
  if (slug.length <= cap) return slug;
  const words = slug.split('-');
  let kept = words[0] ?? '';
  for (const word of words.slice(1)) {
    if (kept.length + 1 + word.length > cap) break;
    kept = `${kept}-${word}`;
  }
  return kept.slice(0, cap);
}

/** Free text short enough to sit in a name, on one line, cut with an ellipsis. */
export function shortText(text: string, cap: number = NAME_CAP): string {
  const line = oneLine(text);
  return line.length <= cap ? line : `${line.slice(0, cap - 1).trimEnd()}…`;
}

/**
 * The name a floor's host is given: `<workspace>-f<N>-<slug>` — the workspace
 * (a host's name is unique across every workspace on the machine), the
 * floor's number (what `--floor N` takes), and its slug (what the number
 * means). No emoji: this is the one name a human types, in `tmux attach -t`.
 */
export function hostName(workspace: string, floor: FloorIdentity): string {
  const slug = shortSlug(floor.slug);
  return `${workspace}-f${floor.number}${slug === '' ? '' : `-${slug}`}`;
}

/**
 * Where a terminal is standing, for its title: `<workspace> f<N>`. The
 * window's own name, which comes before it, says the rest; the floor's emoji
 * is not here but at the head of the whole title
 * (design/0064-floor-identity-palette/), where the host puts it from the
 * identity it wears.
 */
export function hostTitle(workspace: string, floor: FloorIdentity): string {
  return oneLine(`${workspace} f${floor.number}`);
}

/**
 * The name a session's window is given in the host of floor `hostFloor`.
 * A window on its own floor's host does not repeat the floor — the host
 * already names it — so a floor's session is its slug and a task is
 * `t<room> <slug>`; a window placed on ANOTHER floor's host (a session a
 * floor-3 coordinator started for floor 5) says which floor it is for.
 */
export function windowLabel(subject: Subject, hostFloor: number): string {
  switch (subject.kind) {
    case 'coordinator':
      return COORDINATOR;
    case 'helper':
      return subject.purpose === undefined || oneLine(subject.purpose) === ''
        ? 'helper'
        : shortText(subject.purpose);
    case 'floor': {
      const { floor } = subject;
      const slug = shortSlug(floor.slug);
      if (floor.number === hostFloor && slug !== '') return slug;
      return oneLine(`${floorMark(floor)} ${slug}`);
    }
    case 'task': {
      const { floor } = subject;
      const slug = shortSlug(subject.slug);
      if (floor === undefined) return `legacy-t${subject.room} ${slug}`;
      const address =
        floor.number === hostFloor ? `t${subject.room}` : `${floorMark(floor)}t${subject.room}`;
      return `${address} ${slug}`;
    }
  }
}

/**
 * The title of a terminal running a session in the FOREGROUND, where there is
 * no host to say where it stands: the floor's emoji first, as in a hosted
 * title (design/0064-floor-identity-palette/), then the session's name with
 * its floor spelled out (`f7 ward-development`), then the workspace. A
 * session with no floor, or a floor with no emoji, has no lead and no gap.
 */
export function foregroundTitle(subject: Subject, workspace: string): string {
  const [emoji, plain] = unmarked(subject);
  const lead = emoji === undefined || emoji === '' ? '' : `${emoji} `;
  return `${lead}${windowLabel(plain, NO_HOST)} · ${workspace}`;
}

/** A subject's floor emoji, and the subject with it taken off its floor. */
function unmarked(subject: Subject): [string | undefined, Subject] {
  if (subject.kind !== 'floor' && subject.kind !== 'task') return [undefined, subject];
  if (subject.floor === undefined) return [undefined, subject];
  const { emoji, ...floor } = subject.floor;
  return [emoji, { ...subject, floor }];
}

/** A host floor no floor has: every label names its floor. */
const NO_HOST = -1;

/** One window's label before it is told apart from its neighbours. */
export interface Labelled {
  readonly label: string;
  /** The floor whose host the window stands in. */
  readonly host: number;
  /** The session's ordinal — the number in its id. */
  readonly ordinal: number | undefined;
}

/**
 * Tell apart windows that would read the same in one host: each takes its
 * session's ordinal (`coord 16`, `coord 17`). A label nothing shares is left
 * exactly as it is, so the common case — one coordinator, one session per
 * floor and per task — carries no number at all. Answers in the order given.
 */
export function distinguish(entries: readonly Labelled[]): string[] {
  const count = new Map<string, number>();
  const key = (entry: Labelled) => `${entry.host}\u0000${entry.label}`;
  for (const entry of entries) count.set(key(entry), (count.get(key(entry)) ?? 0) + 1);
  return entries.map((entry) =>
    (count.get(key(entry)) ?? 0) > 1 && entry.ordinal !== undefined
      ? `${entry.label} ${entry.ordinal}`
      : entry.label,
  );
}

function floorMark(floor: FloorIdentity): string {
  return `${floor.emoji === undefined ? '' : floor.emoji}f${floor.number}`;
}

/** One line of printable text: control characters and runs of space become one space. */
export function oneLine(text: string): string {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: control characters are what is removed.
  return text.replace(/[\u0000-\u001f\u007f\s]+/g, ' ').trim();
}
