# 0042 — Update owns convergence

> `ward workspace create` becomes what its name says — a one-time act on a location that is not yet
> a workspace, refusing one that is — and `ward workspace upgrade` takes over convergence, running
> the establishment steps against the workspace root as its first phase before reconciling the
> installed artifacts through the stewardship vehicle as its second.
>
> **Status:** built — awaiting review · **Started:** 2026-09-06

Two verbs share one job and neither owns it. `ward workspace create PATH`, pointed at a workspace
that already exists, **converges** it: it establishes the standing project
([0018](../0018-standing-workspace-project/README.md)), the ignore policy, the scope directories,
the `CLAUDE.md` symlink ([0017](../0017-claude-md-symlink/README.md)), the baselines
([0020](../0020-deterministic-upgrade/README.md)), and — since
[0041](../0041-ground-floor/README.md) — the ground floor at floor 0, relocating an older one.
`ward workspace upgrade` brings the **installed artifacts** to the current defaults through a
stewardship task and a pull request, and 0020 deliberately left the standing-project and
ignore-policy convergence to `create` so there would be one mechanism rather than two.

The cost lands on the reader. A workspace that is behind gets two different remedies depending on
_which way_ it is behind, and most of them read `re-run ward workspace create` — a verb whose name
says it makes something, aimed at a directory that already exists, with a path argument the human
has to retype correctly. The division shows up inside Ward too: under 0041 the upgrade refuses a
workspace with no ground floor and sends the human to `create`, so the verb whose question is "is
this workspace the generation this CLI expects?" declines to close its own precondition — the
stewardship task has to open on the ground floor, and the ground floor is the other verb's to
establish.

The intent's map of _putting a workspace right_ already draws the line this entry needs: update asks
"is this workspace the generation this CLI expects?", and creation is a deliberate, located act. So
the split is the plain one — **creation is one-time and located; update takes any existing workspace
and makes it fit this release of Ward.** One list of establishment steps, one module, two callers:
`create` runs it on the root it just made, `upgrade` runs it on the root that is already there.

## Serves intent

- [`06-workspace-lifecycle.md`](../../intent/01-concepts/06-workspace-lifecycle.md) — _Putting a
  workspace right: three operations, one map_: the update row's question is the one this entry
  answers in full. Bringing the record's shape forward is part of "aligning the workspace with a new
  Ward", and after this entry the verb that asks the question also owns every part of the answer.
- [`06-workspace-lifecycle.md`](../../intent/01-concepts/06-workspace-lifecycle.md) — _Creation is a
  deliberate act, never implicit_: creation is about a **location**, and this entry makes the verb
  operate only on one that is not yet a workspace. The slice still says re-running creation
  converges; [`spec-feedback.md`](spec-feedback.md) says so rather than assuming.
- [`06-workspace-lifecycle.md`](../../intent/01-concepts/06-workspace-lifecycle.md) —
  _Reconciliation is one task_, and the trigger rule: what triggers adjudication is **a default that
  moved**, not a file that differs. Phase 2 is untouched, so a same-version run still opens no task,
  no branch, and no pull request.
- [`06-workspace-lifecycle.md`](../../intent/01-concepts/06-workspace-lifecycle.md) — _The
  workspace's own main line_: phase 1 writes the **journal** — a project record, ignore lines, scope
  directories, a symlink, a baseline backfill — which lands on the main line directly, as Ward's own
  bookkeeping always has; phase 2 is **stewardship** and keeps travelling as work on a branch. The
  two phases sit on opposite sides of that boundary, and the entry keeps them there.
- [`01-principles.md`](../../intent/00-foundation/01-principles.md) — **§6**: every step is still
  check-then-do and every run still converges; what changes is which verb the human runs to get it.
  **§16**: the remedies name one verb because there is one mechanism, so no surface can describe a
  repair Ward does not perform. **§20**: an upgrade that converged the record and found the
  artifacts current reports the steps it took rather than "nothing to do".

## Scope

