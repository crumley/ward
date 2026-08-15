// The living home of the --json contract (design/0008-json-shape-home/): one
// zod schema per --json verb's output document — read verbs (0005) and
// mutation reports (design/0015-mutation-json/) — and one registry mapping
// the verb's CLI words to its schema. Everything derives from here — the builders
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

/**
 * One worktree of a task in `status` (0016): identity from the record;
 * freshness derived at read time from local git alone — as fresh as the last
 * `repo refresh`, zero network — and absent when git could not be asked.
 */
export const statusWorktreeShape = z.strictObject({
  /** The registered repository — present exactly when the source is one (0019). */
  repo: z.string().optional(),
  /** 'workspace': a worktree of the workspace's own repository — the stewardship case (0019). */
  source: z.enum(['workspace']).optional(),
  branch: z.string(),
  path: z.string(),
  freshness: z.enum(['current', 'behind', 'dirty', 'drifted', 'unreadable']).optional(),
  /** Commits origin/<mainLine> holds that the worktree lacks — present exactly when behind. */
  behindBy: z.number().int().positive().optional(),
  /** The branch actually checked out — present exactly when drifted onto another branch. */
  checkedOut: z.string().optional(),
});
export type StatusWorktreeShape = z.infer<typeof statusWorktreeShape>;

/** In `status`, tasks additionally carry their open sessions and worktrees. */
export const statusTaskShape = taskShape.extend({
  openSessions: z.array(z.string()),
  /** Per-worktree freshness (0016) — absent on closed tasks, whose worktrees settled at close. */
  worktrees: z.array(statusWorktreeShape).optional(),
});
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
    /** The registered repository — present exactly when the source is one (0019). */
    repo: z.string().optional(),
    /** 'workspace': a worktree of the workspace's own repository — the stewardship case (0019). */
    source: z.enum(['workspace']).optional(),
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

// -- mutation reports (design/0015-mutation-json/) --------------------------
// Every mutation verb emits its existing typed report — the same steps,
// outcomes, and named trusts the human rendering shows — never a serialized
// internal and never a bare success boolean. The shapes are deliberately
// separate from the read-verb shapes above: a mutation report describes the
// state the verb just recorded (§16), while the read shapes carry derived
// overlays (inReview, live forge state) computed at read time.

/** One establishment step of `workspace create` (0002): check-then-do, named. */
const createStepShape = z.strictObject({
  step: z.string(),
  outcome: z.enum(['established', 'satisfied']),
  detail: z.string(),
});

export const workspaceCreateShape = z.strictObject({
  root: z.string(),
  steps: z.array(createStepShape),
});
export type WorkspaceCreateShape = z.infer<typeof workspaceCreateShape>;

/** `repo add`: the record as written, plus how the run converged (0003). */
export const repoAddShape = z.strictObject({
  name: z.string(),
  outcome: z.enum(['registered', 'converged', 'satisfied']),
  remote: z.string(),
  mainLine: z.string(),
  registeredAt: z.string(),
});
export type RepoAddShape = z.infer<typeof repoAddShape>;

/** `repo refresh`: one row per repository; a `failed` row keeps the exit-1 posture. */
export const repoRefreshShape = z.array(
  z.strictObject({
    name: z.string(),
    outcome: z.enum(['refreshed', 'current', 'dirty', 'failed']),
    detail: z.string(),
  }),
);
export type RepoRefreshShape = z.infer<typeof repoRefreshShape>;

export const projectOpenShape = z.strictObject({
  floor: z.number().int().positive(),
  slug: z.string(),
  state: workStateSchema,
  openedAt: z.string(),
});
export type ProjectOpenShape = z.infer<typeof projectOpenShape>;

/**
 * The task record as a mutation wrote it — shared by `task open`, `task
 * pause`, `task resume`, and `task pr`, and carried inside `task close`,
 * because each writes the same record and reports it back. `outcome` and
 * `closedAt` are recorded only by a close.
 */
export const taskMutationShape = z.strictObject({
  code: z.string(),
  slug: z.string(),
  state: workStateSchema,
  floor: z.number().int().positive().optional(),
  purpose: z.string().optional(),
  prs: z.array(z.string()),
  outcome: z.enum(['delivered', 'abandoned']).optional(),
  openedAt: z.string(),
  closedAt: z.string().optional(),
});
export type TaskMutationShape = z.infer<typeof taskMutationShape>;

/**
 * `task close`: the gate's step list, verbatim. The named trusts (forge
 * unavailable, reachability unverifiable — 0012) live in each step's
 * `detail`, exactly as the human reads them; a refused close emits no
 * document at all (the error posture below).
 */
export const taskCloseShape = z.strictObject({
  task: taskMutationShape,
  outcome: z.enum(['delivered', 'abandoned']),
  steps: z.array(z.strictObject({ step: z.string(), detail: z.string() })),
});
export type TaskCloseShape = z.infer<typeof taskCloseShape>;

