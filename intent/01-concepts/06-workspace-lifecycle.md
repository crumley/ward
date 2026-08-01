# Workspace Lifecycle

> **Layer:** intent · concept. The what & why; the _how_ is planned in
> [`../../design/`](../../design/). **Status:** living.

Every other level of the hierarchy has an arc this tree describes: sessions open and close
([`02-sessions-and-lifecycle.md`](02-sessions-and-lifecycle.md)), tasks run from creation to a
delivered or abandoned close ([`03-work-lifecycle.md`](03-work-lifecycle.md)), rooms are occupied
and freed, anchors are set up and torn down ([`00-domain-model.md`](00-domain-model.md)). This file
gives the **workspace** — the root that contains all of it — the same treatment: how one comes into
existence, what it holds when it is new, how its repository set is populated, what it depends on
outside itself, what "healthy" means for it, and what happens to it as Ward changes underneath.

**Why this needs its own slice:** the workspace's arc was previously stated only as subordinate
clauses in slices about other topics — the workflow policy "injected at creation"
([`03-work-lifecycle.md`](03-work-lifecycle.md)), the persona cast "picked when the workspace is
created" ([`01-scopes-and-personas.md`](01-scopes-and-personas.md)), the version stamp recorded by
"whichever version created it" ([`04-reflection-and-evolution.md`](04-reflection-and-evolution.md)).
Each is correct; together they are not a lifecycle, and nothing could link to one. An idea with no
home is an idea nothing checks (`../README.md`, one home per idea).

## Creation is a deliberate act, never implicit

A workspace comes into existence because a human **asks for one at a location**. It is never created
as a side effect of running a command somewhere that lacks one.

**Why:** Ward discovers the workspace by looking outward from the working directory
([`../02-subsystems/07-human-shell.md`](../02-subsystems/07-human-shell.md), workspace-awareness),
so an accidentally-created workspace silently captures every command run beneath it — and the
workspace is identified by its location ([`00-domain-model.md`](00-domain-model.md), Identity),
which makes a misplaced root expensive to correct later. Creation is cheap; guessing at it is not.

### What creation establishes

A new workspace is not an empty directory. Creation puts in place everything a cold-start reader —
human or agent — needs for the workspace to be **self-sufficient** from its first moment
([`../00-foundation/01-principles.md`](../00-foundation/01-principles.md) §3):

- **The metadata root** — where recorded state lives
  ([`../02-subsystems/00-metadata-store.md`](../02-subsystems/00-metadata-store.md)), including the
  registered artifact-type catalog Ward seeds. _Why:_ every later operation writes here; nothing is
  discoverable until the record has a home.
- **The version stamp** — which version of Ward created it
  ([`04-reflection-and-evolution.md`](04-reflection-and-evolution.md)). _Why:_ a workspace created
  without a stamp is one no future CLI can safely reason about (_Version skew_, below).
- **Ward's opinionated defaults, as workspace-owned artifacts** — the workflow policy
  ([`03-work-lifecycle.md`](03-work-lifecycle.md)), the lifecycle hooks, the persona cast the human
  picks or accepts ([`01-scopes-and-personas.md`](01-scopes-and-personas.md)), and the root
  `AGENTS.md` that makes context loadable at the workspace level
  ([`05-context-loading.md`](05-context-loading.md)). _Why:_ these are the "opinionated default →
  workspace-owned artifact → reconciled on upgrade" pattern
  ([`03-work-lifecycle.md`](03-work-lifecycle.md)) at its first step; a workspace is productive
  immediately and free to diverge afterwards.
- **Version control over itself** — the workspace is tracked as a git repository
  ([`../00-foundation/01-principles.md`](../00-foundation/01-principles.md) §15) from creation, with
  the ignore policy in place. _Why:_ the first thing worth rolling back is a bad migration (_Version
  skew_, below); a workspace that becomes tracked only later has an untracked origin no rollback can
  reach.
- **Its repository set** — possibly empty (_The repository set_, below).

