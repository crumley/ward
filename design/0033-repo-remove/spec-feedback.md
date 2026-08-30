# 0033 — Spec-feedback

> Intent frictions found while building repository removal.

This file is the entry's adjudication surface and is read on its own — an adjudication session loads
it without the entry's README, so each SF carries enough context to be ruled on directly.

## SF-001 — the repository set's lifecycle stops at registration

- **Slice:**
  [`intent/01-concepts/06-workspace-lifecycle.md`](../../intent/01-concepts/06-workspace-lifecycle.md),
  "The repository set" and the "Repository removal, rename, and remote-moves" open question.
- **Friction:** the slice specifies how a repository joins the set and defers what leaving means
  ("the bootstrap path only adds"), including "what it means to remove a repository that live tasks
  reference." Building the remove verb forced that question's removal limb: the canonical checkout
  is the object store every worktree of the repository borrows, so removal under live tasks is not
  ambiguous — it is destruction of their anchor, and the only coherent answer is refusal with the
  close as the remedy.
- **Assumption made to keep moving:** removal is a **local, autonomous act** (§18) — no human gate —
  because with the fail-safe gates satisfied (no open-task worktrees, clean tree, no stash, no
  branch carrying commits the remote's main line lacks) the checkout is re-creatable from its remote
  to the commit, and the record's deletion is one journal commit away from revert. Rename and
  remote-moves remain open; nothing in the build forecloses them.
- **Proposed revision:** in "The repository set," add a bullet stating that a repository **leaves by
  a deliberate act, symmetrically local and autonomous**, refused while any open task's worktree
  stands on its checkout or the checkout carries evidence of unrecorded work — the fail-safe of
  [`03-work-lifecycle.md`](../../intent/01-concepts/03-work-lifecycle.md) applied to departure. Trim
  the open question to its two remaining limbs (rename; a moved remote or renamed main line).
