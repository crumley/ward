# Artifacts & Provenance

> **Layer:** intent · concept — design-independent. Names no tool; realizations live in
> `../../design/`. **Status:** placeholder skeleton

## Purpose

Durable shared output as a first-class noun: how a scope's work persists outside any one agent's
memory, stays trustworthy, and is reused across scopes.

## Planned sections

- **Artifact** — any durable output meant to be shareable across sessions and agents (decisions,
  notes, datasets, scripts, analyses, status snapshots, handoffs — not just briefs).
- **Artifacts carry provenance (lineage)** — which persona, working directory, session, intent, and
  source artifacts; so a result can be traced to its root and an error caught there.
- **Discoverable across their scope, read-mostly across tasks** — visible upward/across; a task must
  not alter another task's artifact without specific guidance.
- **Briefs** — one artifact _type_: a handoff that conjures and orients another agent.
- **Capturing artifacts elsewhere is part of closing work** — a deliberate act of _re-authoring_ for
  the destination (stripped of local provenance/internal front matter), not a copy; crosses the
  privacy boundary only by translation.

## Canonical home for

The artifact noun, provenance/lineage, the brief type, and the cross-scope ownership rule. The
**privacy translation** mechanics on close are described in `05-delivery.md`; this owns the artifact
side and links.

## Open questions

- **Artifact taxonomy** — beyond _brief_, which types are first-class (decision, status snapshot,
  dataset, script, handoff)?
- **Provenance depth** — captured by default vs. on demand; how a cross-task reference is recorded
  so the borrower does not appear to own it.
- **Cross-task mutation** — what "specific guidance to alter another task's artifact" looks like
  concretely.