**Re-running creation on an existing workspace converges; it does not clobber.** Creation is a
lifecycle operation and inherits idempotency
([`../00-foundation/01-principles.md`](../00-foundation/01-principles.md) §6): asked to create a
workspace where one already exists, Ward validates what is present, adds what is missing, and leaves
diverged artifacts alone — which is precisely the update path
([`04-reflection-and-evolution.md`](04-reflection-and-evolution.md)), not a second mechanism.
**Why:** "did I already init this?" must never be a dangerous question.

### What a workspace never holds

**Credentials and secrets are not workspace state.** Ward _uses_ the machine's git and forge
credentials; it does not record, copy, or manage them. **Why:** the workspace is git-tracked (§15)
and its whole content is a candidate for the record a human might one day push or share, while §4
makes local, personal context something that crosses outward only by deliberate translation — a
stored token is the one piece of local state whose leak is unrecoverable. Authentication is
therefore a **machine precondition** (below), reported by `doctor`, never a thing `init` sets up.

## The repository set

A workspace knows a set of repositories it works in ([`00-domain-model.md`](00-domain-model.md),
Repositories). Populating that set is part of the workspace's arc, not a detail of task execution.

- **A repository joins by a deliberate act, and the workspace records enough to resolve it** — its
  identity within the workspace, its remote, the **name of its main line**, and the location of the
  canonical checkout that tracks it. _Why:_ the toil branches new worktrees from that checkout and
  refreshes it on a cadence ([`03-work-lifecycle.md`](03-work-lifecycle.md)); all of that is
  unreachable if the record cannot say where the checkout is and what it tracks.
- **The main line is recorded from the repository, not assumed.** _Why:_ repositories disagree about
  their default branch, and every downstream rule — never merge to main, branch from current, rebase
  onto the refreshed line — names a branch the workspace must have gotten right.
- **Both adoption and cloning must be possible.** A human with an existing checkout registers it; a
  human without one has Ward clone it. _Why:_ the prime directive rejects make-work — forcing a
  re-clone of a repository already on disk spends the human's time to satisfy the tool's convenience
  ([`../00-foundation/00-vision.md`](../00-foundation/00-vision.md)).
- **Registration is local and reversible, so it is autonomous** (§18). Fetching a repository reads
  from the remote; nothing crosses the boundary outward, so no authority is required.

## Preconditions: self-sufficiency is about the record, not the machine

**§3 promises that everything needed to _understand and resume_ the work lives in the workspace. It
does not promise the workspace runs anywhere.** A workspace depends on tools it does not contain —
git, an agent harness, the multiplexer, network access to its remotes and forge, and the credentials
above. Restored onto a bare machine, its record is intact and it still cannot do anything.

Drawing this line is what gives the **`doctor` command**
([`../02-subsystems/07-human-shell.md`](../02-subsystems/07-human-shell.md)) something to be
_about_: the record is Ward's responsibility, the environment is the machine's, and doctor is the
seam where the second is checked against what the first needs. Preconditions come in two kinds —
**required** (without which Ward cannot operate) and **optional** (capabilities Ward takes advantage
of when present, and works without otherwise). _Why keep optional ones real:_ that is how Ward stays
opinionated without being brittle (§19 — a contract may be satisfied by more than one technique).

**What may live outside the workspace.** Ward carries global, machine-level configuration alongside
workspace-local configuration
([`../02-subsystems/07-human-shell.md`](../02-subsystems/07-human-shell.md)). The durable boundary:
**global state may hold preferences and conveniences only — never anything the understanding or
resumption of work depends on.** _Why:_ the moment recovery needs a fact that lives outside the
workspace, §3 is false and a restored or relocated workspace is silently incomplete.

## Workspace integrity: what can drift, and what Ward may do about it

A workspace's record describes a world — anchors on disk, runs inside a harness, branches in
repositories — and that world can move without the record moving with it. **Integrity is the
agreement between the record and the world**, and it is what a health check checks. The durable
statement is the **classes of drift**, not a catalog of checks — the catalog will grow, exactly as
the maintenance toil's does ([`03-work-lifecycle.md`](03-work-lifecycle.md)):