- **In:**
  - **`workspace create` refuses an existing workspace.** A path carrying the marker is refused with
    `PATH is already a Ward workspace — bring it to this release with: ward workspace upgrade`. An
    absent path is created; an existing empty directory is accepted; a populated non-workspace
    directory is refused as it always was, with the "point at an existing workspace to converge it"
    half of its message dropped. `CreateReport` keeps its shape and its thirteen steps.
  - **One step list, one module.** `src/workspace/converge.ts` holds the establishment steps and
    exports `convergeWorkspace(root): Promise<ConvergeReport>` — the twelve check-then-do steps and
    their `established | satisfied` outcomes exactly as they were, including 0041's ground-floor
    establish-or-relocate. `create.ts` keeps only the root step, the one act no other verb can
    perform. Neither caller carries a copy of any step.
  - **The upgrade has two phases.** Phase 1 is `convergeWorkspace(root)` against the workspace root,
    directly, as one journal commit under the store lock, before any vehicle exists. Phase 2 is
    today's artifact reconciliation unchanged: probe; if no default moved, `vehicle: none`,
    `outcome: current`; otherwise derive the task and worktree, upgrade in the copy, publish, and
    name the remaining acts. Both the caller-named path (`ward workspace upgrade TASK`, a declared
    agent's only form) and the bare self-service path run both phases.
  - **Report and JSON.** `UpgradeReport` gains `converged: StepReport[]`, additive and always
    present, carried into `workspace upgrade --json` and `ward schema workspace upgrade`. The human
    rendering prints the converge steps first in create's step style, then the artifact rows; a run
    that converged something and found the artifacts current says so instead of "nothing to
    upgrade".
  - **Every remedy for a workspace that already exists names `ward workspace upgrade`** — the ignore
    lines, the untracked workspace, the missing baseline record, a missing installed artifact, a
    missing record document, the unrecorded main-line name, 0041's no-ground-floor and relocation
    findings, and `requireGroundFloor` in `projects.ts`. They lose their `ROOT` argument with it:
    the update verb runs inside the workspace, so the string is the same in every workspace. The two
    remedies for **no workspace at all** (`src/cli/index.ts`, `src/global/registry.ts`) keep
    `ward workspace create PATH` — that is creation's case.
  - **Tests**: `test/workspace/converge.test.ts` (phase 1 on a workspace shaped like a live one, the
    second run, the interrupted create, the vehicle derivation after a converge) and
    `test/cli/converge.test.ts` (the refusal's exit code and empty stdout, the JSON, the rendering,
    the rewritten doctor remedies); the create suite gains the refusal, the two accepted locations,
    and the interrupted-run case; every test that used a second `createWorkspace` as the converge
    idiom now calls `convergeWorkspace` or the CLI's `upgrade`.
- **Deferred:**
  - **A `ward workspace converge` verb of its own.** _Why safe:_ phase 1 is reachable through
    `upgrade`, which every remedy now names, and nothing needs it separately — a human who wants
    only the record converged runs the update and gets `vehicle: none` when no default moved. One
    caller is not served perfectly: a declared agent on a workspace with no ground floor cannot open
    the task that `ward workspace upgrade TASK` requires, so it reaches phase 1 by naming the task
    it is about to open (phase 1 runs before the task is resolved), then opens it and re-runs. That
    is two commands rather than one, deterministic, and the shape is one release old.
  - **Moving the artifact reconciliation out of the vehicle.** _Why safe:_ the vehicle is what makes
    an artifact change previewable and the human's gated merge the landing act
    ([0019](../0019-stewardship-worktrees/README.md)); phase 2 changes content the human may have
    customized, which is exactly the change that must be read before it lands. Phase 1 does not need
    the vehicle for the opposite reason — it writes the record's own bookkeeping — and the two
    phases sitting on opposite sides of that line is the point, not a temporary arrangement.
  - **The version stamp in `workspace.md` following the upgrading Ward.** _Why safe:_ the field
    records the version that **created** the workspace, by intent, and phase 2 already advances the
    stamp it owns. Nothing rots: the record still says which Ward made this workspace, and doctor
    still names skew from the stamp phase 2 maintains.
  - **Pruning `create`'s `--json` step shape.** _Why safe:_ the create report's steps are now the
    root step plus the converge steps, and a consumer that wants only the converge half can read the
    upgrade's `converged` array instead. Splitting the create document would be a breaking change to
    a registered shape for no reader that exists.
- **Acceptance:**
  1. `mise run check` green.
  2. `bun test test/workspace/create.test.ts` — a fresh create establishes thirteen steps and
     commits once; `create` on a path that is already a workspace is refused naming
     `ward workspace upgrade`, writes nothing and commits nothing; `create` succeeds on an absent
     path and on an existing empty directory; a run interrupted after the marker is finished by
     `convergeWorkspace`, which establishes the remaining twelve steps in one commit.
  3. `bun test test/workspace/converge.test.ts` — on a fixture shaped like the live bootstrap
     workspace (floors 1–5, no standing project, artifacts current) `ward workspace upgrade`
     establishes floor 0, commits once, reports the step in `converged` and `outcome: current` with
     `vehicle: none`; a second run is `satisfied` throughout and commits nothing; on a fixture whose
     artifacts are behind it converges first and then derives the vehicle, with the steward task at
     `f0tN`.
  4. `bun test test/cli/converge.test.ts` — the refusal is exit 1 with empty stdout; the `--json`
     document validates under the registered shape and carries `converged`; the human rendering
     prints the converge steps before the artifact rows; every rewritten doctor remedy names
     `ward workspace upgrade` and no doctor finding about an existing workspace names
     `ward workspace create`.
  5. `bun test test/workspace/ground-floor.test.ts test/cli/ground-floor.test.ts` — 0041's converge
     and refusal cases hold with the update remedy.
  6. In a throwaway workspace: `ward workspace create /tmp/ws` succeeds and a second run of the same
     command is refused; `ward workspace upgrade` inside it prints twelve satisfied steps and
     `nothing to upgrade`; with `projects/0-workspace/` removed, `ward task open a-thing` refuses
     with `ward workspace upgrade`, and running that verb re-establishes the floor and lets the open
     succeed.

## Design

- **Decisions:** no new ADRs. Entry-local:
  - **Refuse an existing workspace rather than keep converging under `create`.** Keeping the
    convergence in `create` and merely _also_ offering it from `upgrade` was the additive option: no
    caller breaks, no message changes, and "did I already init this?" keeps its answer. It lost
    because the ambiguity is the defect. Two verbs that both converge means every surface must
    choose which one to name, and the surfaces chose differently — most doctor remedies said
    `create`, the main-line finding said both, and 0041's upgrade sent the human to `create` for a
    precondition it needed itself. A verb that owns a job is one whose name can be written in every
    remedy without qualification. The refusal also keeps the intent's safety property, by a
    different route: the question "did I already init this?" is still safe, because the answer is a
    refusal that names the right verb rather than a clobber. The cost is a message change for anyone
    who typed `create` twice on purpose, paid once, with the replacement command in the refusal.
  - **Phase 1 writes directly, not through the vehicle.** Running the whole upgrade in the
    stewardship worktree would have been uniform: one commit, one branch, one preview, one gated
    merge for everything. It cannot work, and the reason is structural rather than aesthetic — the
    stewardship task itself must open **on the ground floor**
    ([0041](../0041-ground-floor/README.md)), so a workspace with no ground floor cannot manufacture
    the vehicle that would establish it. That is the deadlock 0041 papered over by refusing and
    pointing at `create`. Beyond the deadlock the split is the right one anyway: phase 1's writes
    are record and bookkeeping writes — the kind every mutation verb commits to the main line
    directly — while phase 2 changes installed content the human may have made their own, which is
    what the preview and the gated merge exist for. The cost is that an upgrade can advance the main
    line before the human reviews anything; it is the same cost `ward task open` and `ward repo add`
    already carry, and the same convergent steps, so a converge that was going to happen anyway
    happens under the verb that admits it.
  - **One module, not two callers with copies.** Leaving the steps in `create.ts` and having
    `upgrade` import `createWorkspace` would have been the smallest diff. It lost on what the
    imported function would then be: creation, called on something that is not being created, with a
    root step that must be skipped and a refusal that must not fire. The steps are convergence, so
    they live in a module named for what they do, and creation becomes the thin verb it should be —
    one step of its own, then the shared list. A module boundary drawn at the job rather than at the
    first caller is also what makes the second caller cheap: `upgrade` gains phase 1 as a single
    call. The cost is a file move and a rename ripple through the tests that imported `StepReport`.
  - **Rewrite the remedies rather than alias `create` to `converge`.** An alias —
    `ward workspace
    converge` as a second spelling for the existing behavior — would have left
    every message working. It lost because it adds a third name for a job that already had two too
    many, and because the remedies would still have to choose which spelling to print. Rewriting
    them means the strings shrink: they lose the `ROOT` argument, since the update verb runs inside
    the workspace it updates, so `requireGroundFloor`'s refusal and doctor's finding are now
    literally the same sentence — one remedy in two places, which is what 0041 wanted and could only
    approximate while the remedy carried a per-workspace path. The cost is that the messages changed
    in one release; they were already changing under 0041, and no recorded state names them.
- **Boundaries:** `converge.ts` owns the establishment steps, their context (the paths this run
  established, the artifacts it installed), the store lock they run under, and the single journal
  commit that carries them. It is the one home for the question "what shape must a workspace have to
  be this release's?" — asked by `create.ts`, which owns only the location step and the refusal, and
  by `upgrade.ts`, which owns the two-phase order and the vehicle. `upgrade.ts` splits internally
  along the same line: `convergeWorkspace` is called once per public entry point, and the artifact
  pass becomes an internal function both entry points share, so the composable primitive and the
  self-service path cannot converge twice or drift apart. **Relationship to the entries this
  changes:** [0002](../0002-store-and-workspace/README.md) is not superseded as a whole — the store,
  the check-then-do steps, and the establishment list are all still exactly its design; the one
  affordance replaced is **`create` converging on re-run**, here.
  [0020](../0020-deterministic-upgrade/README.md) is not superseded either — its lineage,
  classification, baseline backfill, and stewardship vehicle stand unchanged; what it deferred is
  taken up: the standing-project and ignore-policy convergence it left to `create` now runs as the
  upgrade's phase 1.
- **Mechanisms:** `convergeWorkspace(root)` takes the store lock first and establishes the marker
  inside it — the lock file lives under the marker directory and creates its own staging directory,
  so a root with no `.ward/` is a legal starting point and the lock is held across every store
  write. The steps, their outcomes, and the single commit that stages only what this run established
  are 0002's and 0041's, moved rather than rewritten. `createWorkspace(path)` resolves the path,
  runs its root step — absent, empty, already a workspace, or populated — and concatenates the
  converge report's steps onto its own, which is what keeps `CreateReport` the shape the registered
  JSON schema already describes. In `upgrade.ts` both entry points call `convergeWorkspace` before
  anything else: the caller-named path converges before it even resolves the task, so the ground
  floor exists before the task that needs it is looked for, and the self-service path converges
  before the read-only probe, so a record field phase 1 backfills is never counted as artifact work
  the vehicle would have to carry.
