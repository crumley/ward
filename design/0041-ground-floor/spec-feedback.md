# 0041 — Spec-feedback

> Intent frictions found while building the ground floor.

This file is the entry's adjudication surface and is read on its own — an adjudication session loads
it without the entry's README, so each SF carries enough context to be ruled on directly.

## SF-001 — the cheapest one-off is a bare task, and this build no longer has one

- **Slice:** [`intent/01-concepts/00-domain-model.md`](../../intent/01-concepts/00-domain-model.md)
  — _Levels are elided, not faked_, the **task** bullet: "the cheapest one-off is a bare task
  directly under the workspace with one elided session"; and
  [`intent/01-concepts/06-workspace-lifecycle.md`](../../intent/01-concepts/06-workspace-lifecycle.md)
  — _The standing workspace project_, closing parenthetical: "Bare tasks directly under the
  workspace remain what they are — the cheapest one-off".

- **Friction:** the elision rule's job is to forbid **empty containers created for ceremony's
  sake**, and it illustrates the cheapest work with a task that has no project above it at all. The
  illustration was exactly right when a workspace might hold no project. It is no longer the only
  reading available: since [0018](../0018-standing-workspace-project/README.md) every workspace
  carries a standing project that passes the project test **on its own merits** — established for
  the workspace's own arc, not for the one-off — and this build makes that project the floor a task
  with nothing else to say opens on.

  That is not a faked level, and the words do not say so. Nothing empty is created: the container
  already exists, for a reason of its own, in every workspace. But an implementer reading the two
  sentences above cannot tell whether opening the cheapest one-off **on** that floor honours the
  rule or violates it, because the rule is stated through an example rather than through its test —
  and the example is now the one shape this build refuses to produce.

  The second half of the friction is that the two slices say it twice, in the same words, which is
  the one-home rule's own warning sign: whichever way this is settled, one of them should state it
  and the other should link.

- **Assumption made to keep moving:** that the rule is about **not fabricating containers**, not
  about the absence of a project — so a task opened on the ground floor is the cheapest one-off,
  with no level faked, because the ground floor exists by intent
  ([`06-workspace-lifecycle.md`](../../intent/01-concepts/06-workspace-lifecycle.md), _The standing
  workspace project_) and would exist whether or not that task were ever opened. Tasks already under
  `tasks/` at the root stay valid records, addressed exactly as they were; the build stops writing
  there rather than rewriting what is there.

- **Proposed revision:** in _Levels are elided, not faked_, restate the task bullet through the test
  rather than the example: the cheapest one-off is **one task with one elided session, on the ground
  floor** — no level is faked, because the ground floor is not created for the task's sake. In
  [`06-workspace-lifecycle.md`](../../intent/01-concepts/06-workspace-lifecycle.md), drop the
  parenthetical that keeps bare tasks as the cheapest one-off (its point — that the standing project
  is not a new requirement on unrelated odd jobs — survives in the sentence about what the project
  is _for_). Consequentially,
  [`04-walkthrough-delivering-work.md`](../../intent/04-walkthrough-delivering-work.md) — where the
  task is opened — should say that a task always sits on a floor, and which floor it lands on when
  none is named. The other half of those sentences, that a task's address **composes** its floor
  with its room, is already on the queue as [0036](../0036-floor-addressed-tasks/spec-feedback.md)'s
  SF-001 and is deliberately not re-proposed here: that one settles the spelling, this one settles
  the container.

- **Status:** pending.

## SF-002 — floor numbers are monotonic from 1, with no room for a reserved one

- **Slice:** [`intent/01-concepts/00-domain-model.md`](../../intent/01-concepts/00-domain-model.md)
  — _Identity_: "a **project is a floor**, addressed by a **floor number** (`1`, `2`, `3…`, starting
  at 1)"; "**Floor numbers are monotonic and never reused**"; and the _What gets an identity_ table,
  "the **code is a floor number** (`1`, `2`, `3…`) — **monotonic, never reused**".