/** `worktree create`: the record as written, flat like the `worktree list` rows. */
export const worktreeCreateShape = z.strictObject({
  task: z.string(),
  /** The registered repository — present exactly when the source is one (0019). */
  repo: z.string().optional(),
  /** 'workspace': a worktree of the workspace's own repository — the stewardship case (0019). */
  source: z.enum(['workspace']).optional(),
  branch: z.string(),
  disposition: z.literal('deliverable'),
  path: z.string(),
  createdAt: z.string(),
});
export type WorktreeCreateShape = z.infer<typeof worktreeCreateShape>;

/**
 * `worktree rebase` (0011): one row per worktree. `dirty` is a respected
 * refusal (exit 0); `conflict` and `failed` broke the verb's promise and keep
 * the exit-1 posture, with the document still emitted.
 */
export const worktreeRebaseShape = z.strictObject({
  task: z.string(),
  reports: z.array(
    z.strictObject({
      /** The registered repository — present exactly when the source is one (0019). */
      repo: z.string().optional(),
      /** 'workspace': a worktree of the workspace's own repository (0019). */
      source: z.enum(['workspace']).optional(),
      branch: z.string(),
      path: z.string(),
      outcome: z.enum(['rebased', 'current', 'dirty', 'conflict', 'failed']),
      detail: z.string(),
    }),
  ),
});
export type WorktreeRebaseShape = z.infer<typeof worktreeRebaseShape>;

/**
 * `workspace merge` (design/0019-stewardship-worktrees/): the gated act that
 * lands a stewardship branch on the workspace's own main line. One shape for
 * all three outcomes — `merged` carries the merge commit, `previewed` the
 * diff stat, `already-merged` neither; a refusal (dirty root, conflict,
 * unknown branch) emits no document at all (the 0015 posture).
 */
export const workspaceMergeShape = z.strictObject({
  branch: z.string(),
  mainLine: z.string(),
  outcome: z.enum(['merged', 'already-merged', 'previewed']),
  /** Commits the branch holds beyond the main line, at the moment of asking. */
  commits: z.number().int().nonnegative(),
  /** The landed merge commit (short) — present exactly when merged. */
  mergeCommit: z.string().optional(),
  /** `git diff --stat` against the merge base — present exactly when previewed. */
  diffStat: z.string().optional(),
});
export type WorkspaceMergeShape = z.infer<typeof workspaceMergeShape>;

/** The session record as written — shared by `session open` and `session close`. */
export const sessionMutationShape = z.strictObject({
  id: z.string(),
  task: z.string(),
  purpose: z.string(),
  workingDirectory: z.string(),
  handle: z.string().optional(),
  state: z.enum(['open', 'closed']),
  openedAt: z.string(),
  closedAt: z.string().optional(),
});
export type SessionMutationShape = z.infer<typeof sessionMutationShape>;

/**
 * The registry: each key is exactly what the caller types after `ward` (minus
 * `--json`), so discovering a shape and invoking its verb agree by
 * construction. Order matches the documented verb list; JSON.stringify
 * preserves it, keeping `ward schema` byte-deterministic (§6).
 *
 * The read verbs (0005/0008): what an agent polls between actions. Their
 * argv is derivable from the key alone, which the schema tests rely on.
 */
export const readVerbShapes: Readonly<Record<string, z.ZodType>> = {
  status: statusShape,
  'project list': projectListShape,
  'task list': taskListShape,
  'worktree list': worktreeListShape,
  'repo list': repoListShape,
  doctor: doctorShape,
};

/**
 * The mutation verbs (0015): each emits its typed report under `--json`, in
 * lifecycle order. Their argv needs arguments and sequencing, so their live
 * proof is the sequenced suite in test/cli/mutation-json.test.ts, not the
 * derived read-verb table.
 */
export const mutationVerbShapes: Readonly<Record<string, z.ZodType>> = {
  'workspace create': workspaceCreateShape,
  'repo add': repoAddShape,
  'repo refresh': repoRefreshShape,
  'project open': projectOpenShape,
  'task open': taskMutationShape,
  'task pause': taskMutationShape,
  'task resume': taskMutationShape,
  'task pr': taskMutationShape,
  'task close': taskCloseShape,
  'worktree create': worktreeCreateShape,
  'worktree rebase': worktreeRebaseShape,
  'session open': sessionMutationShape,
  'session close': sessionMutationShape,
  'workspace merge': workspaceMergeShape,
};

/** The whole `--json` contract: read verbs first, then the mutation verbs. */
export const jsonVerbShapes: Readonly<Record<string, z.ZodType>> = {
  ...readVerbShapes,
  ...mutationVerbShapes,
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
