# Open Questions — cross-cutting

> **Layer:** intent · foundation (global). A reference index — read out of order. **Status:**
> living.

Only the **genuinely cross-cutting** tensions live here — the ones that span slices. Each slice
carries its _own_ open questions inline (in its **Open questions** section); this file indexes those
so nothing is lost. It is _expected_ to be non-empty. As we build, answers get promoted into the
relevant slice (and reflected in tests and code).

## Cross-cutting tensions

- **What/why-vs-how boundary drift.** As [`../../design/`](../../design/) fills in, watch both
  directions: tool names creeping into `intent/`, and durable constraints stranded in `design/` that
  should be lifted up. Revisit at every scope boundary.
- **Intent-file granularity.** Is the current concept/subsystem split right, or will some slices
  want to split or merge as they grow?
- **Cross-chunk reflection learnings.** In the chunk → distill → roll-up flow, how are insights that
  emerge only in aggregate preserved? (Owned by
  [`../01-concepts/04-reflection-and-evolution.md`](../01-concepts/04-reflection-and-evolution.md);
  listed here because it recurs.)
- **What runs the cadence.** Refresh, rebase, and cadence reflection are specified as recurring
  ([`../01-concepts/03-work-lifecycle.md`](../01-concepts/03-work-lifecycle.md),
  [`../01-concepts/04-reflection-and-evolution.md`](../01-concepts/04-reflection-and-evolution.md))
  but nothing states what fires them when no session is attached — a resident background process, or
  opportunistic work on CLI invocation. It spans the toil, reflection, the store's
  no-resident-process constraint, and the workspace's own lifecycle. (Owned by
  [`../01-concepts/06-workspace-lifecycle.md`](../01-concepts/06-workspace-lifecycle.md).)

## Index of per-slice open questions

- [`01-concepts/00-domain-model.md`](../01-concepts/00-domain-model.md) — provenance depth;
  cross-task mutation; the **dispatch-routing mechanism** (both paths now settled; the resolution
  mechanism is owned by the messaging seam). (_Level-existence tests, anchor vocabulary, artifact
  taxonomy, task codes, and floor-number reuse now settled — below._)
- [`01-concepts/01-scopes-and-personas.md`](../01-concepts/01-scopes-and-personas.md) —
  persona↔scope cardinality; which fork mode ships first.
- [`01-concepts/02-sessions-and-lifecycle.md`](../01-concepts/02-sessions-and-lifecycle.md) —
  "enough metadata" to resume (_wake across a reboot now settled_).
- [`01-concepts/03-work-lifecycle.md`](../01-concepts/03-work-lifecycle.md) — delegated authority
  for gated actions; hook validation; refresh/rebase cadence; workdir hooks (own set or a degenerate
  case of the worktree hooks); policy-encoding home (_task states now settled_).
- [`01-concepts/04-reflection-and-evolution.md`](../01-concepts/04-reflection-and-evolution.md) —
  reflection-type taxonomy; cadence/boundary triggers (_recovery completion now settled as an event
  trigger_); cross-chunk learnings. (_Versioning, migration, and reconciliation — with migration
  safety — moved to
  [`01-concepts/06-workspace-lifecycle.md`](../01-concepts/06-workspace-lifecycle.md)._)
- [`01-concepts/05-context-loading.md`](../01-concepts/05-context-loading.md) — none open (_the
  append-vs-rewrite line now settled as the two-zone model — below_).
- [`01-concepts/06-workspace-lifecycle.md`](../01-concepts/06-workspace-lifecycle.md) — repository
  removal/rename/remote-moves; more than one workspace on a machine (and whether a machine-level
  registry may exist); **what runs the cadence** (also cross-cutting, above); precedence between
  composed layers; deletion rather than shadowing; semantic drift across an upgrade; migration
  safety; how improvements bound for Ward itself cross the local↔remote boundary. (_Where versioning
  belongs, the shape of a reconciliation, declining a default, and the Ward-owned tier's membership
  test are now settled — see below._)
- [`02-subsystems/00-metadata-store.md`](../02-subsystems/00-metadata-store.md) — none open (_the
  artifact taxonomy now settled as two tiers — below; the concurrency primitive is a bounded
  technique choice under §19, constrained by the store contract, chosen in `design/`_).
- [`02-subsystems/01-session-multiplexer.md`](../02-subsystems/01-session-multiplexer.md) and
  [`02-subsystems/02-messaging-coordination.md`](../02-subsystems/02-messaging-coordination.md) —
  the messaging-vs-multiplexer split; the dispatch-routing **mechanism** (the path — direct vs. via
  status persona — is settled; the resolution mechanism is open; _wake re-arm on recovery now
  settled_).
