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
- **The version stamp** — which version of Ward created it (_How a workspace evolves_, below).
  _Why:_ a workspace created without a stamp is one no future CLI can safely reason about (_Version
  skew_, below).
- **The guidance an agent needs to work here** — the root `AGENTS.md`
  ([`05-context-loading.md`](05-context-loading.md)) and a Ward-provided **skill for working in a
  Ward workspace**: how the hierarchy is addressed, how work is started and closed, which actions
  are gated. _Why:_ §3 asks that an agent arriving cold can understand and resume the work from what
  is recorded — and the record alone cannot deliver that, because it states what is _true_, not how
  to _act_ on it. An agent left to infer Ward's operating rules from the shape of the directory
  infers them differently every time, which is determinism (§6) and the agent audience (§8) both
  lost. Shipping the instructions alongside the record is what makes "start an agent at the root and
  it knows how to work here" true rather than hoped for. Both are **harness-neutral** (§5).
- **Ward's opinionated defaults, as workspace-owned artifacts** — the workflow policy
  ([`03-work-lifecycle.md`](03-work-lifecycle.md)), the lifecycle hooks, and the persona cast the
  human picks or accepts ([`01-scopes-and-personas.md`](01-scopes-and-personas.md)). _Why:_ a
  workspace is productive immediately and free to diverge afterwards (_How a workspace evolves_,
  below).
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

## How a workspace evolves: what Ward installs, and how it survives your changes

Ward ships on its own timeline; a workspace is created by some version and then persists
([`../00-foundation/01-principles.md`](../00-foundation/01-principles.md) §14). Everything Ward
installed at creation therefore has a second life: it must move forward as Ward moves, **without
undoing what the workspace has become**. This section owns that arc — what is installed, who owns
it, how divergence is found, and what "upgraded" is allowed to mean.

### Installed artifacts come in two tiers

- **Yours** — nearly everything: the root `AGENTS.md`, the workspace's skills, the workflow policy,
  the lifecycle hooks, the persona cast. Ward installs these as a **starting point**, and the human
  and their agents are **expected to change them** — to edit the `AGENTS.md`, to add skills of their
  own, to sharpen a policy that does not fit. _Why:_ the workspace is supposed to compound (§13),
  and it compounds by being shaped to the work it actually does; an artifact the human may not touch
  cannot absorb what the workspace learns, and reflection's proposals
  ([`04-reflection-and-evolution.md`](04-reflection-and-evolution.md)) would have nowhere to land.
- **Ward's** — a small, named set the CLI owns outright and replaces wholesale on update: chiefly
  the **reconciliation machinery** itself (below). _Why the exception:_ it is the mechanism that
  protects every customization, so it cannot itself be one — a broken edit to it would disable the
  only thing able to repair the rest. Machinery that repairs must not depend on what it repairs.
  _Why keep the tier small:_ each item in it is a promise of customization withdrawn, so membership
  is earned, not assumed.

This mirrors the store's split between Ward-owned **records** and the open, workspace-evolvable
**artifact types**
([`../02-subsystems/00-metadata-store.md`](../02-subsystems/00-metadata-store.md)) — the same
principle applied to what Ward installs rather than what it records: the machinery relies absolutely
on its own, and everything else is free to evolve.

### Divergence must be detectable, so Ward records what it installed

For every artifact it installs, Ward records **which version it installed and enough to recognize
later whether the artifact still matches it**. **Why:** without a record of what was originally put
there, an upgrade has only two moves — clobber the file or never touch it — and both fail the
workspace (§14). Recognizing divergence is also not enough on its own: folding a new default into a
customized file needs the **version the customization departed from**, so that a deliberate change
can be told from an untouched default. (How that baseline is recorded and compared is a _how_ —
[`design/`](../../design/).)

### Update vs. migrate

- **Update** — bring a workspace's installed artifacts (skills, scaffolding, generated config,
  `AGENTS.md`) in line with the current CLI.
- **Migrate** — transform the workspace's **structure or schema** forward when the shape itself
  changed between versions.

You can update without migrating; migration is the heavier path reserved for structural change.
**Why distinguish them:** most upgrades are routine updates, and reserving "migration" for
structural change keeps the risky path rare and explicit — but the distinction earns its keep most
sharply below, where it is what stops the upgrade machinery from deadlocking on itself.

### Reconciliation is a task, and completing it is what advances the version

When an update finds an artifact the workspace has diverged from, Ward **neither overwrites it nor
silently skips it**. It **opens a task** ([`03-work-lifecycle.md`](03-work-lifecycle.md)) — an
ordinary one, recorded, addressable, pausable, resumable, owned by a resident — whose work is to
fold the new default into the human's version, with the human deciding the calls that are theirs to
make. The **Ward-owned reconciliation skill** is what that task runs.

**The workspace's version stamp advances only when that task closes `delivered`.** An **abandoned**
close leaves the workspace on its previous version — honestly skewed, still working, still surfaced
(_Version skew_, below) — rather than claiming an upgrade that did not happen.

**Why a task, and not a flag, a prompt, or a silent merge:** three reasons converge, which is
usually the sign a rule is right.

1. **It may not finish now.** Reconciliation needs judgment and often a conversation with the human;
   work that spans human attention is exactly what the task lifecycle exists to hold. A modal prompt
   at upgrade time demands the decision at the worst possible moment — mid-command, with no context
   loaded.
2. **It is work like any other.** As a task it is recorded, survives a reboot, appears in "what
   needs me?" ([`../02-subsystems/07-human-shell.md`](../02-subsystems/07-human-shell.md)), and gets
   a scope-boundary reflection when it closes
   ([`04-reflection-and-evolution.md`](04-reflection-and-evolution.md)) — so upgrade friction
   becomes evidence Ward can learn from instead of a papercut nobody records.
