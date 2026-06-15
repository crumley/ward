# Ward Intent

The **design intent** of Ward: what it is for, why it exists, the concepts it models, the
constraints it honors, the seams along which it may change, and the durable technology
choices behind those seams.

This is a **living document** — the current best shared understanding, not a historical
record and not an implementation plan.

## Two layers: what + why, and how + why

Intent has two symmetric layers, each in its own subdirectory, each carrying its reasoning:

- **`what/`** — the purpose, the concepts (the nouns), and the invariants — *and why.* Never
  names a tool.
- **`how/`** — the durable, cross-cutting choices about *which kinds of technology* realize
  the concepts — *and why.* Above an implementation plan: it sets guardrails, not sequence or
  code.

```
what + why   →   how + why   →   implementation plan   →   tests + code
(what/)          (how/)           (../plan/)                (the system)
```

`what/07-subsystem-seams.md` is the hinge: it names each **seam** (swappable subsystem) as a
contract in the *what*, and each seam points to the `how/` doc recording the choice behind it.

> **The separation rule.** A statement belongs in `what/` only if it would survive swapping
> every tool — multiplexer, store, harness, model. If swapping one would change it, it is a
> *how* (the durable choice) or an implementation detail (exact libraries, paths, fields).

> **Why, always.** Every concept and every choice carries its reasoning. Reasoning is what
> makes this a guide for judgment, not a list of rules to follow blindly.

## The intent ⇄ tests ⇄ code triangle

These three describe the system at different levels and move together — **but not always
atomically.** Any one may change first: a test that derives intent, a call made in code, a
revised concept. The discipline: **when one diverges from another, reconcile it in a following
step.** Divergence is not failure — it means we learned something; the obligation is to bring
the others back into agreement and to record whatever touches intent.

## How to read this

- Start in **`what/`**: `README.md`, then `00`–`08`, with `glossary.md` for quick reference.
- Then **`how/`**: `README.md` indexes the durable choices — one behind each seam, plus the
  cross-cutting ones.
- **`walkthrough.md`** threads one task end to end — the fastest way to see the pieces fit.
- **`what/08-open-questions.md`** tracks unresolved tensions and is expected to be non-empty.
- **`blanks-register.md`** is the bridge to implementation — read it last, before planning.
