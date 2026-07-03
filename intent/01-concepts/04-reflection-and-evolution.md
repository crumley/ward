# Reflection & Evolution

> **Layer:** intent · concept. The what & why; the _how_ is planned in
> [`../../design/`](../../design/). **Status:** living.

Ward is meant to **compound**: a workspace gets better the longer it is worked in, and Ward itself
improves over time. This file covers two related forms of evolution — the **reflection loop** within
a workspace, and the **versioning and migration** of workspaces as Ward changes underneath them.

## Reflection is a family of goal-directed routines, not one routine

The single most important idea here: **reflection is scoped and goal-directed.** It is not one
undifferentiated "look back at everything" pass. Different reflections have different **goals** and
operate over different **scopes and intervals**, and Ward pursues several kinds:

- **Cadence reflection** — on a regular interval, over the work since the last reflection.
- **Scope-boundary reflection** — when a scope reaches a natural close, reflect over _that scope's
  arc_. When a **project finishes**, reflect at the project level: what went well, what didn't, what
  to improve, what to create, what to debate, what to introduce, what to do differently next time.
  Likewise when a **task closes**, reflect on that task.

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
produces proposals without interrupting active work.

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

## Versioning and migration

Ward (the CLI) evolves on its own timeline; a workspace is created by some version and then
persists. These two facts require update and migration.

### The version stamp

A workspace records **which version of Ward created and last updated it**, with whatever
structure/schema version that implies. **Why:** the stamp is what lets a newer CLI recognize an
older workspace and know what, if anything, must change.

### Update vs. migrate

- **Update** — bring a workspace's artifacts (skills, scaffolding, generated config) in line with
  the current CLI when nothing structural blocks doing so directly.
- **Migrate** — transform the workspace's **structure or schema** forward when the shape itself
  changed between versions.

You can update without migrating; migration is the heavier path reserved for structural change.
**Why distinguish them:** most upgrades are routine updates; reserving "migration" for structural
change keeps the risky path rare and explicit.

### Reconciliation when a workspace has diverged

A workspace is meant to be customized — its agents evolve its skills, policies, and hooks. So
update/migration must **never blindly clobber** local changes:

- If the workspace still matches Ward's defaults, update directly.
- If it has **diverged**, **flag it** and offer a **reconciliation process**: an agent that asks the
  human whether and how the new defaults should fold into their customized artifacts, and guides the
  choices that produce the merged result.

**Why:** the whole point of evolvable artifacts is defeated if an upgrade silently overwrites local
changes. This is the same opinionated-but-evolvable pattern described for workflow policy
(`03-work-lifecycle.md`), applied to everything Ward installs.

## The relationship between reflection and migration

Two axes of evolution, not to be conflated:

- **Reflection** improves a _single workspace_ from _its own_ accumulated experience and teaching
  loop. Driven by what happened inside it.
- **Migration/update** brings a workspace in line with a _new version of Ward_. Driven by changes to
  the CLI, external to the workspace.

One looks inward at experience; the other outward at the evolving platform. Both keep the workspace
healthy over long timescales.

## Canonical home for

- **Reflection as a family of goal-directed routines** — cadence vs. scope-boundary — and _why_ it
  is scoped rather than "look at everything."
- **The map-reduce shape** (chunk → distill → roll up) and the **reflection cursor** that keeps it
  incremental.
- **That reflection is asynchronous and produces proposals**, not silent edits.
- **Versioning & migration** — the version stamp, update vs. migrate, and reconciliation when a
  workspace has diverged.

The build of each (default goals, chunk heuristics, cursor form) is planned in
[`design/`](../../design/).

## Open questions

- **Reflection-type taxonomy.** Which goal-directed reflections ship by default, and how a new type
  is added.
- **Cadence/boundary triggers** — time-based, event-based, human-initiated, or a mix.
- **Cross-chunk learnings.** How insights that emerge only in aggregate survive the roll-up.
- **Migration safety.** Whether migration is always idempotent, re-runnable, and reversible via the
  workspace's own version history.
