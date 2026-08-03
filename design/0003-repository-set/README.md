# 0003 — The repository set

> The second entry of the bootstrap arc
> ([`0002-store-and-workspace/`](../0002-store-and-workspace/README.md)): repository registration —
> adopt-or-clone converging on the contained canonical checkout — plus `repo refresh` and the
> repository integrity checks, so a workspace can hold the `ward` repository it will work on.
>
> **Status:** accepted · **Started:** 2026-08-02

Continues under the arc's governing constraint stated in 0002: Ward records and plumbs git; the
human orchestrates. After this entry, the getting-started walkthrough
([`intent/03-walkthrough-getting-started.md`](../../intent/03-walkthrough-getting-started.md)) is
realized end to end — install, doctor, create, register `ward`, doctor again — leaving only the work
spine (`0004`) between the workspace and the bootstrap loop.

## Serves intent

- [`workspace-lifecycle`](../../intent/01-concepts/06-workspace-lifecycle.md) — the repository set's
  lifecycle: registration as a deliberate, local, autonomous act (§18 — nothing crosses outward);
  the record holding identity, remote, and the **main line read from the repository, not assumed**;
  **adopt and clone both possible, both converging on the contained canonical checkout**; the
  checkout inside the workspace but ignored by its git; record↔disk and record↔repository drift as
  doctor's subject.
- [`domain-model`](../../intent/01-concepts/00-domain-model.md) — "Repositories and the main line":
  one canonical checkout per repository, independent of every worktree, never worked in directly,
  the local place any agent reads the current main line.
