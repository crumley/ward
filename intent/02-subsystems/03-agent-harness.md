# Subsystem: Agent Harness

> **Layer:** intent · subsystem (seam). The contract any design must honor; the _how_ is planned in
> [`../../design/`](../../design/). **Status:** living.

## Responsibility

Run an agent — the AI runtime that thinks and acts within a session — and expose a **harness
handle** Ward can record, resume, and later locate for reflection. Integrate a harness _without
binding the concepts to any one of them_ (§5).

## Constraints any design must honor

- **Start** an agent at a scope, with a persona and a model, in a working directory.
- **Expose a harness handle** — the harness type plus its native run id. The handle is a recorded
  _attribute_, **not a second identity**: Ward addresses a session by its own identity and _uses_
  the handle to re-attach
  ([`../01-concepts/02-sessions-and-lifecycle.md`](../01-concepts/02-sessions-and-lifecycle.md)).
- **Be selectable per scope** (default per workspace, overridable per scope), so different scopes
  can use different harnesses, and two can be mixed in one workspace.
- **Make the run's history locatable from the recorded handle** — for resume after a reboot and for
  reflection later — whatever its format. _Why:_ each harness stores history in its own
  format/location; the handle is the only reliable way to find that run again. **Locate
  distinguishes found from gone:** a harness may have discarded a run's history (retention is the
  harness's, not Ward's), and a handle that no longer resolves is reported as a **distinct outcome**
  — never an error lost in a retry — so Ward records the resolution failure on the session
  (`../01-concepts/02-sessions-and-lifecycle.md`, lifecycle events). _Why:_ reflection must know
  what it **cannot** read; a silently unresolvable handle masquerades as a history nobody happened
  to open.
- **Integrate behind a thin adapter** exposing a small fixed surface — _start / handle / resume /
  locate_ — with everything Ward-specific staying in Ward. _Why:_ a narrow adapter is what lets a
  new harness be added without touching the role model, the session model, or the store.
- **Optionally fork/branch a session.** Where the capability exists, Ward offers **exact-clone**
  forks; where it does not, it falls back to the harness-neutral **distilled-brief** fork, which
  must never depend on this. An exact-clone fork produces a **new session** — its own identity, its
  own handle pointing at the branched run.
- **Accept an externally-chosen model and thinking depth**
  ([`04-model-selection.md`](04-model-selection.md)) and pass them through; this seam does not
  decide which model runs, only honors the decision.

## What this is NOT

- **Not a reimplementation of the agent runtime.** Ward orchestrates harnesses (vision, non-goals);
  it does not become one.
- **Not an assumption of a single harness or a single handle format.** What must survive is that the
  handle is **recorded and resolvable** back to the underlying run.
- **Not the owner of context assembly**
  ([`../01-concepts/05-context-loading.md`](../01-concepts/05-context-loading.md)) or of model
  choice ([`04-model-selection.md`](04-model-selection.md)). This seam runs the agent; those decide
  what it loads and which model it is.

## Canonical home for

- The **agent-harness contract**: a thin, swappable adapter exposing start / handle / resume /
  locate, with optional fork, honoring an externally-chosen model.

## Left to implementation

- The exact adapter interface; the per-harness handle format and history location; how start/resume
  are invoked per harness; how the optional fork is detected and exercised; the default harness and
  the per-scope override mechanism; whether Ward defensively **snapshots or distills** a run's
  history before a harness can discard it, and on what cadence. Planned in
  [`design/`](../../design/).

## Open questions

- **Fork mode first** — distilled-brief (universal) vs. exact-clone (where supported), and how
  exact-clone interacts with a session's identity and handle (with
  [`../01-concepts/01-scopes-and-personas.md`](../01-concepts/01-scopes-and-personas.md)).