3. **It makes "upgraded" mean something.** Tying the stamp to a completed reconciliation is what
   keeps the version from being a claim about files nobody checked.

**What the stamp therefore means.** After reconciliation the workspace's artifacts are **not** byte
copies of Ward's defaults — and that is the intended outcome. The stamp records that this version's
defaults have been **considered and folded in**, not that the workspace conforms to them. **Why:**
conformance and customization cannot both be the goal, and choosing conformance would make every
upgrade a silent rollback of the fit the workspace has accumulated — precisely what §14 exists to
prevent. **After first install, Ward's defaults are proposals.**

**And this is why update and migrate are separate paths.** Artifact reconciliation runs **as
ordinary work in a fully functioning workspace**: the record's shape is unchanged, so nothing is
blocked while the task is open. Structural **migration** is the path that gates writes (_Version
skew_, below). **Why the line matters here:** if reconciliation blocked the workspace the way
migration does, the workspace could not run the very task that unblocks it — the upgrade machinery
would deadlock on itself.

## Version skew: what a mismatched CLI may do

What this slice owns beyond the stamp and the update/migrate paths above is **behavior on mismatch**
— what Ward does when the CLI in hand and the workspace in front of it are not the same generation:

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
  _Why:_ keeping the risky path rare and explicit (above) means little unless the rare path is also
  recoverable.

## Putting a workspace right: three operations, one map

Three operations converge a workspace toward good order. They overlap enough to be confused, so the
division of labor is stated here once:

| Operation               | Asks                                                                              | Owns                                                                                                                  |
| ----------------------- | --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| **Attach** (cold start) | "Which threads were in flight, and are they back?"                                | Re-establishing live work from the record ([`02-sessions-and-lifecycle.md`](02-sessions-and-lifecycle.md), Recovery). |
| **Doctor**              | "Can this machine run this workspace, and does the record still match the world?" | Preconditions and integrity (above).                                                                                  |
| **Update / migrate**    | "Is this workspace the generation this CLI expects?"                              | Aligning the workspace with a new Ward, reconciling what diverged (above).                                            |

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
  metadata root, the version stamp, the **guidance an agent needs to work here** — the root
  `AGENTS.md` and Ward's workspace skill — Ward's defaults as workspace-owned artifacts, version
  control over itself, the repository set); that re-running it **converges** rather than clobbers;
  and that **credentials are never workspace state**.
- **The repository set's lifecycle** — deliberate registration recording remote, main line, and
  canonical checkout; the main line read from the repository rather than assumed; adopt-or-clone;
  registration as a local, autonomous act.
- **Preconditions** — that §3's self-sufficiency is about the **record, not the machine**; the
  required/optional split that gives `doctor` its subject; and the **global-state boundary**
  (preferences only; nothing resumption depends on).
- **Workspace integrity** — the classes of drift between record and world, and the **repair
  posture** (report all, repair only the local and reversible, gate the rest).
- **How a workspace evolves** — the **version stamp**; **update vs. migrate**; the **two tiers of
  installed artifact** (yours, expected to be changed; Ward's small owned set, chiefly the
  reconciliation machinery, which cannot be a customization because it repairs them); that Ward
  **records what it installed** so divergence is detectable and reconcilable against its baseline;
  **reconciliation as a task whose `delivered` close is what advances the stamp**; and that the
  stamp therefore records **defaults considered and folded in, not conformance** — after first
  install, Ward's defaults are proposals.
- **Version-skew behavior** — newer-CLI/older-workspace, older-CLI/newer-workspace, skew as a "what
  needs me?" item rather than a nag, and migration as a gated act that rides version control —
  including that **artifact reconciliation does not block the workspace** the way structural
  migration does, or the upgrade machinery would deadlock on itself.
- **The attach / doctor / update map** — what each owns and how they compose.
- **That a workspace has no terminal state.**

## Left to implementation

- The command names and their surface
  ([`../02-subsystems/07-human-shell.md`](../02-subsystems/07-human-shell.md) owns the noun/verb
  shape); the on-disk layout a creation produces; the concrete precondition and integrity check sets
  and how each is probed; how the canonical checkout's location is chosen; the form of the global
  configuration; how a structural write is recognized in order to be blocked under skew; **how the
  installed baseline is recorded and compared** to detect divergence (a fingerprint, a retained
  pristine copy, or a merge base); the contents of the workspace skill and the root `AGENTS.md`; and
  the reconciliation skill's own procedure. Planned in [`design/`](../../design/).

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
- **The shape of an upgrade's reconciliation.** Whether one task covers everything an upgrade found
  diverged or one task is opened per artifact — and how a partially-reconciled upgrade (some
  artifacts folded in, one task still open) is reported.
- **Declining a default permanently.** Whether a human can record "this artifact is mine now, stop
  proposing" — and if so, what that means for the stamp, which otherwise advances only on a
  `delivered` reconciliation.
- **Membership of the Ward-owned tier.** Beyond the reconciliation machinery, what else (if
  anything) Ward must own outright, and the test for admitting an artifact to that tier.
- **Migration safety.** Whether migration is always idempotent, re-runnable, and reversible via the
  workspace's own version history (§15).
- **Improvements bound for Ward itself.** Reflection may propose improvements that belong upstream
  in the Ward CLI ([`04-reflection-and-evolution.md`](04-reflection-and-evolution.md)); carrying one
  out of the workspace is a crossing of the local↔remote boundary (§4) that nothing currently
  governs.
