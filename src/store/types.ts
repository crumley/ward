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