- **Record ↔ disk** — an anchor the record knows that is no longer there, or a worktree on disk that
  no record claims.
- **Record ↔ harness** — a session whose harness handle no longer resolves
  ([`02-sessions-and-lifecycle.md`](02-sessions-and-lifecycle.md)), so it can never be resumed.
- **Record ↔ repository** — a registered repository whose remote moved or whose main line was
  renamed.
- **Record ↔ Ward** — version skew between the CLI and the workspace (below).
- **Machine preconditions** — a required tool missing, an optional one newly available, credentials
  expired.

**The repair posture follows the existing rules rather than inventing one:** report everything
found, repair autonomously only what is **local and reversible**, and route anything outward-facing
or destructive to the human as a gated action (§18) surfaced through "what needs me?"
([`../02-subsystems/07-human-shell.md`](../02-subsystems/07-human-shell.md)). **Why not auto-repair
everything:** several drifts are ambiguous in the direction that matters — an untracked worktree is
either garbage or the human's unrecorded work, and §17 makes guessing wrong a silent loss. Reporting
is always safe; repairing is not.

## Version skew: what a mismatched CLI may do

The **version stamp**, and **update vs. migrate** with its reconciliation path, belong to
[`04-reflection-and-evolution.md`](04-reflection-and-evolution.md). What this slice owns is
**behavior on mismatch** — what Ward does when the CLI in hand and the workspace in front of it are
not the same generation:

- **Newer CLI, older workspace.** Reads proceed, with the skew **surfaced**; **structural writes do
  not proceed** until the workspace is updated or migrated. _Why:_ a CLI writing records in a shape
  the workspace's schema does not describe is silent corruption of the source of truth (§16, §17) —
  and inspection is exactly what a human needs in order to decide about the upgrade.
- **Older CLI, newer workspace.** Structural writes are **refused**. _Why:_ an older CLI can neither
  write the newer shape correctly nor migrate forward out of the situation, and there is no version
  of "try anyway" that fails loudly enough to be safe.
- **Skew is surfaced, not nagged.** It is a recorded request for the human's attention — one item in
  "what needs me?" ([`../02-subsystems/07-human-shell.md`](../02-subsystems/07-human-shell.md)) —
  presented to a human caller and delivered to a declared **agent** caller as a deterministic result
  it can act on, never as prose in output the agent must parse around (§8).
- **Migration is gated, and rides version control.** Transforming the structure of the record is
  outward of nothing but irreversible in practice, so it takes the human's explicit authority (§18),
  and it lands as its own commit in the workspace's own history (§15) so it can be rolled back.
  _Why:_ "the risky path is rare and explicit"
  ([`04-reflection-and-evolution.md`](04-reflection-and-evolution.md)) means little unless the rare
  path is also recoverable.

## Putting a workspace right: three operations, one map

Three operations converge a workspace toward good order. They overlap enough to be confused, so the
division of labor is stated here once:

| Operation               | Asks                                                                              | Owns                                                                                                                  |
| ----------------------- | --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| **Attach** (cold start) | "Which threads were in flight, and are they back?"                                | Re-establishing live work from the record ([`02-sessions-and-lifecycle.md`](02-sessions-and-lifecycle.md), Recovery). |
| **Doctor**              | "Can this machine run this workspace, and does the record still match the world?" | Preconditions and integrity (above).                                                                                  |
| **Update / migrate**    | "Is this workspace the generation this CLI expects?"                              | Aligning the workspace with a new Ward ([`04-reflection-and-evolution.md`](04-reflection-and-evolution.md)).          |

**Why three and not one:** they run at different moments, on different evidence, with different
risk. Attach runs after every reboot and touches live state; doctor is safe to run at any time and
changes little; migration is rare and gated. Collapsing them would drag the riskiest into the most
frequent. They compose in one direction: **doctor diagnoses and recommends the other two; attach
assumes the environment is already sound.** An attach that fails on a missing tool has found a
doctor's finding the hard way — which is itself the signal a recovery reflection reads
([`04-reflection-and-evolution.md`](04-reflection-and-evolution.md)).

