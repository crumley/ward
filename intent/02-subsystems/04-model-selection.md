# Subsystem: Model Selection

> **Layer:** intent · subsystem (seam). The contract any design must honor; the _how_ is planned in
> [`../../design/`](../../design/). **Status:** living.

## Responsibility

Choose which **model** (and **thinking depth**) backs a given session — fast where the job is
bookkeeping, deep where the job is hard — and keep that choice **model-agnostic** (§5).

## Constraints any design must honor

- **Resolution through the scope hierarchy** — the full ladder is **user/machine → workspace →
  project → task → room/session**, with **narrower always overriding broader**. _Why:_ a sensible
  workspace default covers most sessions; a specific room or status persona overrides locally
  without re-deciding everywhere. One knob, applied at the narrowest scope that cares.
  - The **user/machine layer is the broadest and therefore the weakest rung**: it supplies only what
    the workspace has not chosen, so a human's own taste travels with them between workspaces
    without ever overriding one. It is bounded by the **global-state rule**
    ([`../01-concepts/06-workspace-lifecycle.md`](../01-concepts/06-workspace-lifecycle.md)) — it
    may hold **preferences only**, never anything the understanding or resumption of work depends
    on, so losing it costs a default and never a recovery.
  - Whatever the ladder resolves to is **recorded on the session**
    ([`../01-concepts/02-sessions-and-lifecycle.md`](../01-concepts/02-sessions-and-lifecycle.md)),
    so reproduction reads the record rather than the machine. _Why both bounds:_ two humans opening
    the same workspace would otherwise get different models from it with nothing in the workspace to
    say why. Self-sufficiency (§3) is preserved not by forbidding the per-user layer but by keeping
    it inessential and writing down what actually ran.
- **Defaults follow the persona's job.** Fast/shallow where the work is status and routing (the
  **charge nurse**, the **house supervisor**); deep/high-thinking where it is hard reasoning or
  hands-on depth (a room, an attending). _Why:_ the persona already encodes how a scope attends to
  its work ([`../01-concepts/01-scopes-and-personas.md`](../01-concepts/01-scopes-and-personas.md)),
  so the right tier falls out of it and a new session usually needs no explicit choice.
- **Model identifiers are configuration** that tracks the best available models over time, held in
  the workspace — or, as a mere preference, on the human's own machine below it — and **never
  written into the concepts**. What is durable is the **override hierarchy** and the **fast-vs-deep
  intent**; _which_ model is fast or deep this month is a value, not a design commitment. _Why:_
  models change faster than anything else; a concept that named one would be stale within months.
- **Tuning reads recorded evidence.** The persona → tier defaults are a starting point; revising
  them is a reflection outcome
  ([`../01-concepts/04-reflection-and-evolution.md`](../01-concepts/04-reflection-and-evolution.md))
  grounded in the **usage the sessions actually recorded** — tokens and cost, where the harness
  exposes them
  ([`../01-concepts/02-sessions-and-lifecycle.md`](../01-concepts/02-sessions-and-lifecycle.md)) —
  not in taste. _Why:_ §12 makes token spend a managed cost, and a cost is managed only where it is
  measured; without recorded usage, fast-vs-deep routing is tuned on guesswork.

## What this is NOT

- **Not a mandate of any particular model or provider.** The system is model-agnostic; no concept
  assumes a specific model (§5).
- **Not a fixed persona → model mapping baked into Ward.** The mapping is a sensible _default_ the
  workspace can change and reflection can tune
  ([`../01-concepts/04-reflection-and-evolution.md`](../01-concepts/04-reflection-and-evolution.md)).
- **Not the harness.** This seam decides _which_ model; the harness
  ([`03-agent-harness.md`](03-agent-harness.md)) merely honors the decision.

## Canonical home for

- The **model-selection contract**: an override ladder from the user's machine down to the
  room/session, whose defaults follow the persona's job, with concrete model ids living in
  configuration and the resolved choice recorded on the session — and the **evidence loop**: tuning
  the defaults is grounded in recorded usage, not taste.

## Left to implementation

- The exact configuration shape for defaults and overrides; the initial persona → tier mapping and
  the concrete ids behind "fast" and "deep"; how thinking depth is expressed; how an override at one
  scope is recorded and resolved against broader defaults. Planned in [`design/`](../../design/).

## Open questions

- None specific to the seam. (The initial persona→tier mapping and concrete ids are a design
  decision, not an unsettled intent question.)
