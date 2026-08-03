# 0002 — Metadata store & workspace creation

> The first Ward-behavior entry: a minimal realization of the metadata store (markdown + typed,
> validated front matter) and the first real verbs — `workspace create` and a lite `doctor` — so a
> workspace can exist, converge, and report its own health.
>
> **Status:** proposed · **Started:** 2026-08-02

This is the first of three entries that together reach the **bootstrap loop**: a workspace that
contains the `ward` repository and in which the next Ward iteration is delivered as a Ward task —
the arc of
[`intent/03-walkthrough-getting-started.md`](../../intent/03-walkthrough-getting-started.md) and
[`intent/04-walkthrough-delivering-work.md`](../../intent/04-walkthrough-delivering-work.md). This
entry is the store and the workspace's own arc; `0003` is the repository set (adopt-or-clone, the
contained canonical checkout); `0004` is the work spine (project / task / worktree / session /
status / close). Each entry ends in a working state.

**The governing constraint for the whole arc** — the deliberate scope reduction that makes it
buildable now: **Ward is a record-keeper and git plumber; the human is the only orchestrator.** Ward
starts, watches, resumes, and messages no agents. The human runs their harness by hand in the
directories Ward manages, and Ward records what exists and derives what is in flight. The intent
already licenses this shape: levels are elided, not faked
([`intent/01-concepts/00-domain-model.md`](../../intent/01-concepts/00-domain-model.md)), and the
delivering-work walkthrough runs on exactly this minimal cast.

## Serves intent

- [`workspace-lifecycle`](../../intent/01-concepts/06-workspace-lifecycle.md) — the core of this
  entry: creation as a deliberate, located act; what creation establishes (metadata root, version
  stamp, root `AGENTS.md`, version control over itself, the — here empty — repository set);
  re-running creation **converges**; credentials are never workspace state; doctor's subject
  (machine preconditions vs. record↔world integrity) and its report-only repair posture.
- [`metadata-store`](../../intent/02-subsystems/00-metadata-store.md) — the store contract this
  entry realizes minimally: a filesystem of markdown documents with typed, runtime-validated front
  matter; deterministic reads; atomic writes; no resident process; the two-tier document rule
  (Ward-owned records built here; the open artifact tier only seeded as a catalog).
- [`human-shell`](../../intent/02-subsystems/07-human-shell.md) — the noun/verb tree grows its first
  real verbs (`workspace create`, `doctor`); workspace discovery by walking up from the working
  directory; doctor works outside a workspace (machine checks only).
- [`principles`](../../intent/00-foundation/01-principles.md) §3 (self-sufficient record), §6
  (idempotent creation), §15 (the workspace tracks itself in git), §16 (recorded state is truth).
- [`context-loading`](../../intent/01-concepts/05-context-loading.md) — creation installs a root
  `AGENTS.md` so an agent started at the root knows how to operate (minimal here; it grows with the
  verbs that exist to describe).

## Scope

- **In:**
  - A **store module**: read/write of typed markdown documents (YAML front matter + body), each type
    with a runtime-validated schema; atomic writes (write-temp + rename); a legible error when a
    document fails validation. Document types built now: the **workspace record** (identity +
    version stamp) and the **artifact-type catalog** (seeded with `brief`, `decision`, `note` as
    registered types — no artifact commands yet).
  - **`ward workspace create <path>`** — establishes the metadata root and layout, the version stamp
    (from `package.json`), the root `AGENTS.md`, the `.gitignore` policy (checkouts and worktrees
    ignored, records tracked), and git tracking with a first commit. **Re-run converges:** every
    establishment step is check-then-do, so create-on-existing validates, adds what is missing,
    touches nothing customized, and reports per step.
  - **`ward doctor`** — outside a workspace: machine preconditions only (required: `git`; optional:
    `gh`). Inside: the same, plus integrity — every record parses and validates, the layout agrees
    with the record, and the stamp vs. the CLI version is **reported** (never enforced).
    Report-only; no repair.
  - **Workspace discovery** — any workspace-needing verb finds the root by walking up from the
    working directory to the workspace marker; no flag, no prompt.