- [`02-subsystems/03-agent-harness.md`](../02-subsystems/03-agent-harness.md) — fork mode first.
- [`02-subsystems/05-visual-theming.md`](../02-subsystems/05-visual-theming.md) — resolving an
  ambiguous visual reference ("the blue one" across the whole workspace, beyond the collision-free
  visible set).
- [`02-subsystems/07-human-shell.md`](../02-subsystems/07-human-shell.md) — caller-identity
  enforcement; candidate scoping and ranking for interactive resolution (pairs with the theming
  question above); whether the telemetry analysis loop is a reflection type.

## Recently resolved (kept briefly for context)

- **The workspace has a lifecycle of its own.** Creation as a deliberate located act and what it
  establishes (including the root `AGENTS.md` and Ward's workspace skill — the guidance an agent
  needs to work there); repository registration; preconditions (§3 is about the **record**, not the
  machine — which is what gives `doctor` a subject); integrity as classes of drift with a repair
  posture; version skew in both directions; no terminal state. **Versioning, update/migrate, and
  reconciliation re-homed here** from reflection, which keeps the inward axis only
  ([`../01-concepts/06-workspace-lifecycle.md`](../01-concepts/06-workspace-lifecycle.md)).
- **Ward's defaults are proposals after first install.** Installed artifacts come in two tiers — the
  human's (nearly everything, expected to be changed) and Ward's small owned set, replaced without
  adjudication but never silently. The membership test: **Ward owns an artifact iff its content is
  what makes the record mean what it says** — everything else is preference and local convention;
  not being offered for adjudication is a _consequence_ of that, not its definition. Ward records
  what it installed so divergence is detectable, comparing **current against current default**
  rather than any version delta
  ([`../01-concepts/06-workspace-lifecycle.md`](../01-concepts/06-workspace-lifecycle.md)).
- **An upgrade is one task, and its close asserts adjudication.** Ward presents each changed default
  and what it implies; **declining a change completes the upgrade exactly as folding it in does**,
  because Ward's part is to inform and the human's is to decide — re-raising a settled decision
  spends the scarcest context in the system (§1). Abandoning _without_ deciding does not advance the
  stamp. Each artifact's decision is recorded as it is made (§16), and a recorded decline marks the
  difference **chosen rather than drifted**, so integrity stops reporting it. **Structural migration
  is the one thing not declinable**
  ([`../01-concepts/06-workspace-lifecycle.md`](../01-concepts/06-workspace-lifecycle.md)).
