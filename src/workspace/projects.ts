// Projects — floors (design/0004-work-spine/): opened with a never-reused
// floor number, the next one or one the opener chose that was never spent
// (design/0077-floor-chosen-number/); status above the leaves is derived,
// never stored (intent/01-concepts/00-domain-model.md).
import { existsSync } from 'node:fs';
import { appendFile } from 'node:fs/promises';
import { join } from 'node:path';
import { WardError } from '../errors.ts';
import { readDocument, writeDocument } from '../store/document.ts';
import { withStoreLock } from '../store/lock.ts';
import { type ProjectRecord, projectRecordType } from '../store/types.ts';
import { identityAtOpen, requireAsked } from './floor-identity.ts';
import {
  carriesManifest,
  establishFloorManifest,
  floorManifestPaths,
  isoDate,
  seedNotes,
} from './floor-manifest.ts';
import { establishFloorView } from './floor-views.ts';
import { commitRecords, dirFloor, projectDirs, requireSlug } from './scan.ts';

export interface OpenProjectOptions {
  /**
   * Repositories the new floor claims (design/0037-repo-floor-affinity/) — a
   * routing default recorded at open, so the first task against a repository
   * can already be placed by it. Validated by the caller.
   */
  readonly repositories?: readonly string[];
  /**
   * The identity the opener names (design/0064-floor-identity-palette/): an
   * emoji that fits what the floor is about, a palette color. Either left
   * out is Ward's to pick.
   */
  readonly color?: string;
  readonly emoji?: string;
  /**
   * The floor number the opener chose (design/0077-floor-chosen-number/),
   * already read by `requireFloorChoice`. Checked against every number ever
   * spent under the same lock as the allocation; left out, the floor takes
   * the next number.
   */
  readonly floor?: number;
}

export async function openProject(
  root: string,
  slugInput: string,
  options: OpenProjectOptions = {},
): Promise<ProjectRecord> {
  const slug = requireSlug(slugInput);
  const asked = requireAsked({
    ...(options.color === undefined ? {} : { color: options.color }),
    ...(options.emoji === undefined ? {} : { emoji: options.emoji }),
  });
  // Allocation through commit is the serialized critical section (§17): the
  // floor scan must not race another writer's, and the commit must not race
  // another commit (design/0013-telemetry-and-serialized-writes/).
  return withStoreLock(root, `project open ${slug}`, async () => {
    // This record never carries the standing marker — creation is the only
    // writer of `standing: true`, so `project open` cannot mint a second
    // standing project, whatever slug it is given
    // (design/0018-standing-workspace-project/).
    // Its identity is picked with its number, under the same lock
    // (design/0060-floor-identity/, design/0064-floor-identity-palette/):
    // what the opener named, the rest clear of what the open floors wear —
    // and refused before anything is written.
    // A chosen number is checked first, against the same scan the allocator
    // reads (design/0077-floor-chosen-number/): it is refused while anything
    // in the record has spent it, a directory whose record will not read
    // included.
    const spent = await spentFloors(root);
    const floor =
      options.floor === undefined ? nextFrom(spent) : requireUnspent(options.floor, spent);
    const identity = identityAtOpen(await readProjects(root), asked);
    const dir = `projects/${floor}-${slug}`;
    const claims = [...(options.repositories ?? [])].sort();
    const record: ProjectRecord = {
      type: 'project',
      floor,
      slug,
      ...(claims.length === 0 ? {} : { repositories: claims }),
      state: 'active',
      openedAt: new Date().toISOString(),
      ...identity,
    };
    await writeDocument(root, projectRecordType(dir), {
      data: record,
      body:
        `Floor ${floor}: the \`${slug}\` project. Its tasks live in \`tasks/\` beside this ` +
        'record, and its status is derived from theirs, never stored here.' +
        (claims.length === 0
          ? ''
          : ` It claims ${claims.join(', ')}: a routing default for tasks opened against those ` +
            'repositories, never a restriction on what its tasks may touch.'),
    });
    // The floor's manifest is written with its record, in the same commit
    // (design/0055-floor-manifests/): a floor is never observable without
    // the guidance a session on it loads.
    await establishFloorManifest(root, { dir, record });
    commitRecords(root, `Open project ${slug} (floor ${floor})`, dir);
    // Its view too (design/0057-context-from-root/): links onto the files
    // just committed, under the ignored `floors/` — so the floor's working
    // place exists the moment the floor does, and journals nothing.
    await establishFloorView(root, { dir, record });
    return record;
  });
}

