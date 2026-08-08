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
created" ([`01-scopes-and-personas.md`](01-scopes-and-personas.md)), versioning filed under
reflection ([`04-reflection-and-evolution.md`](04-reflection-and-evolution.md), which now keeps the
inward axis only). Each was correct; together they were not a lifecycle, and nothing could link to
one. An idea with no home is an idea nothing checks (`../README.md`, one home per idea).

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
customized artifacts alone — it is the update path (_How a workspace evolves_, below), not a second
mechanism. **Why:** "did I already init this?" must never be a dangerous question.

Nothing is adjudicated in that case, and the reason is the trigger rule below: re-creating at the
**same version** means no default has moved, so the only differences are the human's own edits, and
asking them to adjudicate those would be the nagging this slice forbids everywhere else.

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
  identity within the workspace, its remote, and the **name of its main line**. _Why:_ the toil
  branches new worktrees from the canonical checkout and refreshes it on a cadence
  ([`03-work-lifecycle.md`](03-work-lifecycle.md)); all of that is unreachable if the record cannot
  say what the repository is and what its checkout tracks.
- **The canonical checkout lives inside the workspace.** For every registered repository, the
  workspace **contains** a checkout tracking that repository's main line — one per repository,
  independent of every worktree, never worked in directly. _Why three jobs converge on containment:_
  an agent standing in a worktree can always read the current main line **locally** — diff against
  it, trace what landed — without leaving its own branch or touching the network; the refresh and
  rebase toil ([`03-work-lifecycle.md`](03-work-lifecycle.md)) has one fixed, known target per
  repository; and a cold reader finds every repository's main line in the same place in every
  workspace, which is self-sufficiency (§3) extended from the record to the code the record is
  about. **Contained is not tracked:** the workspace's own repository (§15) ignores the checkouts
  and worktrees within it — they are the world the record describes, not the record.
- **The main line is recorded from the repository, not assumed.** _Why:_ repositories disagree about
  their default branch, and every downstream rule — never merge to main, branch from current, rebase
  onto the refreshed line — names a branch the workspace must have gotten right.
