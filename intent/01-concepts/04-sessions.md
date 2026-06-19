# Sessions

> **Layer:** intent · concept — design-independent. Names no tool; realizations live in
> `../../design/`. **Status:** placeholder skeleton

## Purpose

Everything about a bounded episode of agent work and how it is recorded so it survives a pause, a
reboot, or weeks of absence — including how its context is assembled and how a workspace comes back
to life.

## Planned sections

- **What a session is** — one bounded episode of an agent at a scope, with a persona, from a working
  directory; the unit Ward records.
- **The harness handle** — a recorded _attribute_ (which harness + its native run id), not a second
  identity; how it is _used_ to re-attach and to reflect later.
- **Open vs. running** — open = started and not closed (regardless of attachment); running = a
  process attached on this machine now.
- **The lifecycle operations** — open, close, resume, wake/nudge.
- **Guarantees** — resume is idempotent; closed stays closed; open ≠ running; the record is kept
  current.
- **Recording per scope** — an append-only session log; the minimum metadata per entry.
- **Context loading** — context is assembled **harness-neutrally**, keyed to the **working
  directory**, in a **deterministic, append- oriented order** so sessions at the same scope can
  share token caches. _(Constraint only; the `AGENTS.md` hierarchy and ordering algorithm are
  design.)_
- **Dispatch and waiting, as session operations.**
- **Recovery** — the ordered orchestration that reconstructs in-flight threads after a cold start
  (enumerate → filter open → re-attach → re-arm wakes → validate setup → leave closed alone).

## Canonical home for

The session concept; open-vs-running; the lifecycle ops and their guarantees; the **harness handle**
(as a recorded session attribute); the **context-loading constraints**; the **recovery**
orchestration. `02-roles.md` owns the two axes and the wake-as-flow; `02-subsystems/01-harness.md`
owns the harness contract; both link here.

## Open questions

- **"Enough metadata" to resume** — validate the minimum against a real reboot-recovery scenario.
- **Append vs. rewrite line** — where evolving context sits relative to the cacheable prefix
  (cross-cutting; see `../00-foundation/open-questions.md`).
