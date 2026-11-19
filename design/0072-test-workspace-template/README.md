# 0072 — Tests copy a prepared workspace

> Most tests start from a copy of a workspace built once per test process, rather than running
> creation for every case; the repeated seeded source repository gets the same treatment.
>
> **Status:** built — awaiting review · **Started:** 2026-11-18

The suite's fast batch is bound by the subprocesses it spawns, and the largest single source was the
start of a case: 63 test files called `createWorkspace` before their cases — most of them once per
case — and sixteen ran `ward workspace create` through a spawned CLI. Creation costs six git
processes (`init`, `symbolic-ref`, `rev-parse`, `var`, `add`, `commit`) and the convergence steps
around them, roughly 70–120 ms of a loaded core, and a run of the batch did it 893 times. The second
largest was the "source repository with a remote" a repository test needs: `init --bare`, a seed
clone, a file, a commit, a push, rebuilt in 241 places per run. Neither is what those tests are
about. The workspace a task test starts from is the same workspace every time; creation's own tests
([0002](../0002-store-and-workspace/README.md), [0042](../0042-upgrade-owns-convergence/README.md))
are where creation is proven.

This entry builds each starting point once per test process, from the real code path, and hands each
case its own copy. It changes how tests obtain a workspace and nothing in `src/`.

## Serves intent

- [`workspace-lifecycle`](../../intent/01-concepts/06-workspace-lifecycle.md) — _What creation
  establishes_: a prepared workspace is creation's own output, made by `createWorkspace`, and each
  copy is given what creation gives one workspace and no other — its name from its location, a fresh
  immutable id, its creation time — so a test standing on a copy stands on exactly what the intent
  says a new workspace is.
- [`principles`](../../intent/00-foundation/01-principles.md) — §6, determinism: every copy made
  from one template in one process is identical apart from those three fields, and no copy can see
  another's writes, so a case's result does not depend on which cases ran before it.

## Scope

- **In:**
  - **`preparedWorkspace(path)`** (`test/prepared.ts`): a workspace at `path` as `createWorkspace`
    would leave it — the same files, one commit (`Initialize Ward workspace`), a clean tree — at the
    cost of one git process. The template is built by `createWorkspace` on first use in a process,
    and rebuilt if the process's `GIT_*` environment differs from the one it was built under.
  - **`preparedRemote(path, seed)`**: a bare repository holding one commit of `seed.files` on
    `seed.branch`, HEAD on that branch, at no git process per copy. One template per distinct seed.
  - **The migration.** Every test whose subject is not creation obtains its workspace from
    `preparedWorkspace`, whether it called `createWorkspace` or spawned `ward workspace create` only
    to set up; every per-case or per-file seeded remote whose seed clone was discarded comes from
    `preparedRemote`.
  - **`test/prepared.test.ts`**, pinning what the fixtures promise (Acceptance).
- **Still built for real, and why:**
  - **Creation's own subjects** — `test/workspace/create.test.ts`, `converge.test.ts`,
    `baselines.test.ts` (what a fresh create fingerprints), `lineage.test.ts` (what the installing
    serializer writes), `workspace-id.test.ts` (that each create mints its own id), and in the CLI
    `workspace.test.ts`, `mutation-json.test.ts`'s `workspace create --json` case, and
    `format-guard.test.ts`'s refusal row. Their claim is about what creation does, so a copy would
    prove nothing.
  - **The real-tmux suites** (`test/host/tmux-live.test.ts`, `tmux-nudge-live.test.ts`): each builds
    one workspace per file, so a copy saves almost nothing there, and their harness is reworked
    separately.
  - **Single setups that drive the CLI as their subject or stand outside the pattern** —
    `test/cli/context.test.ts` (a five-verb CLI build-up), `test/cli/external.test.ts` (creation
    under a caller-chosen environment), `test/cli/shell-adopt.test.ts`, and the remotes in
    `close-reachability`, `stale-base`, `context` and `test/cli/external.test.ts`, which rewrite the
    seed's origin, keep the seed clone, or lay out more than files. Each runs once per file.
- **Deferred:**
  - **Richer prepared shapes** (a workspace with a registered repository, a floor, a task, a
    worktree). Safe to defer because each of them records absolute paths — a canonical checkout's
    `origin`, a worktree's `gitdir` — so a copy would need rewriting git state to stop pointing at
    the template, and the bare workspace already removes the shared cost every one of them starts
    from. What a case then does is the case's subject and stays real.
  - **A template shared across processes** (one per run, on disk). Safe to defer: once per file is
    already 63 creates where there were 893, and a cross-process cache needs locking and
    invalidation on every source change.
