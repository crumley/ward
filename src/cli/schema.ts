// The living home of the --json contract (design/0008-json-shape-home/): one
// zod schema per read verb's output document, and one registry mapping the
// verb's CLI words to its schema. Everything derives from here — the builders
// in json.ts return these inferred types (drift is a compile error), the
// schema tests validate live output against them (drift is a test failure),
// and `ward schema` emits them as JSON Schema (the documentation ships inside
// the binary, so it cannot go stale). Adding a --json verb is a one-place
// change: define its shape, add its registry row.
//
// The shapes are declared standalone — they describe the output contract, not
// the records underneath (0005: shapes are built explicitly, never by
// serializing internals). strictObject makes the emitted JSON Schema exact
// (`additionalProperties: false`): the schema travels with the build that
// emits it, so it always matches, and strictness is what lets the tests catch
// an undocumented field. The additive-evolution policy (0005) is visible in
// the emission: optional fields are simply absent from `required`.
import { z } from 'zod';
import { WardError } from '../errors.ts';
import { workStateSchema } from '../store/types.ts';

/**
 * Live forge state of one linked PR (0009) — read from the forge at answer
 * time, never stored; the whole array vanishes when the forge is
 * unavailable, which is why every forge-state field is optional.
 */
export const prForgeShape = z.strictObject({
  url: z.string(),
  state: z.enum(['open', 'merged', 'closed', 'unknown']),
  reviewDecision: z.enum(['approved', 'changes-requested', 'review-required']).optional(),
  /** The branch the PR targets, as the forge reports it; absent when unreported (0014). */
  baseRefName: z.string().optional(),
});
export type PrForgeShape = z.infer<typeof prForgeShape>;

/** The task shape shared by `task list` and `status` (0005). */
export const taskShape = z.strictObject({
  code: z.string(),
  slug: z.string(),
  state: workStateSchema,
  floor: z.number().int().positive().optional(),
  purpose: z.string().optional(),
  prs: z.array(z.string()),
  outcome: z.enum(['delivered', 'abandoned']).optional(),
  inReview: z.boolean(),
  openedAt: z.string(),
  closedAt: z.string().optional(),
  /** One entry per linked PR, in `prs` order (0009). */
  forge: z.array(prForgeShape).optional(),
});
export type TaskShape = z.infer<typeof taskShape>;

/** In `status`, tasks additionally carry their open sessions. */
export const statusTaskShape = taskShape.extend({ openSessions: z.array(z.string()) });
export type StatusTaskShape = z.infer<typeof statusTaskShape>;

/** One derived attention item (0009): what awaits the human, nothing stored. */
export const needsYouShape = z.strictObject({
  task: z.string(),
  /** 'stale-base' (0014): an open PR whose base is not the repository's main line. */
  reason: z.enum(['awaiting-close', 'changes-requested', 'stale-base']),
  pr: z.string().optional(),
  /** The PR's current base branch, when the reason is stale-base (0014). */
  base: z.string().optional(),
  /** The main line the base should be, when the reason is stale-base (0014). */
  mainLine: z.string().optional(),
});
export type NeedsYouShape = z.infer<typeof needsYouShape>;

export const statusShape = z.strictObject({
  workspace: workStateSchema,
  projects: z.array(
    z.strictObject({
      floor: z.number().int().positive(),
      slug: z.string(),
      state: workStateSchema,
      derived: workStateSchema,
      tasks: z.array(statusTaskShape),
    }),
  ),
  bareTasks: z.array(statusTaskShape),
  /** Present exactly when the forge answered; empty means nothing awaits (0009). */
  needsYou: z.array(needsYouShape).optional(),
});
export type StatusShape = z.infer<typeof statusShape>;

export const projectListShape = z.array(
  z.strictObject({
    floor: z.number().int().positive(),
    slug: z.string(),
    state: workStateSchema,
    derived: workStateSchema,
    taskCount: z.number().int().nonnegative(),
    openedAt: z.string(),
    closedAt: z.string().optional(),
  }),
);
export type ProjectListShape = z.infer<typeof projectListShape>;

export const taskListShape = z.array(taskShape);
export type TaskListShape = z.infer<typeof taskListShape>;

export const worktreeListShape = z.array(
  z.strictObject({
    task: z.string(),
    repo: z.string(),
    branch: z.string(),
    disposition: z.literal('deliverable'),
    path: z.string(),
    present: z.boolean(),
    createdAt: z.string(),
  }),
);
export type WorktreeListShape = z.infer<typeof worktreeListShape>;

export const repoListShape = z.array(
  z.strictObject({
    name: z.string(),
    remote: z.string(),
    mainLine: z.string(),
    registeredAt: z.string(),
  }),
);
export type RepoListShape = z.infer<typeof repoListShape>;

const findingShape = z.strictObject({
  check: z.string(),
  severity: z.enum(['ok', 'info', 'warn', 'error']),
  message: z.string(),
});

export const doctorShape = z.strictObject({
  healthy: z.boolean(),
  workspaceRoot: z.string().nullable(),
  machine: z.array(findingShape),
  workspace: z.array(findingShape),
});
export type DoctorShape = z.infer<typeof doctorShape>;

/**
 * The registry: each key is exactly what the caller types after `ward` (minus
 * `--json`), so discovering a shape and invoking its verb agree by
 * construction. Order matches the documented verb list; JSON.stringify
 * preserves it, keeping `ward schema` byte-deterministic (§6).
 */
export const jsonVerbShapes: Readonly<Record<string, z.ZodType>> = {
  status: statusShape,
  'project list': projectListShape,
  'task list': taskListShape,
  'worktree list': worktreeListShape,
  'repo list': repoListShape,
  doctor: doctorShape,
};

/** The whole contract: every --json verb's JSON Schema, keyed by its CLI words. */
export function allSchemasJson(): unknown {
  return Object.fromEntries(
    Object.entries(jsonVerbShapes).map(([verb, shape]) => [verb, z.toJSONSchema(shape)]),
  );
}

/** One verb's JSON Schema; an unknown verb is refused legibly, never guessed at. */
export function verbSchemaJson(verb: string): unknown {
  const shape = jsonVerbShapes[verb];
  if (shape === undefined) {
    throw new WardError(
      `no --json verb named '${verb}' — known verbs: ${Object.keys(jsonVerbShapes).join(', ')}`,
    );
  }
  return z.toJSONSchema(shape);
}
