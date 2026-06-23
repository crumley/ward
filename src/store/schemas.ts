// The document-type catalog: one Zod schema per document type, assembled into a discriminated union
// on the `type` field. Every store read validates through this; every write is re-validated before
// serialization. One definition is both the runtime validator and (via z.infer) the static type, so
// "typed" and "runtime-validated" cannot drift. See build/decisions/0003-zod-schemas.md and the
// metadata-store seam (intent/02-subsystems/00-metadata-store.md).

import { z } from "zod";

export const SCHEMA_VERSION = 1;
const sv = () => z.number().default(SCHEMA_VERSION);

// ---- shared shapes ----------------------------------------------------------------------------

export const Identity = z.object({ slug: z.string(), code: z.string() });
export const Theme = z.object({ accent: z.string(), glyph: z.string() });
export type ThemeVal = z.infer<typeof Theme>;
export const Provenance = z.object({
  persona: z.string().optional(), // internal name — never crosses the privacy boundary (§4)
  cwd: z.string(),
  session: z.string().optional(),
  why: z.string().optional(),
  derivedFrom: z.array(z.string()).default([]),
});

export const RepoRef = z.object({
  name: z.string(),
  url: z.string(),
  mainBranch: z.string(),
  path: z.string(),
});

export const TaskState = z.enum(["drafted", "active", "blocked", "paused", "in-review", "closed"]);
export const RoomState = z.enum(["open", "closed"]);
export const SessionVerb = z.enum(["open", "resume", "close"]);
export const WakeVerb = z.enum(["arm", "satisfy"]);
export const RemoteState = z.enum(["open", "changes-requested", "approved", "merged"]);
export type RemoteStateT = z.infer<typeof RemoteState>;

// ---- document types ---------------------------------------------------------------------------

export const Workspace = z.object({
  type: z.literal("workspace"),
  schemaVersion: sv(),
  wardVersion: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  repos: z.array(RepoRef).default([]),
  modelDefaults: z.record(z.string(), z.string()).default({}),
  personaCast: z.array(z.string()).default([]),
});

export const Persona = z.object({
  type: z.literal("persona"),
  schemaVersion: sv(),
  name: z.string(),
  role: z.string(),
  disposition: z.string(),
  modelTier: z.string(),
});

export const Project = z.object({
  type: z.literal("project"),
  schemaVersion: sv(),
  identity: Identity, // code = floor number
  title: z.string(),
  personas: z.object({ attending: z.string(), chargeNurse: z.string() }),
  theme: Theme,
  // Non-derivable judgments recorded here; STATUS IS NOT — it is derived from child tasks.
  priority: z.string().optional(),
  attention: z.boolean().optional(),
  createdAt: z.string(),
});

export const Task = z.object({
  type: z.literal("task"),
  schemaVersion: sv(),
  identity: Identity,
  title: z.string(),
  successCriteria: z.array(z.string()).default([]),
  repos: z.array(z.string()).default([]),
  resident: z.string(),
  state: TaskState.default("active"),
  remote: z
    .object({ provider: z.string(), id: z.string(), url: z.string(), state: RemoteState })
    .optional(),
  theme: Theme,
  createdAt: z.string(),
});

export const Worktree = z.object({
  type: z.literal("worktree"),
  schemaVersion: sv(),
  repo: z.string(),
  branch: z.string(),
  task: z.string(),
  path: z.string(),
  hooks: z.record(z.string(), z.enum(["pending", "satisfied"])).default({}),
  theme: Theme,
  createdAt: z.string(),
});

export const Room = z.object({
  type: z.literal("room"),
  schemaVersion: sv(),
  identity: Identity, // code = floor+room, e.g. 1A1
  worktree: z.string(), // repo__branch natural key
  task: z.string(),
  brief: z.string().optional(), // artifact name
  state: RoomState.default("open"),
  theme: Theme,
  createdAt: z.string(),
});

export const Artifact = z.object({
  type: z.literal("artifact"),
  schemaVersion: sv(),
  artifactType: z.string(), // brief | note | decision | ...
  name: z.string(),
  provenance: Provenance,
  for: z.string().optional(), // target scope/persona for a brief
  createdAt: z.string(),
});

export const SessionEvent = z.object({
  type: z.literal("session-event"),
  schemaVersion: sv(),
  session: z.string(),
  verb: SessionVerb,
  persona: z.string().optional(),
  scope: z.string().optional(),
  cwd: z.string().optional(),
  harness: z.string().optional(),
  model: z.string().optional(),
  handle: z.string().optional(), // harness handle: "<harness>:<nativeRunId>"
  ts: z.string(),
});

export const Message = z.object({
  type: z.literal("message"),
  schemaVersion: sv(),
  id: z.string(),
  kind: z.enum(["dispatch", "report"]),
  from: z.string(),
  to: z.string(),
  ref: z.string().optional(), // artifact / brief referenced
  body: z.string(),
  ts: z.string(),
});

export const Wake = z.object({
  type: z.literal("wake"),
  schemaVersion: sv(),
  id: z.string(),
  condition: z.string(), // e.g. "1A1:done"
  armer: z.string(), // who asked to be woken
  ts: z.string(),
});

export const WakeEvent = z.object({
  type: z.literal("wake-event"),
  schemaVersion: sv(),
  wake: z.string(),
  verb: WakeVerb,
  ts: z.string(),
});

export const Reflection = z.object({
  type: z.literal("reflection"),
  schemaVersion: sv(),
  scope: z.string(),
  goal: z.string(),
  cursor: z.string(), // how far this (scope, goal) reflection has processed
  proposals: z.array(z.object({ kind: z.string(), summary: z.string() })).default([]),
  ts: z.string(),
});

// ---- the catalog ------------------------------------------------------------------------------

export const DocSchema = z.discriminatedUnion("type", [
  Workspace,
  Persona,
  Project,
  Task,
  Worktree,
  Room,
  Artifact,
  SessionEvent,
  Message,
  Wake,
  WakeEvent,
  Reflection,
]);

export type Doc = z.infer<typeof DocSchema>;
export type DocInput = z.input<typeof DocSchema>;

export type WorkspaceDoc = z.infer<typeof Workspace>;
export type ProjectDoc = z.infer<typeof Project>;
export type TaskDoc = z.infer<typeof Task>;
export type WorktreeDoc = z.infer<typeof Worktree>;
export type RoomDoc = z.infer<typeof Room>;
export type ArtifactDoc = z.infer<typeof Artifact>;
export type SessionEventDoc = z.infer<typeof SessionEvent>;
export type MessageDoc = z.infer<typeof Message>;
export type WakeDoc = z.infer<typeof Wake>;
export type WakeEventDoc = z.infer<typeof WakeEvent>;
export type ReflectionDoc = z.infer<typeof Reflection>;
export type PersonaDoc = z.infer<typeof Persona>;
