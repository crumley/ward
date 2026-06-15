# How-Intent: Agent Harness Integration

Durable choices behind the **agent harness** seam (`../what/07-subsystem-seams.md`); the *what*
lives in `../what/04-sessions-and-lifecycle.md` and `../what/02-domain-model.md`. This records
how Ward integrates a harness — the *integration surface* — without binding the concepts to any
one of them. (Context loading is separate: `context-loading.md`.)

## Choice: harnesses are pluggable behind a thin adapter

A harness is integrated through a **thin adapter** that satisfies a fixed, small surface:
**start** an agent (at a scope, with a persona, model, and working directory), **expose a
harness handle**, **resume** from that handle, and **locate** the underlying run's history.
Everything Ward-specific stays in Ward; the adapter only translates.

**Why an adapter (vs. coding to one harness).** Harnesses change fast and differ in strengths
(`../what/01-principles.md` §5). A narrow adapter is what lets a new harness be added — or two be
mixed in one workspace — without touching the role model, the session model, or the store.

## Choice: the harness handle is the recorded link to the underlying run

For every session Ward records a **harness handle** — the harness type plus its **native run
id** — a recorded *attribute*, not a second identity: Ward addresses a session by its own
identity and *uses* the handle to re-attach (`../what/04-sessions-and-lifecycle.md`).

**Why.** It is the only reliable way to locate the underlying run again — to resume it after a
reboot and to reflect over it later — without depending on a human remembering which run was
which (`../what/06-reflection-and-evolution.md`).

## Choice: session forking is an optional capability, not a requirement

Some harnesses can **fork or branch a live session**; most cannot. Where the capability exists,
Ward uses it to offer **exact-clone forks** (`../what/03-scopes-and-personas.md`); where it does
not, Ward falls back to the **distilled-brief** fork, which is harness-neutral and always
available.

**Why optional.** Exact-clone is a genuine convenience when the harness supports it, but making
it mandatory would exclude harnesses that lack it and violate harness-agnosticism. The baseline
(brief) must never depend on it. An exact-clone fork produces a **new session** — its own Ward
identity, its own harness handle pointing at the branched run.

## Choice: model and thinking depth are passed through, not owned here

The harness adapter **accepts** the model and thinking depth chosen for the session
(`model-selection.md`) and passes them to the runtime. The harness seam does not decide which
model runs; it only honors the decision.

**Why.** Keeping selection out of the harness seam is what lets the same harness run a fast model
for one scope and a deep one for another, and lets selection policy evolve independently of which
harnesses are installed.

## Guardrails — what this is, and what it is not

- **Is:** a thin, swappable adapter exposing start / handle / resume / locate, with optional
  fork, honoring an externally-chosen model.
- **Is not:** a reimplementation of the agent runtime. Ward orchestrates harnesses
  (`../what/00-vision.md`, non-goals); it does not become one.
- **Is not:** a place that assumes a single harness or a single handle format. What must survive
  is that the handle is **recorded and resolvable** back to the underlying run, whatever its
  shape.
- **Is not:** the owner of context assembly (that is `context-loading.md`) or of model choice
  (that is `model-selection.md`). This seam runs the agent; those decide what it loads and which
  model it is.

## For the implementation plan — where to fill in the blanks

Within the guardrails: the exact adapter interface; the per-harness handle format and history
location; how start/resume are invoked per harness; how the optional fork capability is detected
and exercised; and the default harness and the per-scope override mechanism.
