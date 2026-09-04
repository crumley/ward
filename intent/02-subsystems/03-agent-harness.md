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
- **The handle is recorded before the run exists, wherever the harness allows it.** Where a harness
  accepts an **externally-supplied** run id, Ward assigns the handle and starts the run under it, so
  the record always precedes the process; where it does not, the adapter **surfaces the id the run
  minted** and Ward records it as its **first act after start**. _Why:_ the losing order leaves a
  window in which a live agent exists that the record has never heard of — a crash inside it strands
  a run nothing can locate, resume, or reflect over, which is precisely the loss §16 exists to
  prevent. Assignment also costs the run no context, since nothing has to be read back out of it.
  Where the window is unavoidable it is accepted knowingly and kept as short as an adapter can make
  it, never widened for convenience.
- **Be selectable per scope** (default per workspace, overridable per scope), so different scopes
  can use different harnesses, and two can be mixed in one workspace. **The harness's invocation is
  configuration, not identity.** How a chosen harness is started on a given machine — the program
  and any leading words — is configured beside the model and the extra flags, on the same two axes
  ([`07-human-shell.md`](07-human-shell.md)), and defaults to the adapter's own; it never changes
  which adapter owns the handle. _Why:_ the same harness is one command on one machine and reached
  through a launcher on another, and a handle must be read by the same adapter whatever launcher
  started the run — folding the launcher into the harness choice would make one harness look like
  two.
- **Make the run's history locatable from the recorded handle** — for resume after a reboot and for
  reflection later — whatever its format. _Why:_ each harness stores history in its own
  format/location; the handle is the only reliable way to find that run again. **Locate
  distinguishes found from gone:** a harness may have discarded a run's history (retention is the
  harness's, not Ward's), and a handle that no longer resolves is reported as a **distinct outcome**
  — never an error lost in a retry — so Ward records the resolution failure on the session
  (`../01-concepts/02-sessions-and-lifecycle.md`, lifecycle events). _Why:_ reflection must know
  what it **cannot** read; a silently unresolvable handle masquerades as a history nobody happened
  to open. **Locate is answered per machine:** a harness keeps a run's history on the machine that
  produced it, so a handle found nowhere **here** is gone here even when another machine holds it.
  _Why it matters:_ the two causes of a gone answer call for different acts — a discarded history is
  permanent, a history on another computer is reached by going there — and the session's recorded
  **machine** (`../01-concepts/02-sessions-and-lifecycle.md`, the session-log minimum) is what lets
  the caller tell them apart.
- **Integrate behind a thin adapter** exposing a small fixed surface — _start / handle / resume /
  locate_ — with everything Ward-specific staying in Ward. _Why:_ a narrow adapter is what lets a
  new harness be added without touching the role model, the session model, or the store.
- **Optionally fork/branch a session.** Where the capability exists, Ward offers **exact-clone**
  forks; where it does not, it falls back to the harness-neutral **distilled-brief** fork, which
  must never depend on this. An exact-clone fork produces a **new session** — its own identity, its
  own handle pointing at the branched run.
- **Accept an externally-chosen model and thinking depth**
  ([`04-model-selection.md`](04-model-selection.md)) and pass them through; this seam does not
  decide which model runs, only honors the decision. **An unmade choice is passed through as
  unmade:** where no model or thinking depth was chosen at any level of that ladder, Ward passes
  none and the harness's own default applies — Ward never substitutes a default for a choice the
  human did not make. _Why:_ the unconfigured session is the ordinary case, and the alternative is
  Ward's opinion silently overriding the harness's, so the day a harness changes its default an
  unconfigured session would not follow it. Honoring somebody else's defaults is what keeps this
  seam harness-agnostic (§5); it also means "unchosen" must stay distinguishable from every value a
  default could take, rather than collapsing into one on the way through.
- **Optionally report resource usage.** Where the harness exposes what a run consumed (tokens,
  cost), surface it so Ward can record it on the session
  ([`../01-concepts/02-sessions-and-lifecycle.md`](../01-concepts/02-sessions-and-lifecycle.md));
  where it does not, the session simply records no usage — nothing may depend on its presence.
  _Why:_ recorded usage is the evidence the token economy (§12) and model-selection tuning
  ([`04-model-selection.md`](04-model-selection.md)) read; optional, like fork, because harnesses
  differ and the baseline must not.

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
  locate, with optional fork, honoring an externally-chosen model — and passing an **unmade** choice
  through as unmade, so the harness's own default stands. **Locate answers per machine**: found or
  gone **here**.
- The **ordering of handle and run**: assigned before start wherever the harness accepts a supplied
  run id, recorded as the first act after start where it does not.

## Left to implementation

- The exact adapter interface; the per-harness handle format and history location; how start/resume
  are invoked per harness and per machine; how the optional fork is detected and exercised; **how
  usage is read per harness** (and in what units); the default harness and the per-scope override
  mechanism; whether Ward defensively **snapshots or distills** a run's history before a harness can
  discard it, and on what cadence. Planned in [`design/`](../../design/).

## Open questions

- **Fork mode first** — distilled-brief (universal) vs. exact-clone (where supported), and how
  exact-clone interacts with a session's identity and handle (with
  [`../01-concepts/01-scopes-and-personas.md`](../01-concepts/01-scopes-and-personas.md)).
