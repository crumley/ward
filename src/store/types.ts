// The Ward-owned record types this entry builds: the workspace record and the
// seeded artifact-type catalog. Adding a type is additive — define its schema
// and DocumentType here; the document layer does the rest.
import { z } from 'zod';
import type { DocumentType } from './document.ts';

export const workspaceRecordSchema = z.object({
  type: z.literal('workspace'),
  name: z.string().min(1),
  wardVersion: z.string().min(1),
  createdAt: z.string().min(1),
});
export type WorkspaceRecord = z.infer<typeof workspaceRecordSchema>;

export const workspaceRecordType: DocumentType<WorkspaceRecord> = {
  name: 'workspace',
  relPath: 'workspace.md',
  schema: workspaceRecordSchema,
};

export const catalogSchema = z.object({
  type: z.literal('catalog'),
  artifactTypes: z.array(
    z.object({
      name: z.string().min(1),
      description: z.string().min(1),
    }),
  ),
});
export type Catalog = z.infer<typeof catalogSchema>;

export const catalogType: DocumentType<Catalog> = {
  name: 'catalog',
  relPath: 'catalog.md',
  schema: catalogSchema,
};

export const repositorySchema = z.object({
  type: z.literal('repository'),
  name: z.string().min(1),
  remote: z.string().min(1),
  mainLine: z.string().min(1),
  registeredAt: z.string().min(1),
});
export type RepositoryRecord = z.infer<typeof repositorySchema>;

/** Repository records are one document per repository: repositories/<name>.md. */
export function repositoryRecordType(name: string): DocumentType<RepositoryRecord> {
  return { name: 'repository', relPath: `repositories/${name}.md`, schema: repositorySchema };
}

/** Leaf work states (intent/01-concepts/03-work-lifecycle.md). */
export const workStateSchema = z.enum(['active', 'paused', 'closed']);
export type WorkState = z.infer<typeof workStateSchema>;

export const projectSchema = z.object({
  type: z.literal('project'),
  floor: z.number().int().positive(),
  slug: z.string().min(1),
  state: workStateSchema,
  openedAt: z.string().min(1),
  closedAt: z.string().min(1).optional(),
});
export type ProjectRecord = z.infer<typeof projectSchema>;

export function projectRecordType(dir: string): DocumentType<ProjectRecord> {
  return { name: 'project', relPath: `${dir}/project.md`, schema: projectSchema };
}

export const taskSchema = z.object({
  type: z.literal('task'),
  code: z.string().min(1),
  slug: z.string().min(1),
  state: workStateSchema,
  floor: z.number().int().positive().optional(),
  purpose: z.string().min(1).optional(),
  /** The PR-link set: URLs only — review state is the forge's truth, read live. */
  prs: z.array(z.string().min(1)),
  outcome: z.enum(['delivered', 'abandoned']).optional(),
  openedAt: z.string().min(1),
  closedAt: z.string().min(1).optional(),
});
export type TaskRecord = z.infer<typeof taskSchema>;

export function taskRecordType(dir: string): DocumentType<TaskRecord> {
  return { name: 'task', relPath: `${dir}/task.md`, schema: taskSchema };
}

export const worktreeSchema = z.object({
  type: z.literal('worktree'),
  repo: z.string().min(1),
  branch: z.string().min(1),
  disposition: z.literal('deliverable'),
  /** Workspace-relative directory of the worktree itself. */
  path: z.string().min(1),
  createdAt: z.string().min(1),
});
export type WorktreeRecord = z.infer<typeof worktreeSchema>;

export function worktreeRecordType(
  taskDir: string,
  fileName: string,
): DocumentType<WorktreeRecord> {
  return {
    name: 'worktree',
    relPath: `${taskDir}/worktrees/${fileName}.md`,
    schema: worktreeSchema,
  };
}

export const sessionSchema = z.object({
  type: z.literal('session'),
  id: z.string().min(1),
  task: z.string().min(1),
  purpose: z.string().min(1),
  workingDirectory: z.string().min(1),
  /** Free-form harness handle (which harness, which native run), when known. */
  handle: z.string().min(1).optional(),
  state: z.enum(['open', 'closed']),
  openedAt: z.string().min(1),
  closedAt: z.string().min(1).optional(),
});
export type SessionRecord = z.infer<typeof sessionSchema>;

export function sessionRecordType(taskDir: string, id: string): DocumentType<SessionRecord> {
  return { name: 'session', relPath: `${taskDir}/sessions/${id}.md`, schema: sessionSchema };
}

/** The artifact types Ward seeds at creation (intent/02-subsystems/00-metadata-store.md). */
export const seededArtifactTypes: Catalog['artifactTypes'] = [
  {
    name: 'brief',
    description: 'A handoff composed at one scope to conjure and orient an agent at another.',
  },
  {
    name: 'decision',
    description: 'A choice made in the course of work, recorded with its why.',
  },
  {
    name: 'note',
    description: 'A durable observation worth keeping beyond the session that made it.',
  },
];