- **Both adoption and cloning must be possible, and both converge on the contained checkout.** A
  human without a local checkout has Ward clone one into place; a human with one has Ward **adopt**
  it — the existing checkout supplies the content (moved in, or used as a local source; the
  mechanism is [`design/`](../../design/)'s), so nothing already on disk is fetched again. _Why the
  destination is still Ward's:_ the make-work the prime directive rejects is the needless
  re-download, not the placement ([`../00-foundation/00-vision.md`](../00-foundation/00-vision.md))
  — containment buys the three benefits above and costs the human nothing they chose.
- **No repository is required, and none is special.** The set may be empty (creation, above), and
  nothing in it privileges Ward's own source: a workspace need never contain the `ward` repository,
  and one that does — as the bootstrap workspace does
  ([`../03-walkthrough-getting-started.md`](../03-walkthrough-getting-started.md)) — registered it
  the way any workspace registers any repository: because its human works on it. _Why say so:_ the
  bootstrap story is vivid enough to read as a rule, and a tool whose workspaces quietly required
  its own source would have smuggled in a dependency no principle argues for.
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

### Compose first; reconcile only what composition cannot separate

The cheapest conflict is the one that cannot occur. So wherever an installed artifact can be built
from parts, **Ward's contribution and the human's are separately addressable and composed in a
defined order — Ward's first, the human's after.** An upgrade then replaces Ward's part wholesale,
because nothing of the human's is inside it: no divergence, no detection, no adjudication.

Two independent reasons fix that order, which is usually the sign it is right. **Override:** later
content wins, so the human can shadow anything Ward says without editing what Ward owns. **Token
economy (§12):** Ward's part is identical across every workspace at that version, so it caches,
while anything mutable placed ahead of it would invalidate the shared prefix — this is the two-zone
model of [`05-context-loading.md`](05-context-loading.md) applied to _authorship_ rather than
volatility.

**Why this is the primary move, not an optimization:** a merge conflict Ward manufactured through
its own file layout is not a real decision, and the prime directive says the human's attention is
spent only where a real decision is needed
([`../00-foundation/00-vision.md`](../00-foundation/00-vision.md)). Reconciling well is worse than
not having to reconcile.

Composition does not reach everything, and the residue is what reconciliation exists for:

- **Deletion.** A human can shadow one of Ward's defaults by appending; they cannot _un-say_ it.
- **Semantic drift.** When Ward's part renames or reframes something the human's part builds on,
  their content is stale without ever having been touched.
- **Artifacts that do not compose.** Hooks are executable, so composition means chaining with its
  own ordering rules; a persona cast has the deletion problem acutely.
- **Editing across the line anyway.** Nothing prevents it (_Ward does not defend its own presence_,
  below).

(_How_ the parts are composed — an include directive, a file Ward generates from parts, the
`AGENTS.md` hierarchy — is left to [`design/`](../../design/), and §19 permits more than one
technique converging through use.)

### Installed artifacts come in two tiers

- **Yours** — nearly everything: the root `AGENTS.md`, the workspace's skills, the workflow policy,
  the lifecycle hooks, the persona cast. Ward installs these as a **starting point**, and the human
  and their agents are **expected to change them**. _Why:_ the workspace is supposed to compound
  (§13), and it compounds by being shaped to the work it actually does; an artifact the human may
  not touch cannot absorb what the workspace learns, and reflection's proposals
  ([`04-reflection-and-evolution.md`](04-reflection-and-evolution.md)) would have nowhere to land.
- **Ward's** — a small set the CLI owns and **replaces wholesale on update, without adjudication**,
  chiefly the **reconciliation machinery** itself. The replacement is **reported, never silent**
  (§15, §8). _Why not adjudicated:_ nobody wants to be asked to merge their own merge tool — the
  ceremony would cost more than it protects. This is not a lock: a human who edits it anyway has
  stepped outside the path Ward is built for, and Ward will overwrite it and say so.

**The test for membership:** an artifact belongs to Ward's tier **iff its content is what makes the
record mean what it says** — such that a workspace operating on an altered version of it would
produce records Ward could not trust. Everything else is preference and local convention, and is the
human's.

Applied: the **reconciliation machinery** passes, because it is what makes a version stamp mean
anything — a stamp advanced by machinery that presented the changes wrongly is a claim about an
adjudication that did not really happen. The **workflow policy**, the **lifecycle hooks**, the
**persona cast**, and the root **`AGENTS.md`** all fail: a workspace that merges on a different
policy or names its personas differently still produces records that mean exactly what they say.

**Not offered for adjudication — a consequence of the test, not its definition.** Because these
carry meaning rather than preference, there is no coherent "decline" to offer for them, which is why
Ward's tier is replaced wholesale rather than presented to the human (_Reconciliation_, below). _Why
a test rather than a list:_ every item admitted is a promise of customization withdrawn, so
admission must be argued from what the record has to mean, never adopted for convenience mid-build.

This is the same ownership rule the store applies to documents — Ward-owned **records** versus the
open, workspace-evolvable **artifact types**
([`../02-subsystems/00-metadata-store.md`](../02-subsystems/00-metadata-store.md)) — but a different
kind of thing: records are the data Ward **writes**, these are the instructional and executable
content Ward **ships**.

### Divergence must be detectable, so Ward records what it installed

For every artifact it installs, Ward records **which version it installed and enough to recognize
later whether the artifact still matches it**. **Why:** without that, an upgrade has only two moves
— clobber the file or never touch it — and both fail the workspace (§14).

Detection only has to answer **changed or not**, on a workspace still being used as a Ward
workspace. It is not tamper-evidence and need not survive an adversarial or half-dismantled
workspace (_Ward does not defend its own presence_, below). _Why say so:_ the store's own contract
warns against machinery sized past its real load, and a cheap check is what this one is.

**Comparison is always current-versus-current-default**, never a delta between two Ward versions. To
recap what an upgrade would change, Ward compares the artifact **as it now stands** against **the
default as it now ships**. _Why:_ it removes the merge base and all version-delta algebra from the
model, and with them the incoherent case where a change is proposed on the assumption that an
earlier, declined change had landed. The question is never "what changed between v3 and v4" but
"here is yours, here is ours, here is what differs and why it matters."

### Update vs. migrate

- **Update** — bring a workspace's installed artifacts (skills, scaffolding, generated config,
  `AGENTS.md`) in line with the current CLI.
