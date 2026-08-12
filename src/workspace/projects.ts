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

export async function openProject(root: string, slugInput: string): Promise<ProjectRecord> {
  const slug = requireSlug(slugInput);
  // Allocation through commit is the serialized critical section (§17): the
  // floor scan must not race another writer's, and the commit must not race
  // another commit (design/0013-telemetry-and-serialized-writes/).
  return withStoreLock(root, `project open ${slug}`, async () => {
    // Floors are monotonic over every project ever opened — closed floors are
    // retired, never reused, because they root historical room addresses.
    const floors = projectDirs(root).map(floorOf);
    const floor = floors.length === 0 ? 1 : Math.max(...floors) + 1;
    const dir = `projects/${floor}-${slug}`;
    const record: ProjectRecord = {
      type: 'project',
      floor,
      slug,
      state: 'active',
      openedAt: new Date().toISOString(),
    };
    await writeDocument(root, projectRecordType(dir), {
      data: record,
      body:
        `Floor ${floor}: the \`${slug}\` project. Its tasks live in \`tasks/\` beside this ` +
        'record, and its status is derived from theirs, never stored here.',
    });
    commitRecords(root, `Open project ${slug} (floor ${floor})`, dir);
    return record;
  });
}

export interface FoundProject {
  readonly dir: string;
  readonly record: ProjectRecord;
}

export async function readProjects(root: string): Promise<FoundProject[]> {
  const projects: FoundProject[] = [];
  for (const dir of projectDirs(root)) {
    projects.push({ dir, record: (await readDocument(root, projectRecordType(dir))).data });
  }
  return projects;
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
  if (Number.isNaN(floor) || floor < 1) {
    throw new WardError(`cannot read a floor number from '${projectDir}'`);
  }
  return floor;
}

/** The container directory for a task: a project's tasks/, or the root's. */
export async function taskContainer(root: string, floor: number | undefined): Promise<string> {
  if (floor === undefined) return 'tasks';
  const project = await resolveProject(root, floor);
  if (project.record.state === 'closed') {
    throw new WardError(`project on floor ${floor} is closed — tasks cannot open under it`);
  }
  if (!existsSync(join(root, project.dir))) {
    throw new WardError(`project directory ${project.dir} is missing — run: ward doctor`);
  }
  return `${project.dir}/tasks`;
}
