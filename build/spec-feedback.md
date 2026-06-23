# Spec Feedback — what building taught us

The running log of places the **intent** proved ambiguous, under-specified, contradictory,
over-specified, hard to implement, or not serving its stated purpose — discovered by trying to build
it. This is the payload of the experiment: building Ward to improve the spec for Ward.

Append an entry the moment you hit friction; do not batch them at the end (you will forget the
specifics). The build does **not** edit `intent/` to resolve these — it records the friction here,
proceeds on a stated assumption, and leaves the spec change for human review. (The one exception:
appending to a slice's own _Open questions_, or noting that the build _resolved_ an existing open
question, is allowed and should also be logged here.)

**Entry format**

- **Where** — the intent file and section (e.g. `intent/01-concepts/00-domain-model.md` → Identity).
- **Kind** — ambiguity / gap / contradiction / over-specification / hard-to-implement /
  doesn't-serve-purpose.
- **What** — what you hit, concretely, and why it blocked or slowed the build.
- **Assumption** — the decision you made to keep moving.
- **Proposed revision** — a concrete change to the spec (reword, add detail, cut, split, resolve an
  open question, …).

---

## SF-001 — Task state machine is undefined, but the store needs a concrete enum

- **Where** — `intent/01-concepts/03-work-lifecycle.md` → "Summary of task states (conceptual)" and
  its Open question "Task state machine."
- **Kind** — gap / under-specification (acknowledged open, but blocks the store schema).
- **What** — The task record needs a typed, runtime-validated `state` field (metadata-store seam),
  but the intent lists states only "conceptually" (drafted, active, in review, blocked, paused,
  closed) and explicitly defers the precise set, transitions, and which are recorded vs. derived.
  You cannot write a Zod enum against "conceptually." Also unresolved: is `in-review` a distinct
  stored state or derived from the existence of open PRs? The walkthrough implies the latter (status
  driven by the PR set), which would make `in-review` derived, not stored.
- **Assumption** — Adopted a stored enum `drafted | active | blocked | paused | in-review | closed`
  on the task record (`store/schemas.ts`), with the task as a status leaf (its own state stored;
  project/workspace derive from it).
- **Proposed revision** — Promote the conceptual list to a **normative state set** in
  work-lifecycle, with a small transition table, and explicitly state which states are **stored on
  the task** vs. **derived** (recommend: `in-review` is derived from "has ≥1 open PR", so it is not
  a stored value; the stored set is `drafted | active | blocked | paused | closed`). This removes
  the double-source-of-truth risk the metadata-store seam warns about.

## SF-002 — Derived status: the rollup precedence and the empty-container case are unspecified

- **Where** — `intent/01-concepts/00-domain-model.md` → "Status: recorded at the leaves, derived
  above"; `intent/02-subsystems/00-metadata-store.md` → "Aggregate status is derived from leaf
  records."
- **Kind** — under-specification.
- **What** — The intent mandates that a container's status is "a query over its children" but does
  not define the query. When a project's tasks are a mix (some `active`, some `blocked`, some
  `closed`), what is the project's derived status? And what is the status of a container with **no**
  children (a freshly-opened project, or an empty workspace)? Both are needed to implement and to
  test the invariant, and both affect what the house supervisor surfaces.
- **Assumption** — Implemented `deriveStatus(childStates)` with precedence
  `blocked → active(active|in-review|open) → closed(all) → paused → active`, and introduced a
  distinct `empty` result for zero children (`domain/status.ts`).
- **Proposed revision** — Add a short "Derivation rule" paragraph to the domain-model status section
  fixing (a) the precedence (attention-needing states surface over healthy ones; any in-progress
  beats all-done), and (b) a named status for the childless container (e.g. `empty`/`idle`), since
  "what does the supervisor show for a brand-new project?" is a real first-run question. Keep it as
  intent (it is a durable what, independent of how status is computed).

## SF-003 — Walkthrough conflates "open a room" with "open the room's first session"

- **Where** — `intent/03-walkthrough.md` §4 ("Brief and open a room") vs. §5 ("Deep work in the
  room"); against `intent/01-concepts/00-domain-model.md` → Room ("a room is a scope that hosts
  sessions, not a session itself … can be open with no session attached").
- **Kind** — contradiction (minor) / ambiguity.
- **What** — §4's "Records written" lists "a session log entry for the room's first session" as part
  of **opening the room**, but §5 is where the medical-student session actually does the work, and
  the domain model is explicit that a room is a scope that can be **open with no session attached**.
  Building it forced a decision: does `room open` mint a session, or not? If it does, "open ≠
  running" and "resume re-attaches a session to an open room" get muddy (the room would always have
  a session). I had to pick the domain-model reading.
- **Assumption** — `room open` writes only the room record + the brief artifact (no session);
  `session open --room <code>` opens the session in §5. (Project- and task-scope `open`, by
  contrast, **do** open a session, matching their walkthrough steps — the asymmetry is intentional
  and matches "a room hosts sessions.")
- **Proposed revision** — In walkthrough §4, move "a session log entry for the room's first session"
  from §4's records to §5's, and note in the Room concept that opening a room does **not** by itself
  open a session (it becomes _running_ only when a session is opened/resumed in it) — making the
  open-vs-running distinction concrete at the room level.