- **Acceptance:**
  1. `bun test test/prepared.test.ts` — a copy holds the same files as a real create, byte for byte
     once times and the id are blanked; its record names its own directory, has an id no sibling
     has, and was created now; one commit, a clean tree, `git fsck --strict` clean, doctor gives the
     same verdicts as on a real create, none an error; a commit and `gc` in one copy leave a sibling
     untouched; no file in a copy mentions the scratch tree; a non-empty destination is refused; a
     prepared remote is bare, on its branch, holds the seed, and a push to it leaves a sibling where
     it was.
  2. `env -u WARD_AGENT mise run check` passes on macOS and Ubuntu.
  3. The fast batch spawns at least a quarter fewer git processes than before (Mechanisms,
     _Measured_).

## Design

- **Decisions:**
  - **Copy, then give the copy its identity in one amended commit.** The alternative was a template
    per workspace name with no git at all per copy, attractive because a copy would then cost no
    process. It lost because the name is only one of three things creation makes unique: a shared id
    would let two workspaces in one test process collide wherever the id keys state outside the
    record (the external-checkout bindings in `WARD_STATE_DIR`, the multiplexer's stamps), and the
    suite's per-case names (`ws-1`, `ws-2`, …) would defeat a per-name cache anyway. The cost is one
    `git commit --all --amend --reset-author` per copy, about 13 ms, and a second line in the copy's
    reflog.
  - **A real copy, file by file.** Hard links, `clonefile`, or git alternates were the cheaper
    copies. They lost because git rewrites its index and refs in place, and a test that rewrote a
    shared inode — or ran `gc` over shared objects — would reach into another test's workspace. The
    template is compacted first (one pack instead of loose objects, git's inert `*.sample` hooks
    dropped) so the copy moves about fifty files.
  - **In-process, per process.** The template lives in a per-process temporary directory removed at
    exit, beside the hermetic global directories `test/helpers.ts` already makes: parallel workers
    never share one, and nothing outlives a run.
- **Layout:** the fixtures live in `test/prepared.ts`, apart from `test/helpers.ts`, so how a
  workspace is obtained is one module with one test file, and the CLI runner in `helpers.ts` is
  untouched. A test asks with one line: `await preparedWorkspace(join(scratch, 'ws'))` where it
  wrote `await createWorkspace(…)`, and
  `preparedRemote(remote, { branch: 'main', files: {
  'README.md': 'demo\n' } })` where it wrote
  the six-command seed.
- **Mechanisms:**
  - **What makes a copy independent.** Nothing in a fresh workspace records an absolute path: the
    `.git/config` holds none, the record holds none, and every symbolic link (`CLAUDE.md`, the floor
    view's links) is relative — the test asserts no copied file mentions the scratch tree. The
    global directories (`WARD_CONFIG_DIR`, `WARD_STATE_DIR`) are untouched by creation and stay
    whatever the test pointed them at. Each copy has its own id, so nothing keyed by id is shared. A
    bare remote's config holds no path either; copies of one seed share a commit id, which is the
    same content addressed the same way.
  - **Measured** (macOS, 12 cores, with other suites running on the machine). Git processes counted
    by a `git` wrapper on `PATH` appending one line per invocation, over the fast batch
    (`bun test --parallel --timeout=30000`, the live tmux file excluded): **17,948 before, 13,232
    after (−26 %)**; `git init` 1,135 → 195, `clone` 702 → 480, `add` 3,219 → 2,256. Wall and CPU
    from `/usr/bin/time -l` over the same command, runs alternated between a checkout of the base
    and this branch, three pairs: CPU (user + system) **579, 578, 580 s before; 492, 488, 512 s
    after (−15 %)**; wall 75.0, 75.7, 73.6 s before and 70.7, 65.6 s after (−9 %). The machine's
    load average stood between 23 and 32 throughout, so the wall figures are indicative only; the
    third after-run took 147 s and lost one case to the 30 s timeout while a CLI spawn queued behind
    the load, and passed alone afterwards. CPU is the steadier measure, and the one a CI runner,
    with its cores to itself, turns into wall time.
