# Subsystem: Agent Harness

> **Layer:** intent · subsystem (seam). The constraints any design must honor; names no tool.
> **Design:** `../../design/subsystems/harness.md`. **Status:** placeholder skeleton.

## Responsibility

Run an agent — the AI runtime that thinks and acts within a session — and expose a **harness
handle** Ward can record, resume, and later locate for reflection.

## Constraints any design must honor

- Start an agent at a scope, with a persona and a model, in a working directory.
- Expose a **harness handle** (its native run id) Ward records and can resume. _(The handle as a
  recorded session attribute lives in `concepts/sessions.md`; this is the producing side.)_
- Be **selectable per scope**, so different scopes can use different harnesses.
- Make its session history locatable from the recorded handle.
- _Optionally_ fork/branch a session, so Ward can offer exact-clone forks where supported
  (`concepts/roles.md`, forking).
- **Model-** and **harness-agnostic** by construction (`principles.md` §5): no concept assumes a
  particular one; context is loaded harness-neutrally (`concepts/sessions.md`).

## What this is NOT

- Not a specific harness; new harnesses can be added without disturbing the role or session models.

## Canonical home for

The harness contract (run an agent, expose a handle, be per-scope selectable, optionally fork).

## Open questions

- **Fork mode first** — brief vs. exact-clone, and how exact-clone interacts with identity and the
  handle (shared with `concepts/roles.md`).
