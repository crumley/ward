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

/**
 * One registered workspace (design/0024-global-config-registry/), as
 * `workspace list` reports it: MRU-ordered rows, the default marked, and
 * `stale` telling the truth about an entry whose path no longer holds a
 * workspace — reported, never hidden and never silently resolved to (§20).
 * `lastUsedAt` is absent until an invocation has run inside it.
 */
export const workspaceListShape = z.array(
  z.strictObject({
    name: z.string(),
    path: z.string(),
    default: z.boolean(),
    stale: z.boolean(),
    registeredAt: z.string(),
    lastUsedAt: z.string().optional(),
  }),
);
export type WorkspaceListShape = z.infer<typeof workspaceListShape>;

/** `workspace path`: the resolved workspace — the path is what the shell uses. */
export const workspacePathShape = z.strictObject({
  name: z.string(),
  path: z.string(),
});
export type WorkspacePathShape = z.infer<typeof workspacePathShape>;

/**
 * `repo path`: the canonical checkout, plus which workspace answered — the
 * search may have crossed workspaces, and the caller should be able to see
 * which one claimed the name.
 */
export const repoPathShape = z.strictObject({
  repo: z.string(),
  workspace: z.string(),
  workspacePath: z.string(),
  path: z.string(),
});
export type RepoPathShape = z.infer<typeof repoPathShape>;

const findingShape = z.strictObject({
  check: z.string(),
  severity: z.enum(['ok', 'info', 'warn', 'error']),
  message: z.string(),
});

/**
 * One resolved agent-configuration key (design/0028-agent-configuration/):
 * the value and the layer that answered for it. `value` is present exactly
 * when `provenance` is anything but `absent` — an absent key has no value to
 * carry, and the omission is the contract: a caller assembling a launch
 * command leaves that flag off entirely rather than passing a Ward-invented
 * default. Optional-omitted rather than null, the shape convention here.
 */
function resolvedAgentKey<T extends z.ZodType>(value: T) {
  return z.strictObject({
    provenance: z.enum(['workspace', 'global', 'default', 'absent']),
    value: value.optional(),
  });
}

/** The agent configuration as it resolves where doctor is standing. */
export const doctorAgentShape = z.strictObject({
  harness: resolvedAgentKey(z.string()),
  model: resolvedAgentKey(z.string()),
  effort: resolvedAgentKey(z.string()),
  args: resolvedAgentKey(z.array(z.string())),
});

