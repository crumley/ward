# How-Intent: Reflection Mechanism

Durable choices for *how* Ward realizes **reflection** — the compounding loop that turns
accumulated experience and the teaching loop into better skills, tooling, personas, and Ward
itself. The *what* — that reflection is a **family of goal-directed routines**, runs on a cadence
and at scope boundaries, and is chunked and rolled up to scale — lives in
`../what/06-reflection-and-evolution.md`. Reflection is not a subsystem seam, but it is a major
mechanism that cuts across the store, the harness, and the workflow, so its durable choices are
recorded here.

## Choice: a reflection is an evolvable routine, encoded in the workspace

Each reflection **goal** (cadence retrospective, project-close review, a "what slowed us down"
pass) is encoded as a **workspace-owned, evolvable routine** — the same opinionated-but-evolvable
pattern as workflow policy and hooks (`workflow-policy.md`, `lifecycle-hooks.md`): Ward installs
sensible defaults at creation, the workspace adds and tunes goals over time, and divergence is
reconciled, not clobbered, on upgrade (`../what/06-reflection-and-evolution.md`).

**Why encoded, not hard-coded.** The *set* of worthwhile reflections is itself something a
workspace learns. Hard-coding the goals in the CLI would freeze exactly the thing that should
compound. Encoding them as evolvable artifacts means reflection can reflect on — and improve —
reflection.

## Choice: reflection is scoped and goal-directed, never "look at everything"

A reflection always carries a **goal** and a **scope/interval** (`../what/06`). It runs over *this
project's arc*, or *this task*, or *the interval since it last ran for this goal* — not
undifferentiated over all work at all times.

**Why.** This is the prime directive applied to Ward's own introspection: a directed reflection
yields **focused, actionable** improvements where an undirected one yields only generalized ones
(`../what/01-principles.md` §1). Directing attention is what Ward does; it directs its own the
same way.

## Choice: reflection is map-reduce over chunks, to stay tractable at any size

A reflection may have to cover far more than fits in one context window, so it is a **map-reduce**,
not a single pass (`../what/06`):

1. **Chunk** the interval's work into pieces (by time, task, scope, or volume).
2. **Distill** each chunk independently to its **core learnings** — a small, dense summary.
3. **Roll up** the distilled learnings into one coherent reflection and its proposals.

**Why.** A long-deferred reflection must degrade into **more chunks**, not failure
(`../what/06`). Map-reduce is what makes the cost scale with how much accumulated rather than
overflow. The chunks read the underlying runs via their **harness handles** (`harness.md`), which
is why reflection can span a mix of harnesses.

> **Open — cross-chunk learnings.** Some insights emerge only in aggregate and are invisible to
> any single chunk. How the roll-up surfaces these (a second pass over distillations, a
> running theme accumulator) is unresolved (`../what/08-open-questions.md`).

## Choice: a reflection cursor records how far each goal has processed

Each (scope, goal) pair has a **reflection cursor** — a recorded marker of **how far that
reflection has already processed** — so the next run handles only what is new
(`../what/06`).

**Why.** It is what keeps reflection **incremental and cheap**: a run does not re-distill work it
already covered, and a long gap just means more new chunks. The cursor is **recorded** state per
goal; whether it is a timestamp, a commit, or an artifact id is left to the implementation.

## Choice: reflection is asynchronous and produces proposals, not edits

Reflection runs on its cadence or at a boundary **without interrupting active work**, and it
**proposes** improvements (to skills, tooling, personas, or Ward itself, `../what/06`) rather than
silently applying them.

**Why non-blocking.** Reflection is background compounding; making active work wait on it would
invert the priority. **Why proposals.** The improvements touch evolvable, workspace-owned
artifacts a human may have customized; surfacing a proposal keeps the human in control, the same
reason update/migration reconciles rather than clobbers (`../what/06`).

## Guardrails — what this is, and what it is not

- **Is:** evolvable, workspace-encoded, goal-directed routines that map-reduce over cursor-bounded
  intervals and emit proposals asynchronously.
- **Is not:** one fixed "look back at everything" pass. A reflection without a goal and a scope is
  the anti-pattern this doc exists to prevent.
- **Is not:** a single-context operation. Anything that assumes the interval fits in one window
  breaks the moment a user reflects rarely.
- **Is not:** an actor that edits the workspace behind the human's back. It proposes; adoption and
  reconciliation are deliberate (`workflow-policy.md`).

## For the implementation plan — where to fill in the blanks

Within the guardrails: the default set of reflection goals and how a new one is added; the chunk
boundary heuristics and the distillation prompt/shape; the roll-up procedure and how cross-chunk
themes are preserved; the cursor's concrete form per goal; the cadence and boundary **triggers**
(`../what/08-open-questions.md`); and how proposals are recorded and surfaced for adoption. These
are the focus areas; this doc fixes the constraints, not the answers.