- **Migrate** — transform the workspace's **structure or schema** forward when the shape itself
  changed between versions.

You can update without migrating; migration is the heavier path reserved for structural change.
**Why distinguish them:** most upgrades are routine updates, and reserving "migration" for
structural change keeps the risky path rare and explicit — but the distinction earns its keep most
sharply below, where it is what stops the upgrade machinery from deadlocking on itself.

### Reconciliation is one task, and its close asserts adjudication

**What triggers adjudication is a default that moved, not a file that differs.** An artifact needs
the human only where **Ward's default changed between the stamped version and the CLI in hand**
_and_ the workspace's copy no longer matches the default it was installed with. Where the default
moved and the copy was untouched, the new default simply applies — there is no decision to make.
Where the copy was customized but the default stood still, there is nothing new to say about it, and
raising it would be asking the human to adjudicate their own edits. **Why this precise trigger:**
"differs from what Ward ships" is true of every customized workspace permanently, so triggering on
it would turn every upgrade — and every re-run of creation — into a re-litigation of choices already
made.

(This does not reintroduce version deltas into what the human sees. Whether a default moved is a
question about **Ward's own shipped versions**, answerable on Ward's side alone; what gets
**presented** is still the artifact as it stands against the default as it now ships, and a
difference already covered by a recorded decline is shown as chosen rather than raised as news.)

When an upgrade finds artifacts that meet that trigger, Ward **neither overwrites them nor silently
skips them**. It opens **one task for the upgrade** ([`03-work-lifecycle.md`](03-work-lifecycle.md))
— an ordinary one, recorded, addressable, pausable, resumable, owned by a resident — covering every
artifact that needs a decision. The **Ward-owned reconciliation skill** is what that task runs, and
its job is to **present each change and what it implies** so the human can decide.

**What a `delivered` close asserts is adjudication, not conformance:** that this version's changes
were presented, their ramifications explained, and **decided**. Folding a change in is one outcome
of deciding; **declining it is another, and both complete the task.** A workspace whose human read
every proposed change and kept their own version of all of them **is** at the new version.

**Why declining completes rather than blocks.** Ward's part is to surface what changed and why it
matters; the human's part is to decide (§14 — they own their workflow). Once both have happened,
raising the same change again spends the scarcest context in the system (§1) on a decision already
made. An upgrade notice that keeps returning after the human has considered and refused it is not
diligence, it is nagging — and "what needs me?"
([`../02-subsystems/07-human-shell.md`](../02-subsystems/07-human-shell.md)) is worth reading only
if everything in it still needs the human.

**Declining a change is not the same as abandoning the adjudication.** A task the human sets aside
without deciding closes **abandoned**, and the stamp stays where it was — honestly skewed, still
working, still surfaced (_Version skew_, below) — because nothing was considered. The distinction is
the whole point: Ward stops asking once it has been answered, not once it has been ignored.

**The record advances artifact by artifact, inside the one task.** As each artifact is adjudicated —
folded in or declined — that decision is **recorded then**, not accumulated in the session and
written at the close. **Why:** §16 prefers recorded state over live state, and an upgrade
interrupted at its fifth artifact must not, on resume, re-raise the four already settled. That would
be the same nagging at a smaller scale, and the record is what prevents it.