/**
 * The next ORDINARY floor number: monotonic over every project ever opened —
 * closed floors are retired, never reused, because they root historical room
 * addresses (intent/01-concepts/00-domain-model.md, Identity). Callers hold
 * the store lock; the scan must not race another writer's.
 *
 * The ground floor is not in the sequence (design/0041-ground-floor/): 0 is
 * reserved, so an empty set of ordinary floors still yields 1 and a workspace
 * whose only project is the standing one opens its first ordinary floor at 1,
 * exactly as a workspace with no projects at all does. The floor a relocated
 * standing project vacated is still counted, from `previousFloor` on its
 * record — the directory that used to hold that number is gone, and a number
 * that came back would make every address recorded under it ambiguous.
 */
export async function nextFloor(root: string): Promise<number> {
  return nextFrom(await spentFloors(root));
}

/**
 * One past the highest ordinary number ever spent (design/0077-floor-chosen-number/):
 * a chosen number counts like any other, so a floor opened at 40 makes the
 * next unchosen one 41, never a gap below it that a reader could mistake for
 * a number never used.
 */
function nextFrom(spent: SpentFloors): number {
  const ordinary = [...spent.keys()].filter((floor) => floor !== GROUND_FLOOR);
  return ordinary.length === 0 ? 1 : Math.max(...ordinary) + 1;
}

/**
 * The highest number a floor may be opened at by choice. Three digits keeps a
 * task's address at seven characters at most (`f999t99`), the same
 * sayable-and-typable bound the room ceiling serves (`ROOMS_PER_FLOOR`) — and
 * because a chosen number moves the next one Ward picks past it, a slip of
 * the keyboard (`--floor 1200` for `120`) would otherwise be paid by every
 * floor opened afterwards. A workspace's lifetime floor count is dozens; 999
 * is room for any numbering convention a human adopts and none a typo makes.
 */
export const CHOSEN_FLOOR_CEILING = 999;

/**
 * Read what was typed after `--floor`: a whole number from 1 to the ceiling.
 * Everything a choice can be refused for without the record — the ground
 * floor's number, a number above the ceiling, anything that is not a whole
 * number — is refused here, before the lock; what the record has spent is
 * `requireUnspent`'s, under it.
 */
export function requireFloorChoice(input: string): number {
  const text = input.trim();
  if (!/^\d+$/.test(text)) {
    throw new WardError(
      `--floor takes a whole number from 1 to ${CHOSEN_FLOOR_CEILING} — '${input}' is not one; ` +
        'leave --floor out and the floor takes the next number',
    );
  }
  const floor = Number.parseInt(text, 10);
  if (floor === GROUND_FLOOR) {
    throw new WardError(
      `floor ${GROUND_FLOOR} is the ground floor's, reserved in every workspace — choose 1 or ` +
        'above, or leave --floor out and the floor takes the next number',
    );
  }
  if (floor > CHOSEN_FLOOR_CEILING) {
    throw new WardError(
      `floor ${floor} is above ${CHOSEN_FLOOR_CEILING}, the highest floor opened by choice — a ` +
        'chosen number moves every later floor past it; choose one from 1 to ' +
        `${CHOSEN_FLOOR_CEILING}, or leave --floor out and the floor takes the next number`,
    );
  }
  return floor;
}

/**
 * What spent a floor number (design/0077-floor-chosen-number/):
 * - `held` — a floor's record stands on it, open or closed;
 * - `retired` — a floor's record names it as `previousFloor`, the number the
 *   standing project vacated when it moved to the ground floor (0041);
 * - `directory` — a `projects/<N>-*` directory whose record does not read, or
 *   whose record names another floor: the directory still roots addresses.
 */
export type FloorSpender =
  | { readonly kind: 'held'; readonly dir: string; readonly slug: string }
  | {
      readonly kind: 'retired';
      readonly dir: string;
      readonly slug: string;
      readonly floor: number;
    }
  | { readonly kind: 'directory'; readonly dir: string };

