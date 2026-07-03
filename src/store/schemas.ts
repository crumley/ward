// The document-type catalog: one Zod schema per document type, combined into a
// discriminated union on `type` (ADR 0003). The union IS the store's
// self-describing registry — machine-critical state is validated at the
// filesystem boundary, never trusted as free text
// (metadata-store: documents have explicit, runtime-validated types).
//
// Static types are `z.infer`red from the schemas so the human and agent views of
// a document are provably identical (§8) — types are never declared twice.

import { z } from 'zod';

/**
 * The CLOSED role vocabulary (scopes-and-personas). It is fixed on purpose: a
 * closed set is what lets the privacy gate redact role words EXHAUSTIVELY (§4),
 * and what lets model selection route deterministically (§2/§1).
 */
export const ROLES = [
  'house-supervisor',
  'attending',
  'charge-nurse',
  'resident',
  'medical-student',
] as const;
export type Role = (typeof ROLES)[number];
export const roleSchema = z.enum(ROLES);

/** Model tier — the durable fast-vs-deep intent; concrete ids are config (ADR/seam 04). */
export const tierSchema = z.enum(['fast', 'deep']);
export type Tier = z.infer<typeof tierSchema>;

/** Stored task state; `in-review` is DERIVED from the open-PR set, never stored (work-lifecycle). */
export const taskStateSchema = z.enum(['active', 'paused', 'closed']);
export type TaskState = z.infer<typeof taskStateSchema>;

export const personaRefSchema = z.object({ name: z.string(), role: roleSchema });
export type PersonaRef = z.infer<typeof personaRefSchema>;

export const scopeKindSchema = z.enum(['workspace', 'project', 'task', 'room']);
export type ScopeKind = z.infer<typeof scopeKindSchema>;

/** A scope address: kind + a resolving ref (floor `1`, task `1/csv-export`, room `1A1`, workspace ``). */
export const scopeRefSchema = z.object({ kind: scopeKindSchema, ref: z.string() });
export type ScopeRef = z.infer<typeof scopeRefSchema>;

/** Provenance/lineage carried by every artifact (§11). */
export const provenanceSchema = z.object({
  persona: personaRefSchema,
  workingDir: z.string(),
  session: z.string(),
  why: z.string(),
  derivedFrom: z.array(z.string()).default([]),
});
export type Provenance = z.infer<typeof provenanceSchema>;

const repoSchema = z.object({
  name: z.string(),
  remote: z.string().optional(),
  mainBranch: z.string().default('main'),
});
const worktreeRefSchema = z.object({ repo: z.string(), branch: z.string() });
export type WorktreeRef = z.infer<typeof worktreeRefSchema>;

const remoteLinkSchema = z.object({
  provider: z.string(),
  id: z.string(),
  url: z.string().optional(),
});
const harnessHandleSchema = z.object({ harness: z.string(), runId: z.string() });
export type HarnessHandle = z.infer<typeof harnessHandleSchema>;

const hookStateSchema = z.object({ name: z.string(), satisfied: z.boolean() });

// ── Document schemas ──────────────────────────────────────────────────────────

export const workspaceSchema = z.object({
  type: z.literal('workspace'),
  wardVersion: z.string(),
  schemaVersion: z.number().int(),
  repos: z.array(repoSchema).default([]),
  models: z.object({ fast: z.string(), deep: z.string() }),
});

export const personaSchema = z.object({
  type: z.literal('persona'),
  name: z.string(),
  role: roleSchema,
  disposition: z.string(),
  model: tierSchema.optional(),
});

/** A project is a floor. It records NO status — status is derived from its tasks (domain-model). */
export const projectSchema = z.object({
  type: z.literal('project'),
  floor: z.number().int().positive(),
  slug: z.string(),
  title: z.string(),
  attending: z.string(),
  chargeNurse: z.string(),
  mission: z.string().optional(),
});

export const taskSchema = z.object({
  type: z.literal('task'),
  slug: z.string(),
  floor: z.number().int().positive(),
  title: z.string(),
  state: taskStateSchema,
  resident: z.string(),
  successCriteria: z.string(),
  repos: z.array(z.string()).default([]),
  remote: remoteLinkSchema.optional(),
});