**Declining is recorded, and that record has a job.** A declined difference is marked as **chosen,
not drifted** — which is what stops `doctor` reporting the artifact as divergence on every run
(_Workspace integrity_, above), and what lets a later recap say "this differs because you decided it
should" instead of raising it as news. The record retains **what** was declined, not merely that
something was.

**What is not declinable: structural migration.** A human may complete an upgrade having declined
every artifact change; they may not complete one having skipped a required migration, because there
the record's shape genuinely would not match the claim the stamp makes. Preference is theirs;
structure is not a preference.

**Why a task, and not a flag, a prompt, or a silent merge:** three reasons converge, which is
usually the sign a rule is right.

1. **It may not finish now.** Reconciliation needs judgment and often a conversation; work that
   spans human attention is exactly what the task lifecycle exists to hold. A modal prompt at
   upgrade time demands the decision at the worst possible moment — mid-command, with no context
   loaded.
2. **It is work like any other.** Recorded, resumable across a reboot, visible in "what needs me?",
   and reflected on when it closes
   ([`04-reflection-and-evolution.md`](04-reflection-and-evolution.md)) — so upgrade friction
   becomes evidence Ward can learn from rather than a papercut nobody records.
3. **It makes "upgraded" mean something.** Tying the stamp to a completed adjudication is what keeps
   the version from being a claim about files nobody looked at.

**What the stamp therefore means.** After reconciliation the workspace's artifacts are **not** byte
copies of Ward's defaults — that is the intended outcome, not a shortfall. The stamp records that
this version's changes were **considered and decided**, never that the workspace conforms to them.
**Why:** conformance and customization cannot both be the goal, and choosing conformance would make
every upgrade a silent rollback of the fit the workspace has accumulated — precisely what §14 exists
to prevent. **After first install, Ward's defaults are proposals.**

**And this is why update and migrate are separate paths.** Artifact reconciliation runs **as
ordinary work in a fully functioning workspace**: the record's shape is unchanged, so nothing is
blocked while the task is open. Structural **migration** is the path that gates writes (_Version
skew_, below). **Why the line matters here:** if reconciliation blocked the workspace the way
migration does, the workspace could not run the very task that unblocks it — the upgrade machinery
would deadlock on itself.

## Ward does not defend its own presence

A human may take Ward's guidance out of their `AGENTS.md`, delete the workspace's skills, and keep
working in the directory. That is a legitimate choice, and **Ward neither prevents it nor recovers
from it.** There is no operation that restores a workspace to Ward's shape, and nothing in this
slice should be read as protecting Ward's own artifacts against the human whose workspace it is.

**Why state a non-goal:** it is what keeps the machinery proportionate. Everything above —
detection, reconciliation, the owned tier — is designed for the path Ward is actually for: a human
who wants to keep using Ward and is **augmenting** it, sharpening an `AGENTS.md`, adding skills,
adjusting a policy that does not fit. Designed instead against a human dismantling it, the same
machinery would need tamper-evidence, restore paths, and locks — heavyweight answers to a problem
the workspace's owner is entitled to create.

The line this does **not** cross: **not recovering is not the same as failing badly.** Ward still
runs, and `doctor` still reports plainly what is missing and what follows from it — "agents started
here no longer load Ward's operating rules; expect them to behave differently" — because guiding the
user beats failing cryptically
([`../02-subsystems/07-human-shell.md`](../02-subsystems/07-human-shell.md)). Integrity therefore
distinguishes **drift** (the record and the world disagree — a finding) from **deliberate
departure** (the human removed something — reported once, then left alone), the same posture a
recorded decline earns an artifact (_Reconciliation_, above).