- **Compose first; reconcile only the residue.** Ward's contribution to an artifact and the human's
  are separately addressable and composed in a fixed order — Ward's first, justified twice over
  (later content overrides; Ward's stable part caches, §12) — so an upgrade replaces Ward's part
  without touching the human's and most divergence never happens. What composition cannot separate —
  deletion, semantic drift, non-composable artifacts — is what reconciliation is for
  ([`../01-concepts/06-workspace-lifecycle.md`](../01-concepts/06-workspace-lifecycle.md),
  [`../01-concepts/05-context-loading.md`](../01-concepts/05-context-loading.md)).
- **Ward does not defend its own presence.** A human may strip Ward from their workspace; Ward
  neither prevents nor recovers from that, which is what keeps the upgrade machinery proportionate
  (no tamper-evidence, no restore path). The obligation that remains is to **degrade legibly** — and
  integrity distinguishes **drift** from **deliberate departure**, reporting the latter once
  ([`../01-concepts/06-workspace-lifecycle.md`](../01-concepts/06-workspace-lifecycle.md)).
- **"Mission" is not a containment level** — if it returns, it is an _attribute of a project_.
- **Rooms occupy anchors; deep work needs no repository.** The level between task and room is the
  **anchor** — a task-owned scratch medium from which durable output is cut into a governed record:
  a **worktree** (code → commits/PRs; disposition `deliverable | sandbox`, fixed at creation — a
  sandbox never opens a PR and is exempt from the delivery toil) or a **workdir** (non-code deep
  work → artifacts with provenance). A room occupies **exactly one** anchor; an anchor has **at most
  one occupant** at a time (a room, or an elided session acting directly); an **occupied anchor is
  written only through its occupant** — reads stay free, and the maintenance toil yields to
  occupancy ([`../01-concepts/00-domain-model.md`](../01-concepts/00-domain-model.md)).
- **Each level has an existence test; elision changes ceremony, never semantics.** The **task is the
  universal quantum** (the cheapest one-off: a bare task under the workspace, one elided session); a
  **project** exists when success is more than "are the tasks done," an **anchor** when work needs a
  place on disk, a **room** when directing and doing are separated. The tests apply at any time —
  grown work gains a level without remodeling — and the same rules apply present or elided
  ([`../01-concepts/00-domain-model.md`](../01-concepts/00-domain-model.md)).
- **"Anchor" and "workdir" are the settled names** — deliberately plain; the metaphor's memorability
  is spent on addresses (floors, rooms), not on every noun.
- **The artifact taxonomy is two-tier.** **Records** (session logs, recovery records, reflection
  proposals/cursors, the version stamp) are Ward-owned, closed, and versioned with the CLI;
  **artifact types** are an open set — seeded with **brief**, **decision**, **note** — registered
  with runtime-validated schemas, the catalog itself a validated document
  ([`../02-subsystems/00-metadata-store.md`](../02-subsystems/00-metadata-store.md)).
- **Identity edges closed.** **Task codes** are workspace-unique among _open_ tasks — a bare code
  addresses every lifecycle operation, mirroring the session rule. **Floor numbers are monotonic and
  never reused** — the floor is the root of room addresses recorded in provenance, so reuse would
  poison the historical record
  ([`../01-concepts/00-domain-model.md`](../01-concepts/00-domain-model.md)).
- **The append-vs-rewrite tension resolved as the two-zone model.** Context assembles as a stable,
  append-only, cache-shared **prefix** followed by a **mutable tail** where rewrites are legal;
  documents **graduate** forward when they stabilize, and the prefix itself is rewritten only at
  **adoption boundaries** — the deliberate act of adopting reflection proposals
  ([`../01-concepts/05-context-loading.md`](../01-concepts/05-context-loading.md),
  [`../01-concepts/04-reflection-and-evolution.md`](../01-concepts/04-reflection-and-evolution.md)).
- **The concurrency primitive is deliberately not chosen in intent.** The store contract now carries
  the selection pressures — readers never see a partial document; serialization survives a cold
  start with no resident process; contention is legible in the workspace and fails safe; the
  primitive is sized to few, brief writes — and the technique is a bounded, possibly plural, design
  choice (§19) recorded in [`design/`](../../design/)
  ([`../02-subsystems/00-metadata-store.md`](../02-subsystems/00-metadata-store.md)).
- **Session scopes are workspace / project / task / room.** An **anchor is not a scope** — it is a
  resource a room occupies; responsibility for what happens on it lies with its occupant
  ([`../01-concepts/00-domain-model.md`](../01-concepts/00-domain-model.md)).
- **Sandbox scratch is disposable by declaration.** The disposition fixed at creation is itself the
  explicit authority to discard; §18 gates deleting unmerged **deliverable** work
  ([`01-principles.md`](01-principles.md),
  [`../01-concepts/00-domain-model.md`](../01-concepts/00-domain-model.md)).
- **Abandonment closes through the same terminal state.** A close records an **outcome** —
  `delivered | abandoned` — as an attribute, not a fourth state; completion requires the PR set
  **resolved** (merged, or deliberately closed unmerged), and an abandoned close that destroys
  unmerged deliverable work is gated (§18)
  ([`../01-concepts/03-work-lifecycle.md`](../01-concepts/03-work-lifecycle.md)).
- **The human is a first-class participant.** The most senior member, not a persona: owns direction,
  holds gated authority, and is **addressable** — requests to the human are recorded-first like
  every flow, and "what needs me?" is answerable from the record
  ([`../01-concepts/01-scopes-and-personas.md`](../01-concepts/01-scopes-and-personas.md),
  [`../02-subsystems/02-messaging-coordination.md`](../02-subsystems/02-messaging-coordination.md),
  [`../02-subsystems/07-human-shell.md`](../02-subsystems/07-human-shell.md)).
- **The toil fails safe on unrecorded work.** Before mutating any anchor it checks the anchor
  itself: **uncommitted changes are treated as occupancy**, whatever the record says — covering the
  human's editor and agents run outside Ward
  ([`../01-concepts/03-work-lifecycle.md`](../01-concepts/03-work-lifecycle.md)).
- **Theming is stable-by-record, not a pure function.** The accent is **recorded at creation**,
  picked collision-free among what is visible — the record, not a hash of identity, is what survives
  reboots ([`../02-subsystems/05-visual-theming.md`](../02-subsystems/05-visual-theming.md)).