export type SpentFloors = ReadonlyMap<number, readonly FloorSpender[]>;

/**
 * Every floor number the record has ever spent, with what spent it. Read
 * tolerantly, one directory at a time: a record that will not read still
 * spends the number its directory leads with, since that directory is what
 * every task address under it composes with. The allocator and the choice
 * both read this one scan, so the number Ward picks and the numbers it
 * refuses can never disagree. Callers hold the store lock.
 */
export async function spentFloors(root: string): Promise<SpentFloors> {
  const spent = new Map<number, FloorSpender[]>();
  const spend = (floor: number, by: FloorSpender) =>
    spent.set(floor, [...(spent.get(floor) ?? []), by]);
  for (const dir of projectDirs(root)) {
    const fromDir = dirFloor(dir);
    let record: ProjectRecord | undefined;
    try {
      record = (await readDocument(root, projectRecordType(dir))).data;
    } catch {
      record = undefined;
    }
    if (record !== undefined) {
      spend(record.floor, { kind: 'held', dir, slug: record.slug });
      if (record.previousFloor !== undefined) {
        spend(record.previousFloor, {
          kind: 'retired',
          dir,
          slug: record.slug,
          floor: record.floor,
        });
      }
    }
    if (fromDir !== undefined && fromDir !== record?.floor) {
      spend(fromDir, { kind: 'directory', dir });
    }
  }
  return spent;
}

/**
 * A chosen number, or the refusal that names what spent it and what to do
 * instead: a number is never reused, so the remedy is always another number
 * or none — and the refusal says which one leaving `--floor` out would take.
 */
function requireUnspent(floor: number, spent: SpentFloors): number {
  const by = spent.get(floor)?.[0];
  if (by === undefined) return floor;
  const instead =
    'a floor number is never reused; choose one never spent, or leave --floor out and the ' +
    `floor takes the next (${nextFrom(spent)})`;
  switch (by.kind) {
    case 'held':
      throw new WardError(`floor ${floor} is held by ${by.slug} (${by.dir}) — ${instead}`);
    case 'retired':
      throw new WardError(
        `floor ${floor} was retired by ${by.slug} (${by.dir}), which stood on floor ${floor} ` +
          `before it moved to floor ${by.floor} — ${instead}`,
      );
    case 'directory':
      throw new WardError(
        `floor ${floor} is spent by ${by.dir}, whose record does not read as floor ${floor} ` +
          `(see: ward doctor) — ${instead}`,
      );
  }
}

/** The slug creation gives the standing workspace project. */
export const STANDING_PROJECT_SLUG = 'workspace';

/**
 * The ground floor (design/0041-ground-floor/): the standing workspace
 * project's floor, the same number in every workspace. A RESERVED number
 * rather than an allocated one, which is what makes it referable — Ward's own
 * defaults, and a brief written once and read in any workspace, can name
 * `projects/0-workspace/` and be right everywhere.
 */
export const GROUND_FLOOR = 0;

/** The directory the ground floor always occupies. */
export const GROUND_FLOOR_DIR = `projects/${GROUND_FLOOR}-${STANDING_PROJECT_SLUG}`;

export interface FoundProject {
  readonly dir: string;
  readonly record: ProjectRecord;
}

/**
 * The standing workspace project, resolved by its marker — never by slug: a
 * human may open an ordinary project named anything, and only the record
 * creation marked is the workspace's own
 * (design/0018-standing-workspace-project/). Undefined on a pre-0018
 * workspace until a converge run establishes it.
 */
export async function findStandingProject(root: string): Promise<FoundProject | undefined> {
  return (await readProjects(root)).find((project) => project.record.standing === true);
}

/**
 * Every project, in floor order: by number, as a number — so floor 0, the
 * ground floor (design/0041-ground-floor/), leads, and floor 10 follows 9
 * rather than 1 (design/0077-floor-chosen-number/). The order is fixed here
 * rather than at each listing because it is a fact about the workspace, not a
 * rendering choice: `status`, `project list`, and anything else that reads the
 * set show floors one way, which surfaces sorting for themselves could not
 * guarantee. Two floors on one number (a collision) keep their directory-name
 * order, so the first is always the same one.
 */