export const worktreeSchema = z.object({
  type: z.literal('worktree'),
  repo: z.string(),
  branch: z.string(),
  floor: z.number().int().positive(),
  taskSlug: z.string(),
  accent: z.string(),
  glyph: z.string(),
  setupHooks: z.array(hookStateSchema).default([]),
  tornDown: z.boolean().default(false),
});

// A room is a container over its sessions; occupancy is DERIVED (occupied iff
// ≥1 non-closed session), never stored — see plan/v2/spec-feedback SF-001 and
// principle §17. The record is written once at open; freed-ness is a query.
export const roomSchema = z.object({
  type: z.literal('room'),
  code: z.string(),
  floor: z.number().int().positive(),
  taskSlug: z.string(),
  worktree: worktreeRefSchema,
  accent: z.string(),
  glyph: z.string(),
});

// Stored session state is open|closed only. "running" (a process attached right
// now) is a LIVE attribute derived from the multiplexer (§16: live state is a
// cache over the record), not a durable one — see spec-feedback SF-002.
export const sessionSchema = z.object({
  type: z.literal('session'),
  id: z.string(),
  scope: scopeRefSchema,
  persona: personaRefSchema,
  workingDir: z.string(),
  harness: harnessHandleSchema,
  model: tierSchema,
  state: z.enum(['open', 'closed']),
  openedAt: z.string(),
  closedAt: z.string().optional(),
});

export const wakeSchema = z.object({
  type: z.literal('wake'),
  id: z.string(),
  waiter: z.string(),
  condition: z.object({
    kind: z.enum(['room-done', 'pr-merged', 'task-closed']),
    target: z.string(),
  }),
  state: z.enum(['armed', 'satisfied']),
});

export const messageSchema = z.object({
  type: z.literal('message'),
  id: z.string(),
  kind: z.enum(['dispatch', 'report']),
  from: z.string(),
  to: z.string(),
  routedVia: z.enum(['charge-nurse', 'house-supervisor']).optional(),
  body: z.string(),
  brief: z.string().optional(),
});

export const reflectionSchema = z.object({
  type: z.literal('reflection'),
  scope: z.string(),
  goal: z.string(),
  cursor: z.number().int().nonnegative(),
  proposals: z
    .array(
      z.object({
        kind: z.enum(['skill', 'tooling', 'persona', 'standard', 'ward']),
        summary: z.string(),
      }),
    )
    .default([]),
});

export const artifactSchema = z.object({
  type: z.literal('artifact'),
  name: z.string(),
  artifactType: z.enum(['brief', 'note', 'decision', 'data', 'handoff', 'status']),
  scope: scopeRefSchema,
  provenance: provenanceSchema,
  forScope: scopeRefSchema.optional(),
  summary: z.string().optional(),
});

/** An append-only log event. Ordered by `seq`; `at` is recorded but not relied on for logic. */
export const eventSchema = z.object({
  type: z.literal('event'),
  seq: z.number().int().nonnegative(),
  at: z.string(),
  kind: z.string(),
  actor: z.string().optional(),
  data: z.record(z.string(), z.unknown()).default({}),
});

export const documentSchema = z.discriminatedUnion('type', [
  workspaceSchema,
  personaSchema,
  projectSchema,
  taskSchema,
  worktreeSchema,
  roomSchema,
  sessionSchema,
  wakeSchema,
  messageSchema,
  reflectionSchema,
  artifactSchema,
  eventSchema,
]);

export type WardDocument = z.infer<typeof documentSchema>;
export type DocumentType = WardDocument['type'];

export type Workspace = z.infer<typeof workspaceSchema>;
export type Persona = z.infer<typeof personaSchema>;
export type Project = z.infer<typeof projectSchema>;
export type Task = z.infer<typeof taskSchema>;
export type Worktree = z.infer<typeof worktreeSchema>;
export type Room = z.infer<typeof roomSchema>;
export type Session = z.infer<typeof sessionSchema>;
export type Wake = z.infer<typeof wakeSchema>;
export type Message = z.infer<typeof messageSchema>;
export type Reflection = z.infer<typeof reflectionSchema>;
export type Artifact = z.infer<typeof artifactSchema>;
export type WardEvent = z.infer<typeof eventSchema>;
