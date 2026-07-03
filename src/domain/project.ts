// Project lifecycle (domain-model). A project is a FLOOR, addressed by an
// ascending floor number. It records NO status — status is derived from its
// tasks (status.ts). An attending owns its outcome; a charge nurse tracks it.

import { writeDocument } from '../store/doc.ts';
import { nextFloor, slugify } from '../store/ids.ts';
import { appendEvent, type Clock, systemClock } from '../store/log.ts';
import { logDir, projectDir, projectDoc } from '../store/paths.ts';
import type { Project } from '../store/schemas.ts';
import { listProjects } from '../store/workspace.ts';
import { defaultPersonaForRole } from './personas.ts';

export interface OpenProjectOptions {
  title: string;
  slug?: string;
  attending?: string;
  chargeNurse?: string;
  mission?: string;
  now?: Clock;
}

/** Open a project on the next free floor. */
export async function openProject(root: string, opts: OpenProjectOptions): Promise<Project> {
  const now = opts.now ?? systemClock;
  const floor = nextFloor((await listProjects(root)).map((p) => p.floor));
  const slug = opts.slug ?? slugify(opts.title);
  const project: Project = {
    type: 'project',
    floor,
    slug,
    title: opts.title,
    attending: opts.attending ?? defaultPersonaForRole('attending').name,
    chargeNurse: opts.chargeNurse ?? defaultPersonaForRole('charge-nurse').name,
    ...(opts.mission === undefined ? {} : { mission: opts.mission }),
  };
  const dir = projectDir(root, floor, slug);
  await writeDocument(projectDoc(dir), project);
  await appendEvent(logDir(dir), { kind: 'project-opened', data: { floor, slug } }, now);
  return project;
}
