# Reflection & Evolution

> **Layer:** intent · concept — design-independent. Names no tool; realizations live in
> `../../design/`. **Status:** placeholder skeleton

## Purpose

How a workspace compounds — gets better the longer it is worked in — and how a workspace stays
healthy as Ward itself changes underneath it. Two axes of evolution: inward (reflection) and outward
(migration).

## Planned sections

- **Reflection is a family of goal-directed routines, not one routine** — cadence reflection and
  scope-boundary reflection; why scoping the reflection is the prime directive applied to
  introspection (focused/actionable vs. generalized).
- **What reflection produces** — proposals for skills, tooling, personas, and Ward itself.
- **Reflection must scale by chunking and rolling up** — map-reduce (chunk → distill → roll up) so a
  long-deferred reflection degrades into more chunks, not failure.
- **Why it stays cheap** — a per-(scope, goal) **cursor** records how far it has processed.
- **Asynchronous and non-blocking; proposes, does not edit.**
- **Versioning and migration** — the version stamp; **update vs. migrate**; **reconciliation** when
  a workspace has diverged (the opinionated-but-evolvable principle applied to everything Ward
  installs).
- **The relationship between reflection and migration** — inward (own experience) vs. outward (the
  evolving platform).

## Canonical home for

The reflection family and its goal-directed/map-reduce/cursor/async-proposal **constraints**; the
version stamp; update-vs-migrate; reconciliation. `delivery.md` and the subsystems link here for the
evolvable-artifact lifecycle.

## Open questions

- **Reflection-type taxonomy** — which goal-directed reflections ship by default; how a new type is
  added.
- **Cadence/boundary triggers** — time-, event-, or human-based, or a mix.
- **Cross-chunk learnings** — how insights that emerge only in aggregate are preserved
  (cross-cutting; see `../foundation/open-questions.md`).
- **Migration safety** — always idempotent and re-runnable? reversible via version history?