There is a boundary worth naming inside the happy path, because it is the same line the tiers draw:
**augmenting** Ward — adding skills, local conventions, sharper standards — is the point, while
**contradicting the semantics the record depends on** (instructing agents that a room may span two
anchors, or that merging to a main line directly is fine) is not prevented, but is how a workspace
stops meaning what its records say. Ward's answer to that is the layering above, not enforcement.

## Version skew: what a mismatched CLI may do

What this slice owns beyond the stamp and the update/migrate paths above is **behavior on mismatch**
— what Ward does when the CLI in hand and the workspace in front of it are not the same generation:

- **What blocks is a _schema_ mismatch, not any version difference.** Where the versions differ but
  the record's shape did not change between them — **artifact-only skew** — nothing is blocked: the
  workspace runs normally and the skew is merely surfaced. _Why:_ the hazard below is writing a
  shape the schema does not describe, and where no shape changed there is no hazard. This is also
  what makes reconciliation possible at all: it runs as ordinary work in a fully functioning
  workspace (_How a workspace evolves_, above), which it could not do if every generational
  difference froze writes.
- **Newer CLI, older workspace, schema changed.** Reads proceed, with the skew **surfaced**;
  **structural writes do not proceed** until the workspace is **migrated**. _Why:_ a CLI writing
  records in a shape the workspace's schema does not describe is silent corruption of the source of
  truth (§16, §17) — and inspection is exactly what a human needs in order to decide about the
  upgrade.
- **Older CLI, newer workspace, schema changed.** Structural writes are **refused**. _Why:_ an older
  CLI can neither write the newer shape correctly nor migrate forward out of the situation, and
  there is no version of "try anyway" that fails loudly enough to be safe.
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

| Operation                 | Asks                                                                              | Owns                                                                                                                                                                                                                                                |
| ------------------------- | --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Recovery** (cold start) | "Which threads were in flight, and are they back?"                                | Re-establishing live work from the record ([`02-sessions-and-lifecycle.md`](02-sessions-and-lifecycle.md), Recovery); its CLI verb reads as `attach` ([`../02-subsystems/07-human-shell.md`](../02-subsystems/07-human-shell.md), verbs read true). |
| **Doctor**                | "Can this machine run this workspace, and does the record still match the world?" | Preconditions and integrity (above).                                                                                                                                                                                                                |
| **Update / migrate**      | "Is this workspace the generation this CLI expects?"                              | Aligning the workspace with a new Ward, reconciling what diverged (above).                                                                                                                                                                          |

