# 0033 — Repository removal: registration's converse

> `ward repo remove NAME` unregisters a repository and deletes its canonical checkout, refused
> whenever the checkout carries evidence of unrecorded work — so the set that could only grow
> (design/0003) can finally shrink without a hand-edit of the record.
>
> **Status:** built — awaiting review · **Started:** 2026-08-30

The repository set has had one direction since 0003: `repo add` registers, `repo refresh` keeps the
checkout fresh, and nothing takes a repository out again. The intent slice owning the set's
lifecycle names this gap explicitly, deferring removal because "the bootstrap path only adds"
([`06-workspace-lifecycle.md`](../../intent/01-concepts/06-workspace-lifecycle.md), Open questions).
A workspace that has lived a while now has the other half of the arc: repositories registered for
work that has since delivered, cluttering `repo list`, `repo refresh`, and `restore` with checkouts
nobody will branch from again. Today the only way out is editing `repositories/` by hand and
deleting the checkout oneself — the record advanced outside any verb, exactly what the store exists
to prevent.

Removal is more than deleting two things, because the checkout is load-bearing in a way the record
alone does not show: task worktrees are git worktrees **of** the canonical checkout (design/0011),
so its object store holds their branches — including an abandoned task's unlanded branch, which
survives nowhere else once the worktree is torn down. A remove verb that only checked "is the tree
clean" would destroy that work silently. This entry builds the verb around the same fail-safe
refresh lives by: evidence of unrecorded work, read off the world at the moment of the act, refuses
the verb legibly.

## Serves intent

- [`intent/01-concepts/06-workspace-lifecycle.md`](../../intent/01-concepts/06-workspace-lifecycle.md)
  — gives the repository set the leaving half of its lifecycle, answering the removal portion of the
  slice's own open question (see [`spec-feedback.md`](spec-feedback.md)).
- [`intent/01-concepts/03-work-lifecycle.md`](../../intent/01-concepts/03-work-lifecycle.md) — the
  fail-safe: evidence of unrecorded work stops the toil, whatever the record says; here it is what
  makes an autonomous delete safe at all.
- [`intent/00-foundation/01-principles.md`](../../intent/00-foundation/01-principles.md) — §17
  (never guess toward silent loss), §18 (local and reversible stays autonomous: a checkout that
  passes the gates is re-creatable from its remote, so no human gate is taken), §20 (every refusal
  names what was found and the remedy).

## Scope

- **In:** `removeRepository` in the repository-set module — gates, deletion order, journal commit —
  and its CLI surface: `ward repo remove NAME` with completion over the registered names, the human
  rendering that prints the exact re-add command, and the `--json` mutation report (`repo remove` in
  the schema registry, design/0015's posture: refusals emit no document).
- **Deferred:** rename and remote-move reconciliation — the other two limbs of the intent slice's
  open question. Safe to defer because they are record _corrections_ with no destructive step;
  nothing rots in the gap, and a moved remote already surfaces through refresh failing legibly. Also
  deferred: any `--force` override of the gates. Until a real workflow produces a refusal that is
  wrong rather than merely inconvenient, an override is a standing invitation to delete evidence;
  the remedies (close the task, push or delete the branch, drop the stash) are all ordinary verbs.
- **Acceptance:**
  1. `bun test test/workspace/repos.test.ts` — remove deletes checkout and record and commits the
     journal entry; each gate (open-task worktree, dirty tree, stash entry, unlanded branch, unknown
     name) refuses without touching anything; a record whose checkout is already gone is still
     unregistered.
  2. `bun test test/cli/mutation-json.test.ts test/cli/schema.test.ts` — the `repo remove` document
     validates under its registered shape and the schema registry stays complete.
  3. In a workspace: `ward repo add URL && ward repo remove NAME` round-trips, and the removal's
     output contains the `ward repo add URL` that undoes it.

## Design

- **Decisions** (entry-local; no new ADRs):
  - **Every gate inside the store lock.** Refresh keeps its network work outside the lock; remove
    inverts that, running gates and deletion in one held span. Attractive as the refresh pattern
    was, the gates here are cheap local reads, and a concurrent `worktree create` landing between an
    outside-the-lock check and the delete would thread a new worktree under a checkout mid-deletion.
    The cost — a briefly wider critical section — is real and accepted.
  - **Checkout first, record second.** Interrupted between the two, the world is a record whose
    checkout is missing: drift doctor already names, with `ward repo add` as its converging remedy
    (0003). The other order leaves an orphaned checkout no record accounts for and no verb
    converges. The alternative (record first, so the "registered" claim never outlives its checkout)
    loses precisely because an interrupted run must land in a state the existing machinery repairs.
  - **The unlanded-branch gate compares against `origin/<mainLine>`, not the local main line.** A
    branch fully contained in the remote's main line is re-creatable to the commit, so deleting it
    loses nothing; comparing locally would let an unpushed advance of the main line itself slip
    through. `git branch --no-merged origin/<mainLine>` answers in one read, and a checkout git
    itself cannot read is refused rather than presumed empty.
  - **No outcome enum on success.** `repo add` reports how it converged; remove has one success —
    removed — with a `checkout: deleted | missing` field for the one honest variation. A refusal is
    a `WardError`, never a document (0015).
- **Layout:** everything lands in the seams the set already owns — the module gains a `-- remove --`
  section beside add/refresh/list; the CLI gains the verb, its case, and its renderer beside the
  other repo verbs; the schema registry and JSON builders gain one row each. The worktree-holder
  gate reads task worktree records directly (the shape worktrees.ts reads) rather than importing
  worktrees.ts, which imports this module: the small duplication buys the absence of an import
  cycle.
- **Mechanisms:** gates in refusal order — record exists; no non-closed task has a worktree record
  of this repository (its worktrees borrow the checkout's object store); then, when a checkout
  stands on disk: tree readable, no unmerged paths, not dirty, no stash entries, no local branch
  carrying commits `origin/<mainLine>` lacks. Only then `rm -rf` of the checkout, deletion of
  `repositories/<name>.md`, and one journal commit (`Unregister repository NAME`). The report
  carries the record verbatim so the remote survives the record's deletion — the human rendering
  prints it as the exact re-add command, which is what keeps the act reversible (§18) after the
  workspace has forgotten the URL.
