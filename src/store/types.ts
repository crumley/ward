// The Ward-owned record types this entry builds: the workspace record and the
// seeded artifact-type catalog. Adding a type is additive — define its schema
// and DocumentType here; the document layer does the rest.
import { z } from 'zod';
import { agentSettingsSchema } from '../agent/settings.ts';
import type { DocumentType } from './document.ts';

export const workspaceRecordSchema = z.object({
  type: z.literal('workspace'),
  name: z.string().min(1),
  wardVersion: z.string().min(1),
  /**
   * The name of the workspace's own main line — recorded from the repository
   * at creation (or backfilled by converge/upgrade), never assumed, exactly
   * as a registered repository's is (design/0020-deterministic-upgrade/;
   * intent/01-concepts/06-workspace-lifecycle.md, the main line's name is
   * recorded — here too). With it recorded, a root checkout standing on
   * another branch is ordinary record↔disk drift doctor can name, instead of
   * a quiet redefinition of what the main line is (0019's SF-001, resolved).
   * Optional so every pre-0020 record stays valid unchanged; doctor points
   * the absence at the upgrade that records it.
   */
  mainLine: z.string().min(1).optional(),
  /**
   * The workspace-local agent configuration — the narrower of the two axes
   * (design/0028-agent-configuration/): the same block the global config
   * carries, overriding it per key for agents started in THIS workspace ("in
   * this workspace, the model is Sonnet"). The workspace record is the
   * workspace's configuration home, so the override needs no new file and no
   * new resolution order — a workspace either carries the block or does not.
   * Optional, and therefore additive: every record written before this entry
   * stays valid unchanged, and no workspace upgrade is needed to keep working
   * — an unconfigured workspace simply inherits the global layer.
   */
  agent: agentSettingsSchema.optional(),
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
  /**
   * The standing workspace project's marker
   * (design/0018-standing-workspace-project/): present-and-true on exactly
   * the one project that is the workspace's own — the home for stewardship
   * work, the project that never closes. Written only by workspace creation;
   * `ward project open` never writes it, which is what keeps the standing
   * project single. Optional so every pre-0018 record stays valid unchanged.
   */
  standing: z.literal(true).optional(),
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

export const worktreeSchema = z
  .object({
    type: z.literal('worktree'),
    /** The registered repository — present exactly when the source is one. */
    repo: z.string().min(1).optional(),
    /**
     * `workspace` marks the stewardship case: a worktree of the workspace's
     * own repository, which is registered nowhere and carries no name in the
     * repository set (design/0019-stewardship-worktrees/) — absence of `repo`
     * over a fabricated name, the codebase-wide convention.
     */
    source: z.literal('workspace').optional(),
    branch: z.string().min(1),
    disposition: z.literal('deliverable'),
    /** Workspace-relative directory of the worktree itself. */
    path: z.string().min(1),
    createdAt: z.string().min(1),
  })
  .refine((record) => (record.repo === undefined) !== (record.source === undefined), {
    message: "exactly one of 'repo' and 'source: workspace' names the worktree's repository",
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

/**
 * The level a session is responsible for (design/0028-launched-sessions/;
 * intent/01-concepts/00-domain-model.md — a session's scope is workspace /
 * project / task / room). Two values today: every session recorded before this
 * entry is a task session, and workspace scope is the one this entry launches.
 * `project` and `room` arrive as new values with the verbs that open them —
 * data, not a migration, because no existing record changes when the enum
 * grows.
 */
export const sessionScopeSchema = z.enum(['workspace', 'task']);
export type SessionScope = z.infer<typeof sessionScopeSchema>;

/**
 * One lifecycle event on a session (intent/01-concepts/02-sessions-and-lifecycle.md,
 * the session log): append-only entries for opened / resumed / resume-failed /
 * closed. Events are not states — the stored state stays `open | closed` — but
 * they make FAILURE a recorded fact: without a resume-failed event a session
 * whose re-attach keeps failing is indistinguishable from one that is open and
 * healthy.
 */
export const sessionEventSchema = z.object({
  event: z.enum(['opened', 'resumed', 'resume-failed', 'closed']),
  at: z.string().min(1),
  /** Why it failed — present exactly on `resume-failed`, per the intent's "with its cause". */
  cause: z.string().min(1).optional(),
});
export type SessionEvent = z.infer<typeof sessionEventSchema>;

export const sessionSchema = z
  .object({
    type: z.literal('session'),
    id: z.string().min(1),
    /**
     * The scope this session works at. Optional ONLY so every record written
     * before design/0028 stays valid unchanged — those carry a `task` and
     * nothing else, which reads as `task` scope and always did. Every record
     * written from now on says its scope outright.
     */
    scope: sessionScopeSchema.optional(),
    /** The task addressed — present exactly when the scope is a task. */
    task: z.string().min(1).optional(),
    purpose: z.string().min(1),
    workingDirectory: z.string().min(1),
    /** Free-form harness handle (which harness, which native run), when known. */
    handle: z.string().min(1).optional(),
    /**
     * What the agent was actually STARTED with, recorded at launch
     * (design/0028-launched-sessions/) — present exactly when the resolution
     * supplied one, absent when Ward passed no flag at all. The intent's
     * session-log minimum names the model
     * (intent/01-concepts/02-sessions-and-lifecycle.md), and recording it here
     * is what keeps the workspace self-sufficient once a per-user
     * configuration layer exists: reproduction reads the session, not the
     * machine that happened to launch it (0027's SF-001, its thin half).
     */
    model: z.string().min(1).optional(),
    effort: z.string().min(1).optional(),
    state: z.enum(['open', 'closed']),
    /** The append-only lifecycle trail; absent on records written before 0028. */
    events: z.array(sessionEventSchema).optional(),
    openedAt: z.string().min(1),
    closedAt: z.string().min(1).optional(),
  })
  // The scope and its referent must agree — the same shape the worktree record
  // uses for `repo` vs `source: workspace`: absence of a referent, never a
  // fabricated one. A workspace-scope session addresses the workspace, which
  // is identified by location and has no code to carry.
  .refine((record) => ((record.scope ?? 'task') === 'task') === (record.task !== undefined), {
    message: "a task session names its task; a workspace session names none — 'task' must match",
  });
export type SessionRecord = z.infer<typeof sessionSchema>;

/** The scope a record states, or the one a pre-0028 record implies by carrying a task. */
export function sessionScopeOf(record: SessionRecord): SessionScope {
  return record.scope ?? 'task';
}

/**
 * Session records live under the scope they belong to: a task's beside its
 * task record, and a workspace-scope session's in `sessions/` at the root —
 * the workspace's own level, exactly as `tasks/` holds the bare tasks that
 * elide the project level (levels are elided, not faked). `scopeDir` is the
 * empty string for the workspace itself.
 */
export function sessionRecordType(scopeDir: string, id: string): DocumentType<SessionRecord> {
  const dir = scopeDir === '' ? 'sessions' : `${scopeDir}/sessions`;
  return { name: 'session', relPath: `${dir}/${id}.md`, schema: sessionSchema };
}

export const baselinesSchema = z.object({
  type: z.literal('baselines'),
  /** One entry per installed artifact: the exact content Ward put in place. */
  artifacts: z.array(
    z.object({
      path: z.string().min(1),
      sha256: z.string().length(64),
      wardVersion: z.string().min(1),
      installedAt: z.string().min(1),
    }),
  ),
});
export type Baselines = z.infer<typeof baselinesSchema>;

/**
 * The installed-artifact baselines live under .ward/ because they are Ward's
 * bookkeeping, not the human's record: altering them breaks what divergence
 * detection means (intent/01-concepts/06-workspace-lifecycle.md, the
 * membership test), so they sit with the store mechanics no human edits.
 */
export const baselinesType: DocumentType<Baselines> = {
  name: 'baselines',
  relPath: '.ward/baselines.md',
  schema: baselinesSchema,
};

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
