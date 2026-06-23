# Design: Agent Harness

> **Serves intent:** [agent-harness seam](../intent/02-subsystems/03-agent-harness.md);
> [sessions](../intent/01-concepts/02-sessions-and-lifecycle.md) (the harness handle);
> [context-loading](../intent/01-concepts/05-context-loading.md) (handle recorded per session).

## Realization (`src/seams/harness.ts`)

A thin adapter exposing the seam's small fixed surface — **start / handle / resume / locate** (plus
`history` for reflection) — over a runtime. v1 ships a **stub** runtime so the handle semantics are
exercised for real without driving a model (v1-scope: deferred real harness):

- **start(scope, persona, model, cwd)** → mints a native run id and returns a `LiveRef` carrying the
  **handle** `"<harness>:<nativeRunId>"` (here `stub:<id>`). It also writes a line to the run's own
  history file — the harness keeping its history "in its own format/location."
- **handle** — `"<harness>:<nativeRunId>"`, a recorded **attribute** (not an identity). Ward stores
  it in the session-open event; the session is addressed by its Ward id, and the handle is _used_ to
  re-attach.
- **resume(handle)** → locates the run from the handle, asserts it is resolvable, appends a resume
  marker, returns a live ref. **Idempotent** — resuming again never mints a second run.
- **locate(handle)** → the path to the native history; the only reliable way to find the run again,
  for resume after a reboot and for reflection later.

## Why a stub is enough for v1

The load-bearing properties are: the handle is **recorded and resolvable**, resume is
**idempotent**, and history is **locatable from the handle**. All three hold against the stub, and
the session lifecycle tests exercise them. A real harness (Claude Code, etc.) is a swap of this one
file: the same four methods over a real CLI, with `nativeRunId` becoming the harness's own run id
and `locate` pointing at its on-disk history. Nothing in `domain/` or `store/` changes.

## Per-scope selection & model pass-through

The seam requires per-scope harness selection (default per workspace, override per scope) and that
the harness **honors an externally-chosen model** rather than choosing one. v1 records the model on
the session event (chosen by the persona's tier via `model-selection` defaults) and passes it to
`start`; the stub records it. The per-scope **harness** override mechanism is a config follow-on
(only one harness exists in v1).

## Open / deferred

- **Fork mode** — exact-clone vs. distilled-brief; v1 implements neither fork yet (distilled-brief
  is the harness-neutral baseline planned first). An exact-clone fork would produce a **new**
  session (own identity + own handle on the branched run)
  ([seam open question](../intent/02-subsystems/03-agent-harness.md)).
- The concrete per-harness handle formats / history locations, and the per-scope override config.