- **Friction:** the identity rule states one allocation scheme for every project, and its _why_ is
  about **reuse**: a retired floor number must never be handed out again, because it roots
  historical room addresses. Reserving a number is a different move, and the rule neither permits
  nor forbids it — it simply does not contemplate one. Yet the standing workspace project has a
  requirement no ordinary project has: it is the **one project every workspace has**, and things
  outside any single workspace need to name it — the root manifest, whose bytes are identical across
  workspaces by construction ([0020](../0020-deterministic-upgrade/README.md)), and any guidance
  written once and read in several workspaces. An allocated number cannot satisfy that: it is 1 in a
  fresh workspace and 6 in a converged one, so no text can name it and be right twice.

  The reserved number is also the thing that lets the elision question in SF-001 be settled at all:
  "every task lives on a floor" is only cheap if there is a floor guaranteed to be there, with a
  name that is the same everywhere.

- **Assumption made to keep moving:** that **floor 0 is reserved** for the standing workspace
  project in every workspace, and ordinary floors keep the existing rule unchanged — monotonic from
  1, never reused. The reservation takes one number out of the ordinary sequence and adds no new
  kind of identity: 0 is a floor number like any other, and `f0t1` is an address like any other.
  Migrating an existing workspace's standing project down to 0 **retires** the floor it came from,
  so the monotonic rule holds through the move.

- **Proposed revision:** in _Identity_, beside the monotonic-floors rule, state the reservation and
  its _why_: floor **0 is reserved** for the standing workspace project — the one address every
  workspace shares, which is what lets anything written outside a workspace refer to it — and
  ordinary floors are allocated monotonically **from 1** and never reused. Update the _What gets an
  identity_ table's Project row in the same words. If the reservation is declined, the fixed-address
  requirement needs somewhere else to live, and
  [`06-workspace-lifecycle.md`](../../intent/01-concepts/06-workspace-lifecycle.md) would have to
  say how a Ward-authored default is meant to name a per-workspace number.

- **Status:** pending.

## SF-003 — the standing project's identity is "allocated like any project's"

- **Slice:**
  [`intent/01-concepts/06-workspace-lifecycle.md`](../../intent/01-concepts/06-workspace-lifecycle.md)
  — _The standing workspace project_: "Its identity is allocated like any project's
  ([`00-domain-model.md`](../../intent/01-concepts/00-domain-model.md), Identity); the concrete
  address form is [`design/`](../../design/)'s."

- **Friction:** the slice deliberately leaves the address form to design (_Left to implementation_,
  and [0018](../0018-standing-workspace-project/README.md) took it up), but it does **not** leave
  the allocation open — "allocated like any project's" is a constraint, and it is the one this build
  cannot keep. The requirement it collides with is durable and belongs in intent rather than in an
  entry: the standing project is the workspace's own, so **its identity has to be the same in every
  workspace** for anything Ward authors to be able to name it. That is a statement about what must
  be true of Ward, not about how any build spells it, and today it appears nowhere.

  The slice's own list of what makes this project special — it passes the project test, it never
  closes, it concentrates the workspace's own history "in the same place in every workspace (§3)" —
  already gestures at it. "The same place in every workspace" is exactly the claim, and it is
  currently true only of the _slug_, not of the address a human or an agent would use.

- **Assumption made to keep moving:** that the standing project's identity is **fixed rather than
  allocated**, and that this is a property of what it is (the one project every workspace has), not
  a build convenience — so a workspace whose standing project sits on an allocated floor is a
  workspace mid-migration, which converge completes and doctor names, rather than a second valid
  arrangement.

- **Proposed revision:** replace "Its identity is allocated like any project's" with the durable
  constraint: its identity is **fixed and the same in every workspace** — the one address every
  workspace shares, which is what lets Ward-authored defaults and briefs refer to it — with the
  concrete number left to [`design/`](../../design/) as before. Keep the link to _Identity_, which
  (with SF-002 settled) is where the reserved number and its _why_ live.

- **Status:** pending.
