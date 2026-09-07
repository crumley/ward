# 0043 — Spec-feedback

> Intent frictions found while making the pull request visible and deriving a task's next step.

This file is the entry's adjudication surface and is read on its own — an adjudication session loads
it without the entry's README, so each SF carries enough context to be ruled on directly.

## SF-001 — the PR facts Ward tracks stop short of the one that most often decides what to do next

- **Slice:**
  [`intent/01-concepts/03-work-lifecycle.md`](../../intent/01-concepts/03-work-lifecycle.md) —
  _Completion: pull requests, merge, and cleanup_, step 1: "**Track PRs.** For each: identity,
  status (open / changes requested / approved / merged), and what remains before it can merge."

- **Friction:** the enumerated facts are a state and a review decision; the clause that would cover
  anything else — "what remains before it can merge" — names no fact at all, and step 2 ("**Guide to
  merge.** At any moment Ward answers 'what is left to complete this task?'") rests on it entirely.
  In practice the thing that most often stands between a pull request and its merge is neither its
  state nor its review: it is the forge's checks. A PR that is open, approved, and red is not
  waiting on a reviewer, and a surface that reports only state and review says it is.

  The gap is not a small one to leave to implementation, because it decides what a derived surface
  is allowed to _say_. Without the checks named among the tracked facts, a build has to choose
  between reporting a merge-readiness it cannot see and staying silent about the commonest blocker;
  and if checks are tracked, the slice's own §17 posture has to say on which side of the stored /
  derived line they fall. They are plainly the derived side — a check verdict changes without anyone
  touching the record, so a stored copy is stale on arrival, exactly as the slice already argues for
  `in-review` — but the slice does not say so, and a build reading it strictly would find CI outside
  Ward's world entirely.

  There is a second, smaller edge in the same sentence: the four listed statuses do not include
  **closed unmerged**, which the same slice's step 4 relies on as one of the two ways a PR set is
  resolved (the abandoned close). The enumeration and the resolution rule disagree about what states
  a PR can be in.

- **Assumption made to keep moving:** that the check verdict **is** part of the PR state Ward
  tracks, read live from the forge at answer time and stored nowhere — the same posture the slice
  takes for review state. The build reads it in the single `gh pr view` call it already makes,
  collapses it to `passing | failing | pending | none` (the forge's own page owns the per-job
  detail), treats an unrecognized verdict as `pending` so a green claim is never a guess, and lets
  it feed the derived next step: a red build outranks a pending review, because there is nothing to
  review until it builds.

- **Proposed revision:** in _Completion_, step 1, extend the tracked facts to read: identity, status
  (open / changes requested / approved / merged / closed unmerged), **the verdict of whatever
  automated checks the forge runs on it**, and what remains before it can merge — and add one
  sentence saying that review and check state are **read from the forge when the question is asked
  and never stored** (§17), so the slice's derived/stored line covers both. In step 2, make the
  promise concrete in the same breath: what is left to complete the task is **derived** from that
  live state plus the workspace's own record (worktrees, the PR set), never from a stored summary.

- **Status:** pending.

## SF-002 — "waiting on the human" is not always derivable, and the surface's rule has no third answer

- **Slice:**
  [`intent/02-subsystems/07-human-shell.md`](../../intent/02-subsystems/07-human-shell.md) — _"What
  needs me?" is a first-class query_: what the surface presents is "**everything waiting on the
  human**", from the requests **addressed** to them and the conditions **derivable** from the record
  and the world's live state, presented as one glanceable, deduplicated answer.

- **Friction:** the rule is written as though every item is decidably on one side or the other — it
  is either waiting on the human or it is not — and one very common condition is decidably neither.
  A pull request that is open with no review decision is waiting on **a reviewer**, and nothing in
  the workspace record says whether that reviewer is this human. In a one-human workspace it almost
  always is; in a team's workspace it often is not; and the forge, which knows who was requested, is
  a second call away and answers a question whose two answers lead to the same page anyway.

  Both available readings are wrong in the same proportion. Presenting it as waiting on the human
  tells a human who is not the reviewer to act on something that is not theirs — the false-positive
  the surface must avoid to stay worth glancing at. Omitting it hides the most common state a
  delivered task sits in, and the slice's own _why_ forbids exactly that: an answer scoped to what
  happened to be knowable is the workspace that "cannot say which one is waiting on its human". The
  slice does anticipate uncertainty elsewhere (§20's honest degradation) but only about facts Ward
  could not **read**; this is a fact Ward read completely and still cannot **attribute**.

- **Assumption made to keep moving:** that an item whose addressee the record cannot decide may be
  presented **as both**, in one line naming both acts, rather than omitted or asserted. The build's
  next-step line for an open PR with no decision reads `review or wait: <url>` — the reader takes
  the half that is theirs, the surface claims nothing it cannot support, and the PR is never
  invisible. Nothing is stored, and no second forge call is made to guess at the answer.

- **Proposed revision:** in the _"What needs me?"_ bullet, add a sentence after the two springs:
  where a condition is derivable but its **addressee** is not — a review pending on a reviewer the
  record does not name is the standing case — the surface presents it rather than dropping it, and
  presents it as **either-way**, naming both the act the human would take if it is theirs and the
  waiting if it is not. _Why:_ the two failure modes are asymmetric in the same direction as §20's —
  claiming an attribution Ward cannot support trains the human to distrust the surface, while
  omitting the item makes the surface incomplete about the state most delivered work sits in; saying
  both costs a word and is true. Extend the _Canonical home for_ line for the attention surface with
  the same clause, so the rule is discoverable where the surface is defined.

- **Status:** pending.
