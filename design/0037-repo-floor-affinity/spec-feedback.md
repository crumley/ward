# 0037 — Spec-feedback

> Intent frictions found while building repository → floor affinity.

This file is the entry's adjudication surface and is read on its own — an adjudication session loads
it without the entry's README, so each SF carries enough context to be ruled on directly.

## SF-001 — a project has no recorded relationship to repositories, and the model does not say it may

- **Slice:** [`intent/01-concepts/00-domain-model.md`](../../intent/01-concepts/00-domain-model.md)
  — the _Project_ section, and _Status: recorded at the leaves, derived above_ ("Only judgments that
  **cannot** be derived from children — a priority, a 'waiting on an external decision' note, an
  attention flag — are recorded at the higher scope").

- **Friction:** the model relates a **workspace** to its repositories ("A workspace is configured
  with a set of **repositories** it knows how to work in") and a **task** to the repositories it
  touches ("A task can span **multiple worktrees across multiple repositories**"), and says nothing
  at all about a project and repositories. Yet the placement question a human answers on every
  `ward task open` — which floor does work on this repository belong to? — is exactly a
  project↔repository relationship, and the answer is stable enough to be worth recording once.

  The Status rule permits it: it is a judgment, it cannot be derived from the floor's tasks (an
  empty floor opened _for_ a repository has no tasks to derive from, and a derivation would drift as
  tasks open and close), and it is the same species as the "priority" and "attention flag" the rule
  names. But the rule's list is illustrative, not exhaustive, and the Project section — which is
  where a reader looks to learn what a project _has_ — does not mention it. A build that records it
  is either honouring the Status rule or inventing a project attribute the model never granted, and
  the words do not distinguish those two readings.

  There is a second, sharper gap. Nothing in the model says what happens when such a judgment
  **changes**: whether a routing default may relocate work already placed under the old one. The
  answer this build needs is "no, and the human is told" — but that is a constraint on judgments,
  not a detail of one, and it belongs where the judgment is licensed.

- **Assumption made to keep moving:** that a project may record a **claim** on registered
  repositories under the Status rule's licence, provided it is a **routing default and never a
  rule** — it constrains nothing about what the floor's tasks may touch, an explicit floor always
  overrides it, and changing it moves no work that is already placed (the change is reported with
  the open tasks it leaves behind). A repository is claimed by at most one open project, because a
  default that can name two answers never defaults; a closed project's claims are inert, because it
  cannot take a task anyway.

- **Proposed revision:** add one sentence to the _Project_ section: a project **may claim
  repositories** as a **routing default** for work opened against them — explicit placement always
  wins, and a moved claim leaves open tasks where they are. Optionally extend the Status rule's
  illustrative list ("a priority, a routing default, a 'waiting on an external decision' note, an
  attention flag") so the species is named where the licence is given, and state the general
  constraint there once: a judgment recorded at a container may change what happens **next**, and
  never silently relocates what is already placed.

- **Status:** pending.

## SF-002 — "floors low for recurring work, high for transient" has nowhere to live

- **Slice:** [`intent/01-concepts/00-domain-model.md`](../../intent/01-concepts/00-domain-model.md)
  — _Identity_, "**Floor numbers are monotonic and never reused.**"

- **Friction:** a workspace that runs for months develops a habit worth writing down: the low floors
  hold the work that recurs — administering the workspace itself, per-repository maintenance — and
  the high ones hold feature work that arrives, finishes, and leaves. It is a genuinely useful
  convention, and it reads like intent. It is also **unbuildable as stated**, because floor numbers
  are monotonic and never reused: Ward cannot allocate "the next low floor" without breaking the
  rule that makes historical room addresses trustworthy.

  So the convention is neither in the intent (where it would imply a mechanism the identity rule
  forbids) nor anywhere else (a design entry is a record of a build, not a place for a workspace's
  habits). This entry states it in its Design as a naming practice that affinity _supports_ — which
  is the right thing to do about the mechanism and the wrong home for the habit, since the habit
  outlives the entry and is not about how anything was built.

- **Assumption made to keep moving:** that the convention is a **workspace's practice**, not Ward's
  intent and not a mechanism, and therefore that this entry builds no floor tiering of any kind —
  affinity routes to a floor a human chose, and where they choose to put it is theirs. Nothing in
  the record enforces or records the tier.

- **Proposed revision:** either (a) note in _Identity_, beside the monotonic-floors rule, that the
  ordering of floors carries **no semantics Ward assigns** — a workspace may adopt conventions about
  which floors hold which kind of work, and Ward neither enforces nor infers them — which is a
  durable constraint on Ward and settles the question by ruling the mechanism out; or (b) rule the
  convention out of scope for intent entirely, leaving it to a workspace's own guidance. Naming it
  either way is better than the current silence, in which each build has to decide for itself
  whether a floor number means something.

- **Status:** pending.
