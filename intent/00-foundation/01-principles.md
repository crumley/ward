# Principles & Constraints

> **Layer:** intent · foundation (global). The cross-cutting invariants every slice honors. Names no
> tool. **Status:** placeholder skeleton

## Purpose

The invariants that apply everywhere and outrank local convenience. Each carries its _why_, because
the reasoning is what lets a reader apply the principle to a case it does not literally name. Slices
honor these; they do not restate them.

## Planned principles

Carry forward the numbered principles from the source, each with its _why_:

1. Context management is the prime directive.
2. Specialization is a feature, not an accident.
3. The workspace is self-sufficient.
4. Locality and privacy: the local↔remote boundary (no local context leaks outward — including
   persona names).
5. Harness- and model-agnostic by construction.
6. Determinism and idempotency.
7. **Intent/design separation** — concepts are defined independently of the mechanisms that realize
   them; the boundary is _invariance under design substitution_ (`../README.md`).
8. Two audiences, always (human default; agent self-identifies).
9. Scope and working directory are explicit and bounded.
10. Teaching and learning flow both ways. _(Canonical statement of the teaching loop lives in
    `../01-concepts/02-roles.md`; this records it as a principle and links.)_
11. Provenance is recorded.
12. Be economical with context and tokens (append-oriented, deterministic context).
13. The system compounds.
14. Ward and the workspace evolve independently.
15. The workspace is versionable and recoverable.
16. Prefer recorded state over live state.
17. No lost updates.
18. Outward or irreversible actions require explicit authority (local + reversible = autonomous;
    outward or irreversible = gated).

## Opinionated-but-evolvable

- **Opinionated-but-evolvable.** Anything Ward ships into a workspace — workflow policy, lifecycle
  hooks, reflection routines, personas, scaffolding — follows: _ship a sensible default → the
  workspace owns and evolves it → reconcile, not clobber, on upgrade._ It has one canonical home
  here; the slices that use it (`01-concepts/05-delivery.md`, `01-concepts/06-reflection.md`, the
  subsystems) link to it.

## Open questions

- See `open-questions.md` for the append-vs-rewrite tension (§12) and intent/design boundary drift.
