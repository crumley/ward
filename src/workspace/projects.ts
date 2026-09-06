// Projects — floors (design/0004-work-spine/): opened with a monotonic,
// never-reused floor number; status above the leaves is derived, never stored
// (intent/01-concepts/00-domain-model.md).
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { WardError } from '../errors.ts';
import { readDocument, writeDocument } from '../store/document.ts';
import { withStoreLock } from '../store/lock.ts';
import { type ProjectRecord, projectRecordType } from '../store/types.ts';
import { commitRecords, projectDirs, requireSlug } from './scan.ts';

export interface OpenProjectOptions {
  /**
   * Repositories the new floor claims (design/0037-repo-floor-affinity/) — a
   * routing default recorded at open, so the first task against a repository
   * can already be placed by it. Validated by the caller.
   */
  readonly repositories?: readonly string[];
}

export async function openProject(
  root: string,
  slugInput: string,
  options: OpenProjectOptions = {},
): Promise<ProjectRecord> {
  const slug = requireSlug(slugInput);
  // Allocation through commit is the serialized critical section (§17): the
  // floor scan must not race another writer's, and the commit must not race
  // another commit (design/0013-telemetry-and-serialized-writes/).
  return withStoreLock(root, `project open ${slug}`, async () => {
    // This record never carries the standing marker — creation is the only
    // writer of `standing: true`, so `project open` cannot mint a second
    // standing project, whatever slug it is given
    // (design/0018-standing-workspace-project/).
    const floor = await nextFloor(root);
    const dir = `projects/${floor}-${slug}`;
    const claims = [...(options.repositories ?? [])].sort();
    const record: ProjectRecord = {
      type: 'project',
      floor,
      slug,
      ...(claims.length === 0 ? {} : { repositories: claims }),
      state: 'active',
      openedAt: new Date().toISOString(),
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
    commitRecords(root, `Open project ${slug} (floor ${floor})`, dir);
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
  const floors = (await readProjects(root)).flatMap((project) => [
    project.record.floor,
    ...(project.record.previousFloor === undefined ? [] : [project.record.previousFloor]),
  ]);
  const ordinary = floors.filter((floor) => floor !== GROUND_FLOOR);
  return ordinary.length === 0 ? 1 : Math.max(...ordinary) + 1;
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
 * Every project, ground floor first (design/0041-ground-floor/). The order is
 * fixed here rather than at each listing because it is a fact about the
 * workspace, not a rendering choice: floor 0 is the floor every workspace
 * shares and the one a session with no obvious floor starts from, so it leads
 * `status`, `project list`, and anything else that reads the set — which two
 * surfaces sorting for themselves could not guarantee. The rest keep the scan
 * order.
 */
export async function readProjects(root: string): Promise<FoundProject[]> {
  const projects: FoundProject[] = [];
  for (const dir of projectDirs(root)) {
    projects.push({ dir, record: (await readDocument(root, projectRecordType(dir))).data });
  }
  return [
    ...projects.filter((project) => project.record.floor === GROUND_FLOOR),
    ...projects.filter((project) => project.record.floor !== GROUND_FLOOR),
  ];
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