## A workspace is not closed

Unlike every level inside it, a workspace has **no terminal state**. It is not completed, closed, or
archived by Ward; it persists, and its history persists with it. **Why:** the workspace is the frame
the record is kept in, and the record is meant to be read long after the work is done — floor
numbers are retired but never reused for exactly this reason
([`00-domain-model.md`](00-domain-model.md), Identity). A human may of course delete the directory;
that is an act on files, not a lifecycle Ward models. **Why say so explicitly:** every other noun
here closes, so silence would read as an omission rather than a decision.

## Canonical home for

- **Workspace creation** — that it is a deliberate, located act; **what creation establishes** (the
  metadata root, the version stamp, Ward's defaults as workspace-owned artifacts, version control
  over itself, the repository set); that re-running it **converges** rather than clobbers; and that
  **credentials are never workspace state**.
- **The repository set's lifecycle** — deliberate registration recording remote, main line, and
  canonical checkout; the main line read from the repository rather than assumed; adopt-or-clone;
  registration as a local, autonomous act.
- **Preconditions** — that §3's self-sufficiency is about the **record, not the machine**; the
  required/optional split that gives `doctor` its subject; and the **global-state boundary**
  (preferences only; nothing resumption depends on).
- **Workspace integrity** — the classes of drift between record and world, and the **repair
  posture** (report all, repair only the local and reversible, gate the rest).
- **Version-skew behavior** — newer-CLI/older-workspace, older-CLI/newer-workspace, skew as a "what
  needs me?" item rather than a nag, and migration as a gated act that rides version control. (The
  stamp itself, and update vs. migrate, remain
  [`04-reflection-and-evolution.md`](04-reflection-and-evolution.md)'s.)
- **The attach / doctor / update map** — what each owns and how they compose.
- **That a workspace has no terminal state.**

## Left to implementation

- The command names and their surface
  ([`../02-subsystems/07-human-shell.md`](../02-subsystems/07-human-shell.md) owns the noun/verb
  shape); the on-disk layout a creation produces; the concrete precondition and integrity check sets
  and how each is probed; how the canonical checkout's location is chosen; the form of the global
  configuration; how a structural write is recognized in order to be blocked under skew. Planned in
  [`design/`](../../design/).

## Open questions

- **Repository removal, rename, and remote-moves.** What it means to remove a repository that live
  tasks reference, and how a moved remote or renamed main line is reconciled. Deferred: the
  bootstrap path only adds.
- **More than one workspace on a machine.** Whether that is expected, and whether Ward may keep a
  machine-level registry of workspaces — which would be state outside the workspace and must be
  reconciled with the global-state boundary above.
- **What runs the cadence.** Refresh, rebase, and cadence reflection are specified as recurring
  ([`03-work-lifecycle.md`](03-work-lifecycle.md),
  [`04-reflection-and-evolution.md`](04-reflection-and-evolution.md)) but nothing states what fires
  them when no session is attached — a resident background process, or opportunistic work on CLI
  invocation. It bears on this slice because "what is running while I am away?" is a
  workspace-scoped question, and on the store's no-resident-process constraint
  ([`../02-subsystems/00-metadata-store.md`](../02-subsystems/00-metadata-store.md)).
- **Where versioning belongs.** The stamp and update/migrate currently live with reflection
  ([`04-reflection-and-evolution.md`](04-reflection-and-evolution.md)) while skew behavior lives
  here; whether they should re-home together is an instance of the tracked intent-file-granularity
  question ([`../00-foundation/open-questions.md`](../00-foundation/open-questions.md)).
- **Improvements bound for Ward itself.** Reflection may propose improvements that belong upstream
  in the Ward CLI ([`04-reflection-and-evolution.md`](04-reflection-and-evolution.md)); carrying one
  out of the workspace is a crossing of the local↔remote boundary (§4) that nothing currently
  governs.