export async function readProjects(root: string): Promise<FoundProject[]> {
  const projects: FoundProject[] = [];
  for (const dir of projectDirs(root)) {
    projects.push({ dir, record: (await readDocument(root, projectRecordType(dir))).data });
  }
  // A stable sort over the directory order: a record on the number its
  // directory leads with (every record Ward writes) keeps its place.
  return projects.sort((a, b) => a.record.floor - b.record.floor);
}

export async function resolveProject(root: string, floor: number): Promise<FoundProject> {
  const match = (await readProjects(root)).find((project) => project.record.floor === floor);
  if (match === undefined) {
    throw new WardError(`no project on floor ${floor} — see: ward project list`);
  }
  return match;
}

export function floorOf(projectDir: string): number {
  const name = projectDir.split('/').pop() ?? '';
  const floor = Number.parseInt(name.split('-')[0] ?? '', 10);
  if (Number.isNaN(floor) || floor < GROUND_FLOOR) {
    throw new WardError(`cannot read a floor number from '${projectDir}'`);
  }
  return floor;
}

/**
 * The floor a task with no floor of its own opens on: the ground floor
 * (design/0041-ground-floor/). A workspace with no standing project — created
 * before design/0018 and never converged — is REFUSED rather than served from
 * the bare pool: `tasks/` is history now, and quietly opening one more legacy
 * task would leave the workspace further from the shape every other one has.
 * The remedy is the one doctor already carries.
 */
export async function requireGroundFloor(root: string): Promise<number> {
  const standing = await findStandingProject(root);
  if (standing === undefined) {
    throw new WardError('no ground floor — establish it: ward workspace upgrade');
  }
  return standing.record.floor;
}

/** The container directory for a task: its floor's tasks/. */
export async function taskContainer(root: string, floor: number): Promise<string> {
  const project = await resolveProject(root, floor);
  if (project.record.state === 'closed') {
    throw new WardError(`project on floor ${floor} is closed — tasks cannot open under it`);
  }
  if (!existsSync(join(root, project.dir))) {
    throw new WardError(`project directory ${project.dir} is missing — run: ward doctor`);
  }
  return `${project.dir}/tasks`;
}

// -- the floor's notes: the one write path (design/0055-floor-manifests/) ----

export interface FloorNoteReport {
  readonly floor: number;
  readonly slug: string;
  /** Workspace-relative path of the notes file written. */
  readonly path: string;
  /** The UTC date the bullet carries. */
  readonly date: string;
  readonly text: string;
  /** Whether the notes file had to be seeded first (a floor not yet backfilled). */
  readonly seeded: boolean;
}

/**
 * Append one dated bullet to a floor's notes and commit it, under the store
 * lock — the one way an agent writes into the record tree's notes, so the
 * write is serialized and journaled like every other. Append-only by
 * construction: nothing already in the file is rewritten. One
 * fact per bullet is enforced as one line per note; a closed floor takes no
 * notes, since no session will ever load them.
 */
export async function appendFloorNote(
  root: string,
  floor: number,
  textInput: string,
  now: Date = new Date(),
): Promise<FloorNoteReport> {
  const text = textInput.trim();
  if (text === '') throw new WardError('a note needs text — one fact, in one line');
  if (/[\r\n]/.test(text)) {
    throw new WardError(
      'a note is one fact on one line — run ward project note once for each fact',
    );
  }
  return withStoreLock(root, `project note ${floor}`, async () => {
    const project = await resolveProject(root, floor);
    if (!carriesManifest(project.record)) {
      throw new WardError(
        `floor ${floor} is closed — no session will load its notes; note it on an open floor`,
      );
    }
    const paths = floorManifestPaths(project.dir);
    const file = join(root, paths.notes);
    const date = isoDate(now);
    const seeded = !existsSync(file);
    if (seeded) await Bun.write(file, seedNotes(project.record.slug, date));
    const existing = await Bun.file(file).text();
    const lead = existing === '' || existing.endsWith('\n') ? '' : '\n';
    await appendFile(file, `${lead}- ${date} — ${text}\n`);
    commitRecords(root, `Note on floor ${floor}`, paths.notes);
    return { floor, slug: project.record.slug, path: paths.notes, date, text, seeded };
  });
}
