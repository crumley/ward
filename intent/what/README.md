# What-Intent

The **what-intent**: Ward's purpose, the concepts it models, and the invariants it honors —
each with its *why*, at a level above any implementation.

**The rule for this layer:** a statement belongs here only if it would survive swapping every
tool (multiplexer, store, harness, model); nothing here names one. If a claim would change
when a tool is swapped, it is a *how* — see `../how/`. (Full rule: `../README.md`.)

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
