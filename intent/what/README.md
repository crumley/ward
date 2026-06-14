# What-Intent

This directory holds the **what-intent**: the purpose of Ward, the concepts it models,
and the invariants it honors — together with the reasoning for each. It is the *what* and
the *why*, at a level above any implementation.

## The rule for this layer

A statement belongs here only if it would **survive swapping every tool we use**. Nothing
in this layer names a multiplexer, a store, a harness, or a model. If a claim would change
because we replaced one of those, it is a *how* and belongs in `../how/`.

Every concept here should also carry its **why** — why it exists and why it is shaped this
way — so the reader can apply judgment, not just follow rules.

## Reading order

| File | Captures |
|------|----------|
| `00-vision.md` | Purpose, the prime directive, the metaphor, non-goals |
| `01-principles.md` | Cross-cutting invariants every part of the system honors |
| `02-domain-model.md` | The concepts, the hierarchy, artifacts, identity |
| `03-scopes-and-personas.md` | Roles, responsibilities, teaching/learning, forking |
| `04-sessions-and-lifecycle.md` | Open / running / close / resume / wake; recovery |
| `05-work-lifecycle.md` | Task lifecycle; never-merge-to-main; PRs; hooks; policy |
| `06-reflection-and-evolution.md` | The compounding loop; scoped reflection; migration |
| `07-subsystem-seams.md` | The pluggable boundaries, as contracts (hinge to `../how/`) |
| `08-open-questions.md` | Unresolved tensions to settle as we build |
| `glossary.md` | Vocabulary reference |