- [`work-lifecycle`](../../intent/01-concepts/03-work-lifecycle.md) — the refresh toil, on demand
  rather than on cadence (the arc's constraint), including the **dirty-tree fail-safe**: evidence of
  unrecorded work stops a refresh regardless of what the record says.
- [`human-shell`](../../intent/02-subsystems/07-human-shell.md) — the `repo` noun with `add`,
  `refresh`, and `list`; workspace discovery from the working directory.
- [`metadata-store`](../../intent/02-subsystems/00-metadata-store.md) — a second record type
  (repository), one document per repository: one owner per mutable record, and containment expressed
  in the layout.

## Scope

- **In:**
  - The **repository record** — `repositories/<name>.md`, one per registered repository: name,
    remote, main line, when registered. Tracked in the workspace's git; each registration is its own
    commit.
  - **`ward repo add SOURCE [--name NAME]`** — SOURCE is a remote URL (**clone**) or a local
    checkout path (**adopt**: a local `git clone` from it, so objects transfer without re-fetching
    and the human's original checkout is untouched; the new checkout's origin is set to the source's
    own origin when it has one, else the source path). Either way the canonical checkout converges
    at `repos/<name>/`, and the **main line is read from the repository** (`origin/HEAD`, falling
    back to the source's current branch). Re-running converges: an existing matching registration is
    satisfied; a record whose checkout is missing is re-cloned; a conflicting remote is a legible
    error, not an overwrite.
  - **`ward repo refresh [NAME]`** — fetch and fast-forward the canonical checkout(s) to the remote
    main line, on demand. A **dirty checkout is never touched** (the fail-safe, verbatim from
    intent); a diverged (non-fast-forwardable) checkout is reported, not forced. Per-repo outcome:
    refreshed / already current / refused-dirty / failed.
  - **`ward repo list`** — the registered set with remote and main line.
  - **Doctor grows repository integrity**: for each record — checkout present on disk, its origin
    matching the record, the main-line branch existing; each drift reported with the converging
    command.
- **Deferred:**
  - **Repository removal, rename, and remote-moves** — intent's own open question; the bootstrap
    path only adds. _Why safe:_ records are files; removal has an obvious manual escape hatch the
    doctor will name as drift.
  - **Refresh on a cadence and rebase of worktrees** — the toil's other half arrives with worktrees
    (0004); nothing exists yet to rebase. _Why safe:_ refresh-on-demand exercises the same code path
    a cadence would call.
  - **Worktrees branching from the checkout** — 0004.
- **Acceptance:** with local bare repositories as remotes (no network), `bun test` proves:
  1. `ward repo add <url>` clones to `repos/<name>/`, records remote + main line read from the
     repository, and commits the record; re-run is satisfied end to end;
  2. `ward repo add <path>` adopts an existing local checkout without touching it, recording the
     source's own origin;
  3. `ward repo refresh` fast-forwards a stale checkout, reports an already-current one, and
     **refuses a dirty one**;
  4. deleting a checkout makes `ward doctor` report the drift and `ward repo add` re-converge it.

## Design

- **Decisions:** no new ADRs — the store stack (ADR 0005) and shell-out git carry this entry.
  Entry-local:
  - **Records at `repositories/<name>.md`, checkouts at `repos/<name>/`** — the record is tracked
    and visible; the checkout is world, not record, and stays ignored (0002's ignore policy already
    covers it). One document per repository keeps one owner per mutable record and lets the layout
    express the set.
  - **Adopt = local clone, not move.** Moving the human's checkout is destructive to their
    arrangement of their own machine; a local clone transfers objects cheaply (hardlinks), leaves
    theirs untouched, and still converges on the contained checkout intent requires. The record
    notes nothing about adoption — afterward, an adopted repository is indistinguishable from a
    cloned one, which is the convergence promise kept.
  - **Main line detection**: the remote's HEAD first (`git ls-remote --symref origin HEAD` — the
    authoritative answer), then offline fallbacks: the clone's recorded `origin/HEAD`, then a
    current branch. Never assumed, per intent — and the checkout is **landed on the detected main
    line** at registration, whatever branch the clone produced (see the build log for the smoke test
    that forced this shape).
- **Layout:** `src/workspace/repos.ts` (add / refresh / list / record IO) beside the existing
  workspace modules; `src/store/types.ts` grows the repository schema and a per-name `DocumentType`
  constructor; `src/cli/index.ts` grows the `repo` command tree; `src/workspace/doctor.ts` grows the
  repository checks. Tests in `test/workspace/repos.test.ts` and doctor coverage in place, using
  bare repos in temp dirs as remotes.
- **Mechanisms:**
  - _Registration as convergence:_ `repo add` follows 0002's check-then-do shape — record present
    and matching → satisfied; checkout missing → re-established; nothing customized is touched.
  - _Refresh as fail-safe plumbing:_ `fetch` + `merge --ff-only origin/<main>`, gated on a clean
    `status --porcelain`; every outcome is reported per repository.

## Build log

### 2026-08-02 — Repository set built end to end

**Goal.** Everything in Scope in one iteration. **What was done.** Added the repository schema and
per-name `DocumentType` constructor to `src/store/types.ts`; built `src/workspace/repos.ts` (add /
refresh / list, main-line detection, the dirty-tree fail-safe); grew doctor with per-repo integrity
checks (checkout present, origin matches record, main line exists) and the CLI with the `repo` noun
(`add SOURCE [--name]`, `refresh [NAME]`, `list`) plus a shared require-workspace helper. Store fix
that fell out: `writeDocument` now creates the destination's parent directory, and `repositories/`
joined the reserved layout dirs. Tests: `test/workspace/repos.test.ts` — nine cases against **local
bare repositories as remotes** (branch deliberately `trunk`, not `main`, proving the main line is
read rather than assumed), no network.

**What works now — with the commands that prove it** (Bun 1.3.14, git 2.54.0, macOS):

- `bun test` → `31 pass, 0 fail, 81 expect() calls` across 5 files — covering all four acceptance
  scenarios: clone with record commit and satisfied re-run; adopt untouched with the source's own
  origin recorded; refresh fast-forward / already-current / **refused-dirty**; doctor reporting a
  deleted checkout as drift with the converging command, and `repo add` re-converging it.
- Dogfood smoke: in a scratch workspace, `ward repo add ~/wardv2 --name ward` **adopts the real ward
  checkout** — remote `https://github.com/crumley/ward.git`, main line `main`, checkout
  `repos/ward/`; `repo list`, `repo refresh` (current), and `doctor` (all `✓`, healthy) agree.
- `mise run check` → green end to end.

**Decisions** (entry-local, found while building):

- **Main-line detection asks the remote first** (`git ls-remote --symref origin HEAD`), falling back
  offline to the clone's recorded `origin/HEAD`, then a current branch. The first smoke test caught
  the naive version recording the _adopted source's checked-out branch_ (a feature branch) as the
  main line — exactly the "assumed, not read" failure intent warns about; a test now pins the case
  (adopt from a source parked on a feature branch → main line is still the remote's HEAD).
- **The canonical checkout is landed on the main line at registration** whatever branch the clone
  produced, so refresh's fast-forward always operates on the branch the record names.
- **A conflicting re-registration is refused, not overwritten** — same name, different remote is a
  legible error suggesting `--name`, because silently repointing a repository the record already
  claims would be a lost update of the record's meaning.

**Next.** Entry 0004: the work spine — project / task / worktree / session records / status / close.

## Spec-feedback

None this entry. The one candidate — whether "adopt" may leave the human's checkout in place rather
than moving it — is already settled by intent's own wording ("moved in, **or used as a local
source**"), which the local-clone technique realizes.