**Why three and not one:** they run at different moments, on different evidence, with different
risk. Recovery runs after every reboot and touches live state; doctor is safe to run at any time and
changes little; migration is rare and gated. Collapsing them would drag the riskiest into the most
frequent. They compose in one direction: **doctor diagnoses and recommends the other two; recovery
assumes the environment is already sound.** A recovery that fails on a missing tool has found a
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
- **The repository set's lifecycle** — deliberate registration recording remote and main line; the
  **contained canonical checkout** (inside the workspace, one per repository, independent of every
  worktree, ignored by the workspace's own git); the main line read from the repository rather than
  assumed; adopt-or-clone **converging on the contained checkout**; that **no repository is required
  or special** — Ward's own source included; registration as a local, autonomous act.
- **Preconditions** — that §3's self-sufficiency is about the **record, not the machine**; the
  required/optional split that gives `doctor` its subject; and the **global-state boundary**
  (preferences only; nothing resumption depends on).
- **Workspace integrity** — the classes of drift between record and world, and the **repair
  posture** (report all, repair only the local and reversible, gate the rest).
- **How a workspace evolves** — the **version stamp**; **update vs. migrate**; **composition first**
  (Ward's contribution and the human's separately addressable, Ward's ordered first, so most
  divergence never occurs) and the residue composition cannot separate; the **two tiers of installed
  artifact** and the **membership test** (Ward owns an artifact iff its content is what makes the
  record mean what it says; not being offered for adjudication is a consequence, not the
  definition), Ward's tier replaced without adjudication but never silently; that Ward **records
  what it installed** so divergence is detectable, with what is **presented** always
  current-versus-current-default rather than a version delta; that **adjudication is triggered by a
  default that moved**, never by a file that merely differs; **reconciliation as one task per
  upgrade whose `delivered` close asserts adjudication** — declining a change **completes** it,
  abandoning without deciding does not — with each artifact's decision **recorded as it is made**;
  that a **recorded decline marks a difference chosen rather than drifted**; that **structural
  migration is not declinable**; and that the stamp therefore records **changes considered and
  decided, not conformance** — after first install, Ward's defaults are proposals.
- **That Ward does not defend its own presence** — no prevention and no recovery from a workspace
  the human has stripped, balanced by the obligation to **degrade legibly**, and the **drift versus
  deliberate departure** distinction that follows for integrity reporting.
- **Version-skew behavior** — that **blocking follows the schema, not the version number** (an
  artifact-only mismatch blocks nothing), newer-CLI/older-workspace, older-CLI/newer-workspace, skew
  as a "what needs me?" item rather than a nag, and migration as a gated act that rides version
  control — including that **artifact reconciliation does not block the workspace** the way
  structural migration does, or the upgrade machinery would deadlock on itself.
- **The recovery / doctor / update map** — what each owns and how they compose. (Recovery itself is
  [`02-sessions-and-lifecycle.md`](02-sessions-and-lifecycle.md)'s; its `attach` verb is
  [`../02-subsystems/07-human-shell.md`](../02-subsystems/07-human-shell.md)'s.)
- **That a workspace has no terminal state.**

## Left to implementation

- The command names and their surface
  ([`../02-subsystems/07-human-shell.md`](../02-subsystems/07-human-shell.md) owns the noun/verb
  shape); the on-disk layout a creation produces, including the path convention for the contained
  canonical checkouts and worktrees and the ignore policy that keeps them untracked; the concrete
  precondition and integrity check sets and how each is probed; the form of the global
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
- **Precedence between composed layers.** "Later wins" is well defined for configuration and fuzzy
  for two conflicting instructions sitting in one context window. What an agent should do when the
  human's layer contradicts Ward's, beyond ordering, is unsettled.
- **Deletion, not just shadowing.** Composition lets a human override by appending but never
  _un-say_ a default. Whether removing one of Ward's defaults outright is supported, and what an
  upgrade then proposes about it.
- **Semantic drift across an upgrade.** When Ward's layer renames or reframes something the human's
  layer builds on, their content is stale without having been touched. Whether that is detectable at
  all, or only surfaced as a recap for the human to judge.
- **Migration safety.** Whether migration is always idempotent, re-runnable, and reversible via the
  workspace's own version history (§15).
- **Improvements bound for Ward itself.** Reflection may propose improvements that belong upstream
  in the Ward CLI ([`04-reflection-and-evolution.md`](04-reflection-and-evolution.md)); carrying one
  out of the workspace is a crossing of the local↔remote boundary (§4) that nothing currently
  governs.
- **Records Ward rewrites on the human's behalf vs. the installed baseline.** The artifact-type
  catalog is installed — and baselined — at creation, yet it is exactly the record a future
  registration verb mutates; afterward divergence detection honestly reads "customized," with the
  wrong connotation, since the customizer was Ward holding the human's pen. The entry that builds
  catalog registration must decide consciously: **compose** (Ward's seed separately addressable from
  the workspace's registrations — the compose-first rule above suggests this), or **accept
  "customized" as the honest reading** (the adjudication trigger is deliberately content-based, and
  a registration is the human customizing the catalog whoever holds the pen). What it may **not** do
  is refresh the baseline on Ward-driven writes: a baseline that tracks every write always matches,
  which blinds divergence detection and would let an upgrade clobber the workspace's registered
  types as "untouched" (§17).
