# Ward Intent

This directory captures the **design intent** of the Ward system: what Ward is for, why
it exists the way it does, the concepts it models, the constraints it must honor, the
boundaries along which its implementation may change, and the durable technology choices
behind those boundaries.

It is a **living document**. It evolves as the system evolves. It is not a historical
record and not an implementation plan — it is the current, best shared understanding of
what we are building and why.

## Intent is *what* + *why*, and *how* + *why*

Intent has two layers, and they are **symmetric** — each lives in its own subdirectory,
each is genuinely "intent," and **each explains its reasoning**:

- **`what/` — the what-intent.** The purpose, the concepts (the nouns), and the
  invariants — *and why they exist and why they are shaped this way.* This layer never
  names a tool.
- **`how/` — the how-intent.** The durable, cross-cutting choices about *how* the
  concepts are realized and *which kinds of technology* serve them — *and why those
  choices were made.* Higher-level than an implementation plan: it sets guardrails and
  explains them without sequencing or coding the work.

> **Why always.** Across both layers, a statement should carry its *why*. The what-intent
> says why a concept exists; the how-intent says why a choice was made. Reasoning is what
> makes this a guide for judgment rather than a list of rules to follow blindly.

The relationship to everything downstream:

```
what-intent   →   how-intent   →   implementation plan   →   tests + code
(what/ + why)     (how/ + why)      (sequenced work)         (the system)
```

`what/07-subsystem-seams.md` is the hinge between the layers: it names the **seams**
(swappable subsystems) as contracts in the *what*, and each seam points to a `how/`
document that records the durable choice and reasoning behind it.

> **The separation rule.** A statement belongs in `what/` only if it would survive
> swapping every tool we use. If it would change because we replaced the multiplexer, the
> store, the harness, or the model, it is a *how* — it belongs in `how/` (the durable
> choice) or in the implementation (the specifics). The *what* describes concepts; the
> *how* describes the kind of technology and modeling that serves them; the
> implementation picks exact libraries, formats, and flags.

## The intent ⇄ tests ⇄ code triangle

These artifacts describe the system at different levels, and they move together — **but
not necessarily atomically**. Any one may change first:

- We may write a test first and use it to derive intent and then code.
- We may discover a gap while coding, make the call in code, then reconcile intent and
  tests to match.
- We may revise intent first, then update tests, then code.

The discipline: **when any one changes in a way that conflicts with another, the conflict
must be resolved in a following step.** Divergence is not failure — it means we learned
something. The obligation is to bring the others back into agreement, and to record here
whatever touches intent.

## How to read this directory

- Start with **`what/`** — read `what/README.md`, then `00`–`08` in order, with
  `glossary.md` as a quick reference.
- Then read **`how/`** — `how/README.md` indexes the durable design choices (one behind each
  subsystem seam, plus the cross-cutting ones).
- `what/08-open-questions.md` tracks unresolved tensions across both layers and is
  expected to be non-empty.
- **`walkthrough.md`** threads one task through the whole model end to end — the fastest way to
  see how the pieces fit.
- **`blanks-register.md`** is the bridge to implementation: every deferred decision, tagged by
  when it must be settled. Read it last, before writing the implementation plan.

| Layer | Lives in | Captures |
|-------|----------|----------|
| What-intent | `what/` | Concepts, invariants, the domain model — and why |
| How-intent | `how/` | Durable design & technology choices — and why |
| Walkthrough | `walkthrough.md` | One end-to-end scenario, naming the records written |
| Blanks register | `blanks-register.md` | Deferred decisions, tagged settle-early vs. during-build |