- **Deferred:**
  - **Repository registration and the work spine** — entries `0003` and `0004` (this entry's layout
    reserves their directories and ignore rules so they land without migration).
  - **The artifact tier beyond the seeded catalog** (artifact CRUD, provenance, briefs). _Why safe:_
    nothing in this entry produces artifacts; seeding the catalog keeps creation's established-set
    honest without building unread machinery.
  - **Installed defaults beyond `AGENTS.md`** — the workflow policy, lifecycle hooks, persona cast,
    and workspace skill. _Why safe:_ those artifacts exist to guide agents Ward starts and to be
    reconciled on upgrade; under this arc's constraint no agent is started by Ward and only one Ward
    version exists, so installing rich defaults now creates divergence debt with no reader.
  - **Upgrade, reconciliation, and migration** — only the stamp is written, so skew is _detectable_
    later. _Why safe:_ one version exists; the getting-started walkthrough makes the same cut
    explicitly.
  - **Interactive resolution, `--json`, telemetry, guided setup, global config** — the human-shell
    quality bar beyond clear errors. _Why safe:_ contract capabilities, not record semantics;
    nothing recorded now constrains them.
  - **Personas, rooms, sessions, messaging, multiplexer, theming, model selection, reflection,
    recovery** — the orchestration Ward will grow into. _Why safe:_ the governing constraint above;
    all are elidable by intent, and the record types built here don't preclude them.
- **Acceptance:** from a cold checkout, `mise run check` is green, and:
  1. `ward workspace create <path>` on an empty location produces a workspace whose records
     validate, with a root `AGENTS.md`, the ignore policy, and a first git commit;
  2. re-running the same command exits 0, changes nothing (`git status` clean), and reports each
     step as already satisfied;
  3. `ward doctor` outside any workspace reports machine checks and no integrity section; inside the
     new workspace it reports healthy; with a record deliberately corrupted (bad front matter) it
     reports the failing document and exits non-zero. All three are proven by `bun test` integration
     tests running the built CLI in temp directories.

## Design

- **Decisions:**
  - **ADR 0005 (to be written when this entry starts building): the store realization stack** — one
    consolidated ADR per the repo's grouping preference: YAML front matter + markdown body; the
    schema-validation library (candidate: zod); git operations by shelling out to the system `git`
    (no library); atomic write via temp-file + rename. The ADR records the candidates considered and
    why each choice fits the store contract's "sized to its real load" clause.
  - **Entry-local — the on-disk layout** (the store contract's "left to implementation"):

    ```
    <workspace>/
      .git/
      .gitignore        # ignores repos/, worktrees/, workdirs/
      .ward/            # workspace marker + store internals (temp files; locks when 0004 needs them)
      workspace.md      # workspace record: identity + version stamp
      catalog.md        # artifact-type catalog, seeded
      AGENTS.md         # root guidance (yours-tier; a starting point)
      repos/            # 0003: contained canonical checkouts — ignored
      worktrees/        # 0004: task worktrees — ignored
      projects/         # 0004: project/task records — tracked
    ```

    Records live in the visible tree because the store must be legible to a human browsing it; the
    hidden `.ward/` holds only the marker and mechanics no human reads.
  - **Entry-local — which build operates the workspace** (the question
    [`intent/03-walkthrough-getting-started.md`](../../intent/03-walkthrough-getting-started.md)
    leaves to design): the **linked dev build** (`mise run link`) operates the workspace; a
    worktree's build is exercised only by its own tests until merged, after which refresh + relink
    promotes it. _Why:_ simple, honest about what is released, and consistent with
    no-repository-is-special.
- **Layout:** `src/store/` (document types, schemas, read/validate/write, atomic write),
  `src/workspace/` (creation steps, discovery walk-up, doctor checks), `src/cli/` grows the
  noun/verb tree (optique subcommands) as thin plumbing over those modules — the human-shell
  contract's "all real logic lives below the shell." Tests mirror: `test/store/`, `test/workspace/`,
  `test/cli/` (integration tests spawn the CLI with `NO_COLOR=1` in temp directories — the 0001
  lesson).
- **Mechanisms:**
  - _Documents:_ one `DocumentType<T>` definition per record — schema, path convention,
    serialization — so adding 0003/0004's types is additive.
  - _Creation as convergence:_ creation is a list of idempotent establishment steps, each
    `check() → satisfied | establish()`; running the list is both create and update, which is what
    makes re-run convergence structural rather than tested-in.
  - _Doctor as a read-only pipeline:_ each check returns `ok | finding`; the machine checks run
    everywhere, the integrity checks only inside a workspace; exit code reflects findings.

## Build log

No iterations yet — the log opens when this entry moves to in-progress.

## Spec-feedback

None this entry (scoping stage). Expected surface once building: the store contract's per-type
front-matter fields and the workspace record's minimum field set, neither of which intent pins
today.
