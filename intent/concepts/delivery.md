# Delivery

> **Layer:** intent · concept — design-independent. Names no tool; realizations live in
> `../../design/`. **Status:** placeholder skeleton

## Purpose

The life of a **task** as a deliverable change: its journey from creation, across worktrees, to a
merged pull request — and the privacy boundary that change crosses on the way out. The Task noun is
defined in `work-hierarchy.md`; this slice owns its delivery.

## Planned sections

- **The task as the unit of trackable work** — carries enough recorded intent that an agent arriving
  cold knows what it is for and what "done" means.
- **Local-only vs. remote-linked tasks** — and moving between them; the remote link is an attribute,
  not the identity.
- **The privacy boundary** — local view (personal) vs. remote view (shared); outward progress is
  _translated_, guarding strictly outward.
- **The cardinal rule: never merge to main directly** — work reaches a main line only through a PR;
  the single exception is explicit human (or delegated) authority. _(The general principle —
  outward/irreversible = gated — lives in `../foundation/principles.md` §18; this is its canonical
  instance.)_
- **Lifecycle hooks** — customizable, **idempotent**, validate-on-resume setup/teardown at defined
  transitions. _(Constraint only; transition set, format, and satisfied-check are design.)_
- **Execution** — directed through the role model.
- **Keeping worktrees current** — refresh and rebase, automated and visible.
- **Completion** — track PRs, guide to merge, disposition artifacts across the boundary, close (all
  PRs merged), refresh and clean up.
- **Workflow policy: opinionated but evolvable** — the commit/merge opinions are shipped as a
  default and owned/evolved by the workspace. _(Uses the `../foundation/principles.md`
  opinionated-but-evolvable principle; encoding is design.)_
- **Summary of task states (conceptual).**

## Canonical home for

The task delivery lifecycle; the local↔remote **privacy boundary** and outward translation; the
**never-merge-to-main** rule; the **lifecycle-hooks** and **workflow-policy** _constraints_;
refresh/rebase. `artifacts.md` owns the artifact side of capture-on-close; this owns the boundary
crossing.

## Open questions

- **Delegated authority for gated actions** — how it is represented and bounded so it cannot be
  silently assumed.
- **Hook validation** — how a hook _checks_ it is already satisfied.
- **Refresh/rebase cadence** — time-based, event-based, human-initiated, or a mix; how conflicts
  surface.
- **Policy encoding home** — skill vs. a dedicated config document; the reconciliation UX.
- **Task state machine** — the precise states, transitions, and which are recorded vs. derived.
