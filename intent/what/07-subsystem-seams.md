# Subsystem Seams

This file names the **seams**: the boundaries along which Ward's implementation is expected
to vary. It is the hinge between the two layers of intent. Here, in the *what*, each seam is
a **contract** — what the subsystem must provide. The **durable choice behind each seam**
(which kind of technology, modeled how, and why) lives in `../how/`. The exact libraries,
formats, and flags live below intent, in the implementation.

> **Why name seams at all.** So the concepts (`02`–`06`) never have to mention a tool. A
> change behind a seam must be possible **without touching any other intent file**. If a
> proposed change would force edits elsewhere, the seam is in the wrong place.

## Seam: Metadata store

**Responsibility.** Persist and serve the recorded state of the workspace — the hierarchy of
scopes, the tasks and their lifecycle, the sessions and their logs, the artifacts and their
provenance, the identities, the reflection cursors, the version stamp. It is the source of
truth that survives reboots (`01-principles.md` §16).

**Contract.**
- Deterministic reads: "the state of X" returns the same answer for the same state.
- Durable, promptly-updated writes through the lifecycle operations.
- Resolution from an identity to the thing it names (including scope-relative identity).
- Enumeration of scopes and sessions for recovery and reflection.
- Append-only session logs per scope; durable artifacts per scope, with provenance.
- Aggregate status is **derived** from leaf records, not stored as a separate field
  (`02-domain-model.md`).
- Concurrent writes **do not lose updates** — append, single-writer ownership, and
  serialized shared writes (`01-principles.md` §17).

**Durable choice:** `../how/metadata-and-schemas.md` (filesystem; markdown with structured
front matter; typed document schemas).

## Seam: Session multiplexer

**Responsibility.** Host live agent sessions so they can be started, attached to, observed,
detached from, and resumed — by both humans and agents — and survive a human walking away.

**Contract.**
- Start a session for a given scope/identity and keep it alive when detached.
- Let a human or agent (re-)attach to a session, and observe read-only.
- Map a recorded session reference back to a live session for resume.
- Support visual grouping/identification of sessions (see the theming seam).

**Durable choice:** `../how/multiplexer.md` — a terminal multiplexer is the starting point:
attach/detach, persistence across disconnects, themeable status surfaces. The grouping strategy
and the multiplexer itself may change; nothing in the concepts assumes a specific one.

## Seam: Inter-scope messaging & coordination

**Responsibility.** Realize the dispatch / report / wake flows (`02-domain-model.md`,
`03-scopes-and-personas.md`) — delivering work and context downward, status upward, and
notifications on conditions — across sessions that may be paused and resumed.

**Contract.**
- Deliver a message or dispatched unit of work to a target identity, and let the target read
  what was sent to it.
- Let a scope report status upward to its container.
- Let a scope wait on a condition (e.g. another scope finishing) or detach and be woken when
  it is met, addressed by identity so it survives pause/resume.
- Be idempotent where it touches lifecycle (a duplicate wake must not double-act).

**Durable choice:** `../how/messaging-dispatch-wake.md`. **Why a named seam despite overlap
with the multiplexer:** these flows are partly realized *through* the multiplexer but are
their own concern; Ward is opinionated about them, and isolating the contract lets the
delivery mechanism change without disturbing the role model.

## Seam: Agent harness

**Responsibility.** Run an agent — the AI runtime that thinks and acts within a session — and
expose a **harness handle** Ward can record, resume, and later locate for reflection.

**Contract.**
- Start an agent at a scope, with a persona and a model, in a working directory.
- Expose a **harness handle** (its native run id) Ward records and can resume.
- Be selectable per scope, so different scopes can use different harnesses.
- Make its session history locatable from the recorded harness handle.
- *Optionally*, **fork/branch a session**, so Ward can offer exact-clone forks where the
  harness supports them (`02-domain-model.md`).

**Durable choice:** `../how/harness.md` — harness is **pluggable and configurable** (default
per workspace, overridable per scope); new harnesses can be added without disturbing the role
or session models. Context loading is harness-neutral — `../how/context-loading.md`.

## Seam: Model selection

**Responsibility.** Choose which model (and thinking depth) backs a given session.

**Contract.**
- A default at the workspace level, overridable at project, task, and room/session levels
  (narrower overrides broader).
- Honor the role logic (`03-scopes-and-personas.md`): fast/shallow where the job is
  bookkeeping, deep/high-thinking where the job is hard work.

**Durable choice:** `../how/model-selection.md` — concrete model identifiers track the best
available models over time; the *what* is the override hierarchy and the fast-vs-deep intent
(fast for the charge nurse and house supervisor, deep for hands-on rooms). The system is
**model-agnostic** (`01-principles.md` §5): no concept assumes a particular model.

## Seam: Visual theming / identity coordination

**Responsibility.** Give each unit of work a consistent visual identity so a human can tell at
a glance which task/room a window belongs to — coordinated across *all* surfaces.

**Contract.**
- Assign a stable, distinguishable visual identity (e.g. an accent color) deterministically
  and without collisions.
- Apply it consistently across every surface: the multiplexer's status/borders, an editor
  window opened for the same work, and any other window the human interacts with.

**Durable choice:** `../how/theming.md` — an accent-color scheme coordinated across the
multiplexer and the editor. Applying a theme to a new worktree is one of the idempotent setup
hooks (`../how/lifecycle-hooks.md`).

## Seam: Remote work-item provider

**Responsibility.** Be the remote side of the local↔remote boundary (`05-work-lifecycle.md`):
the shared system where work items and pull requests live.

**Contract.**
- Link a local task to a remote work item, and carry status both ways.
- Accept outward-translated updates (the privacy boundary is enforced *upstream* of this
  seam — the provider receives already-sanitized content).
- Report PR status so Ward can drive a task to completion.

**Durable choice:** `../how/remote-provider.md` — a hosted git forge (issues + pull requests),
with outward privacy-translation enforced upstream of it. Replaceable by other forges; the
task model does not assume a specific one.

## Seam: Human shell / interaction layer

**Responsibility.** The thin convenience layer through which a human drives Ward
interactively, plus the usage signal it produces.

**Contract.**
- All real logic lives in the Ward tool; this layer only plumbs to it and presents results,
  kept thin so the core stays testable and portable across shells.
- The structured CLI is organized around **nouns and verbs**; the interactive layer adds
  **mnemonic shorthands** for common operations and **records command usage** for later
  optimization.
- The **human is the default caller**; an agent caller identifies itself (and its scope,
  persona, working directory) — the human never has to declare they are the human
  (`../how/cli-and-telemetry.md`).

**Durable choice:** `../how/cli-and-telemetry.md`.

---

### Where current realizations are detailed

The *kind* of technology behind each seam, and the reasoning, lives in `../how/`. The exact
directory layout, multiplexer naming, color palette, and harness flags belong in the
implementation plan and the code — not in intent.
