# 0042 — Spec-feedback

> Intent frictions found while giving convergence one owner.

This file is the entry's adjudication surface and is read on its own — an adjudication session loads
it without the entry's README, so each SF carries enough context to be ruled on directly.

## SF-001 — re-running creation is stated as the update path, and it can no longer be one

- **Slice:**
  [`intent/01-concepts/06-workspace-lifecycle.md`](../../intent/01-concepts/06-workspace-lifecycle.md)
  — _What creation establishes_, the closing paragraphs: "**Re-running creation on an existing
  workspace converges; it does not clobber.** Creation is a lifecycle operation and inherits
  idempotency … asked to create a workspace where one already exists, Ward validates what is
  present, adds what is missing, and leaves customized artifacts alone — **it is the update path**
  …, not a second mechanism"; and the paragraph after it, which explains that nothing is adjudicated
  in that case because re-creating at the same version means no default has moved. Consequentially,
  the _Canonical home for_ bullet: "that re-running it **converges** rather than clobbers".

- **Friction:** the slice gives creation two jobs — making a workspace at a location, and being the
  update path for one that exists — and the second is what the build cannot keep. Three things
  collided.

  First, the same slice's own map (_Putting a workspace right: three operations, one map_) assigns
  the question "is this workspace the generation this CLI expects?" to **update**, and creation's
  own section opens by insisting that creation is about a **location** a human deliberately asks
  for. A verb that also converges an existing workspace answers a question the map already gave to
  another operation.

  Second, the convergence has grown past what "validates what is present, adds what is missing"
  covers. Under [0041](../0041-ground-floor/README.md) a converge run can **relocate** the standing
  project — moving a directory, rewriting every record that named the old floor, retiring the number
  it came from. That is a structural migration, and it is now reached by typing the word "create" at
  a workspace that already exists.

  Third, the division leaked into the surfaces. Most of the health check's remedies for an existing
  workspace read `re-run ward workspace create ROOT`; one of them named both verbs; and 0041's
  upgrade refused a workspace with no ground floor and sent the human to `create` — the update
  declining to close its own precondition, because the precondition was the other verb's to
  establish. Every one of those is downstream of one job having two owners.

  The safety property the paragraph protects is real and must survive: "did I already init this?"
  must never be a dangerous question.

- **Assumption made to keep moving:** that the property to preserve is **never clobbering**, not
  **always converging** — so a refusal that names the update verb satisfies it, and creation may
  become one-time. The build refuses a path carrying the workspace marker with
  `PATH is already a Ward workspace — bring it to this release with: ward workspace upgrade`, leaves
  the populated-non-workspace refusal as it was, and moves every establishment step into a
  convergence the **update** runs as its first phase. Nothing about idempotency is given up: the
  steps are the same check-then-do list with the same `established | satisfied` outcomes, run by a
  different verb.

- **Proposed revision:** in _What creation establishes_, replace the two closing paragraphs with:
  creation is a **one-time, located act**, and a path that is already a workspace is **refused**,
  naming the update path; "did I already init this?" remains a safe question because the answer is a
  refusal, never a clobber, and the refusal says what to run instead. Keep the same-version
  observation where it belongs — under update, as the trigger rule already states it
  (_Reconciliation is one task_) — rather than as a property of re-creating. Update the _Canonical
  home for_ bullet from "that re-running it **converges** rather than clobbers" to "that it is
  **one-time** — a path that is already a workspace is refused, never clobbered, and the refusal
  names the update path".

  Consequentially,
  [`intent/03-walkthrough-getting-started.md`](../../intent/03-walkthrough-getting-started.md) — its
  _Run it twice_ aside, which today reads as the same claim in the same words — should say that the
  second run is **refused** and name the update as the path that converges.

  [`intent/00-foundation/01-principles.md`](../../intent/00-foundation/01-principles.md) **§6**
  needs no change: it states idempotency for operations that resume, open, or wake a thread and for
  setup/teardown actions, and it does not use creation's re-run as its example. Named here so a
  reader settling this SF does not go looking for a §6 edit that is not owed.

- **Status:** pending.

## SF-002 — the update owns the record's shape, and the map does not say so

- **Slice:**
  [`intent/01-concepts/06-workspace-lifecycle.md`](../../intent/01-concepts/06-workspace-lifecycle.md)
  — _Putting a workspace right: three operations, one map_, the **Update / migrate** row: asks "Is
  this workspace the generation this CLI expects?", owns "Aligning the workspace with a new Ward,
  reconciling what diverged"; and _How a workspace evolves_, which describes that alignment
  exclusively in terms of **installed artifacts** — what Ward installs, the two tiers, divergence
  detection, reconciliation as one task whose gated merge is the adjudication act.

- **Friction:** the row's question is broader than the section that answers it. "Is this workspace
  the generation this CLI expects?" is asked of the whole workspace, but everything the slice says
  about answering it concerns installed artifacts. The parts of a workspace that are **not**
  artifacts — the standing project's existence and its floor, the ignore policy, the reserved scope
  directories, the guidance symlink, the recorded main-line name, the baseline record itself — also
  go out of date as Ward ships, and the slice never says which operation brings them forward. In
  practice creation did, which is what SF-001 is about; with creation becoming one-time, the
  question has no answer written down anywhere.

  The two kinds of alignment are genuinely different in a way the slice's own rules already
  distinguish, and stating that is what makes one operation able to own both. Record shape is
  **journal** — Ward's own bookkeeping, landing on the main line directly, nothing of the human's
  inside it to adjudicate (_The workspace's own main line_). Installed artifacts are what the human
  is expected to have made their own, so they travel as **stewardship**: a branch, a preview, the
  human's gated merge. Ordering matters between them, too, and not only for tidiness: the
  reconciliation task must open on the standing project's floor, so the record's shape has to be
  converged before a vehicle for the artifacts can exist at all.

- **Assumption made to keep moving:** that **update owns convergence of the record's shape as well
  as reconciliation of the installed artifacts**, in that order, and that the mechanism split
  follows the journal/stewardship boundary the slice already draws — the record's shape converged
  directly on the main line, the artifacts reconciled through the gated vehicle. The build runs both
  under one verb: phase 1 is the establishment steps against the workspace root as one journal
  commit; phase 2 is the artifact reconciliation, unchanged, which still manufactures no task, no
  branch, and no pull request unless a default moved.

- **Proposed revision:** in the three-operations table, extend the **Update / migrate** row's _Owns_
  cell to say that update owns **bringing any existing workspace, whatever version made it, to the
  shape this Ward expects**: the record's shape converged directly (journal), the installed
  artifacts reconciled through the gated vehicle (stewardship) — and that at the same version it
  converges and adjudicates nothing, which is the trigger rule already stated under _Reconciliation
  is one task_. In _How a workspace evolves_, add a sentence at the head of the section naming the
  two halves so the section's artifact focus reads as one of two rather than as the whole. Update
  the _Canonical home for_ bullet for the recovery/doctor/update map in the same words.

- **Status:** pending.