export const doctorShape = z.strictObject({
  healthy: z.boolean(),
  workspaceRoot: z.string().nullable(),
  /** Null outside a workspace, where only half the resolution exists. */
  agent: doctorAgentShape.nullable(),
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

/**
 * `repo refresh`: one row per repository, in registration order whatever
 * order they finished in; a `failed` row keeps the exit-1 posture. `dirty`
 * and `conflicted` are the two skipped-on-purpose outcomes — informational,
 * exit 0 (design/0023-refresh-concurrency-ux/).
 */
export const repoRefreshShape = z.array(
  z.strictObject({
    name: z.string(),
    outcome: z.enum(['refreshed', 'current', 'dirty', 'conflicted', 'failed']),
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

/**
 * `workspace restore` (design/0021-restore-from-clone/): the record
 * re-materializing the world — one row per registered repository and per
 * worktree of a non-closed task, plus the honest note about open session
 * records that cannot be live here. `lost` is a worktree-only outcome: the
 * recorded branch is reachable nowhere, the record is kept, nothing is
 * fabricated. A `lost` or `failed` row keeps the exit-1 posture with the
 * document still emitted (the repo-refresh convention).
 */
export const workspaceRestoreShape = z.strictObject({
  root: z.string(),
  repositories: z.array(
    z.strictObject({
      name: z.string(),
      outcome: z.enum(['restored', 'satisfied', 'failed']),
      detail: z.string(),
    }),
  ),
  worktrees: z.array(
    z.strictObject({
      task: z.string(),
      /** The registered repository — present exactly when the source is one (0019). */
      repo: z.string().optional(),
      /** 'workspace': a worktree of the workspace's own repository (0019). */
      source: z.enum(['workspace']).optional(),
      branch: z.string(),
      path: z.string(),
      outcome: z.enum(['restored', 'satisfied', 'lost', 'failed']),
      detail: z.string(),
    }),
  ),
  /** Open session records found in the record — named, never restored. */
  sessions: z.strictObject({
    open: z.number().int().nonnegative(),
    detail: z.string(),
  }),
});
export type WorkspaceRestoreShape = z.infer<typeof workspaceRestoreShape>;

/**
 * `workspace upgrade` (design/0020-deterministic-upgrade/): the deterministic
 * upgrade's report — one row per installed artifact naming the mechanical
 * action taken, the reconciliation residue (customized artifacts left
 * byte-untouched, named for a human or agent to merge), the recorded
 * main-line name, the stamp, and the commit landed on the stewardship branch.
 * A refusal (no workspace worktree, dirty copy) emits no document (0015).
 */
export const workspaceUpgradeShape = z.strictObject({
  task: z.string(),
  branch: z.string(),
  /** Workspace-relative path of the stewardship worktree written into. */
  path: z.string(),
  outcome: z.enum(['upgraded', 'current']),
  mainLine: z.strictObject({
    name: z.string(),
    action: z.enum(['recorded', 'already-recorded']),
  }),
  stamp: z.strictObject({
    wardVersion: z.string(),
    action: z.enum(['advanced', 'current']),
  }),
  baselines: z.enum(['updated', 'current']),
  artifacts: z.array(
    z.strictObject({
      path: z.string(),
      action: z.enum(['upgraded', 'installed', 'current', 'kept']),
      detail: z.string(),
    }),
  ),
  /** Paths left byte-untouched because their content is the human's own. */
  residue: z.array(z.string()),
  /** The upgrade commit on the stewardship branch (short) — when one landed. */
  commit: z.string().optional(),
});
export type WorkspaceUpgradeShape = z.infer<typeof workspaceUpgradeShape>;

/**
 * The three registry mutations share one shape
 * (design/0024-global-config-registry/): each acts on exactly one entry and
 * reports it as it now reads, with `outcome` carrying how the run converged —
 * `satisfied` is what makes the idempotency visible (§6). An unregistered
 * entry reports `default: false`: it is out of the registry, so it is not the
 * default any more.
 */
export const workspaceRegistryShape = z.strictObject({
  name: z.string(),
  path: z.string(),
  default: z.boolean(),
  outcome: z.enum(['registered', 'satisfied', 'unregistered', 'default-set']),
});
export type WorkspaceRegistryShape = z.infer<typeof workspaceRegistryShape>;

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
 * `ward shell adopt <shell>` (design/0027-shell-adoption/): the offering and
 * the write report in one document, because they are one verb's answer —
 * naming nothing lists what is offered (`offeredOnly: true`, every shorthand
 * carrying its standing and no file rows), naming shorthands writes them and
 * reports what each file's write did. `status` is always the standing AFTER
 * the run, so an agent reads the result rather than the intent.
 */
export const shellAdoptShape = z.strictObject({
  shell: z.string(),
  /** The fish configuration root written into — `--dir`'s path, or the live one. */
  dir: z.string(),
  /** True when the run only listed the offering: nothing was written. */
  offeredOnly: z.boolean(),
  shorthands: z.array(
    z.strictObject({
      name: z.string(),
      summary: z.string(),
      status: z.enum(['available', 'current', 'changed', 'yours', 'unreadable']),
      /** One row per file this shorthand owns; empty when the run only listed. */
      files: z.array(
        z.strictObject({
          /** Relative to `dir` — the files are location-independent by construction. */
          path: z.string(),
          outcome: z.enum(['written', 'unchanged', 'kept', 'replaced']),
        }),
      ),
    }),
  ),
});
export type ShellAdoptShape = z.infer<typeof shellAdoptShape>;

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
  'workspace list': workspaceListShape,
  doctor: doctorShape,
};

/**
 * Read verbs whose argv is NOT derivable from the key alone
 * (design/0024-global-config-registry/): the path verbs take an identity, and
 * their answer depends on the machine's registry rather than the workspace
 * the caller stands in. They are read verbs in every other sense — no
 * mutation, one document on stdout — so they are registered here and proven
 * live in the entry's own suite, the same split the mutation verbs use.
 */
export const pathVerbShapes: Readonly<Record<string, z.ZodType>> = {
  'workspace path': workspacePathShape,
  'repo path': repoPathShape,
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
  'workspace restore': workspaceRestoreShape,
  'workspace upgrade': workspaceUpgradeShape,
  'workspace register': workspaceRegistryShape,
  'workspace unregister': workspaceRegistryShape,
  'workspace default': workspaceRegistryShape,
  'shell adopt': shellAdoptShape,
};

/** The whole `--json` contract: read verbs, the path verbs, then the mutations. */
export const jsonVerbShapes: Readonly<Record<string, z.ZodType>> = {
  ...readVerbShapes,
  ...pathVerbShapes,
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
