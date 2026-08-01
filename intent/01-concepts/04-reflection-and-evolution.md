# Reflection & Evolution

> **Layer:** intent · concept. The what & why; the _how_ is planned in
> [`../../design/`](../../design/). **Status:** living.

Ward is meant to **compound**: a workspace gets better the longer it is worked in, and Ward itself
improves over time. This file covers the **reflection loop** within a workspace — the inward axis of
that evolution. The outward axis, a workspace moving forward as Ward changes underneath it, is
[`06-workspace-lifecycle.md`](06-workspace-lifecycle.md)'s; the two are related but deliberately not
conflated (_The relationship between reflection and migration_, below).

## Reflection is a family of goal-directed routines, not one routine

The single most important idea here: **reflection is scoped and goal-directed.** It is not one
undifferentiated "look back at everything" pass. Different reflections have different **goals** and
operate over different **scopes and intervals**, and Ward pursues several kinds:

- **Cadence reflection** — on a regular interval, over the work since the last reflection.
- **Scope-boundary reflection** — when a scope reaches a natural close, reflect over _that scope's
  arc_. When a **project finishes**, reflect at the project level: what went well, what didn't, what
  to improve, what to create, what to debate, what to introduce, what to do differently next time.
  Likewise when a **task closes**, reflect on that task — whatever its outcome; an **abandoned**
  close is often the richest arc to read (`03-work-lifecycle.md`, task states).
- **Recovery reflection** — when a cold-start recovery completes, reflect over the **recovery
  episode**: its recorded per-thread outcomes and the rounds' conclusions
  (`02-sessions-and-lifecycle.md`), plus the harness histories of the threads involved. A recovery
  that struggled — failed re-attaches, unresolvable handles, wakes that misfired — is concentrated
  evidence of recording gaps and brittle mechanisms; a clean one confirms the record was sufficient.
  **Why an event trigger:** the moment recovery ends is when the evidence is freshest and the
  human's pain most recent; waiting for a cadence pass would dilute exactly the focused, actionable
  signal reflection is scoped to catch.

> **Why scope the reflection?** This is the prime directive applied to reflection itself. A
> reflection that ranges over **all scopes at all times** yields **generalized**, weakly actionable
> improvements. A reflection with a **specific interest** — this project, this task, this kind of
> friction — yields **focused, actionable** ones. Directing attention is exactly what Ward exists to
> do, so it directs its _own_ introspection the same way.

The set of reflection types is **evolvable, not hard-coded.** New goals (a security retrospective, a
"what slowed us down" pass) can be added as the workspace learns what is worth reflecting on — the
same opinionated-but-evolvable pattern used everywhere (`03-work-lifecycle.md`).

### What reflection produces

Whatever its goal, a reflection proposes improvements to how the workspace works:

- **Skills** — create or improve skills, capturing patterns so future agents do not rediscover them.
- **Tooling** — create or improve CLI tooling that removes recurring friction.
- **Personas** — **create, refine, retire, or recommend** personas in light of what worked and what
  surprised, to better fit the work the workspace actually does (fed by the teaching loop,
  `01-scopes-and-personas.md`).
- **Standards** — capture and evolve the **standards** work is held to (the bar the attending and
  residents set and refine), so a lesson learned once raises the bar for future sessions.
- **Ward itself** — surface improvements that belong upstream in the Ward CLI.

Reflection is **asynchronous and non-blocking**: it runs on its cadence or at a boundary and
produces proposals without interrupting active work. **Adopting** a proposal is a deliberate act
with a second meaning: it is the sanctioned moment the stable context prefix may be rewritten — the
**adoption boundary** of [`05-context-loading.md`](05-context-loading.md) — so improvement lands as
a batched, priced cache re-prime rather than continuous churn
([`../00-foundation/01-principles.md`](../00-foundation/01-principles.md) §12).

## Reflection must scale by chunking and rolling up

We **cannot assume users reflect often, or often enough.** A reflection may have to cover a long or
very active interval — far more than fits in a single context window, or even several. So reflection
is a **map-reduce**, not a single pass:

1. **Chunk** the work into smaller pieces (by time, task, scope, or volume).
2. **Distill** each chunk independently to its **core learnings** — a small, dense summary that fits
   comfortably in context.
3. **Roll up** the distilled learnings into a **single coherent reflection** and its proposals.

**Why:** this keeps reflection tractable regardless of how much has accumulated, so a long-deferred
reflection degrades into _more chunks_ rather than failing. (How cross-chunk learnings that only
emerge in aggregate are preserved is an open question, `../00-foundation/open-questions.md`.)

### Why it stays cheap

Reflection processes only what is new since it last ran for a given goal; the workspace records
where each reflection last reached, so the next run knows its interval. (Whether the cursor is a
timestamp or something else is a _how_.)

## The relationship between reflection and migration

Two axes of evolution, not to be conflated — which is why they are described in different slices:

- **Reflection** improves a _single workspace_ from _its own_ accumulated experience and teaching
  loop. Driven by what happened inside it. **This slice.**
- **Migration/update** brings a workspace in line with a _new version of Ward_. Driven by changes to
  the CLI, external to the workspace. The version stamp, update vs. migrate, and the reconciliation
  of artifacts the workspace has customized are
  [`06-workspace-lifecycle.md`](06-workspace-lifecycle.md)'s.

One looks inward at experience; the other outward at the evolving platform. Both keep the workspace
healthy over long timescales, and they meet at the artifacts each is allowed to change: reflection
**proposes** improvements to the workspace's own skills, personas, and standards, while an upgrade
**proposes** Ward's new defaults for the same artifacts — and in both directions the workspace's
customizations are folded in deliberately, never overwritten (§14).

## Canonical home for

- **Reflection as a family of goal-directed routines** — cadence, scope-boundary, and recovery — and
  _why_ it is scoped rather than "look at everything."
- **The map-reduce shape** (chunk → distill → roll up) and the **reflection cursor** that keeps it
  incremental.
- **That reflection is asynchronous and produces proposals**, not silent edits.
- **The two axes of evolution** and why they are not conflated — inward from experience (here),
  outward from a new Ward ([`06-workspace-lifecycle.md`](06-workspace-lifecycle.md)).

The build of each (default goals, chunk heuristics, cursor form) is planned in
[`design/`](../../design/).

## Open questions

- **Reflection-type taxonomy.** Which goal-directed reflections ship by default, and how a new type
  is added.
- **Cadence/boundary triggers** — time-based, event-based, human-initiated, or a mix (_recovery
  completion is now settled as an event trigger, above_).
- **Cross-chunk learnings.** How insights that emerge only in aggregate survive the roll-up.

(_Versioning, migration, and reconciliation moved to
[`06-workspace-lifecycle.md`](06-workspace-lifecycle.md), which carries their open questions —
including migration safety._)
