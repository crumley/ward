# How-Intent: Model Selection

Durable choices behind the **model selection** seam (`../what/07-subsystem-seams.md`). The *what*
— that a session runs on a chosen model and thinking depth, fast where the job is bookkeeping and
deep where the job is hard — lives in `../what/03-scopes-and-personas.md` and the per-scope
configuration there. This doc records how that choice is structured and kept model-agnostic.

## Choice: model and thinking depth resolve through the scope hierarchy

A model (and a thinking depth) is chosen by **resolution through the scope hierarchy**: a default
at the workspace level, overridable at project, task, and room/session levels, with **narrower
overriding broader** (`../what/03-scopes-and-personas.md`, per-scope configuration).

**Why a hierarchy.** It matches how the work is shaped: a sensible workspace default covers most
sessions, while a specific room that needs depth, or a status persona that should stay cheap, can
override locally without re-deciding everywhere. One knob, applied at the narrowest scope that
cares.

## Choice: selection follows the persona's job — fast for breadth, deep for depth

The default intent is **driven by the persona's job**, not set per-session by hand:

- **Fast / shallow** where the work is **status and routing** — the **charge nurse** and the
  **house supervisor** (`../what/03-scopes-and-personas.md`). Their job is bookkeeping, so they
  should be cheap and quick.
- **Deep / high-thinking** where the work is **hard reasoning or hands-on depth** — a room doing
  the actual work, an attending weighing a project outcome.

**Why tie it to persona.** The persona already encodes *how* a scope attends to its work
(`../what/03-scopes-and-personas.md`); the right model tier falls out of that. Tying the default
to persona means a new session usually needs no explicit model choice at all.

## Choice: model identifiers are configuration, never concepts

Concrete model identifiers are **configuration that tracks the best available models over time**,
held in the workspace, never written into the concepts (`../what/01-principles.md` §5). What is
durable is the **override hierarchy** and the **fast-vs-deep intent**; *which* model is fast or
deep this month is a value, not a design commitment.

**Why.** Models change faster than anything else in the system. A concept that named a model would
be stale within months; keeping identifiers in configuration lets the workspace move to better
models without any change to intent.

## Guardrails — what this is, and what it is not

- **Is:** a per-scope override hierarchy whose defaults follow the persona's job, with concrete
  model ids living in workspace configuration.
- **Is not:** a mandate of any particular model or provider. The system is **model-agnostic**; no
  concept assumes a specific model (`../what/01-principles.md` §5).
- **Is not:** a fixed mapping of persona → model baked into Ward. The mapping is a sensible
  *default* the workspace can change and reflection can tune
  (`../what/06-reflection-and-evolution.md`).
- **Is not:** the harness. This seam decides *which* model; the harness (`harness.md`) merely
  honors the decision.

## For the implementation plan — where to fill in the blanks

Within the guardrails: the exact configuration shape for defaults and overrides; the initial
persona → tier mapping and the concrete model ids behind "fast" and "deep"; how thinking depth is
expressed; and how an override at one scope is recorded and resolved against broader defaults.
These are the focus areas; this doc fixes the constraints, not the answers.
